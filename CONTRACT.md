# VoxLedger Hinglish Audit — 구현 계약 (모든 에이전트 필독)

미션: `design/VoxLedger Audio Audit.dc.html`(한국 보험 감사 데스크, 시뮬레이션 데이터)을
**실제 힝글리시 음소인식 + 발음 변이 검색**이 동작하는 데모 제품으로 전환한다.
데모 포인트 2개: ① ZIPA 힌디 음소인식이 실제로 돈다 ② 검색어의 인도식 발음 변이(G2P→IPA→confusion)로 오디오를 찾는다.

루트: `VOX = /Users/junehwi/indoro/voxledger-audit`
모든 경로는 절대경로 사용. 다른 에이전트 소유 파일은 수정 금지.

## 1. 디렉터리 & 소유권

```
VOX/
  design/            # 읽기 전용 참조 (디자인 원본). NOTES.md만 design-audit 에이전트가 추가
  app/               # frontend 에이전트 소유: index.html, app.js, *.css(디자인에서 복사)
  server/            # 백엔드: zipa_runtime.py+build_index.py(indexer), g2p.py+variants.py(g2p),
                     #        matcher.py(matcher), main.py(api), tests/(각자 자기 테스트)
  data/
    clips/           # clips 에이전트: {id}.wav (16kHz mono PCM16)
    clips8k/         # clips 에이전트: {id}.wav (8kHz 전화망 시뮬)
    manifest.json    # clips 에이전트
    termsets.json    # termsets 에이전트
    index.json       # build_index.py 산출 (16k)
    index8k.json     # build_index.py 산출 (8k)
  CONTRACT.md        # 본 문서 (수정 금지)
  README.md, REPORT.md  # report 에이전트
```

## 2. ZIPA 런타임 — 이 세션에서 실측 검증된 사실 (변경 금지)

- 모델: `/Users/junehwi/zipa-mac/zipa_model/model.int8.onnx`, 토큰: 같은 폴더 `tokens.txt` (127개, blank=0, `▁`=3)
- Python: `/Users/junehwi/zipa-mac/zipa-env/bin/python` (torch·torchaudio·onnxruntime·lhotse·soundfile 설치됨)
- **CoreMLExecutionProvider 필수.** CPU EP는 이 Mac(arm64)에서 int8 그래프를 오실행해 전부 blank가 나온다(실측). providers=["CoreMLExecutionProvider","CPUExecutionProvider"] 순서 고정.
- **특징 추출은 lhotse만**: `Fbank(FbankConfig(num_filters=80, dither=0.0, snip_edges=False))`.
  `torchaudio.compliance.kaldi.fbank` 사용 금지(mel 필터 차이로 전부 blank — 실측).
- 오디오 로드: `soundfile.read` (torchaudio.load는 torchcodec 요구로 사용 불가). 다채널이면 첫 채널.
  sr≠16000이면 `torchaudio.functional.resample`. 16000 샘플(1초) 미만이면 zero-pad(CoreML 크래시 방지).
- 검증된 레퍼런스 구현: `/Users/junehwi/zipa-mac/mac_infer_zipa.py` — 이 파일을 복사·확장할 것.
- 셀프체크: `/Users/junehwi/zipa-mac/672-122797-0000-0.flac` → IPA `aʊtɪnðəwʊdstʊdənaɪslɪtəlfə˞tɹi` (byte-identical해야 정상).
- 출력: `log_probs (1,T',127)`, T'=(T−7)//2, **프레임당 20ms**. ORT 경고 무음화: `so.log_severity_level=3`.

### 타임스탬프 규약 (zipa_runtime.py)
프레임별 argmax id 시퀀스에서 같은 non-blank id의 연속 run 하나 = phone 하나.
`t0 = first_frame*0.02`, `t1 = (last_frame+1)*0.02` (초). blank run은 버림. `▁`(id 3)는 wordBoundary로 보존.

## 3. index.json 스키마

```json
{ "modelVersion": "zipa-large-crctc-ns-800k/int8+CoreML",
  "featureConfig": "lhotse-fbank80-dither0-snipedges-false",
  "clips": [ { "id": "ff-01", "file": "data/clips/ff-01.wav", "sha256": "<원본 wav 실제 해시>",
      "truth": "यह प्लान बिल्कुल free है…", "entities": ["free","premium"],
      "termSetId": "false-free", "isNegated": false, "duration": 4.2,
      "ipa": "jəɦ plaːn …", "phones": [{"s":"j","t0":0.24,"t1":0.30}, …] } ] }
```

## 4. G2P & 변이 규칙 (server/g2p.py, server/variants.py)

