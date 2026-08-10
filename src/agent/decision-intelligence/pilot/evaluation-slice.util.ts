/**
 * Evaluation Slice — 按 DecisionKey / Trip Phase / Evidence Quality 查看。
 * 禁止只看全局平均作为 Pilot 结论。
 */

import type { CanaryCandidateEvaluationV1 } from '../canary/canary-candidate-evaluation.util';
import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import { classifyEvidenceBucket } from '../../harness/hardening/evidence.contract';

export type TripPhaseSlice = 'PLANNING' | 'TRAVELING' | 'COMPLETED' | 'UNKNOWN';

export type EvidenceQualitySlice = 'VERIFIED_RICH' | 'MIXED' | 'WEAK';

export type EvaluationSliceKeyV1 = {
  decisionKey: string;
  tripPhase: TripPhaseSlice;
  evidenceQuality: EvidenceQualitySlice;
};

export type EvaluationSliceRowV1 = EvaluationSliceKeyV1 & {
  n: number;
  avgAggregate: number;
  avgOutcome: number;
  avgAcceptance: number;
  avgSafety: number;
  productionN: number;
  candidateN: number;
};

export type EvaluationSliceReportV1 = {
  slices: EvaluationSliceRowV1[];
  /** 显式拒绝「仅全局平均」作为结论 */
  globalAverageForbiddenAsSoleConclusion: true;
  globalAvgAggregateForReferenceOnly: number;
};

export function classifyEvidenceQualitySlice(
  evidence: EvidenceFactV1[],
): EvidenceQualitySlice {
  const bag = classifyEvidenceBucket(evidence);
  if (bag.verified >= 1 && evidence.length >= 1) return 'VERIFIED_RICH';
  if (bag.verified === 0 && bag.assumed + bag.stale > 0) return 'WEAK';
  if (evidence.length === 0) return 'WEAK';
  return 'MIXED';
}

export function buildEvaluationSliceReport(input: {
  rows: Array<{
    decisionKey: string;
    tripPhase: TripPhaseSlice;
    evidence: EvidenceFactV1[];
    evaluation: CanaryCandidateEvaluationV1;
  }>;
}): EvaluationSliceReportV1 {
  const map = new Map<string, EvaluationSliceRowV1>();
  let sum = 0;
  for (const r of input.rows) {
    const evidenceQuality = classifyEvidenceQualitySlice(r.evidence);
    const key = `${r.decisionKey}|${r.tripPhase}|${evidenceQuality}`;
    const cur =
      map.get(key) ??
      ({
        decisionKey: r.decisionKey,
        tripPhase: r.tripPhase,
        evidenceQuality,
        n: 0,
        avgAggregate: 0,
        avgOutcome: 0,
        avgAcceptance: 0,
        avgSafety: 0,
        productionN: 0,
        candidateN: 0,
      } satisfies EvaluationSliceRowV1);

    const n = cur.n + 1;
    cur.avgAggregate = (cur.avgAggregate * cur.n + r.evaluation.aggregateScore) / n;
    cur.avgOutcome = (cur.avgOutcome * cur.n + r.evaluation.metrics.outcome) / n;
    cur.avgAcceptance =
      (cur.avgAcceptance * cur.n + r.evaluation.metrics.acceptance) / n;
    cur.avgSafety = (cur.avgSafety * cur.n + r.evaluation.metrics.safety) / n;
    cur.n = n;
    if (r.evaluation.channel === 'PRODUCTION') cur.productionN += 1;
    else cur.candidateN += 1;
    map.set(key, cur);
    sum += r.evaluation.aggregateScore;
  }

  return {
    slices: [...map.values()].sort((a, b) =>
      `${a.decisionKey}${a.tripPhase}${a.evidenceQuality}`.localeCompare(
        `${b.decisionKey}${b.tripPhase}${b.evidenceQuality}`,
      ),
    ),
    globalAverageForbiddenAsSoleConclusion: true,
    globalAvgAggregateForReferenceOnly: input.rows.length
      ? sum / input.rows.length
      : 0,
  };
}
