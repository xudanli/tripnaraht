import type { PlanVariant } from '../../trips/decision/services/multi-plan-generator.service';
import type { DecisionCandidate } from './contracts/decision-candidate';

export function mapPlanVariantToDecisionCandidate(
  variant: PlanVariant,
): DecisionCandidate {
  return {
    candidateId: variant.id,
    label: variantLabel(variant.id),
    source: 'LEGACY_TRIP_PLANNING',
    plan: variant.plan,
    legacyVariant: {
      id: variant.id,
      score: variant.score,
      tradeoffs: variant.tradeoffs,
      feasibility: variant.feasibility,
    },
    utilityHint: variant.score.total,
    createdAt: new Date().toISOString(),
  };
}

function variantLabel(id: string): string {
  switch (id) {
    case 'conservative':
      return '保守方案';
    case 'balanced':
      return '平衡方案';
    case 'aggressive':
      return '激进方案';
    default:
      return id;
  }
}

export function resolveBaseCandidateId(candidates: DecisionCandidate[]): string {
  const balanced = candidates.find((c) => c.candidateId === 'balanced');
  return balanced?.candidateId ?? candidates[0]?.candidateId ?? 'original';
}
