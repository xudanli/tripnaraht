import { mergeBookingPriorityIntoNarration } from './merge-booking-priority-narration.util';
import { BOOKING_PRIORITY_LIST_SCHEMA } from '../delivery/types/booking-priority-list.type';
import type { BookingPriorityList } from '../delivery/types/booking-priority-list.type';

describe('merge-booking-priority-narration.util', () => {
  const list: BookingPriorityList = {
    schema: BOOKING_PRIORITY_LIST_SCHEMA,
    tripId: 'trip-1',
    generatedAt: '2026-06-01T00:00:00.000Z',
    items: [
      {
        id: 'a1',
        category: 'ATTRACTION_TICKET',
        title: '卢浮宫预约',
        associatedDayNumber: 3,
        urgencyLevel: 'CRITICAL',
        timing: {
          bookByDate: '2026-08-01T00:00:00.000Z',
          countdownSeconds: 86400,
        },
        actionPayload: {
          officialBookingUrl: 'https://example.com',
          calendarReminderDeeplink: '/dashboard/trips/trip-1?action=calendar_reminder',
        },
      },
    ],
  };

  it('mergeBookingPriorityIntoNarration 注入摘要 tip 与 booking_priority_list', () => {
    const out = mergeBookingPriorityIntoNarration(
      { user_friendly_summary: '行程已就绪', day_by_day_narrative: [], highlights: [], tips: [] },
      list,
    );
    expect(out.booking_priority_list?.schema).toBe(BOOKING_PRIORITY_LIST_SCHEMA);
    expect(out.tips?.[0]).toContain('[预订优先级]');
    expect(out.user_friendly_summary).toContain('需提前预约');
  });
});
