# VoxLedger Hinglish Audit — 검증 리포트

측정일: 2026-07-18 · 모델: `zipa-large-crctc-ns-800k/int8+CoreML` · 서버: zipa-env uvicorn `server.main:app` :8765
데이터: 클립 14건 (positive 11 + neutral 3), threshold 0.55, 대표 검색어 = manifest `entities[0]`.
아래 수치는 matcher 수정(fix-0 정렬키 병합, fix-1 커버리지 게이트) **이후 전체 재측정(검증4)** 이 최종값이다.
재현 스크립트: `server/tests/measure_8k.py` → `server/tests/measure_8k_result.json`.

## 1. e2e (CONTRACT §10) — 전부 PASS

| 항목 | 결과 |
|---|---|
| GET /api/bootstrap | 200, 스키마 OK (caseId=REG-HI-2026-017, termSets 3종 각 pronunciations 3개, indexMeta clips=14) |
| POST /api/search | 200, top-level 5키·HIT 30키 계약 완전 일치, groupLabel 규칙 일치, sourceHash=실제 wav sha256, 미지 termSetId→404 |
| POST /api/transcribe | 200 (wav multipart), `{ipa, phones, seconds, rtf}` OK, rtf 0.12~0.18 |
| /audio + / 정적 서빙 | /audio/*.wav 200 audio/x-wav, GET / = app/index.html byte-identical, `node --check app/app.js` 통과 |

서버 로그 예외 0건, 회귀 테스트 `server/tests/test_g2p.py`·`test_matcher.py` ALL PASSED.

## 2. Recall@3 — 변이 vs 베이스라인 (최종 재측정)

| 인덱스 | variants=on | variants=off | miss(on) | miss(off) |
|---|---|---|---|---|
| 16k (matcher) | **10/11 = 90.9%** | **9/11 = 81.8%** | ff-01(free) | ff-01(free), en-01(Coragen) |
| 16k (API 경유) | 10/11 = 90.9% | 9/11 = 81.8% | 동일 | 동일 |
| 8k (matcher) | 10/11 = 90.9% | 9/11 = 81.8% | 동일 | 동일 |

- 변이 확장의 개선폭 = **+1클립 (en-01 Coragen 회수, raw score 0.571→0.900)** — 발음 변이 검색의 핵심 주장 성립.
- matcher/API/8k 세 경로에서 수치 완전 일치, 회귀 없음.
- 참고(수정 전 검증1): 순수 phoneticScore 랭킹 기준 변이 100% vs 베이스라인 90.9%였으나, UI 표시 순서(effectiveScore 정렬)에서 72.7%로 역전되는 major 버그가 있었음 → best-variant 선택과 정렬키 불일치를 fix-0/fix-1로 수정, 위 표가 수정 후 값.

## 3. 오탐(FP) · 부정문맥

| termset | hits | neutral(nu-*) 오탐 | negationGuard |
|---|---|---|---|
| false-free | 4 (ff-01, ff-03, ff-02, ff-neg) | 0 | 1 |
| forced-bundling | 4 (cb-01, cb-02, cb-03, cb-neg) | 0 | 1 |
| entity | 4 (en-03, en-01, en-02, cb-03) | 0 | 0 |

- 중립 클립 오탐 **합계 0건** (변이 on/off 모두). 대표어×termset 9조합 개별 측정에서도 0건, 중립 최고 점수 0.5333(임계 여유 0.0167).
- negation 정확도 **4/4**: ff-neg·cb-neg `isNegated=true` + "03 · 부정문맥 / 오탐 방어" 그룹 강등, 양성 클립 오플래그 0건. 전체 히트 플래그 정확도 19/19.

## 4. 8kHz 열화 곡선 (전화망 시뮬, 참조 = 16k index phones)

| clip | PER(raw) | PER(merged) | clip | PER(raw) | PER(merged) |
|---|---|---|---|---|---|
| ff-01 | 2.4% | 2.9% | cb-neg | 2.6% | 3.0% |
| ff-02 | 1.9% | 2.6% | en-01 | 6.4% | 7.9% |
| ff-03 | 3.8% | 5.0% | en-02 | **10.0%** | **10.5%** |
| ff-neg | 2.4% | 3.0% | en-03 | 0.0% | 0.0% |
| cb-01 | 4.3% | 5.4% | nu-01 | 11.5% | 11.1% |
| cb-02 | 5.9% | 6.8% | nu-02 | 8.3% | 16.7% |
| cb-03 | 1.8% | 2.3% | nu-03 | 5.7% | 4.0% |

- **micro PER: raw 27/609 = 4.4%, merged 25/473 = 5.3%.** 콘텐츠 클립 최악은 en-02(Bavistin) 10%.
- **recall@3 열화 0**: 8k에서도 16k와 동일(변이 90.9% / 베이스라인 81.8%), 변이 on/off 차이도 동일 재현 — 변이 검색 데모는 8k에서 유지.
- score 델타(변이 on, 대표어 self-hit): 변동 없음 9/11, cb-02 +0.100, en-02 −0.050(0.575, 임계 여유 0.025). worst −0.05.

## 5. 알려진 한계

| severity | 내용 |
|---|---|
| major→수정됨 | UI 표시 순서에서 변이 recall이 베이스라인보다 낮아지던 정렬키 불일치(matcher best-variant는 raw score, API 정렬은 effectiveScore) — fix-0/fix-1로 해소, §2 표는 수정 후 재측정값 |
| minor | 교차 termset 유입 1건: cb-03(loan/insurance)이 entity 검색에 히트 — 그룹 "02 · 추가 문맥 필요" 강등으로 방어됨 |
| minor | ff-01("free")이 커버리지 게이트 도입 후 양 모드에서 top-3 밖 — threshold 0.55 기준 회수 실패 (수정 전에는 변이 모드가 회수) |
| minor | en-02 8k 점수 0.575로 threshold 0.55 대비 여유 0.025 — 실제 전화망 노이즈가 더해지면 탈락 위험 |
| 전제 | 오디오가 TTS(say -v Lekha) 클린 음성 — 실제 콜센터 녹취(잡음·화자 변이·코덱)에서의 PER/recall은 미측정. 8k 결과는 다운샘플 시뮬 기준 |
| 전제 | 데이터 규모 14클립(positive 11)로 통계적 신뢰구간이 넓음. 대표 검색어 1개/클립 기준 측정 |
