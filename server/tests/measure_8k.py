"""8kHz 열화 곡선 측정 — CONTRACT §10 (8kHz 렌즈).

서버 불필요. data/index.json(16k) vs data/index8k.json(8k 전화망 시뮬)을 비교한다.

1) 클립별 PER: 16k phone 열을 참조로 한 8k phone 열의 편집거리/참조길이.
   - raw  : index phones 의 ZIPA 토큰 단위 그대로 (ː, ̪ 등 결합기호 분리)
   - merged: matcher.merge_clip_phones 로 g2p 단위 병합, ▁ 제외 (매칭에 실제 쓰이는 열)
2) recall 재측정: 각 positive 클립의 대표 검색어(manifest entities[0])로
   matcher.search_index 를 16k/8k 인덱스에 각각 돌려 해당 클립이 top-3 에
   드는 비율을 use_variants=True/False 로 비교한다.

실행: /Users/junehwi/zipa-mac/zipa-env/bin/python server/tests/measure_8k.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

VOX = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(VOX / "server"))

import matcher  # noqa: E402


def levenshtein(a: list[str], b: list[str]) -> int:
    """표준 편집거리 (치환/삽입/삭제 = 1)."""
    n, m = len(a), len(b)
    if n == 0:
        return m
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        ai = a[i - 1]
        for j in range(1, m + 1):
            cur[j] = min(
                prev[j - 1] + (0 if ai == b[j - 1] else 1),
                prev[j] + 1,
                cur[j - 1] + 1,
            )
        prev = cur
    return prev[m]


def raw_phones(clip: dict) -> list[str]:
    """index phones 열의 ZIPA 토큰 단위 (▁ 제외)."""
    return [
        p["s"] for p in clip.get("phones", [])
        if p.get("s") and p["s"] != matcher.WORD_BOUNDARY
    ]


def merged_phones(clip: dict) -> list[str]:
    """matcher 가 정렬에 쓰는 g2p 단위 열 (▁ 제외)."""
    return [u["s"] for u in matcher.clip_alignment_units(clip)]


def per_table(idx16: dict, idx8: dict) -> list[dict]:
    by8 = {c["id"]: c for c in idx8["clips"]}
    rows = []
    for c16 in idx16["clips"]:
        c8 = by8.get(c16["id"])
        if c8 is None:
            continue
        r16, r8 = raw_phones(c16), raw_phones(c8)
        m16, m8 = merged_phones(c16), merged_phones(c8)
        d_raw = levenshtein(r16, r8)
        d_mrg = levenshtein(m16, m8)
        rows.append({
            "id": c16["id"],
            "refRaw": len(r16), "distRaw": d_raw,
            "perRaw": round(d_raw / len(r16), 4) if r16 else 0.0,
            "refMerged": len(m16), "distMerged": d_mrg,
            "perMerged": round(d_mrg / len(m16), 4) if m16 else 0.0,
        })
    return rows


def recall(index: dict, cases: list[tuple[str, str]], use_variants: bool,
           top_k: int = 3) -> tuple[int, int, list[str]]:
    """cases=[(clipId, term)] — clipId 가 top-k 히트에 드는 건수. 반환 (hit, total, missed)."""
    hit, missed = 0, []
    for clip_id, term in cases:
        hits = matcher.search_index(index, term, use_variants=use_variants)
        top = [h["clipId"] for h in hits[:top_k]]
        if clip_id in top:
            hit += 1
        else:
            missed.append(f"{clip_id}({term})")
    return hit, len(cases), missed


def main() -> dict:
    idx16 = json.loads((VOX / "data" / "index.json").read_text(encoding="utf-8"))
    idx8 = json.loads((VOX / "data" / "index8k.json").read_text(encoding="utf-8"))
    manifest = json.loads((VOX / "data" / "manifest.json").read_text(encoding="utf-8"))

    rows = per_table(idx16, idx8)
    tot_ref_raw = sum(r["refRaw"] for r in rows)
    tot_dist_raw = sum(r["distRaw"] for r in rows)
    tot_ref_mrg = sum(r["refMerged"] for r in rows)
    tot_dist_mrg = sum(r["distMerged"] for r in rows)

    print("== 클립별 PER (참조=16k index, 가설=8k index) ==")
    print(f"{'clip':8s} {'ref':>4s} {'dist':>4s} {'PER(raw)':>9s}   "
          f"{'ref':>4s} {'dist':>4s} {'PER(merged)':>11s}")
    for r in rows:
        print(f"{r['id']:8s} {r['refRaw']:4d} {r['distRaw']:4d} {r['perRaw']:9.4f}   "
              f"{r['refMerged']:4d} {r['distMerged']:4d} {r['perMerged']:11.4f}")
    micro_raw = tot_dist_raw / tot_ref_raw if tot_ref_raw else 0.0
    micro_mrg = tot_dist_mrg / tot_ref_mrg if tot_ref_mrg else 0.0
    print(f"{'micro':8s} {tot_ref_raw:4d} {tot_dist_raw:4d} {micro_raw:9.4f}   "
          f"{tot_ref_mrg:4d} {tot_dist_mrg:4d} {micro_mrg:11.4f}")

    # positive 클립(termSetId 있음) — 대표 검색어 = entities[0]
    cases = [(c["id"], c["entities"][0]) for c in manifest
             if c.get("termSetId") and c.get("entities")]

    print("\n== recall@3 (대표 검색어 → 해당 클립이 top-3) ==")
    results = {}
    for label, idx in (("16k", idx16), ("8k", idx8)):
        for uv in (True, False):
            h, t, missed = recall(idx, cases, use_variants=uv)
            key = f"{label}/variants={'on' if uv else 'off'}"
            results[key] = {"hit": h, "total": t, "recall": round(h / t, 4),
                            "missed": missed}
            miss_s = (" missed: " + ", ".join(missed)) if missed else ""
            print(f"{key:22s} {h}/{t} = {h / t:.4f}{miss_s}")

    return {
        "perRows": rows,
        "microPerRaw": round(micro_raw, 4),
        "microPerMerged": round(micro_mrg, 4),
        "recall": results,
        "cases": [f"{c}:{t}" for c, t in cases],
    }


if __name__ == "__main__":
    summary = main()
    out = VOX / "server" / "tests" / "measure_8k_result.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    print(f"\n결과 JSON: {out}")
