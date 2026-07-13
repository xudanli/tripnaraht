import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import {
  buildExecutionSlipDaylightArrivals,
  computeDaylightViolationMinutes,
} from './daylight-violation-minutes.util';

const glacierDay: DailyDrivePlan = {
  date: '2026-01-15',
  dayIndex: 1,
  origin: { ref: 'anchor_a', label: 'A' },
  destination: { ref: 'anchor_b', label: 'B' },
  legs: [
    {
      legId: 'drive_leg_1_1',
      fromRef: 'item_a',
      toRef: 'item_b',
      baseNavigationMinutes: 600,
      roadRefs: ['segment:cert_304:ring'],
      importance: 'MANDATORY',
      flexibility: 'FIXED',
    },
  ],
  activities: [],
  buffers: [],
};

const profile = {
  vehicle: { vehicleType: '4WD' as const, vehicleSource: 'EXPLORATION' as const },
  drivers: [{ driverId: 'primary', experienceLevel: 'EXPERIENCED' as const }],
  drivingPolicy: {
    nightDrivingAllowed: false,
    nightDrivingPreference: 'AVOID' as const,
  },
};

describe('daylight-violation-minutes.util', () => {
  it('detects drive minutes after civil dusk for long leg (IS-CERT-304 shape)', () => {
    const result = computeDaylightViolationMinutes({
      countryCode: 'IS',
      profile,
      dailyDrivePlans: [glacierDay],
    });

    expect(result.driveMinutesAfterCivilDusk).toBeGreaterThan(0);
    expect(result.activityMinutesAfterSunset).toBe(0);
  });

  it('increases dusk violation when slip shifts last leg finish', () => {
    const baseline = computeDaylightViolationMinutes({
      countryCode: 'IS',
      profile,
      dailyDrivePlans: [glacierDay],
    });

    const slipArrivals = buildExecutionSlipDaylightArrivals({
      dailyDrivePlans: [glacierDay],
      dayIndex: 1,
      slipMinutes: 90,
      nextActivityId: 'item_b',
      projectedEta: '2026-01-15T22:30:00.000Z',
    });

    const adjusted = computeDaylightViolationMinutes({
      countryCode: 'IS',
      profile,
      dailyDrivePlans: [glacierDay],
      activityArrivals: slipArrivals,
    });

    expect(adjusted.driveMinutesAfterCivilDusk).toBeGreaterThan(
      baseline.driveMinutesAfterCivilDusk,
    );
  });
});
