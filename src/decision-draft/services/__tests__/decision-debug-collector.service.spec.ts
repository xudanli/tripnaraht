// src/decision-draft/services/__tests__/decision-debug-collector.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { DecisionDebugCollectorService } from '../decision-debug-collector.service';
import { DecisionDraft } from '../../interfaces/decision-draft.interface';
import { ChainOfWorkTrace } from '../../../chain-of-work/interfaces/chain-of-work.interface';

describe('DecisionDebugCollectorService', () => {
  let service: DecisionDebugCollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DecisionDebugCollectorService],
    }).compile();

    service = module.get<DecisionDebugCollectorService>(
      DecisionDebugCollectorService,
    );
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('collectDebugInfo', () => {
    it('应该收集调试信息', async () => {
      const decisionDraft: DecisionDraft = {
        draft_id: 'test-draft',
        workflow_id: 'test-workflow',
        version: 'v1.0',
        decision_steps: [],
        user_mode: 'studio',
        metadata: {
          decision_count: 0,
          step_count: 0,
          created_by: 'test',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      const executionTrace: ChainOfWorkTrace = {
        draft_id: 'test-draft',
        workflow_id: 'test-workflow',
        version: 'v1.0',
        steps: [
          {
            step_id: 'step-1',
            step_type: 'RESEARCH',
            status: 'completed',
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: 1000,
            skills_called: ['skill-1', 'skill-2'],
            cost_est_usd: 0.01,
          },
        ],
        total_duration_ms: 1000,
        total_cost_est_usd: 0.01,
        success: true,
      };

      const debugInfo = await service.collectDebugInfo(decisionDraft, executionTrace);

      expect(debugInfo).toBeDefined();
      expect(debugInfo.llm_calls).toBeDefined();
      expect(debugInfo.skill_calls).toBeDefined();
      expect(debugInfo.performance_metrics).toBeDefined();
    });
  });

  describe('collectSkillCalls', () => {
    it('应该收集 Skill 调用信息', async () => {
      const executionTrace: ChainOfWorkTrace = {
        draft_id: 'test-draft',
        workflow_id: 'test-workflow',
        version: 'v1.0',
        steps: [
          {
            step_id: 'step-1',
            step_type: 'RESEARCH',
            status: 'completed',
            start_time: new Date().toISOString(),
            duration_ms: 500,
            skills_called: ['skill-1'],
          },
          {
            step_id: 'step-2',
            step_type: 'RESEARCH',
            status: 'completed',
            start_time: new Date().toISOString(),
            duration_ms: 300,
            skills_called: ['skill-1', 'skill-2'],
          },
        ],
        total_duration_ms: 800,
        total_cost_est_usd: 0,
        success: true,
      };

      const skillCalls = await service.collectSkillCalls(executionTrace);

      expect(skillCalls).toHaveLength(2);
      expect(skillCalls.find((c) => c.skill_name === 'skill-1')?.call_count).toBe(2);
      expect(skillCalls.find((c) => c.skill_name === 'skill-2')?.call_count).toBe(1);
    });
  });

  describe('calculatePerformanceMetrics', () => {
    it('应该计算性能指标', async () => {
      const executionTrace: ChainOfWorkTrace = {
        draft_id: 'test-draft',
        workflow_id: 'test-workflow',
        version: 'v1.0',
        steps: [
          {
            step_id: 'step-1',
            step_type: 'RESEARCH',
            status: 'completed',
            start_time: new Date().toISOString(),
            duration_ms: 500,
            cost_est_usd: 0.01,
          },
          {
            step_id: 'step-2',
            step_type: 'PLAN_GEN',
            status: 'completed',
            start_time: new Date().toISOString(),
            duration_ms: 300,
            cost_est_usd: 0.02,
          },
        ],
        total_duration_ms: 800,
        total_cost_est_usd: 0.03,
        success: true,
      };

      const metrics = await service.calculatePerformanceMetrics(executionTrace);

      expect(metrics.generation_time_ms).toBe(800);
      expect(metrics.success_rate).toBe(1);
      expect(metrics.total_cost_usd).toBe(0.03);
    });
  });
});
