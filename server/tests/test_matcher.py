#!/usr/bin/env python
"""matcher.py 검증 — CONTRACT §5·§10.

assert 기반, pytest 불필요.
실행: /Users/junehwi/zipa-mac/zipa-env/bin/python server/tests/test_matcher.py
"""
import json
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
VOX = SERVER_DIR.parent
sys.path.insert(0, str(SERVER_DIR))

import matcher  # noqa: E402

INDEX_PATH = VOX / "data" / "index.json"
TERMSETS_PATH = VOX / "data" / "termsets.json"

EPS = 1e-9


def approx(a: float, b: float, tol: float = 1e-6) -> bool:
    return abs(a - b) <= tol


def main() -> None:
    index = matcher.load_index(INDEX_PATH)
    termsets = {t["id"]: t for t in json.loads(TERMSETS_PATH.read_text("utf-8"))}
    clips = {c["id"]: c for c in index["clips"]}
    assert len(clips) == 14, f"클립 14개 기대, 실제 {len(clips)}"

    # ── 1. merge_clip_phones: 토큰 단위 → g2p 단위 병합 + 타임스탬프 ──
    phones = [
        {"s": "▁", "t0": 0.00, "t1": 0.04},
        {"s": "t", "t0": 0.04, "t1": 0.08},
        {"s": "ʃ", "t0": 0.08, "t1": 0.12},   # t+ʃ → tʃ
        {"s": "a", "t0": 0.14, "t1": 0.18},
        {"s": "ː", "t0": 0.18, "t1": 0.22},   # a+ː → aː
        {"s": "n", "t0": 0.26, "t1": 0.30},
        {"s": "̪", "t0": 0.30, "t1": 0.32},    # n+◌̪ → n̪
    ]
    units = matcher.merge_clip_phones(phones)
    assert [u["s"] for u in units] == ["▁", "tʃ", "aː", "n̪"], units
    assert units[1]["t0"] == 0.04 and units[1]["t1"] == 0.12  # 병합 시 t1 연장
    assert units[2]["t0"] == 0.14 and units[2]["t1"] == 0.22
    assert units[3]["t0"] == 0.26 and units[3]["t1"] == 0.32
    print("PASS merge_clip_phones (tʃ/aː/n̪ 병합, 타임스탬프 보존)")

    # ── 2. align: 비용 규칙 (CONTRACT §5) ───────────────────────────
    # 완전 일치 = 비용 0, 스팬은 로컬(클립 중간)
    cost, s0, s1 = matcher.align(["b"], ["a", "b", "k"])
    assert approx(cost, 0.0) and (s0, s1) == (1, 2)
    # §4 규칙쌍 치환 = 1-weight (s↔ʃ 0.8 → 0.2)
    cost, _, _ = matcher.align(["s"], ["ʃ"])
    assert approx(cost, 0.2), cost
    # 비규칙쌍 치환 = 1 (스팬 내부라 삭제+삽입 1.4 보다 싸다)
    cost, _, _ = matcher.align(["k", "m", "n"], ["k", "b", "n"])
    assert approx(cost, 1.0), cost
    # 질의 끝 phone 은 치환(1)보다 삭제(0.7)가 싸서 스팬 밖으로 밀려난다
    cost, s0, s1 = matcher.align(["k", "m"], ["k", "b"])
    assert approx(cost, 0.7) and (s0, s1) == (0, 1)
    # 질의 phone 삭제 = 0.7 (기본)
    cost, s0, s1 = matcher.align(["k", "x", "m"], ["k", "m"])
    assert approx(cost, 0.7), cost
    # 질의 ɦ 삭제 = 0.2 (h-drop weight)
    cost, _, _ = matcher.align(["n", "ɦ", "m"], ["n", "m"])
    assert approx(cost, 0.2), cost
    # 질의 ə 삭제는 0.7 유지 — final-schwa 변이와의 이중 할인 방지
    cost, _, _ = matcher.align(["n", "ə", "m"], ["n", "m"])
    assert approx(cost, 0.7), cost
    # 클립 ə 삽입(건너뜀) = 0.1, ɦ 삽입 = 0.2
    cost, _, _ = matcher.align(["k", "n"], ["k", "ə", "n"])
    assert approx(cost, 0.1), cost
    cost, _, _ = matcher.align(["k", "n"], ["k", "ɦ", "n"])
    assert approx(cost, 0.2), cost
    # 클립 일반 phone 삽입 = 0.7
    cost, _, _ = matcher.align(["k", "n"], ["k", "b", "n"])
    assert approx(cost, 0.7), cost
    # 클립 시작·끝 건너뛰기는 무료 (로컬 정렬)
    cost, s0, s1 = matcher.align(["b", "k"], ["x", "y", "b", "k", "z"])
    assert approx(cost, 0.0) and (s0, s1) == (2, 4)
    print("PASS align 비용 규칙 (치환 1-weight/1, indel 0.7, ɦ 0.2, 클립 ə 0.1)")

    # ── 2b. align_ops: align 과 동일한 비용·스팬 + traceback 정합 ───
    for q_seq, c_seq in (
        (["k", "x", "m"], ["k", "m"]),
        (["b", "k"], ["x", "y", "b", "k", "z"]),
        (["k", "n"], ["k", "ə", "n"]),
        (["s"], ["ʃ"]),
    ):
        cost, s0, s1 = matcher.align(q_seq, c_seq)
        cost2, t0, t1, ops = matcher.align_ops(q_seq, c_seq)
        assert approx(cost, cost2) and (s0, s1) == (t0, t1), (q_seq, c_seq)
        # 연산 비용 합 = best_cost, 질의 소비 완전성(sub+del = 질의 길이)
        op_cost = 0.0
        consumed = []
        for op, qi, cj in ops:
            if op == "sub":
                op_cost += matcher._sub_cost(q_seq[qi], c_seq[cj])
                consumed.append(qi)
            elif op == "del":
                op_cost += matcher._del_cost(q_seq[qi])
                consumed.append(qi)
            else:
                op_cost += matcher._ins_cost(c_seq[cj])
        assert approx(op_cost, cost), (q_seq, c_seq, ops)
        assert consumed == list(range(len(q_seq))), (q_seq, ops)
        # ops 의 sub/ins 클립 인덱스는 스팬 [s0,s1) 안에서 단조 증가
        cjs = [cj for op, qi, cj in ops if cj is not None]
        assert cjs == sorted(cjs) and all(s0 <= cj < s1 for cj in cjs), ops
    print("PASS align_ops (비용·스팬 일치, 연산 비용 합 = best_cost)")

    # ── 3. 필수 시나리오: "Coragen" → en-01 최상위 ──────────────────
    hits = matcher.search_index(index, "Coragen")
    assert hits, "Coragen: 히트 없음"
    assert hits[0]["clipId"] == "en-01", (
        f"Coragen 최상위가 en-01 이 아님: {[(h['clipId'], h['score']) for h in hits]}"
    )
    assert hits[0]["score"] >= 0.85, hits[0]["score"]
    assert len(hits) < 2 or hits[1]["score"] <= 0.7, "en-01 마진 부족"
    assert all(not h["clipId"].startswith("nu-") for h in hits), (
        "중립 클립이 Coragen threshold 를 넘음"
    )
    print(f"PASS 'Coragen' → en-01 최상위 (score={hits[0]['score']}, "
          f"variant={hits[0]['variant']['ipa']})")

    # ── 4. 필수 시나리오: "free" → ff-01/ff-02 포함 ─────────────────
    hits = matcher.search_index(index, "free")
    ids = [h["clipId"] for h in hits]
    assert "ff-01" in ids and "ff-02" in ids, f"free 히트 누락: {ids}"
    ff02 = next(h for h in hits if h["clipId"] == "ff-02")
    assert approx(ff02["score"], 1.0) and ff02["matchedIpa"] == "friː", ff02
    ff01 = next(h for h in hits if h["clipId"] == "ff-01")
    # fix-0: 채택 기준은 effectiveScore — 표준형 friː(eff 0.75)가
    # 저가중 변이 pʰɾiː(raw 0.95 × w 0.76 = eff 0.722)를 이긴다.
    assert ff01["effectiveScore"] >= 0.75 - 1e-3, ff01
    assert ff01["variant"]["kind"] == "standard", ff01["variant"]
    # 변이 확장 자체는 여전히 유효: pʰɾiː 계열 변이가 ff-01 의 pɾiː 실현을
    # raw score ≥0.9 로 회수한다 (랭킹에 안 쓰일 뿐 G2P/변이 규칙은 정상).
    ff01_units = [u["s"] for u in matcher.clip_alignment_units(clips["ff-01"])]
    raw_by_variant = {}
    for v in matcher.term_variants("free"):
        q = matcher._query_units(v["ipa"])
        cost, s0, s1 = matcher.align(q, ff01_units)
        if q and s1 > s0:
            raw_by_variant[v["ipa"]] = 1.0 - cost / len(q)
    assert max(raw_by_variant.values()) >= 0.9, raw_by_variant
    print(f"PASS 'free' → ff-01(eff {ff01['effectiveScore']}, 표준형 채택)"
          f"/ff-02({ff02['score']}) 포함, 변이 raw 회수 "
          f"{max(raw_by_variant.values()):.3f}")

    # ── 5. 히트 공통 불변식: 정렬·스팬·threshold·스키마 ─────────────
    required_keys = {
        "clipId", "score", "effectiveScore", "cost", "queryLen",
        "spanStart", "spanEnd", "matchedIpa", "variant",
        "truth", "termSetId", "duration", "file", "sha256",
    }
    for term in ("Coragen", "free", "compulsory", "premium nahi lagega"):
        hits = matcher.search_index(index, term)
        scores = [h["score"] for h in hits]
        assert scores == sorted(scores, reverse=True), f"{term}: score 정렬 위반"
        for h in hits:
            assert required_keys <= set(h), f"{term}: 키 누락 {required_keys - set(h)}"
            assert h["score"] >= matcher.DEFAULT_THRESHOLD - EPS
            assert h["effectiveScore"] <= h["score"] + EPS
            assert approx(
                h["effectiveScore"], h["score"] * h["variant"]["weight"], 1e-3
            )
            dur = clips[h["clipId"]]["duration"]
            assert 0.0 <= h["spanStart"] < h["spanEnd"] <= dur + 0.05, (
                f"{term}/{h['clipId']}: 스팬 {h['spanStart']}~{h['spanEnd']} (dur {dur})"
            )
            assert h["matchedIpa"], f"{term}/{h['clipId']}: matchedIpa 비어 있음"
            assert "▁" not in h["matchedIpa"]
    # threshold 인자 존중
    all_hits = matcher.search_index(index, "free", threshold=0.0)
    assert len(all_hits) >= len(matcher.search_index(index, "free"))
    assert all(
        h["score"] >= 0.9 for h in matcher.search_index(index, "free", threshold=0.9)
    )
    print("PASS 히트 불변식 (정렬·스팬 in [0,duration]·threshold·스키마)")

    # ── 6. 베이스라인 모드 (use_variants=False) — recall A/B ────────
    base = matcher.search_index(index, "Coragen", use_variants=False, threshold=0.0)
    assert all(h["variant"]["kind"] == "standard" for h in base), "베이스라인에 변이 사용됨"
    assert all(approx(h["variant"]["weight"], 1.0) for h in base)
    # fix-1 이후: 표준형 koɾaːdʒen 은 en-01 의 실현(kɔːɾədʒən 계열)과
    # 질의 40% 를 삭제(delshare 0.40)해야만 정렬돼 커버리지 게이트가 기각한다.
    # "표준 발음만으로는 en-01 을 못 찾는다"가 정직한 베이스라인이고,
    # 변이 모드는 kɔːɾədʒən 변이로 0.9 에 회수한다 — A/B 이득이 더 선명하다.
    assert all(h["clipId"] != "en-01" for h in base), (
        "fix-1 회귀: 표준형의 wholesale-삭제 정렬이 게이트를 통과함"
    )
    v_en01 = matcher.search_index(index, "Coragen")[0]
    assert v_en01["clipId"] == "en-01" and v_en01["score"] >= 0.85, (
        f"변이 recall 이득 없음: variants={v_en01['score']} base=미발견"
    )
    b_free = matcher.search_index(index, "free", use_variants=False)
    v_ff01 = next(
        h for h in matcher.search_index(index, "free") if h["clipId"] == "ff-01"
    )
    b_ff01 = next(h for h in b_free if h["clipId"] == "ff-01")
    # fix-0 회귀 가드: 변이를 켰을 때 effectiveScore(=UI/API 랭킹 키)가
    # 베이스라인보다 낮아지면 안 된다. 종전 결함: raw 기준 채택이
    # pʰɾiː(eff 0.722)를 골라 friː(eff 0.75)보다 순위가 역전됐다.
    assert v_ff01["effectiveScore"] >= b_ff01["effectiveScore"] - EPS, (
        f"ff-01: 변이 활성화로 eff 역행 "
        f"{b_ff01['effectiveScore']}→{v_ff01['effectiveScore']}"
    )
    print(f"PASS 베이스라인 A/B (Coragen en-01 미발견→{v_en01['score']}, "
          f"free ff-01 eff {b_ff01['effectiveScore']}→{v_ff01['effectiveScore']})")

    # ── 6b. fix-0 회귀: 채택=최고 eff 변이, 컷오프=eff 척도 ────────
    # 클립별 채택 변이의 effectiveScore 는 모든 변이가 낼 수 있는 eff 의
    # 최대값과 일치해야 하고(선택 키 = 정렬 키), 히트/비히트 경계도
    # eff >= threshold 로 갈려야 한다(raw 만 넘긴 저신뢰 교차 매치 차단).
    # (fix-1: 기준 계산에도 커버리지 게이트를 동일 적용 — 게이트 통과 변이만
    #  채택 후보다.)
    for term in ("free", "compulsory"):
        vs = matcher.term_variants(term)
        hits = matcher.search_index(index, term)
        by_id = {h["clipId"]: h for h in hits}
        for clip in index["clips"]:
            units = [u["s"] for u in matcher.clip_alignment_units(clip)]
            best_eff = 0.0
            for v in vs:
                q, word_of, word_lens = matcher.query_word_map(v["ipa"])
                if not q:
                    continue
                cost, s0, s1, ops = matcher.align_ops(q, units)
                if s1 <= s0:
                    continue
                if not matcher.coverage_ok(q, word_of, word_lens, ops):
                    continue
                best_eff = max(best_eff, (1.0 - cost / len(q)) * v["weight"])
            h = by_id.get(clip["id"])
            if h is not None:
                assert approx(h["effectiveScore"], best_eff, 1e-3), (
                    f"{term}/{clip['id']}: 채택 eff {h['effectiveScore']} "
                    f"!= 최대 eff {best_eff:.4f}"
                )
                assert best_eff >= matcher.DEFAULT_THRESHOLD - 1e-3
            else:
                assert best_eff < matcher.DEFAULT_THRESHOLD + 1e-9, (
                    f"{term}/{clip['id']}: eff {best_eff:.4f} 인데 히트 누락"
                )
    print("PASS fix-0 회귀 (채택 변이 = 최대 effectiveScore, eff 컷오프)")

    # ── 7. 다단어 검색어 (▁ 무시) ───────────────────────────────────
    hits = matcher.search_index(index, "premium nahi lagega")
    top3 = [h["clipId"] for h in hits[:3]]
    assert "ff-01" in top3 and "ff-03" in top3, f"다단어 top-3: {top3}"
    print(f"PASS 다단어 'premium nahi lagega' top-3 = {top3}")

    # ── 8. context / negation (CONTRACT §5) ─────────────────────────
    ff = termsets["false-free"]
    # 등장 비율: ff-01 truth 는 contextTerms 5개 중 3개(प्लान/premium/free) 포함
    assert approx(matcher.context_score(clips["ff-01"]["truth"], ff["contextTerms"]), 0.6)
    assert matcher.context_score("", ff["contextTerms"]) == 0.0
    assert matcher.context_score(clips["ff-01"]["truth"], []) == 0.0
    # negation: negativeTerms 등장 시 True
    assert matcher.negation_flag(clips["ff-neg"]["truth"], ff["negativeTerms"]) is True
    assert matcher.negation_flag(clips["ff-01"]["truth"], ff["negativeTerms"]) is False
    assert matcher.negation_flag(clips["ff-03"]["truth"], ff["negativeTerms"]) is False
    fb = termsets["forced-bundling"]
    assert matcher.negation_flag(clips["cb-neg"]["truth"], fb["negativeTerms"]) is True
    assert matcher.negation_flag(clips["cb-02"]["truth"], fb["negativeTerms"]) is False
    # term_set 지정 시 히트에 contextScore/isNegated 부착
    hits = matcher.search_index(index, "free", term_set=ff)
    by_id = {h["clipId"]: h for h in hits}
    assert approx(by_id["ff-01"]["contextScore"], 0.6)
    assert by_id["ff-01"]["isNegated"] is False
    assert by_id["ff-neg"]["isNegated"] is True
    # term_set 미지정 시에는 키 자체가 없다
    assert "contextScore" not in matcher.search_index(index, "free")[0]
    print("PASS context 비율·negation 플래그 (ff-01 0.6, ff-neg/cb-neg negated)")

    # ── 9. 경로 입력·빈 검색어 ──────────────────────────────────────
    hits_from_path = matcher.search_index(str(INDEX_PATH), "Coragen")
    assert hits_from_path and hits_from_path[0]["clipId"] == "en-01"
    assert matcher.search_index(index, "") == []
    print("PASS 경로 입력 + 빈 검색어")

    # ── 10. fix-1 회귀: 질의 커버리지 게이트 — 교차 termset 누출 차단 ──
    # 결함: 세미글로벌 정렬의 질의 phone 삭제(0.7)가 질의 길이 대비 싸서,
    # 'bilkul free' 의 free(3 phone)를 통째로 버리고 बिल्कुल 단독 매칭
    # (0.7667)으로 cb-neg 가 false-free 기본 검색 최상단에 올랐다.
    # 게이트 = (1) 가장자리 단어(≥3 phone) 앵커 (2) 삭제비용 비중 ≤ 0.28.
    # (a) 'bilkul free' → cb-neg 재누출 금지, 진성 ff-01/ff-02 유지
    hits = matcher.search_index(index, "bilkul free")
    ids = [h["clipId"] for h in hits]
    assert "cb-neg" not in ids, f"fix-1 회귀: cb-neg 재누출 {ids}"
    assert "ff-01" in ids and "ff-02" in ids, ids
    # (b) false-free·forced-bundling 기본 검색어는 자기 termset 클립만 히트
    #     (종전 누출: cb-neg←bilkul free, ff-02←approval nahi milega,
    #      ff-neg←compulsory hai)
    for ts_id in ("false-free", "forced-bundling"):
        for term in termsets[ts_id]["searchTerms"]:
            for h in matcher.search_index(index, term):
                assert h["termSetId"] == ts_id, (
                    f"교차 누출: {term!r} → {h['clipId']} "
                    f"({h['termSetId']}, eff {h['effectiveScore']})"
                )
    # (c) 진성 회수가 게이트에 걸리면 안 된다:
    #     ff-neg — 내부 단어(nahi) 전량 삭제는 허용(가장자리만 앵커),
    #     cb-02/cb-neg — 짧은 기능어 hai(≤2 phone)는 앵커 면제,
    #     cb-01/cb-03 — 가장자리 단어 부분 매칭(sub 1개)도 앵커로 인정.
    prem = {h["clipId"] for h in matcher.search_index(index, "premium nahi lagega")}
    assert {"ff-01", "ff-03", "ff-neg"} <= prem, prem
    comp = {h["clipId"] for h in matcher.search_index(index, "compulsory hai")}
    assert {"cb-02", "cb-neg"} <= comp, comp
    saath = {h["clipId"] for h in matcher.search_index(index, "saath mein lena padega")}
    assert {"cb-01", "cb-03"} <= saath, saath
    # (d) entity 검색: 종전 mechanism-누출(Chaudhary→cb-neg/ff-02/cb-02,
    #     Bavistin→cb-03) 전부 차단, 진성 en-* 유지. 'Coragen' 은 cb-03 의
    #     əpruːʋəl 실현(kʈɾəʋə)과의 4-anchor 유사(삭제 1건, eff≈0.58)만
    #     잔존 — 삭제 남용이 아닌 정상 퍼지 매칭이라 게이트 대상이 아니다.
    for term, own, banned in (
        ("Chaudhary", "en-03", {"cb-neg", "ff-02", "cb-02"}),
        ("Bavistin", "en-02", {"cb-03"}),
    ):
        ids = {h["clipId"] for h in matcher.search_index(index, term)}
        assert not (ids & banned), (term, ids)
        assert own in ids, (term, ids)
    cor = {h["clipId"]: h for h in matcher.search_index(index, "Coragen")}
    assert set(cor) <= {"en-01", "cb-03"}, set(cor)
    assert cor["en-01"]["effectiveScore"] >= 0.85
    if "cb-03" in cor:
        assert cor["cb-03"]["effectiveScore"] < 0.6, cor["cb-03"]
    # (e) coverage_ok 단위 판정
    q, wof, wlen = matcher.query_word_map("bɪlkʊl▁friː")
    assert (len(q), wlen) == (9, [6, 3])
    # 가장자리 단어(friː) 전량 삭제 → 기각 (삭제 비중 0.233 은 허용 범위지만
    # 앵커 규칙 위반)
    ops = [("sub", i, i) for i in range(6)] + [("del", i, None) for i in range(6, 9)]
    assert matcher.coverage_ok(q, wof, wlen, ops) is False
    # friː 에 sub 가 하나라도 있으면(부분 매칭 앵커) 통과
    ops = [("sub", i, i) for i in range(6)] + [
        ("del", 6, None), ("sub", 7, 6), ("sub", 8, 7)]
    assert matcher.coverage_ok(q, wof, wlen, ops) is True
    # 내부 단어 전량 삭제는 허용 (3단어 질의, 가운데 단어만 삭제)
    q3, wof3, wlen3 = matcher.query_word_map("kaːlaːm▁sil▁baːkuːl")
    assert wlen3 == [5, 3, 5]
    ops3 = ([("sub", i, i) for i in range(5)]
            + [("del", i, None) for i in range(5, 8)]
            + [("sub", i, i - 3) for i in range(8, 13)])
    assert matcher.coverage_ok(q3, wof3, wlen3, ops3) is True  # 비중 2.1/13=0.16
    # 삭제 비중 초과 → 기각 (단어 앵커는 충족해도 질의 태반을 버린 정렬)
    q1 = ["k", "l", "m", "n", "s", "t̪", "b", "d̪", "g", "p"]
    wof1, wlen1 = [0] * 10, [10]
    ops_ok = ([("sub", i, i) for i in range(7)]
              + [("del", i, None) for i in range(7, 10)])   # 2.1/10 = 0.21
    ops_bad = ([("sub", i, i) for i in range(5)]
               + [("del", i, None) for i in range(5, 10)])  # 3.5/10 = 0.35
    assert matcher.coverage_ok(q1, wof1, wlen1, ops_ok) is True
    assert matcher.coverage_ok(q1, wof1, wlen1, ops_bad) is False
    print("PASS fix-1 커버리지 게이트 (교차 termset 누출 차단, 진성 회수 유지)")

    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    main()
