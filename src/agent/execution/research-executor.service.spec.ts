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
});
