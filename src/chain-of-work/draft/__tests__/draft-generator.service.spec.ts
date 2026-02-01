// src/chain-of-work/draft/__tests__/draft-generator.service.spec.ts

/**
 * DraftGeneratorService 单元测试
 * 
 * 测试步骤草案生成的核心逻辑（不依赖 LLM 调用）
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DraftGeneratorService } from '../draft-generator.service';
import { LlmService } from '../../../llm/services/llm.service';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { TripPlanRequest } from '../../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft } from '../../interfaces/chain-of-work.interface';

describe('DraftGeneratorService', () => {
  let service: DraftGeneratorService;
  let llmService: jest.Mocked<LlmService>;
  let skillsRegistry: jest.Mocked<SkillsRegistryService>;

  beforeEach(async () => {
    // Mock LlmService
    const mockLlmService = {
      callLlmWithSchema: jest.fn(),
    };

    // Mock SkillsRegistryService
    const mockSkillsRegistry = {
      getAllSkills: jest.fn().mockReturnValue([
        {
          metadata: {
            name: 'transport.search',
            description: '搜索交通路线',
          },
          execute: jest.fn(),
        },
        {
          metadata: {
            name: 'poi.search',
            description: '搜索 POI',
          },
          execute: jest.fn(),
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftGeneratorService,
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: SkillsRegistryService,
          useValue: mockSkillsRegistry,
        },
      ],
    }).compile();

    service = module.get<DraftGeneratorService>(DraftGeneratorService);
    llmService = module.get(LlmService);
    skillsRegistry = module.get(SkillsRegistryService);
  });

  describe('generateDraft', () => {
    it('应该生成包含 8 个步骤的模板化草案（当 LLM 调用失败时）', async () => {
      // 模拟 LLM 调用失败
      llmService.callLlmWithSchema.mockRejectedValue(new Error('API key not found'));

      const request: TripPlanRequest = {
        request_id: 'test-001',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      const draft = await service.generateDraft(request);

      expect(draft).toBeDefined();
      expect(draft.draft_id).toBe('draft-test-001');
      expect(draft.steps).toHaveLength(8);
      expect(draft.steps.map(s => s.step_type)).toEqual([
        'INTAKE',
        'RESEARCH',
        'GATE_EVAL',
        'PLAN_GEN',
        'VERIFY',
        'REPAIR',
        'NARRATE',
        'DONE',
      ]);
    });

    it('应该验证步骤顺序（GATE_EVAL 在 PLAN_GEN 之前）', async () => {
      llmService.callLlmWithSchema.mockRejectedValue(new Error('API key not found'));

      const request: TripPlanRequest = {
        request_id: 'test-002',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      const draft = await service.generateDraft(request);

      const gateEvalIndex = draft.steps.findIndex(s => s.step_type === 'GATE_EVAL');
      const planGenIndex = draft.steps.findIndex(s => s.step_type === 'PLAN_GEN');

      expect(gateEvalIndex).toBeGreaterThanOrEqual(0);
      expect(planGenIndex).toBeGreaterThanOrEqual(0);
      expect(gateEvalIndex).toBeLessThan(planGenIndex);
    });

    it('应该从 SkillsRegistry 获取可用 Skills', async () => {
      llmService.callLlmWithSchema.mockRejectedValue(new Error('API key not found'));

      const request: TripPlanRequest = {
        request_id: 'test-003',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      await service.generateDraft(request);

      expect(skillsRegistry.getAllSkills).toHaveBeenCalled();
    });
  });

  describe('parseDraft', () => {
    it('应该解析 LLM 响应并生成 WorkflowDraft', async () => {
      // 模拟 LLM 成功响应
      const mockLlmResponse = {
        steps: [
          {
            id: 'step-intake',
            step_type: 'INTAKE',
            title: '解析用户需求',
            description: '解析冰岛自驾行程需求',
            priority: 10,
          },
          {
            id: 'step-research',
            step_type: 'RESEARCH',
            title: '收集硬数据',
            description: '调用 Skills 获取交通、POI 数据',
            priority: 9,
          },
        ],
      };

      llmService.callLlmWithSchema.mockResolvedValue(JSON.stringify(mockLlmResponse));

      const request: TripPlanRequest = {
        request_id: 'test-004',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      const draft = await service.generateDraft(request);

      expect(draft).toBeDefined();
      expect(draft.steps.length).toBeGreaterThanOrEqual(2);
      expect(draft.steps[0].step_type).toBe('INTAKE');
      expect(draft.steps[1].step_type).toBe('RESEARCH');
    });
  });
});