import { BOOKING_PRIORITY_LIST_SCHEMA } from '../types/booking-priority-list.type';
import { buildBookingPriorityList } from './booking-priority-list.builder.util';

describe('booking-priority-list.builder.util', () => {
  const generatedAt = '2026-06-01T08:00:00.000Z';

  it('聚合 hard_booking 行程项与 pitfall 提示', () => {
    const list = buildBookingPriorityList({
      tripId: 'trip-1',
      generatedAt,
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-06-15',
            items: [
              {
                id: 'museum-1',
                type: 'VISIT',
                start_time: '2026-06-15T10:00:00.000Z',
                location_ref: { place_id: 'poi_museum', name: '卢浮宫' },
                metadata: {
                  hard_booking: true,
                  latest_arrival_time: '2026-06-15T10:00:00.000Z',
                  official_booking_url: 'https://book.example/louvre',
                  opens_at_local: '2026-05-16T10:00:00+02:00',
                },
                evidence_refs: [],
                verified: false,
                verification_status: 'ASSUMPTION',
              },
            ],
          },
        ],
      },
      poiPitfallCards: [
        {
          schema: 'tripnara.poi_pitfall@v1',
          poi_id: 'poi_museum',
          label_zh: '卢浮宫',
          day_index: 1,
          tips_zh: ['热门展需官网预约'],
          source: 'heuristic',
          confidence: 'HIGH',
        },
      ],
    });

    expect(list?.schema).toBe(BOOKING_PRIORITY_LIST_SCHEMA);
    expect(list?.items).toHaveLength(1);
    expect(list?.items[0]).toMatchObject({
      category: 'ATTRACTION_TICKET',
      title: '卢浮宫预约',
      associatedDayNumber: 1,
      actionPayload: {
        officialBookingUrl: 'https://book.example/louvre',
        calendarReminderDeeplink: expect.stringContaining('action=calendar_reminder'),
      },
    });
    expect(list?.items[0].actionPayload.bookingGuideHtml).toContain('热门展需官网预约');
    expect(list?.items[0].timing.opensAtLocal).toBe('2026-05-16T10:00:00+02:00');
  });

  it('合并 transportChecklist 提醒', () => {
    const list = buildBookingPriorityList({
      tripId: 'trip-2',
      generatedAt,
      researchData: {
        transportChecklist: {
          reminders: [
            {
              mode: 'ferry',
              title: '博斯普鲁斯海峡游船',
              description: '旺季需提前预订',
              urgency: 'high',
              timeWindow: { bookingDeadline: '2026-06-10T00:00:00.000Z' },
              bookingInfo: { bookingLink: 'https://ferry.example' },
            },
          ],
        },
      },
    });

    expect(list?.items).toHaveLength(1);
    expect(list?.items[0]).toMatchObject({
      category: 'TRANSPORT_FLIGHT',
      title: '博斯普鲁斯海峡游船',
      urgencyLevel: 'HIGH',
      actionPayload: { officialBookingUrl: 'https://ferry.example' },
    });
  });

  it('无可预订节点时返回 undefined', () => {
    expect(
      buildBookingPriorityList({
        tripId: 'trip-empty',
        itinerary: { request_id: 'r1', days: [{ date: '2026-06-01', items: [] }] },
      }),
    ).toBeUndefined();
  });
});
