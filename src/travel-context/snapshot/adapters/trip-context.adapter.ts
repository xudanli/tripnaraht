/**
 * @deprecated Import from trip-context.adapter.service — kept for harness/tests.
 */
import { TravelContextRevisionService } from '../travel-context-revision.service';
import {
  mapTripContextSnapshotToTravelContext as mapTripWithRevision,
  type TripContextAdapterInput,
} from './trip-context.adapter.service';

export type { TripContextAdapterInput };

export function mapTripContextSnapshotToTravelContext(
  input: Omit<TripContextAdapterInput, 'revisionService' | 'openDecisionSources'> & {
    revisionService?: TravelContextRevisionService;
  },
) {
  return mapTripWithRevision({
    ...input,
    revisionService: input.revisionService ?? new TravelContextRevisionService(),
  });
}

export { mapWorldFactsFromTripSnapshot } from './trip-context.adapter-mappers';
