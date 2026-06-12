/**
 * RoutingSignals → structured feature vector for offline eval / shadow hook.
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import type { ComplexityLevel, RoutingSignals } from '../utils/orchestration-signals.util';
import type { RoutingClassifierEvalFeatures } from './routing-classifier-eval.types';

const COMPLEXITY_SCORE: Record<ComplexityLevel, number> = {
  SIMPLE: 0.25,
  MODERATE: 0.55,
  COMPLEX: 0.85,
};

export function complexityLevelToScore(level: ComplexityLevel): number {
  return COMPLEXITY_SCORE[level];
}

export function buildRoutingSignalsFeatureVector(input: {
  request: RouteAndRunRequestDto;
  signals: RoutingSignals;
  decision: OrchestrationPolicyDecision;
  modeLockActive?: boolean;
}): RoutingClassifierEvalFeatures {
  const { request, signals, decision, modeLockActive = false } = input;
  return {
    taskType: signals.taskType,
    complexityScore: complexityLevelToScore(signals.complexity),
    complexityLevel: signals.complexity,
    risk: signals.risk,
    latencyBudgetMs: signals.latencyBudgetMs,
    intentModeRequested: signals.intent_mode_requested,
    intentModeResolved: signals.intent_mode_resolved,
    requiresStructuredOutput: signals.requiresStructuredOutput,
    expectsToolCalls: signals.expectsToolCalls,
    needsAudit: signals.needsAudit,
    legacyWellSupported: signals.legacyWellSupported,
    matchedRuleCount: decision.matchedRules.length,
    orchestrationMode: decision.mode,
    modeLockActive,
    hasTripId: Boolean(request.trip_id?.trim()),
    entryPoint: request.options?.entry_point,
  };
}
