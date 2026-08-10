/**
 * VERIFY 后同步 confidence 到 DSO 宿主。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';

export interface SyncConfidenceAfterVerifyHost {
  readonly decisionKernel?: {
    setConfidence: (state: DecisionState, confidence: number) => DecisionState;
  };
}
