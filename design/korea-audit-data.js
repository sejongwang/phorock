// Port of src/korea-audio-audit/data.ts (synthetic data)
export const CASE_ID = 'REG-HI-2026-017';

export const TERM_SETS = [
  {
    id: 'conditional-bundling',
    name: '조건부 가입 강요',
    hypothesis: '의사에 반한 연계계약 가능성',
    description:
      '주상품의 승인·혜택·접수를 부가 건강보험 또는 특약 가입과 연결한 표현을 찾습니다.',
    searchTerms: ['같이 가입', '필수 특약', '안 하면 승인 불가'],
    contextTerms: ['혜택', '승인', '접수', '플랜', '건강보험'],
    negativeTerms: ['필수가 아니다', '선택이다', '빼 드리다'],
    pronunciations: [
      {id: 'pron-bundle-standard', surface: '같이 가입', pronunciation: '[가치 가입]', phoneTokens: 'ㄱㅏ-ㅊㅣ · ㄱㅏ-ㅇㅣㅂ', kind: '표준 발음', rule: '구개음화', weight: 1},
      {id: 'pron-bundle-colloquial', surface: '같이 가임', pronunciation: '[가치 가임]', phoneTokens: 'ㄱㅏ-ㅊㅣ · ㄱㅏ-ㅇㅣㅁ', kind: '구어 변형', rule: '종성 약화', weight: 0.86},
      {id: 'pron-rider-standard', surface: '필수 특약', pronunciation: '[필쑤 트걍]', phoneTokens: 'ㅍㅣㄹ-ㅆㅜ · ㅌㅡ-ㄱㅑㄱ', kind: '표준 발음', rule: '경음화·연음', weight: 0.95},
    ],
  },
  {
    id: 'false-free',
    name: '무료 오인 판매',
    hypothesis: '유료성 설명 누락 가능성',
    description:
      '유료 부가보험·특약을 무료, 기본 제공 또는 추가 비용 없는 혜택으로 설명한 표현을 찾습니다.',
    searchTerms: ['무료 혜택', '보험료 안 나가요', '기본 포함'],
    contextTerms: ['보험료', '추가 비용', '청약서', '월', '보장'],
    negativeTerms: ['무료가 아니다', '보험료가 추가된다', '유료다'],
    pronunciations: [
      {id: 'pron-free-standard', surface: '무료 혜택', pronunciation: '[무료 혜택]', phoneTokens: 'ㅁㅜ-ㄹㅛ · ㅎㅖ-ㅌㅐㄱ', kind: '표준 발음', rule: '표준', weight: 1},
      {id: 'pron-premium-colloquial', surface: '보험료 안 나가요', pronunciation: '[보엄뇨 안 나가요]', phoneTokens: 'ㅂㅗ-ㅇㅓㅁ-ㄴㅛ · ㅇㅏㄴ · ㄴㅏ-ㄱㅏ-ㅇㅛ', kind: '구어 변형', rule: '비음화', weight: 0.93},
      {id: 'pron-included-standard', surface: '기본 포함', pronunciation: '[기본 포함]', phoneTokens: 'ㄱㅣ-ㅂㅗㄴ · ㅍㅗ-ㅎㅏㅁ', kind: '표준 발음', rule: '표준', weight: 0.9},
    ],
  },
];

