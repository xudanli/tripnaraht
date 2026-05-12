import {
  assembleCheckTripSafetyDualVerdictV1,
  collectUnknownRegionDegradation,
} from './check-trip-safety-dual-audit.assembler';
import type {
  IcelandGasEvPlannerOutput,
  IcelandRouteFeasibilityOutput,
} from '../../skills/world/iceland-world-driving-contracts';

function minimalRoute(over: Partial<IcelandRouteFeasibilityOutput> = {}): IcelandRouteFeasibilityOutput {
  return {
    feasible: true,
    riskLevel: 'CAUTION',
    blockedReasons: [],
    recommendedAdjustments: [],
    daylightSummary: {
      regime: 'midnight_sun',
      daylightRisk: 'LOW',
      temporalMileageUnbounded: false,
      civilTwilightHours: 24,
      daylightHours: 24,
    },
    constraints: {
      mustLeaveBy: '06:00',
      safeDrivingWindowEnd: '22:00',
      safeDrivingWindowHours: 16,
      estimatedDrivingHours: 4,
      effectiveSafeDrivingWindowHours: 16,
      daylightAnchorRegion: 'reykjavik',
      weatherRegionsAssessed: ['reykjavik'],
      assumedAverageSpeedKmh: 60,
    },
    energyDemandEstimate: {
      totalKm: 100,
      estimatedFuelLitersGasolineEquiv: 10,
      estimatedEvKwh: 20,
      fuelBurnModelId: 'test',
    },
    tunnelProtocol: {
      triggered: false,
      drivingNotes: [],
      affectedSegments: [],
    },
    roadSurfaceAlerts: {
      triggered: false,
      drivingNotes: [],
      affectedSegments: [],
    },
    usedDistanceHeuristic: false,
    p0SkillsInvoked: [],
    ...over,
  } as IcelandRouteFeasibilityOutput;
}

function minimalEnergy(over: Partial<IcelandGasEvPlannerOutput> = {}): IcelandGasEvPlannerOutput {
  return {
    feasible: true,
    refuel_or_charge_required: false,
    recommended_stops: [],
    safety_alerts: [],
    metrics: {
      energy_mode: 'ice',
      vehicle_class: '4x4',
      total_km: 100,
      estimated_consumption_l_or_kwh: 12,
      usable_capacity_l_or_kwh: 50,
      nominal_range_km: 400,
      range_anxiety_threshold_km: 120,
    },
    ...over,
  } as IcelandGasEvPlannerOutput;
}

