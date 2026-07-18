"""ZIPA int8 ONNX runtime for VoxLedger Hinglish audit (Apple Silicon).

Derived from the verified reference /Users/junehwi/zipa-mac/mac_infer_zipa.py.
Contract (CONTRACT.md §2) — facts proven on this machine, do not change:

  * CoreMLExecutionProvider is mandatory. The CPU EP mis-executes the int8
    MatMulInteger graph on arm64 and decodes everything to blank.
    providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"], fixed order.
  * Features come from Lhotse's Kaldi-compatible Fbank only:
    Fbank(FbankConfig(num_filters=80, dither=0.0, snip_edges=False)).
    torchaudio.compliance.kaldi.fbank yields all-blank output (different mels).
  * Audio is loaded with soundfile (torchaudio.load needs TorchCodec).
    Multi-channel -> first channel. sr != 16000 -> torchaudio.functional.resample.
    Clips shorter than 16000 samples (1 s) are zero-padded (CoreML crashes on
    tiny inputs).
  * Output log_probs (1, T', 127), T' = (T - 7) // 2, 20 ms per frame.

Timestamp convention (§2): in the frame-wise argmax id sequence, one contiguous
run of the same non-blank id = one phone. t0 = first_frame * 0.02,
t1 = (last_frame + 1) * 0.02 seconds. Blank runs are dropped. "▁" (id 3) is
kept in the phone list as the word boundary marker.

The ONNX session is created once at module import time (module-global).
"""

import time

import numpy as np
import onnxruntime as ort
import torch
import torchaudio  # functional.resample only; torchaudio.load is avoided (needs TorchCodec)
import soundfile as sf
from lhotse.features.kaldi.extractors import Fbank, FbankConfig

MODEL_PATH = "/Users/junehwi/zipa-mac/zipa_model/model.int8.onnx"
TOKENS_PATH = "/Users/junehwi/zipa-mac/zipa_model/tokens.txt"
MODEL_VERSION = "zipa-large-crctc-ns-800k/int8+CoreML"
FEATURE_CONFIG = "lhotse-fbank80-dither0-snipedges-false"

BLANK_ID = 0
WORD_BOUNDARY = "▁"  # token id 3
FRAME_SECONDS = 0.02  # 20 ms per output frame
SAMPLE_RATE = 16000


def _load_tokens(path):
    id2sym = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split()
            if parts:
                id2sym[int(parts[1])] = parts[0]
    return id2sym


def _make_session():
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.log_severity_level = 3  # silence fp16 constant-fold warnings
    available = ort.get_available_providers()
    providers = [
        p
        for p in ("CoreMLExecutionProvider", "CPUExecutionProvider")
        if p in available
    ]
    return ort.InferenceSession(MODEL_PATH, so, providers=providers)


# Module-global, loaded exactly once.
ID2SYM = _load_tokens(TOKENS_PATH)
_SESSION = _make_session()
_EXTRACTOR = Fbank(FbankConfig(num_filters=80, dither=0.0, snip_edges=False))


def load_audio(path, min_samples=SAMPLE_RATE):
    """Load audio as float32 mono 16 kHz, zero-padded to >= 1 second."""
    audio, sr = sf.read(path)  # float in [-1, 1]
    if audio.ndim > 1:
        audio = audio[:, 0]  # first channel (matches upstream inference.py)
    if sr != SAMPLE_RATE:
        wav = torch.from_numpy(np.ascontiguousarray(audio)).float().unsqueeze(0)
        wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE)
        audio = wav.squeeze(0).numpy()
    audio = np.asarray(audio, dtype=np.float32)
    if audio.shape[0] < min_samples:  # CoreML EP crashes on tiny inputs
        audio = np.pad(audio, (0, min_samples - audio.shape[0]))
    return audio


def extract_fbank(audio):
    at = torch.from_numpy(audio).float().unsqueeze(0)  # (1, N)
    feats = _EXTRACTOR.extract_batch([at], sampling_rate=SAMPLE_RATE)
    return feats[0].unsqueeze(0)  # (1, T, 80)


def _decode_phones(log_probs):
    """Frame-wise argmax -> phone runs with 20 ms frame timestamps.

    One contiguous run of the same non-blank id = one phone.
    t0 = first_frame * 0.02, t1 = (last_frame + 1) * 0.02. Blank runs dropped.
    "▁" (word boundary) is preserved as a phone entry.
    """
    ids = log_probs.argmax(axis=-1)
    phones = []
    run_id = None
    run_start = 0
    for frame, i in enumerate(ids):
        i = int(i)
        if i != run_id:
            if run_id is not None and run_id != BLANK_ID:
                phones.append(
                    {
                        "s": ID2SYM.get(run_id, ""),
                        "t0": round(run_start * FRAME_SECONDS, 2),
                        "t1": round(frame * FRAME_SECONDS, 2),
                    }
                )
            run_id = i
            run_start = frame
    if run_id is not None and run_id != BLANK_ID:
        phones.append(
            {
                "s": ID2SYM.get(run_id, ""),
                "t0": round(run_start * FRAME_SECONDS, 2),
                "t1": round(len(ids) * FRAME_SECONDS, 2),
            }
        )
    return phones


def phones_to_ipa(phones):
    """Concatenate phone symbols; render the word boundary as a space."""
    return "".join(p["s"] for p in phones).replace(WORD_BOUNDARY, " ").strip()


def transcribe_array(audio):
    """Run inference on a float32 mono 16 kHz array. Returns dict with
    ipa, phones [{s,t0,t1}], seconds (audio length), rtf (inference realtime factor)."""
    seconds = audio.shape[0] / SAMPLE_RATE
    started = time.perf_counter()
    feat = extract_fbank(audio)
    x = feat.numpy().astype(np.float32)  # (1, T, 80)
    x_lens = np.array([feat.shape[1]], dtype=np.int64)
    log_probs, log_probs_len = _SESSION.run(None, {"x": x, "x_lens": x_lens})
    elapsed = time.perf_counter() - started
    phones = _decode_phones(log_probs[0][: int(log_probs_len[0])])
    return {
        "ipa": phones_to_ipa(phones),
        "phones": phones,
        "seconds": round(seconds, 3),
        "rtf": round(elapsed / seconds, 3) if seconds > 0 else 0.0,
    }


def transcribe(path):
    """Transcribe an audio file to IPA phones with timestamps."""
    return transcribe_array(load_audio(path))


if __name__ == "__main__":
    import sys

    for p in sys.argv[1:]:
        r = transcribe(p)
        print(f"{p}\n  IPA: {r['ipa']}\n  phones: {len(r['phones'])}  "
              f"seconds: {r['seconds']}  rtf: {r['rtf']}")
