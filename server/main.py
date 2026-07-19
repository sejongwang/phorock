"""VoxLedger Hinglish Audit API — CONTRACT §6.

소유: api 에이전트 (이 파일만 수정).

FastAPI, port 8765, zipa-env python 으로 구동:
    cd /Users/junehwi/indoro/voxledger-audit
    /Users/junehwi/zipa-mac/zipa-env/bin/python -m uvicorn server.main:app --port 8765

엔드포인트:
- GET  /api/bootstrap   {caseId, termSets[+pronunciations 상위3], indexMeta}
- POST /api/search      {termSetId, text?, threshold=0.55, useVariants=true}
                        → {variants, hits[HIT], runId, totalCandidateEstimate,
                           negationGuardCount}
- POST /api/transcribe  multipart file → {ipa, phones, seconds, rtf}
- GET  /audio/{id}.wav  data/clips/ 정적 서빙
- GET  /                app/index.html (StaticFiles html=True)

HIT 키는 디자인 BASE_HITS 와 동일(§6 목록 그대로). groupLabel 규칙은 디자인
runSimulatedSearch 와 동일: isNegated→"03 · 부정문맥 / 오탐 방어",
context≥0.8 & complete≥0.85→"01 · 우선 검토", else "02 · 추가 문맥 필요".
"""
from __future__ import annotations

import hashlib
import itertools
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:  # uvicorn server.main:app (server 가 패키지로 임포트될 때)
    from . import matcher, variants as variants_mod, zipa_runtime  # type: ignore
except ImportError:  # 단독 실행 (server/ 가 sys.path 에 있을 때)
    import matcher  # type: ignore
    import variants as variants_mod  # type: ignore
    import zipa_runtime  # type: ignore

VOX = Path(__file__).resolve().parents[1]
DATA = VOX / "data"
APP_DIR = VOX / "app"
CLIPS_DIR = DATA / "clips"

CASE_ID = "REG-HI-2026-017"

# ---------------------------------------------------------------------------
# 데이터 로드 (기동 시 1회)
# ---------------------------------------------------------------------------

INDEX: dict = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
_CLIP_BY_ID = {c["id"]: c for c in INDEX.get("clips", [])}
TERM_SETS: list[dict] = json.loads(
    (DATA / "termsets.json").read_text(encoding="utf-8")
)
_TERM_SET_BY_ID = {ts["id"]: ts for ts in TERM_SETS}

_RUN_SEQ = itertools.count(1)

app = FastAPI(title="VoxLedger Hinglish Audit", version="0.1.0")


# ---------------------------------------------------------------------------
# 유틸 — 결정적(클립 id 기반) 연출 필드
# ---------------------------------------------------------------------------


def _h(clip_id: str, salt: str = "") -> int:
    """clipId 기반 결정적 해시 정수 (서버 재기동에도 값 불변)."""
    d = hashlib.md5((salt + clip_id).encode("utf-8")).digest()
    return int.from_bytes(d[:8], "big")


_HUBS = ["자이푸르 거점", "루디아나 거점", "파트나 거점", "인도르 거점"]
_CHANNELS = ["TM 아웃바운드", "현장 상담", "콜센터 인바운드"]
_SETS = ["A", "B", "C"]


def _fmt_mmss(seconds: float) -> str:
    s = max(0, int(round(seconds)))
    return f"{s // 60}:{s % 60:02d}"


