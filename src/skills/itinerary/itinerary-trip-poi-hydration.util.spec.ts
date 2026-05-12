// src/skills/itinerary/itinerary-trip-poi-hydration.util.spec.ts
import { applyTripPoiEvidencePatch } from './itinerary-trip-poi-hydration.util';

describe('applyTripPoiEvidencePatch', () => {
  it('Trip POI 在前且写入 slots_by_day，research 中未出现的 POI 追加', () => {
    const out = applyTripPoiEvidencePatch(
      {
        poi_evidence: {
          pois: [{ poi_id: 'r1', name: 'ResearchOnly' }],
          foo: 1,
        },
      },
      {
        pois: [{ poi_id: 't1', name: 'TripOne', evidence_id: 'e_t1' }],
        slots_by_day: [[{ poi_id: 't1' }], [{ poi_id: 't1' }]],
      },
    );
    expect(out?.poi_evidence?.trip_slot_source).toBe('trip_db');
    expect(out?.poi_evidence?.slots_by_day).toEqual([[{ poi_id: 't1' }], [{ poi_id: 't1' }]]);
    expect(out?.poi_evidence?.pois?.map((p: any) => p.poi_id)).toEqual(['t1', 'r1']);
    expect(out?.poi_evidence?.foo).toBe(1);
  });

  it('patch 为 null 时原样返回', () => {
    const rd = { a: 1 };
    expect(applyTripPoiEvidencePatch(rd, null)).toBe(rd);
  });
});
