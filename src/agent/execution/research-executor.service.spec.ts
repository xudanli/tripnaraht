/**
 * ResearchPipelineService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ResearchPipelineService } from '../teams/research/research-pipeline.service';
import { WorldModelCollectorService } from './shared/world-model-collector.service';
import { PredictionCollectorService } from './shared/prediction-collector.service';
import { ContextHydrationService } from './shared/context-hydration.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ResearchMemberRegistry } from '../teams/research/research-member.registry';
import { TransportResearchMember } from '../teams/research/transport-research.member';
import { ComplianceResearchMember } from '../teams/research/compliance-research.member';
import { DestinationResearchMember } from '../teams/research/destination-research.member';
import { HotelResearchMember } from '../teams/research/hotel-research.member';
import { FlightResearchMember } from '../teams/research/flight-research.member';

describe('ResearchPipelineService', () => {
  let service: ResearchPipelineService;
  let mockWorldModel: { collect: jest.Mock };
  let mockPrediction: { collect: jest.Mock };
  let mockSkillsRegistry: { getSkill: jest.Mock };

  beforeEach(async () => {
    mockWorldModel = { collect: jest.fn().mockResolvedValue(undefined) };
    mockPrediction = { collect: jest.fn().mockResolvedValue(undefined) };
    mockSkillsRegistry = { getSkill: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchPipelineService,
        ContextHydrationService,
        DestinationResearchMember,
        HotelResearchMember,
        FlightResearchMember,
        TransportResearchMember,
        ComplianceResearchMember,
        ResearchMemberRegistry,
        { provide: WorldModelCollectorService, useValue: mockWorldModel },
        { provide: PredictionCollectorService, useValue: mockPrediction },
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    service = module.get<ResearchPipelineService>(ResearchPipelineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 tripPlanRequest 时应跳过 WorldModel 和 Prediction', async () => {
    const dso = { requestId: 'r1', systemState: { requestId: 'r1' } } as any;
    const result = await service.execute(dso, { requestId: 'r1' });
    expect(result.researchData).toBeDefined();
    expect(result.environmentPatch).toBeDefined();
    expect(mockWorldModel.collect).not.toHaveBeenCalled();
    expect(mockPrediction.collect).not.toHaveBeenCalled();
  });

  it('当 origin 与 destination 均为坐标对象时应调用 transport.search', async () => {
    const transportExecute = jest.fn().mockResolvedValue({
      evidence_id: 'transport_ev_1',
      options: [],
      origin: { lat: 64, lng: -21 },
      destination: { lat: 65, lng: -18 },
    });
    const poiExecute = jest.fn().mockResolvedValue({ pois: [] });
    mockSkillsRegistry.getSkill.mockImplementation((name: string) => {
      if (name === 'transport.search') return { execute: transportExecute };
      if (name === 'poi.search') return { execute: poiExecute };
      return null;
    });
    await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      tripPlanRequest: {
        origin: { lat: 64.0, lng: -21.0 },
        destination: { lat: 64.5, lng: -21.5 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        party: { count: 2 },
      },
    } as any);
    expect(transportExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { lat: 64.0, lng: -21.0 },
        destination: { lat: 64.5, lng: -21.5 },
      }),
    );
  });

  it('起点为占位词且 DSO.userIntent 含坐标时应回填并调用 transport.search', async () => {
    const transportExecute = jest.fn().mockResolvedValue({
      evidence_id: 'transport_ev_h',
      options: [],
      origin: {},
      destination: {},
    });
    const poiExecute = jest.fn().mockResolvedValue({ pois: [] });
    mockSkillsRegistry.getSkill.mockImplementation((name: string) => {
      if (name === 'transport.search') return { execute: transportExecute };
      if (name === 'poi.search') return { execute: poiExecute };
      return null;
    });
    const result = await service.execute(
      {
        requestId: 'r1',
        userIntent: { origin: { lat: 64.1, lng: -21.9 } },
      } as any,
      {
        requestId: 'r1',
        tripPlanRequest: {
          origin: '起点',
          destination: 'Akureyri',
          date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
          party: { count: 2 },
        },
      } as any,
    );
    expect((result.researchData as any).transport_endpoint_hydration?.fields).toContain('origin');
    expect(transportExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { lat: 64.1, lng: -21.9 },
        destination: 'Akureyri',
      }),
    );
  });

  it('有 tripPlanRequest 时应调用 WorldModel 和 Prediction', async () => {
    const dso = { requestId: 'r1' } as any;
    const ctx = {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        party: { count: 2 },
      },
    };
    const result = await service.execute(dso, ctx);
    expect(mockWorldModel.collect).toHaveBeenCalled();
    expect(mockPrediction.collect).toHaveBeenCalled();
    expect(result.researchData).toBeDefined();
    expect(result.environmentPatch).toBeDefined();
  });

  it('无 skillsRegistry 时应跳过 Skills 但仍返回 environmentPatch', async () => {
    const module2 = await Test.createTestingModule({
      providers: [
        ResearchPipelineService,
        ContextHydrationService,
        DestinationResearchMember,
        HotelResearchMember,
        FlightResearchMember,
        TransportResearchMember,
        ComplianceResearchMember,
        ResearchMemberRegistry,
        { provide: WorldModelCollectorService, useValue: mockWorldModel },
        { provide: PredictionCollectorService, useValue: mockPrediction },
      ],
    }).compile();
    const svc = module2.get<ResearchPipelineService>(ResearchPipelineService);
    const result = await svc.execute({} as any, {
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
    });
    expect(result.researchData).toBeDefined();
    expect(result.environmentPatch).toBeDefined();
  });

  it('应从 failure_risk_prediction / weather_forecast 派生 windSpeedMs 并写入 environmentPatch', async () => {
    const prev = process.env.DECISION_OS_WIND_AGG;
    process.env.DECISION_OS_WIND_AGG = 'mean';

    mockPrediction.collect.mockImplementation(async (_req: any, researchData: any) => {
      researchData.failure_risk_prediction = {
        predictions: [
          { day: 1, windSpeed: 22, riskLevel: 'MEDIUM' },
          { day: 2, windSpeed: 18, riskLevel: 'LOW' },
        ],
      };
      researchData.failure_risk_prediction_evidence_id = 'failure_risk_prediction_test_1';
      researchData.failure_risk_prediction_evidence_source = 'FailureRiskPredictionService.predictFailureRisk';
    });
    mockWorldModel.collect.mockImplementation(async (_req: any, researchData: any) => {
      researchData.weather_forecast = {
        forecasts: [{ wind: { speed_kmh: 36 } }, { wind: { speed_kmh: 72 } }],
      };
    });

    const dso = { requestId: 'r1' } as any;
    const ctx = {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        party: { count: 2 },
      },
      routeDirectionId: 'rd-1',
    };

    const result = await service.execute(dso, ctx as any);
    // failure_risk_prediction 优先级更高，应取均值 (22+18)/2 = 20m/s
    expect(result.researchData.windSpeedMs).toBe(20);
    expect(result.environmentPatch.windSpeedMs).toBe(20);
    expect((result.researchData as any).windSpeedMs_meta).toMatchObject({
      source: 'failure_risk_prediction',
      aggregation: 'mean',
      sampleCount: 2,
    });
    expect((result.researchData as any).windSpeedMs_meta?.evidence?.ids).toEqual(['failure_risk_prediction_test_1']);

    if (prev !== undefined) process.env.DECISION_OS_WIND_AGG = prev;
    else delete process.env.DECISION_OS_WIND_AGG;
  });

  it('DECISION_OS_WIND_AGG=max 时 windSpeedMs 应取最大值', async () => {
    const prev = process.env.DECISION_OS_WIND_AGG;
    process.env.DECISION_OS_WIND_AGG = 'max';

    mockPrediction.collect.mockImplementation(async (_req: any, researchData: any) => {
      researchData.failure_risk_prediction = {
        predictions: [
          { day: 1, windSpeed: 12, riskLevel: 'LOW' },
          { day: 2, windSpeed: 30, riskLevel: 'HIGH' },
        ],
      };
    });
    mockWorldModel.collect.mockResolvedValue(undefined);

    const result = await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        party: { count: 2 },
      },
      routeDirectionId: 'rd-1',
    } as any);

    expect(result.researchData.windSpeedMs).toBe(30);
    expect((result.researchData as any).windSpeedMs_meta?.aggregation).toBe('max');

    if (prev !== undefined) process.env.DECISION_OS_WIND_AGG = prev;
    else delete process.env.DECISION_OS_WIND_AGG;
  });

  it('DECISION_OS_WIND_AGG=p90 时 windSpeedMs 应取 90 分位（向上取整索引）', async () => {
    const prev = process.env.DECISION_OS_WIND_AGG;
    process.env.DECISION_OS_WIND_AGG = 'p90';

    mockPrediction.collect.mockImplementation(async (_req: any, researchData: any) => {
      researchData.failure_risk_prediction = {
        predictions: [
          { day: 1, windSpeed: 10, riskLevel: 'LOW' },
          { day: 2, windSpeed: 12, riskLevel: 'LOW' },
          { day: 3, windSpeed: 20, riskLevel: 'MEDIUM' },
          { day: 4, windSpeed: 25, riskLevel: 'HIGH' },
          { day: 5, windSpeed: 30, riskLevel: 'HIGH' },
        ],
      };
    });
    mockWorldModel.collect.mockResolvedValue(undefined);

    const result = await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        party: { count: 2 },
      },
      routeDirectionId: 'rd-1',
    } as any);

    // values=[10,12,20,25,30], p90 -> idx=ceil(0.9*5)-1=4 -> 30
    expect(result.researchData.windSpeedMs).toBe(30);
    expect((result.researchData as any).windSpeedMs_meta?.aggregation).toBe('p90');
    expect((result.researchData as any).windSpeedMs_meta?.sampleCount).toBe(5);
    expect((result.researchData as any).windSpeedMs_meta?.quantileMethod).toBe('ceil-index');

    if (prev !== undefined) process.env.DECISION_OS_WIND_AGG = prev;
    else delete process.env.DECISION_OS_WIND_AGG;
  });

  it('当 windSpeedMs 来自 weather_forecast 时 windSpeedMs_meta 应带 evidence ids/sources', async () => {
    const prev = process.env.DECISION_OS_WIND_AGG;
    process.env.DECISION_OS_WIND_AGG = 'mean';

    mockPrediction.collect.mockResolvedValue(undefined);
    mockWorldModel.collect.mockImplementation(async (_req: any, researchData: any) => {
      researchData.weather_forecast = {
        forecasts: [{ wind: { speed_kmh: 36 } }, { wind: { speed_kmh: 18 } }],
        evidence: [
          { evidence_id: 'ev_weather_1', source: 'WeatherAgent.getForecast' },
          { evidence_id: 'ev_weather_2', source: 'WeatherAgent.getForecast' },
        ],
      };
    });

    const result = await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        party: { count: 2 },
      },
    } as any);

    expect(result.researchData.windSpeedMs).toBeDefined();
    expect((result.researchData as any).windSpeedMs_meta?.source).toBe('weather_forecast');
    expect((result.researchData as any).windSpeedMs_meta?.evidence?.ids).toEqual(['ev_weather_1', 'ev_weather_2']);
    expect((result.researchData as any).windSpeedMs_meta?.evidence?.sources).toEqual([
      'WeatherAgent.getForecast',
      'WeatherAgent.getForecast',
    ]);

    if (prev !== undefined) process.env.DECISION_OS_WIND_AGG = prev;
    else delete process.env.DECISION_OS_WIND_AGG;
  });

  it('应从 world.physical.prefetched_evidence 注入 environment_overrides_v1.solar 并覆盖 daylightByDate / twilightBufferMin', async () => {
    mockPrediction.collect.mockResolvedValue(undefined);
    mockWorldModel.collect.mockImplementation(async (_req: any, researchData: any) => {
      // baseline (auto-collected)
      researchData.daylightByDate = {
        '2026-06-01': { sunset: '2026-06-01T21:00:00.000Z' },
      };
      // admin overrides carried via world model evidence
      researchData.world = {
        physical: {
          prefetched_evidence: [
            {
              kind: 'environment_overrides_v1',
              overrides: {
                solar: {
                  twilightBufferMin: 55,
                  sunsetByDate: { '2026-06-01': '2026-06-01T20:10:00.000Z' },
                  civilDuskByDate: { '2026-06-01': '2026-06-01T20:40:00.000Z' },
                },
              },
            },
          ],
        },
      };
    });

    const result = await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-02' },
        party: { count: 2 },
      },
    } as any);

    // twilight buffer should be carried to env patch (for verify/repair/narrate constraints context)
    expect((result.environmentPatch as any).twilightBufferMin).toBe(55);
    // overrides should merge into daylightByDate, overriding sunset
    expect(result.environmentPatch.daylightByDate?.['2026-06-01']?.sunset).toBe('2026-06-01T20:10:00.000Z');
    expect(result.environmentPatch.daylightByDate?.['2026-06-01']?.civil_dusk).toBe('2026-06-01T20:40:00.000Z');
  });

  it('应基于 environment_overrides_v1.weather + solar 计算 weatherRisk', async () => {
    mockPrediction.collect.mockResolvedValue(undefined);
    mockWorldModel.collect.mockImplementation(async (_req: any, researchData: any) => {
      researchData.world = {
        physical: {
          prefetched_evidence: [
            {
              kind: 'environment_overrides_v1',
              at: '2026-06-01T18:00:00.000Z',
              overrides: {
                weather: {
                  forecastSeries: [
                    {
                      start: '2026-06-01T00:00:00.000Z',
                      end: '2026-06-01T12:00:00.000Z',
                      wind_mps: 5,
                      visibility_m: 4000,
                      precipitation_mm: 0,
                      snow_depth_cm: 0,
                    },
                    {
                      start: '2026-06-01T12:00:00.000Z',
                      end: '2026-06-02T00:00:00.000Z',
                      wind_mps: 20,
                      visibility_m: 600,
                      precipitation_mm: 12,
                      snow_depth_cm: 12,
                    },
                  ],
                },
                solar: {
                  twilightBufferMin: 30,
                  daylightByDate: {
                    '2026-06-01': {
                      sunset: '2026-06-01T20:00:00.000Z',
                    },
                  },
                },
              },
            },
          ],
        },
      };
    });

    const result = await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      tripPlanRequest: {
        destination: { lat: 64, lng: -21 },
        date_range: { start_date: '2026-06-01T18:00:00.000Z', end_date: '2026-06-02T10:00:00.000Z' },
        party: { count: 2 },
      },
    } as any);

    expect(typeof result.environmentPatch.weatherRisk).toBe('number');
    expect((result.environmentPatch.weatherRisk as number) > 0).toBe(true);
  });

  it('researchMode transport_only merges prior research and skips POI / world / prediction', async () => {
    const transportExecute = jest.fn().mockResolvedValue({
      evidence_id: 't_followup',
      options: [],
      origin: {},
      destination: {},
    });
    const poiExecute = jest.fn().mockResolvedValue({ pois: [{ name: 'new_only' }] });
    mockSkillsRegistry.getSkill.mockImplementation((name: string) => {
      if (name === 'transport.search') return { execute: transportExecute };
      if (name === 'poi.search') return { execute: poiExecute };
      return null;
    });
    const prior = {
      poi_evidence: [{ id: 'KEEP_POI' }],
      transport_evidence: { degraded: true },
    };
    const result = await service.execute({ requestId: 'r1' } as any, {
      requestId: 'r1',
      researchMode: 'transport_only',
      priorResearchData: prior,
      tripPlanRequest: {
        origin: '北京',
        destination: '雷克雅未克',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
      },
    } as any);
    expect(transportExecute).toHaveBeenCalled();
    expect(poiExecute).not.toHaveBeenCalled();
    expect(mockWorldModel.collect).not.toHaveBeenCalled();
    expect(mockPrediction.collect).not.toHaveBeenCalled();
    expect(result.researchData.poi_evidence).toEqual([{ id: 'KEEP_POI' }]);
    expect((result.researchData.transport_evidence as any).evidence_id).toBe('t_followup');
  });
});