export const BASE_HITS = [
  {
    id: 'hit-001', callId: 'KHI-2026-000184', issueCode: 'conditional-bundling',
    insurer: '한빛라이프', channel: 'TM 아웃바운드', sellerCode: 'AG-1042',
    callDate: '2026-02-14 10:42', matchAt: '03:18', spanStart: '03:12', spanEnd: '03:28', duration: '06:18',
    matchedText: '건강보험 특약도 같이 가입하셔야',
    transcript: '이 플랜 혜택을 받으시려면 건강보험 특약도 같이 가입하셔야 해요.',
    pronunciation: '[가치 가입하셔야]', phoneAlignment: 'ㄱㅏ-ㅊㅣ · ㄱㅏ-ㅇㅣㅂ-ㅎㅏ-ㅅㅕ-ㅇㅑ',
    searchTerms: ['같이 가입'], pronunciationFamily: 'bundle-link',
    phoneticScore: 0.94, effectivePhoneticScore: 0.94, contextScore: 0.91, evidenceCompleteness: 0.98,
    proximitySeconds: 2.4, isNegated: false, hasMetadataConflict: false,
    groupLabel: '01 · 우선 검토', sourceSystem: '제출 세트 A / Recorder-02',
    sourceHash: 'e342f1b1464a930ab52d1865c4dd7059a812b23193682d406004efeaebba9d70',
    expectedHash: 'e342f1b1464a930ab52d1865c4dd7059a812b23193682d406004efeaebba9d70',
    audioUrl: 'audio/korea-audit/reg-hi-001.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-002', callId: 'KHI-2026-000742', issueCode: 'conditional-bundling',
    insurer: '한빛라이프', channel: '제휴 GA', sellerCode: 'GA-2291',
    callDate: '2026-02-19 15:08', matchAt: '01:44', spanStart: '01:38', spanEnd: '01:54', duration: '04:36',
    matchedText: '선택이 아니라 필수 특약',
    transcript: '이건 선택이 아니라 필수 특약으로 들어가야 승인이 됩니다.',
    pronunciation: '[필쑤 트걍]', phoneAlignment: 'ㅍㅣㄹ-ㅆㅜ · ㅌㅡ-ㄱㅑㄱ',
    searchTerms: ['필수 특약', '안 하면 승인 불가'], pronunciationFamily: 'mandatory-rider',
    phoneticScore: 0.91, effectivePhoneticScore: 0.91, contextScore: 0.95, evidenceCompleteness: 0.93,
    proximitySeconds: 1.7, isNegated: false, hasMetadataConflict: false,
    groupLabel: '01 · 우선 검토', sourceSystem: '제출 세트 B / Recorder-04',
    sourceHash: '17ef4a61796aeddf5569c6c51cbec411b8f39db7f279278fc35de82ea0349b47',
    expectedHash: '17ef4a61796aeddf5569c6c51cbec411b8f39db7f279278fc35de82ea0349b47',
    audioUrl: 'audio/korea-audit/reg-hi-002.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-003', callId: 'KHI-2026-001108', issueCode: 'conditional-bundling',
    insurer: '새론손보', channel: 'TM 아웃바운드', sellerCode: 'AG-8820',
    callDate: '2026-02-22 11:31', matchAt: '04:06', spanStart: '04:00', spanEnd: '04:18', duration: '07:02',
    matchedText: '같이 가입…필수는 아닙니다',
    transcript: '같이 가입하셔도 되지만 필수는 아닙니다. 원하지 않으시면 빼 드릴게요.',
    pronunciation: '[가치 가입하셔도]', phoneAlignment: 'ㄱㅏ-ㅊㅣ · ㄱㅏ-ㅇㅣㅂ / ㅍㅣㄹ-ㅆㅜ-ㄴㅡㄴ ㅇㅏ-ㄴㅣㅁ',
    searchTerms: ['같이 가입', '필수 특약'], pronunciationFamily: 'bundle-link',
    phoneticScore: 0.89, effectivePhoneticScore: 0.89, contextScore: 0.18, evidenceCompleteness: 0.97,
    proximitySeconds: 1.2, isNegated: true, hasMetadataConflict: false,
    groupLabel: '03 · 부정문맥 / 오탐 방어', sourceSystem: '제출 세트 A / Recorder-01',
    sourceHash: '890ff9a23d6cb1a8bc9a60df257b1f80dd3c5380a863830cb5c202881a198a26',
    expectedHash: '890ff9a23d6cb1a8bc9a60df257b1f80dd3c5380a863830cb5c202881a198a26',
    audioUrl: 'audio/korea-audit/reg-hi-003.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-004', callId: 'KHI-2026-001326', issueCode: 'conditional-bundling',
    insurer: '새론손보', channel: '제휴 GA', sellerCode: 'GA-5107',
    callDate: '2026-03-01 09:12', matchAt: '02:27', spanStart: '02:22', spanEnd: '02:35', duration: '05:14',
    matchedText: '같이 가임하셔야 접수',
    transcript: '이거랑 같이 가임하셔야 접수가 됩니다.',
    pronunciation: '[가치 가임하셔야]', phoneAlignment: 'ㄱㅏ-ㅊㅣ · ㄱㅏ-ㅇㅣㅁ-ㅎㅏ-ㅅㅕ-ㅇㅑ',
    searchTerms: ['같이 가입', '안 하면 승인 불가'], pronunciationFamily: 'bundle-link',
    phoneticScore: 0.68, effectivePhoneticScore: 0.68, contextScore: 0.78, evidenceCompleteness: 0.71,
    proximitySeconds: 3.8, isNegated: false, hasMetadataConflict: false,
    groupLabel: '02 · 추가 문맥 필요', sourceSystem: '제출 세트 B / Recorder-05',
    sourceHash: '608998e35691aba3a1baa3d49d2b7f99a16d266544b0e57bf40df1acfe65ae4b',
    expectedHash: '608998e35691aba3a1baa3d49d2b7f99a16d266544b0e57bf40df1acfe65ae4b',
    audioUrl: 'audio/korea-audit/reg-hi-004.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-005', callId: 'KHI-2026-002114', issueCode: 'false-free',
    insurer: '다온헬스', channel: 'TM 아웃바운드', sellerCode: 'AG-0718',
    callDate: '2026-03-03 13:46', matchAt: '02:11', spanStart: '02:05', spanEnd: '02:18', duration: '04:52',
    matchedText: '무료 혜택…보험료는 따로 안 나가요',
    transcript: '무료 혜택이라 추가 보험료는 따로 안 나가요.',
    pronunciation: '[무료 혜택 / 보엄뇨 안 나가요]', phoneAlignment: 'ㅁㅜ-ㄹㅛ · ㅎㅖ-ㅌㅐㄱ / ㅂㅗ-ㅇㅓㅁ-ㄴㅛ',
    searchTerms: ['무료 혜택', '보험료 안 나가요'], pronunciationFamily: 'free-benefit',
    phoneticScore: 0.96, effectivePhoneticScore: 0.96, contextScore: 0.92, evidenceCompleteness: 0.98,
    proximitySeconds: 1.4, isNegated: false, hasMetadataConflict: true,
    groupLabel: '01 · 우선 검토', sourceSystem: '제출 세트 C / Recorder-02',
    sourceHash: '37982f19a51bfe712b9500c74bbb5dc159958df10ca83d555cafb6c6566b4bf5',
    expectedHash: '37982f19a51bfe712b9500c74bbb5dc159958df10ca83d555cafb6c6566b4bf5',
    audioUrl: 'audio/korea-audit/reg-hi-005.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-006', callId: 'KHI-2026-002519', issueCode: 'false-free',
    insurer: '다온헬스', channel: '제휴 GA', sellerCode: 'GA-6172',
    callDate: '2026-03-05 16:22', matchAt: '01:09', spanStart: '01:03', spanEnd: '01:16', duration: '03:41',
    matchedText: '기본으로 포함…추가 비용이 없습니다',
    transcript: '기본으로 포함되는 보장이라 추가 비용이 없습니다.',
    pronunciation: '[기본 포함]', phoneAlignment: 'ㄱㅣ-ㅂㅗㄴ · ㅍㅗ-ㅎㅏㅁ',
    searchTerms: ['기본 포함', '보험료 안 나가요'], pronunciationFamily: 'included-benefit',
    phoneticScore: 0.88, effectivePhoneticScore: 0.88, contextScore: 0.87, evidenceCompleteness: 0.91,
    proximitySeconds: 2.2, isNegated: false, hasMetadataConflict: false,
    groupLabel: '01 · 우선 검토', sourceSystem: '제출 세트 C / Recorder-03',
    sourceHash: 'fdcac2bc4d881f841fbec4d003437d9fc3d6ca96fd6f5473121590ed7df73050',
    expectedHash: 'fdcac2bc4d881f841fbec4d003437d9fc3d6ca96fd6f5473121590ed7df73050',
    audioUrl: 'audio/korea-audit/reg-hi-006.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-007', callId: 'KHI-2026-002880', issueCode: 'false-free',
    insurer: '한빛라이프', channel: 'TM 아웃바운드', sellerCode: 'AG-4490',
    callDate: '2026-03-06 10:03', matchAt: '03:34', spanStart: '03:29', spanEnd: '03:43', duration: '06:08',
    matchedText: '무료가 아니라…보험료가 추가됩니다',
    transcript: '무료가 아니라 월 보험료 팔천구백 원이 추가됩니다.',
    pronunciation: '[무료가 아니라]', phoneAlignment: 'ㅁㅜ-ㄹㅛ-ㄱㅏ · ㅇㅏ-ㄴㅣ-ㄹㅏ',
    searchTerms: ['무료 혜택', '보험료 안 나가요'], pronunciationFamily: 'free-benefit',
    phoneticScore: 0.94, effectivePhoneticScore: 0.94, contextScore: 0.12, evidenceCompleteness: 0.99,
    proximitySeconds: 1.1, isNegated: true, hasMetadataConflict: false,
    groupLabel: '03 · 부정문맥 / 오탐 방어', sourceSystem: '제출 세트 A / Recorder-02',
    sourceHash: 'a478e6e1d39e3422ac7b391a607e9adc2e986e6f622c3c21fe50ecff1c9b06df',
    expectedHash: 'a478e6e1d39e3422ac7b391a607e9adc2e986e6f622c3c21fe50ecff1c9b06df',
    audioUrl: 'audio/korea-audit/reg-hi-007.wav', reviewStatus: '미검토',
  },
  {
    id: 'hit-008', callId: 'KHI-2026-003402', issueCode: 'false-free',
    insurer: '새론손보', channel: '제휴 GA', sellerCode: 'GA-2038',
    callDate: '2026-03-08 14:57', matchAt: '05:02', spanStart: '04:56', spanEnd: '05:12', duration: '08:20',
    matchedText: '무료 혜택…청약서에는 월 8,900원',
    transcript: '무료 혜택이 맞고요. 다만 청약서에는 월 팔천구백 원으로 표시됩니다.',
    pronunciation: '[무료 혜택]', phoneAlignment: 'ㅁㅜ-ㄹㅛ · ㅎㅖ-ㅌㅐㄱ',
    searchTerms: ['무료 혜택'], pronunciationFamily: 'free-benefit',
    phoneticScore: 0.71, effectivePhoneticScore: 0.71, contextScore: 0.74, evidenceCompleteness: 0.94,
    proximitySeconds: 3.6, isNegated: false, hasMetadataConflict: true,
    groupLabel: '02 · 추가 문맥 필요', sourceSystem: '제출 세트 B / Recorder-04',
    sourceHash: '60aa27a39f281667213000e03a5654825ec6cc4892ebd10881538eb34615aba2',
    expectedHash: '60aa27a39f281667213000e03a5654825ec6cc4892ebd10881538eb34615aba2',
    audioUrl: 'audio/korea-audit/reg-hi-008.wav', reviewStatus: '미검토',
  },
];

