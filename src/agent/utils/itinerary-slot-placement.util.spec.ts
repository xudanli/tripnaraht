import {
  buildItinerarySlotPlacementPayload,
  deriveSeasonContextZh,
  suggestItinerarySlotCandidates,
} from './itinerary-slot-placement.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';

describe('itinerary-slot-placement.util', () => {
  it('deriveSeasonContextZh uses trip start date, not hardcoded June', () => {
    expect(
      deriveSeasonContextZh({
        date_range: { start_date: '2026-08-05', end_date: '2026-08-12' },
      } as TripPlanRequest),
    ).toBe('8月上旬');
    expect(deriveSeasonContextZh({} as TripPlanRequest)).toBe('您出行期间');
  });

  it('payload does not contain hallucinated 6月下旬', () => {
    const trip = {
      trip_id: 't1',
      date_range: { start_date: '2026-07-10', end_date: '2026-07-18' },
    } as TripPlanRequest;
    const days: TripDaySnapshotForPlacement[] = [
      {
        dayNumber: 3,
        dateYmd: '2026-07-12',
        itemCount: 2,
        textBlob: '米湖 阿克雷里',
      },
      {
        dayNumber: 4,
        dateYmd: '2026-07-13',
        itemCount: 1,
        textBlob: '胡萨维克 观鲸',
      },
    ];
    const payload = buildItinerarySlotPlacementPayload(
      trip,
      days,
      '能否在哪个行程里安排胡萨维克观鲸，住阿克雷里，避开大巴',
    );
    expect(payload.message).not.toMatch(/6\s*月下旬/);
    expect(payload.message).toMatch(/请选择顺路安排的日期/);
    expect(payload.suggested_operations?.some((o) => o.action === 'PLACE_ON_D4')).toBe(true);
  });

  it('ranks north-corridor days higher', () => {
    const candidates = suggestItinerarySlotCandidates(null, [
      { dayNumber: 1, dateYmd: '2026-07-10', itemCount: 5, textBlob: '雷克雅未克' },
      { dayNumber: 3, dateYmd: '2026-07-12', itemCount: 2, textBlob: '米湖 阿克雷里' },
    ]);
    expect(candidates[0]?.dayNumber).toBe(3);
  });
});
