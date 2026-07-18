"""Build phone indexes for VoxLedger Hinglish audit clips.

Reads data/manifest.json and runs the ZIPA runtime over every clip:
  * 16 kHz clips (manifest "file")   -> data/index.json
  * 8 kHz clips  (manifest "file8k") -> data/index8k.json

Schema per CONTRACT.md §3. sha256 is the real hash of the wav bytes.
Run with the zipa environment:
  /Users/junehwi/zipa-mac/zipa-env/bin/python server/build_index.py
"""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zipa_runtime  # noqa: E402  (module-global session loads here, once)

VOX = Path("/Users/junehwi/indoro/voxledger-audit")
MANIFEST_PATH = VOX / "data" / "manifest.json"


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_index(manifest, file_key, out_path):
    clips = []
    for entry in manifest:
        rel = entry[file_key]
        wav = VOX / rel
        result = zipa_runtime.transcribe(str(wav))
        clips.append(
            {
                "id": entry["id"],
                "file": rel,
                "sha256": sha256_of(wav),
                "truth": entry["truth"],
                "entities": entry["entities"],
                "termSetId": entry["termSetId"],
                "isNegated": entry["isNegated"],
                "duration": round(result["seconds"], 2),
                "ipa": result["ipa"],
                "phones": result["phones"],
            }
        )
        print(f"  {entry['id']:8s} {result['seconds']:6.2f}s  rtf={result['rtf']:.3f}  "
              f"ipa={result['ipa'][:60]}", file=sys.stderr)
    index = {
        "modelVersion": zipa_runtime.MODEL_VERSION,
        "featureConfig": zipa_runtime.FEATURE_CONFIG,
        "clips": clips,
    }
    out_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {out_path} ({len(clips)} clips)", file=sys.stderr)


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    print("building 16 kHz index ...", file=sys.stderr)
    build_index(manifest, "file", VOX / "data" / "index.json")
    print("building 8 kHz index ...", file=sys.stderr)
    build_index(manifest, "file8k", VOX / "data" / "index8k.json")


if __name__ == "__main__":
    main()
