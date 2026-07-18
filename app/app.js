/* VoxLedger Hinglish Audit — frontend (plain JS, CONTRACT §9)
 * 데이터 소스: GET /api/bootstrap · POST /api/search · POST /api/transcribe (CONTRACT §6)
 * 디자인: design/VoxLedger Audio Audit.dc.html variant A 를 dc-runtime 없이 재현.
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

  // "m:ss" | "mm:ss.s" | number(sec) | "4.2" → seconds(number)
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

  function fmtSpanValue(v) { // 서버가 초(number)로 주든 "m:ss"로 주든 표기 통일
    return typeof v === 'number' ? fmtClock(v) : String(v == null ? '' : v);
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
  function btnCls(variant, size, extra) {
    var V = { primary: 'x1ewilqj x17wrial', secondary: 'x17x4s8c x1tgivj0', ghost: 'xjbqb8w x1tgivj0' };
    var S = { sm: 'x6k0iem', md: 'x1ueg155' };
    return 'astryx-button ' + variant + ' ' + size + (extra ? ' ' + extra : '') +
      ' x1n2onr6 x3nfvp2 x6s0dn4 xl56j7k x1txdalj xce4md1 xrrkdod xc342km xng3xce x1jxw6zd xjb2p0i xcr08ib x1kq96og x1e4wzip xuxw1ft x1ypdohk xrafxwg xuedmi6 x12w9bfk xlr8y92 ' +
      S[size] + ' ' + V[variant] + ' x1ilzqfv xq8i9tn x17nn4n9 xkzo27j x1wfwxd8 x13aywxo x3oybdh xk4oym4';
  }
  function btnClsDisabled(variant, size, extra) {
    var V = { primary: 'x1ewilqj x17wrial', secondary: 'x17x4s8c x1tgivj0', ghost: 'xjbqb8w x1tgivj0' };
    var S = { sm: 'x6k0iem', md: 'x1ueg155' };
    return 'astryx-button ' + variant + ' ' + size + (extra ? ' ' + extra : '') +
      ' x1n2onr6 x3nfvp2 x6s0dn4 xl56j7k x1txdalj xce4md1 xrrkdod xc342km xng3xce x1jxw6zd xjb2p0i xcr08ib x1kq96og x1e4wzip xuxw1ft xrafxwg xuedmi6 x12w9bfk xlr8y92 ' +
      S[size] + ' ' + V[variant] + ' x17nn4n9 xkzo27j x1wfwxd8 x13aywxo x1h6gzvc xbyyjgo x18o3ruo x3oybdh xk4oym4';
  }
  function dotCls(variant, pulsing) {
    var V = { success: 'xdsz4j9', warning: 'x1q8g9m5', error: 'x1pjz0fi', accent: 'x1ewilqj', neutral: 'x1q5y3ey' };
    return 'astryx-statusdot ' + variant + ' x1rg5ohu x16rqkct x2lah0s x1xc55vz xdk7pt ' + (V[variant] || V.neutral) +
      (pulsing ? ' x1mta51n x1c74tu6 x4hg4is xa4qsjk x1aquc0h' : '');
  }

  var CELL = 'astryx-table-cell xce4md1 xrrkdod xjm74w1 x9f619 xb3r6kr x1mzt3pk x13faqbe x1m189uc x9bi00s xpilulx xxymvpz x92x3c3 x1wp2rvj x1q0q8m5 xw8gpjh';
  var GROUP_ORDER = ['01 · 우선 검토', '02 · 추가 문맥 필요', '03 · 부정문맥 / 오탐 방어'];
  var DECISIONS = ['관련 후보', '무관', '추가 문맥 필요', '증거 사용 불가'];

  function decisionVariant(d) {
    if (d === '관련 후보') return 'error';
    if (d === '추가 문맥 필요') return 'warning';
    if (d === '무관') return 'success';
    if (d === '증거 사용 불가') return 'info';
    return 'neutral';
  }
  function groupVariant(g) {
    if (g.indexOf('01') === 0) return 'error';
    if (g.indexOf('02') === 0) return 'warning';
    return 'success';
  }
  function issueVariant(termSetId) {
    if (termSetId === 'forced-bundling') return 'purple';
    if (termSetId === 'false-free') return 'orange';
    if (termSetId === 'entity') return 'teal';
    return 'info';
  }

  var MODULES = [
    { id: 'search', short: '검색 데스크', title: '발음 변이 검색' },
    { id: 'live', short: '라이브 음소인식', title: '라이브 음소인식' },
    { id: 'coverage', short: '커버리지', title: '제출 모집단' }
  ];

  // 커버리지 모듈 — 디자인 정적 데이터 유지 (complete 시나리오, korea-audit-data.js)
  var COVERAGE_ROWS = [
    { group: '한빛라이프', source: 'Recorder-02', channel: 'TM 아웃바운드', received: 18442, indexed: 18442, excluded: 281, candidateRate: '4.8%', status: '완료' },
    { group: '한빛라이프', source: 'GA 제출 묶음', channel: '제휴 GA', received: 12680, indexed: 12680, excluded: 196, candidateRate: '3.9%', status: '완료' },
    { group: '새론손보', source: 'Recorder-01', channel: 'TM 아웃바운드', received: 16410, indexed: 16410, excluded: 244, candidateRate: '5.3%', status: '완료' },
    { group: '새론손보', source: 'Recorder-05', channel: '제휴 GA', received: 14502, indexed: 14502, excluded: 220, candidateRate: '4.4%', status: '완료' },
    { group: '다온헬스', source: 'Recorder-03', channel: 'TM 아웃바운드', received: 10864, indexed: 10864, excluded: 173, candidateRate: '6.1%', status: '완료' },
    { group: '다온헬스', source: 'GA 제출 묶음', channel: '제휴 GA', received: 11318, indexed: 11318, excluded: 126, candidateRate: '5.7%', status: '완료' }
  ];

  // ---------------------------------------------------------------- state
  var state = {
    booted: false,
    caseId: 'REG-HI-2026-017',
    termSets: [],
    indexMeta: null,
    module: 'search',
    termSetId: null,
    draftText: '',
    activeText: '',
    threshold: 0.55,
    useVariants: true,
    excludeNegated: false,
    searched: false,
    searching: false,
    run: null,            // 마지막 /api/search 응답
    variants: [],         // 마지막 검색의 변이 목록
    selectedHitId: null,
    decisions: {},
    exampleFamilies: [],
    excludedHitIds: [],
    collapsedGroups: [],
    collapsedCoverage: [],
    redactionPreviewed: false,
    inspectorWidth: 360,
    liveFile: null,
    liveBusy: false,
    liveResult: null
  };

  function currentTermSet() {
    for (var i = 0; i < state.termSets.length; i++) {
      if (state.termSets[i].id === state.termSetId) return state.termSets[i];
    }
    return state.termSets[0] || null;
  }

  function visibleHits() {
    var hits = (state.run && state.run.hits) ? state.run.hits.slice() : [];
    hits = hits.filter(function (h) {
      if (state.excludedHitIds.indexOf(h.id) !== -1) return false;
      if (state.excludeNegated && h.isNegated) return false;
      return true;
    });
    hits.sort(function (a, b) {
      var ga = GROUP_ORDER.indexOf(a.groupLabel); if (ga === -1) ga = GROUP_ORDER.length;
      var gb = GROUP_ORDER.indexOf(b.groupLabel); if (gb === -1) gb = GROUP_ORDER.length;
      if (ga !== gb) return ga - gb;
      return (b.effectivePhoneticScore || 0) - (a.effectivePhoneticScore || 0);
    });
    return hits;
  }

  function selectedHit() {
    var hits = visibleHits();
    for (var i = 0; i < hits.length; i++) if (hits[i].id === state.selectedHitId) return hits[i];
    return hits[0] || null;
  }

  // ---------------------------------------------------------------- offline banner
  function setOffline(on) {
    $('offline-banner').hidden = !on;
    if (on) {
      $('header-dot').className = dotCls('error', false);
      $('header-dot').setAttribute('data-variant', 'error');
      $('header-dot-label').textContent = '서버 미기동';
    }
  }

  // ---------------------------------------------------------------- header / nav
  function renderHeader() {
    var mod = null;
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === state.module) mod = MODULES[i];
    $('crumb-case').textContent = state.caseId + ' · 힝글리시 TM 오안내 감사';
    $('crumb-module').textContent = mod ? mod.title : '';

    var nav = $('module-nav');
    nav.innerHTML = MODULES.map(function (m) {
      return '<button type="button" data-module="' + m.id + '" class="' + (m.id === state.module ? 'is-active' : '') + '">' + esc(m.short) + '</button>';
    }).join('');

    var sw = $('issue-switch');
    sw.innerHTML = state.termSets.map(function (t) {
      return '<button type="button" data-termset="' + esc(t.id) + '" class="' + (t.id === state.termSetId ? 'is-active' : '') + '">' + esc(t.name) + '</button>';
    }).join('');

    // atomic 클래스가 display를 지정하므로 hidden 속성 대신 inline display로 토글한다
    $('module-search').style.display = state.module === 'search' ? 'contents' : 'none';
    $('module-live').style.display = state.module === 'live' ? '' : 'none';
    $('module-coverage').style.display = state.module === 'coverage' ? '' : 'none';

    var root = $('ka-root');
    root.className = 'ka-root ka-variant-' + (state.module === 'coverage' ? 'b' : 'a');
  }

  // ---------------------------------------------------------------- left panel
  function normPron(p) {
    var ipa = p.ipa != null ? String(p.ipa) : String(p.pronunciation || '').replace(/^\[|\]$/g, '');
    var kind = p.kind != null ? String(p.kind) : '표준';
    var isStandard = /표준|standard|canonical/i.test(kind) || (p.weight == null && !p.rule);
    // 서버 variants.expand_variants 의 kind: standard | lexicon | rule (CONTRACT §4)
    var kindLabel;
    if (/^standard$/i.test(kind)) kindLabel = '표준 발음';
    else if (/^lexicon$/i.test(kind)) kindLabel = '대체 발음';
    else if (/^(rule|variant)$/i.test(kind)) kindLabel = '발음 변이';
    else kindLabel = kind;
    return {
      surface: p.surface != null ? String(p.surface) : String(p.term || ''),
      ipa: ipa,
      kind: kindLabel,
      isStandard: isStandard,
      rule: p.rule != null ? String(p.rule) : '표준',
      weight: typeof p.weight === 'number' ? p.weight : 1
    };
  }

  function renderPanel() {
    var ts = currentTermSet();
    if (!ts) return;
    var idx = state.termSets.indexOf(ts);
    var hv = issueVariant(ts.id);
    var hypoBadge = $('hypo-badge');
    hypoBadge.className = badgeCls(hv);
    hypoBadge.setAttribute('data-variant', hv);
    hypoBadge.textContent = '가설 0' + (idx + 1);
    $('term-hypothesis').textContent = ts.hypothesis || ts.description || ts.name;

    $('term-chips').innerHTML = (ts.searchTerms || []).map(function (term) {
      return '<button type="button" data-term="' + esc(term) + '" class="' + (state.activeText === term ? 'is-active' : '') + '">' + esc(term) + '</button>';
    }).join('');

    $('ctx-include').textContent = (ts.contextTerms || []).join(' · ') || '—';
    $('ctx-exclude').textContent = (ts.negativeTerms || []).join(' · ') || '—';

    // 발음 변이: 검색 후에는 /api/search 의 variants, 그 전에는 bootstrap pronunciations
    var prons = (state.variants && state.variants.length ? state.variants : (ts.pronunciations || [])).map(normPron);
    var shown = prons.slice(0, 8);
    if (!shown.length) {
      $('pron-list').innerHTML = '<div class="ka-example-note">검색을 실행하면 G2P 발음 변이가 여기에 표시됩니다.</div>';
    } else {
      $('pron-list').innerHTML = shown.map(function (p) {
        var v = p.isStandard ? 'neutral' : 'warning';
        return '<article>' +
          '<div><strong>' + esc(p.surface) + '</strong>' +
          '<span class="' + badgeCls(v) + '" data-variant="' + v + '">' + esc(p.kind) + '</span></div>' +
          '<p>[' + esc(p.ipa) + ']</p>' +
          '<details class="ka-pronunciation-details"><summary>발음 세부</summary>' +
          '<code>' + esc(p.ipa) + '</code>' +
          '<footer><span>' + esc(p.rule) + '</span><span>가중치 ' + p.weight.toFixed(2) + '</span></footer>' +
          '</details></article>';
      }).join('');
      if (prons.length > shown.length) {
        $('pron-list').innerHTML += '<div class="ka-example-note">변이 ' + (prons.length - shown.length) + '개 더 있음</div>';
      }
    }

    $('example-note').style.display = state.exampleFamilies.length === 0 ? 'none' : '';
    $('example-note-text').textContent = '발음 예시 ' + state.exampleFamilies.length + '개 반영';

    $('combo-badge').textContent = (state.useVariants ? '변이' : '표준') + ' · ' + pct(state.threshold);
    $('mode-variants').className = state.useVariants ? 'is-active' : '';
    $('mode-baseline').className = state.useVariants ? '' : 'is-active';
    $('exclude-negated').checked = state.excludeNegated;
    $('threshold').value = String(state.threshold);
    $('threshold-label').textContent = pct(state.threshold);
  }

  // ---------------------------------------------------------------- results table
  function renderResults() {
    var hits = visibleHits();
    var run = state.run;
    $('result-count').textContent = hits.length + '건 화면 후보';
    $('current-count').textContent = String(hits.length);
    $('candidate-compact').textContent = run ? compactFmt.format(run.totalCandidateEstimate || 0) : '0';
    $('run-id').textContent = run ? (run.runId || '—') : '—';
    $('kpi-total').textContent = run ? fullFmt.format(run.totalCandidateEstimate || 0) : '0';
    $('kpi-hours').textContent = run ? (((run.totalCandidateEstimate || 0) * 0.82 / 60).toFixed(1) + 'h') : '0h';
    $('kpi-guard').textContent = run ? String(run.negationGuardCount || 0) : '0';
    $('generated-at').textContent = run && run.generatedAt ? run.generatedAt : (state.searched ? nowKst() : '—');
    if (state.indexMeta) {
      $('index-meta').textContent = '용어집 HI-0.1 · ' + (state.indexMeta.modelVersion || '음성 인덱스') +
        ' · 클립 ' + (state.indexMeta.clips != null ? state.indexMeta.clips : '—') + '건';
    }

    var hasResults = hits.length > 0;
    $('results-wrapper').style.display = hasResults ? '' : 'none';
    $('empty-state').style.display = hasResults ? 'none' : '';
    if (!hasResults) {
      if (state.searching) {
        $('empty-title').textContent = '검색 중…';
        $('empty-desc').textContent = '음소 인덱스에서 발음 변이를 정렬하고 있습니다.';
      } else if (state.searched) {
        $('empty-title').textContent = '검색 결과가 없습니다.';
        $('empty-desc').textContent = '검색어 또는 발음 유사도를 조정하세요.';
      } else {
        $('empty-title').textContent = '검색을 실행하세요.';
        $('empty-desc').textContent = '좌측에서 검색어를 고르고 검색 실행을 누르면 실제 음소 인덱스를 조회합니다.';
      }
      renderInspector();
      return;
    }

    var sel = selectedHit();
    var groups = {};
    var keys = [];
    hits.forEach(function (h) {
      var k = h.groupLabel || '02 · 추가 문맥 필요';
      if (!groups[k]) { groups[k] = []; keys.push(k); }
      groups[k].push(h);
    });
    keys.sort(function (a, b) {
      var ia = GROUP_ORDER.indexOf(a); if (ia === -1) ia = GROUP_ORDER.length;
      var ib = GROUP_ORDER.indexOf(b); if (ib === -1) ib = GROUP_ORDER.length;
      return ia - ib;
    });

    var rows = '';
    keys.forEach(function (key) {
      var items = groups[key];
      var collapsed = state.collapsedGroups.indexOf(key) !== -1;
      var gv = groupVariant(key);
      rows += '<tr class="astryx-table-row x139im0d ka-group-row' + (collapsed ? ' is-collapsed' : '') + '" data-group="' + esc(key) + '">' +
        '<td colspan="6" class="' + CELL + '"><span class="ka-group-label">' +
        '<span class="ka-group-caret" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="m6 9 6 6 6-6"></path></svg></span>' +
        '<span class="' + badgeCls(gv) + '" data-variant="' + gv + '">' + esc(key.replace(/^\d+\s*·\s*/, '')) + '</span>' +
        '<span>' + items.length + '건</span></span></td></tr>';
      if (collapsed) return;
      items.forEach(function (h) {
        var isSel = sel && h.id === sel.id;
        var d = state.decisions[h.id] || (h.reviewStatus || '미검토');
        var dv = decisionVariant(d);
        rows += '<tr class="astryx-table-row x139im0d ka-result-row' + (isSel ? ' is-selected' : '') + '" data-hit="' + esc(h.id) + '" aria-selected="' + (isSel ? 'true' : 'false') + '" tabindex="0">' +
          '<td class="' + CELL + '"><div class="ka-table-primary"><strong>' + esc(h.matchAt) + '</strong><span>' + esc(String(h.callId || '').replace(/^REG-HI-/, '#')) + '</span></div></td>' +
          '<td class="' + CELL + '"><div class="ka-table-phrase"><strong>' + esc(h.matchedText) + '</strong><span>' + esc(h.pronunciation) + '</span></div></td>' +
          '<td class="' + CELL + ' ka-cell-end"><strong class="ka-numeric">' + pct(h.effectivePhoneticScore) + '</strong></td>' +
          '<td class="' + CELL + ' ka-cell-end"><span class="' + (h.isNegated ? 'ka-score-low' : '') + '">' + pct(h.contextScore) + '</span></td>' +
          '<td class="' + CELL + ' ka-cell-end">' + pct(h.evidenceCompleteness) + '</td>' +
          '<td class="' + CELL + '"><span class="' + badgeCls(dv) + '" data-variant="' + dv + '">' + esc(d) + '</span></td></tr>';
      });
    });
    $('results-tbody').innerHTML = rows;
    renderInspector();
  }

  // ---------------------------------------------------------------- inspector
  function renderInspector() {
    var h = selectedHit();
    $('inspector-empty').style.display = h ? 'none' : '';
    $('inspector-content').hidden = !h;
    if (!h) { $('inspector-content').innerHTML = ''; return; }

    var iv = issueVariant(h.issueCode);
    var ts = null;
    for (var i = 0; i < state.termSets.length; i++) if (state.termSets[i].id === h.issueCode) ts = state.termSets[i];
    var issueLabel = ts ? ts.name : h.issueCode;

    var spanStartSec = toSeconds(h.spanStart);
    var spanText = fmtSpanValue(h.spanStart) + '–' + fmtSpanValue(h.spanEnd);
    var durLabel = typeof h.duration === 'number' ? h.duration.toFixed(1) + '초 통화' : esc(h.duration) + ' 통화';
    var decision = state.decisions[h.id] || null;
    var hashShort = h.sourceHash ? (String(h.sourceHash).slice(0, 12) + '…' + String(h.sourceHash).slice(-8)) : '—';
    var hashOk = !h.expectedHash || h.expectedHash === h.sourceHash;
    var negV = h.isNegated ? 'success' : 'info';
    var hasExample = state.exampleFamilies.indexOf(h.pronunciationFamily) !== -1;

    var bars = '';
    for (var b = 0; b < 46; b++) bars += '<span style="height: ' + (20 + ((b * 23) % 72)) + '%;"></span>';

    var html = '';
    html += '<div class="ka-inspector-heading"><div><span>선택 증거</span><h2>' + esc(h.callId) + '</h2></div>' +
      '<span class="' + badgeCls(iv) + '" data-variant="' + iv + '">' + esc(issueLabel) + '</span></div>';

    if (!hashOk) {
      html += '<div role="alert" class="x78zum5 xdt5ytf xjb2p0i"><div class="astryx-banner card warning x78zum5 x1cy8zhl x1txdalj x8o8v82 x1pzlopt x24i8r5 x1hviunn" data-container="card" data-status="warning">' +
        '<div class="astryx-banner-icon warning x78zum5 x6s0dn4 x2lah0s" data-status="warning" aria-hidden="true"><span aria-hidden="true" class="astryx-icon md warning x3nfvp2 x6s0dn4 xl56j7k x2lah0s xs3pv69 xw4jnvo x1qx5ct2 xwsyq91" data-size="md" data-color="warning"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></span></div>' +
        '<div class="x78zum5 xdt5ytf xxhr3t x98rzlu xeuugli"><div class="x1ghz6dp xjb2p0i xcr08ib x2mo6ok x1kq96og x1tgivj0">내보내기 차단</div>' +
        '<div class="x1ghz6dp xjb2p0i x141an7d x1sodnla x1ltkj2j xv1l7n4">수신 원본 SHA-256 불일치</div></div></div></div>';
    }

    html += '<div class="astryx-card default ka-audio-card x2kkz0m x153u1i6 x7giv3 x1de1mus x9f619 xjmlhfd x1ihxwbr x1rqz8me x1omyuck x14rzhog xjej9fs x4poyjn x1u1kw4e x1litavf x1y0btm7 xvy26l8 xs19ii7 x12frdag x1nex4ik xbv1mwh" data-variant="default" style="--astryx-card-padding: var(--spacing-3);">' +
      '<div class="ka-audio-title"><div>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path></svg>' +
      '<strong>' + esc(spanText) + '</strong></div>' +
      '<span class="' + badgeCls('neutral') + '" data-variant="neutral">' + durLabel + '</span></div>' +
      '<div class="ka-waveform' + (state.redactionPreviewed ? ' is-redacted' : '') + '" id="hit-waveform">' + bars +
      '<i class="ka-waveform-cursor" id="hit-wave-cursor"></i>' +
      (state.redactionPreviewed ? '<div class="ka-redaction-span"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><circle cx="12" cy="16" r="1"></circle><rect x="3" y="10" width="18" height="12" rx="2"></rect><path d="M7 10V7a5 5 0 0 1 10 0v3"></path></svg>리댁션 범위</div>' : '') +
      '</div>' +
      '<audio id="hit-audio" controls preload="metadata" src="' + esc(h.audioUrl) + '">브라우저가 오디오 재생을 지원하지 않습니다.</audio>' +
      '<div class="vx-jump-row"><button id="jump-span" type="button" class="' + btnCls('secondary', 'sm') + '" data-variant="secondary" data-size="sm">' +
      '<span class="xjp7ctv"><span class="x3nfvp2 x6s0dn4 xl56j7k x2lah0s x1kky2od xlup9mm x1j61zf2"><span aria-hidden="true" class="astryx-icon sm inherit x3nfvp2 x6s0dn4 xl56j7k x2lah0s x1heor9g x1kky2od xlup9mm x1j61zf2" data-size="sm" data-color="inherit"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg></span></span>' +
      '<span class="xb3r6kr xlyipyv xeuugli">검출 구간 재생 ' + fmtClock(spanStartSec) + '</span></span></button></div>' +
      '</div>';

    html += '<section class="ka-transcript"><span>검출 문맥</span>' +
      '<blockquote>“' + esc(h.transcript) + '”</blockquote>' +
      '<div><code>' + esc(h.phoneAlignment) + '</code>' +
      '<span class="' + badgeCls(negV) + '" data-variant="' + negV + '">' + esc(h.isNegated ? '부정문맥 검출' : h.pronunciation) + '</span></div></section>';

    html += '<section class="ka-score-stack">' +
      '<div class="ka-score"><div class="ka-score-label"><span>음소 유사도</span><strong>' + pct(h.effectivePhoneticScore) + '</strong></div>' +
      '<div class="ka-score-track is-accent" role="meter" aria-label="음소 유사도"><span style="width: ' + pct(h.effectivePhoneticScore) + ';"></span></div></div>' +
      '<div class="ka-score"><div class="ka-score-label"><span>주변 문맥</span><strong>' + pct(h.contextScore) + '</strong></div>' +
      '<div class="ka-score-track is-' + (h.isNegated ? 'success' : 'warning') + '" role="meter" aria-label="주변 문맥"><span style="width: ' + pct(h.contextScore) + ';"></span></div></div>' +
      '<div class="ka-score"><div class="ka-score-label"><span>증거 완전성</span><strong>' + pct(h.evidenceCompleteness) + '</strong></div>' +
      '<div class="ka-score-track is-success" role="meter" aria-label="증거 완전성"><span style="width: ' + pct(h.evidenceCompleteness) + ';"></span></div></div></section>';

    html += '<dl class="ka-fact-list">' +
      '<div><dt>거점 / 채널</dt><dd>' + esc((h.insurer || '—') + ' · ' + (h.channel || '—')) + '</dd></div>' +
      '<div><dt>상담원 코드</dt><dd>' + esc(h.sellerCode || '—') + '</dd></div>' +
      '<div><dt>원천</dt><dd>' + esc(h.sourceSystem || '—') + '</dd></div>' +
      '<div><dt>SHA-256</dt><dd class="ka-hash" title="' + esc(h.sourceHash || '') + '">' + esc(hashShort) + '</dd></div></dl>';

    html += '<section class="ka-review-actions"><span>조사관 판정</span><div>' +
      DECISIONS.map(function (d) {
        var v = decision === d ? 'primary' : 'secondary';
        return '<button type="button" data-decision="' + esc(d) + '" class="' + btnCls(v, 'sm') + '" data-variant="' + v + '" data-size="sm">' +
          '<span class="xjp7ctv"><span class="xb3r6kr xlyipyv xeuugli">' + esc(d) + '</span></span></button>';
      }).join('') + '</div></section>';

    html += '<div class="ka-inspector-actions">' +
      '<button id="btn-add-example" type="button" class="' + (hasExample ? btnClsDisabled('secondary', 'sm') : btnCls('secondary', 'sm')) + '" data-variant="secondary" data-size="sm"' + (hasExample ? ' disabled' : '') + '>' +
      '<span class="xjp7ctv"><span class="xb3r6kr xlyipyv xeuugli">' + (hasExample ? '발음 예시 반영됨' : '이 구간을 발음 예시로 추가') + '</span></span></button>' +
      '<button id="btn-exclude-hit" type="button" class="' + btnCls('ghost', 'sm') + '" data-variant="ghost" data-size="sm">' +
      '<span class="xjp7ctv"><span class="xb3r6kr xlyipyv xeuugli">오탐 예시로 제외</span></span></button>' +
      '<button id="btn-redaction" type="button" class="' + btnCls('ghost', 'sm') + '" data-variant="ghost" data-size="sm">' +
      '<span class="xjp7ctv"><span class="xb3r6kr xlyipyv xeuugli">' + (state.redactionPreviewed ? '리댁션 범위 해제' : '리댁션 범위 지정') + '</span></span></button>' +
      '</div>';

    $('inspector-content').innerHTML = html;

    var audio = $('hit-audio');
    var cursor = $('hit-wave-cursor');
    if (audio && cursor) {
      audio.addEventListener('timeupdate', function () {
        var dur = audio.duration || toSeconds(h.duration) || 1;
        var p = Math.min(100, (audio.currentTime / dur) * 100);
        cursor.style.left = p + '%';
      });
    }
    var jump = $('jump-span');
    if (jump) {
      jump.addEventListener('click', function () {
        if (!audio) return;
        var seekAndPlay = function () {
          try { audio.currentTime = spanStartSec; } catch (e) { /* seek 불가 시 처음부터 재생 */ }
          audio.play();
        };
        if (audio.readyState >= 1) seekAndPlay();
        else audio.addEventListener('loadedmetadata', seekAndPlay, { once: true });
      });
    }
    var addBtn = $('btn-add-example');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (h.pronunciationFamily && state.exampleFamilies.indexOf(h.pronunciationFamily) === -1) {
          state.exampleFamilies.push(h.pronunciationFamily);
          renderPanel();
          renderInspector();
        }
      });
    }
    var exBtn = $('btn-exclude-hit');
    if (exBtn) {
      exBtn.addEventListener('click', function () {
        state.excludedHitIds.push(h.id);
        if (state.selectedHitId === h.id) state.selectedHitId = null;
        renderResults();
      });
    }
    var redBtn = $('btn-redaction');
    if (redBtn) {
      redBtn.addEventListener('click', function () {
        state.redactionPreviewed = !state.redactionPreviewed;
        renderInspector();
      });
    }
    var decisionWrap = $('inspector-content').querySelector('.ka-review-actions div');
    if (decisionWrap) {
      decisionWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-decision]');
        if (!btn) return;
        state.decisions[h.id] = btn.getAttribute('data-decision');
        renderResults();
      });
    }
  }

  // ---------------------------------------------------------------- search
  function runSearch() {
    if (state.searching) return;
    state.searching = true;
    state.searched = true;
    renderResults();
    var body = {
      termSetId: state.termSetId,
      text: state.activeText || undefined,
      threshold: state.threshold,
      useVariants: state.useVariants
    };
    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('search HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      state.searching = false;
      state.run = data;
      if (!state.run.generatedAt) state.run.generatedAt = nowKst();
      state.variants = data.variants || [];
      var hits = visibleHits();
      if (!hits.some(function (x) { return x.id === state.selectedHitId; })) {
        state.selectedHitId = hits.length ? hits[0].id : null;
      }
      setOffline(false);
      renderPanel();
      renderResults();
      var cc = $('coverage-candidates');
      if (cc && data.totalCandidateEstimate != null) cc.textContent = fullFmt.format(data.totalCandidateEstimate);
    }).catch(function (err) {
      state.searching = false;
      state.run = null;
      state.variants = [];
      setOffline(true);
      renderResults();
      $('empty-title').textContent = '검색 실패';
      $('empty-desc').textContent = String(err && err.message ? err.message : err);
    });
  }

  // ---------------------------------------------------------------- live transcription
  function renderLiveResult() {
    var res = state.liveResult;
    $('live-empty').style.display = res ? 'none' : '';
    $('live-result').hidden = !res;
    var badge = $('live-badge');
    if (state.liveBusy) {
      badge.className = badgeCls('info'); badge.setAttribute('data-variant', 'info'); badge.textContent = '인식 중';
    } else if (res) {
      badge.className = badgeCls('success'); badge.setAttribute('data-variant', 'success'); badge.textContent = '인식 완료';
    } else {
      badge.className = badgeCls('neutral'); badge.setAttribute('data-variant', 'neutral'); badge.textContent = '대기';
    }
    if (!res) return;
    $('live-seconds').textContent = (Number(res.seconds) || 0).toFixed(2) + 's';
    $('live-rtf').textContent = res.rtf != null ? Number(res.rtf).toFixed(3) : '—';
    var phones = res.phones || [];
    $('live-phone-count').textContent = String(phones.length);
    $('live-ipa').textContent = res.ipa || '';
    $('live-phones').innerHTML = phones.map(function (p, i) {
      var sym = p.s != null ? p.s : (p.symbol != null ? p.symbol : '');
      var isB = sym === '▁';
      var t0 = Number(p.t0) || 0;
      return '<button type="button" data-phone-idx="' + i + '" data-t0="' + t0 + '" class="' + (isB ? 'is-boundary' : '') + '" title="' + t0.toFixed(2) + 's–' + (Number(p.t1) || 0).toFixed(2) + 's">' +
        '<span>' + esc(isB ? '▁' : sym) + '</span><small>' + t0.toFixed(2) + '</small></button>';
    }).join('');
  }

  function runTranscribe() {
    if (!state.liveFile || state.liveBusy) return;
    state.liveBusy = true;
    $('live-run').disabled = true;
    $('live-status').textContent = 'ZIPA 인식 중… (CoreML 첫 실행은 수 초 걸릴 수 있습니다)';
    renderLiveResult();
    var fd = new FormData();
    fd.append('file', state.liveFile, state.liveFile.name);
    fetch('/api/transcribe', { method: 'POST', body: fd }).then(function (r) {
      if (!r.ok) throw new Error('transcribe HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      state.liveBusy = false;
      state.liveResult = data;
      $('live-run').disabled = false;
      $('live-status').textContent = state.liveFile.name + ' 인식 완료 · ' + (Number(data.seconds) || 0).toFixed(2) + 's, RTF ' + (data.rtf != null ? Number(data.rtf).toFixed(3) : '—');
      setOffline(false);
      renderLiveResult();
    }).catch(function (err) {
      state.liveBusy = false;
      state.liveResult = null;
      $('live-run').disabled = false;
      $('live-status').textContent = '인식 실패: ' + String(err && err.message ? err.message : err);
      setOffline(true);
      renderLiveResult();
    });
  }

  // ---------------------------------------------------------------- coverage (static)
  function renderCoverage() {
    var groups = {};
    var keys = [];
    COVERAGE_ROWS.forEach(function (r) {
      if (!groups[r.group]) { groups[r.group] = []; keys.push(r.group); }
      groups[r.group].push(r);
    });
    var rows = '';
    keys.forEach(function (key) {
      var items = groups[key];
      var collapsed = state.collapsedCoverage.indexOf(key) !== -1;
      rows += '<tr class="astryx-table-row x139im0d ka-group-row' + (collapsed ? ' is-collapsed' : '') + '" data-covgroup="' + esc(key) + '">' +
        '<td colspan="6" class="' + CELL + '"><span class="ka-group-label">' +
        '<span class="ka-group-caret" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide"><path d="m6 9 6 6 6-6"></path></svg></span>' +
        '<strong>' + esc(key) + '</strong><span>' + items.length + '개 제출 소스</span></span></td></tr>';
      if (collapsed) return;
      items.forEach(function (r) {
        var sv = r.status === '완료' ? 'success' : r.status === '차단' ? 'error' : 'warning';
        rows += '<tr class="astryx-table-row x139im0d">' +
          '<td class="' + CELL + '"><div class="ka-table-primary"><strong>' + esc(r.source) + '</strong><span>' + esc(r.channel) + '</span></div></td>' +
          '<td class="' + CELL + ' ka-cell-end">' + fullFmt.format(r.received) + '</td>' +
          '<td class="' + CELL + ' ka-cell-end">' + fullFmt.format(r.indexed) + '</td>' +
          '<td class="' + CELL + ' ka-cell-end">' + fullFmt.format(r.excluded) + '</td>' +
          '<td class="' + CELL + ' ka-cell-end">' + esc(r.candidateRate) + '</td>' +
          '<td class="' + CELL + '"><span class="' + badgeCls(sv) + '" data-variant="' + sv + '">' + esc(r.status) + '</span></td></tr>';
      });
    });
    $('coverage-tbody').innerHTML = rows;
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
        state.draftText = first;
        state.activeText = first;
        $('search-input').value = first;
      }
      setOffline(false);
      var dot = $('header-dot');
      dot.className = dotCls('success', false);
      dot.setAttribute('data-variant', 'success');
      $('header-dot-label').textContent = state.indexMeta && state.indexMeta.clips != null
        ? '인덱스 ' + state.indexMeta.clips + '건 가동'
        : 'API 연결됨';
      if (state.indexMeta && state.indexMeta.modelVersion) {
        $('live-model-meta').textContent = '모델 ' + state.indexMeta.modelVersion;
      }
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
  function bindEvents() {
    $('module-nav').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-module]');
      if (!btn) return;
      state.module = btn.getAttribute('data-module');
      renderHeader();
    });

    $('issue-switch').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-termset]');
      if (!btn) return;
      state.termSetId = btn.getAttribute('data-termset');
      var ts = currentTermSet();
      var first = ts && ts.searchTerms && ts.searchTerms.length ? ts.searchTerms[0] : '';
      state.draftText = first;
      state.activeText = first;
      $('search-input').value = first;
      state.excludedHitIds = [];
      state.selectedHitId = null;
      state.variants = [];
      state.module = 'search';
      renderHeader();
      renderPanel();
      runSearch();
    });

    $('term-chips').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-term]');
      if (!btn) return;
      var term = btn.getAttribute('data-term');
      state.draftText = term;
      state.activeText = term;
      $('search-input').value = term;
      renderPanel();
      runSearch();
    });

    $('search-input').addEventListener('input', function (e) {
      state.draftText = e.target.value;
    });
    $('search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        state.activeText = state.draftText;
        renderPanel();
        runSearch();
      }
    });
    $('run-search').addEventListener('click', function () {
      state.activeText = state.draftText;
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
      $('combo-badge').textContent = (state.useVariants ? '변이' : '표준') + ' · ' + pct(state.threshold);
    });
    $('threshold').addEventListener('change', function () {
      runSearch();
    });

    $('results-tbody').addEventListener('click', function (e) {
      var g = e.target.closest('tr[data-group]');
      if (g) {
        var key = g.getAttribute('data-group');
        var idx = state.collapsedGroups.indexOf(key);
        if (idx === -1) state.collapsedGroups.push(key); else state.collapsedGroups.splice(idx, 1);
        renderResults();
        return;
      }
      var row = e.target.closest('tr[data-hit]');
      if (row) {
        state.selectedHitId = row.getAttribute('data-hit');
        state.redactionPreviewed = false;
        renderResults();
      }
    });
    $('results-tbody').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('tr[data-hit]');
      if (!row) return;
      e.preventDefault();
      state.selectedHitId = row.getAttribute('data-hit');
      state.redactionPreviewed = false;
      renderResults();
    });

    // 인스펙터 폭 드래그 (디자인 onResizeStart 이식: 320–480px)
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
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    // 라이브 음소인식
    $('live-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      state.liveFile = f || null;
      state.liveResult = null;
      $('live-run').disabled = !f;
      var audio = $('live-audio');
      if (f) {
        audio.src = URL.createObjectURL(f);
        audio.hidden = false;
        $('live-status').textContent = f.name + ' · ' + (f.size / 1024).toFixed(0) + 'KB — 인식을 실행하세요.';
      } else {
        audio.hidden = true;
        audio.removeAttribute('src');
        $('live-status').textContent = 'WAV 파일을 선택하면 ZIPA 힌디 음소 인식을 실행합니다.';
      }
      renderLiveResult();
    });
    $('live-run').addEventListener('click', runTranscribe);
    $('live-phones').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-t0]');
      if (!btn) return;
      var audio = $('live-audio');
      if (!audio || audio.hidden) return;
      try { audio.currentTime = Number(btn.getAttribute('data-t0')) || 0; } catch (err) { /* noop */ }
      audio.play();
    });

    $('coverage-tbody').addEventListener('click', function (e) {
      var g = e.target.closest('tr[data-covgroup]');
      if (!g) return;
      var key = g.getAttribute('data-covgroup');
      var idx = state.collapsedCoverage.indexOf(key);
      if (idx === -1) state.collapsedCoverage.push(key); else state.collapsedCoverage.splice(idx, 1);
      renderCoverage();
    });
  }

  // ---------------------------------------------------------------- init
  document.addEventListener('DOMContentLoaded', function () {
    renderHeader();
    renderCoverage();
    renderLiveResult();
    bindEvents();
    boot();
  });
})();
