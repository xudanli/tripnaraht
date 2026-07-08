import type { TravelContextSnapshot } from '../domain/travel-context.types';

export function projectDecisionsView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    open: snapshot.decisions.open,
    counts: snapshot.decisions.counts,
  };
}

export function extractOpenDecisionCountFromOverview(
  overview: Record<string, unknown>,
): number | undefined {
  const openDecisions = overview.openDecisions as { total?: number } | undefined;
  return openDecisions?.total;
}

export function extractEffectivePlanVersionFromPlanView(
  planView: Record<string, unknown>,
): string | undefined {
  const effectivePlan = planView.effectivePlan as { versionId?: string } | undefined;
  return effectivePlan?.versionId;
}
