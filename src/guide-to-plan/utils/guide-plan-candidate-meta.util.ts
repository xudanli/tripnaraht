import type {
  GuidePlanCandidateDetailView,
  GuidePlanCandidatePersonaOpinions,
} from '../types/guide-to-plan.types';

export function buildPersonaOpinions(
  input: GuidePlanCandidatePersonaOpinions,
): GuidePlanCandidatePersonaOpinions {
  return input;
}

export function readPlanCandidateMeta(
  personaOpinions: unknown,
): Pick<
  GuidePlanCandidateDetailView,
  | 'decisionEngineStatus'
  | 'finalized'
  | 'canonicalRecommended'
  | 'canonicalDecisionId'
  | 'canonicalOverallStatus'
> {
  const meta = personaOpinions as GuidePlanCandidatePersonaOpinions | null | undefined;
  const canonical = meta?.canonical;
  return {
    decisionEngineStatus: meta?.decisionEngineStatus ?? 'unavailable',
    finalized: canonical?.finalized ?? false,
    canonicalRecommended: canonical?.recommended ?? false,
    canonicalDecisionId: canonical?.decisionId,
    canonicalOverallStatus: canonical?.overallStatus,
  };
}
