import { Test } from '@nestjs/testing';
import { IcelandStormReroutingEngineSkill } from './iceland-storm-rerouting-engine.skill';
import type { CheckTripSafetyDualVerdictV1 } from './iceland-check-trip-safety-dual-verdict.types';

const minimalVerdict = (): CheckTripSafetyDualVerdictV1 =>
  ({
    feasible: false,
    risk_level: 'DANGEROUS',
    summary: 's',
    physical_constraints: {
      daylight: {
        regime: 'normal',
        daylightRisk: 'LOW',
        temporalMileageUnbounded: false,
        civilTwilightHours: 8,
        daylightHours: 6,
        driving_window_hours: 8,
        anchor_region: 'vik',
        weather_regions_assessed: ['vik'],
      },
      road_status: {
        blocked_reasons: ['VEHICLE_TYPE_INCOMPATIBLE'],
        f_road_segments_declared: true,
      },
      wind_risk: { route_risk_level: 'SAFE', inferred_from_composite: true, notes: '' },
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
      estimated_remaining_range_km: 100,
      recommended_stops: [],
      safety_alerts: [],
    },
    recommended_adjustments: [],
    audit_degraded: false,
    audit_degraded_reasons: [],
  }) as CheckTripSafetyDualVerdictV1;

describe('IcelandStormReroutingEngineSkill', () => {
  it('execute returns alternatives for vik→east', async () => {
    const m = await Test.createTestingModule({ providers: [IcelandStormReroutingEngineSkill] }).compile();
    const skill = m.get(IcelandStormReroutingEngineSkill);
    const out = await skill.execute({
      request_id: 'r1',
      failed_verdict: minimalVerdict(),
      original_segments: [
        { from_region: 'vik', to_region: 'highlands_center', roadId: 'F208' },
        { from_region: 'highlands_center', to_region: 'egilsstadir', distanceKm: 200 },
      ],
    });
    expect(out.strategies_applied).toContain('BYPASS_F_ROADS');
    expect(out.alternatives.length).toBeGreaterThan(0);
  });
});
