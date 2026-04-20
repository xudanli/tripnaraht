/**
 * RepairExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RepairExecutorService } from './repair-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ClaudeLocalInsightAgentService } from '../services/sub-agents/local-insight-agent.service';

describe('RepairExecutorService', () => {
  let service: RepairExecutorService;
  let mockSkillsRegistry: { getSkill: jest.Mock };
  let mockLocalInsight: { suggestAlternatives: jest.Mock };

  beforeEach(async () => {
    mockSkillsRegistry = { getSkill: jest.fn() };
    mockLocalInsight = { suggestAlternatives: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepairExecutorService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
        { provide: ClaudeLocalInsightAgentService, useValue: mockLocalInsight },
      ],
    }).compile();
    service = module.get<RepairExecutorService>(RepairExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 tripPlanRequest 或 gateResult 应返回 repairApplied=false', async () => {
    const r1 = await service.execute({} as any, { requestId: 'r1' });
    expect(r1.repairApplied).toBe(false);

    const r2 = await service.execute({} as any, { requestId: 'r1', tripPlanRequest: {} });
    expect(r2.repairApplied).toBe(false);
  });

  it('有 gateResult 但无 required_adjustments 应跳过 repair.apply', async () => {
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
        itinerary: { request_id: 'r1', days: [] },
      },
    );
    expect(result.repairApplied).toBe(false);
    expect(mockSkillsRegistry.getSkill).not.toHaveBeenCalled();
  });

  it('repair.apply 返回 repaired 时应更新 itinerary', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        repaired: true,
        itinerary: { request_id: 'r1', days: [{ date: '2026-06-01', items: [] }] },
      }),
    });
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [],
          required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'test' }],
          confidence: 0.8,
        },
        itinerary: { request_id: 'r1', days: [] },
      },
    );
    expect(result.repairApplied).toBe(true);
    expect(result.itinerary?.days).toHaveLength(1);
  });

  it('当 required_adjustments 含 REDUCE_SCOPE_OR_ADD_EVIDENCE 时应跳过 LocalInsightAgent', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        repaired: false,
      }),
    });

    await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [],
          required_adjustments: [{ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: 'low budget' }],
          confidence: 0.8,
        },
        itinerary: { request_id: 'r1', days: [] },
      },
    );

    expect(mockLocalInsight.suggestAlternatives).not.toHaveBeenCalled();
  });
});
