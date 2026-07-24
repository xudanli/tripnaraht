import type { TravelContextSnapshot } from '../domain/travel-context.types';

export function projectOverviewView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    stage: snapshot.identity.stage,
    intent: {
      destination: snapshot.intent.destination,
      dateRange: snapshot.intent.dateRange,
      primaryGoal: snapshot.intent.primaryGoal,
      rankedPrinciples: snapshot.intent.rankedPrinciples,
    },
    planSummary: {
      hasEffectivePlan: snapshot.plan.effectivePlan.hasEffectivePlan,
      dayCount: snapshot.plan.effectivePlan.dayCount,
      itemCount: snapshot.plan.effectivePlan.itemCount,
      selectedRouteId: snapshot.plan.selectedRouteId,
    },
    openDecisions: snapshot.decisions.counts,
    monitoring: {
      activeCount: snapshot.monitoring.activeCount,
      paused: snapshot.monitoring.paused,
    },
    bindings: snapshot.meta.bindings,
  };
}
