/**
 * Maps normalized DecisionRunRequest → downstream route target.
 */

import type {
  DecisionRunRequest,
  DecisionRunRouteTarget,
  DecisionTriggerKind,
} from '../contracts/decision-run-request';

const TRIGGER_TO_ROUTE: Record<DecisionTriggerKind, DecisionRunRouteTarget> = {
  FULL_PLAN_SELECTION: 'FULL_PLAN_SELECTION',
  CANONICAL_PROBLEM_EVALUATE: 'CANONICAL_L2_EVALUATE',
  CANONICAL_MONITORING_POLL: 'CANONICAL_MONITORING',
  GUIDE_IMPORT_REQUEST: 'FULL_PLAN_SELECTION',
  USER_INTENT: 'AGENTIC_ORCHESTRATION',
  WORLD_EVENT: 'CANONICAL_MONITORING',
  MANUAL_REPAIR_REQUEST: 'CANONICAL_L2_EVALUATE',
  IN_TRIP_DEVIATION: 'CANONICAL_L2_EVALUATE',
  LEGACY_AGENT_ROUTE: 'LEGACY_DECISION_ENGINE',
};

export function resolveDecisionRunRoute(
  input: Pick<DecisionRunRequest, 'triggerKind' | 'problemId' | 'metadata'>,
): DecisionRunRouteTarget {
  const base = TRIGGER_TO_ROUTE[input.triggerKind] ?? 'UNSUPPORTED';

  if (input.triggerKind === 'USER_INTENT') {
    const intent = String(input.metadata?.intent ?? '');
    if (intent === 'full_plan_selection') return 'FULL_PLAN_SELECTION';
    if (intent === 'canonical_evaluate' && input.problemId) {
      return 'CANONICAL_L2_EVALUATE';
    }
  }

  if (
    input.triggerKind === 'CANONICAL_PROBLEM_EVALUATE' &&
    !input.problemId?.trim()
  ) {
    return 'UNSUPPORTED';
  }

  if (
    input.triggerKind === 'FULL_PLAN_SELECTION' ||
    input.triggerKind === 'GUIDE_IMPORT_REQUEST'
  ) {
    return 'FULL_PLAN_SELECTION';
  }

  return base;
}

export function attachRouteTarget(
  request: Omit<DecisionRunRequest, 'routeTarget'>,
): DecisionRunRequest {
  return {
    ...request,
    routeTarget: resolveDecisionRunRoute(request),
  };
}
