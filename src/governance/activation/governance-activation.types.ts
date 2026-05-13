/**
 * Governance Activation Layer (GAL) — governance → runtime intent (no autonomous execution).
 */

import type { GovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import type { GovernanceRuntimeState } from '../runtime-state-machine/governance-runtime-state.types';
import type { GovernanceDriftSignal, GovernanceRecoveryQualityScore } from '../drift/governance-drift.types';
import type { GovernanceDriftInfluence } from '../feedback/governance-drift-influence.types';

export type GovernanceActivationType =
  | 'trigger_replanning'
  | 'escalate_policy'
  | 'suppress_execution'
  | 'require_confirmation';

export interface GovernanceActivation {
  activationType: GovernanceActivationType;
  sourceEventIds: string[];
  rationale: string[];
  activationConfidence: number;
  /** Optional structured replanning contract for orchestrator (not executed here). */
  replanningIntent?: ReplanningIntent;
}

export interface ReplanningIntent {
  trigger: 'execution_block' | 'weather_escalation' | 'route_invalidated';
  requiredActions: string[];
  preservedConstraints: string[];
  forbiddenStrategies: string[];
  replanningScope: 'day' | 'segment' | 'trip';
}

export interface SuggestedPolicyAdjustment {
  /** Machine-stable suggestion id (not applied automatically). */
  id: string;
  humanReadable: string;
  /** Ledger rows that supported this suggestion. */
  evidenceEventIds: string[];
}

export interface GovernancePressureField {
  /** 0–1 aggregate recent world-tier stress. */
  worldPressure: number;
  /** Alias for routing / trace / planner modulation (v1 == worldPressure). */
  weather: number;
  policyPressure: number;
  executionPressure: number;
  recoveryPressure: number;
}

export interface GovernanceDriftAssessment {
  signals: GovernanceDriftSignal[];
  recoveryQuality: GovernanceRecoveryQualityScore;
  driftPolicySuggestions: SuggestedPolicyAdjustment[];
  /** Orchestrator-only; hydration never applies GRSM transitions from this field. */
  advisoryEscalationEvent?: 'world_escalated' | 'execution_blocked';
}

/** Runtime governance input bag for planner / orchestrator / policy resolver. */
export interface HydratedGovernanceRuntimeContext {
  snapshot: GovernanceSnapshot;
  activations: GovernanceActivation[];
  pressure: GovernancePressureField;
  suggestedPolicyAdjustments: SuggestedPolicyAdjustment[];
  replayedEventCount: number;
  /** Authoritative GRSM posture from `governance_runtime_transition` ledger rows. */
  runtimeState: GovernanceRuntimeState;
  /** GDRES: drift signals, RQI, advisory policy hooks (read-only). */
  driftAssessment: GovernanceDriftAssessment;
  /**
   * GFIL: gated drift → runtime nudges only (no ledger).
   * Empty unless `HydrateGovernanceSnapshotOptions.allowDriftFeedbackInjection` (or downstream opt-in).
   */
  driftInfluences: GovernanceDriftInfluence[];
}

export interface HydrateGovernanceSnapshotOptions {
  maxSourceEvents?: number;
  /**
   * When true (default), applies advisory block resolution when a later non-halt allow signal exists.
   * Does not write to the ledger.
   */
  heuristicResolveBlocks?: boolean;
  /**
   * When true, applies `applyDriftInfluenceIfAllowed` so `driftInfluences` may be non-empty.
   * Default false — weak adaptive loop is opt-in per hydrate call.
   */
  allowDriftFeedbackInjection?: boolean;
}
