# design/NOTES.md — variant A(검색 데스크) 구조 분석 (design-audit)

원본: `design/VoxLedger Audio Audit.dc.html` (1335줄) + `design/korea-audit.css` + `design/korea-audit-data.js`
스타일 기반: `design/astryx.css` (atomic `x*` 클래스 + `astryx-*` 컴포넌트 클래스), 테마는 루트의 `data-astryx-theme="stone"` `data-astryx-media="light"`.

## 1. Variant A DOM 아웃라인

```
.ka-root.ka-variant-a [data-astryx-theme=stone][data-astryx-media=light]
└ .astryx-layout (fill)
  └ (x-default-marker 래퍼 div — atomic 클래스만)
    ├ header[role=banner].astryx-layout-header
    │ └ div (padding: var(--spacing-3))
    │   ├ .ka-header-primary
    │   │ ├ .ka-brand  — .ka-brand-mark(svg) + "VoxLedger / 감독 조사 데스크"
    │   │ ├ .ka-breadcrumb — 민영 건강보험 › REG-HI-2026-017 › {활성 variant 제목}
    │   │ └ .ka-header-actions — .ka-environment-badge("검증 데이터") + .ka-statusdot-labeled(.astryx-statusdot)
    │   └ .ka-search-toolbar
    │     ├ nav.ka-module-nav — 모듈 버튼 3개(검색/커버리지/사건철), 활성=.is-active
    │     ├ .ka-issue-switch — 조사 유형(termset) 버튼, 활성=.is-active
    │     └ .ka-power-search > .astryx-power-search > .astryx-field > .astryx-tokenizer[data-size=md]
    │       ├ .ka-ps-start-icon (돋보기 svg)
    │       ├ input[type=text] (검색어, placeholder "예: 같이 가입, …")
    │       ├ .ka-ps-result-count ("N건 화면 후보")
    │       └ .ka-ps-end > button.astryx-button.primary.sm "검색 실행"
    └ .ka-layout-body
      ├ ① 좌측 발음변이 패널: div[role=navigation].astryx-layout-panel.ka-pronunciation-panel (312px 고정, overflow-y:auto)
      │ ├ section.ka-side-section「조사 유형」 — .ka-section-heading(라벨+가설 badge) + h2(hypothesis)
      │ ├ section.ka-side-section「검색 용어」 — .ka-term-chips(칩 버튼, 활성=.is-active)
      │ │   + .ka-context-logic(포함 문맥 / 제외 문맥)
      │ ├ section.ka-side-section「등록 발음」 — .ka-pronunciation-list > article*N
      │ │   { strong surface + kind badge, p pronunciation,
      │ │     details.ka-pronunciation-details > summary/code(phoneTokens)/footer(rule·가중치) }
      │ │   + (조건부) .ka-example-note "등록 발음 N개 추가"
      │ └ section.ka-side-section「검색 조합」
      │     ├ .ka-logic-row — AND/OR 버튼 + checkbox "부정 문맥 제외"
      │     ├ label.ka-slider "시간 근접 조건" input[range 2–5]
      │     ├ label.ka-slider "발음 유사도" input[range 0.55–0.95 step .01]
      │     └ .ka-load-preview — 현재 후보 / 전체 후보(compact)
      ├ ② 중앙 히트 테이블: .ka-layout-main > main.astryx-layout-content.ka-results-content (padding:0)
      │ ├ .ka-results-summary — "검색 실행" runId + .ka-result-kpis
      │ │   (전체 후보 추정 / 예상 검토량 Nh / 부정문맥 방어 N)
      │ ├ .ka-table-frame
      │ │ ├ (결과 있음) .astryx-table-scroll-wrapper > table.astryx-base-table.astryx-table.ka-results-table
      │ │ │ ├ thead 컬럼 6개:
      │ │ │ │   검출 시점(86px) · 검출 발화(min 176px) · 발음 점수(84px, .ka-cell-end)
      │ │ │ │   · 주변 문맥(78px, .ka-cell-end) · 증거 완전성(88px, .ka-cell-end) · 검토 상태(96px)
      │ │ │ └ tbody: 그룹행 tr.ka-group-row (colspan=6, .ka-group-label = .ka-group-caret + 그룹 badge + "N건",
      │ │ │            접힘=.is-collapsed, 클릭 토글)
      │ │ │          히트행 tr.ka-result-row (선택=.is-selected, tabindex=0, Enter/Space 선택)
      │ │ │            td1 .ka-table-primary (matchAt + callId 축약 '#…')
      │ │ │            td2 .ka-table-phrase (matchedText + pronunciation)
      │ │ │            td3 strong.ka-numeric (effectivePhoneticScore %)
      │ │ │            td4 span (contextScore %, 부정문맥이면 .ka-score-low)
      │ │ │            td5 (evidenceCompleteness %)
      │ │ │            td6 판정 badge (미검토/관련 후보/…)
      │ │ └ (결과 없음) .ka-empty-state
      │ └ footer.ka-table-footer — generatedAt + "용어집 KO-INS-0.3 · 음성 인덱스 SIM-KO-PHONE-0.2"
      ├ ③ button.ka-resize-handle — 인스펙터 폭 드래그(320–480px)
      └ ④ 우측 인스펙터: div[role=complementary].astryx-layout-panel.ka-inspector (--x-width/width = state px)
        ├ (미선택) .ka-inspector-empty
        └ (선택 히트)
          ├ .ka-inspector-heading — "선택 증거" + h2 callId + issue badge
          ├ (hash-mismatch 시나리오 한정) .astryx-banner.card.warning "내보내기 차단 / SHA-256 불일치"
          ├ .astryx-card.ka-audio-card
          │   .ka-audio-title(hitSpanText + duration badge)
          │   .ka-waveform(span*46 랜덤 높이 + i.ka-waveform-cursor + 조건부 .ka-redaction-span,
          │               리댁션 시 .is-redacted)
          │   audio[controls][src=hit.audioUrl]
          ├ section.ka-transcript — "검출 문맥" + blockquote(transcript) + code(phoneAlignment) + 부정문맥 badge
          ├ section.ka-score-stack — .ka-score*3
          │   음소 유사도(.ka-score-track.is-accent) / 주변 문맥(is-warning|is-success) / 증거 완전성(is-success)
          │   ※ korea-audit.css에는 .is-warning/.is-success만 정의, is-accent는 기본색으로 폴백
          ├ dl.ka-fact-list — 보험사/채널 · 상담원 코드 · 원천(sourceSystem) · SHA-256(.ka-hash 축약)
          ├ section.ka-review-actions — "조사관 판정" 버튼 4개(sm):
          │   관련 후보 / 무관 / 추가 문맥 필요 / 증거 사용 불가 (선택=primary, 나머지 secondary)
          └ .ka-inspector-actions — "이 구간을 발음 예시로 추가"(secondary, 등록 후 disabled)
              · "오탐 예시로 제외"(ghost) · "리댁션 범위 지정/해제"(ghost)
```

