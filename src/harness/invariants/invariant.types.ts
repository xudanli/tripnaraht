import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import type { ContextAuthorityTrace } from '../protocol/execution-anchor.types';

export type InvariantSeverity = 'BLOCKER' | 'CRITICAL' | 'WARNING';

export interface InvariantResult {
  invariantId: string;
  pass: boolean;
  severity: InvariantSeverity;
  message?: string;
}

export interface ContextInvariantDefinition {
  invariantId: string;
  domain: string;
  severity: InvariantSeverity;
  description: string;
  evaluate(input: {
    before: TravelContextSnapshot;
    after: TravelContextSnapshot;
    trace: ContextAuthorityTrace;
  }): InvariantResult;
}

export interface EvaluateContextInvariantsInput {
  invariantIds: string[];
  before: TravelContextSnapshot;
  after: TravelContextSnapshot;
  trace: ContextAuthorityTrace;
}
