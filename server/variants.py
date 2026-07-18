"""VoxLedger 발음 변이 생성 — CONTRACT §4.

소유: g2p 에이전트.

expand_variants(term) -> [{surface, ipa, kind, rule, weight}]
- 첫 항목은 표준형(weight 1.0), 이어서 lexicon 대체 발음과 규칙 변이.
- 규칙 조합 시 weight 는 곱. 표준형 포함 최대 24개(기본값).
- 모든 ipa 는 ZIPA tokens.txt 토큰만 사용 (g2p.normalize_ipa 경유,
  ʱ→ʰ 정규화이므로 계약의 bʱ→b 평탄화 규칙은 bʰ→b 로 구현된다).

matcher 용 export:
- confusable_weight(a, b): 규칙쌍이면 weight, 아니면 None (치환비용 = 1-weight)
- DELETION_WEIGHTS: 삭제/삽입이 특정 규칙(ɦ 탈락, 어말 schwa)에 해당할 때의 weight
"""
from __future__ import annotations

from itertools import combinations
from typing import Callable

try:  # server 패키지로 임포트될 때 (uvicorn server.main:app)
    from . import g2p  # type: ignore
except ImportError:  # 스크립트/단독 실행일 때 (server/ 가 sys.path 에 있는 경우)
    import g2p  # type: ignore

WORD_BOUNDARY = g2p.WORD_BOUNDARY

# ---------------------------------------------------------------------------
# 변이 규칙표 (CONTRACT §4: 이 세션 실측 + 문헌, rule 라벨·weight 포함)
# ---------------------------------------------------------------------------

# breathy 평탄화 bʱ→b, dʱ→d, ɡʱ→ɡ (0.9) — ʱ→ʰ 정규화 후 표기
_BREATHY_MAP = {
    "bʰ": "b", "dʰ": "d", "d̪ʰ": "d̪", "ɖʰ": "ɖ",
    "gʰ": "g", "dʒʰ": "dʒ", "ɽʰ": "ɽ",
}

# 기식 소실 kʰ→k, pʰ→p, t̪ʰ→t̪, ʈʰ→ʈ (0.85) — 동일 계열 tʃʰ 포함
_ASPIRATION_MAP = {
    "kʰ": "k", "pʰ": "p", "t̪ʰ": "t̪", "ʈʰ": "ʈ", "tʃʰ": "tʃ",
}

# retroflex↔dental ʈ↔t̪, ɖ↔d̪ (0.8) — 기식형 포함
_RETRO_DENTAL_MAP = {
    "ʈ": "t̪", "t̪": "ʈ", "ɖ": "d̪", "d̪": "ɖ",
    "ʈʰ": "t̪ʰ", "t̪ʰ": "ʈʰ", "ɖʰ": "d̪ʰ", "d̪ʰ": "ɖʰ",
}

_S_SH_MAP = {"s": "ʃ", "ʃ": "s"}            # s↔ʃ (0.8)
_Z_DZH_MAP = {"z": "dʒ", "dʒ": "z"}          # z↔dʒ (0.85)
_F_PH_MAP = {"f": "pʰ", "pʰ": "f"}           # f↔pʰ (0.8)

# 장단 중화 iː↔ɪ, uː↔ʊ, eː↔e, oː↔o (0.9)
_LENGTH_MAP = {
    "iː": "ɪ", "ɪ": "iː", "uː": "ʊ", "ʊ": "uː",
    "eː": "e", "e": "eː", "oː": "o", "o": "oː",
}

_R_SET = ("ɾ", "r", "ɹ")  # ɹ↔r↔ɾ 통합 (0.95)
_VW_SET = ("ʋ", "v", "w")  # v↔w↔ʋ 통합 (0.95)


def _map_rule(mapping: dict[str, str]) -> Callable[[list[str]], list[str] | None]:
    def apply(units: list[str]) -> list[str] | None:
        if not any(u in mapping for u in units):
            return None
        return [mapping.get(u, u) for u in units]
    return apply


def _h_drop(units: list[str]) -> list[str] | None:
    """ɦ 탈락 (0.8)."""
    if "ɦ" not in units:
        return None
    return [u for u in units if u != "ɦ"]


def _vw_merge(units: list[str]) -> list[str] | None:
    """v↔w↔ʋ 통합 (0.95): v/w → ʋ, ʋ만 있으면 → w."""
    if any(u in ("v", "w") for u in units):
        return [("ʋ" if u in ("v", "w") else u) for u in units]
    if "ʋ" in units:
        return [("w" if u == "ʋ" else u) for u in units]
    return None


def _r_merge(units: list[str]) -> list[str] | None:
    """ɹ↔r↔ɾ 통합 (0.95): ɹ/ɾ → r, r만 있으면 → ɾ."""
    if any(u in ("ɹ", "ɾ") for u in units):
        return [("r" if u in ("ɹ", "ɾ") else u) for u in units]
    if "r" in units:
        return [("ɾ" if u == "r" else u) for u in units]
    return None


def _final_schwa(units: list[str]) -> list[str] | None:
    """어말 schwa 탈락·삽입 (0.9): ə로 끝나면 탈락, 자음으로 끝나면 삽입."""
    if not units:
        return None
    last = units[-1]
    if last == "ə":
        return units[:-1]
    if last != WORD_BOUNDARY and not g2p._is_vowel_phone(last):
        return units + ["ə"]
    return None


