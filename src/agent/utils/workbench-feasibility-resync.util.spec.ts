import { resyncWorkbenchOpeningHoursFeasibility } from './workbench-feasibility-resync.util';
import type { GateResult, Itinerary } from '../interfaces/trip-plan.interface';

const itinerary: Itinerary = {
  request_id: 't1',
  days: [
    {
      date: '2026-06-03',
      items: [
        {
          id: 'skaftafell',
          type: 'POI',
          start_window: '11:30',
          end_window: '14:00',
          location_ref: { place_id: '381041', name: '斯卡夫塔山国家公园' },
          evidence_refs: [],
        },
      ],
    },
  ],
};

describe('workbench-feasibility-resync.util', () => {
  it('replaces stale POI_CLOSED with empty when summer hours allow visit', async () => {
    const gate: GateResult = {
      gate_result: 'ALLOW',
      confidence: 0.8,
      violations: [
        {
          type: 'DATA_MISSING',
          severity: 'SOFT',
          detail:
            '[VERIFY] POI_CLOSED [entity:POI:skaftafell]: POI "斯卡夫塔山国家公园" 在 09:00 不在开放时间内',
          verify_synthetic: true,
        },
      ],
    };

    const out = await resyncWorkbenchOpeningHoursFeasibility({
      gate,
      itinerary,
      researchData: {
        country_code: 'IS',
        opening_hours_evidence: [
          { poi_id: '381041', opening_hours: 'Summer 8:00-18:00, Winter 9:00-17:00' },
        ],
      },
      shouldResync: true,
    });

    const ohViolations = (out?.violations ?? []).filter((v) =>
      String(v.detail ?? '').includes('POI_CLOSED'),
    );
    expect(ohViolations).toHaveLength(0);
  });
});
