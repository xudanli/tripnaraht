import {
  tryApplyBoundTripItineraryItemDelete,
  tryApplyBoundTripLodgingReplace,
} from './bound-trip-itinerary-mutations.runner';
import type { BoundTripItineraryMutationsHost } from './bound-trip-itinerary-mutations.host';

describe('bound-trip-itinerary-mutations.runner', () => {
  function makeHost(
    overrides: Partial<BoundTripItineraryMutationsHost> = {},
  ): BoundTripItineraryMutationsHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      prisma: {} as BoundTripItineraryMutationsHost['prisma'],
      inferCountryFromDestination: jest.fn(() => undefined),
      loadTripPlacePoiEvidenceForAdjust: jest.fn(async () => []),
      resolvePlaceIdForItineraryAdjustApply: jest.fn(() => undefined),
      ...overrides,
    };
  }

  it('tryApplyBoundTripItineraryItemDelete rejects non-delete intent', async () => {
    const host = makeHost();
    const result = await tryApplyBoundTripItineraryItemDelete(
      host,
      'trip-1',
      'user-1',
      '今天天气怎么样',
    );
    expect(result).toEqual({ applied: false, reason: 'not_delete_intent' });
    expect(host.tripsService).toBeUndefined();
  });

  it('tryApplyBoundTripLodgingReplace rejects non-lodging intent', async () => {
    const host = makeHost();
    const result = await tryApplyBoundTripLodgingReplace(
      host,
      'trip-1',
      'user-1',
      '帮我加一个景点',
    );
    expect(result).toEqual({ applied: false, reason: 'not_lodging_replace_intent' });
  });
});