- 데바나가리→IPA: 규칙표 기반(데바나가리는 준음소문자). 어말 schwa 탈락 반영.
- 영어 차용어→인도식 IPA: 소사전(lexicon dict) 우선 + 잔여는 문자 규칙.
  필수 lexicon: free→friː, premium→priːmijəm, policy→pɒliːsiː/paːlisiː, approval→əpruːʋəl,
  compulsory→kəmpəlsəriː, optional→ɒpʃənəl, extra→ekstɾaː, charge→tʃaːɾdʒ, cover→kəʋəɾ,
  loan→loːn, insurance→ɪnʃoːɾens, spray→spɾeː, powder→paːʋɖəɾ, Coragen→koɾaːdʒen/koɾeːdʒen,
  Bavistin→baːʋɪsʈiːn, Chaudhary→tʃɔːd̪ʱəɾiː/tʃɔːd̪əɾiː, Bharat→bʱaːɾət̪/baːɾət̪
- 변이 규칙(rule 라벨·weight 포함, 이 세션 실측 + 문헌):
  breathy 평탄화 bʱ→b, dʱ→d, ɡʱ→ɡ (w=0.9, 실측: ZIPA가 자주 평탄화) /
  기식 소실 kʰ→k, pʰ→p, t̪ʰ→t̪, ʈʰ→ʈ (0.85) / ɦ 탈락 (0.8) / v↔w↔ʋ 통합 (0.95) /
  retroflex↔dental ʈ↔t̪, ɖ↔d̪ (0.8) / s↔ʃ (0.8) / z→dʒ→z (0.85) / f↔pʰ (0.8) /
  장단 중화 iː↔ɪ, uː↔ʊ, eː↔e, oː↔o (0.9) / 어말 schwa 탈락·삽입 (0.9) / ɹ↔r↔ɾ 통합 (0.95)
- `expand_variants(term) -> [{surface, ipa, kind, rule, weight}]` : 표준형 1 + 규칙 조합 변이 (상한 ~24개, weight 곱).

## 5. matcher.py

- confusion 가중 로컬 정렬(Smith-Waterman 유사): 변이 phone 열 vs 클립 phone 열.
  치환비용 = 위 규칙쌍이면 (1-weight), 아니면 1. 삽입/삭제 0.7. `▁` 무시.
- score = 1 − (best_cost / query_len), 스팬 = 매칭 구간 phones의 t0~t1.
- **`use_variants=False` 베이스라인 모드 필수**(표준 발음 1개만) — recall A/B 측정용.
- context score: manifest truth 텍스트에 termset contextTerms 등장 비율(단순). negation: negativeTerms 등장 시 isNegated=true.

## 6. API (server/main.py, FastAPI, port 8765, zipa-env python으로 구동)

- `GET /api/bootstrap` → `{caseId, termSets:[termsets.json 그대로 + pronunciations: expand_variants(대표어) 상위 3], indexMeta:{clips, modelVersion}}`
- `POST /api/search` `{termSetId, text?, threshold=0.55, useVariants=true}` →
  `{variants:[…], hits:[HIT…], runId, totalCandidateEstimate, negationGuardCount}`
- `POST /api/transcribe` (multipart `file`) → `{ipa, phones, seconds, rtf}` — 라이브 데모용
- `GET /audio/{clipId}.wav`, `GET /` → app/index.html (정적 서빙 app/, StaticFiles)

### HIT 객체 — 디자인 BASE_HITS와 키 동일 (UI 결선을 기계적으로 만들기 위함)
`id, callId(=REG-HI-<clipId>), issueCode(=termSetId), insurer(→거점 라벨 임의), channel, sellerCode,
callDate, matchAt("m:ss"), spanStart, spanEnd, duration, matchedText(truth 부분), transcript(truth),
pronunciation("[<매칭 변이 ipa>]"), phoneAlignment(매칭 스팬 IPA), searchTerms, pronunciationFamily,
phoneticScore, effectivePhoneticScore, contextScore, evidenceCompleteness(0.9 고정+노이즈),
proximitySeconds, isNegated, hasMetadataConflict(false), groupLabel, sourceSystem,
sourceHash(실제 sha256), expectedHash(동일), audioUrl("/audio/<clipId>.wav"), reviewStatus("미검토")`
groupLabel 규칙은 디자인 runSimulatedSearch와 동일: isNegated→"03 · 부정문맥 / 오탐 방어",
context≥0.8&complete≥0.85→"01 · 우선 검토", else "02 · 추가 문맥 필요".

## 7. 클립 (clips 에이전트, macOS `say -v Lekha`)

