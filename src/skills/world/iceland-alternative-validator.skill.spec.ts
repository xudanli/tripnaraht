import { Test } from '@nestjs/testing';
import { IcelandAlternativeValidatorSkill } from './iceland-alternative-validator.skill';
import { IcelandRouteFeasibilitySkill } from './iceland-route-feasibility.skill';
import { IcelandGasEvChargePlannerSkill } from './iceland-gas-ev-planner.skill';
import { IcelandDaylightWindowSkill } from './iceland-daylight-window.skill';
import { IcelandFRoadStatusSkill } from './iceland-f-road-status.skill';
import { IcelandWindRiskSkill } from './iceland-wind-risk.skill';
import { IcelandWeatherSeverityClassifierSkill } from './iceland-weather-severity-classifier.skill';
import { IcelandTunnelProtocolSkill } from './iceland-tunnel-protocol.skill';
import { IcelandRoadSurfaceAlertsSkill } from './iceland-road-surface-alerts.skill';
import { runIcelandCheckTripSafetyDualAudit } from './utils/iceland-dual-audit-run.util';

describe('IcelandAlternativeValidatorSkill (integration)', () => {
  it('returns at least one validated alternative when ring removes F-road', async () => {
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
        sources: ['mock'],
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
        travelRisk: 'safe' as const,
        drivingRecommendation: [] as string[],
      }),
    };

    const m = await Test.createTestingModule({
      providers: [
        IcelandAlternativeValidatorSkill,
        IcelandRouteFeasibilitySkill,
        IcelandGasEvChargePlannerSkill,
        IcelandDaylightWindowSkill,
        { provide: IcelandFRoadStatusSkill, useValue: fRoadWinterClosed },
        { provide: IcelandWindRiskSkill, useValue: wind },
        { provide: IcelandWeatherSeverityClassifierSkill, useValue: wx },
        IcelandTunnelProtocolSkill,
        IcelandRoadSurfaceAlertsSkill,
      ],
    }).compile();

    const route = m.get(IcelandRouteFeasibilitySkill);
    const gas = m.get(IcelandGasEvChargePlannerSkill);
    const validator = m.get(IcelandAlternativeValidatorSkill);

    const badInput = {
      request_id: 'val_int_1',
      travelDate: '2026-12-20',
      vehicle: { type: '2wd' as const },
      segments: [
        { from_region: 'vik', to_region: 'highlands_center', roadId: 'F208', distanceKm: 100 },
        { from_region: 'highlands_center', to_region: 'egilsstadir', distanceKm: 250 },
      ],
    };

    const first = await runIcelandCheckTripSafetyDualAudit(route, gas, badInput, 'ice');
    expect(first.verdict.feasible).toBe(false);

    const out = await validator.execute({
      request_id: badInput.request_id,
      travelDate: badInput.travelDate,
      vehicle: badInput.vehicle,
      original_segments: badInput.segments,
      failed_verdict: first.verdict,
      energy_mode: 'ice',
    });

    expect(out.validated_alternatives.length).toBeGreaterThan(0);
    expect(out.validated_alternatives[0].pre_checked_verdict.feasible).toBe(true);
    expect(out.validated_alternatives[0].segments.every((s) => !s.roadId)).toBe(true);
  });
});
