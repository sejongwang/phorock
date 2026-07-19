"""정적 데모(docs/ · GitHub Pages) 빌더 — 실서버 응답 스냅샷 (CONTRACT §6).

서버(:8765)를 켜둔 채 실행한다 (표준 라이브러리만 사용):

    python3 mock/build_mock.py

산출물 docs/ — GitHub Pages(main /docs)로 그대로 서빙 가능:
  index.html            app/ 원본에 mock-data.js·mock-shim.js 두 줄만 주입
  app.js · *.css        app/ 원본 그대로 (한 바이트도 수정하지 않음)
  mock-data.js          bootstrap + 검색어×변이 전 조합 스냅샷 (threshold 0.55)
  mock-shim.js          fetch 인터셉트 (mock/mock-shim.js 복사)
  audio/*.wav           data/clips/ 16kHz 원본 — audioUrl 은 서브패스에서도 동작하게
                        상대경로("audio/<id>.wav")로 재작성
  .nojekyll             Jekyll 처리 비활성화

threshold 는 슬라이더 최소값(0.55)으로 한 번만 뜬다 — 서버는 threshold 로 히트 포함
여부만 가르므로 상위 값은 shim 의 effectivePhoneticScore 필터로 동치 재현된다.
"""
from __future__ import annotations

import json
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "http://127.0.0.1:8765"
ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SNAP_THRESHOLD = 0.55

# 검색창 placeholder 예시·핵심 데모 시나리오용 자유 검색어 — 실서버 응답을 그대로 스냅샷.
# (termSetId, text) — shim 은 정확 키 미스 시 termSet 무관 폴백도 하므로 대표 유형 하나면 된다.
EXTRA_QUERIES = [
    ("false-free", "free"),
    ("false-free", "phree"),        # 발음 변이 데모 (free 의 오철자)
    ("false-free", "muft"),         # 힌디 '무료' — 0 hits + G2P 변이 패널 데모
    ("forced-bundling", "compulsory"),
]


def norm_text(term: str) -> str:
    return " ".join(term.split()).lower()


def get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read())


def post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        json.dumps(payload).encode("utf-8"),
        {"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def rel_audio(hits: list[dict]) -> None:
    """'/audio/x.wav' → 'audio/x.wav' — Pages 서브패스에서도 <audio>·fetch 가 해석 가능."""
    for h in hits:
        url = h.get("audioUrl")
        if isinstance(url, str) and url.startswith("/audio/"):
            h["audioUrl"] = "audio/" + url[len("/audio/"):]


def main() -> None:
    boot = get("/api/bootstrap")
    queries = [
        (ts["id"], term)
        for ts in boot["termSets"]
        for term in (ts.get("searchTerms") or [])
    ] + EXTRA_QUERIES
    searches: dict[str, dict] = {}
    for ts_id, term in queries:
        for use_variants in (True, False):
            key = f"{ts_id}|{norm_text(term)}|{1 if use_variants else 0}"
            if key in searches:
                continue
            resp = post("/api/search", {
                "termSetId": ts_id,
                "text": term,
                "threshold": SNAP_THRESHOLD,
                "useVariants": use_variants,
            })
            rel_audio(resp["hits"])
            resp.pop("runId", None)  # runId 는 shim 이 매 검색마다 생성
            searches[key] = {"variants": resp["variants"], "hits": resp["hits"]}
            print(f"  {key}: hits={len(resp['hits'])} variants={len(resp['variants'])}")

    if DOCS.exists():
        shutil.rmtree(DOCS)
    (DOCS / "audio").mkdir(parents=True)

    clips = sorted({Path(h["audioUrl"]).name for s in searches.values() for h in s["hits"]})
    for name in clips:
        shutil.copy2(ROOT / "data" / "clips" / name, DOCS / "audio" / name)

    mock = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "snapshotThreshold": SNAP_THRESHOLD,
        "bootstrap": boot,
        "searches": searches,
    }
    (DOCS / "mock-data.js").write_text(
        "window.VX_MOCK = " + json.dumps(mock, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    shutil.copy2(ROOT / "mock" / "mock-shim.js", DOCS / "mock-shim.js")

    for f in ("app.js", "korea-audit.css", "astryx.css"):
        shutil.copy2(ROOT / "app" / f, DOCS / f)
    html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    needle = '<script src="app.js"></script>'
    assert needle in html, "app/index.html 에서 app.js 스크립트 태그를 찾지 못함"
    html = html.replace(
        needle,
        '<script src="mock-data.js"></script>\n'
        '<script src="mock-shim.js"></script>\n' + needle,
    )
    (DOCS / "index.html").write_text(html, encoding="utf-8")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")

    total = sum(p.stat().st_size for p in DOCS.rglob("*") if p.is_file())
    print(f"docs/ 완성 — clips {len(clips)}개, 검색 스냅샷 {len(searches)}개, 총 {total / 1024:.0f}KB")


if __name__ == "__main__":
    main()
