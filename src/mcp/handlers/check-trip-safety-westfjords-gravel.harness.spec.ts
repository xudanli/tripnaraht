/**
 * Stress harness (Jest): Westfjords deep loop — gravel + mixed surface duration penalty,
 * energyPlanningKm uplift, EV campervan charge anxiety, dual-audit verdict assembly.
 *
 * Run: npx jest src/mcp/handlers/check-trip-safety-westfjords-gravel.harness.spec.ts --no-cache
 *
 * Note: At Ísafjörður, 2026-10-15 civil twilight is still ~11.4h while default-60km/h
 * driving time for this payload is ~8.6h, so daylight "death cross" is asserted on
 * 2026-11-15 (civil ~8.2h) with the same segments — still late autumn / first-snow season.
 */
import { Test } from '@nestjs/testing';
import { mapMcpPayloadToRouteFeasibilityInput } from './iceland-safety-check.handler';
import { assembleCheckTripSafetyDualVerdictV1 } from './check-trip-safety-dual-audit.assembler';
import { IcelandRouteFeasibilitySkill } from '../../skills/world/iceland-route-feasibility.skill';
import { IcelandDaylightWindowSkill } from '../../skills/world/iceland-daylight-window.skill';
import { IcelandFRoadStatusSkill } from '../../skills/world/iceland-f-road-status.skill';
import { IcelandWindRiskSkill } from '../../skills/world/iceland-wind-risk.skill';
import { IcelandWeatherSeverityClassifierSkill } from '../../skills/world/iceland-weather-severity-classifier.skill';
import { IcelandGasEvChargePlannerSkill } from '../../skills/world/iceland-gas-ev-planner.skill';
import { IcelandTunnelProtocolSkill } from '../../skills/world/iceland-tunnel-protocol.skill';
import { IcelandRoadSurfaceAlertsSkill } from '../../skills/world/iceland-road-surface-alerts.skill';

const WESTFJORDS_SEGMENTS = [
  { from_region: 'holmavik', to_region: 'isafjordur', distance_km: 220, surface: 'gravel' },
  { from_region: 'isafjordur', to_region: 'patreksfjordur', distance_km: 170, surface: 'mixed' },
] as const;

function deterministicWindWx() {
  const wind = {
    execute: async () => ({
      region: 'westfjords_stress_mock',
      crosswindRisk: 'low' as const,
      campervanWarning: false,
      dangerousSegments: [] as string[],
      maxWindMps: 8,
    }),
  };
  const wx = {
    execute: async () => ({
      travelRisk: 'safe' as const,
      drivingRecommendation: [] as string[],
    }),
  };
  return { wind, wx };
}

