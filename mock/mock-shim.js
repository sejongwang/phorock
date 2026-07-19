/* VoxLedger 정적 데모 shim — window.fetch 를 가로채 스냅샷(window.VX_MOCK)으로 응답한다.
 * app.js 는 서버 모드와 한 바이트도 다르지 않다 (CONTRACT §6 응답 형태 재현).
 * 스냅샷은 threshold=0.55(슬라이더 최소값) 기준 — 서버는 threshold 로 히트 포함 여부만
 * 가르므로, 상위 threshold 는 effectivePhoneticScore 클라이언트 필터와 동치다.
 */
(function () {
  'use strict';

  var realFetch = window.fetch.bind(window);
  var runSeq = 1;

  function jsonResponse(obj) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  function normText(t) {
    return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // 정확 키(termSetId|text|uv) 우선, 미스면 termSet 무관 폴백 — 질의어와 검색어가
  // 일치(우선)하거나 검색어가 질의어를 포함하는 스냅샷을 쓴다. 서버는 자유 텍스트를
  // 음소 인덱스 전체에서 부분 정합으로 찾으므로 방향이 같은 근사다. (같은 조사 유형 우선)
  function findSnapshot(termSetId, text, useVariants) {
    var searches = window.VX_MOCK.searches || {};
    var q = normText(text);
    var uv = useVariants ? '1' : '0';
    var exact = searches[String(termSetId || '') + '|' + q + '|' + uv];
    if (exact || !q) return exact || null;
    var keys = Object.keys(searches);
    var best = null;
    var bestRank = 9;
    for (var i = 0; i < keys.length; i++) {
      var p = keys[i].split('|');
      if (p[2] !== uv) continue;
      var rank;
      if (p[1] === q) rank = 1;
      else if (q.length >= 3 && p[1].indexOf(q) !== -1) rank = 3;
      else continue;
      if (p[0] === String(termSetId || '')) rank -= 1;
      if (rank < bestRank) { bestRank = rank; best = searches[keys[i]]; }
    }
    return best;
  }

  function makeRunId(termSetId, threshold) {
    var seq = String(runSeq++);
    while (seq.length < 3) seq = '0' + seq;
    return 'RUN-HI-' + String(termSetId || '').toUpperCase().replace(/-/g, '').slice(0, 4) +
      '-' + Math.round(threshold * 100) + '-' + seq;
  }

  function handleSearch(req) {
    var threshold = typeof req.threshold === 'number' ? req.threshold : 0.55;
    var runId = makeRunId(req.termSetId, threshold);
    var snap = findSnapshot(req.termSetId, req.text, req.useVariants !== false);
    if (!snap) { // 스냅샷에 없는 자유 검색어 — 결과 없음 (앱은 빈 상태를 정상 표시)
      return jsonResponse({ variants: [], hits: [], runId: runId, totalCandidateEstimate: 0, negationGuardCount: 0 });
    }
    var hits = snap.hits.filter(function (h) {
      return (h.effectivePhoneticScore || 0) >= threshold - 1e-9;
    });
    var guard = 0;
    hits.forEach(function (h) { if (h.isNegated) guard++; });
    var recallLoad = Math.max(0, 0.9 - threshold); // server/main.py 의 추정 공식 그대로
    var total = hits.length ? Math.round(hits.length * 286 + recallLoad * 4650) : 0;
    return jsonResponse({
      variants: snap.variants,
      hits: hits,
      runId: runId,
      totalCandidateEstimate: total,
      negationGuardCount: guard
    });
  }

  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    if (url.indexOf('/api/bootstrap') !== -1) {
      return jsonResponse(window.VX_MOCK.bootstrap);
    }
    if (url.indexOf('/api/search') !== -1) {
      var body = {};
      try { body = JSON.parse((init && init.body) || '{}'); } catch (e) { /* 빈 요청으로 처리 */ }
      return handleSearch(body);
    }
    return realFetch(input, init); // 오디오(상대경로) 등은 실제 네트워크로
  };
})();
