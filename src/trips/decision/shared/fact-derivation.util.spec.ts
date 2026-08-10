import { deriveFactsFromMetadata } from './fact-derivation.util';
import { calculateEnvironmentHash } from '../../ontology/environment/environment-domain.util';

describe('fact-derivation.util', () => {
  it('derives fatigue facts from Dr.Dre fatigue_stats evidence', () => {
    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'fatigue.max_daily',
        details: {
          evidence: {
            type: 'fatigue_stats',
            threshold_fatigue_index: 1.1,
            original: { mean: 0.9, variance: 0.05, max: 1.2, overloadedDays: 1 },
            recommended: { mean: 0.7, variance: 0.03, max: 1.15, overloadedDays: 2 },
          },
        },
      },
      reasonCodes: ['FATIGUE_COMPARISON'],
      timestampIso: '2026-01-01T00:00:00.000Z',
    });

    const max = facts.find((f) => f.rule_id === 'fatigue.max_daily');
    expect(max).toBeTruthy();
    expect(max?.unit).toBe('fatigue_index');
    expect(max?.actual_value).toBe(1.15);
    expect(max?.threshold).toBe(1.1);
    expect(max?.is_violated).toBe(true);
    expect(max?.severity).toBe('SOFT');

    const days = facts.find((f) => f.rule_id === 'fatigue.overloaded_days');
    expect(days).toBeTruthy();
    expect(days?.unit).toBe('days');
    expect(days?.actual_value).toBe(2);
    expect(days?.threshold).toBe(0);
    expect(days?.is_violated).toBe(true);
    expect(days?.severity).toBe('SOFT');
  });

  it('derives HARD road_closed fact from road_state CLOSED evidence', () => {
    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'road_closed_v1',
        details: {
          evidence: {
            type: 'road_state',
            status: 'CLOSED',
            segment_id: 'seg-1',
            reason_code: 'HEALING_PHYSICAL_DRIFT',
          },
        },
      },
      reasonCodes: ['road_closed_v1'],
      timestampIso: '2026-01-01T00:00:00.000Z',
    });
    expect(facts.length).toBeGreaterThan(0);
    const f = facts[0];
    expect(f.rule_id).toBe('road_closed_v1');
    expect(f.severity).toBe('HARD');
    expect(f.is_violated).toBe(true);
  });

  it('derives HARD temporal_opening_v1 fact from opening_hours evidence', () => {
    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'temporal_opening_v1',
        details: {
          evidence: {
            type: 'opening_hours',
            poi_id: 'poi_museum_1',
            date: '2026-06-02',
            timezone: 'UTC',
            planned_start: '2026-06-02T10:00:00.000Z',
            planned_end: '2026-06-02T12:00:00.000Z',
            open_window: 'Closed',
            is_violated: true,
          },
        },
      },
      reasonCodes: ['temporal_opening_v1'],
      timestampIso: '2026-06-02T00:00:00.000Z',
    });
    expect(facts.some((f) => f.rule_id === 'temporal_opening_v1' && f.severity === 'HARD' && f.is_violated === true)).toBe(
      true,
    );
  });

  it('derives SOFT temporal_opening_v1 when open_window is UNKNOWN', () => {
    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'temporal_opening_v1',
        details: {
          evidence: {
            type: 'opening_hours',
            poi_id: 'poi_missing',
            open_window: 'UNKNOWN',
            is_violated: true,
          },
        },
      },
      reasonCodes: ['temporal_opening_v1'],
    });
    expect(facts.some((f) => f.rule_id === 'temporal_opening_v1' && f.severity === 'SOFT' && f.is_violated === true)).toBe(
      true,
    );
    expect(facts.some((f) => f.rule_id === 'temporal_opening_v1' && f.severity === 'HARD')).toBe(false);
  });

  it('derives HARD drive_safety_v1 fact from weather_physics wind evidence', () => {
    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'drive_safety_v1',
        details: {
          evidence: {
            type: 'weather_physics',
            wind_speed_mps: 25,
            vehicle_type: 'CAMPERVAN',
            source: 'UNIT_TEST',
          },
        },
      },
      reasonCodes: ['drive_safety_v1'],
      timestampIso: '2026-06-01T00:00:00.000Z',
    });
    expect(
      facts.some(
        (f) => f.rule_id === 'drive_safety_v1' && f.severity === 'HARD' && f.is_violated === true && f.unit === 'm/s',
      ),
    ).toBe(true);
  });

  it('derives HARD rail_safety_v1 fact from weather_physics wind evidence (safe at 25m/s)', () => {
    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'drive_safety_v1',
        details: {
          evidence: {
            type: 'weather_physics',
            wind_speed_mps: 25,
            vehicle_type: 'CAMPERVAN',
            source: 'UNIT_TEST',
          },
        },
      },
      reasonCodes: ['drive_safety_v1'],
      timestampIso: '2026-06-01T00:00:00.000Z',
    });
    const rail = facts.find((f) => f.rule_id === 'rail_safety_v1');
    expect(rail).toBeTruthy();
    expect(rail?.severity).toBe('HARD');
    expect(rail?.unit).toBe('m/s');
    expect(rail?.is_violated).toBe(false);
  });

  it('derives precipitation/snow facts + environment_hash from environment_overrides_v1', () => {
    const sunsetISO = '2026-06-01T20:00:00.000Z';
    const expectedEnvHash = calculateEnvironmentHash({
      windSpeedKph: 25 * 3.6,
      visibilityMeters: 800,
      snowDepthCm: 12,
      sunsetISO,
    });

    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'ignored_outer_rule_id',
        details: {
          evidence: {
            kind: 'environment_overrides_v1',
            source: 'UNIT_TEST',
            at: '2026-06-01T00:00:00.000Z',
            overrides: {
              weather: {
                wind_mps: 25,
                threshold_wind_mps: 20,
                confidenceScore: 0.9,

                visibility_m: 800,
                visibility_threshold_m: 1000,

                precipitation_mm: 12,
                precipitation_threshold_mm: 10,

                snow_depth_cm: 12,
                threshold_snow_depth_cm: 10,
              },
              solar: {
                twilightBufferMin: 30,
                sunset_time_iso: sunsetISO,
              },
            },
          },
        },
      },
      reasonCodes: ['ignored_outer_rule_id'],
      timestampIso: '2026-06-01T00:00:00.000Z',
    });

    const drive = facts.find((f) => f.rule_id === 'drive_safety_v1');
    expect(drive).toBeTruthy();
    expect(drive?.is_violated).toBe(true);

    const vis = facts.find((f) => f.rule_id === 'visibility_v1');
    expect(vis).toBeTruthy();
    expect(vis?.is_violated).toBe(true);
    expect(vis?.evidence && (vis.evidence as any).environment_hash).toBe(expectedEnvHash);

    const precip = facts.find((f) => f.rule_id === 'precipitation_limit_v1');
    expect(precip).toBeTruthy();
    expect(precip?.is_violated).toBe(true);
    expect(precip?.severity).toBe('HARD');
    expect(precip?.evidence && (precip.evidence as any).environment_hash).toBe(expectedEnvHash);

    const snow = facts.find((f) => f.rule_id === 'snow_depth_limit_v1');
    expect(snow).toBeTruthy();
    expect(snow?.is_violated).toBe(true);

    const solar = facts.find((f) => f.rule_id === 'solar_physics_v1');
    expect(solar).toBeTruthy();
    expect(solar?.evidence && (solar.evidence as any).environment_hash).toBe(expectedEnvHash);
  });

  it('infers environment_hash sunsetISO from solar.daylightByDate when sunset_time_iso is absent', () => {
    const sunsetISO = '2026-06-01T20:00:00.000Z';
    const expectedEnvHash = calculateEnvironmentHash({
      windSpeedKph: 25 * 3.6,
      visibilityMeters: 800,
      snowDepthCm: 12,
      sunsetISO,
    });

    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'ignored_outer_rule_id',
        details: {
          evidence: {
            kind: 'environment_overrides_v1',
            source: 'UNIT_TEST',
            at: '2026-06-01T00:00:00.000Z',
            overrides: {
              weather: {
                wind_mps: 25,
                threshold_wind_mps: 20,
                confidenceScore: 0.9,
                visibility_m: 800,
                visibility_threshold_m: 1000,
                precipitation_mm: 0,
                precipitation_threshold_mm: 10,
                snow_depth_cm: 12,
                threshold_snow_depth_cm: 10,
              },
              solar: {
                twilightBufferMin: 30,
                daylightByDate: {
                  '2026-06-01': {
                    sunset: sunsetISO,
                  },
                },
              },
            },
          },
        },
      },
      reasonCodes: ['ignored_outer_rule_id'],
      timestampIso: '2026-06-01T00:00:00.000Z',
    });

    const solar = facts.find((f) => f.rule_id === 'solar_physics_v1');
    expect(solar).toBeTruthy();
    expect(solar?.evidence && (solar.evidence as any).environment_hash).toBe(expectedEnvHash);
  });

  it('time-window matches forecastSeries by evidence.at for env facts + environment_hash', () => {
    const sunsetISO = '2026-06-01T20:00:00.000Z';
    const expectedEnvHash = calculateEnvironmentHash({
      windSpeedKph: 25 * 3.6,
      visibilityMeters: 800,
      snowDepthCm: 12,
      sunsetISO,
    });

    const facts = deriveFactsFromMetadata({
      metadata: {
        rule_id: 'ignored_outer_rule_id',
        details: {
          evidence: {
            kind: 'environment_overrides_v1',
            source: 'UNIT_TEST',
            // Choose time within the second forecast window.
            at: '2026-06-01T18:00:00.000Z',
            overrides: {
              weather: {
                // thresholds are configured at the top-level; selected forecast overrides the actual values.
                threshold_wind_mps: 20,
                visibility_threshold_m: 1000,
                precipitation_threshold_mm: 10,
                threshold_snow_depth_cm: 10,

                forecastSeries: [
                  {
                    start: '2026-06-01T00:00:00.000Z',
                    end: '2026-06-01T12:00:00.000Z',
                    wind_mps: 10,
                    visibility_m: 1200,
                    precipitation_mm: 5,
                    snow_depth_cm: 5,
                    confidenceScore: 0.9,
                    updatedAt: '2026-06-01T01:00:00.000Z',
                    source: 'forecast_v1',
                    condition: 'CLEAR',
                    locationId: 'LOC-1',
                  },
                  {
                    start: '2026-06-01T12:00:00.000Z',
                    end: '2026-06-02T00:00:00.000Z',
                    wind_mps: 25,
                    visibility_m: 800,
                    precipitation_mm: 12,
                    snow_depth_cm: 12,
                    confidenceScore: 0.9,
                    updatedAt: '2026-06-01T13:00:00.000Z',
                    source: 'forecast_v1',
                    condition: 'RAIN',
                    locationId: 'LOC-1',
                  },
                ],
              },
              solar: {
                twilightBufferMin: 30,
                sunset_time_iso: sunsetISO,
              },
            },
          },
        },
      },
      reasonCodes: ['ignored_outer_rule_id'],
      timestampIso: '2026-06-01T00:00:00.000Z',
    });

    const drive = facts.find((f) => f.rule_id === 'drive_safety_v1');
    expect(drive).toBeTruthy();
    expect(drive?.is_violated).toBe(true);
    expect(drive?.actual_value).toBe(25);

    const vis = facts.find((f) => f.rule_id === 'visibility_v1');
    expect(vis).toBeTruthy();
    expect(vis?.is_violated).toBe(true);
    expect(vis?.actual_value).toBe(800);

    const precip = facts.find((f) => f.rule_id === 'precipitation_limit_v1');
    expect(precip).toBeTruthy();
    expect(precip?.is_violated).toBe(true);
    expect(precip?.actual_value).toBe(12);
    expect(precip?.evidence && (precip.evidence as any).environment_hash).toBe(expectedEnvHash);

    const snow = facts.find((f) => f.rule_id === 'snow_depth_limit_v1');
    expect(snow).toBeTruthy();
    expect(snow?.is_violated).toBe(true);
    expect(snow?.actual_value).toBe(12);
    expect(snow?.evidence && (snow.evidence as any).environment_hash).toBe(expectedEnvHash);
  });
});

