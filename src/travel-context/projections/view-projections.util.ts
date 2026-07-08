import type { TravelContextSnapshot } from '../domain/travel-context.types';
import type { OpenDecision } from '../domain/travel-context.types';

export function projectPlanView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    stage: snapshot.identity.stage,
    effectivePlan: snapshot.plan.effectivePlan,
    selectedRouteId: snapshot.plan.selectedRouteId,
    pendingProposal: snapshot.plan.pendingProposal,
    draftChanges: snapshot.plan.draftChanges,
    contractSummary: snapshot.contract.conflictSummary,
    bindings: {
      effectivePlanVersionId: snapshot.meta.bindings.effectivePlanVersionId,
      constraintsVersion: snapshot.meta.bindings.constraintsVersion,
    },
  };
}

export function projectParticipantsView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    count: snapshot.participants.count,
    publicSummary: snapshot.participants.publicSummary,
    preferenceCoverage: snapshot.participants.preferenceCoverage,
    governance: snapshot.participants.governance,
  };
}

export function projectMonitoringView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    activeCount: snapshot.monitoring.activeCount,
    paused: snapshot.monitoring.paused,
    items: snapshot.monitoring.items,
    automation: snapshot.contract.automation,
  };
}

export function projectFeasibilityView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    intent: {
      destination: snapshot.intent.destination,
      dateRange: snapshot.intent.dateRange,
      rankedPrinciples: snapshot.intent.rankedPrinciples,
    },
    contract: {
      constraints: snapshot.contract.constraints,
      conflictSummary: snapshot.contract.conflictSummary,
      changeStrategy: snapshot.contract.changeStrategy,
    },
    planExecutability: snapshot.plan.effectivePlan.executabilityStatus,
    ontologyConstraints: snapshot.world.ontologyConstraints,
    world: {
      dataCompletenessScore: snapshot.world.dataCompletenessScore,
      factCount: snapshot.world.facts.length,
      lastRefreshedAt: snapshot.world.lastRefreshedAt,
    },
  };
}

export function projectAssistantView(snapshot: TravelContextSnapshot): Record<string, unknown> {
  return {
    stage: snapshot.identity.stage,
    contextId: snapshot.identity.contextId,
    revision: snapshot.meta.revision,
    intentSummary:
      snapshot.intent.primaryGoal ??
      snapshot.intent.destination.label ??
      snapshot.intent.destination.countryCode,
    openDecisionCount: snapshot.decisions.counts.total,
    blockingDecisionCount: snapshot.decisions.counts.blocking,
    monitoringActiveCount: snapshot.monitoring.activeCount,
    hasEffectivePlan: snapshot.plan.effectivePlan.hasEffectivePlan,
    pageHints: {
      overview: '/views/overview',
      plan: '/views/plan',
      decisions: '/views/decisions',
      exploration: snapshot.identity.stage === 'EXPLORATION' ? '/views/exploration' : undefined,
    },
  };
}

export function extractPlanEffectiveVersion(planView: Record<string, unknown>): string | undefined {
  const bindings = planView.bindings as { effectivePlanVersionId?: string } | undefined;
  if (bindings?.effectivePlanVersionId) return bindings.effectivePlanVersionId;
  const effectivePlan = planView.effectivePlan as { versionId?: string } | undefined;
  return effectivePlan?.versionId;
}

export interface TripOpenDecisionSource {
  problemId: string;
  title: string;
  workflowStatus?: string;
  enforcement?: string;
  urgency?: string;
}

export function mapTripOpenDecisions(input: {
  counts: TravelContextSnapshot['decisions']['counts'];
  sources: TripOpenDecisionSource[];
}): OpenDecision[] {
  return input.sources.map((item) => ({
    decisionId: item.problemId,
    problemType: inferProblemType(item),
    title: item.title,
    urgency: normalizeUrgency(item.urgency),
    status: mapWorkflowToOpenStatus(item.workflowStatus),
    authorizationRequired: item.enforcement === 'BLOCK' || item.enforcement === 'HARD',
  }));
}

function inferProblemType(item: TripOpenDecisionSource): string {
  const title = item.title.toLowerCase();
  if (title.includes('road') || title.includes('道路')) return 'ROAD_CONDITION';
  if (title.includes('load') || title.includes('负荷')) return 'PACE';
  return 'FEASIBILITY';
}

function normalizeUrgency(raw?: string): OpenDecision['urgency'] {
  const u = String(raw ?? 'MEDIUM').toUpperCase();
  if (u === 'LOW' || u === 'MEDIUM' || u === 'HIGH' || u === 'CRITICAL') return u;
  return 'MEDIUM';
}

function mapWorkflowToOpenStatus(workflowStatus?: string): OpenDecision['status'] {
  const s = String(workflowStatus ?? 'DETECTED').toUpperCase();
  if (s === 'WAITING_USER' || s === 'WAITING_HUMAN' || s === 'WAITING_DECISION') {
    return 'WAITING_USER';
  }
  if (s === 'AUTHORIZED') return 'AUTHORIZED';
  if (s === 'EXECUTING') return 'EXECUTING';
  if (s === 'RESOLVED') return 'RESOLVED';
  if (s === 'FAILED') return 'FAILED';
  if (s === 'ANALYZING' || s === 'EVALUATING') return 'ANALYZING';
  return 'DETECTED';
}
