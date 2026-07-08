/**
 * Decision engine routing — backend-owned capability map (frontend must not hardcode IS).
 */

export type DecisionEngineId =
  | 'CANONICAL_DECISION_RUNTIME'
  | 'RFC001_ICELAND_ROAD_CLOSE'
  | 'LEGACY_V15';

/** Phase 3 — canonical runtime engine id (preferred). */
export const CANONICAL_DECISION_ENGINE_ID =
  'CANONICAL_DECISION_RUNTIME' as const satisfies DecisionEngineId;

/** @deprecated Use CANONICAL_DECISION_RUNTIME */
export const LEGACY_RFC001_ICELAND_ENGINE_ID =
  'RFC001_ICELAND_ROAD_CLOSE' as const satisfies DecisionEngineId;

export interface DecisionEngineApis {
  decisionCenter: string;
  decisionCenterProblem?: string;
  /** Staging/internal L2 write paths */
  authorize?: string;
  execute?: string;
  rollback?: string;
  /** Production user-facing L2 write paths (tripId in body) */
  authorizePublic?: string;
  executePublic?: string;
  rollbackPublic?: string;
}

export interface DecisionEngineCapability {
  engineId: DecisionEngineId;
  enabled: boolean;
  label: string;
  /** How problems are matched to this engine */
  match: {
    semanticKeyPrefix?: string;
    /** RFC-001 metadata problem ids when already materialized */
    rfc001ProblemIds?: string[];
    destinationCountries?: string[];
  };
  apis: DecisionEngineApis;
}

export interface ProblemDecisionRoute {
  problemId: string;
  engineId: DecisionEngineId;
  semanticKey?: string;
}

export interface TripDecisionRoutingView {
  schemaId: 'tripnara.decision_engine_routing@v1';
  tripId: string;
  destination?: string;
  generatedAt: string;
  /** Engines available for this trip (ordered: specialized first, legacy fallback last) */
  engines: DecisionEngineCapability[];
  /** Per-problem routing (RFC-001 problems from metadata; others use defaultEngine) */
  problemRoutes: ProblemDecisionRoute[];
  defaultEngine: DecisionEngineId;
}
