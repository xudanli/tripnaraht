/**
 * Nara V1 路线图封板声明。
 * 技术架构层已走完；下一层是真实旅行中的用户信任。
 */

export const V1_ROADMAP_SEAL_SCHEMA = 'nara.v1_roadmap_seal@v1' as const;

export const V1_ARCHITECTURE_ARC = [
  'Reasoning',
  'Harness',
  'World State',
  'Evidence',
  'Decision',
  'Verification',
  'Execution',
  'Ledger',
  'Outcome',
  'Learning',
  'Temporal',
  'Intervention',
  'Attention',
  'Product Journey',
  'Release Operations',
] as const;

export type V1RoadmapSealV1 = {
  schemaId: typeof V1_ROADMAP_SEAL_SCHEMA;
  version: 1;
  sealed: true;
  noMoreArchitectureLayers: true;
  nextStepNotPreWritten: true;
  nextStepDecidedByRealBetaData: true;
  architectureArc: typeof V1_ARCHITECTURE_ARC;
  operatingMechanisms: [
    'WEEKLY_NARA_RELEASE_REVIEW',
    'RELEASE_CANDIDATE_DISCIPLINE',
    'TRIP_LEVEL_PRODUCT_REVIEW',
  ];
  northStarZh: '每趟旅行有效辅助决策数';
  guidingQuestionZh: string;
  antiQuestionZh: string;
};

export function sealNaraV1Roadmap(): V1RoadmapSealV1 {
  return {
    schemaId: V1_ROADMAP_SEAL_SCHEMA,
    version: 1,
    sealed: true,
    noMoreArchitectureLayers: true,
    nextStepNotPreWritten: true,
    nextStepDecidedByRealBetaData: true,
    architectureArc: V1_ARCHITECTURE_ARC,
    operatingMechanisms: [
      'WEEKLY_NARA_RELEASE_REVIEW',
      'RELEASE_CANDIDATE_DISCIPLINE',
      'TRIP_LEVEL_PRODUCT_REVIEW',
    ],
    northStarZh: '每趟旅行有效辅助决策数',
    guidingQuestionZh:
      '哪些旅行决策用户已经愿意交给 Nara；哪些还不愿意，以及为什么？',
    antiQuestionZh: 'Nara 还能做什么？',
  };
}
