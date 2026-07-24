/**
 * Offline routing classifier evaluation sample (RoutingClassifierEval@v1).
 * SSOT for shadow hook exports and corpus builders.
 */

import type { TaskType } from '../utils/orchestration-signals.util';

/** Unified routing tier for production vs shadow comparison (observability projection). */
export type RoutingClassifierTier =
  | 'SYSTEM1_API'
  | 'SYSTEM1_RAG'
  | 'SYSTEM2_REASONING'
  | 'SYSTEM2_CONSENT';

export type RoutingMismatchType = 'OVER_ROUTING' | 'UNDER_ROUTING' | 'NONE';

/** Feature vector extracted at routePolicy boundary — aligned with `RoutingSignalsFeatureVector`. */
export interface RoutingClassifierEvalFeatures {
  taskType: TaskType;
  /** 0..1 numeric projection of `ComplexityLevel` (SIMPLE/MODERATE/COMPLEX). */
  complexityScore: number;
  complexityLevel: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  latencyBudgetMs: number;
  intentModeRequested: string;
  intentModeResolved: string;
  requiresStructuredOutput: boolean;
  expectsToolCalls: boolean;
  needsAudit: boolean;
  legacyWellSupported: boolean;
  matchedRuleCount: number;
  orchestrationMode: string;
  modeLockActive: boolean;
  hasTripId: boolean;
  entryPoint?: string;
}

export interface RoutingClassifierEvalGroundTruth {
  targetRouting: RoutingClassifierTier;
  isAsync: boolean;
  annotatorNotes?: string;
}

export interface RoutingClassifierEvalRuleOutput {
  actualRouting: RoutingClassifierTier;
  orchestrationMode: string;
  /** Wall-clock ms for feature extraction + tier projection (not full route_and_run). */
  latencyMs: number;
}

/** Single labeled or pseudo-labeled evaluation row. */
export interface RoutingClassifierEvalSampleV1 {
  schemaId: 'tripnara.routing_classifier_eval@v1';
  version: 1;
  sample_id: string;
  timestamp: string;
  features: RoutingClassifierEvalFeatures;
  ground_truth: RoutingClassifierEvalGroundTruth;
  current_rule_output: RoutingClassifierEvalRuleOutput;
  shadow_output?: {
    shadowRouting: RoutingClassifierTier;
    isMatch: boolean;
    mismatchType: RoutingMismatchType;
    latencyMs: number;
  };
}

/** Runtime shadow hook payload attached to observability.trace. */
export interface ShadowRoutingEvalV1 {
  schemaId: 'tripnara.shadow_routing_eval@v1';
  version: 1;
  traceId: string;
  isMatch: boolean;
  mismatchType: RoutingMismatchType;
  productionRouting: RoutingClassifierTier;
  shadowRouting: RoutingClassifierTier;
  productionOrchestrationMode: string;
  latencyMs: number;
  features: RoutingClassifierEvalFeatures;
}
