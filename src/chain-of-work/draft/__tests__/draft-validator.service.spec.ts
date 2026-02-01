// src/chain-of-work/draft/__tests__/draft-validator.service.spec.ts

/**
 * DraftValidatorService 单元测试
 * 
 * 测试步骤草案验证的核心逻辑
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DraftValidatorService } from '../draft-validator.service';
import { TripNARAWorkflowDraft } from '../../interfaces/chain-of-work.interface';
import { TripPlanRequest } from '../../../agent/interfaces/trip-plan.interface';

describe('DraftValidatorService', () => {
  let service: DraftValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DraftValidatorService],
    }).compile();

    service = module.get<DraftValidatorService>(DraftValidatorService);
  });

  describe('validateDraft', () => {
    it('应该验证包含所有必需步骤的草案', async () => {
      const request: TripPlanRequest = {
        request_id: 'test-001',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      const draft: TripNARAWorkflowDraft = {
        draft_id: 'draft-test-001',
        workflow_id: 'test-001',
        version: 'v1.0',
        steps: [
          {
            id: 'step-intake',
            step_type: 'INTAKE',
            title: '解析用户需求',
            description: '解析用户旅行需求',
            status: 'draft',
            priority: 10,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-research',
            step_type: 'RESEARCH',
            title: '收集硬数据',
            description: '调用 Skills 获取数据',
            status: 'draft',
            priority: 9,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-gate-eval',
            step_type: 'GATE_EVAL',
            title: '执行 Should-Exist Gate 决策',
            description: '判断路线是否应该存在',
            status: 'draft',
            priority: 10,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-plan-gen',
            step_type: 'PLAN_GEN',
            title: '生成结构化行程草案',
            description: '生成包含时间窗、地点、可达性证据的行程草案',
            status: 'draft',
            priority: 8,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-verify',
            step_type: 'VERIFY',
            title: '验证行程可执行性',
            description: '验证开放时间冲突、换乘 buffer、可达性',
            status: 'draft',
            priority: 7,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-repair',
            step_type: 'REPAIR',
            title: '修复不可执行问题',
            description: '替换POI、改路线、加buffer、换交通',
            status: 'draft',
            priority: 6,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-narrate',
            step_type: 'NARRATE',
            title: '生成用户可读解释',
            description: '产出用户可读解释',
            status: 'draft',
            priority: 5,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-done',
            step_type: 'DONE',
            title: '完成',
            description: '规划完成',
            status: 'draft',
            priority: 1,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        orchestration_mode: 'CLAUDE_SM',
        trip_plan_request: request,
        metadata: {
          step_count: 8,
          skills_count: 0,
          sub_agents_count: 0,
          last_modified: new Date().toISOString(),
          created_by: 'system',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await service.validateDraft(draft);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少的步骤', async () => {
      const request: TripPlanRequest = {
        request_id: 'test-002',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      const draft: TripNARAWorkflowDraft = {
        draft_id: 'draft-test-002',
        workflow_id: 'test-002',
        version: 'v1.0',
        steps: [
          {
            id: 'step-intake',
            step_type: 'INTAKE',
            title: '解析用户需求',
            description: '解析用户旅行需求',
            status: 'draft',
            priority: 10,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          // 缺少其他步骤
        ],
        orchestration_mode: 'CLAUDE_SM',
        trip_plan_request: request,
        metadata: {
          step_count: 1,
          skills_count: 0,
          sub_agents_count: 0,
          last_modified: new Date().toISOString(),
          created_by: 'system',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await service.validateDraft(draft);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.error_type === 'MISSING_SKILL')).toBe(true);
    });

    it('应该检测步骤顺序错误（GATE_EVAL 在 PLAN_GEN 之后）', async () => {
      const request: TripPlanRequest = {
        request_id: 'test-003',
        origin: 'Reykjavik',
        destination: 'Akureyri',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
      };

      const draft: TripNARAWorkflowDraft = {
        draft_id: 'draft-test-003',
        workflow_id: 'test-003',
        version: 'v1.0',
        steps: [
          {
            id: 'step-intake',
            step_type: 'INTAKE',
            title: '解析用户需求',
            description: '解析用户旅行需求',
            status: 'draft',
            priority: 10,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-research',
            step_type: 'RESEARCH',
            title: '收集硬数据',
            description: '调用 Skills 获取数据',
            status: 'draft',
            priority: 9,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-plan-gen',
            step_type: 'PLAN_GEN',
            title: '生成结构化行程草案',
            description: '生成包含时间窗、地点、可达性证据的行程草案',
            status: 'draft',
            priority: 8,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'step-gate-eval',
            step_type: 'GATE_EVAL',
            title: '执行 Should-Exist Gate 决策',
            description: '判断路线是否应该存在',
            status: 'draft',
            priority: 10,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          // ... 其他步骤
        ],
        orchestration_mode: 'CLAUDE_SM',
        trip_plan_request: request,
        metadata: {
          step_count: 4,
          skills_count: 0,
          sub_agents_count: 0,
          last_modified: new Date().toISOString(),
          created_by: 'system',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await service.validateDraft(draft);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.error_type === 'ORDER_VIOLATION')).toBe(true);
    });
  });
});