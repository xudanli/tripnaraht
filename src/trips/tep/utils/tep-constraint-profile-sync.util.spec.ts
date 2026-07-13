import {
  normalizeMaxDailyDriveConstraintFields,
  readMaxDailyDriveMinutesFromMetadata,
} from './tep-constraint-profile-sync.util';

describe('tep-constraint-profile-sync.util', () => {
  it('derives hours from minutes when only minutes are set', () => {
    const normalized = normalizeMaxDailyDriveConstraintFields({
      maxDailyDriveMinutes: 480,
    });

    expect(normalized.maxDailyDriveMinutes).toBe(480);
    expect(normalized.maxDailyDrivingHours).toBe(8);
  });

  it('derives minutes from hours when only hours are set', () => {
    const normalized = normalizeMaxDailyDriveConstraintFields({
      maxDailyDrivingHours: 6,
    });

    expect(normalized.maxDailyDrivingHours).toBe(6);
    expect(normalized.maxDailyDriveMinutes).toBe(360);
  });

  it('prefers minutes when both minutes and hours are present', () => {
    const normalized = normalizeMaxDailyDriveConstraintFields({
      maxDailyDriveMinutes: 300,
      maxDailyDrivingHours: 8,
    });

    expect(normalized.maxDailyDriveMinutes).toBe(300);
    expect(normalized.maxDailyDrivingHours).toBe(5);
  });

  it('reads minutes from trip metadata constraints', () => {
    expect(
      readMaxDailyDriveMinutesFromMetadata({
        constraints: { maxDailyDrivingHours: 7.5 },
      }),
    ).toBe(450);
  });

  it('reads snake_case minutes from trip metadata', () => {
    expect(
      readMaxDailyDriveMinutesFromMetadata({
        constraints: { max_daily_drive_minutes: 420 },
      }),
    ).toBe(420);
  });
});