### 인스펙터 표시 필드 목록 (HIT 키 매핑)
callId · issueCode(→badge 라벨) · spanStart–spanEnd(hitSpanText) · duration · audioUrl ·
transcript · phoneAlignment · pronunciation · isNegated(→badge) ·
effectivePhoneticScore · contextScore · evidenceCompleteness (3개 점수바) ·
insurer+channel · sellerCode · sourceSystem · sourceHash(12자…8자 축약) ·
proximitySeconds(variant C 태그에서 사용) · pronunciationFamily(예시 추가 버튼 상태) · reviewStatus/판정.

## 2. 영역별 핵심 CSS 클래스

- 루트/레이아웃: `ka-root`, `ka-variant-a`, `ka-layout-body`, `ka-layout-main`,
  `astryx-layout`, `astryx-layout-header`, `astryx-layout-panel`, `astryx-layout-content`
- 헤더: `ka-header-primary`, `ka-brand`, `ka-brand-mark`, `ka-breadcrumb`, `ka-header-actions`,
  `ka-environment-badge`, `ka-statusdot-labeled`, `astryx-statusdot`
- 툴바/검색: `ka-search-toolbar`, `ka-module-nav`, `ka-issue-switch`, `ka-power-search`,
  `ka-ps-start-icon`, `ka-ps-result-count`, `ka-ps-end`,
  `astryx-power-search`, `astryx-field`, `astryx-tokenizer`, `astryx-button`(primary|secondary|ghost × sm|md)
- 좌측 패널: `ka-pronunciation-panel`, `ka-side-section`, `ka-section-heading`, `ka-term-chips`,
  `ka-context-logic`, `ka-pronunciation-list`, `ka-pronunciation-details`, `ka-example-note`,
  `ka-logic-row`, `ka-slider`, `ka-load-preview`, `astryx-badge`(variant별)
