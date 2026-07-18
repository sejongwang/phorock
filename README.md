# VoxLedger Hinglish Audit — 힝글리시 음소 검색 데모

한국 보험 감사 데스크 UI 위에서 **실제 ZIPA 힌디 음소인식 + 인도식 발음 변이 검색**이 동작하는 데모.
케이스: `REG-HI-2026-017 · 힝글리시 TM 오안내 감사` (클립 14건: positive 11 + neutral 3).

## 실행

```bash
cd /Users/junehwi/indoro/voxledger-audit && /Users/junehwi/zipa-mac/zipa-env/bin/python -m uvicorn server.main:app --port 8765
```

브라우저: **http://localhost:8765**

## 데모 시나리오 (3단계)

1. **발음 변이 검색** — 검색 데스크에서 termset 칩 `개체·상품명(entity)`을 선택하고 `Coragen`을 검색한다.
   변이 패널에 G2P 확장 결과(koɾaːdʒen / koɾeːdʒen + confusion 규칙 변이, weight 포함)가 뜨고,
   히트 테이블에서 en-01 행을 클릭 → 인스펙터에서 IPA 정렬·점수바·해시를 확인하고 매칭 스팬으로 점프해 오디오를 재생한다.
   포인트: 표준 발음 1개(useVariants=false)로는 놓치던 Coragen 클립을 변이 확장이 회수한다.
2. **라이브 음소인식** — `라이브 음소인식` 탭에서 `data/clips8k/`의 wav(8kHz 전화망 시뮬)를 업로드한다.
   ZIPA가 실시간(rtf ≈ 0.12~0.18)으로 IPA 문자열과 phone 타임라인을 돌려준다.
3. **수치 소개** — REPORT.md의 결과를 언급한다: recall@3 변이 90.9% vs 베이스라인 81.8%(+1클립, Coragen 회수),
   중립 클립 오탐 0건, 8kHz 다운샘플 시 micro PER 4.4%에 recall 열화 0.

## 아키텍처 (4줄)

1. **인덱서** `server/zipa_runtime.py`+`build_index.py` — ZIPA int8 ONNX(CoreML EP, lhotse fbank80)로 클립을 phone 시퀀스+20ms 타임스탬프로 변환해 `data/index.json`(16k)·`index8k.json`(8k)에 저장.
2. **G2P/변이** `server/g2p.py`+`variants.py` — 검색어(데바나가리·영어 차용어)를 인도식 IPA로 변환하고 confusion 규칙(breathy 평탄화, retroflex↔dental, 장단 중화 등, rule·weight 라벨)으로 발음 변이를 확장.
3. **매처** `server/matcher.py` — confusion 가중 Smith-Waterman 로컬 정렬로 변이 phone 열 vs 클립 phone 열을 매칭, score·시간 스팬 산출(베이스라인 useVariants=false 모드 내장).
4. **API/UI** `server/main.py`(FastAPI :8765) — `/api/bootstrap`·`/api/search`·`/api/transcribe`·`/audio/*` 제공, `app/`(plain HTML+JS, 디자인 원본 CSS 그대로)을 정적 서빙.
