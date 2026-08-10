/**
 * 运营系统期 — 只看三类证据：信任增长 / 失败集中点 / 重复不可解需求。
 * No evidence, no feature.
 * Nara V1 的下一版本，不由我们想象出来，而由真实旅行暴露出来。
 */

export const OPS_SYSTEM_PRINCIPLES_SCHEMA =
  'nara.ops_system_principles@v1' as const;

export const OPS_WALL_SLOGANS = [
  'No evidence, no feature.',
  'Nara V1 的下一版本，不由我们想象出来，而由真实旅行暴露出来。',
] as const;

export type OpsEvidenceFocus =
  | 'TRUST_GROWTH'
  | 'FAILURE_CONCENTRATION'
  | 'REPEATED_UNSOLVABLE_NEED';

export type OpsSystemPrinciplesV1 = {
  schemaId: typeof OPS_SYSTEM_PRINCIPLES_SCHEMA;
  version: 1;
  phase: 'OPERATIONS_SYSTEM';
  notRoadmapState: true;
  newCapabilityNoIsHealthy: true;
  evidenceFoci: OpsEvidenceFocus[];
  wallSlogans: typeof OPS_WALL_SLOGANS;
  weeklyPrimaryQuestionZh: string;
  weeklyAntiQuestionZh: string;
  continueTripIfNoSystemicIssue: true;
};

export function getOpsSystemPrinciples(): OpsSystemPrinciplesV1 {
  return {
    schemaId: OPS_SYSTEM_PRINCIPLES_SCHEMA,
    version: 1,
    phase: 'OPERATIONS_SYSTEM',
    notRoadmapState: true,
    newCapabilityNoIsHealthy: true,
    evidenceFoci: [
      'TRUST_GROWTH',
      'FAILURE_CONCENTRATION',
      'REPEATED_UNSOLVABLE_NEED',
    ],
    wallSlogans: OPS_WALL_SLOGANS,
    weeklyPrimaryQuestionZh: '这周真实 Trip 告诉了我们什么？',
    weeklyAntiQuestionZh: '这周做了什么？',
    continueTripIfNoSystemicIssue: true,
  };
}
