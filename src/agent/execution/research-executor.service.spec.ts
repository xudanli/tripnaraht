 /**
 * ResearchExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ResearchExecutorService } from './research-executor.service';
import { WorldModelCollectorService } from './shared/world-model-collector.service';
import { PredictionCollectorService } from './shared/prediction-collector.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';

describe('ResearchExecutorService', () => {
  let service: ResearchExecutorService;
  let mockWorldModel: { collect: jest.Mock };
  let mockPrediction: { collect: jest.Mock };
  let mockSkillsRegistry: { getSkill: jest.Mock };

  beforeEach(async () => {
    mockWorldModel = { collect: jest.fn().mockResolvedValue(undefined) };
    mockPrediction = { collect: jest.fn().mockResolvedValue(undefined) };
    mockSkillsRegistry = { getSkill: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchExecutorService,
        { provide: WorldModelCollectorService, useValue: mockWorldModel },
        { provide: PredictionCollectorService, useValue: mockPrediction },
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    service = module.get<ResearchExecutorService>(ResearchExecutorService);
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
        ResearchExecutorService,
        { provide: WorldModelCollectorService, useValue: mockWorldModel },
        { provide: PredictionCollectorService, useValue: mockPrediction },
      ],
    }).compile();
    const svc = module2.get<ResearchExecutorService>(ResearchExecutorService);
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
});
