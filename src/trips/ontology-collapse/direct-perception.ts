import type { InvariantFlow, RawObservation } from './ontology-dissolution.types';
import { detectInvariantFlows } from './invariant-flows';

/**
 * Direct pattern perception — only asks whether recurrence self-sustains, not what it “is”.
 */
export function perceive(patternStream: RawObservation[]): InvariantFlow[] {
  return detectInvariantFlows(patternStream).filter(flow => flow.selfSustaining);
}
