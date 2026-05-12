/**
 * Stress harness (Jest): winter 2wd + F208 + long km — dual audit output for MCP parity checks.
 * Run: npx jest src/mcp/handlers/check-trip-safety-winter-stress.harness.spec.ts --no-cache
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

describe('check_trip_safety winter highlands stress (harness)', () => {
  it('prints dual-audit payload (mock F208 closed + real daylight + real gas planner)', async () => {
    const fRoadWinterClosed = {
      execute: async () => ({
        roads: [
          {
            roadId: 'F208',
            status: 'closed' as const,
            requires4x4: true,
            riverCrossing: true,
            camperRestricted: true,
            confidence: 0.95,
          },
        ],
        sources: ['stress_mock:seasonal_winter_closure'],
        dataGaps: [] as string[],
      }),
    };
    const wind = {
      execute: async () => ({
        region: 'vik',
        crosswindRisk: 'low' as const,
        campervanWarning: false,
        dangerousSegments: [] as string[],
        maxWindMps: 9,
      }),
    };
    const wx = {
      execute: async () => ({
        travelRisk: 'caution' as const,
        drivingRecommendation: ['Winter driving: allow extra margin; verify road.is / vegagerdin.is.'],
      }),
    };

    const m = await Test.createTestingModule({
      providers: [
        IcelandRouteFeasibilitySkill,
        IcelandDaylightWindowSkill,
        { provide: IcelandFRoadStatusSkill, useValue: fRoadWinterClosed },
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
      travel_date: '2026-12-20',
      vehicle_type: '2wd',
      energy_mode: 'ice',
      itinerary_segments: [
        { from_region: 'South Coast', to_region: 'Highlands', road_id: 'F208', distance_km: 100 },
        { from_region: 'Highlands', to_region: 'Eastfjords', distance_km: 250 },
      ],
    } as any);

    const route = await routeSkill.execute(input);
    const energy = await gasSkill.execute({
      request_id: input.request_id,
      energyDemandEstimate: route.energyDemandEstimate,
      segments: input.segments,
      vehicle: input.vehicle,
      energy_mode: 'ice',
    });

    const verdict = assembleCheckTripSafetyDualVerdictV1({
      route,
      energy,
      segments: input.segments,
    });

    // eslint-disable-next-line no-console
    console.log('\n--- DUAL_AUDIT_JSON ---\n', JSON.stringify({ verdict, infrastructure_audit: energy }, null, 2));

    expect(route.feasible).toBe(false);
    expect(route.blockedReasons).toEqual(expect.arrayContaining(['VEHICLE_TYPE_INCOMPATIBLE', 'ROAD_CLOSED']));
    expect(verdict.physical_constraints.road_status.f_road_segments_declared).toBe(true);
    expect(verdict.audit_degraded).toBe(false);
    expect(verdict.feasible).toBe(false);
    expect(verdict.risk_level).toBe('DANGEROUS');
    expect(verdict.physical_constraints.daylight.regime).toBe('polar_night');

    const vikStop = energy.recommended_stops.find((s) => /vik/i.test(s.name) || s.station_id.includes('vik'));
    expect(vikStop).toBeDefined();
    expect(energy.must_refill_before?.station_id).toBe('n1_vik_south_anchor');
  });
});
