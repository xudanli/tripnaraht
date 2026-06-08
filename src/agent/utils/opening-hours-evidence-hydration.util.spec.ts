import {
  buildOpeningHoursEvidenceIndex,
  collectNumericPlaceIdsFromItinerary,
  mergeOpeningHoursEvidenceLists,
  resolveItineraryItemOpeningHours,
} from './opening-hours-evidence-hydration.util';
import type { Itinerary } from '../interfaces/trip-plan.interface';

describe('opening-hours-evidence-hydration', () => {
  it('collects numeric place ids from itinerary POI items', () => {
    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              id: 'a',
              type: 'POI',
              start_window: '09:00',
              end_window: '11:00',
              location_ref: { place_id: '381041', name: '冰河湖' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };
    expect(collectNumericPlaceIdsFromItinerary(itinerary)).toEqual(['381041']);
  });

  it('indexes evidence by normalized poi id', () => {
    const map = buildOpeningHoursEvidenceIndex([
      { poi_id: '381041', opening_hours: '09:00-18:00' },
    ]);
    expect(map.get('381041')?.opening_hours).toBe('09:00-18:00');
  });

  it('resolveItineraryItemOpeningHours reads item metadata and poi_evidence', () => {
    const fromMeta = resolveItineraryItemOpeningHours(
      {
        location_ref: { place_id: '381073', name: '维克超市' },
        metadata: { opening_hours: '10:00-22:00' },
      },
      {},
    );
    expect(fromMeta?.source).toBe('item_metadata');

    const fromPoi = resolveItineraryItemOpeningHours(
      {
        location_ref: { place_id: '381041', name: '冰河湖' },
      },
      {
        poi_evidence: {
          pois: [{ poi_id: '381041', openingHours: { osmFormat: '24/7' } }],
        },
      },
    );
    expect(fromPoi?.source).toBe('poi_evidence');
  });

  it('merges fetched rows without dropping prior', () => {
    const merged = mergeOpeningHoursEvidenceLists(
      [{ poi_id: '1', opening_hours: '08:00-20:00' }],
      [{ poi_id: '2', opening_hours: { osmFormat: '24/7' } }],
    );
    expect(merged).toHaveLength(2);
  });
});
