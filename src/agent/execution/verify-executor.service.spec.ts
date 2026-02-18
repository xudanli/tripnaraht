/**
 * VerifyExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { VerifyExecutorService } from './verify-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';

describe('VerifyExecutorService', () => {
  let service: VerifyExecutorService;
  let mockSkillsRegistry: { getSkill: jest.Mock };

  beforeEach(async () => {
    mockSkillsRegistry = {
      getSkill: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyExecutorService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    service = module.get<VerifyExecutorService>(VerifyExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 skillsRegistry 应返回空 issues', async () => {
    const module2 = await Test.createTestingModule({
      providers: [VerifyExecutorService],
    }).compile();
    const svc = module2.get<VerifyExecutorService>(VerifyExecutorService);
    const result = await svc.execute({} as any, { requestId: 'r1', itinerary: { request_id: 'r1', days: [] } });
    expect(result.issues).toEqual([]);
    expect(result.confidenceDelta).toBe(0);
  });

  it('无 itinerary 应返回空 issues', async () => {
    const result = await service.execute({} as any, { requestId: 'r1' });
    expect(result.issues).toEqual([]);
  });

  it('skill 返回 issues 应正确聚合', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ issues: ['问题1', '问题2'] }),
    });
    const result = await service.execute(
      {} as any,
      { requestId: 'r1', itinerary: { request_id: 'r1', days: [] }, researchData: {} },
    );
    expect(result.issues).toEqual(['问题1', '问题2']);
    expect(result.confidenceDelta).toBe(-0.2);
  });

  it('skill 抛出异常应捕获并返回', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockRejectedValue(new Error('verify failed')),
    });
    const result = await service.execute(
      {} as any,
      { requestId: 'r1', itinerary: { request_id: 'r1', days: [] } },
    );
    expect(result.issues).toContain('verify failed');
    expect(result.confidenceDelta).toBe(-0.2);
  });
});
