import {
  detectItineraryAdjustDraftApplyIntent,
  buildItineraryAdjustDraftApplyAnswerText,
} from './itinerary-adjust-draft-apply.util';
import { pendingDraftFromRequestSnapshot } from './itinerary-adjust-pending-draft.util';

describe('itinerary-adjust-draft-apply', () => {
  it('detects apply button intent', () => {
    expect(detectItineraryAdjustDraftApplyIntent('应用到行程')).toBe(true);
    expect(
      detectItineraryAdjustDraftApplyIntent('', { apply_itinerary_adjust_draft: true }),
    ).toBe(true);
    expect(detectItineraryAdjustDraftApplyIntent('明天轻松一点')).toBe(false);
  });

  it('builds pending draft from client snapshot', () => {
    const pending = pendingDraftFromRequestSnapshot({
      tripId: 'trip-1',
      snapshot: {
        target_date_iso: '2026-06-06',
        target_day_number: 6,
        items: [
          {
            type: 'POI',
            start_window: '2026-06-06T11:00',
            end_window: '2026-06-06T13:00',
            location_ref: { name: '众神瀑布', place_id: '101' },
          },
          {
            type: 'POI',
            start_window: '2026-06-06T14:00',
            end_window: '2026-06-06T16:00',
            location_ref: { name: '米湖自然温泉', place_id: '102' },
          },
        ],
      },
    });
    expect(pending?.target_date_iso).toBe('2026-06-06');
    expect(pending?.itinerary_day.items).toHaveLength(2);
  });

  it('builds multi-day pending draft from client snapshot', () => {
    const pending = pendingDraftFromRequestSnapshot({
      tripId: 'trip-1',
      snapshot: {
        apply_mode: 'append_sparse_days',
        days: [
          {
            date_iso: '2026-11-03',
            items: [
              {
                type: 'POI',
                start_window: '09:00',
                end_window: '12:00',
                location_ref: { name: '冰河湖', place_id: '401' },
              },
            ],
          },
          {
            date_iso: '2026-11-04',
            items: [
              {
                type: 'POI',
                start_window: '10:00',
                end_window: '13:00',
                location_ref: { name: '钻石沙滩', place_id: '402' },
              },
            ],
          },
        ],
      },
    });
    expect(pending?.apply_mode).toBe('append_sparse_days');
    expect(pending?.itinerary_days).toHaveLength(2);
  });

  it('success answer mentions timeline sync', () => {
    const text = buildItineraryAdjustDraftApplyAnswerText({
      applied: true,
      targetDateIso: '2026-06-06',
      dayNumber: 6,
    });
    expect(text).toContain('已同步');
    expect(text).toContain('第 6 天');
  });
});