export const COVERAGE_ROWS = [
  {id: 'coverage-1', group: '한빛라이프', source: 'Recorder-02', channel: 'TM 아웃바운드', received: 18442, indexed: 18442, excluded: 281, candidateRate: '4.8%', status: '완료'},
  {id: 'coverage-2', group: '한빛라이프', source: 'GA 제출 묶음', channel: '제휴 GA', received: 12680, indexed: 12680, excluded: 196, candidateRate: '3.9%', status: '완료'},
  {id: 'coverage-3', group: '새론손보', source: 'Recorder-01', channel: 'TM 아웃바운드', received: 16410, indexed: 16410, excluded: 244, candidateRate: '5.3%', status: '완료'},
  {id: 'coverage-4', group: '새론손보', source: 'Recorder-05', channel: '제휴 GA', received: 14502, indexed: 14493, excluded: 220, candidateRate: '4.4%', status: '부분 완료'},
  {id: 'coverage-5', group: '다온헬스', source: 'Recorder-03', channel: 'TM 아웃바운드', received: 10864, indexed: 10864, excluded: 173, candidateRate: '6.1%', status: '완료'},
  {id: 'coverage-6', group: '다온헬스', source: 'GA 제출 묶음', channel: '제휴 GA', received: 11318, indexed: 11313, excluded: 126, candidateRate: '5.7%', status: '부분 완료'},
];

