import type { LoopDefinition } from '../types/loop-definition.types';

export const LOOP_DEFINITIONS: Record<string, LoopDefinition> = {
  READINESS_REPAIR: {
    loopType: 'READINESS_REPAIR',
    triggerEventTypes: [
      'CONSTRAINT_CHANGED',
      'ITINERARY_CHANGED',
      'BLOCKER_DETECTED',
      'trip.lifecycle.state_changed',
    ],
    allowedSkills: [
      'readiness.applyRepair',
      'feasibility.validate',
      'feasibility.previewRepair',
    ],
    verifierSet: [
      'feasibility-report',
      'readiness-score',
      'trip-conflicts',
      'validate-scope',
    ],
    stopPolicy: 'readiness_repair_v1',
    humanApprovalPolicy: 'repair_requires_approval_v1',
    budgetPolicy: {
      maxIterations: 5,
      maxTokenCostUsd: 0.5,
      timeBudgetMs: 120_000,
    },
    successCriteria: {
      hardBlockersMax: 0,
      readinessScoreMin: 85,
      completionRateP10Min: 0.8,
      unresolvedHumanDecisionsMax: 2,
    },
  },
  IN_TRIP_RECOVERY: {
    loopType: 'IN_TRIP_RECOVERY',
    triggerEventTypes: [
      'WEATHER_ALERT',
      'ROAD_CLOSED',
      'TRAFFIC_DELAY',
      'LATE_DEPARTURE',
      'trip.in_trip.environment_detected',
    ],
    allowedSkills: [
      'execution-advisory',
      'environment-radar.resolve',
      'alternative-plan-generator',
    ],
    verifierSet: ['execution-advisory', 'environment-plan-heuristic', 'anchor-handoff'],
    stopPolicy: 'in_trip_recovery_v1',
    humanApprovalPolicy: 'in_trip_booking_requires_approval',
    budgetPolicy: {
      maxIterations: 3,
      maxTokenCostUsd: 0.25,
      timeBudgetMs: 60_000,
    },
    successCriteria: {
      hardBlockersMax: 0,
      readinessScoreMin: 0,
      completionRateP10Min: 0.7,
      unresolvedHumanDecisionsMax: 1,
    },
  },
  PRODUCT_IMPROVEMENT: {
    loopType: 'PRODUCT_IMPROVEMENT',
    triggerEventTypes: ['LOOP_COMPLETED', 'TRIP_COMPLETED', 'USER_REJECTED_SOLUTION'],
    allowedSkills: ['loop-eval.materialize', 'loop-eval.replay'],
    verifierSet: ['loop-eval-replay', 'e2e-replay'],
    stopPolicy: 'decision_learning_v1',
    humanApprovalPolicy: 'eval_requires_approval_v1',
    budgetPolicy: {
      maxIterations: 10,
      maxTokenCostUsd: 0,
      timeBudgetMs: 300_000,
    },
    successCriteria: {
      hardBlockersMax: 0,
      readinessScoreMin: 0,
      completionRateP10Min: 0,
      unresolvedHumanDecisionsMax: 0,
    },
  },
};

export function getLoopDefinition(loopType: string): LoopDefinition {
  const def = LOOP_DEFINITIONS[loopType];
  if (!def) {
    throw new Error(`Unknown loop type: ${loopType}`);
  }
  return def;
}
