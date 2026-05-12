import type { ConsistencyObservation, RawObservation } from './ontology-dissolution.types';
import { detectStableRegularities } from './stable-regularities';

/**
 * No model — only whether the stream respects recurrent stability.
 */
export function observeConsistency(stream: RawObservation[]): ConsistencyObservation[] {
  return detectStableRegularities(stream).map(pattern => ({
    pattern,
    description: null,
  }));
}
