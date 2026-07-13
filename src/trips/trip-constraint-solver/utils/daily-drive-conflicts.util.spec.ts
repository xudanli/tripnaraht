import {
  accumulateDailyDrivingMinutes,
  buildDailyDriveExceededConflicts,
  recordDailyDrivingLeg,
} from './daily-drive-conflicts.util';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import {
  applyMaxDailyDrivingHoursConstraintPatch,
  readUserMaxDailyDrivingHours,
  resolveMaxDailyDrivingHours,
} from './daily-drive-threshold.util';
import { assembleFeasibilityReport } from './feasibility-assembler.util';

describe('daily-drive threshold + conflicts', () => {
  it('reads maxDailyDrivingHours from metadata.constraints', () => {
    expect(
      readUserMaxDailyDrivingHours({ constraints: { maxDailyDrivingHours: 6 } }),
    ).toBe(6);
    expect(
      readUserMaxDailyDrivingHours({ constraints: { maxDailyDriveHours: 5 } }),
    ).toBe(5);
  });

  it('applyMaxDailyDrivingHoursConstraintPatch accepts minutes-only payload', () => {
    const constraints: Record<string, unknown> = {};
    expect(
      applyMaxDailyDrivingHoursConstraintPatch(constraints, { maxDailyDriveMinutes: 480 }),
    ).toBe(true);
    expect(constraints.maxDailyDrivingHours).toBe(8);
    expect(constraints.maxDailyDriveMinutes).toBe(480);
  });

  it('resolveMaxDailyDrivingHours requires explicit user value for conflict detection', () => {
    expect(
      resolveMaxDailyDrivingHours({
        metadata: {},
        pacingConfig: { travelMode: 'self_drive', level: 'normal' },
      }),
    ).toBeUndefined();
    expect(
      resolveMaxDailyDrivingHours({
        metadata: { constraints: { maxDailyDrivingHours: 4 } },
        pacingConfig: { travelMode: 'self_drive' },
      })?.maxDailyDrivingHours,
    ).toBe(4);
  });

  it('buildDailyDriveExceededConflicts emits must_handle transport issue', () => {
    const map = new Map<number, number>([[2, 320]]);
    const conflicts = buildDailyDriveExceededConflicts({
      dailyDriveMinutes: map,
      maxDailyDrivingHours: 4,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe(ConflictType.MAX_DAILY_DRIVE_EXCEEDED);
    expect(conflicts[0].issueKind).toBe('daily_drive');
    expect(conflicts[0].description).toContain('Day 2');
    expect(conflicts[0].shortfallMinutes).toBe(80);
  });

  it('buildDailyDriveExceededConflicts attaches route labels from day legs', () => {
    const dailyDriveMinutes = new Map<number, number>([[1, 400]]);
    const dayLegs = new Map([
      [
        1,
        [
          {
            fromItemId: 'iti_rey',
            toItemId: 'iti_vik',
            fromPlaceLabel: '雷克雅未克',
            toPlaceLabel: '维克',
            travelMinutes: 160,
            departAt: '2026-07-01T09:00:00.000Z',
          },
          {
            fromItemId: 'iti_vik',
            toItemId: 'iti_hof',
            fromPlaceLabel: '维克',
            toPlaceLabel: '霍芬',
            travelMinutes: 90,
          },
        ],
      ],
    ]);
    const [conflict] = buildDailyDriveExceededConflicts({
      dailyDriveMinutes,
      maxDailyDrivingHours: 4,
      dayLegs,
    });
    expect(conflict.fromPlaceLabel).toBe('雷克雅未克');
    expect(conflict.toPlaceLabel).toBe('维克');
    expect(conflict.dailyDriveLegs).toHaveLength(2);
    expect(conflict.travelTimeMinutes).toBe(160);
  });

  it('recordDailyDrivingLeg tracks DRIVING legs only', () => {
    const minutes = new Map<number, number>();
    const legs = new Map<number, import('./daily-drive-conflicts.util').DailyDriveLegRecord[]>();
    recordDailyDrivingLeg(
      minutes,
      legs,
      1,
      {
        fromPlaceLabel: 'A',
        toPlaceLabel: 'B',
        travelMinutes: 60,
      },
      'DRIVING',
    );
    recordDailyDrivingLeg(
      minutes,
      legs,
      1,
      {
        fromPlaceLabel: 'B',
        toPlaceLabel: 'C',
        travelMinutes: 20,
      },
      'WALKING',
    );
    expect(minutes.get(1)).toBe(60);
    expect(legs.get(1)).toHaveLength(1);
  });

  it('accumulateDailyDrivingMinutes sums DRIVING legs only', () => {
    const map = new Map<number, number>();
    accumulateDailyDrivingMinutes(map, 1, 90, 'DRIVING');
    accumulateDailyDrivingMinutes(map, 1, 30, 'WALKING');
    expect(map.get(1)).toBe(90);
  });

  it('assembleFeasibilityReport maps daily_drive conflict to transport issue', () => {
    const [conflict] = buildDailyDriveExceededConflicts({
      dailyDriveMinutes: new Map([[2, 320]]),
      maxDailyDrivingHours: 4,
    });
    const report = assembleFeasibilityReport({
      trip: {
        id: 'trip-1',
        name: 'Test',
        startDate: new Date('2026-06-20'),
        endDate: new Date('2026-06-22'),
        metadata: { constraints: { maxDailyDrivingHours: 4 } },
      },
      tripDays: [{ id: 'd1', dayNumber: 1 }, { id: 'd2', dayNumber: 2 }],
      readiness: {
        score: { overall: 70 },
        findings: [],
        phaseHint: undefined,
        coverageDisclosure: undefined,
      } as any,
      conflicts: [conflict],
      revision: { revision: 1, revisionLabel: 'V1' },
    });
    const issue = report.issues.find((i) => i.issueKind === 'daily_drive');
    expect(issue?.category).toBe('transport');
    expect(issue?.priority).toBe('must_handle');
    expect(issue?.proofs?.[0]?.constraint).toBe('max_daily_drive');
  });
});
