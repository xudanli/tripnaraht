/**
 * Governance runtime branch 合并宿主。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';

export interface GovernanceRuntimeBranchHost {
  readonly decisionKernel?: {
    updateState: (state: DecisionState, patch: any) => DecisionState;
  };
}
