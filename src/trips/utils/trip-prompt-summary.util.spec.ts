import { formatConsultationTripDaySkeletonLines } from './trip-prompt-summary.util';

describe('formatConsultationTripDaySkeletonLines', () => {
  it('aggregates item types per day and appends 日程项总数', () => {
    const s = formatConsultationTripDaySkeletonLines([
      {
        date: new Date('2026-06-02T00:00:00.000Z'),
        ItineraryItem: [{ type: 'POI' }, { type: 'POI' }, { type: 'HOTEL' }],
      },
      {
        date: new Date('2026-06-01T00:00:00.000Z'),
        ItineraryItem: [],
      },
    ]);
    expect(s).toContain('2026-06-01');
    expect(s).toContain('2026-06-02');
    expect(s).toMatch(/HOTEL×1/);
    expect(s).toMatch(/POI×2/);
    expect(s).toContain('日程项总数: 3');
  });
});
