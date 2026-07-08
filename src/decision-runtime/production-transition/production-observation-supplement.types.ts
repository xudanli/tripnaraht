/**
 * Optional production metrics overlay — Prometheus / ledger / APM export target.
 * @see config/decision-runtime/production-metrics.template.json
 */

export const PRODUCTION_OBSERVATION_METRICS_SCHEMA_ID =
  'tripnara.production_observation_metrics@v1';

export interface ProductionObservationMetricsOverlay {
  schemaId?: typeof PRODUCTION_OBSERVATION_METRICS_SCHEMA_ID;
  generatedAt?: string;
  windowDays?: number;
  source?: string;
  authorization?: {
    unauthorizedExecuteCount?: number;
    expiredStillExecutedCount?: number;
  };
  executor?: {
    duplicateExecuteCount?: number;
    shadowEffectiveWriteCount?: number;
    runtimeWriteGuardBlockedCount?: number;
  };
  monitoring?: {
    duplicateDecisionRunCount?: number;
    eventsProcessed?: number;
  };
  latency?: {
    p95GrowthPct?: number | null;
    gatewayErrorRatePct?: number;
  };
  constraint?: {
    blockWinnerCount?: number;
  };
  trigger?: {
    gatewayCoveragePct?: number;
    dispatchTotal?: number;
    dispatchFailed?: number;
  };
  volume?: {
    formalTriggerRequests?: number;
    canonicalShadowDispatches?: number;
    constraintComparisons?: number;
    authorizationEvaluations?: number;
    effectivePlanExecutions?: number;
    monitoringEvents?: number;
    coreScenariosCovered?: number;
    destinationPacksCovered?: number;
    fallbackDrillsCompleted?: number;
  };
}

export interface ProductionObservationArchitectureLint {
  pass: boolean;
  executorBypassCount: number;
  legacyBooleanCallerCount: number;
  generatedAt?: string;
}

export interface ProductionObservationSupplement {
  metricsOverlay?: ProductionObservationMetricsOverlay;
  architectureLint?: ProductionObservationArchitectureLint;
  legacyFallbackDrillPass?: boolean;
  effectivePlanWriteGuard?: boolean;
  writeChainStatus?: {
    writeChainEnabled?: boolean;
    phase6LegacyDeprecation?: boolean;
    gatewayDomainRulesExclusive?: boolean;
    constraintPlanVerifyProjection?: boolean;
    agentItineraryPendingCount?: number;
  };
}
