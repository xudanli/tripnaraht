import { DateTime } from 'luxon';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import {
  buildNoNightDriveViolationConflict,
  isDrivingAfterNightCutoff,
  maybeBuildNoNightDriveConflict,
  resolveDrivingCutoffDateTime,
} from './no-night-drive-conflicts.util';
import { assembleFeasibilityReport } from './feasibility-assembler.util';
import { inferRelatedConstraintIdsFromConflict } from './constraint-conflict-link.util';

describe('no-night-drive-conflicts.util', () => {
  it('resolveDrivingCutoffDateTime returns valid cutoff after sunset', () => {
    const cutoff = resolveDrivingCutoffDateTime('2026-07-01', 30, 64.15, -21.94);
    expect(cutoff?.isValid).toBe(true);
    const sunset = cutoff!.minus({ minutes: 30 });
    expect(cutoff!.toMillis()).toBeGreaterThan(sunset.toMillis());
  });

  it('detects driving segment ending after cutoff', () => {
    const cutoff = resolveDrivingCutoffDateTime('2026-07-01', 30, 64.15, -21.94)!;
    const departAt = cutoff.minus({ hours: 2 });
    const arriveAt = cutoff.plus({ minutes: 15 });
    const result = isDrivingAfterNightCutoff({
      departAt,
      arriveAt,
      maxMinutesAfterSunset: 30,
      lat: 64.15,
      lng: -21.94,
    });
    expect(result.violated).toBe(true);
  });

  it('maybeBuildNoNightDriveConflict emits must_handle conflict', () => {
    const cutoff = resolveDrivingCutoffDateTime('2026-07-01', 30, 64.15, -21.94)!;
    const conflict = maybeBuildNoNightDriveConflict({
      policy: { maxMinutesAfterSunset: 30 },
      idPrefix: 'no-night-drive',
      dayNumber: 1,
      dateIso: '2026-07-01',
      fromItemId: 'a',
      toItemId: 'b',
      fromName: 'A',
      toName: 'B',
      departAt: cutoff.minus({ hours: 1 }),
      arriveAt: cutoff.plus({ minutes: 10 }),
      travelMinutes: 70,
      travelMode: 'DRIVING',
      lat: 64.15,
      lng: -21.94,
    });
    expect(conflict?.type).toBe(ConflictType.NO_NIGHT_DRIVE_VIOLATION);
    expect(conflict?.issueKind).toBe('no_night_drive');
    expect(conflict?.priority).toBe('must_handle');
    expect(conflict?.description).toContain('日落后 30 分钟');
    expect(conflict?.affectedDays).toEqual(['1']);
  });

  it('assembleFeasibilityReport maps no_night_drive to transport hard issue', () => {
    const cutoff = resolveDrivingCutoffDateTime('2026-07-01', 30, 64.15, -21.94)!;
    const conflict = buildNoNightDriveViolationConflict({
      id: 'no-night-drive-a-b',
      dayNumber: 1,
      dateIso: '2026-07-01',
      fromItemId: 'a',
      toItemId: 'b',
      fromName: 'A',
      toName: 'B',
      departAt: cutoff.minus({ hours: 1 }),
      arriveAt: cutoff.plus({ minutes: 5 }),
      cutoff,
      sunset: cutoff.minus({ minutes: 30 }),
      maxMinutesAfterSunset: 30,
      travelMinutes: 65,
    });
    const report = assembleFeasibilityReport({
      trip: {
        id: 'trip-1',
        name: 'Test',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-03'),
        metadata: { constraints: { noNightDrive: { maxMinutesAfterSunset: 30 } } },
      },
      tripDays: [{ id: 'd1', dayNumber: 1 }],
      readiness: { score: { overall: 70 }, findings: [] } as any,
      conflicts: [conflict],
      revision: { revision: 1, revisionLabel: 'V1' },
      snapshot: { verifiedAt: new Date().toISOString(), gateResult: 'BLOCK' },
    });
    const issue = report.issues.find((i) => i.issueKind === 'no_night_drive');
    expect(issue?.category).toBe('transport');
    expect(issue?.priority).toBe('must_handle');
    expect(issue?.proofs?.[0]?.constraint).toBe('no_night_drive');
    expect(report.verdict.status).toBe('NOT_EXECUTABLE');
  });

  it('links planning conflict message to c_no_night_drive', () => {
    const ids = inferRelatedConstraintIdsFromConflict({
      id: 'x',
      source: 'feasibility',
      priority: 'must_handle',
      category: 'transport',
      title: '不夜驾',
      message: '日落后 30 分钟不得继续驾驶',
    });
    expect(ids).toContain('c_no_night_drive');
  });
});
