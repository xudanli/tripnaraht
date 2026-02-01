// src/chain-of-work/mapping/sub-agent/__tests__/sub-agent-mapping.service.spec.ts

/**
 * SubAgentMappingService 单元测试
 * 
 * 测试 Sub-Agents 映射的核心逻辑
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SubAgentMappingService } from '../sub-agent-mapping.service';
import { TripNARAStepDraft } from '../../../interfaces/chain-of-work.interface';

describe('SubAgentMappingService', () => {
  let service: SubAgentMappingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubAgentMappingService],
    }).compile();

    service = module.get<SubAgentMappingService>(SubAgentMappingService);
  });

  describe('mapStepToSubAgent', () => {
    it('应该将 GATE_EVAL 步骤映射到 Gatekeeper', async () => {
      const step: TripNARAStepDraft = {
        id: 'step-gate-eval',
        step_type: 'GATE_EVAL',
        title: '执行 Should-Exist Gate 决策',
        description: '判断路线是否应该存在',
        status: 'draft',
        priority: 10,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mapping = await service.mapStepToSubAgent(step);

      expect(mapping).toBeDefined();
      expect(mapping.sub_agent).toBe('Gatekeeper');
      expect(mapping.guardian).toBe('ABU');
    });

    it('应该将 VERIFY 步骤映射到 CoreDecision', async () => {
      const step: TripNARAStepDraft = {
        id: 'step-verify',
        step_type: 'VERIFY',
        title: '验证行程可执行性',
        description: '验证开放时间冲突、换乘 buffer、可达性',
        status: 'draft',
        priority: 7,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mapping = await service.mapStepToSubAgent(step);

      expect(mapping).toBeDefined();
      expect(mapping.sub_agent).toBe('CoreDecision');
      expect(mapping.guardian).toBe('DR_DRE');
    });

    it('应该将 REPAIR 步骤映射到 LocalInsight', async () => {
      const step: TripNARAStepDraft = {
        id: 'step-repair',
        step_type: 'REPAIR',
        title: '修复不可执行问题',
        description: '替换POI、改路线、加buffer、换交通',
        status: 'draft',
        priority: 6,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mapping = await service.mapStepToSubAgent(step);

      expect(mapping).toBeDefined();
      expect(mapping.sub_agent).toBe('LocalInsight');
      expect(mapping.guardian).toBe('NEPTUNE');
    });

    it('应该将 INTAKE 步骤映射到 Planner', async () => {
      const step: TripNARAStepDraft = {
        id: 'step-intake',
        step_type: 'INTAKE',
        title: '解析用户需求',
        description: '解析用户旅行需求，识别信息缺口',
        status: 'draft',
        priority: 10,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mapping = await service.mapStepToSubAgent(step);

      expect(mapping).toBeDefined();
      expect(mapping.sub_agent).toBe('Planner');
      expect(mapping.guardian).toBeNull();
    });
  });
});