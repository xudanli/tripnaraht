import type { DailyDrivePlan, SelfDriveProfile } from '../contracts/tep-self-drive.types';
import { evaluateSdr202DaylightSafetyWindow } from './sdr-202-daylight.evaluator';

const baseProfile: SelfDriveProfile = {
  vehicle: { vehicleType: '4WD', vehicleSource: 'EXPLORATION' },
  drivers: [{ driverId: 'primary', experienceLevel: 'INTERMEDIATE' }],
  drivingPolicy: {
    nightDrivingAllowed: false,
    nightDrivingPreference: 'AVOID',
  },
};

describe('evaluateSdr202DaylightSafetyWindow', () => {
  it('flags night driving when last leg finishes after civil dusk (IS-CERT-202)', () => {
    const day: DailyDrivePlan = {
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
          roadRefs: ['segment:cert_202:ring'],
          importance: 'MANDATORY',
          flexibility: 'FIXED',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr202DaylightSafetyWindow({
      profile: baseProfile,
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    const hit = results.find((r) => r.ruleId === 'SDR-202');
    expect(hit).toBeDefined();
    expect(hit?.outcome).toBe('SUGGEST_REPAIR');
    expect(hit?.affectedRefs).toContain('drive_leg_1_1');
  });

  it('rejects highland F-road night segment when night driving disallowed', () => {
    const day: DailyDrivePlan = {
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
          roadRefs: ['segment:cert_202:F208'],
          importance: 'MANDATORY',
          flexibility: 'FIXED',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr202DaylightSafetyWindow({
      profile: baseProfile,
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    const hit = results.find((r) => r.outcome === 'REJECT');
    expect(hit?.ruleId).toBe('SDR-202');
    expect(hit?.affectedRefs.some((r) => r.includes('F208'))).toBe(true);
  });

  it('flags weather-sensitive outdoor activity ending after sunset', () => {
    const day: DailyDrivePlan = {
      date: '2026-01-15',
      dayIndex: 1,
      origin: { ref: 'anchor_a', label: 'A' },
      destination: { ref: 'anchor_b', label: 'B' },
      legs: [],
      activities: [
        {
          ref: 'activity_outdoor',
          importance: 'RECOMMENDED',
          flexibility: 'REMOVABLE',
          weatherSensitive: true,
          reservationRequired: false,
          durationMinutes: 180,
          bufferMinutes: 0,
          fixedStartAt: '2026-01-15T14:00:00.000Z',
        },
      ],
      buffers: [],
    };

    const results = evaluateSdr202DaylightSafetyWindow({
      profile: { ...baseProfile, drivingPolicy: { nightDrivingAllowed: true, nightDrivingPreference: 'ALLOW_WITH_CAUTION' } },
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    const hit = results.find((r) => r.affectedRefs.includes('activity_outdoor'));
    expect(hit?.outcome).toBe('SUGGEST_REPAIR');
  });

  it('does not degrade Iceland July mid-summer days to DAYLIGHT_DATA_AMBIGUOUS', () => {
    const day: DailyDrivePlan = {
      date: '2026-07-15',
      dayIndex: 1,
      origin: { ref: 'anchor_rey', label: '雷克雅未克', lat: 64.1466, lng: -21.9426 },
      destination: { ref: 'anchor_vik', label: '维克', lat: 63.4186, lng: -19.0059 },
      legs: [
        {
          legId: 'drive_leg_1_1',
          fromRef: 'item_rey',
          toRef: 'item_vik',
          baseNavigationMinutes: 160,
          roadRefs: ['segment:ring'],
          importance: 'MANDATORY',
          flexibility: 'MOVABLE',
        },
      ],
      activities: [],
      buffers: [],
    };

    const results = evaluateSdr202DaylightSafetyWindow({
      profile: {
        ...baseProfile,
        drivingPolicy: {
          nightDrivingAllowed: false,
          nightDrivingPreference: 'AVOID',
          maxMinutesAfterSunset: 30,
        },
      },
      dailyDrivePlans: [day],
      countryCode: 'IS',
    });

    expect(results.some((r) => r.degradationReason === 'DAYLIGHT_DATA_AMBIGUOUS')).toBe(false);
    expect(results.some((r) => r.degraded === true)).toBe(false);
  });
});
