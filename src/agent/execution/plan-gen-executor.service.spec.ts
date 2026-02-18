/**
 * PlanGenExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlanGenExecutorService } from './plan-gen-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';

describe('PlanGenExecutorService', () => {
  let service: PlanGenExecutorService;
  let mockSkillsRegistry: { getSkill: jest.Mock };

  beforeEach(async () => {
    mockSkillsRegistry = {
      getSkill: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanGenExecutorService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    service = module.get<PlanGenExecutorService>(PlanGenExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 skillsRegistry 应返回空行程', async () => {
    const module2 = await Test.createTestingModule({
      providers: [PlanGenExecutorService],
    }).compile();
    const svc = module2.get<PlanGenExecutorService>(PlanGenExecutorService);
    const result = await svc.execute({} as any, { requestId: 'r1', tripPlanRequest: {} });
    expect(result.itinerary).toEqual({ request_id: 'r1', days: [] });
    expect(result.planDraft).toEqual({ request_id: 'r1', days: [] });
  });

  it('无 tripPlanRequest 应返回空行程', async () => {
    const result = await service.execute({} as any, { requestId: 'r1' });
    expect(result.itinerary.days).toEqual([]);
  });

  it('skill 返回有效行程应正确映射', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        request_id: 'r1',
        days: [{ date: '2026-06-01', items: [] }],
        metadata: { total_days: 1 },
      }),
    });
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
      },
    );
    expect(result.itinerary.request_id).toBe('r1');
    expect(result.itinerary.days).toHaveLength(1);
    expect(result.itinerary.days[0].date).toBe('2026-06-01');
  });

  it('skill 抛出异常应返回空行程', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockRejectedValue(new Error('generate failed')),
    });
    const result = await service.execute(
      {} as any,
      { requestId: 'r1', tripPlanRequest: { destination: 'X' } },
    );
    expect(result.itinerary.days).toEqual([]);
  });
});
