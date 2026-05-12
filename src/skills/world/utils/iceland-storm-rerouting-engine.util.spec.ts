import type { CheckTripSafetyDualVerdictV1 } from '../iceland-check-trip-safety-dual-verdict.types';
import { suggestAlternativePlans } from './iceland-storm-rerouting-engine.util';

function winterVerdict(over: Partial<CheckTripSafetyDualVerdictV1> = {}): CheckTripSafetyDualVerdictV1 {
  return {
    feasible: false,
    risk_level: 'DANGEROUS',
    summary: 'test',
    physical_constraints: {
      daylight: {
        regime: 'polar_night',
        daylightRisk: 'HIGH',
        temporalMileageUnbounded: false,
        civilTwilightHours: 6,
        daylightHours: 3,
        driving_window_hours: 6,
        anchor_region: 'egilsstadir',
        weather_regions_assessed: ['vik', 'highlands_center', 'egilsstadir'],
      },
      road_status: {
        blocked_reasons: ['VEHICLE_TYPE_INCOMPATIBLE', 'ROAD_CLOSED'],
        f_road_segments_declared: true,
      },
      wind_risk: {
        route_risk_level: 'CAUTION',
        inferred_from_composite: true,
        notes: '',
      },
      tunnel_protocol: {
        triggered: false,
        protocol_code: null,
        driving_notes: '',
        affected_segments: [],
      },
      road_surface_alerts: {
        triggered: false,
        protocol_code: null,
        driving_notes: '',
        affected_segments: [],
      },
    },
    energy_logistics: {
      refuel_or_charge_required: false,
      energy_status: 'SUFFICIENT',
      estimated_remaining_range_km: 250,
      recommended_stops: [
        { id: 'n1_vik_south_anchor', name: 'South coast fuel anchor (Vík corridor)', action: 'REFILL_BEFORE_HIGHLANDS' },
      ],
      safety_alerts: ['Supply desert: highlands — test'],
      metrics: {
        total_km: 350,
        energy_mode: 'ice',
        vehicle_class: '2wd',
        estimated_consumption_l_or_kwh: 26,
        usable_capacity_l_or_kwh: 38,
        nominal_range_km: 600,
        range_anxiety_threshold_km: 420,
      },
    },
    recommended_adjustments: ['NIGHT_DRIVING_REQUIRED', 'REDUCE_DAILY_MILEAGE'],
    audit_degraded: false,
    audit_degraded_reasons: [],
    ...over,
  } as CheckTripSafetyDualVerdictV1;
}

describe('iceland-storm-rerouting-engine.util', () => {
  it('returns ring bypass + split + anchor strategies for F-blocked south→east', () => {
    const segs = [
      { from_region: 'vik', to_region: 'highlands_center', roadId: 'F208', distanceKm: 100 },
      { from_region: 'highlands_center', to_region: 'egilsstadir', distanceKm: 250 },
    ];
    const plan = suggestAlternativePlans(winterVerdict(), segs);
    expect(plan.strategies_applied).toEqual(
      expect.arrayContaining(['BYPASS_F_ROADS', 'SPLIT_SEGMENTS', 'ANCHOR_BASED_PLANNING', 'RING_ROAD_CONTINUITY']),
    );
    expect(plan.candidates.length).toBeGreaterThan(0);
    const ring = plan.candidates.find((c) => c.primary_strategy === 'RING_ROAD_CONTINUITY');
    expect(ring).toBeDefined();
    expect(ring?.segments[0]?.distanceKm).toBe(272);
    expect(ring?.segments[1]?.distanceKm).toBe(187);
    expect(ring?.segments.every((s) => !s.roadId)).toBe(true);
  });

  it('returns empty alternatives when endpoints do not normalize', () => {
    const plan = suggestAlternativePlans(winterVerdict(), [{ from_region: 'XyzUnknown', to_region: 'vik' }]);
    expect(plan.candidates).toEqual([]);
    expect(plan.notes.some((n) => n.includes('preset atlas'))).toBe(true);
  });
});
