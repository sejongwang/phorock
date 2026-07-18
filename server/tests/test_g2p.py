#!/usr/bin/env python
"""g2p.py / variants.py 검증 — CONTRACT §4·§10.

assert 기반, pytest 불필요.
실행: /Users/junehwi/zipa-mac/zipa-env/bin/python server/tests/test_g2p.py
"""
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

import g2p  # noqa: E402
from variants import MAX_VARIANTS, confusable_weight, expand_variants  # noqa: E402

TOKENS = g2p.load_model_tokens()


def assert_model_tokens(ipa: str, ctx: str) -> None:
    """ipa 의 모든 코드포인트가 tokens.txt 토큰이어야 한다."""
    for ch in ipa:
        assert ch in TOKENS, (
            f"{ctx}: {ch!r} (U+{ord(ch):04X}) 는 tokens.txt 에 없는 기호"
        )


def main() -> None:
    # ── 0. tokens.txt 로드 자체 검증 ──────────────────────────────────
    assert len(TOKENS) == 124, f"특수 토큰 제외 124개 기대, 실제 {len(TOKENS)}"
    assert "▁" in TOKENS and "ʰ" in TOKENS and "̪" in TOKENS
    assert "ʱ" not in TOKENS and "ɡ" not in TOKENS  # 정규화 필요 근거
    print(f"PASS tokens.txt: {len(TOKENS)} usable tokens")

    # ── 1. tokenize_ipa: 멀티문자 토큰 묶음 ──────────────────────────
    assert g2p.tokenize_ipa("t̪ʰiːk") == ["t̪ʰ", "iː", "k"]
    assert g2p.tokenize_ipa("tʃaːɾdʒ") == ["tʃ", "aː", "ɾ", "dʒ"]
    assert g2p.tokenize_ipa("bʱaːɾət̪") == ["bʰ", "aː", "ɾ", "ə", "t̪"]  # ʱ→ʰ
    assert g2p.tokenize_ipa("jəɦ plaːn") == ["j", "ə", "ɦ", "▁", "p", "l", "aː", "n"]
    # 비음화+장음 결합 (precomposed ẽ 입력도 NFD 분해 후 한 단위로 묶임)
    assert g2p.tokenize_ipa("mẽː") == ["m", "ẽː"]
    print("PASS tokenize_ipa")

    # ── 2. 데바나가리 → IPA (어말 schwa 탈락 포함) ───────────────────
    assert g2p.dev_to_ipa("यह") == "jəɦ"
    assert g2p.dev_to_ipa("प्लान") == "plaːn"          # virama 자음군
    assert g2p.dev_to_ipa("बिल्कुल") == "bɪlkʊl"       # 어말 schwa 탈락
    assert g2p.dev_to_ipa("मौसम") == "mɔːsəm"          # 어중 schwa 유지·어말 탈락
    assert g2p.dev_to_ipa("में") == "mẽː"              # 어말 anusvara → 비음화
    assert g2p.dev_to_ipa("न") == "nə"                 # 단자음 단어는 schwa 유지
    for w in ("यह", "प्लान", "बिल्कुल", "मौसम", "में", "ज़रूरी", "पानी", "मिलाकर"):
        assert_model_tokens(g2p.dev_to_ipa(w), f"dev {w}")
    print("PASS devanagari→IPA (final schwa deletion)")

    # ── 3. lexicon (§4 필수 항목 전부 존재·토큰 호환) ────────────────
    required = [
        "free", "premium", "policy", "approval", "compulsory", "optional",
        "extra", "charge", "cover", "loan", "insurance", "spray", "powder",
        "coragen", "bavistin", "chaudhary", "bharat",
    ]
    for k in required:
        assert k in g2p.LEXICON, f"lexicon 누락: {k}"
        for p in g2p.LEXICON[k]:
            assert_model_tokens(p, f"lexicon {k}")
            assert "ʱ" not in p and "ɡ" not in p
    assert g2p.english_to_ipa("free")[0] == "friː"
    assert g2p.english_to_ipa("Bharat")[0] == "bʰaːɾət̪"  # bʱ→bʰ 정규화
    assert g2p.english_to_ipa("policy") == ["pɒliːsiː", "paːlisiː"]
    # 잔여 문자 규칙 (미등재어)
    assert_model_tokens(g2p.letters_to_ipa("tractor"), "letters tractor")
    assert_model_tokens(g2p.letters_to_ipa("subsidy"), "letters subsidy")
    print(f"PASS lexicon ({len(required)} required entries) + letter rules")

    # ── 4. expand_variants: 5개 필수 검색어 변이 수 >= 4, 토큰 호환 ──
    target_terms = ["free", "premium", "Coragen", "Bharat", "compulsory"]
    for term in target_terms:
        vs = expand_variants(term)
        assert len(vs) >= 4, f"{term}: 변이 {len(vs)}개 (<4)"
        assert len(vs) <= MAX_VARIANTS
        v0 = vs[0]
        assert v0["kind"] == "standard" and v0["weight"] == 1.0, f"{term}: 표준형 우선 위반"
        ipas = [v["ipa"] for v in vs]
        assert len(set(ipas)) == len(ipas), f"{term}: ipa 중복"
        rest_w = [v["weight"] for v in vs[1:]]
        assert rest_w == sorted(rest_w, reverse=True), f"{term}: weight 내림차순 위반"
        for v in vs:
            assert set(v) == {"surface", "ipa", "kind", "rule", "weight"}
            assert v["surface"] == term
            assert 0.0 < v["weight"] <= 1.0
            assert v["kind"] in ("standard", "lexicon", "rule")
            if v["kind"] == "rule":
                assert v["rule"], f"{term}: rule 라벨 없음"
            assert_model_tokens(v["ipa"], f"{term} variant {v['ipa']}")
            assert "ʱ" not in v["ipa"] and "ɡ" not in v["ipa"]
        print(f"PASS expand_variants({term!r}): {len(vs)} variants, all model-token-safe")

    # ── 5. 개별 규칙 스팟체크 ────────────────────────────────────────
    bharat = expand_variants("Bharat")
    assert bharat[0]["ipa"] == "bʰaːɾət̪"
    b_ipas = {v["ipa"] for v in bharat}
    assert "baːɾət̪" in b_ipas          # breathy-flatten(=lexicon alt)
    assert "bʰaːɾəʈ" in b_ipas         # retroflex-dental
    coragen = expand_variants("Coragen")
    c_ipas = {v["ipa"] for v in coragen}
    assert coragen[0]["ipa"] == "koɾaːdʒen"
    assert "koɾeːdʒen" in c_ipas       # lexicon alt
    assert "koɾaːzen" in c_ipas        # z-dzh
    assert any(v["rule"] and "r-merge" in v["rule"] for v in coragen)
    free = expand_variants("free")
    f_ipas = {v["ipa"] for v in free}
    assert free[0]["ipa"] == "friː"
    assert "frɪ" in f_ipas             # long-short
    assert "pʰriː" in f_ipas           # f-ph
    comp = expand_variants("compulsory")
    assert any(v["rule"] == "s-sh" and "ʃ" in v["ipa"] for v in comp)
    # 조합 규칙: weight 곱 확인 (long-short 0.9 × r-merge 0.95 = 0.855)
    combo = [v for v in free if v["rule"] == "long-short+r-merge"]
    assert combo and abs(combo[0]["weight"] - 0.855) < 1e-9
    print("PASS rule spot-checks (breathy/retroflex/z-dzh/long-short/f-ph/s-sh/조합 weight)")

    # ── 6. confusable_weight (matcher 계약 §5 지원) ──────────────────
    assert confusable_weight("t̪", "ʈ") == 0.80
    assert confusable_weight("s", "ʃ") == 0.80
    assert confusable_weight("iː", "ɪ") == 0.90
    assert confusable_weight("ʋ", "w") == 0.95
    assert confusable_weight("b", "bʰ") == 0.90
    assert confusable_weight("k", "m") is None
    print("PASS confusable_weight")

    # ── 7. 다단어·혼용 term ──────────────────────────────────────────
    mw = expand_variants("bilkul free")
    assert mw[0]["ipa"] == "bɪlkʊl▁friː"
    for v in mw:
        assert_model_tokens(v["ipa"], f"multiword {v['ipa']}")
    mixed = g2p.term_pronunciations("यह प्लान बिल्कुल free है")
    assert mixed[0][0] == "jəɦ▁plaːn▁bɪlkʊl▁friː▁ɦɛː"
    assert_model_tokens(mixed[0][0], "mixed sentence")
    print("PASS multiword + Hindi/Latin mixed terms")

    # ── 리포트: Coragen 변이 목록 ────────────────────────────────────
    print("\nCoragen variants:")
    for v in coragen:
        print(f"  {v['ipa']:<16} kind={v['kind']:<8} w={v['weight']:<6} rule={v['rule']}")

    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    main()