- 결과 테이블: `ka-results-content`, `ka-results-summary`, `ka-result-kpis`, `ka-table-frame`,
  `ka-results-table`, `ka-group-row`, `ka-group-label`, `ka-group-caret`, `ka-result-row`,
  `ka-table-primary`, `ka-table-phrase`, `ka-cell-end`, `ka-numeric`, `ka-score-low`,
  `ka-empty-state`, `ka-table-footer`,
  `astryx-table-scroll-wrapper`, `astryx-base-table`, `astryx-table`, `astryx-table-header(-cell)`,
  `astryx-table-body`, `astryx-table-row`, `astryx-table-cell`
- 인스펙터: `ka-inspector`, `ka-inspector-empty`, `ka-inspector-heading`, `ka-audio-card`,
  `ka-audio-title`, `ka-waveform`, `ka-waveform-cursor`, `ka-redaction-span`, `ka-transcript`,
  `ka-score-stack`, `ka-score`, `ka-score-label`, `ka-score-track`, `ka-fact-list`, `ka-hash`,
  `ka-review-actions`, `ka-inspector-actions`, `ka-resize-handle`,
  `astryx-card`, `astryx-banner(-icon)`, `astryx-icon`
- 상태 수식자: `is-active`, `is-selected`, `is-collapsed`, `is-redacted`, `is-dragging`,
  `is-warning`, `is-success`(점수바), `is-complete`/`is-blocked`(B·C), `is-purple/orange/green`(B 분포바)
- 주의: `astryx-badge`·`astryx-button`·`astryx-statusdot`은 시맨틱 클래스만으로는 색이 완성되지 않고
  variant별 atomic 클래스 쌍이 필요 — dc 스크립트의 `badgeCls()`/`btnCls()`/`btnClsDisabled()`/`dotCls()`에
  variant→atomic 매핑 테이블이 있으므로 **app.js에 그대로 이식할 것**
  (예: badge info=`x1ewilqj x17wrial`, success=`xdsz4j9 xri61p4`, error=`x1pjz0fi x1m024r3` …).

## 3. BASE_HITS 키 vs CONTRACT §6 HIT 키 diff

BASE_HITS(korea-audit-data.js, 8건 모두 동일 shape) 키 30개:

```
id, callId, issueCode, insurer, channel, sellerCode,
callDate, matchAt, spanStart, spanEnd, duration,
matchedText, transcript, pronunciation, phoneAlignment,
searchTerms, pronunciationFamily,
phoneticScore, effectivePhoneticScore, contextScore, evidenceCompleteness,
proximitySeconds, isNegated, hasMetadataConflict,
groupLabel, sourceSystem, sourceHash, expectedHash, audioUrl, reviewStatus
```

**키 집합 diff: 없음.** CONTRACT §6의 HIT 키 30개와 1:1 동일하다 (누락·추가 키 0).

값 규약 차이(키는 같고 포맷만 다름 — API 구현 시 CONTRACT 쪽을 따를 것):
- `callId`: 디자인 `KHI-2026-000184` → 계약 `REG-HI-<clipId>` (테이블의 callShort는 `replace('KHI-2026-','#')` — 접두어 치환 로직 조정 필요)
- `issueCode`: 디자인 `conditional-bundling|false-free` → 계약 termSetId `false-free|forced-bundling|entity`
  (dc의 `issueLabel()`·`hypoBadgeVariant`가 'conditional-bundling' 문자열을 하드코딩 — termset 데이터 기반으로 일반화 필요)
- `audioUrl`: 디자인 상대경로 `audio/korea-audit/reg-hi-001.wav` → 계약 절대경로 `/audio/<clipId>.wav`
- `spanStart/spanEnd`: 디자인은 "mm:ss" 문자열 — 계약도 문자열 유지하되 재생 점프(currentTime=t0)용 초 값은 별도 계산 필요
- `effectivePhoneticScore`·`groupLabel`: 디자인에서는 `runSimulatedSearch`가 매 검색마다 재계산해 덮어씀
  (groupLabel 규칙: isNegated→"03", contextScore≥0.8 && evidenceCompleteness≥0.85→"01", else "02" — 계약 §6과 동일)

참고 — HIT 외 데이터 shape: `TERM_SETS[].{id,name,hypothesis,description,searchTerms,contextTerms,negativeTerms,pronunciations[]}`,
pronunciation 항목 `{id,surface,pronunciation,phoneTokens,kind,rule,weight}` (§8 termsets + bootstrap의 pronunciations 채움 기준),
`runSimulatedSearch` 반환 `{runId,query,results,totalCandidateEstimate,estimatedReviewHours,negationGuardCount,generatedAt}` (§5·§6 대응).

