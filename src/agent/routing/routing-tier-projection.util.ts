/**
 * Project routePolicy output + RoutingSignals → unified routing tier (System 1/2 observability plane).
 */

import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import type { RoutingSignals, TaskType } from '../utils/orchestration-signals.util';
import type { RoutingClassifierTier } from './routing-classifier-eval.types';
import { complexityLevelToScore } from './routing-signals-feature.util';

const SYSTEM1_ELIGIBLE: ReadonlySet<TaskType> = new Set([
  'CRUD',
  'DATA_LOOKUP',
  'GENERIC_QA',
  'RAG_QA',
  'CUSTOMER_SUPPORT',
]);

/**
 * Production tier at the routePolicy boundary (before CLAUDE_SM/DYNAMIC/LEGACY exec fork).
 */
export function projectProductionRoutingTier(
  signals: RoutingSignals,
  decision: OrchestrationPolicyDecision,
): RoutingClassifierTier {
  if (decision.recommendations?.requireConsent === true) {
    return 'SYSTEM2_CONSENT';
  }
  if (signals.taskType === 'RAG_QA') {
    return 'SYSTEM1_RAG';
  }
  if (SYSTEM1_ELIGIBLE.has(signals.taskType) && !signals.requiresStructuredOutput) {
    return 'SYSTEM1_API';
  }
  if (
    signals.taskType === 'TRIP_PLANNING' ||
    signals.taskType === 'BOOKING_WORKFLOW' ||
    signals.requiresStructuredOutput
  ) {
    return 'SYSTEM2_REASONING';
  }
  return 'SYSTEM2_REASONING';
}

const TIER_WEIGHT: Record<RoutingClassifierTier, number> = {
  SYSTEM1_API: 1,
  SYSTEM1_RAG: 2,
  SYSTEM2_REASONING: 3,
  SYSTEM2_CONSENT: 4,
};

export function analyzeRoutingTierMismatch(
  production: RoutingClassifierTier,
  shadow: RoutingClassifierTier,
): 'OVER_ROUTING' | 'UNDER_ROUTING' | 'NONE' {
  if (production === shadow) {
    return 'NONE';
  }
  const pW = TIER_WEIGHT[production] ?? 0;
  const sW = TIER_WEIGHT[shadow] ?? 0;
  if (sW > pW) {
    return 'UNDER_ROUTING';
  }
  if (sW < pW) {
    return 'OVER_ROUTING';
  }
  return 'NONE';
}

/**
 * v0 experimental challenger — conservative on risk/complexity; replace with ML head behind same interface.
 */
export function predictExperimentalRoutingTier(signals: RoutingSignals): RoutingClassifierTier {
  if (signals.risk === 'CRITICAL' || signals.risk === 'HIGH') {
    return 'SYSTEM2_CONSENT';
  }
  const complexityScore = complexityLevelToScore(signals.complexity);
  if (signals.taskType === 'RAG_QA' && complexityScore < 0.7) {
    return 'SYSTEM1_RAG';
  }
  if (
    SYSTEM1_ELIGIBLE.has(signals.taskType) &&
    complexityScore < 0.6 &&
    !signals.requiresStructuredOutput &&
    !signals.expectsToolCalls
  ) {
    return 'SYSTEM1_API';
  }
  if (
    signals.taskType === 'TRIP_PLANNING' ||
    signals.taskType === 'BOOKING_WORKFLOW' ||
    complexityScore >= 0.55 ||
    signals.requiresStructuredOutput
  ) {
    return 'SYSTEM2_REASONING';
  }
  return 'SYSTEM1_API';
}
