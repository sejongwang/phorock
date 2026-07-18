"""VoxLedger confusion 가중 발음 매처 — CONTRACT §5.

소유: matcher 에이전트 (이 파일과 tests/test_matcher.py 만 수정).

핵심:
- align(): confusion 가중 로컬 정렬(Smith-Waterman 유사, 세미글로벌).
  질의 변이 phone 열은 전부 소비하고, 클립 phone 열은 시작·끝이 자유롭다.
  치환비용 = §4 규칙쌍이면 (1-weight), 아니면 1. 삽입/삭제 0.7.
  단 variants.DELETION_WEIGHTS 반영: 질의 ɦ 삭제 0.2(h-drop),
  클립 ə/ɦ 삽입(건너뜀) 0.1/0.2 — 질의 ə 삭제는 0.7 유지(이중 할인 방지).
  ▁(단어 경계)는 질의·클립 양쪽에서 무시한다.
- score = 1 − best_cost / query_len, 스팬 = 매칭 구간 phones 의 t0~t1.
- 질의 커버리지 게이트(coverage_ok): 세미글로벌 정렬은 질의 phone 삭제(0.7)가
  질의 길이에 비해 싸서, 다중 단어 질의의 한 단어를 통째로 버리고도 threshold 를
  넘을 수 있다(검증 fix-1: 'bilkul free' 의 free 3-phone 전량 삭제 → cb-neg 0.7667).
  최적 정렬이 아래를 위반하면 그 변이는 "매칭이 아니다"로 기각한다:
  (1) 가장자리 앵커 — 질의의 첫/끝 단어(길이 ≥ MIN_ANCHOR_WORD_LEN)는 최소
      1 phone 이 치환(매칭)돼야 한다. 가장자리 단어 전량 삭제 = 질의를 몰래
      줄여 다른 질의를 검색한 것과 같다. 내부 단어 삭제는 양쪽이 매칭으로
      고정되므로 허용한다(부정문 클립 ff-neg 의 'premium ~ lagega' 회수에 필요).
  (2) 삭제 비중 상한 — 질의 삭제비용 합 / 질의 길이 ≤ MAX_DELETION_SHARE.
      실측 분리: 진성 히트 최대 0.259, 교차 termset 누출 최소 0.30.
- search_index(index, term, use_variants=True, threshold=0.55) -> hits.
  use_variants=False 는 표준 발음 1개만 쓰는 베이스라인 모드 (recall A/B).
- context_score()/negation_flag(): manifest truth 텍스트와 termsets 의
  contextTerms(등장 비율)/negativeTerms(등장 시 isNegated=true) 규칙.

주의: index.json 의 phones 는 ZIPA 토큰(코드포인트) 단위라 "a","ː" 가 따로
기록된다. merge_clip_phones() 가 g2p.tokenize_ipa 와 같은 단위(aː, t̪ʰ, tʃ …)로
병합하고 타임스탬프(t0 는 첫 토큰, t1 은 마지막 토큰)를 보존한다.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:  # server 패키지로 임포트될 때 (uvicorn server.main:app)
    from . import g2p, variants  # type: ignore
except ImportError:  # 스크립트/테스트 단독 실행 (server/ 가 sys.path 에 있음)
    import g2p  # type: ignore
    import variants  # type: ignore

WORD_BOUNDARY = g2p.WORD_BOUNDARY

INDEL_COST = 0.7          # CONTRACT §5: 삽입/삭제 0.7
DEFAULT_THRESHOLD = 0.55  # CONTRACT §5: search_index 기본 threshold


# ---------------------------------------------------------------------------
# 비용 함수
# ---------------------------------------------------------------------------


def _sub_cost(a: str, b: str) -> float:
    """치환비용: 동일 0, §4 규칙쌍 (1-weight), 그 외 1."""
    w = variants.confusable_weight(a, b)
    return 1.0 if w is None else 1.0 - w


def _del_cost(phone: str) -> float:
    """질의 phone 삭제 비용: 기본 0.7, ɦ 는 h-drop weight(0.2) 반영.

    ə 는 여기서 할인하지 않는다 — 어말 schwa 탈락·삽입은 이미 변이 규칙
    (final-schwa)이 모델링하므로 정렬에서도 할인하면 이중 할인이 되어
    schwa 를 덧붙인 변이가 모든 클립의 score 를 부풀린다(중립 클립 오탐).
    """
    if phone == "ə":
        return INDEL_COST
    w = variants.DELETION_WEIGHTS.get(phone)
    if w is None:
        return INDEL_COST
    return min(INDEL_COST, 1.0 - w)


def _ins_cost(phone: str) -> float:
    """클립 phone 삽입(건너뜀) 비용: 기본 0.7, ɦ/ə 는 규칙 weight 반영.

    클립 쪽 여분 ə(svarabhakti)·ɦ 는 ZIPA 가 실제로 자주 끼워 넣는
    phone 이라 DELETION_WEIGHTS(ə 0.1, ɦ 0.2)로 싸게 건너뛴다.
    질의 길이(분모)가 변하지 않으므로 score 부풀림이 없다.
    """
    w = variants.DELETION_WEIGHTS.get(phone)
    if w is None:
        return INDEL_COST
    return min(INDEL_COST, 1.0 - w)


# ---------------------------------------------------------------------------
# 클립 phone 병합 (토큰 단위 → g2p 단위)
# ---------------------------------------------------------------------------


def merge_clip_phones(phones: list[dict]) -> list[dict]:
    """index.json phones [{s,t0,t1}] → g2p.tokenize_ipa 와 같은 단위로 병합.

    결합 기호(ː ̪ ̃ ʰ …)는 직전 단위에 붙고 t1 이 연장된다. t+ʃ, d+ʒ 는 한
    단위로 묶인다. ▁ 는 단위로 보존한다(정렬 시 호출측이 제외).
    """
    units: list[dict] = []
    for p in phones:
        s = p.get("s", "")
        if not s:
            continue
        if s == WORD_BOUNDARY:
            units.append({"s": s, "t0": p["t0"], "t1": p["t1"]})
            continue
        if units and units[-1]["s"] != WORD_BOUNDARY:
            merged = g2p.tokenize_ipa(units[-1]["s"] + s)
            if len(merged) == 1:
                units[-1]["s"] = merged[0]
                units[-1]["t1"] = p["t1"]
                continue
        units.append({"s": s, "t0": p["t0"], "t1": p["t1"]})
    return units


def clip_alignment_units(clip: dict) -> list[dict]:
    """클립 레코드 → 정렬용 단위 목록 (▁ 제외)."""
    return [
        u for u in merge_clip_phones(clip.get("phones", []))
        if u["s"] != WORD_BOUNDARY
    ]


# ---------------------------------------------------------------------------
# confusion 가중 로컬 정렬 (질의 전체 × 클립 부분 구간)
# ---------------------------------------------------------------------------


def align_ops(
    query: list[str], clip: list[str]
) -> tuple[float, int, int, list[tuple[str, int | None, int | None]]]:
    """align() 과 동일한 비용·동률 규칙의 정렬 + 연산 목록(traceback).

    반환 (best_cost, start, end, ops). ops 는 최적 경로의 연산을 질의 순서로
    나열한 [(op, qi, cj)]:
      "sub" — query[qi] 를 clip[cj] 에 치환/일치
      "del" — query[qi] 삭제 (클립에 대응 없음)
      "ins" — clip[cj] 삽입(스팬 내부 건너뜀)
    스팬 밖(무료로 건너뛴) 클립 phone 은 ops 에 나타나지 않는다.
    동률 우선순위는 align() 과 동일(sub > del > ins)이라 비용·스팬이 일치한다.
    """
    n, m = len(query), len(clip)
    if n == 0:
        return 0.0, 0, 0, []
    # D[0][j] = 0 (클립 어느 위치에서든 무료로 시작), start[j] = j
    prev = [0.0] * (m + 1)
    pstart = list(range(m + 1))
    op_rows: list[list[str]] = []
    for qi in range(n):
        q = query[qi]
        dcost = _del_cost(q)
        cur = [prev[0] + dcost] + [0.0] * m
        cstart = [pstart[0]] + [0] * m
        ops_row = ["d"] + [""] * m
        for j in range(1, m + 1):
            c = clip[j - 1]
            best = prev[j - 1] + _sub_cost(q, c)   # 치환/일치
            bstart, bop = pstart[j - 1], "s"
            dele = prev[j] + dcost                  # 질의 phone 삭제
            if dele < best:
                best, bstart, bop = dele, pstart[j], "d"
            ins = cur[j - 1] + _ins_cost(c)         # 클립 phone 삽입(건너뜀)
            if ins < best:
                best, bstart, bop = ins, cstart[j - 1], "i"
            cur[j], cstart[j], ops_row[j] = best, bstart, bop
        prev, pstart = cur, cstart
        op_rows.append(ops_row)
    best_j = 0
    for j in range(1, m + 1):
        if prev[j] < prev[best_j]:
            best_j = j
    ops: list[tuple[str, int | None, int | None]] = []
    qi, j = n, best_j
    while qi > 0:
        op = op_rows[qi - 1][j]
        if op == "s":
            ops.append(("sub", qi - 1, j - 1))
            qi, j = qi - 1, j - 1
        elif op == "d":
            ops.append(("del", qi - 1, None))
            qi -= 1
        else:  # "i"
            ops.append(("ins", None, j - 1))
            j -= 1
    ops.reverse()
    return prev[best_j], pstart[best_j], best_j, ops


def align(query: list[str], clip: list[str]) -> tuple[float, int, int]:
    """질의 phone 열을 클립 phone 열의 최적 부분 구간에 정렬한다.

    반환 (best_cost, start, end): clip[start:end] 가 매칭 스팬 (end 미포함).
    클립의 시작·끝은 비용 없이 건너뛴다(로컬). 질의는 전부 소비한다.
    """
    cost, s0, s1, _ops = align_ops(query, clip)
    return cost, s0, s1


def _query_units(ipa: str) -> list[str]:
    """변이 ipa → 정렬용 phone 열 (▁ 무시, CONTRACT §5)."""
    return [u for u in g2p.tokenize_ipa(ipa) if u != WORD_BOUNDARY]


def query_word_map(ipa: str) -> tuple[list[str], list[int], list[int]]:
    """변이 ipa → (units, word_of, word_lens).

    units 는 _query_units() 와 동일한 phone 열(▁ 제외), word_of[i] 는
    units[i] 가 속한 단어 번호, word_lens 는 단어별 phone 수.
    coverage_ok() 의 단어 단위 판정에 쓴다.
    """
    units: list[str] = []
    word_of: list[int] = []
    wi = 0
    for u in g2p.tokenize_ipa(ipa):
        if u == WORD_BOUNDARY:
            wi += 1
            continue
        units.append(u)
        word_of.append(wi)
    if not units:
        return [], [], []
    word_lens = [0] * (word_of[-1] + 1)
    for w in word_of:
        word_lens[w] += 1
    return units, word_of, word_lens


# ---------------------------------------------------------------------------
# fix-1: 질의 커버리지 게이트 (교차 termset 누출 차단)
# ---------------------------------------------------------------------------

MIN_ANCHOR_WORD_LEN = 3   # 가장자리 앵커 검사 대상 단어의 최소 phone 수
MAX_DELETION_SHARE = 0.28  # 질의 삭제비용 합 / 질의 길이 상한 (실측 0.259 vs 0.30)


def coverage_ok(
    query: list[str],
    word_of: list[int],
    word_lens: list[int],
    ops: list[tuple[str, int | None, int | None]],
) -> bool:
    """최적 정렬(ops)이 질의를 실제로 '찾은' 것인지 판정한다 (fix-1).

    세미글로벌 정렬은 질의 phone 삭제(0.7)가 질의 길이 대비 싸서, 질의
    일부를 통째로 버린 정렬도 threshold 를 넘을 수 있다. 아래 위반 시 False:
    (1) 가장자리 앵커 — 첫/끝 단어(phone 수 ≥ MIN_ANCHOR_WORD_LEN)에
        치환(sub)이 하나도 없으면 질의를 몰래 줄인 것. 내부 단어 삭제는
        양옆이 매칭으로 고정되므로 허용(ff-neg 'premium ~ lagega' 회수).
        짧은 기능어(hai 등 1~2 phone)는 ZIPA 가 실제로 흘리므로 면제.
    (2) 삭제 비중 — 질의 삭제비용 합 / 질의 길이 > MAX_DELETION_SHARE 면
        질의 태반을 버린 정렬이라 매칭이 아니다.
    """
    if not query or not word_lens:
        return False
    sub_by_word = [0] * len(word_lens)
    del_cost = 0.0
    for op, qi, _cj in ops:
        if op == "sub":
            sub_by_word[word_of[qi]] += 1
        elif op == "del":
            del_cost += _del_cost(query[qi])
    for wi in {0, len(word_lens) - 1}:
        if word_lens[wi] >= MIN_ANCHOR_WORD_LEN and sub_by_word[wi] == 0:
            return False
    if del_cost / len(query) > MAX_DELETION_SHARE + 1e-9:
        return False
    return True


# ---------------------------------------------------------------------------
# 변이 목록 / context·negation 스코어
# ---------------------------------------------------------------------------


def term_variants(term: str, use_variants: bool = True) -> list[dict]:
    """검색어의 발음 변이 목록. use_variants=False 면 표준형 1개만."""
    vs = variants.expand_variants(term)
    if not vs:
        return []
    if not use_variants:
        standards = [v for v in vs if v["kind"] == "standard"]
        return standards[:1] if standards else vs[:1]
    return vs


def _norm_text(s: str) -> str:
    return " ".join(s.lower().split())


def context_score(text: str, context_terms: list[str] | None) -> float:
    """truth 텍스트 내 contextTerms 등장 비율 (단순 부분 문자열, CONTRACT §5)."""
    if not context_terms:
        return 0.0
    t = _norm_text(text)
    found = sum(1 for term in context_terms if _norm_text(term) in t)
    return round(found / len(context_terms), 4)


def negation_flag(text: str, negative_terms: list[str] | None) -> bool:
    """negativeTerms 가 truth 에 등장하면 True (isNegated)."""
    t = _norm_text(text)
    return any(_norm_text(term) in t for term in (negative_terms or []))


# ---------------------------------------------------------------------------
# search_index
# ---------------------------------------------------------------------------


def load_index(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def search_index(
    index: dict | str | Path,
    term: str,
    use_variants: bool = True,
    threshold: float = DEFAULT_THRESHOLD,
    term_set: dict | None = None,
) -> list[dict]:
    """index(경로 또는 로드된 dict)에서 term 을 발음 변이로 검색한다.

    클립마다 모든 변이를 정렬해 최고 effectiveScore(=score×weight) 변이
    1개를 채택하고, effectiveScore >= threshold 인 클립만 히트로 반환한다.
    채택·컷오프·표시(UI/API 정렬)가 전부 effectiveScore 한 척도로 일치해야
    저가중 변이(raw 높음·eff 낮음)가 표준형 매치를 밀어내거나, 컷오프만
    넘긴 저신뢰 교차 매치가 표시 순서를 오염시키는 역전이 없다(fix-0).
    eff <= score 이므로 use_variants=False(weight=1.0) 베이스라인의 히트
    집합·점수는 종전과 동일하다. 반환은 score 내림차순.

    fix-1: 변이별 최적 정렬이 coverage_ok() 를 통과하지 못하면(가장자리
    단어 전량 삭제 또는 삭제 비중 초과) 그 변이는 매칭이 아니므로 제외한다.
    다중 단어 질의('bilkul free')의 한 단어를 통째로 버린 채 다른 termset
    클립(cb-neg)에 얹히던 교차 누출을 근본 차단한다.

    HIT: {clipId, score, effectiveScore(=score×변이 weight), cost, queryLen,
          spanStart, spanEnd, matchedIpa, variant{surface,ipa,kind,rule,weight},
          truth, termSetId, duration, file, sha256
          [+ term_set 지정 시 contextScore, isNegated]}
    """
    if isinstance(index, (str, Path)):
        index = load_index(index)
    vs = term_variants(term, use_variants)
    if not vs:
        return []
    prepared = []
    for v in vs:
        q, word_of, word_lens = query_word_map(v["ipa"])
        if q:
            prepared.append((v, q, word_of, word_lens))

    hits: list[dict] = []
    for clip in index.get("clips", []):
        units = clip_alignment_units(clip)
        syms = [u["s"] for u in units]
        # 선택 키 = (effectiveScore, score, weight): API/UI 정렬이
        # effectiveScore 기준이므로 채택·컷오프도 같은 척도여야 역전이 없다.
        best: tuple[float, float, float, dict, float, int, int, int] | None = None
        for v, q, word_of, word_lens in prepared:
            cost, s0, s1, ops = align_ops(q, syms)
            if s1 <= s0:  # 빈 스팬 (전부 삭제) 은 매칭이 아니다
                continue
            if not coverage_ok(q, word_of, word_lens, ops):
                continue  # fix-1: 질의를 실제로 찾지 못한 정렬은 매칭이 아니다
            score = 1.0 - cost / len(q)
            key = (score * v["weight"], score, v["weight"])
            if best is None or key > best[:3]:
                best = (*key, v, cost, s0, s1, len(q))
        if best is None or best[0] < threshold:
            continue
        _, score, _, v, cost, s0, s1, qlen = best
        span = units[s0:s1]
        hit: dict[str, Any] = {
            "clipId": clip["id"],
            "score": round(score, 4),
            "effectiveScore": round(score * v["weight"], 4),
            "cost": round(cost, 4),
            "queryLen": qlen,
            "spanStart": span[0]["t0"],
            "spanEnd": span[-1]["t1"],
            "matchedIpa": "".join(u["s"] for u in span),
            "variant": dict(v),
            "truth": clip.get("truth", ""),
            "termSetId": clip.get("termSetId"),
            "duration": clip.get("duration"),
            "file": clip.get("file"),
            "sha256": clip.get("sha256"),
        }
        if term_set is not None:
            hit["contextScore"] = context_score(
                hit["truth"], term_set.get("contextTerms")
            )
            hit["isNegated"] = negation_flag(
                hit["truth"], term_set.get("negativeTerms")
            )
        hits.append(hit)
    hits.sort(key=lambda h: (-h["score"], -h["effectiveScore"], h["clipId"]))
    return hits


__all__ = [
    "INDEL_COST", "DEFAULT_THRESHOLD", "WORD_BOUNDARY",
    "MIN_ANCHOR_WORD_LEN", "MAX_DELETION_SHARE",
    "merge_clip_phones", "clip_alignment_units", "align", "align_ops",
    "query_word_map", "coverage_ok",
    "term_variants", "context_score", "negation_flag",
    "load_index", "search_index",
]


if __name__ == "__main__":
    import sys

    vox = Path(__file__).resolve().parents[1]
    idx = load_index(vox / "data" / "index.json")
    for term in sys.argv[1:] or ["Coragen", "free"]:
        print(f"== {term!r} ==")
        for h in search_index(idx, term):
            print(
                f"  {h['clipId']:8s} score={h['score']:.3f} "
                f"eff={h['effectiveScore']:.3f} span={h['spanStart']:.2f}"
                f"~{h['spanEnd']:.2f} via {h['variant']['ipa']} "
                f"[{h['variant']['rule']}] :: {h['matchedIpa']}"
            )
