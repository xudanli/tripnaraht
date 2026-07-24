/**
 * Agent orchestration (RL / DAG) — trip mutation action detection + write-chain gate.
 */

import {
  EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  buildEffectivePlanWriteChainBadRequestBody,
  isDirectPlanMutationBlocked,
} from './effective-plan-write-chain-blocked.util';

const EXACT_MUTATION_ACTIONS = new Set([
  'readiness.applyRepair',
  'readiness.apply-repair',
  'feasibility.applyRepair',
  'trip.resolveConflicts',
  'planning.commitPlan',
  'planning.commit_plan',
  'execution.reorder',
  'execution.applyFallback',
  'execution.apply-fallback',
  'tripPlanner.applySuggestion',
  'tripPlanner.fixNightActivities',
  'trip.apply_user_edit',
]);

const MUTATION_ACTION_PATTERNS: RegExp[] = [
  /apply[-_]?repair/i,
  /resolve[-_]?conflicts/i,
  /commit[-_]?plan/i,
  /feasibility.*apply/i,
  /itinerary.*(update|mutate|write|delete|create)/i,
  /trip.*(mutate|write|apply)/i,
  /plan.*(mutate|write|commit)/i,
];

export function isAgentTripMutationAction(action: string): boolean {
  const name = String(action ?? '').trim();
  if (!name) return false;
  if (EXACT_MUTATION_ACTIONS.has(name)) return true;
  return MUTATION_ACTION_PATTERNS.some((re) => re.test(name));
}

export type AgentOrchestrationWriteGateResult = {
  blocked: boolean;
  code?: typeof EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE;
  message?: string;
  authorizedPaths?: readonly string[];
};

export function evaluateAgentOrchestrationWriteGate(
  action: string,
  caller = 'RLIntegration.preDecision',
): AgentOrchestrationWriteGateResult {
  if (!isDirectPlanMutationBlocked() || !isAgentTripMutationAction(action)) {
    return { blocked: false };
  }
  const body = buildEffectivePlanWriteChainBadRequestBody(caller);
  return {
    blocked: true,
    code: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
    message: body.message,
    authorizedPaths: EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  };
}