describe('check-trip-safety-dual-audit.assembler', () => {
  it('collectUnknownRegionDegradation flags unknown preset regions', () => {
    const r = collectUnknownRegionDegradation([
      { from_region: 'reykjavik', to_region: 'not_a_real_region_xyz' },
    ]);
    expect(r.degraded).toBe(true);
    expect(r.reasons.some((x) => x.includes('not_a_real_region_xyz'))).toBe(true);
  });

  it('does not bump risk when energy planner is absent (TIGHT skip)', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute({ riskLevel: 'CAUTION', feasible: true }),
      energy: null,
      segments: [{ from_region: 'reykjavik', to_region: 'vik' }],
    });
    expect(v.risk_level).toBe('CAUTION');
    expect(v.energy_logistics.energy_status).toBe('TIGHT');
    expect(v.feasible).toBe(true);
    expect(v.physical_constraints.tunnel_protocol.triggered).toBe(false);
    expect(v.physical_constraints.tunnel_protocol.protocol_code).toBeNull();
    expect(v.physical_constraints.tunnel_protocol.driving_notes).toBe('');
    expect(v.physical_constraints.tunnel_protocol.affected_segments).toEqual([]);
    expect(v.physical_constraints.road_surface_alerts.triggered).toBe(false);
    expect(v.physical_constraints.road_surface_alerts.protocol_code).toBeNull();
    expect(v.physical_constraints.road_surface_alerts.driving_notes).toBe('');
    expect(v.physical_constraints.road_surface_alerts.affected_segments).toEqual([]);
  });

  it('maps road_surface_alerts to MCP snake_case when gravel is flagged on route', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute({
        roadSurfaceAlerts: {
          triggered: true,
          protocolCode: 'REVIEW_GRAVEL_PROTECTION_INSURANCE',
          drivingNotes: ['Note one.', 'Note two.'],
          affectedSegments: ['reykjavik-vik'],
        },
      }),
      energy: minimalEnergy(),
      segments: [{ from_region: 'reykjavik', to_region: 'vik', surface: 'gravel' }],
    });
    expect(v.physical_constraints.road_surface_alerts.triggered).toBe(true);
    expect(v.physical_constraints.road_surface_alerts.protocol_code).toBe('REVIEW_GRAVEL_PROTECTION_INSURANCE');
    expect(v.physical_constraints.road_surface_alerts.driving_notes).toBe('Note one. Note two.');
    expect(v.physical_constraints.road_surface_alerts.affected_segments).toEqual(['reykjavik-vik']);
  });

  it('maps tunnel_protocol to MCP snake_case when Westfjords mesh is flagged on route', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute({
        tunnelProtocol: {
          triggered: true,
          protocolCode: 'REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL',
          drivingNotes: ['Alpha note.', 'Beta note.'],
          affectedSegments: ['holmavik-isafjordur', 'isafjordur-patreksfjordur'],
        },
      }),
      energy: minimalEnergy(),
      segments: [{ from_region: 'holmavik', to_region: 'isafjordur' }],
    });
    expect(v.physical_constraints.tunnel_protocol.triggered).toBe(true);
    expect(v.physical_constraints.tunnel_protocol.protocol_code).toBe('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(v.physical_constraints.tunnel_protocol.driving_notes).toBe('Alpha note. Beta note.');
    expect(v.physical_constraints.tunnel_protocol.affected_segments).toEqual([
      'holmavik-isafjordur',
      'isafjordur-patreksfjordur',
    ]);
  });

  it('bumps risk to DANGEROUS when energy audit is CRITICAL', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute({ riskLevel: 'CAUTION', feasible: true }),
      energy: minimalEnergy({
        feasible: false,
        refuel_or_charge_required: true,
        recommended_stops: [],
        safety_alerts: ['no station in corridor'],
      }),
      segments: [{ from_region: 'reykjavik', to_region: 'vik' }],
    });
    expect(v.risk_level).toBe('DANGEROUS');
    expect(v.energy_logistics.energy_status).toBe('CRITICAL');
  });

  it('detects declared F-road segments via roadId', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute(),
      energy: minimalEnergy(),
      segments: [{ from_region: 'vik', to_region: 'landmannalaugar', roadId: 'F208' }],
    });
    expect(v.physical_constraints.road_status.f_road_segments_declared).toBe(true);
  });

  it('caps verdict risk to DANGEROUS when route is hard-blocked (P0 infeasible)', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute({ feasible: false, riskLevel: 'CAUTION', blockedReasons: ['VEHICLE_TYPE_INCOMPATIBLE'] }),
      energy: minimalEnergy(),
      segments: [{ from_region: 'reykjavik', to_region: 'vik' }],
    });
    expect(v.risk_level).toBe('DANGEROUS');
    expect(v.feasible).toBe(false);
  });

  it('adds narrative_summary when route is hard-blocked', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute({
        feasible: false,
        riskLevel: 'CAUTION',
        blockedReasons: ['ROAD_CLOSED'],
        daylightSummary: {
          regime: 'polar_night',
          daylightRisk: 'HIGH',
          temporalMileageUnbounded: false,
          civilTwilightHours: 6,
          daylightHours: 3,
        },
      }),
      energy: minimalEnergy({
        must_refill_before: { station_id: 'n1_vik', warning: 'highlands' },
        recommended_stops: [{ station_id: 'n1_vik', name: 'Vík anchor', kind: 'gas', match_reason: 'x' }],
        safety_alerts: ['Supply desert: highlands — enter carefully'],
      }),
      segments: [{ from_region: 'vik', to_region: 'highlands_center' }],
    });
    expect(v.narrative_summary).toBeDefined();
    expect(v.narrative_summary).toMatch(/Critical safety block: ROAD_CLOSED/);
    expect(v.narrative_summary).toMatch(/polar_night/);
    expect(v.narrative_summary).toMatch(/Vík anchor/);
  });

  it('maps before_highlands match to REFILL_BEFORE_HIGHLANDS action', () => {
    const v = assembleCheckTripSafetyDualVerdictV1({
      route: minimalRoute(),
      energy: minimalEnergy({
        refuel_or_charge_required: true,
        must_refill_before: { station_id: 's_vik', warning: 'highlands ahead' },
        recommended_stops: [
          {
            station_id: 's_vik',
            name: 'Vík',
            kind: 'fuel',
            match_reason: 'corridor:before_highlands',
          },
        ],
        safety_alerts: [],
      }),
      segments: [{ from_region: 'reykjavik', to_region: 'highlands_center' }],
    });
    expect(v.energy_logistics.recommended_stops[0]?.action).toBe('REFILL_BEFORE_HIGHLANDS');
  });
});
