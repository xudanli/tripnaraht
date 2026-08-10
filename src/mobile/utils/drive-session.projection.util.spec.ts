import {
  applyConfirmToDriveSession,
  applyFieldReportToDriveSession,
  applyNavStartToDriveSession,
  projectDriveSession,
} from './drive-session.projection.util';
import { DateTime } from 'luxon';

describe('drive-session.projection.util', () => {
  const now = DateTime.fromISO('2026-07-22T12:00:00', { zone: 'Atlantic/Reykjavik' });

  it('derives DRIVING from open nav session', () => {
    const dto = projectDriveSession({
      localDate: '2026-07-22',
      timezone: 'Atlantic/Reykjavik',
      contextVersion: 1,
      now,
      navSessions: [
        {
          id: 'nav-1',
          startedAt: '2026-07-22T11:00:00.000Z',
          startedBy: 'u1',
        },
      ],
    });
    expect(dto.phase).toBe('DRIVING');
    expect(dto.authoritative).toBe(false);
    expect(dto.continuousDriveMinutes).toBeGreaterThanOrEqual(59);
    expect(dto.continuousDriveMinutes).toBeLessThanOrEqual(61);
  });

  it('warns after 120 continuous minutes', () => {
    const dto = projectDriveSession({
      localDate: '2026-07-22',
      timezone: 'Atlantic/Reykjavik',
      contextVersion: 1,
      now,
      stored: {
        localDate: '2026-07-22',
        phase: 'DRIVING',
        continuousStartedAt: '2026-07-22T09:00:00.000Z',
        continuousAccumulatedMinutes: 0,
        todayDrivenMinutes: 0,
        updatedAt: '2026-07-22T09:00:00.000Z',
      },
    });
    expect(dto.authoritative).toBe(true);
    expect(dto.continuousDriveMinutes).toBeGreaterThanOrEqual(179);
    expect(dto.continuousDriveWarningZh).toMatch(/连续驾驶/);
  });

  it('maps SAFE_STOP field report to TEMPORARY_STOP', () => {
    const stored = applyFieldReportToDriveSession({
      prev: applyNavStartToDriveSession({
        localDate: '2026-07-22',
        startedAt: '2026-07-22T10:00:00.000Z',
        navSessionId: 'nav-1',
        driverMemberId: 'u1',
      }),
      localDate: '2026-07-22',
      actionCode: 'SAFE_STOP',
      reportedAt: '2026-07-22T11:00:00.000Z',
      memberId: 'u1',
      now: DateTime.fromISO('2026-07-22T11:00:00.000Z'),
    });
    expect(stored?.phase).toBe('TEMPORARY_STOP');
    expect(stored?.continuousStartedAt).toBeUndefined();
    expect(stored?.todayDrivenMinutes).toBeGreaterThanOrEqual(59);
  });

  it('confirm sets PREPARING when not already driving', () => {
    const stored = applyConfirmToDriveSession({
      localDate: '2026-07-22',
      confirmedAt: '2026-07-22T08:00:00.000Z',
      driverMemberId: 'driver-1',
    });
    expect(stored.phase).toBe('PREPARING');
    expect(stored.lastDriverMemberId).toBe('driver-1');
  });
});
