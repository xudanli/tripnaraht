import type { HarnessStepName } from '../contracts/harness-step.types';
import type { HarnessFailureLevel } from './failure-level.enum';

export type HarnessFailureKind =
  | 'FORMAT'
  | 'DATA'
  | 'LOGIC'
  | 'SAFETY'
  | 'POLICY';

export type HarnessSuggestedAction =
  | 'RETRY'
  | 'RETURN_TO_RESEARCH'
  | 'BLOCK'
  | 'NEED_USER_CONFIRM';

export interface HarnessFailureEvent {
  traceId: string;
  requestId: string;
  step: HarnessStepName;
  level: HarnessFailureLevel;
  type: HarnessFailureKind;
  code: string;
  message: string;
  autoRecoverable: boolean;
  suggestedAction: HarnessSuggestedAction;
  createdAt: string;
}