생성: `say -v Lekha "<문장>" --data-format=LEI16@16000 -o data/clips/<id>.wav`
8k: `afconvert data/clips/<id>.wav data/clips8k/<id>.wav -d LEI16@8000 -f WAVE -c 1`
Lekha 미설치 시 `say -v '?' | grep hi_IN`로 첫 힌디 보이스 사용.

| id | termSet | isNeg | 문장 |
|---|---|---|---|
| ff-01 | false-free | n | यह प्लान बिल्कुल free है, premium नहीं लगेगा |
| ff-02 | false-free | n | इसमें कोई extra charge नहीं है, सब कुछ free में मिलेगा |
| ff-03 | false-free | n | पहले साल premium नहीं लगेगा, दूसरे साल से लगेगा |
| ff-neg | false-free | y | यह free नहीं है, हर महीने premium लगेगा |
| cb-01 | forced-bundling | n | approval के लिए health cover साथ में लेना पड़ेगा |
| cb-02 | forced-bundling | n | यह rider compulsory है, इसके बिना policy नहीं मिलेगी |
| cb-03 | forced-bundling | n | loan के साथ insurance लेना पड़ेगा, तभी approval मिलेगा |
| cb-neg | forced-bundling | y | यह compulsory नहीं है, बिल्कुल optional है |
| en-01 | entity | n | Coragen को दस लीटर पानी में मिलाकर spray कीजिए |
| en-02 | entity | n | Bavistin powder एक चम्मच प्रति लीटर डालिए |
| en-03 | entity | n | मेरा नाम Chaudhary है, मैं Bharat से बोल रहा हूँ |
| nu-01 | — | n | आज मौसम बहुत अच्छा है |
| nu-02 | — | n | कल बाज़ार बंद रहेगा |
| nu-03 | — | n | खेत में पानी देना बहुत ज़रूरी है |

manifest.json: `[{id, file, file8k, truth, entities, termSetId, isNegated, saidVoice}]`
entities: 문장 속 검색 대상 단어(위 lexicon 항목 기준).

## 8. termsets.json (termsets 에이전트) — 디자인 TERM_SETS shape 유지

3세트: `false-free`(무료 오인 안내: "bilkul free","premium nahi lagega","extra charge nahi"),
`forced-bundling`(강제 연계: "saath mein lena padega","compulsory hai","approval nahi milega"),
`entity`(개체·상품명: "Coragen","Bavistin","Chaudhary").
각각 name/hypothesis/description 한국어, searchTerms는 라틴 표기, contextTerms·negativeTerms 힌디/영 혼용.
pronunciations는 빈 배열(런타임에 API가 채움).

## 9. Frontend (app/)

- `design/VoxLedger Audio Audit.dc.html`의 variant A(검색 데스크) 구조를 **plain HTML+JS**로 재현.
  dc-runtime/React 제거, 같은 클래스·같은 `design/astryx.css`+`design/korea-audit.css` 복사 사용(각각 app/으로 복사).
- 모듈 nav: [검색 데스크(실동작)] [라이브 음소인식(신규: wav 업로드→/api/transcribe→IPA·phone 타임라인 표시)] [커버리지(디자인 정적 데이터 유지)]
- 검색 흐름: bootstrap→termset 칩·변이 패널 렌더 → 검색 실행(/api/search) → 그룹별 히트 테이블 → 행 클릭 → 인스펙터(오디오 `<audio src=/audio/…>` 재생 + `currentTime=t0` 점프 버튼, IPA 정렬, 점수바, 해시).
- 케이스 헤더: `REG-HI-2026-017 · 힝글리시 TM 오안내 감사`. 한국어 UI 라벨 유지.
- fetch 실패 시 상단에 "서버 미기동: `zipa-env/bin/python -m uvicorn server.main:app --port 8765`" 안내 배너.

## 10. 검증 기준 (verify 에이전트들)

- e2e: 서버 기동→bootstrap/search/transcribe 3 API 200 + 스키마 일치, /audio 서빙, app.js `node --check` 통과.
- recall: 각 positive 클립의 대표 검색어로 search 실행 — useVariants=true가 해당 클립을 top-3에 올리는 비율 vs useVariants=false 베이스라인. 표로 보고.
- false-positive: neutral(nu-*) 클립이 threshold 0.55 위로 올라오는 건수, negation 클립의 isNegated 플래그 정확성.
- 8kHz: index8k vs index16k 클립별 PER(편집거리/참조길이)와 8k 인덱스 recall — "열화 곡선" 첫 숫자.
- 발견 사항은 severity(critical/major/minor)로 구조화 보고. critical = 데모 흐름이 깨지는 것.
```