def _call_date(clip_id: str) -> str:
    h = _h(clip_id, "date")
    day = 1 + h % 28
    hh = 9 + (h // 28) % 9
    mm = (h // 300) % 60
    return f"2026-06-{day:02d} {hh:02d}:{mm:02d}"


def _evidence_completeness(clip_id: str) -> float:
    # CONTRACT §6: 0.9 고정 + 노이즈 (결정적, 0.90~0.979)
    return round(0.9 + (_h(clip_id, "evid") % 80) / 1000.0, 3)


def _group_label(is_negated: bool, context: float, complete: float) -> str:
    # 디자인 runSimulatedSearch 와 동일한 규칙 (CONTRACT §6)
    if is_negated:
        return "03 · 부정문맥 / 오탐 방어"
    if context >= 0.8 and complete >= 0.85:
        return "01 · 우선 검토"
    return "02 · 추가 문맥 필요"


def _matched_text(truth: str, terms: list[str]) -> str:
    """truth 안에서 검색어 주변 단어 창(±2)을 잘라 matchedText 로 쓴다."""
    words = truth.split()
    lowered = [w.lower().strip(".,!?…।|") for w in words]
    for term in terms:
        for tw in term.lower().split():
            if tw in lowered:
                i = lowered.index(tw)
                lo, hi = max(0, i - 2), min(len(words), i + 3)
                snippet = " ".join(words[lo:hi])
                prefix = "…" if lo > 0 else ""
                suffix = "…" if hi < len(words) else ""
                return f"{prefix}{snippet}{suffix}"
    return truth


# ---------------------------------------------------------------------------
# API 모델
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    termSetId: str
    text: Optional[str] = None
    threshold: float = 0.55
    useVariants: bool = True


# ---------------------------------------------------------------------------
# GET /api/bootstrap
# ---------------------------------------------------------------------------


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    term_sets = []
    for ts in TERM_SETS:
        out = dict(ts)
        rep = (ts.get("searchTerms") or [None])[0]
        out["pronunciations"] = (
            variants_mod.expand_variants(rep)[:3] if rep else []
        )
        term_sets.append(out)
    return {
        "caseId": CASE_ID,
        "termSets": term_sets,
        "indexMeta": {
            "clips": len(INDEX.get("clips", [])),
            "modelVersion": INDEX.get("modelVersion"),
        },
    }


# ---------------------------------------------------------------------------
# POST /api/search
# ---------------------------------------------------------------------------


def _make_hit(term_set_id: str, best: dict, terms_matched: list[str]) -> dict:
    clip_id = best["clipId"]
    context = float(best.get("contextScore", 0.0))
    complete = _evidence_completeness(clip_id)
    is_negated = bool(best.get("isNegated", False))
    span_start = round(float(best["spanStart"]), 2)
    span_end = round(float(best["spanEnd"]), 2)
    variant = best["variant"]
    family = terms_matched[0].lower().replace(" ", "-") if terms_matched else term_set_id
    h = _h(clip_id)
    return {
        "id": f"hit-{clip_id}",
        "callId": f"REG-HI-{clip_id}",
        "issueCode": term_set_id,
        "insurer": _HUBS[h % len(_HUBS)],
        "channel": _CHANNELS[(h // 7) % len(_CHANNELS)],
        "sellerCode": f"AG-{1000 + h % 9000:04d}",
        "callDate": _call_date(clip_id),
        "matchAt": _fmt_mmss(span_start),
        "spanStart": span_start,
        "spanEnd": span_end,
        "duration": best.get("duration"),
        "matchedText": _matched_text(best.get("truth", ""), terms_matched),
        "transcript": best.get("truth", ""),
        "pronunciation": f"[{variant['ipa']}]",
        "phoneAlignment": best.get("matchedIpa", ""),
        "searchTerms": terms_matched,
        "pronunciationFamily": family,
        "phoneticScore": best["score"],
        "effectivePhoneticScore": best["effectiveScore"],
        "contextScore": context,
        "evidenceCompleteness": complete,
        "proximitySeconds": round(max(0.5, span_end - span_start), 1),
        "isNegated": is_negated,
        "hasMetadataConflict": False,
        "groupLabel": _group_label(is_negated, context, complete),
        "sourceSystem": (
            f"제출 세트 {_SETS[(h // 11) % len(_SETS)]} / "
            f"Recorder-{1 + (h // 13) % 5:02d}"
        ),
        "sourceHash": best.get("sha256"),
        "expectedHash": best.get("sha256"),
        "audioUrl": f"/audio/{clip_id}.wav",
        "reviewStatus": "미검토",
        # 클립 전구간 ZIPA phones [{s,t0,t1}] — 플레이어 음소 스트립용 (§6)
        "phoneTimeline": _CLIP_BY_ID.get(clip_id, {}).get("phones", []),
    }


@app.post("/api/search")
def search(req: SearchRequest) -> dict:
    term_set = _TERM_SET_BY_ID.get(req.termSetId)
    if term_set is None:
        raise HTTPException(status_code=404, detail=f"unknown termSetId: {req.termSetId}")

    text = (req.text or "").strip()
    terms = [text] if text else list(term_set.get("searchTerms") or [])
    if not terms:
        raise HTTPException(status_code=400, detail="termSet has no searchTerms")

    # 변이 패널용 목록 (use_variants=False 면 표준형 1개씩)
    all_variants: list[dict] = []
    for term in terms:
        all_variants.extend(matcher.term_variants(term, req.useVariants))

    # 클립별 최고 히트 병합 — 비교 키는 UI/API 정렬 키와 동일하게
    # (effectiveScore, score). raw score 우선으로 병합하면 저가중 변이가
    # 표시 순서에서 역전된다 (검증 발견 fix-0).
    best_by_clip: dict[str, dict] = {}
    terms_by_clip: dict[str, list[str]] = {}
    for term in terms:
        for hit in matcher.search_index(
            INDEX, term,
            use_variants=req.useVariants,
            threshold=req.threshold,
            term_set=term_set,
        ):
            cid = hit["clipId"]
            terms_by_clip.setdefault(cid, [])
            if term not in terms_by_clip[cid]:
                terms_by_clip[cid].append(term)
            prev = best_by_clip.get(cid)
            if prev is None or (hit["effectiveScore"], hit["score"]) > (
                prev["effectiveScore"], prev["score"]
            ):
                best_by_clip[cid] = hit

    hits = [
        _make_hit(req.termSetId, best, terms_by_clip[cid])
        for cid, best in best_by_clip.items()
    ]
    # 디자인과 동일한 정렬: groupLabel 오름차순 → effectivePhoneticScore 내림차순
    hits.sort(key=lambda x: (x["groupLabel"], -x["effectivePhoneticScore"]))

    negation_guard_count = sum(1 for x in hits if x["isNegated"])
    recall_load = max(0.0, 0.9 - req.threshold)
    total_candidate_estimate = (
        0 if not hits else round(len(hits) * 286 + recall_load * 4650)
    )
    run_id = (
        f"RUN-HI-{req.termSetId.upper().replace('-', '')[:4]}"
        f"-{round(req.threshold * 100)}-{next(_RUN_SEQ):03d}"
    )
    return {
        "variants": all_variants,
        "hits": hits,
        "runId": run_id,
        "totalCandidateEstimate": total_candidate_estimate,
        "negationGuardCount": negation_guard_count,
    }


# ---------------------------------------------------------------------------
# POST /api/transcribe — 라이브 데모 (업로드 → 임시 저장 → ZIPA 인식)
# ---------------------------------------------------------------------------


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "upload.wav").suffix or ".wav"
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="empty upload")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(payload)
            tmp_path = tmp.name
        try:
            result = zipa_runtime.transcribe(tmp_path)
        except Exception as exc:  # soundfile 이 못 읽는 포맷 등
            raise HTTPException(
                status_code=422, detail=f"audio decode/inference failed: {exc}"
            ) from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
    return {
        "ipa": result["ipa"],
        "phones": result["phones"],
        "seconds": result["seconds"],
        "rtf": result["rtf"],
    }


# ---------------------------------------------------------------------------
# 정적 서빙: /audio/{id}.wav → data/clips/, / → app/index.html
# ---------------------------------------------------------------------------

app.mount("/audio", StaticFiles(directory=str(CLIPS_DIR)), name="audio")


@app.get("/", include_in_schema=False)
def root() -> FileResponse:
    return FileResponse(str(APP_DIR / "index.html"))


app.mount("/", StaticFiles(directory=str(APP_DIR), html=True), name="app")