## 4. dc-runtime → plain HTML 변환 시 제거·치환 패턴

제거:
1. `<script src="./support.js"></script>` — dc 런타임 로더. 제거.
2. `<x-dc>` 래퍼 — 제거(내용물만 body로).
3. `<helmet>` — 실제 `<head>`로 이동(구글폰트 link, astryx.css, korea-audit.css, 인라인 base 스타일 유지).
4. `<script type="text/x-dc" data-dc-script data-props="…">` + `class Component extends DCLogic` React 컴포넌트 —
   전부 제거하고 plain JS(app.js)로 재작성. `data-props`(colorTheme/colorMode/proofScenario)는 상수로 고정.
5. `hint-placeholder-count=` / `hint-placeholder-val=` 속성 — dc 미리보기 힌트. 제거.
6. `ref="{{ rootRef }}"` — React ref. 제거(필요 시 id로 대체).
7. variant B·C 블록(`sc-if isB/isC`) 중 실동작 대상 아닌 부분 — 계약 §9에 따라
   커버리지(B)는 정적 데이터 유지, C(사건철)는 모듈 nav 구성에 없음(검색/라이브 음소인식/커버리지) → C 블록 제거 가능.

치환:
8. `{{ expr }}` 텍스트·속성 보간 (약 200곳) — 정적 골격 + JS 렌더 함수로 치환.
   특히 속성 위치: `class="{{ … }}"`, `value="{{ draftText }}"`, `src="{{ hitAudioUrl }}"`,
   `style="--x-width: {{ inspectorWidthPx }}; width: {{ … }}"`, `style="height: {{ bar.height }};"`,
   `aria-selected="{{ row.isSelected }}"`, `data-variant="{{ … }}"`.
9. `<sc-for list="{{ xs }}" as="item">…</sc-for>` — 반복 렌더. JS에서 배열 map→innerHTML 또는 `<template>`+cloneNode로 치환.
   대상: moduleNav, issueSwitch, termChips, pronunciations, boolButtons, tableRows, waveBars(46개), decisionButtonsSm/Md 등.
10. `<sc-if value="{{ cond }}">…</sc-if>` — 조건 렌더. `hidden` 속성 토글 또는 조건부 렌더 함수로 치환.
    대상: isA/isB/isC(모듈 전환), hasResults/noResults, hasHit/noHit, showHashBanner, redactionPreviewed,
    hasExampleNote, row.isGroup/row.isHit 등.
11. React 카멜케이스 이벤트 속성 `onClick=`/`onChange=`/`onKeyDown=`/`onMouseDown=` (핸들러가 `{{ … }}` 보간) —
    `addEventListener` 또는 소문자 인라인 핸들러로 치환. (특히 `onMouseDown="{{ onResizeStart }}"` 리사이즈 드래그,
    input의 `onChange`는 plain에서는 `input` 이벤트가 UX상 맞음.)
12. React식 boolean 속성 `checked="{{ … }}"` `disabled="{{ … }}"` — JS에서 프로퍼티로 설정
    (문자열 속성으로 두면 "false"도 truthy가 되므로 주의).
13. `import('./korea-audit-data.js')`(componentDidMount 내 동적 import) —
    `/api/bootstrap`·`/api/search` fetch로 치환. `runSimulatedSearch`/`createEvidencePacket` 클라이언트 로직은 서버 응답으로 대체.
14. dc 스크립트 내 유틸은 이식 대상: `pct()`, `badgeCls()`, `btnCls()`, `btnClsDisabled()`, `dotCls()`,
    `decisionVariant()`, `groupVariant()`, 그룹 정렬 순서 `['01 · 우선 검토','02 · 추가 문맥 필요','03 · 부정문맥 / 오탐 방어']`,
    리사이즈 로직(min 320 / max 480), Intl.NumberFormat('ko-KR') full/compact 포매터.

유지(치환 불필요):
- atomic `x*` 클래스 문자열 전부(astryx.css가 스타일 소유), `data-astryx-theme`/`data-astryx-media`,
  `data-variant`/`data-size`/`data-divider`/`data-screen-label` 속성, lucide 인라인 svg,
  ARIA(role/aria-label/tabindex) 구조.
