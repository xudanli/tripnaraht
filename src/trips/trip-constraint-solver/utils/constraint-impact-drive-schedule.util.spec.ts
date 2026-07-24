import {
  buildDriveScheduleItems,
  driveLegsFromIssueAnchors,
  driveLegsFromTepPlan,
} from './constraint-impact-drive-schedule.util';

describe('constraint-impact-drive-schedule.util', () => {
  it('driveLegsFromIssueAnchors prefers driveLegs array', () => {
    const legs = driveLegsFromIssueAnchors({
      driveLegs: [
        {
          fromPlaceLabel: '雷克雅未克',
          toPlaceLabel: '维克',
          travelMinutes: 160,
        },
        {
          fromPlaceLabel: '维克',
          toPlaceLabel: '霍芬',
          travelMinutes: 90,
        },
      ],
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]?.fromPlaceLabel).toBe('雷克雅未克');
  });

  it('driveLegsFromTepPlan resolves leg labels via item map', () => {
    const legs = driveLegsFromTepPlan(
      {
        date: '2026-07-01',
        dayIndex: 1,
        origin: { ref: 'anchor_rey', label: '雷克雅未克' },
        destination: { ref: 'anchor_vik', label: '维克' },
        legs: [
          {
            legId: 'drive_leg_1_1',
            fromRef: 'iti_rey',
            toRef: 'iti_vik',
            baseNavigationMinutes: 160,
            roadRefs: [],
            importance: 'RECOMMENDED',
            flexibility: 'MOVABLE',
          },
        ],
        activities: [],
        buffers: [],
      },
      new Map([
        ['iti_rey', '雷克雅未克'],
        ['iti_vik', '维克'],
      ]),
    );
    expect(legs[0]?.fromPlaceLabel).toBe('雷克雅未克');
    expect(legs[0]?.toPlaceLabel).toBe('维克');
  });

  it('buildDriveScheduleItems renders A→B labels', () => {
    const items = buildDriveScheduleItems({
      legs: [
        {
          fromPlaceLabel: '雷克雅未克',
          toPlaceLabel: '维克',
          travelMinutes: 160,
          departAt: '2026-07-01T09:00:00.000Z',
        },
      ],
      dayDriveMinutes: 1286,
      limitHours: 5,
    });
    expect(items[0]?.label).toBe('雷克雅未克 → 维克');
    expect(items[0]?.startTimeLabel).toBe('09:00');
    expect(items[0]?.detail).toContain('当日累计');
  });
});
