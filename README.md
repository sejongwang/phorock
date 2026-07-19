# VoxLedger Hinglish Audit — 힝글리시 음소 검색 데모

한국 보험 감사 데스크 UI 위에서 **실제 ZIPA 힌디 음소인식 + 인도식 발음 변이 검색**이 동작하는 데모.
케이스: `REG-HI-2026-017 · 힝글리시 TM 오안내 감사` (클립 14건: positive 11 + neutral 3).

## 사전 준비 (1회)

ZIPA 모델(310MB)은 레포에 포함되지 않습니다. `~/zipa-mac`에 모델·가상환경을 준비합니다:

```bash
python3 -m venv ~/zipa-mac/zipa-env && source ~/zipa-mac/zipa-env/bin/activate
pip install torch torchaudio onnxruntime lhotse soundfile numpy fastapi uvicorn python-multipart huggingface_hub
hf download anyspeech/zipa-large-crctc-ns-800k model.int8.onnx tokens.txt --local-dir ~/zipa-mac/zipa_model
```

주의(Apple Silicon 실측): 추론은 **CoreML EP** 필수(CPU EP는 int8 오실행), 특징 추출은 **lhotse fbank**만
(`torchaudio.compliance.kaldi` 사용 금지) — 상세는 `CONTRACT.md` §2.

## 실행

```bash
cd <repo-root> && ~/zipa-mac/zipa-env/bin/python -m uvicorn server.main:app --port 8765
```

브라우저: **http://localhost:8765**

## 정적 데모 — GitHub Pages 폴백 (서버·모델 불필요)

발표장에서 노트북을 못 쓸 때를 위한 스냅샷 번들. 화면에 뜨는 검색 결과·IPA 정렬·
음소 타임라인은 전부 **실제 ZIPA 출력의 사전 계산본**이다 (가짜 데이터 아님).

```bash
# 서버 켠 상태에서 재생성 → docs/
python3 mock/build_mock.py
```

배포: GitHub → Settings → Pages → Source `main` 브랜치 `/docs` 폴더
→ https://sejongwang.github.io/phorock/

- `docs/index.html` = `app/` 원본 + `mock-data.js`(스냅샷) + `mock-shim.js`(fetch 인터셉트) 주입 — `app.js` 는 무수정
- 유사도 슬라이더는 0.55 스냅샷을 클라이언트 필터로 재현 (서버 threshold 동작과 동치)
- 제한: 스냅샷에 없는 자유 검색어는 "결과 없음"

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

## 모델 출처 · 라이선스

음소인식은 **ZIPA** ([lingjzhu/zipa](https://github.com/lingjzhu/zipa), MIT · Zhu et al., ACL 2025)의
[`anyspeech/zipa-large-crctc-ns-800k`](https://huggingface.co/anyspeech/zipa-large-crctc-ns-800k) int8 ONNX를 사용합니다.
전체 서드파티 고지·BibTeX 인용은 [THIRD_PARTY.md](THIRD_PARTY.md) 참고.