export const AUDIT_MANIFESTS = {
  complete: {
    scenario: 'complete', receivedFiles: 84216, duplicateFiles: 1240, inScopeFiles: 82976,
    indexedFiles: 82976, unindexedFiles: 0, indexedMinutes: 478680, coverageRate: 100,
    integrityStatus: 'verified', failureReasons: [],
  },
  'coverage-gap': {
    scenario: 'coverage-gap', receivedFiles: 84216, duplicateFiles: 1240, inScopeFiles: 82976,
    indexedFiles: 82962, unindexedFiles: 14, indexedMinutes: 478581, coverageRate: 99.98,
    integrityStatus: 'partial',
    failureReasons: [
      {label: '지원되지 않는 코덱', count: 9},
      {label: '원본 파일 누락', count: 3},
      {label: '수신 해시 불일치', count: 2},
    ],
  },
  'hash-mismatch': {
    scenario: 'hash-mismatch', receivedFiles: 84216, duplicateFiles: 1240, inScopeFiles: 82976,
    indexedFiles: 82976, unindexedFiles: 0, indexedMinutes: 478680, coverageRate: 100,
    integrityStatus: 'blocked',
    failureReasons: [{label: '선택 증거 원본 해시 불일치', count: 1}],
  },
};

export function getTermSet(id) {
  return TERM_SETS.find(termSet => termSet.id === id) ?? TERM_SETS[0];
}