describe('check_trip_safety Westfjords deep loop (gravel + EV stress harness)', () => {
  it('2026-10-15 — energyPlanningKm + duration math + EV TIGHT + Ísafjörður hybrid in recommendations', async () => {
    const fRoad = { execute: async () => ({ roads: [], sources: [], dataGaps: [] as string[] }) };
    const { wind, wx } = deterministicWindWx();

    const m = await Test.createTestingModule({
      providers: [
        IcelandRouteFeasibilitySkill,
        IcelandDaylightWindowSkill,
        { provide: IcelandFRoadStatusSkill, useValue: fRoad },
        { provide: IcelandWindRiskSkill, useValue: wind },
        { provide: IcelandWeatherSeverityClassifierSkill, useValue: wx },
        IcelandGasEvChargePlannerSkill,
        IcelandTunnelProtocolSkill,
        IcelandRoadSurfaceAlertsSkill,
      ],
    }).compile();

    const routeSkill = m.get(IcelandRouteFeasibilitySkill);
    const gasSkill = m.get(IcelandGasEvChargePlannerSkill);

    const input = mapMcpPayloadToRouteFeasibilityInput({
      travel_date: '2026-10-15',
      vehicle_type: 'campervan',
      energy_mode: 'ev',
      itinerary_segments: [...WESTFJORDS_SEGMENTS],
    } as any);

    const route = await routeSkill.execute(input);
    const energy = await gasSkill.execute({
      request_id: input.request_id,
      energyDemandEstimate: route.energyDemandEstimate,
      segments: input.segments,
      vehicle: input.vehicle,
      energy_mode: 'ev',
    });

    const verdict = assembleCheckTripSafetyDualVerdictV1({
      route,
      energy,
      segments: input.segments,
    });

    // eslint-disable-next-line no-console
    console.log('\n--- WESTFJORDS_DUAL_AUDIT (2026-10-15) ---\n', JSON.stringify({ verdict, infrastructure_audit: energy }, null, 2));

    const geoKm = 390;
    const expectedPlanningKm = Math.round((220 * 1.22 + 170 * 1.12) * 10) / 10;
    expect(route.energyDemandEstimate.totalKm).toBe(geoKm);
    expect(route.energyDemandEstimate.energyPlanningKm).toBeCloseTo(expectedPlanningKm, 3);

    const expectedDriveH = 220 / (60 * 0.7) + 170 / (60 * 0.85);
    expect(route.constraints.estimatedDrivingHours).toBeCloseTo(expectedDriveH, 2);
    expect(route.constraints.estimatedDrivingHours).toBeLessThan(route.constraints.safeDrivingWindowHours);

    expect(energy.refuel_or_charge_required).toBe(true);
    expect(energy.metrics?.energy_mode).toBe('ev');
    expect(verdict.energy_logistics.energy_status).toBe('TIGHT');
    expect(verdict.risk_level).toBe('HIGH');
    expect(verdict.feasible).toBe(true);

    const isafStop = energy.recommended_stops.find((s) => s.station_id === 'westfjords_isafjordur_anchor');
    expect(isafStop).toBeDefined();

    expect(verdict.summary).toMatch(/TIGHT|refuel\/charge planning/i);
    expect(verdict.recommended_adjustments).toContain('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(route.p0SkillsInvoked).toContain('iceland.tunnelProtocol');
    expect(verdict.physical_constraints.tunnel_protocol.triggered).toBe(true);
    expect(verdict.physical_constraints.tunnel_protocol.protocol_code).toBe('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(verdict.physical_constraints.tunnel_protocol.affected_segments).toEqual([
      'holmavik-isafjordur',
      'isafjordur-patreksfjordur',
    ]);
    expect(verdict.physical_constraints.tunnel_protocol.driving_notes).toMatch(/Vestfjarðagöng|single-lane/i);
    expect(verdict.recommended_adjustments).toContain('REVIEW_GRAVEL_PROTECTION_INSURANCE');
    expect(route.p0SkillsInvoked).toContain('iceland.roadSurfaceAlerts');
    expect(verdict.physical_constraints.road_surface_alerts.triggered).toBe(true);
    expect(verdict.physical_constraints.road_surface_alerts.protocol_code).toBe('REVIEW_GRAVEL_PROTECTION_INSURANCE');
    expect(verdict.physical_constraints.road_surface_alerts.affected_segments).toEqual(['holmavik-isafjordur']);
    expect(verdict.physical_constraints.road_surface_alerts.driving_notes).toMatch(/Gravel Protection|windshield/i);
    expect(verdict.recommended_adjustments).not.toContain('REDUCE_DAILY_MILEAGE');
  });

  it('2026-11-15 same segments — driving hours exceed civil safe window (daylight coupling)', async () => {
    const fRoad = { execute: async () => ({ roads: [], sources: [], dataGaps: [] as string[] }) };
    const { wind, wx } = deterministicWindWx();

    const m = await Test.createTestingModule({
      providers: [
        IcelandRouteFeasibilitySkill,
        IcelandDaylightWindowSkill,
        { provide: IcelandFRoadStatusSkill, useValue: fRoad },
        { provide: IcelandWindRiskSkill, useValue: wind },
        { provide: IcelandWeatherSeverityClassifierSkill, useValue: wx },
        IcelandGasEvChargePlannerSkill,
        IcelandTunnelProtocolSkill,
        IcelandRoadSurfaceAlertsSkill,
      ],
    }).compile();

    const routeSkill = m.get(IcelandRouteFeasibilitySkill);
    const gasSkill = m.get(IcelandGasEvChargePlannerSkill);

    const input = mapMcpPayloadToRouteFeasibilityInput({
      travel_date: '2026-11-15',
      vehicle_type: 'campervan',
      energy_mode: 'ev',
      itinerary_segments: [...WESTFJORDS_SEGMENTS],
    } as any);

    const route = await routeSkill.execute(input);
    const energy = await gasSkill.execute({
      request_id: input.request_id,
      energyDemandEstimate: route.energyDemandEstimate,
      segments: input.segments,
      vehicle: input.vehicle,
      energy_mode: 'ev',
    });

    const verdict = assembleCheckTripSafetyDualVerdictV1({ route, energy, segments: input.segments });

    expect(route.constraints.estimatedDrivingHours).toBeGreaterThan(route.constraints.safeDrivingWindowHours);
    expect(route.recommendedAdjustments).toEqual(expect.arrayContaining(['REDUCE_DAILY_MILEAGE']));
    expect(route.recommendedAdjustments).toContain('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(verdict.energy_logistics.energy_status).toBe('TIGHT');
    expect(verdict.risk_level).toBe('HIGH');
  });
});
