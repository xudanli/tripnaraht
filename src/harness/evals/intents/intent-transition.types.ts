import type { TravelContextDomain } from '../../../travel-context/domain/travel-context.constants';
import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import type { ContextAuthorityTrace } from '../../protocol/execution-anchor.types';
import type {
  TravelContextHarnessOutcome,
  TravelContextIntent,
} from '../../protocol/harness-case.types';

export type IntentTransitionOutcome = TravelContextHarnessOutcome;

export interface IntentTransitionInput {
  snapshot: TravelContextSnapshot;
  intent: TravelContextIntent;
  runtimeAuthority: ContextAuthorityTrace['authority']['runtime'];
  authorityRunId: string;
  gateway?: string;
}

export interface IntentTransitionResult {
  outcome: IntentTransitionOutcome;
  reasonCodes: string[];
  outputSnapshot: TravelContextSnapshot;
  changedDomains: TravelContextDomain[];
  events: string[];
  trace: ContextAuthorityTrace;
}
