import { DateTime } from 'luxon';
import {
  resolveExecutionActionDeadlineFromStartTimes,
  resolveExecutionActionDeadlineFromTimeSlots,
} from './execution-action-deadline.util';

describe('execution-action-deadline.util', () => {
  const now = DateTime.fromObject(
    { year: 2026, month: 7, day: 16, hour: 14, minute: 0 },
    { zone: 'Asia/Shanghai' },
  );

  it('picks the next future itinerary start time', () => {
    const past = DateTime.fromObject(
      { year: 2026, month: 7, day: 16, hour: 8, minute: 0 },
      { zone: 'Asia/Shanghai' },
    ).toJSDate();
    const future = DateTime.fromObject(
      { year: 2026, month: 7, day: 16, hour: 16, minute: 30 },
      { zone: 'Asia/Shanghai' },
    ).toJSDate();
    expect(resolveExecutionActionDeadlineFromStartTimes([past, future], now)).toBe(
      DateTime.fromJSDate(future).toISO(),
    );
  });

  it('omits deadline when every activity start is in the past', () => {
    const past = DateTime.fromObject(
      { year: 2026, month: 7, day: 16, hour: 8, minute: 0 },
      { zone: 'Asia/Shanghai' },
    ).toJSDate();
    expect(resolveExecutionActionDeadlineFromStartTimes([past], now)).toBeUndefined();
  });

  it('picks the next future mobile time slot', () => {
    expect(
      resolveExecutionActionDeadlineFromTimeSlots(
        [
          { time: '09:30', status: 'completed' },
          { time: '11:30', status: 'upcoming' },
          { time: '18:00', status: 'upcoming' },
        ],
        now,
      ),
    ).toBe(now.set({ hour: 18, minute: 0, second: 0, millisecond: 0 }).toISO());
  });

  it('omits deadline when all mobile slots are in the past', () => {
    expect(
      resolveExecutionActionDeadlineFromTimeSlots([{ time: '09:30', status: 'upcoming' }], now),
    ).toBeUndefined();
  });
});
