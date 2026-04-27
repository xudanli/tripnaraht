import { deriveFactsFromMetadata } from './fact-derivation.util';

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
});

