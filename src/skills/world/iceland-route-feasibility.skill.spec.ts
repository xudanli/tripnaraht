import { Test } from '@nestjs/testing';
import { IcelandRouteFeasibilitySkill } from './iceland-route-feasibility.skill';
import { IcelandDaylightWindowSkill } from './iceland-daylight-window.skill';
import { IcelandFRoadStatusSkill } from './iceland-f-road-status.skill';
import { IcelandWindRiskSkill } from './iceland-wind-risk.skill';
import { IcelandWeatherSeverityClassifierSkill } from './iceland-weather-severity-classifier.skill';
import { IcelandTunnelProtocolSkill } from './iceland-tunnel-protocol.skill';
import { IcelandRoadSurfaceAlertsSkill } from './iceland-road-surface-alerts.skill';

describe('IcelandRouteFeasibilitySkill', () => {
  it('composes P0 mocks and returns feasible verdict', async () => {
    const daylight = {
      execute: jest.fn().mockResolvedValue({
        daylightHours: 5,
        civilTwilightHours: 6,
        daylightRegime: 'normal',
        temporalMileageUnbounded: false,
        daylightRisk: 'HIGH',
        nightDrivingRisk: 'high',
        safeDrivingWindow: {
          start: '2026-12-15T10:00:00.000+00:00',
          end: '2026-12-15T16:00:00.000+00:00',
        },
      }),
    };
    const fRoad = {
      execute: jest.fn().mockResolvedValue({
        roads: [
          {
            roadId: 'F208',
            status: 'open',
            requires4x4: true,
            riverCrossing: true,
            camperRestricted: true,
            confidence: 0.9,
          },
        ],
        sources: ['t'],
        dataGaps: [],
      }),
    };
    const wind = {
      execute: jest.fn().mockResolvedValue({
        region: 'vik',
        crosswindRisk: 'low',
        campervanWarning: false,
        dangerousSegments: [],
        maxWindMps: 8,
      }),
    };
    const wx = {
      execute: jest.fn().mockResolvedValue({
        travelRisk: 'safe',
        drivingRecommendation: [],
      }),
    };

    const m = await Test.createTestingModule({
      providers: [
        IcelandRouteFeasibilitySkill,
        { provide: IcelandDaylightWindowSkill, useValue: daylight },
        { provide: IcelandFRoadStatusSkill, useValue: fRoad },
        { provide: IcelandWindRiskSkill, useValue: wind },
        { provide: IcelandWeatherSeverityClassifierSkill, useValue: wx },
        IcelandTunnelProtocolSkill,
        IcelandRoadSurfaceAlertsSkill,
      ],
    }).compile();

    const skill = m.get(IcelandRouteFeasibilitySkill);
    const out = await skill.execute({
      request_id: 'r1',
      travelDate: '2026-12-15',
      vehicle: { type: '4x4' },
      segments: [{ from_region: 'reykjavik', to_region: 'vik', roadId: 'F208', distanceKm: 100 }],
    });

    expect(out.feasible).toBe(true);
    expect(out.constraints.estimatedDrivingHours).toBeCloseTo(1.67, 1);
    expect(out.energyDemandEstimate.totalKm).toBe(100);
    expect(out.energyDemandEstimate.estimatedFuelLitersGasolineEquiv).toBeGreaterThan(0);
    expect(out.daylightSummary.regime).toBe('normal');
    expect(out.p0SkillsInvoked).toEqual(expect.arrayContaining(['iceland.daylightWindow', 'iceland.fRoadStatus']));
    expect(out.recommendedAdjustments).not.toContain('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(out.tunnelProtocol.triggered).toBe(false);
    expect(out.tunnelProtocol.affectedSegments).toEqual([]);
    expect(out.roadSurfaceAlerts.triggered).toBe(false);
    expect(out.roadSurfaceAlerts.affectedSegments).toEqual([]);
    expect(daylight.execute).toHaveBeenCalled();
    expect(fRoad.execute).toHaveBeenCalledWith(expect.objectContaining({ roadIds: ['F208'] }));
  });

  it('merges Vestfjarðagöng tunnel protocol when Westfjords mesh presets appear', async () => {
    const daylight = {
      execute: jest.fn().mockResolvedValue({
        daylightHours: 8,
        civilTwilightHours: 10,
        daylightRegime: 'normal',
        temporalMileageUnbounded: false,
        daylightRisk: 'LOW',
        nightDrivingRisk: 'low',
        safeDrivingWindow: {
          start: '2026-10-15T08:00:00.000+00:00',
          end: '2026-10-15T20:00:00.000+00:00',
        },
      }),
    };
    const fRoad = {
      execute: jest.fn().mockResolvedValue({ roads: [], sources: [], dataGaps: [] }),
    };
    const wind = {
      execute: jest.fn().mockResolvedValue({
        region: 'holmavik',
        crosswindRisk: 'low',
        campervanWarning: false,
        dangerousSegments: [],
        maxWindMps: 6,
      }),
    };
    const wx = {
      execute: jest.fn().mockResolvedValue({
        travelRisk: 'safe',
        drivingRecommendation: [],
      }),
    };

    const m = await Test.createTestingModule({
      providers: [
        IcelandRouteFeasibilitySkill,
        { provide: IcelandDaylightWindowSkill, useValue: daylight },
        { provide: IcelandFRoadStatusSkill, useValue: fRoad },
        { provide: IcelandWindRiskSkill, useValue: wind },
        { provide: IcelandWeatherSeverityClassifierSkill, useValue: wx },
        IcelandTunnelProtocolSkill,
        IcelandRoadSurfaceAlertsSkill,
      ],
    }).compile();

    const skill = m.get(IcelandRouteFeasibilitySkill);
    const out = await skill.execute({
      request_id: 'r2',
      travelDate: '2026-10-15',
      vehicle: { type: '4x4' },
      segments: [{ from_region: 'holmavik', to_region: 'isafjordur', distanceKm: 100 }],
    });

    expect(out.recommendedAdjustments).toContain('REVIEW_VESTFJARDAR_TUNNEL_PROTOCOL');
    expect(out.p0SkillsInvoked).toContain('iceland.tunnelProtocol');
    expect(out.tunnelProtocol.triggered).toBe(true);
    expect(out.tunnelProtocol.affectedSegments).toEqual(['holmavik-isafjordur']);
  });

  it('merges gravel road-surface insurance alert when surface is gravel', async () => {
    const daylight = {
      execute: jest.fn().mockResolvedValue({
        daylightHours: 8,
        civilTwilightHours: 10,
        daylightRegime: 'normal',
        temporalMileageUnbounded: false,
        daylightRisk: 'LOW',
        nightDrivingRisk: 'low',
        safeDrivingWindow: {
          start: '2026-10-15T08:00:00.000+00:00',
          end: '2026-10-15T20:00:00.000+00:00',
        },
      }),
    };
    const fRoad = {
      execute: jest.fn().mockResolvedValue({ roads: [], sources: [], dataGaps: [] }),
    };
    const wind = {
      execute: jest.fn().mockResolvedValue({
        region: 'vik',
        crosswindRisk: 'low',
        campervanWarning: false,
        dangerousSegments: [],
        maxWindMps: 6,
      }),
    };
    const wx = {
      execute: jest.fn().mockResolvedValue({
        travelRisk: 'safe',
        drivingRecommendation: [],
      }),
    };

    const m = await Test.createTestingModule({
      providers: [
        IcelandRouteFeasibilitySkill,
        { provide: IcelandDaylightWindowSkill, useValue: daylight },
        { provide: IcelandFRoadStatusSkill, useValue: fRoad },
        { provide: IcelandWindRiskSkill, useValue: wind },
        { provide: IcelandWeatherSeverityClassifierSkill, useValue: wx },
        IcelandTunnelProtocolSkill,
        IcelandRoadSurfaceAlertsSkill,
      ],
    }).compile();

    const skill = m.get(IcelandRouteFeasibilitySkill);
    const out = await skill.execute({
      request_id: 'r3',
      travelDate: '2026-10-15',
      vehicle: { type: '2wd' },
      segments: [{ from_region: 'reykjavik', to_region: 'vik', distanceKm: 120, surface: 'gravel' }],
    });

    expect(out.recommendedAdjustments).toContain('REVIEW_GRAVEL_PROTECTION_INSURANCE');
    expect(out.p0SkillsInvoked).toContain('iceland.roadSurfaceAlerts');
    expect(out.roadSurfaceAlerts.triggered).toBe(true);
    expect(out.roadSurfaceAlerts.affectedSegments).toEqual(['reykjavik-vik']);
  });
});
