/* VoxLedger Hinglish Audit — frontend (plain JS, CONTRACT §9)
 * 데이터 소스: GET /api/bootstrap · POST /api/search · POST /api/transcribe (CONTRACT §6)
 * v2: 민원 감사 데스크 재구성 — 키워드 칩 / 상담일자 그룹 / 관련근거 수집 / 전폭 파형 플레이어
 * 파형 피크는 audioUrl fetch 디코드, 음소 스트립은 서버 phoneTimeline(전구간 ZIPA 실측) 사용.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utilities
  var fullFmt = new Intl.NumberFormat('ko-KR');
  var compactFmt = new Intl.NumberFormat('ko-KR', { notation: 'compact' });

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pct(v) { return Math.round((Number(v) || 0) * 100) + '%'; }

  function toSeconds(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v).trim();
    if (s.indexOf(':') !== -1) {
      var parts = s.split(':');
      var acc = 0;
      for (var i = 0; i < parts.length; i++) {
        var n = parseFloat(parts[i]);
        if (isNaN(n)) return 0;
        acc = acc * 60 + n;
      }
      return acc;
    }
    var f = parseFloat(s);
    return isNaN(f) ? 0 : f;
  }

  function fmtClock(sec) {
    var s = Math.max(0, Number(sec) || 0);
    var m = Math.floor(s / 60);
    var r = Math.floor(s - m * 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function fmtClock1(sec) { // 초 단위 소수 1자리 (짧은 클립용)
    var s = Math.max(0, Number(sec) || 0);
    var m = Math.floor(s / 60);
    var r = (s - m * 60).toFixed(1);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function shortDT(callDate) { // "2026-06-23 15:24" → "06.23 15:24"
    var m = String(callDate || '').match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    return m ? m[1] + '.' + m[2] + ' ' + m[3] : String(callDate || '—');
  }

  function nowKst() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ' KST';
  }

  // ------------------------------------------- astryx class builders (디자인 이식)
  function badgeCls(variant) {
    var PAIR = {
      neutral: 'x17x4s8c x1tgivj0', info: 'x1ewilqj x17wrial', success: 'xdsz4j9 xri61p4',
      warning: 'x1q8g9m5 xrebv38', error: 'x1pjz0fi x1m024r3', blue: 'x1o0wnni x1vvqiwl',
      green: 'x1sqjeoo xltfdvo', orange: 'x1e9xt6e xm47u9q', purple: 'x16i6n6f x1m9wyeb',
      teal: 'x1jtji5o x9x0lbs'
    };
    return 'astryx-badge ' + variant + ' x3nfvp2 x6s0dn4 xl56j7k xzye2dw x1grt7ep xt970qd xf314gf xjspbzw xjb2p0i x141an7d x1ltkj2j x1e4wzip xuxw1ft ' + (PAIR[variant] || PAIR.neutral);
  }
  function dotCls(variant, pulsing) {
    var V = { success: 'xdsz4j9', warning: 'x1q8g9m5', error: 'x1pjz0fi', accent: 'x1ewilqj', neutral: 'x1q5y3ey' };
    return 'astryx-statusdot ' + variant + ' x1rg5ohu x16rqkct x2lah0s x1xc55vz xdk7pt ' + (V[variant] || V.neutral) +
      (pulsing ? ' x1mta51n x1c74tu6 x4hg4is xa4qsjk x1aquc0h' : '');
  }

  function issueVariant(termSetId) {
    if (termSetId === 'forced-bundling') return 'purple';
    if (termSetId === 'false-free') return 'orange';
    if (termSetId === 'entity') return 'teal';
    return 'info';
  }

  // 민원 헤더 정보 — 디자인 정적 데이터
  var CASE_INFO = { deadline: '2026-08-12' };

  // 민원 상담 이력 정리 — 클립별로 흩어진 날짜를 3회 상담으로 묶는 표시용 재매핑
  // (클립=파일 단위라 서버 날짜가 흩어짐. 데이터 계약은 손대지 않고 callDate의 날짜부만 표시 치환)
  var CASE_CALL_DATES = {
    'REG-HI-ff-03': '2026-06-05', 'REG-HI-en-02': '2026-06-05', 'REG-HI-cb-neg': '2026-06-05',
    'REG-HI-en-01': '2026-06-12', 'REG-HI-cb-01': '2026-06-12', 'REG-HI-cb-02': '2026-06-12',
    'REG-HI-ff-01': '2026-06-23', 'REG-HI-ff-02': '2026-06-23', 'REG-HI-ff-neg': '2026-06-23', 'REG-HI-cb-03': '2026-06-23'
  };

  function remapCallDate(h) {
    var d = CASE_CALL_DATES[h.callId];
    if (!d) return h.callDate;
    var time = String(h.callDate || '').slice(11);
    return time ? d + ' ' + time : d;
  }

  var TERMSET_EN = {
    'false-free': { name: 'False "free" claims', hypothesis: 'Possible omission of paid-plan disclosure' },
    'forced-bundling': { name: 'Forced bundling', hypothesis: 'Possible coerced add-on (rider) sales' },
    'entity': { name: 'Entity · product terms', hypothesis: 'Named product / entity mentions' }
  };

  // 이 케이스(보험 민원) 맥락에 맞지 않는 조사 유형은 칩에서 숨긴다 — 데이터·계약은 유지
  var HIDDEN_TERMSET_IDS = ['entity'];
  function isHiddenTermSet(id) { return HIDDEN_TERMSET_IDS.indexOf(id) !== -1; }
  function tsName(ts) { return (TERMSET_EN[ts.id] || {}).name || ts.name; }
  function tsHypo(ts) { return (TERMSET_EN[ts.id] || {}).hypothesis || ts.hypothesis || ts.description || ts.name; }

  // 데이터 스냅샷의 한글 표시값 → 영문 (표시 계층 치환, 계약 불변)
  // UI는 영어 메인 — 인도 현지어는 음성 전사(transcript/matchedText)에만 남긴다.
  var VAL_EN = [
    ['자이푸르 거점', 'Jaipur branch'], ['인도르 거점', 'Indore branch'], ['파트나 거점', 'Patna branch'],
    ['루디아나 거점', 'Ludhiana branch'],
    ['콜센터 인바운드', 'Call-center inbound'], ['TM 아웃바운드', 'TM outbound'], ['현장 상담', 'Field consult'],
    ['제출 세트', 'Submission set'], ['거점', ' branch']
  ];
  function en(v) {
    var s = String(v == null ? '' : v);
    VAL_EN.forEach(function (p) { s = s.split(p[0]).join(p[1]); });
    return s.replace(/\s+/g, ' ').trim();
  }

  var NOTES_KEY = 'vx-hinglish-desk-notes-v2';

  // ---------------------------------------------------------------- state
  var state = {
    booted: false,
    caseId: 'REG-HI-2026-017',
    termSets: [],
    indexMeta: null,
    termSetId: null,
    draftText: '',
    activeTerms: [],          // [{ term, tsId }] — 다중 선택 키워드
    threshold: 0.55,
    useVariants: true,
    excludeNegated: false,
    searched: false,
    searching: false,
    run: null,
    variants: [],
    selectedHitId: null,
    hitById: {},
    customTerms: {},          // termSetId → [키워드]
    memos: {},                // hitId → [{ id, text, t0, t1 }, …] 구간 메모 목록
    memoSeq: 1,
    evidence: [],             // 시작은 빈 패널 — 첫 드롭이나 + 버튼으로 그룹 생성
    evidenceSeq: 1,
    collapsedDays: [],
    exampleFamilies: [],
    excludedHitIds: [],
    inspectorWidth: 340,
    // player
    playerHitId: null,
    playerDur: 0,
    playerSel: null,          // { t0, t1 } seconds
    piiMask: true,
    peaksCache: {}
  };

  function currentTermSet() {
    for (var i = 0; i < state.termSets.length; i++) {
      if (state.termSets[i].id === state.termSetId) return state.termSets[i];
    }
    return state.termSets[0] || null;
  }

  function currentTerms(ts) {
    return (ts.searchTerms || []).concat(state.customTerms[ts.id] || []);
  }

  function isTermActive(term, tsId) {
    return state.activeTerms.some(function (q) { return q.term === term && q.tsId === tsId; });
  }

  function visibleHits() {
    var hits = (state.run && state.run.hits) ? state.run.hits.slice() : [];
    hits = hits.filter(function (h) {
      if (state.excludedHitIds.indexOf(h.id) !== -1) return false;
      if (state.excludeNegated && h.isNegated) return false;
      return true;
    });
    hits.sort(function (a, b) { return String(a.callDate).localeCompare(String(b.callDate)); });
    return hits;
  }

  function selectedHit() {
    var hits = visibleHits();
    for (var i = 0; i < hits.length; i++) if (hits[i].id === state.selectedHitId) return hits[i];
    return hits[0] || null;
  }

  // ---------------------------------------------------------------- notes persistence
  function persistNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify({
        memos: state.memos, memoSeq: state.memoSeq,
        evidence: state.evidence, evidenceSeq: state.evidenceSeq
      }));
    } catch (e) { /* quota — 무시 */ }
  }
  function loadNotes() {
    try {
      var raw = localStorage.getItem(NOTES_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        if (d.memos) { // 구버전(hit당 단일 객체) → 리스트 이행
          state.memos = {};
          Object.keys(d.memos).forEach(function (k) {
            var v = d.memos[k];
            if (Array.isArray(v)) state.memos[k] = v;
            else if (v && v.text) state.memos[k] = [{ id: 'm' + (state.memoSeq++), text: v.text, t0: v.t0 || 0, t1: v.t1 || 0 }];
          });
        }
        if (d.memoSeq) state.memoSeq = Math.max(state.memoSeq, d.memoSeq);
        if (Array.isArray(d.evidence) && d.evidence.length) state.evidence = d.evidence;
        if (d.evidenceSeq) state.evidenceSeq = d.evidenceSeq;
        state.evidence.forEach(function (g) { // 구버전 한글 그룹명 이행
          g.name = String(g.name || '').replace('관련근거', 'Evidence');
        });
      }
    } catch (e) { /* 손상 데이터 — 무시 */ }
  }

  // ---------------------------------------------------------------- offline banner
  function setOffline(on) {
    $('offline-banner').hidden = !on;
    if (on) {
      $('header-dot').className = dotCls('error', false);
      $('header-dot').setAttribute('data-variant', 'error');
      $('header-dot-label').textContent = 'Server offline';
    }
  }

  // ---------------------------------------------------------------- header
  function renderHeader() {
    $('crumb-case').textContent = state.caseId + ' · Hinglish TM mis-guidance audit';
    $('crumb-module').textContent = 'Complaint Audit Desk';
  }

  // ---------------------------------------------------------------- left panel (민원 정보)
  function renderCase() {
    var h = selectedHit();
    $('cust-branch').textContent = h ? (en(h.insurer) || '—') : '—';
    $('cust-channel').textContent = h ? (en(h.channel) || '—') : '—';
    $('cust-seller').textContent = h ? (h.sellerCode || '—') : '—';

    var dl = $('case-deadline');
    var m = CASE_INFO.deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      var due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      var days = Math.ceil((due.getTime() - Date.now()) / 86400000);
      dl.textContent = 'Due ' + Number(m[2]) + '/' + Number(m[3]) + ' · ' + (days >= 0 ? 'D-' + days : 'D+' + (-days));
      var v = days < 7 ? 'error' : 'warning';
      dl.className = badgeCls(v);
      dl.setAttribute('data-variant', v);
    }
  }

  function normPron(p) {
    var ipa = p.ipa != null ? String(p.ipa) : String(p.pronunciation || '').replace(/^\[|\]$/g, '');
    var kind = p.kind != null ? String(p.kind) : 'standard';
    var isStandard = /표준|standard|canonical/i.test(kind) || (p.weight == null && !p.rule);
    var kindLabel;
    if (/^standard$/i.test(kind)) kindLabel = 'Standard';
    else if (/^lexicon$/i.test(kind)) kindLabel = 'Lexicon variant';
    else if (/^(rule|variant)$/i.test(kind)) kindLabel = 'Rule variant';
    else kindLabel = kind;
    return {
      surface: p.surface != null ? String(p.surface) : String(p.term || ''),
      ipa: ipa,
      kind: kindLabel,
      isStandard: isStandard,
      rule: p.rule != null ? String(p.rule) : 'standard',
      weight: typeof p.weight === 'number' ? p.weight : 1
    };
  }

  function renderPanel() {
    var ts = currentTermSet();
    if (!ts) return;
    $('term-hypothesis').textContent = tsHypo(ts);

    // 주요 키워드: 모든 조사 유형의 검색어를 한 줄로 — 클릭으로 다중 선택 토글
    var chipsHtml = '';
    state.termSets.forEach(function (t) {
      if (isHiddenTermSet(t.id)) return; // 민원 맥락에 안 맞는 유형은 미노출
      currentTerms(t).forEach(function (term) {
        chipsHtml += '<button type="button" data-term="' + esc(term) + '" data-termsetid="' + esc(t.id) + '" aria-pressed="' + isTermActive(term, t.id) + '" class="' + (isTermActive(term, t.id) ? 'is-active' : '') + '">' + esc(term) + '</button>';
      });
    });
    $('term-chips').innerHTML = chipsHtml;

    $('ctx-include').textContent = (ts.contextTerms || []).join(' · ') || '—';
    $('ctx-exclude').textContent = (ts.negativeTerms || []).join(' · ') || '—';

    var prons = (state.variants && state.variants.length ? state.variants : (ts.pronunciations || [])).map(normPron);
    var shown = prons.slice(0, 8);
    if (!shown.length) {
      $('pron-list').innerHTML = '<div class="ka-example-note">Run a search to see G2P pronunciation variants.</div>';
    } else {
      $('pron-list').innerHTML = shown.map(function (p) {
        var v = p.isStandard ? 'neutral' : 'warning';
        return '<article>' +
          '<div><strong>' + esc(p.surface) + '</strong>' +
          '<span class="' + badgeCls(v) + '" data-variant="' + v + '">' + esc(p.kind) + '</span></div>' +
          '<p>[' + esc(p.ipa) + ']</p>' +
          '<details class="ka-pronunciation-details"><summary>Details</summary>' +
          '<code>' + esc(p.ipa) + '</code>' +
          '<footer><span>' + esc(p.rule) + '</span><span>weight ' + p.weight.toFixed(2) + '</span></footer>' +
          '</details></article>';
      }).join('');
      if (prons.length > shown.length) {
        $('pron-list').innerHTML += '<div class="ka-example-note">+' + (prons.length - shown.length) + ' more variants</div>';
      }
    }

    $('example-note').style.display = state.exampleFamilies.length === 0 ? 'none' : '';
    $('example-note-text').textContent = state.exampleFamilies.length + ' pronunciation examples applied';

    $('combo-badge').textContent = (state.useVariants ? 'Variants' : 'Standard') + ' · ' + pct(state.threshold);
    $('mode-variants').className = state.useVariants ? 'is-active' : '';
    $('mode-baseline').className = state.useVariants ? '' : 'is-active';
    $('exclude-negated').checked = state.excludeNegated;
    $('threshold').value = String(state.threshold);
    $('threshold-label').textContent = pct(state.threshold);
  }

  // ---------------------------------------------------------------- 상담일자 그룹 결과
  function highlightTranscript(h) {
    var t = String(h.transcript || '');
    var core = String(h.matchedText || '').replace(/^…+/, '').replace(/…+$/, '').trim();
    if (core) {
      var idx = t.indexOf(core);
      if (idx !== -1) {
        // 검출 발화가 항상 보이도록 앞부분을 … 로 접는다 (판단 근거 우선)
        var pre = t.slice(0, idx);
        if (pre.length > 16) {
          var tail = pre.slice(-12);
          var sp = tail.indexOf(' ');
          pre = '… ' + (sp !== -1 ? tail.slice(sp + 1) : tail);
        }
        return esc(pre) + '<mark>' + esc(core) + '</mark>' + esc(t.slice(idx + core.length));
      }
    }
    return esc(t);
  }

  function dayGroupsOf(hits) {
    var byDay = {};
    var days = [];
    hits.forEach(function (h) {
      var d = String(h.callDate || '').slice(0, 10) || 'Unknown date';
      if (!byDay[d]) { byDay[d] = []; days.push(d); }
      byDay[d].push(h);
    });
    days.sort();
    return days.map(function (d, i) { return { date: d, n: i + 1, hits: byDay[d] }; });
  }

  function daySummary(items) {
    var maxScore = 0;
    var neg = 0;
    items.forEach(function (h) {
      if ((h.effectivePhoneticScore || 0) > maxScore) maxScore = h.effectivePhoneticScore || 0;
      if (h.isNegated) neg++;
    });
    var s = items.length + ' hits · top similarity ' + pct(maxScore);
    return s;
  }

  function dayTags(items) {
    var tags = [];
    items.forEach(function (h) {
      (h.searchTerms || []).forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
    });
    return tags.slice(0, 3);
  }

  function renderResults() {
    var hits = visibleHits();
    var run = state.run;
    $('result-count').textContent = hits.length + ' on-screen';
    $('current-count').textContent = String(hits.length);
    $('candidate-compact').textContent = run ? compactFmt.format(run.totalCandidateEstimate || 0) : '0';
    $('run-id').textContent = run ? (run.runId || '—') : '—';
    $('kpi-total').textContent = run ? fullFmt.format(run.totalCandidateEstimate || 0) : '0';
    $('kpi-hours').textContent = run ? (((run.totalCandidateEstimate || 0) * 0.82 / 60).toFixed(1) + 'h') : '0h';
    $('kpi-guard').textContent = run ? String(run.negationGuardCount || 0) : '0';
    $('generated-at').textContent = run && run.generatedAt ? run.generatedAt : (state.searched ? nowKst() : '—');
    if (state.indexMeta) {
      $('index-meta').textContent = 'Glossary HI-0.1 · ' + (state.indexMeta.modelVersion || 'phone index') +
        ' · ' + (state.indexMeta.clips != null ? state.indexMeta.clips : '—') + ' clips';
    }

    var hasResults = hits.length > 0;
    $('results-wrapper').style.display = hasResults ? '' : 'none';
    $('empty-state').style.display = hasResults ? 'none' : '';
    if (!hasResults) {
      if (state.searching) {
        $('empty-title').textContent = 'Searching…';
        $('empty-desc').textContent = 'Ranking pronunciation variants from the phone index.';
      } else if (state.searched) {
        $('empty-title').textContent = 'No results.';
        $('empty-desc').textContent = 'Adjust keywords or the similarity threshold.';
      } else {
        $('empty-title').textContent = 'Run a search.';
        $('empty-desc').textContent = 'Pick keywords or type a query to find pronunciation candidates.';
      }
      renderCase();
      syncPlayer();
      return;
    }

    var sel = selectedHit();
    var html = '';
    dayGroupsOf(hits).forEach(function (g) {
      var collapsed = state.collapsedDays.indexOf(g.date) !== -1;
      html += '<section class="ka-day-group' + (collapsed ? ' is-collapsed' : '') + '" data-day="' + esc(g.date) + '">' +
        '<button type="button" class="ka-day-head" aria-expanded="' + (!collapsed) + '">' +
        '<span class="ka-day-caret" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="m6 9 6 6 6-6"></path></svg></span>' +
        '<strong>Consultation ' + g.n + '</strong>' +
        '<span class="ka-day-date">' + esc(g.date) + '</span>' +
        '<span class="ka-day-summary"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>AI summary · ' + esc(daySummary(g.hits)) + '</span>' +
        '<span class="ka-day-tags">' + dayTags(g.hits).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</span>' +
        '</button>';
      if (!collapsed) {
        html += '<div class="ka-day-rows">';
        g.hits.forEach(function (h) {
          var isSel = sel && h.id === sel.id;
          var memoText = memosOf(h.id).map(function (m) { return m.text; }).join(' · ');
          html += '<article class="ka-hit-row' + (isSel ? ' is-selected' : '') + '" data-hit="' + esc(h.id) + '" draggable="true" tabindex="0" aria-selected="' + (isSel ? 'true' : 'false') + '">' +
            '<button type="button" class="ka-hit-time" data-seek="' + toSeconds(h.spanStart) + '" title="Play detected span">' + esc(h.matchAt) + '</button>' +
            '<div class="ka-hit-text">' +
            '<span>' + highlightTranscript(h) + '</span>' +
            '</div>' +
            '<div class="ka-hit-memo' + (memoText ? '' : ' is-empty') + '" title="' + esc(memoText) + '">' + (memoText ? esc(memoText) : 'No memo') + '</div>' +
            '<span class="ka-hit-grip" aria-hidden="true" title="Drag to evidence"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg></span>' +
            '</article>';
        });
        html += '</div>';
      }
      html += '</section>';
    });
    $('results-tbody').innerHTML = html;
    renderCase();
    syncPlayer();
  }

  // ---------------------------------------------------------------- 관련근거 패널
  function evidenceTotal() {
    var n = 0;
    state.evidence.forEach(function (g) { n += g.items.length; });
    return n;
  }

  function renderEvidence() {
    var total = evidenceTotal();
    var cnt = $('evidence-count');
    cnt.textContent = total + (total === 1 ? ' item' : ' items');
    var cv = total ? 'info' : 'neutral';
    cnt.className = badgeCls(cv);
    cnt.setAttribute('data-variant', cv);
    $('inspector-empty').style.display = total ? 'none' : '';
    $('inspector-content').hidden = false;
    var meta = $('evidence-meta');
    if (total) {
      var dur = 0;
      var days = [];
      state.evidence.forEach(function (g) {
        g.items.forEach(function (it) {
          dur += Math.max(0, (it.t1 || 0) - (it.t0 || 0));
          var d = String(it.callDate || '').slice(0, 10);
          if (d && days.indexOf(d) === -1) days.push(d);
        });
      });
      meta.hidden = false;
      meta.textContent = total + (total === 1 ? ' span' : ' spans') + ' · ' + dur.toFixed(1) + 's audio · ' + days.length + (days.length === 1 ? ' consultation' : ' consultations');
    } else {
      meta.hidden = true;
    }

    var html = '';
    state.evidence.forEach(function (g) {
      html += '<section class="ka-ev-group' + (g.open ? '' : ' is-collapsed') + '" data-ev="' + esc(g.id) + '">' +
        '<div class="ka-ev-head">' +
        '<button type="button" class="ka-ev-toggle" aria-expanded="' + (!!g.open) + '" aria-label="Toggle group"><span class="ka-day-caret" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="m6 9 6 6 6-6"></path></svg></span></button>' +
        '<input class="ka-ev-name" data-ev-name="' + esc(g.id) + '" type="text" value="' + esc(g.name) + '" aria-label="Evidence group name" spellcheck="false" autocomplete="off">' +
        '<button type="button" class="ka-ev-group-x" data-ev-remove="' + esc(g.id) + '" aria-label="Delete evidence group"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>' +
        '</div>';
      if (g.open) {
        html += '<div class="ka-ev-items">';
        g.items.forEach(function (it, i) {
          // 카드 본문은 감사자 메모만 — 전사(transcript)는 음성 데이터라 자동 채움하지 않는다
          var liveMemo = memoTextFor(it.hitId, Number(it.t0) || 0, Number(it.t1) || 0);
          var memoText = liveMemo || it.memo || '';
          html += '<article class="ka-ev-card" data-ev-group="' + esc(g.id) + '" data-ev-idx="' + i + '">' +
            '<div class="ka-ev-meta"><strong>' + esc(shortDT(it.callDate)) + '</strong><span>' + fmtClock1(it.t0) + ' – ' + fmtClock1(it.t1) + '</span></div>' +
            '<p' + (memoText ? '' : ' class="is-empty"') + '>' + (memoText ? esc(memoText) : 'No memo') + '</p>' +
            '<button type="button" class="ka-ev-x" data-remove aria-label="Remove from evidence"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>' +
            '</article>';
        });
        html += '<button type="button" class="ka-ev-drop" data-drop="' + esc(g.id) + '">＋ Drop here or click to add current selection</button>';
        html += '</div>';
      }
      html += '</section>';
    });
    $('inspector-content').innerHTML = html;

    var rep = $('btn-report');
    rep.disabled = total === 0;
  }

  function snapshotFromHit(h, sel) {
    var t0 = sel ? sel.t0 : toSeconds(h.spanStart);
    var t1 = sel ? sel.t1 : toSeconds(h.spanEnd);
    return {
      hitId: h.id, callId: h.callId, callDate: h.callDate,
      t0: t0, t1: t1,
      memo: memoTextFor(h.id, t0, t1),
      transcript: h.transcript || h.matchedText || '',
      audioUrl: h.audioUrl, duration: h.duration,
      spanStart: h.spanStart, spanEnd: h.spanEnd,
      phoneAlignment: h.phoneAlignment, phoneTimeline: h.phoneTimeline,
      sourceSystem: h.sourceSystem
    };
  }

  function addEvidenceItem(groupId, item) {
    var g = null;
    for (var i = 0; i < state.evidence.length; i++) if (state.evidence[i].id === groupId) g = state.evidence[i];
    if (!g) g = state.evidence[state.evidence.length - 1];
    if (!g) { // 그룹이 없으면 첫 드롭에서 자동 생성
      g = { id: 'ev-' + state.evidenceSeq, name: 'Evidence ' + state.evidenceSeq, open: true, items: [] };
      state.evidenceSeq++;
      state.evidence.push(g);
    }
    var dup = g.items.some(function (it) {
      return it.hitId === item.hitId && Math.abs(it.t0 - item.t0) < 0.05 && Math.abs(it.t1 - item.t1) < 0.05;
    });
    if (!dup) {
      g.items.push(item);
      g.open = true;
      persistNotes();
    }
    renderEvidence();
  }

  function lastOpenGroupId() {
    for (var i = state.evidence.length - 1; i >= 0; i--) if (state.evidence[i].open) return state.evidence[i].id;
    return state.evidence.length ? state.evidence[state.evidence.length - 1].id : null;
  }

  // ---------------------------------------------------------------- 파형 플레이어
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function audioArrayBuffer(u) { // /audio/*.wav fetch, data: URL(구 근거 스냅샷)도 허용
    var s = String(u || '');
    if (s.slice(0, 5) === 'data:') {
      var b64 = s.split(',')[1] || '';
      var bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return Promise.resolve(arr.buffer);
    }
    return fetch(s).then(function (r) {
      if (!r.ok) throw new Error('audio HTTP ' + r.status);
      return r.arrayBuffer();
    });
  }

  function decodePeaks(key, audioUrl) {
    if (state.peaksCache[key]) return Promise.resolve(state.peaksCache[key]);
    return new Promise(function (resolve) {
      var done = false;
      function fallback() {
        if (done) return;
        done = true;
        var peaks = [];
        for (var i = 0; i < 480; i++) peaks.push(0.25 + ((i * 37) % 61) / 100);
        resolve({ peaks: peaks, dur: 0 });
      }
      try {
        audioArrayBuffer(audioUrl).then(function (raw) {
          return getAudioCtx().decodeAudioData(raw);
        }).then(function (buf) {
          if (done) return;
          done = true;
          var ch = buf.getChannelData(0);
          var BINS = 480;
          var per = Math.max(1, Math.floor(ch.length / BINS));
          var peaks = [];
          for (var b = 0; b < BINS; b++) {
            var max = 0;
            var s = b * per;
            var e = Math.min(ch.length, s + per);
            for (var i = s; i < e; i += 4) {
              var v = Math.abs(ch[i]);
              if (v > max) max = v;
            }
            peaks.push(max);
          }
          var norm = Math.max.apply(null, peaks) || 1;
          peaks = peaks.map(function (v) { return v / norm; });
          var out = { peaks: peaks, dur: buf.duration };
          state.peaksCache[key] = out;
          resolve(out);
        }).catch(fallback);
      } catch (e) { fallback(); }
    });
  }

  function playerHit() { // 현재 플레이어에 올라간 대상 (검색 hit 또는 근거 스냅샷)
    return state.playerObj || null;
  }

  function cssVar(name, fb) {
    var v = getComputedStyle($('ka-root')).getPropertyValue(name).trim();
    return v || fb;
  }

  function drawWave() {
    var canvas = $('player-canvas');
    var wave = $('player-wave');
    var obj = playerHit();
    if (!canvas || !wave || !obj) return;
    var data = state.peaksCache[obj.id];
    var w = wave.clientWidth;
    var hgt = wave.clientHeight;
    if (!w || !hgt) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    if (!data) return;

    var top = 8;
    var bottom = hgt - 28; // 하단 음소 스트립 영역 제외
    var mid = (top + bottom) / 2;
    var maxHalf = (bottom - top) / 2;
    var dur = state.playerDur || 1;
    var sel = state.playerSel;
    var cIn = cssVar('--color-icon-blue', '#4a64d8');
    var cOut = cssVar('--color-border-emphasized', '#c9c4ba');

    var barW = 2.5;
    var gap = 1.5;
    var n = Math.max(8, Math.floor(w / (barW + gap)));
    for (var i = 0; i < n; i++) {
      var frac = (i + 0.5) / n;
      var p = data.peaks[Math.min(data.peaks.length - 1, Math.floor(frac * data.peaks.length))];
      var half = Math.max(1.5, p * maxHalf);
      var x = i * (barW + gap) + gap / 2;
      var t = frac * dur;
      var inSel = sel && t >= sel.t0 && t <= sel.t1;
      ctx.fillStyle = inSel ? cIn : cOut;
      ctx.globalAlpha = inSel ? 0.92 : 0.85;
      roundBar(ctx, x, mid - half, barW, half * 2);
    }
    ctx.globalAlpha = 1;
  }

  function roundBar(ctx, x, y, w, h) {
    var r = Math.min(w / 2, 1.5);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function updateSelUI() {
    var obj = playerHit();
    var selDiv = $('player-selection');
    var dur = state.playerDur || 1;
    var sel = state.playerSel;
    if (!obj || !sel) {
      selDiv.hidden = true;
      $('memo-span-label').textContent = 'No selection';
      drawWave();
      return;
    }
    var l = Math.max(0, Math.min(100, sel.t0 / dur * 100));
    var r = Math.max(0, Math.min(100, sel.t1 / dur * 100));
    selDiv.hidden = false;
    selDiv.style.left = l + '%';
    selDiv.style.width = Math.max(0.5, r - l) + '%';
    $('sel-t0').textContent = fmtClock1(sel.t0);
    $('sel-t1').textContent = fmtClock1(sel.t1);
    $('memo-span-label').textContent = fmtClock1(sel.t0) + ' – ' + fmtClock1(sel.t1) + ' selected';
    updatePhoneDim();
    drawWave();
  }

  // PII 마스킹 스팬 — 클립 id 시드 결정적 랜덤(위치·길이·개수 1~2), 검출 스팬은 회피.
  // 실검출이 아닌 데모 연출이므로 증거 구간(matched span)을 가리면 안 된다.
  function piiSpansOf(obj) {
    var dur = state.playerDur || Number(obj.duration) || 1;
    var s0 = toSeconds(obj.spanStart);
    var s1 = toSeconds(obj.spanEnd);
    var seed = 0; // Math.imul — 32비트 정확 곱 (일반 곱은 2^53 초과 반올림으로 인접 id가 같은 시퀀스로 붕괴)
    String(obj.callId || obj.id || '').split('').forEach(function (c) { seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0; });
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    var want = 1 + (rnd() < 0.45 ? 1 : 0);
    var spans = [];
    var tries = 0;
    while (spans.length < want && tries++ < 24) {
      var len = 0.35 + rnd() * 0.65; // 0.35~1.0s
      var t0 = rnd() * Math.max(0.05, dur - len);
      var t1 = Math.min(dur, t0 + len);
      var clash = spans.some(function (p) { return t1 > p.t0 - 0.25 && t0 < p.t1 + 0.25; });
      if (clash) continue;
      spans.push({ t0: t0, t1: t1 });
    }
    // 마스크 위치는 클립 고유로 고정하고, 현재 검출 스팬(증거)과 겹치는 것만 제외한다
    // — 검색어가 바뀌어도 마스크가 움직이지 않고, 증거 구간은 항상 공개된다.
    spans = spans.filter(function (p) { return !(p.t1 > s0 - 0.12 && p.t0 < s1 + 0.12); });
    spans.sort(function (a, b) { return a.t0 - b.t0; });
    return spans;
  }

  var PII_LOCK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide" aria-hidden="true"><circle cx="12" cy="16" r="1"></circle><rect x="3" y="10" width="18" height="12" rx="2"></rect><path d="M7 10V7a5 5 0 0 1 10 0v3"></path></svg>';

  function updatePii() {
    var layer = $('player-pii');
    var obj = playerHit();
    var dur = state.playerDur || 1;
    var spans = obj ? piiSpansOf(obj) : [];
    var has = spans.length > 0;
    layer.hidden = !state.piiMask || !has;
    layer.innerHTML = layer.hidden ? '' : spans.map(function (p) {
      var l = Math.max(0, p.t0 / dur * 100);
      var w = Math.max(1.5, (p.t1 - p.t0) / dur * 100);
      return '<div class="ka-player-pii" style="left: ' + l.toFixed(2) + '%; width: ' + w.toFixed(2) + '%;">' + PII_LOCK_SVG + 'PII</div>';
    }).join('');
    var btn = $('btn-redaction');
    btn.disabled = !has;
    btn.setAttribute('aria-pressed', state.piiMask ? 'true' : 'false');
    btn.querySelector('.xb3r6kr').textContent = state.piiMask ? 'Unmask PII' : 'Mask PII';
    updatePhoneDim();
  }

  // 전구간 음소 타임라인: 서버 phoneTimeline(클립 전체 ZIPA 실측 [{s,t0,t1}])을 그대로
  // 배치하고 검출 스팬 안쪽만 강조(is-real). 타임라인이 없으면 검출 스팬의
  // phoneAlignment 만 배치한다 (구 근거 스냅샷 호환).
  function buildFullPhones(obj) {
    var t0 = toSeconds(obj.spanStart);
    var t1 = toSeconds(obj.spanEnd);
    var phones = [];
    var tl = obj.phoneTimeline;
    if (tl && tl.length) {
      tl.forEach(function (p) {
        var a = Number(p.t0) || 0;
        var b = Number(p.t1) || a;
        var mid = (a + b) / 2;
        var sym = p.s != null ? p.s : (p.symbol != null ? p.symbol : '');
        phones.push({ t: mid, sym: sym, real: mid >= t0 - 0.04 && mid <= t1 + 0.04 });
      });
      return phones;
    }
    var real = splitPhones(obj.phoneAlignment);
    var n = real.length || 1;
    real.forEach(function (p, i) {
      phones.push({ t: t0 + (i + 0.5) * (t1 - t0) / n, sym: p, real: true });
    });
    return phones;
  }

  function splitPhones(s) {
    var out = [];
    var chars = Array.from(String(s || ''));
    var comb = /[\u0300-\u036f\u02b0-\u02ff\u0329\u031d\u032a\u0303]/;
    chars.forEach(function (c) {
      if (out.length && (comb.test(c) || c === 'ː')) out[out.length - 1] += c;
      else out.push(c);
    });
    return out;
  }

  function renderPhones(obj) {
    var wrap = $('player-phones');
    var dur = state.playerDur || 1;
    var phones = buildFullPhones(obj);
    var html = '<span class="ka-phone-label">Phones</span>';
    phones.forEach(function (p) {
      var isB = p.sym === '▁';
      html += '<button type="button" data-t="' + p.t.toFixed(3) + '" class="' + (isB ? 'is-boundary' : '') + (p.real ? ' is-real' : '') + '" style="left: ' + (p.t / dur * 100).toFixed(2) + '%;" title="' + fmtClock1(p.t) + '">' + esc(p.sym) + '</button>';
    });
    wrap.innerHTML = html;
    updatePhoneDim();
  }

  function updatePhoneDim() {
    var sel = state.playerSel;
    var obj = playerHit();
    var spans = state.piiMask && obj ? piiSpansOf(obj) : [];
    var btns = $('player-phones').querySelectorAll('button[data-t]');
    for (var i = 0; i < btns.length; i++) {
      var t = Number(btns[i].getAttribute('data-t')) || 0;
      btns[i].classList.toggle('is-out', !!sel && (t < sel.t0 || t > sel.t1));
      var masked = spans.some(function (p) { return t >= p.t0 && t <= p.t1; });
      btns[i].style.display = masked ? 'none' : ''; // 가려진 구간은 음소도 비공개
    }
  }

  function loadPlayer(obj) {
    state.playerObj = obj;
    state.playerDur = Number(obj.duration) || 1;
    state.playerSel = { t0: toSeconds(obj.spanStart), t1: toSeconds(obj.spanEnd) };
    $('player-empty').style.display = 'none';
    $('player-body').hidden = false;
    $('player-title').textContent = obj.callId || '—';
    $('player-date').textContent = obj.callDate || '';
    $('player-src').textContent = en(obj.sourceSystem) || '';
    $('player-dur').textContent = '/ ' + fmtClock1(state.playerDur);
    $('player-clock').textContent = fmtClock1(0);
    $('player-cursor').style.left = '0%';
    var audio = $('hit-audio');
    if (audio.getAttribute('data-key') !== obj.id) {
      audio.src = obj.audioUrl;
      audio.setAttribute('data-key', obj.id);
      audio.load();
    }
    renderPhones(obj);
    updatePii();
    updateSelUI();
    decodePeaks(obj.id, obj.audioUrl).then(function (d) {
      if (state.playerObj && state.playerObj.id === obj.id) {
        if (d.dur) {
          state.playerDur = d.dur;
          $('player-dur').textContent = '/ ' + fmtClock1(d.dur);
          updatePii();
        }
        renderPhones(obj); // 피크 기반 전구간 음소 배치
        updateSelUI();
        renderWaveMemo();
      }
    });
    renderMemoBox();
    renderWaveMemo();
  }

  function syncPlayer() {
    var h = selectedHit();
    if (!h) {
      state.playerObj = null;
      state.playerHitId = null;
      $('player-empty').style.display = '';
      $('player-body').hidden = true;
      var audio = $('hit-audio');
      if (!audio.paused) audio.pause();
      return;
    }
    if (state.playerHitId !== h.id) {
      state.playerHitId = h.id;
      loadPlayer({
        id: h.id, callId: h.callId, callDate: h.callDate, sourceSystem: h.sourceSystem,
        audioUrl: h.audioUrl, duration: h.duration,
        spanStart: h.spanStart, spanEnd: h.spanEnd, phoneAlignment: h.phoneAlignment,
        phoneTimeline: h.phoneTimeline
      });
    }
  }

  function renderMemoBox() {
    // 좌패널 메모박스는 "현재 선택 구간"의 메모를 편집한다
    var h = selectedHit();
    var sel = state.playerSel;
    var m = h && sel ? findMemoAt(h.id, sel.t0, sel.t1) : null;
    $('memo-input').value = m ? m.text : '';
  }

  // ------------------------------------------- 파형 직접 메모 (우클릭 → 인라인 입력)
  // 모델: state.memos[hitId] = [{ id, text, t0, t1 }, …] — hit당 여러 구간 메모
  function memoKeyOf(obj) { return String((obj && obj.id) || '').replace(/^ev-/, ''); }

  function memosOf(key) { return state.memos[key] || []; }

  function findMemoAt(key, t0, t1) { // 구간 겹침이 가장 큰 메모
    var best = null;
    var bestOv = 0.001;
    memosOf(key).forEach(function (m) {
      var ov = Math.min(Number(m.t1) || 0, t1) - Math.max(Number(m.t0) || 0, t0);
      if (ov > bestOv) { bestOv = ov; best = m; }
    });
    return best;
  }

  function memoTextFor(key, t0, t1) { // 근거 카드용 — 스팬과 겹치는 메모 우선, 없으면 전체 병기
    var m = findMemoAt(key, t0, t1);
    if (m) return m.text;
    return memosOf(key).map(function (x) { return x.text; }).join(' · ');
  }

  function syncEvidenceMemos(key) {
    state.evidence.forEach(function (g) {
      g.items.forEach(function (it) {
        if (it.hitId === key) it.memo = memoTextFor(key, Number(it.t0) || 0, Number(it.t1) || 0);
      });
    });
  }

  function upsertMemo(key, t0, t1, text, editId) {
    var list = memosOf(key).slice();
    var target = null;
    if (editId) list.forEach(function (m) { if (m.id === editId) target = m; });
    else target = findMemoAt(key, t0, t1); // 같은 구간에 다시 쓰면 그 메모를 갱신
    if (text) {
      if (target) { target.text = text; target.t0 = t0; target.t1 = t1; }
      else list.push({ id: 'm' + (state.memoSeq++), text: text, t0: t0, t1: t1 });
      state.memos[key] = list;
    } else if (target) { // 빈 텍스트 저장 = 해당 메모 삭제
      list = list.filter(function (m) { return m !== target; });
      if (list.length) state.memos[key] = list; else delete state.memos[key];
    }
    syncEvidenceMemos(key);
  }

  function deleteMemo(key, id) {
    var list = memosOf(key).filter(function (m) { return m.id !== id; });
    if (list.length) state.memos[key] = list; else delete state.memos[key];
    syncEvidenceMemos(key);
    persistNotes();
    renderResults();
    renderEvidence();
    renderMemoBox();
    renderWaveMemo();
  }

  function renderWaveMemo() {
    var wrap = $('wave-memos');
    var obj = playerHit();
    var list = obj ? memosOf(memoKeyOf(obj)) : [];
    if (!list.length) { wrap.innerHTML = ''; return; }
    var dur = state.playerDur || 1;
    // 메모 구간마다 연한 회색 밴드 — 텍스트는 중앙, 우상단 ×로 삭제
    wrap.innerHTML = list.map(function (m) {
      var t0 = Math.max(0, Math.min(dur, Number(m.t0) || 0));
      var t1 = Math.max(t0, Math.min(dur, Number(m.t1) || 0));
      var l = t0 / dur * 100;
      var w = Math.max(3, (t1 - t0) / dur * 100);
      if (l + w > 100) w = 100 - l;
      return '<div class="ka-wave-memo" role="button" tabindex="0" style="left: ' + l.toFixed(2) + '%; width: ' + w.toFixed(2) + '%;"' +
        ' data-memo-id="' + esc(m.id) + '" data-t0="' + t0 + '" data-t1="' + t1 + '"' +
        ' title="' + esc(fmtClock1(t0) + ' – ' + fmtClock1(t1) + ' · ' + m.text) + '">' +
        '<span class="ka-wave-memo-text">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"></path></svg>' +
        esc(m.text) + '</span>' +
        '<button type="button" class="ka-wave-memo-x" data-memo-del="' + esc(m.id) + '" aria-label="Delete memo"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>' +
        '</div>';
    }).join('');
  }

  var memoDraft = null; // 우클릭으로 잡은 메모 대상 { t0, t1, editId }

  function openWaveMemoEditor(clientX, memoId) {
    var obj = playerHit();
    if (!obj) return;
    var rect = $('player-wave').getBoundingClientRect();
    var dur = state.playerDur || 1;
    var key = memoKeyOf(obj);
    var editing = null;
    if (memoId) memosOf(key).forEach(function (m) { if (m.id === memoId) editing = m; });
    var t = Math.max(0, Math.min(dur, (clientX - rect.left) / Math.max(1, rect.width) * dur));
    var sel = state.playerSel;
    if (editing) { // 기존 밴드 우클릭 — 그 메모를 수정
      memoDraft = { t0: Number(editing.t0) || 0, t1: Number(editing.t1) || 0, editId: editing.id };
    } else { // 선택 구간 안이면 그 구간에, 밖이면 클릭 지점 ±0.3s 청크에 새 메모
      memoDraft = sel && t >= sel.t0 && t <= sel.t1
        ? { t0: sel.t0, t1: sel.t1, editId: null }
        : { t0: Math.max(0, t - 0.3), t1: Math.min(dur, t + 0.3), editId: null };
    }
    state.playerSel = { t0: memoDraft.t0, t1: memoDraft.t1 };
    updateSelUI();
    var ed = $('wave-memo-editor');
    var inp = $('wave-memo-input');
    inp.value = editing ? editing.text : '';
    ed.style.left = Math.max(0, Math.min(76, memoDraft.t0 / dur * 100)) + '%';
    ed.hidden = false;
    inp.focus();
    inp.select();
  }

  function commitWaveMemo() {
    var obj = playerHit();
    if (!obj || !memoDraft) { cancelWaveMemo(); return; }
    upsertMemo(memoKeyOf(obj), memoDraft.t0, memoDraft.t1, $('wave-memo-input').value.trim(), memoDraft.editId);
    memoDraft = null;
    $('wave-memo-editor').hidden = true;
    persistNotes();
    renderResults();
    renderEvidence();
    renderMemoBox();
    renderWaveMemo();
  }

  function cancelWaveMemo() {
    memoDraft = null;
    $('wave-memo-editor').hidden = true;
  }

  // ---------------------------------------------------------------- search (다중 키워드 병합)
  function runSearch() {
    if (state.searching) return;
    var queries = state.activeTerms.slice();
    var draft = (state.draftText || '').trim();
    if (draft && !queries.some(function (q) { return q.term === draft; })) {
      queries.push({ term: draft, tsId: state.termSetId });
    }
    state.searching = true;
    state.searched = true;
    renderResults();
    if (!queries.length) {
      state.searching = false;
      state.run = null;
      state.variants = [];
      state.hitById = {};
      renderResults();
      $('empty-title').textContent = 'Select a keyword.';
      $('empty-desc').textContent = 'Pick one keyword, or type a query in the search box.';
      return;
    }
    Promise.all(queries.map(function (q) {
      return fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termSetId: q.tsId,
          text: q.term || undefined,
          threshold: state.threshold,
          useVariants: state.useVariants
        })
      }).then(function (r) {
        if (!r.ok) throw new Error('search HTTP ' + r.status);
        return r.json();
      });
    })).then(function (runs) {
      state.searching = false;
      // 키워드별 응답을 하나의 run으로 병합 (hit id 기준 dedupe, 높은 점수 유지)
      var hitMap = {};
      var order = [];
      var variants = [];
      var seenVar = {};
      var total = 0;
      var guard = 0;
      var runIds = [];
      runs.forEach(function (r) {
        (r.hits || []).forEach(function (raw) {
          var h = Object.assign({}, raw);
          h.callDate = remapCallDate(h);
          var ex = hitMap[h.id];
          if (!ex) { hitMap[h.id] = h; order.push(h.id); }
          else if ((h.effectivePhoneticScore || 0) > (ex.effectivePhoneticScore || 0)) hitMap[h.id] = h;
        });
        (r.variants || []).forEach(function (v) {
          var k = String(v.surface) + '|' + String(v.ipa);
          if (!seenVar[k]) { seenVar[k] = true; variants.push(v); }
        });
        total += r.totalCandidateEstimate || 0;
        guard += r.negationGuardCount || 0;
        if (r.runId) runIds.push(r.runId);
      });
      state.run = {
        hits: order.map(function (id) { return hitMap[id]; }),
        runId: runIds.length > 1 ? runIds[0] + ' +' + (runIds.length - 1) + ' more' : (runIds[0] || '—'),
        totalCandidateEstimate: total,
        negationGuardCount: guard,
        generatedAt: nowKst()
      };
      state.variants = variants;
      state.hitById = {};
      state.run.hits.forEach(function (h) { state.hitById[h.id] = h; });
      var hits = visibleHits();
      if (!hits.some(function (x) { return x.id === state.selectedHitId; })) {
        state.selectedHitId = hits.length ? hits[0].id : null;
      }
      setOffline(false);
      renderPanel();
      renderResults();
    }).catch(function (err) {
      state.searching = false;
      state.run = null;
      state.variants = [];
      setOffline(true);
      renderResults();
      $('empty-title').textContent = 'Search failed';
      $('empty-desc').textContent = String(err && err.message ? err.message : err);
    });
  }

  // ---------------------------------------------------------------- bootstrap
  function boot() {
    fetch('/api/bootstrap').then(function (r) {
      if (!r.ok) throw new Error('bootstrap HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      state.booted = true;
      state.caseId = data.caseId || state.caseId;
      state.termSets = data.termSets || [];
      state.indexMeta = data.indexMeta || null;
      if (!state.termSetId && state.termSets.length) {
        state.termSetId = state.termSets[0].id;
        var first = (state.termSets[0].searchTerms || [])[0] || '';
        if (first) state.activeTerms = [{ term: first, tsId: state.termSets[0].id }];
      }
      setOffline(false);
      var dot = $('header-dot');
      dot.className = dotCls('success', false);
      dot.setAttribute('data-variant', 'success');
      $('header-dot-label').textContent = state.indexMeta && state.indexMeta.clips != null
        ? 'Index live · ' + state.indexMeta.clips + ' clips'
        : 'API connected';
      renderHeader();
      renderPanel();
      renderResults();
      runSearch(); // 초기 1회 자동 검색으로 데스크를 채운다
    }).catch(function () {
      state.booted = false;
      setOffline(true);
      renderHeader();
      renderResults();
    });
  }

  // ---------------------------------------------------------------- events
  function selectHit(id) {
    state.selectedHitId = id;
    renderResults();
  }

  function bindEvents() {
    $('term-chips').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-term]');
      if (!btn) return;
      var term = btn.getAttribute('data-term');
      var tsId = btn.getAttribute('data-termsetid');
      // 키워드는 한 번에 하나만 — 검색창 입력과 상호 배타
      state.activeTerms = [{ term: term, tsId: tsId }];
      state.termSetId = tsId;
      state.draftText = '';
      $('search-input').value = '';
      renderPanel();
      runSearch();
    });

    // 주요 키워드 추가 (+)
    $('add-keyword').addEventListener('click', function () {
      var inp = $('add-keyword-input');
      inp.hidden = false;
      inp.value = '';
      inp.focus();
    });
    $('add-keyword-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var term = e.target.value.trim();
        var ts = currentTermSet();
        if (term && ts) {
          if (!state.customTerms[ts.id]) state.customTerms[ts.id] = [];
          if (currentTerms(ts).indexOf(term) === -1) state.customTerms[ts.id].push(term);
          state.activeTerms = [{ term: term, tsId: ts.id }];
          state.draftText = '';
          $('search-input').value = '';
          renderPanel();
          runSearch();
        }
        e.target.hidden = true;
      } else if (e.key === 'Escape') {
        e.target.hidden = true;
      }
    });
    $('add-keyword-input').addEventListener('blur', function (e) { e.target.hidden = true; });

    $('search-input').addEventListener('input', function (e) {
      state.draftText = e.target.value;
      // 검색창에 입력이 시작되면 키워드 선택은 해제된다
      if (e.target.value.trim() && state.activeTerms.length) {
        state.activeTerms = [];
        renderPanel();
      }
    });
    $('search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        renderPanel();
        runSearch();
      }
    });
    $('run-search').addEventListener('click', function () {
      renderPanel();
      runSearch();
    });

    $('mode-variants').addEventListener('click', function () {
      if (state.useVariants) return;
      state.useVariants = true;
      renderPanel();
      runSearch();
    });
    $('mode-baseline').addEventListener('click', function () {
      if (!state.useVariants) return;
      state.useVariants = false;
      renderPanel();
      runSearch();
    });
    $('exclude-negated').addEventListener('change', function (e) {
      state.excludeNegated = e.target.checked;
      renderResults();
    });
    $('threshold').addEventListener('input', function (e) {
      state.threshold = Number(e.target.value);
      $('threshold-label').textContent = pct(state.threshold);
      $('combo-badge').textContent = (state.useVariants ? 'Variants' : 'Standard') + ' · ' + pct(state.threshold);
    });
    $('threshold').addEventListener('change', function () {
      runSearch();
    });

    // 결과 리스트: 일자 접기 / 행 선택 / 시점 재생
    $('results-tbody').addEventListener('click', function (e) {
      var head = e.target.closest('.ka-day-head');
      if (head) {
        var day = head.closest('[data-day]').getAttribute('data-day');
        var idx = state.collapsedDays.indexOf(day);
        if (idx === -1) state.collapsedDays.push(day); else state.collapsedDays.splice(idx, 1);
        renderResults();
        return;
      }
      var seekBtn = e.target.closest('button[data-seek]');
      var row = e.target.closest('[data-hit]');
      if (row) {
        selectHit(row.getAttribute('data-hit'));
        if (seekBtn) {
          var t = Number(seekBtn.getAttribute('data-seek')) || 0;
          seekAndPlay(t);
        }
      }
    });
    $('results-tbody').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('[data-hit]');
      if (!row) return;
      e.preventDefault();
      selectHit(row.getAttribute('data-hit'));
    });
    $('results-tbody').addEventListener('dragstart', function (e) {
      var row = e.target.closest('[data-hit]');
      if (!row) return;
      row.classList.add('is-dragging');
      e.dataTransfer.setData('text/plain', row.getAttribute('data-hit'));
      e.dataTransfer.effectAllowed = 'copy';
    });
    $('results-tbody').addEventListener('dragend', function (e) {
      var row = e.target.closest('[data-hit]');
      if (row) row.classList.remove('is-dragging');
    });

    // 관련근거 패널
    var content = $('inspector-content');
    content.addEventListener('click', function (e) {
      if (e.target.closest('input[data-ev-name]')) return; // 이름 편집 중에는 접기 금지
      var rmGroup = e.target.closest('button[data-ev-remove]');
      if (rmGroup) {
        var gidX = rmGroup.getAttribute('data-ev-remove');
        state.evidence = state.evidence.filter(function (g) { return g.id !== gidX; });
        persistNotes();
        renderEvidence();
        return;
      }
      var head = e.target.closest('.ka-ev-head');
      if (head) {
        var gid = head.closest('[data-ev]').getAttribute('data-ev');
        state.evidence.forEach(function (g) { if (g.id === gid) g.open = !g.open; });
        persistNotes();
        renderEvidence();
        return;
      }
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        var card = rm.closest('.ka-ev-card');
        var gid2 = card.getAttribute('data-ev-group');
        var idx = Number(card.getAttribute('data-ev-idx'));
        state.evidence.forEach(function (g) { if (g.id === gid2) g.items.splice(idx, 1); });
        persistNotes();
        renderEvidence();
        return;
      }
      var drop = e.target.closest('button[data-drop]');
      if (drop) {
        var h = selectedHit();
        if (h) addEvidenceItem(drop.getAttribute('data-drop'), snapshotFromHit(h, state.playerSel));
        return;
      }
      var openCard = e.target.closest('.ka-ev-card');
      if (openCard) {
        var gid3 = openCard.getAttribute('data-ev-group');
        var i3 = Number(openCard.getAttribute('data-ev-idx'));
        var item = null;
        state.evidence.forEach(function (g) { if (g.id === gid3) item = g.items[i3]; });
        if (!item) return;
        if (state.hitById[item.hitId]) {
          selectHit(item.hitId);
          state.playerSel = { t0: item.t0, t1: item.t1 };
          updateSelUI();
        } else if (item.audioUrl) {
          // 현재 검색 결과에 없는 근거 — 스냅샷으로 플레이어에 직접 로드
          state.playerHitId = null;
          loadPlayer({
            id: 'ev-' + item.hitId, callId: item.callId, callDate: item.callDate,
            sourceSystem: item.sourceSystem, audioUrl: item.audioUrl, duration: item.duration,
            spanStart: item.t0, spanEnd: item.t1, phoneAlignment: item.phoneAlignment,
            phoneTimeline: item.phoneTimeline
          });
        }
      }
    });
    content.addEventListener('input', function (e) {
      var inp = e.target.closest('input[data-ev-name]');
      if (!inp) return;
      var gid = inp.getAttribute('data-ev-name');
      state.evidence.forEach(function (g) { if (g.id === gid) g.name = inp.value; });
    });
    content.addEventListener('change', function (e) {
      if (e.target.closest('input[data-ev-name]')) persistNotes();
    });
    content.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest('input[data-ev-name]')) e.target.blur();
    });
    ['dragover', 'dragenter'].forEach(function (evt) {
      content.addEventListener(evt, function (e) {
        var grp = e.target.closest('.ka-ev-group');
        if (!grp) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        grp.classList.add('is-dragover');
      });
    });
    content.addEventListener('dragleave', function (e) {
      var grp = e.target.closest('.ka-ev-group');
      if (grp && !grp.contains(e.relatedTarget)) grp.classList.remove('is-dragover');
    });
    content.addEventListener('drop', function (e) {
      var grp = e.target.closest('.ka-ev-group');
      if (!grp) return;
      e.preventDefault();
      grp.classList.remove('is-dragover');
      var id = e.dataTransfer.getData('text/plain');
      var h = state.hitById[id];
      if (h) addEvidenceItem(grp.getAttribute('data-ev'), snapshotFromHit(h, state.selectedHitId === id ? state.playerSel : null));
    });
    $('inspector-empty').addEventListener('dragover', function (e) { e.preventDefault(); });
    $('inspector-empty').addEventListener('drop', function (e) {
      e.preventDefault();
      var h = state.hitById[e.dataTransfer.getData('text/plain')];
      if (h) addEvidenceItem(state.evidence.length ? state.evidence[0].id : null, snapshotFromHit(h, null));
    });

    $('btn-add-evidence').addEventListener('click', function () {
      state.evidence.push({ id: 'ev-' + state.evidenceSeq, name: 'Evidence ' + state.evidenceSeq, open: true, items: [] });
      state.evidenceSeq++;
      persistNotes();
      renderEvidence();
    });

    $('btn-report').addEventListener('click', function () {
      var note = $('report-note');
      note.hidden = false;
      note.textContent = 'Approval report draft created — ' + evidenceTotal() + ' evidence items · ' + nowKst();
    });

    // 메모 저장 — 현재 선택 구간의 메모를 갱신/추가 (빈 텍스트 = 그 구간 메모 삭제)
    $('memo-save').addEventListener('click', function () {
      var h = selectedHit();
      if (!h) return;
      var sel = state.playerSel || { t0: toSeconds(h.spanStart), t1: toSeconds(h.spanEnd) };
      upsertMemo(h.id, sel.t0, sel.t1, $('memo-input').value.trim(), null);
      persistNotes();
      renderResults();
      renderEvidence(); // 근거 카드도 메모를 보여주므로 즉시 반영
      renderWaveMemo(); // 파형 위 메모 밴드도 갱신
    });

    // 플레이어
    var audio = $('hit-audio');
    var playBtn = $('player-play');
    playBtn.addEventListener('click', function () {
      if (audio.paused) audio.play(); else audio.pause();
    });
    audio.addEventListener('play', function () { playBtn.classList.add('is-playing'); });
    audio.addEventListener('pause', function () { playBtn.classList.remove('is-playing'); });
    audio.addEventListener('timeupdate', function () {
      var dur = audio.duration || state.playerDur || 1;
      $('player-cursor').style.left = Math.min(100, audio.currentTime / dur * 100) + '%';
      $('player-clock').textContent = fmtClock1(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration) && audio.duration > 0) {
        state.playerDur = audio.duration;
        $('player-dur').textContent = '/ ' + fmtClock1(audio.duration);
        updateSelUI();
        updatePii();
        if (state.playerObj) renderPhones(state.playerObj);
      }
    });

    $('jump-span').addEventListener('click', function () {
      var obj = playerHit();
      if (!obj) return;
      seekAndPlay(toSeconds(obj.spanStart));
    });

    $('btn-redaction').addEventListener('click', function () {
      state.piiMask = !state.piiMask;
      updatePii();
    });

    $('btn-span-evidence').addEventListener('click', function () {
      var h = selectedHit();
      if (!h || !state.playerSel) return;
      var gid = lastOpenGroupId();
      if (!gid) {
        state.evidence.push({ id: 'ev-' + state.evidenceSeq, name: 'Evidence ' + state.evidenceSeq, open: true, items: [] });
        gid = 'ev-' + state.evidenceSeq;
        state.evidenceSeq++;
      }
      addEvidenceItem(gid, snapshotFromHit(h, state.playerSel));
    });

    // 파형: 클릭 = 시점 이동, 드래그 = 구간 선택, 우클릭 = 해당 청크에 메모
    var wave = $('player-wave');
    wave.addEventListener('contextmenu', function (e) {
      if (!playerHit()) return;
      e.preventDefault();
      var band = e.target.closest('.ka-wave-memo');
      openWaveMemoEditor(e.clientX, band ? band.getAttribute('data-memo-id') : null);
    });
    $('wave-memos').addEventListener('click', function (e) {
      var del = e.target.closest('button[data-memo-del]');
      if (del) { // 밴드의 × — 해당 메모 삭제
        var obj = playerHit();
        if (obj) deleteMemo(memoKeyOf(obj), del.getAttribute('data-memo-del'));
        return;
      }
      var band = e.target.closest('.ka-wave-memo');
      if (!band) return;
      state.playerSel = { t0: Number(band.getAttribute('data-t0')) || 0, t1: Number(band.getAttribute('data-t1')) || 0 };
      updateSelUI();
      renderMemoBox(); // 좌패널 메모박스도 이 구간 메모로 전환
    });
    $('wave-memo-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commitWaveMemo();
      else if (e.key === 'Escape') cancelWaveMemo();
      e.stopPropagation();
    });
    $('wave-memo-input').addEventListener('blur', cancelWaveMemo);
    wave.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return; // 우클릭은 메모 편집
      if (e.target.closest('button, input, .ka-wave-memo, .ka-wave-memo-editor')) return; // 음소·메모 UI
      if (!playerHit()) return;
      e.preventDefault();
      var rect = wave.getBoundingClientRect();
      var dur = state.playerDur || 1;
      var x0 = e.clientX;
      var t0 = Math.max(0, Math.min(dur, (x0 - rect.left) / rect.width * dur));
      var moved = false;
      function onMove(ev) {
        var dx = ev.clientX - x0;
        if (Math.abs(dx) > 4) moved = true;
        if (!moved) return;
        var t1 = Math.max(0, Math.min(dur, (ev.clientX - rect.left) / rect.width * dur));
        state.playerSel = { t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
        updateSelUI();
      }
      function onUp(ev) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!moved) {
          try { audio.currentTime = t0; } catch (err) { /* seek 불가 */ }
        }
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    $('player-phones').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-t]');
      if (!btn) return;
      seekAndPlay(Number(btn.getAttribute('data-t')) || 0);
    });

    function seekAndPlayInner(t) {
      try { audio.currentTime = t; } catch (err) { /* seek 불가 시 처음부터 */ }
      audio.play();
    }
    window.__vxSeekAndPlay = function (t) {
      if (audio.readyState >= 1) {
        seekAndPlayInner(t);
      } else {
        // 예약 시점의 클립을 기억 — 로딩 중 다른 클립으로 바뀌면 발화하지 않는다 (유령 재생 방지)
        var key = audio.getAttribute('data-key');
        audio.addEventListener('loadedmetadata', function () {
          if (audio.getAttribute('data-key') === key) seekAndPlayInner(t);
        }, { once: true });
      }
    };

    // 관련근거 패널 폭 드래그 (320–480px)
    $('resize-handle').addEventListener('mousedown', function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = state.inspectorWidth;
      function move(ev) {
        var w = Math.min(480, Math.max(320, startW + (startX - ev.clientX)));
        state.inspectorWidth = w;
        var insp = $('inspector');
        insp.style.setProperty('--x-width', w + 'px');
        insp.style.width = w + 'px';
      }
      function up() {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        drawWave();
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    window.addEventListener('resize', function () { drawWave(); });

  }

  function seekAndPlay(t) {
    if (window.__vxSeekAndPlay) window.__vxSeekAndPlay(t);
  }

  // ---------------------------------------------------------------- init
  document.addEventListener('DOMContentLoaded', function () {
    loadNotes();
    renderHeader();
    renderCase();
    renderEvidence();
    bindEvents();
    boot();
  });
})();