function normalize(value) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function matchesSearchText(hit, searchText) {
  const needle = normalize(searchText);
  if (!needle) return true;
  return hit.searchTerms.some(term => {
    const normalizedTerm = normalize(term);
    return normalizedTerm.includes(needle) || needle.includes(normalizedTerm);
  });
}

export function runSimulatedSearch(query) {
  const results = BASE_HITS
    .filter(hit => hit.issueCode === query.termSetId)
    .filter(hit => matchesSearchText(hit, query.searchText))
    .filter(hit => !query.excludedHitIds.has(hit.id))
    .map(hit => {
      const exampleBoost = query.exampleFamilies.has(hit.pronunciationFamily) ? 0.06 : 0;
      const effectivePhoneticScore = Math.min(0.99, hit.phoneticScore + exampleBoost);
      const groupLabel = hit.isNegated
        ? '03 · 부정문맥 / 오탐 방어'
        : hit.contextScore >= 0.8 && hit.evidenceCompleteness >= 0.85
          ? '01 · 우선 검토'
          : '02 · 추가 문맥 필요';
      return {...hit, effectivePhoneticScore, groupLabel};
    })
    .filter(hit => hit.effectivePhoneticScore >= query.threshold)
    .filter(hit => {
      if (query.booleanMode === 'OR') return true;
      return hit.proximitySeconds <= query.proximitySeconds;
    })
    .filter(hit => !(query.excludeNegated && hit.isNegated))
    .sort((a, b) => {
      const groupCompare = a.groupLabel.localeCompare(b.groupLabel, 'ko');
      if (groupCompare !== 0) return groupCompare;
      return b.effectivePhoneticScore - a.effectivePhoneticScore;
    });

  const recallLoad = Math.max(0, 0.9 - query.threshold);
  const totalCandidateEstimate =
    results.length === 0 ? 0 : Math.round(results.length * 286 + recallLoad * 4650);
  const estimatedReviewHours = Number(((totalCandidateEstimate * 0.82) / 60).toFixed(1));
  const negationGuardCount = results.filter(hit => hit.isNegated).length;

  return {
    runId: `RUN-KO-${query.termSetId === 'conditional-bundling' ? 'CB' : 'FF'}-${Math.round(query.threshold * 100)}-${query.proximitySeconds}`,
    query,
    results,
    totalCandidateEstimate,
    estimatedReviewHours,
    negationGuardCount,
    generatedAt: '2026-07-18 16:30 KST',
  };
}

export function createEvidencePacket(hit, searchRun, manifest, decision, redactionPreviewed) {
  const exportGate =
    manifest.unindexedFiles > 0
      ? 'coverage-blocked'
      : manifest.integrityStatus === 'blocked'
        ? 'hash-blocked'
        : 'ready';
  return {
    packetId: `PACK-${hit.callId.replace('KHI-', '')}`,
    caseId: CASE_ID,
    searchRunId: searchRun.runId,
    sourceCallId: hit.callId,
    sourceHash: hit.sourceHash,
    termSetVersion: 'KO-INS-TERMSET-0.3',
    phoneticIndexVersion: 'SIM-KO-PHONE-0.2',
    exactSpan: `${hit.spanStart}–${hit.spanEnd}`,
    reviewDecision: decision,
    redactionState: redactionPreviewed ? 'previewed' : 'none',
    exportGate,
  };
}
