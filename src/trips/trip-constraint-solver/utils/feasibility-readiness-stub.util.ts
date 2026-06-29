import type { ReadinessScoreResponse } from '../../readiness/types/coverage-map.types';

/** 快速 feasibility 路径：用 snapshot 分数占位，跳过 coverage/readiness 重算 */
export function buildStubReadinessFromSnapshot(
  tripId: string,
  snapshot: Record<string, unknown> | null,
): ReadinessScoreResponse {
  const overall =
    typeof snapshot?.overallScore === 'number' && Number.isFinite(snapshot.overallScore)
      ? snapshot.overallScore
      : 75;
  const score = {
    overall,
    evidenceCoverage: overall,
    scheduleFeasibility: overall,
    transportCertainty: overall,
    safetyRisk: overall,
    buffers: overall,
  };
  return {
    tripId,
    score,
    findings: [],
    risks: [],
    summary: {
      totalFindings: 0,
      blockers: 0,
      must: 0,
      should: 0,
      highRisks: 0,
      mediumRisks: 0,
      lowRisks: 0,
    },
    calculatedAt: new Date().toISOString(),
  };
}
