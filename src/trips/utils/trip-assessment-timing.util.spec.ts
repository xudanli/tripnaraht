import { assessTimingForDay } from './trip-assessment-timing.util';
import { DayType } from '../dto/trip-metrics.dto';

describe('trip-assessment-timing.util', () => {
  it('does not suggest 22:00 cutoff on departure day ending at 22:00', () => {
    const result = assessTimingForDay(
      [
        {
          startTime: new Date('2026-11-02T10:00:00.000Z'),
          endTime: new Date('2026-11-02T22:00:00.000Z'),
        },
      ],
      {},
      DayType.DEPARTURE_DAY,
    );

    expect(result.suggestions).toBeUndefined();
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('still flags very late end on touring day', () => {
    const result = assessTimingForDay(
      [
        {
          startTime: new Date(2026, 10, 2, 9, 0),
          endTime: new Date(2026, 10, 2, 23, 15),
        },
      ],
      {},
      DayType.TOURING_DAY,
    );

    expect(result.suggestions).toContain('建议将最后活动提前，确保 22:00 前结束');
  });

  it('skips early-start penalty on arrival day', () => {
    const result = assessTimingForDay(
      [
        {
          startTime: new Date('2026-11-01T06:30:00.000Z'),
          endTime: new Date('2026-11-01T12:00:00.000Z'),
        },
      ],
      {},
      DayType.ARRIVAL_DAY,
    );

    expect(result.issues ?? []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/开始过早/)]),
    );
    expect(result.score).toBeGreaterThanOrEqual(85);
  });
});
