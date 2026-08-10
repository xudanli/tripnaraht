/**
 * STATE_UPDATE 后 relaxation fingerprint 宿主。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';

export interface RelaxationFingerprintHost {
  readonly decisionKernel?: {
    updateState: (state: DecisionState, patch: any) => DecisionState;
  };
}
