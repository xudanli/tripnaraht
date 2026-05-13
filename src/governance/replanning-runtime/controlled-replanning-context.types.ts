import type { ReplanningIntent } from '../activation/governance-activation.types';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import type { GovernanceRuntimeState } from '../runtime-state-machine/governance-runtime-state.types';

/** Executable search-space shrinkage for planners (not preference weights alone). */
export interface GovernancePlanningSearchConstraints {
  forbidRemoteHighlands: boolean;
  forbidNightCorridorExpansion: boolean;
  forbidFerryOnlyCorridors: boolean;
  /** Machine-stable tags for audit (e.g. governance.search.forbid.*). */
  constraintTags: string[];
}

/**
 * Controlled Replanning Runtime (CRR) — executable contract between governance branch and replanner.
 */
export interface ControlledReplanningContext {
  sourceGovernanceDirective: RuntimeBranchDirective;
  replanningIntent?: ReplanningIntent;
  inheritedRestrictions: string[];
  forbiddenStrategies: string[];
  /** v1: human/segment labels or corridor ids when known; often empty until corridor resolver exists. */
  preservedSegments: string[];
  replanningScope: 'day' | 'segment' | 'trip';
  /** Authoritative posture from ledger-backed GRSM (same as hydration.runtimeState at build time). */
  runtimeState: GovernanceRuntimeState;
  /** Optional explicit runtime posture projection (defaults derived from directive if omitted). */
  runtimeStateHint?: GovernanceRuntimeState;
  planningSearchConstraints: GovernancePlanningSearchConstraints;
}
