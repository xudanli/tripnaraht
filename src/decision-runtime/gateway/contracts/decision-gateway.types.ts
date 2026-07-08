/**
 * RFC-002 Phase 1 — Unified Decision Gateway contracts.
 */

import type { ActiveDestinationPackSet } from '../../packs/contracts/destination-pack.types';

export type DecisionSemanticKey =
  | 'ROAD_SEGMENT_UNAVAILABLE'
  | 'ROAD_SEGMENT_RESTRICTED'
  | 'WEATHER_ACTIVITY_PROHIBITED'
  | 'WEATHER_ROUTE_RISK'
  | 'POI_UNAVAILABLE'
  | 'TIME_WINDOW_INFEASIBLE'
  | 'EXCESSIVE_DAILY_LOAD'
  | 'INSUFFICIENT_RECOVERY'
  | 'BOOKING_INVALID'
  | 'TRAVELER_INELIGIBLE'
  | 'BUDGET_THRESHOLD_EXCEEDED'
  | string;

export type DecisionEngineId =
  | 'CANONICAL_DECISION_RUNTIME'
  | 'LEGACY_V15_ADAPTER';

export type DecisionEngineMode = 'PRIMARY' | 'SHADOW' | 'FALLBACK';

export type RouteResolution =
  | 'PRIMARY'
  | 'SHADOW'
  | 'LEGACY_FALLBACK'
  | 'UNSUPPORTED'
  | 'EVIDENCE_MISSING'
  | 'PACK_MISSING'
  | 'ENGINE_UNAVAILABLE'
  | 'MANUAL_REVIEW';

export interface DecisionEngineRegistration {
  engineId: DecisionEngineId;
  version: string;
  supportedSemanticKeys: DecisionSemanticKey[] | ['*'];
  requiredCapabilities: string[];
  mode: DecisionEngineMode;
  priority: number;
  enabled: () => boolean;
}

export interface DecisionRouteRequest {
  tripId: string;
  problemId?: string;
  semanticKey?: string;
  destinationCountry?: string;
  hasCanonicalProblem?: boolean;
  hasExistingDecisionRecord?: boolean;
}

export interface DecisionRouteResult {
  engineId: DecisionEngineId;
  resolution: RouteResolution;
  reason: string;
  registrationVersion: string;
  recordedAt: string;
}

export interface DecisionRouteLineageEntry {
  routeId: string;
  tripId: string;
  problemId?: string;
  semanticKey?: string;
  engineId: DecisionEngineId;
  resolution: RouteResolution;
  reason: string;
  createdAt: string;
}

export interface UnifiedDecisionCenterView {
  schemaId: 'tripnara.unified_decision_center@v1';
  tripId: string;
  generatedAt: string;
  /** User-facing: no engine ids — only resolution summary */
  activeResolution: RouteResolution;
  canonical?: unknown;
  legacy?: unknown;
  problemCount: number;
  /** Phase 2 — resolved destination constraint packs (when DECISION_PACK_RUNTIME=1) */
  activePacks?: ActiveDestinationPackSet;
}

export type UnifiedDecisionProblemFlow = 'CANONICAL_L2' | 'LEGACY_V15';

export interface UnifiedDecisionProblemListItem {
  problemId: string;
  flow: UnifiedDecisionProblemFlow;
  route: DecisionRouteResult;
  semanticKey?: string;
  semanticCapability?: string;
  title: string;
  status: string;
  /** Legacy V1.5 list row when flow is LEGACY_V15 */
  legacySummary?: unknown;
  /** Canonical problem summary when flow is CANONICAL_L2 */
  canonicalSummary?: unknown;
}

export interface UnifiedDecisionProblemListView {
  schemaId: 'tripnara.unified_decision_problems@v1';
  tripId: string;
  generatedAt: string;
  meta: {
    total: number;
    canonicalCount: number;
    legacyCount: number;
  };
  items: UnifiedDecisionProblemListItem[];
}

export interface AuthorizeDecisionGatewayInput {
  tripId: string;
  decisionId: string;
  choice?: string;
}

export interface ExecuteDecisionGatewayInput {
  tripId: string;
  decisionId: string;
  idempotencyKey?: string;
}
