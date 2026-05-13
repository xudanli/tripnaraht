import type { GovernanceRuntimeState } from './governance-runtime-state.types';

/** Planner-facing behavioral mode derived from GRSM (v1). */
export type PlannerGovernanceMode = 'exploratory' | 'conservative' | 'recovery' | 'emergency';

export function mapGovernanceRuntimeStateToPlannerMode(state: GovernanceRuntimeState): PlannerGovernanceMode {
  switch (state) {
    case 'RECOVERING':
      return 'recovery';
    case 'RESTRICTED':
    case 'BLOCKED':
    case 'REPLANNING':
      return 'conservative';
    case 'HALTED':
      return 'emergency';
    default:
      return 'exploratory';
  }
}
