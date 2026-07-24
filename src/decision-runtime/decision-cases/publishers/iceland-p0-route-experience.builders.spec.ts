import {
  buildExcessiveDailyDriveCase,
  buildGlacierExperienceCase,
  buildHighImpactExperienceCase,
  buildLandingLongDriveCase,
  buildRingVsSouthCase,
} from './iceland-p0-route-experience.builders';

describe('iceland-p0-route-experience.builders', () => {
  const tripId = '3e4a1058-9218-467f-988a-c18008a14385';

  it('builds excessive drive case with split lodging options', () => {
    const c = buildExcessiveDailyDriveCase({
      tripId,
      dayIndex: 2,
      driveHours: 11,
      dayLimitHours: 8,
      reason: '测试',
    });
    expect(c.published).toBe(true);
    expect(c.requiredness).toBe('IMPORTANT');
    expect(c.options.map((o) => o.optionId)).toEqual(
      expect.arrayContaining(['drive_midway_lodge', 'drive_drop_poi', 'drive_keep']),
    );
  });

  it('builds landing long-drive as SELECT not INFEASIBILITY', () => {
    const c = buildLandingLongDriveCase({
      tripId,
      arrivalHint: '夜航到达',
      day1DriveHours: 5,
    });
    expect(c.type).toBe('RISK');
    expect(c.semanticKey).toBe('RULE_TRIGGER.LANDING_LONG_DRIVE');
    expect(c.options.length).toBe(3);
  });

  it('builds ring vs south as preference SELECT', () => {
    const c = buildRingVsSouthCase({
      tripId,
      tripDays: 7,
      minRingDays: 10,
      avgDriveHours: 9,
      dayLimitHours: 8,
    });
    expect(c.type).toBe('PREFERENCE_CONFLICT');
    expect(c.options.some((o) => o.optionId === 'scope_south_coast')).toBe(true);
  });

  it('merges glacier products into one case', () => {
    const c = buildGlacierExperienceCase({ tripId, materialityBoost: true });
    expect(c.options.map((o) => o.optionId)).toEqual(
      expect.arrayContaining([
        'glacier_hike',
        'glacier_ice_cave',
        'glacier_short',
        'glacier_viewpoint',
        'glacier_skip',
      ]),
    );
    expect(c.materiality.total).toBeGreaterThanOrEqual(6);
  });

  it('disables ineligible glacier options from eligibility gate', () => {
    const c = buildGlacierExperienceCase({
      tripId,
      materialityBoost: true,
      eligibility: {
        eligible: true,
        checks: [],
        softWarnings: [],
        eligibleOptionIds: ['glacier_viewpoint', 'glacier_skip'],
        ineligibleOptionReasons: {
          glacier_hike: '体能不足',
          glacier_short: '体能不足',
          glacier_ice_cave: '体能不足',
        },
      },
    });
    expect(c.options.find((o) => o.optionId === 'glacier_hike')?.executable).toBe(false);
    expect(c.options.find((o) => o.optionId === 'glacier_viewpoint')?.executable).not.toBe(
      false,
    );
    expect(c.eligibility?.eligible).toBe(true);
  });

  it('builds whale high-impact template with multi-port options', () => {
    const c = buildHighImpactExperienceCase({ tripId, kind: 'whale' });
    expect(c.options.some((o) => o.optionId === 'whale_husavik')).toBe(true);
    expect(c.writebackTargets).toContain('BOOKING_INTENT');
  });
});