# (label, weight, transform) — transform 은 변화 없으면 None
RULES: list[tuple[str, float, Callable[[list[str]], list[str] | None]]] = [
    ("breathy-flatten", 0.90, _map_rule(_BREATHY_MAP)),
    ("aspiration-loss", 0.85, _map_rule(_ASPIRATION_MAP)),
    ("h-drop", 0.80, _h_drop),
    ("v-w-merge", 0.95, _vw_merge),
    ("retroflex-dental", 0.80, _map_rule(_RETRO_DENTAL_MAP)),
    ("s-sh", 0.80, _map_rule(_S_SH_MAP)),
    ("z-dzh", 0.85, _map_rule(_Z_DZH_MAP)),
    ("f-ph", 0.80, _map_rule(_F_PH_MAP)),
    ("long-short", 0.90, _map_rule(_LENGTH_MAP)),
    ("final-schwa", 0.90, _final_schwa),
    ("r-merge", 0.95, _r_merge),
]

RULE_WEIGHTS = {label: w for label, w, _ in RULES}

# ---------------------------------------------------------------------------
# matcher 용 confusion weight (치환비용 = 1 - weight, CONTRACT §5)
# ---------------------------------------------------------------------------


def _build_pair_weights() -> dict[frozenset, float]:
    pairs: dict[frozenset, float] = {}

    def add(a: str, b: str, w: float) -> None:
        key = frozenset((a, b))
        if len(key) == 2:
            pairs[key] = max(pairs.get(key, 0.0), w)

    for m, w in (
        (_BREATHY_MAP, 0.90),
        (_ASPIRATION_MAP, 0.85),
        (_RETRO_DENTAL_MAP, 0.80),
        (_S_SH_MAP, 0.80),
        (_Z_DZH_MAP, 0.85),
        (_F_PH_MAP, 0.80),
        (_LENGTH_MAP, 0.90),
    ):
        for a, b in m.items():
            add(a, b, w)
    for group, w in ((_R_SET, 0.95), (_VW_SET, 0.95)):
        for a, b in combinations(group, 2):
            add(a, b, w)
    return pairs


PAIR_WEIGHTS: dict[frozenset, float] = _build_pair_weights()

# 삭제/삽입이 규칙에 해당하는 phone (matcher 가 일반 indel 0.7 대신 참조 가능)
DELETION_WEIGHTS: dict[str, float] = {"ɦ": 0.80, "ə": 0.90}


def confusable_weight(a: str, b: str) -> float | None:
    """phone 단위 a,b 가 §4 규칙쌍이면 weight, 아니면 None."""
    if a == b:
        return 1.0
    return PAIR_WEIGHTS.get(frozenset((a, b)))


# ---------------------------------------------------------------------------
# expand_variants
# ---------------------------------------------------------------------------

MAX_VARIANTS = 24


def _render(units: list[str]) -> str:
    return "".join(units)


def expand_variants(term: str, max_variants: int = MAX_VARIANTS) -> list[dict]:
    """term → 발음 변이 목록.

    반환: [{surface, ipa, kind, rule, weight}]
    - kind: "standard"(표준형) | "lexicon"(사전 대체발음) | "rule"(규칙 변이)
    - rule: 적용 규칙 라벨("+" 연결), 표준형은 None
    - weight: 규칙 weight 의 곱 (lexicon 대체는 0.95 기저)
    - 정렬: 표준형 최우선, 이후 weight 내림차순. 최대 max_variants개.
    """
    bases = g2p.term_pronunciations(term)
    if not bases:
        return []

    entries: list[dict] = []
    seen: set[str] = set()

    def add(ipa: str, kind: str, rule: str | None, weight: float) -> None:
        if ipa and ipa not in seen:
            seen.add(ipa)
            entries.append({
                "surface": term,
                "ipa": ipa,
                "kind": kind,
                "rule": rule,
                "weight": round(weight, 4),
            })

    for ipa, kind, rule, w in bases:
        add(ipa, kind, rule, w)

    for base_ipa, _kind, _rule, base_w in bases:
        base_units = g2p.tokenize_ipa(base_ipa)
        applicable = [
            (label, w, fn) for label, w, fn in RULES if fn(base_units) is not None
        ]
        for r in range(1, len(applicable) + 1):
            for combo in combinations(applicable, r):
                units: list[str] | None = base_units
                weight = base_w
                labels: list[str] = []
                for label, w, fn in combo:
                    units = fn(units)  # type: ignore[arg-type]
                    if units is None:
                        break
                    weight *= w
                    labels.append(label)
                if units is None:
                    continue
                add(_render(units), "rule", "+".join(labels), weight)

    standards = [e for e in entries if e["kind"] == "standard"]
    rest = sorted(
        (e for e in entries if e["kind"] != "standard"),
        key=lambda e: (-e["weight"], e["ipa"]),
    )
    return (standards + rest)[:max_variants]


__all__ = [
    "RULES", "RULE_WEIGHTS", "PAIR_WEIGHTS", "DELETION_WEIGHTS",
    "MAX_VARIANTS", "confusable_weight", "expand_variants",
]
