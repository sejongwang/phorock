"""VoxLedger Hinglish G2P — CONTRACT §4.

소유: g2p 에이전트 (이 파일과 variants.py, tests/test_g2p.py만 수정).

역할:
- 데바나가리 → IPA 규칙표 변환 (어말 schwa 탈락 포함)
- 영어 차용어 → 인도식 IPA (lexicon 우선, 잔여는 문자 규칙)
- IPA 토큰화 (tokenize_ipa): ZIPA 모델 tokens.txt 127개 토큰과 정합

중요 제약: ZIPA tokens.txt 에는 ʱ(U+02B1, 유성기식)와 ɡ(U+0261, script g)가 없다.
CONTRACT §4 lexicon 표기(bʱ, ɡʱ 등)는 로드 시 ʰ/g 로 정규화해 모델 토큰만 남긴다.
멀티문자 단위(t̪=t+U+032A, tʃ, dʒ, aː, ẽː 등)는 tokenize_ipa 가 하나의 phone 단위로 묶으며,
각 단위의 개별 코드포인트는 전부 tokens.txt 토큰이다.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

MODEL_TOKENS_PATH = Path("/Users/junehwi/zipa-mac/zipa_model/tokens.txt")

WORD_BOUNDARY = "▁"  # ▁ (ZIPA 토큰 id 3)

# ---------------------------------------------------------------------------
# IPA 정규화
# ---------------------------------------------------------------------------

# tokens.txt 에 없는 기호 → 있는 기호로 치환
_CHAR_SUBSTITUTIONS = {
    "ʱ": "ʰ",  # ʱ → ʰ (유성기식 → 기식; 모델 토큰에는 ʰ만 존재)
    "ɡ": "g",       # ɡ (script g) → g (ASCII)
    "ǝ": "ə",  # ǝ → ə
    "ʤ": "dʒ",  # ʤ → dʒ
    "ʧ": "tʃ",  # ʧ → tʃ
}

# 발음 표기에서 버리는 기호 (강세·음절 표기 등)
_DROP_CHARS = set("ˈˌ.'’|")


def normalize_ipa(s: str) -> str:
    """IPA 문자열을 ZIPA tokens.txt 호환 코드포인트로 정규화한다."""
    s = unicodedata.normalize("NFD", s)
    out = []
    for ch in s:
        if ch in _DROP_CHARS:
            continue
        out.append(_CHAR_SUBSTITUTIONS.get(ch, ch))
    return "".join(out)


# 선행 phone 단위에 달라붙는 기호(결합 분음부호·수식 문자·장음·권설 접미)
_ATTACH = {
    "̃",  # ̃  비음화
    "̪",  # ̪  치음
    "̥",  # ̥  무성화
    "̩",  # ̩  성절음
    "̚",  # ̚  불파음
    "̴",  # ̴  연구개음화 중첩
    "̺",  # ̺  설첨음
    "ʰ",  # ʰ  기식
    "ʲ",  # ʲ  구개음화
    "ʷ",  # ʷ  원순화
    "ˠ",  # ˠ  연구개음화
    "ˤ",  # ˤ  인두음화
    "ʼ",  # ʼ  방출음
    "ː",  # ː  장음
    "˞",  # ˞  권설 모음
}


def tokenize_ipa(s: str) -> list[str]:
    """IPA 문자열 → phone 단위 리스트.

    - 결합 기호(̪ ̃ ʰ ː ˞ …)는 직전 단위에 붙는다: "t̪ʰiːk" → ["t̪ʰ","iː","k"]
    - 파찰음 t+ʃ, d+ʒ 는 한 단위로 묶는다: "tʃaːɾdʒ" → ["tʃ","aː","ɾ","dʒ"]
    - 공백/▁ 는 단어 경계 "▁" 단위로 남긴다 (matcher 는 계약 §5에 따라 무시)
    """
    s = normalize_ipa(s)
    units: list[str] = []
    for ch in s:
        if ch.isspace() or ch == WORD_BOUNDARY:
            if units and units[-1] != WORD_BOUNDARY:
                units.append(WORD_BOUNDARY)
            continue
        if ch in _ATTACH and units and units[-1] != WORD_BOUNDARY:
            units[-1] += ch
            continue
        units.append(ch)
    while units and units[0] == WORD_BOUNDARY:
        units.pop(0)
    while units and units[-1] == WORD_BOUNDARY:
        units.pop()
    merged: list[str] = []
    for u in units:
        if merged and (
            (merged[-1] == "t" and u in ("ʃ", "ʃʰ"))   # ʃ, ʃʰ
            or (merged[-1] == "d" and u in ("ʒ", "ʒʰ"))  # ʒ, ʒʰ
        ):
            merged[-1] += u
        else:
            merged.append(u)
    return merged


# ---------------------------------------------------------------------------
# ZIPA 모델 토큰 검증
# ---------------------------------------------------------------------------

_SPECIAL_TOKENS = {"<blk>", "<sos/eos>", "<unk>"}


def load_model_tokens(path: Path = MODEL_TOKENS_PATH) -> set[str]:
    """tokens.txt → 사용할 수 있는 토큰 문자열 집합 (특수 토큰 제외)."""
    tokens: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        tok = line.rsplit(" ", 1)[0]
        if tok not in _SPECIAL_TOKENS:
            tokens.add(tok)
    return tokens


def invalid_symbols(ipa: str, tokens: set[str] | None = None) -> list[str]:
    """ipa 안에서 tokens.txt 에 없는 코드포인트 목록 (빈 리스트 = 전부 호환)."""
    if tokens is None:
        tokens = load_model_tokens()
    return [ch for ch in ipa if ch not in tokens]


# ---------------------------------------------------------------------------
# 데바나가리 → IPA 규칙표
# ---------------------------------------------------------------------------

_DEV_CONSONANTS = {
    "क": "k", "ख": "kʰ", "ग": "g", "घ": "gʰ", "ङ": "ŋ",
    "च": "tʃ", "छ": "tʃʰ", "ज": "dʒ", "झ": "dʒʰ", "ञ": "ɲ",
    "ट": "ʈ", "ठ": "ʈʰ", "ड": "ɖ", "ढ": "ɖʰ", "ण": "ɳ",
    "त": "t̪", "थ": "t̪ʰ", "द": "d̪", "ध": "d̪ʰ", "न": "n",
    "प": "p", "फ": "pʰ", "ब": "b", "भ": "bʰ", "म": "m",
    "य": "j", "र": "ɾ", "ल": "l", "व": "ʋ",
    "श": "ʃ", "ष": "ʂ", "स": "s", "ह": "ɦ", "ळ": "ɭ",
    # nukta 합성형 (힌디 화자의 일반 실현으로 사상)
    "क़": "k", "ख़": "kʰ", "ग़": "g", "ज़": "z",
    "ड़": "ɽ", "ढ़": "ɽʰ", "फ़": "f", "य़": "j",
}

# 결합형 nukta(U+093C) 처리: 기본 자모 → nukta 자모
_NUKTA_UPGRADE = {
    "क": "क़", "ख": "ख़", "ग": "ग़", "ज": "ज़",
    "ड": "ड़", "ढ": "ढ़", "फ": "फ़", "य": "य़",
}

_DEV_INDEP_VOWELS = {
    "अ": "ə", "आ": "aː", "इ": "ɪ", "ई": "iː", "उ": "ʊ", "ऊ": "uː",
    "ऋ": "ɾɪ", "ए": "eː", "ऐ": "ɛː", "ओ": "oː", "औ": "ɔː",
    "ऑ": "ɒ", "ऍ": "æ",
}

_DEV_MATRAS = {
    "ा": "aː", "ि": "ɪ", "ी": "iː", "ु": "ʊ", "ू": "uː",
    "ृ": "ɾɪ", "े": "eː", "ै": "ɛː", "ो": "oː", "ौ": "ɔː",
    "ॉ": "ɒ", "ॅ": "æ",
}

_VIRAMA = "्"       # ्
_ANUSVARA = "ं"     # ं
_CHANDRABINDU = "ँ" # ँ
_VISARGA = "ः"      # ः
_NUKTA = "़"        # ़

_NASAL_VELAR = {"k", "kʰ", "g", "gʰ", "ŋ", "x", "ɣ", "q"}
_NASAL_RETRO = {"ʈ", "ʈʰ", "ɖ", "ɖʰ", "ɳ", "ɽ", "ɽʰ", "ʂ"}
_NASAL_LABIAL = {"p", "pʰ", "b", "bʰ", "m", "f"}

_VOWEL_BASES = set("aeiouæɐɑɒɔəɛɜɪʊʌɨʉɯɤøœ")


def _is_vowel_phone(phone: str) -> bool:
    return bool(phone) and phone[0] in _VOWEL_BASES


def _nasalize_last_vowel(out: list[str]) -> None:
    """out 마지막 모음 phone 에 비음화 ̃ 를 붙인다 (기저 모음 뒤, 장음 앞)."""
    for i in range(len(out) - 1, -1, -1):
        if _is_vowel_phone(out[i]):
            p = out[i]
            out[i] = p[0] + "̃" + p[1:]
            return
    out.append("n")  # 모음이 없으면 보수적으로 n


def is_devanagari(word: str) -> bool:
    return any(0x0900 <= ord(ch) <= 0x097F for ch in word)


def dev_to_ipa(word: str) -> str:
    """데바나가리 단어 1개 → IPA. 어말 내재 schwa 탈락 반영."""
    # nukta 결합형을 합성형으로 통일
    for base, nk in _NUKTA_UPGRADE.items():
        word = word.replace(base + _NUKTA, nk)
    chars = [ch for ch in word if ch not in ("‌", "‍")]  # ZWNJ/ZWJ 제거
    out: list[str] = []
    pending_schwa = False  # 직전 자음의 내재 schwa 미해결 여부
    for i, ch in enumerate(chars):
        if ch in _DEV_CONSONANTS:
            if pending_schwa:
                out.append("ə")
            out.append(_DEV_CONSONANTS[ch])
            pending_schwa = True
        elif ch in _DEV_MATRAS:
            out.append(_DEV_MATRAS[ch])
            pending_schwa = False
        elif ch == _VIRAMA:
            pending_schwa = False
        elif ch in _DEV_INDEP_VOWELS:
            if pending_schwa:
                out.append("ə")
                pending_schwa = False
            out.append(_DEV_INDEP_VOWELS[ch])
        elif ch in (_ANUSVARA, _CHANDRABINDU):
            if pending_schwa:
                out.append("ə")
                pending_schwa = False
            nxt = _DEV_CONSONANTS.get(chars[i + 1]) if i + 1 < len(chars) else None
            if ch == _CHANDRABINDU or nxt is None:
                _nasalize_last_vowel(out)
            elif nxt in _NASAL_VELAR:
                out.append("ŋ")
            elif nxt in _NASAL_RETRO:
                out.append("ɳ")
            elif nxt in _NASAL_LABIAL:
                out.append("m")
            else:
                out.append("n")
        elif ch == _VISARGA:
            if pending_schwa:
                out.append("ə")
                pending_schwa = False
            out.append("ɦ")
        # 그 외(숫자·문장부호 등)는 무시
    if pending_schwa and len(out) >= 2:
        pass  # 어말 schwa 탈락 (단, 단자음 단어 "न" 등은 유지)
    elif pending_schwa:
        out.append("ə")
    return normalize_ipa("".join(out))


# ---------------------------------------------------------------------------
# 영어 차용어 → 인도식 IPA
# ---------------------------------------------------------------------------

# CONTRACT §4 필수 lexicon (원문 표기 그대로; 로드 시 normalize_ipa 로 ʱ→ʰ, ɡ→g)
_LEXICON_RAW: dict[str, list[str]] = {
    # --- §4 필수 항목 ---
    "free": ["friː"],
    "premium": ["priːmijəm"],
    "policy": ["pɒliːsiː", "paːlisiː"],
    "approval": ["əpruːʋəl"],
    "compulsory": ["kəmpəlsəriː"],
    "optional": ["ɒpʃənəl"],
    "extra": ["ekstɾaː"],
    "charge": ["tʃaːɾdʒ"],
    "cover": ["kəʋəɾ"],
    "loan": ["loːn"],
    "insurance": ["ɪnʃoːɾens"],
    "spray": ["spɾeː"],
    "powder": ["paːʋɖəɾ"],
    # 3안 kɔːɾədʒən 은 비강세 모음 축약(인도 영어 상용 실현;
    # Lekha 발화의 ZIPA 실측 ɔːɾədʒən 과 정합) — matcher 에이전트 추가
    "coragen": ["koɾaːdʒen", "koɾeːdʒen", "kɔːɾədʒən"],
    "bavistin": ["baːʋɪsʈiːn"],
    "chaudhary": ["tʃɔːd̪ʱəɾiː", "tʃɔːd̪əɾiː"],
    "bharat": ["bʱaːɾət̪", "baːɾət̪"],
    # --- 보조: termsets 라틴 표기 힌디어 (잔여 문자규칙 품질 보강, §4 "소사전 우선" 취지) ---
    "bilkul": ["bɪlkʊl"],
    "nahi": ["nəɦiː"],
    "nahin": ["nəɦĩː"],
    "lagega": ["ləgeːgaː"],
    "saath": ["saːt̪ʰ"],
    "mein": ["mẽː"],
    "lena": ["leːnaː"],
    "padega": ["pəɽeːgaː"],
    "milega": ["mɪleːgaː"],
    "hai": ["ɦɛː"],
    "health": ["ɦelt̪ʰ"],
    "rider": ["ɾaɪɖəɾ"],
    "plan": ["plaːn"],
}

LEXICON: dict[str, list[str]] = {
    k: [normalize_ipa(p) for p in v] for k, v in _LEXICON_RAW.items()
}

# 잔여 문자 규칙 (인도식: t/d → 권설 ʈ/ɖ, r → ɾ, w/v → ʋ)
_MULTI_RULES: list[tuple[str, str]] = sorted(
    [
        ("tion", "ʃən"), ("sion", "ʃən"),
        ("tch", "tʃ"), ("sch", "ʃ"), ("chh", "tʃʰ"),
        # 라틴 표기 힌디 기식음
        ("bh", "bʰ"), ("dh", "d̪ʰ"), ("gh", "gʰ"), ("jh", "dʒʰ"), ("kh", "kʰ"),
        ("ch", "tʃ"), ("sh", "ʃ"), ("ph", "f"), ("th", "t̪ʰ"), ("wh", "ʋ"),
        ("ck", "k"), ("qu", "kʋ"), ("ng", "ŋ"),
        ("aa", "aː"), ("ee", "iː"), ("ii", "iː"), ("oo", "uː"), ("uu", "uː"),
        ("ea", "iː"), ("ai", "ɛː"), ("ay", "eː"), ("ey", "eː"),
        ("au", "ɔː"), ("aw", "ɔː"), ("ou", "aʊ"), ("ow", "aʊ"),
        ("oa", "oː"), ("oi", "ɔɪ"), ("oy", "ɔɪ"),
        ("ei", "eː"), ("ie", "iː"), ("ue", "uː"), ("ui", "uː"),
    ],
    key=lambda t: -len(t[0]),
)

_SINGLE_RULES = {
    "a": "ə", "b": "b", "d": "ɖ", "e": "e", "f": "f", "g": "g",
    "h": "ɦ", "i": "ɪ", "j": "dʒ", "k": "k", "l": "l", "m": "m",
    "n": "n", "o": "o", "p": "p", "q": "k", "r": "ɾ", "s": "s",
    "t": "ʈ", "u": "ʊ", "v": "ʋ", "w": "ʋ", "x": "ks", "z": "z",
}


def letters_to_ipa(word: str) -> str:
    """미등재 라틴 단어의 잔여 문자 규칙 변환 (인도식 관행 반영)."""
    w = word.lower()
    out: list[str] = []
    i = 0
    while i < len(w):
        # 겹자음 축약 (ll, ss, tt …)
        if i > 0 and w[i] == w[i - 1] and w[i] not in "aeiou":
            i += 1
            continue
        matched = False
        for pat, ipa in _MULTI_RULES:
            if w.startswith(pat, i):
                out.append(ipa)
                i += len(pat)
                matched = True
                break
        if matched:
            continue
        ch = w[i]
        if ch == "c":
            nxt = w[i + 1] if i + 1 < len(w) else ""
            out.append("s" if nxt in "eiy" else "k")
        elif ch == "y":
            out.append("iː" if i == len(w) - 1 else "j")
        elif ch in _SINGLE_RULES:
            out.append(_SINGLE_RULES[ch])
        # 그 외 문자는 무시
        i += 1
    return normalize_ipa("".join(out))


def english_to_ipa(word: str) -> list[str]:
    """라틴 표기 단어 → 발음 후보 리스트 (lexicon 우선, 첫 항목이 표준형)."""
    key = word.lower()
    if key in LEXICON:
        return list(LEXICON[key])
    return [letters_to_ipa(key)]


# ---------------------------------------------------------------------------
# 검색어(term) 발음
# ---------------------------------------------------------------------------

_PUNCT_EDGE = ".,!?;:()[]{}\"'“”‘’।|"


def _term_words(term: str) -> list[str]:
    words = []
    for raw in re.split(r"[\s\-–—/]+", term.strip()):
        w = raw.strip(_PUNCT_EDGE)
        if w:
            words.append(w)
    return words


def word_to_ipa(word: str) -> list[str]:
    if is_devanagari(word):
        return [dev_to_ipa(word)]
    return english_to_ipa(word)


def term_pronunciations(term: str) -> list[tuple[str, str, str | None, float]]:
    """term(단어 1개 이상, 힌디/라틴 혼용 가능) → [(ipa, kind, rule, weight)].

    첫 항목이 표준형(weight 1.0). lexicon 대체 발음은 단어별로 하나씩 치환해
    (kind="lexicon", weight 0.95**치환수) 추가한다. 단어 경계는 ▁(모델 토큰).
    """
    words = _term_words(term)
    if not words:
        return []
    per_word = [word_to_ipa(w) for w in words]
    primary = WORD_BOUNDARY.join(p[0] for p in per_word)
    results: list[tuple[str, str, str | None, float]] = [
        (primary, "standard", None, 1.0)
    ]
    seen = {primary}
    for wi, prons in enumerate(per_word):
        for alt in prons[1:]:
            parts = [p[0] for p in per_word]
            parts[wi] = alt
            ipa = WORD_BOUNDARY.join(parts)
            if ipa not in seen:
                seen.add(ipa)
                results.append((ipa, "lexicon", "lexicon-alt", 0.95))
    return results


__all__ = [
    "MODEL_TOKENS_PATH", "WORD_BOUNDARY", "LEXICON",
    "normalize_ipa", "tokenize_ipa", "load_model_tokens", "invalid_symbols",
    "is_devanagari", "dev_to_ipa", "letters_to_ipa", "english_to_ipa",
    "word_to_ipa", "term_pronunciations",
]
