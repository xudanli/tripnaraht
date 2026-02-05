// src/skills/context/context-learn.skill.spec.ts
/**
 * ContextLearnSkill 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ContextLearnSkill, ContextLearnInput } from './context-learn.skill';
import { ContextLearningService } from '../../agent/context-engine/services/context-learning.service';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';

describe('ContextLearnSkill', () => {
  let skill: ContextLearnSkill;
  let contextLearningService: jest.Mocked<ContextLearningService>;

  beforeEach(async () => {
    const mockContextLearningService = {
      learn: jest.fn(),
      getLearningResult: jest.fn(),
      getBlockLearningStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextLearnSkill,
        {
          provide: ContextLearningService,
          useValue: mockContextLearningService,
        },
      ],
    }).compile();

    skill = module.get<ContextLearnSkill>(ContextLearnSkill);
    contextLearningService = module.get(ContextLearningService);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('context.learn');
    expect(skill.metadata.category).toBe('rag');
    expect(skill.metadata.toolGroup).toBe('CONTEXT');
  });

  describe('execute', () => {
    it('应该调用 ContextLearningService.learn', async () => {
      const mockLearningResult = {
        learningResult: {
          updatedPriorities: {
            'COUNTRY_WEATHER': 85,
            'COUNTRY_VISA': 90,
          },
          recommendedBlocks: ['COUNTRY_WEATHER', 'COUNTRY_VISA'],
          confidence: 0.8,
          sampleSize: 10,
        },
      };

      contextLearningService.learn.mockResolvedValue(mockLearningResult as any);

      const input: ContextLearnInput = {
        userId: 'user-123',
        tripId: 'trip-123',
        eventType: 'context_built',
        eventData: {
          contextPackage: {
            id: 'ctx-123',
            tripId: 'trip-123',
            phase: 'PLANNING',
            agent: 'PlanningWorkbench',
            userQuery: '计划一次冰岛旅行',
            blocks: [
              {
                key: 'COUNTRY_WEATHER',
                type: 'COUNTRY_WEATHER',
                text: '天气信息',
                priority: 85,
                visibility: 'public',
                provenance: { source: 'pack', identifier: 'iceland', timestamp: new Date().toISOString() },
              },
            ],
            totalTokens: 1500,
            tokenBudget: 3600,
            compressed: false,
            createdAt: new Date().toISOString(),
          },
        },
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
        userQuery: '计划一次冰岛旅行',
      };

      const result = await skill.execute(input);

      expect(contextLearningService.learn).toHaveBeenCalled();
      expect(result.learningResult).toBeDefined();
      expect(result.learningResult.confidence).toBe(0.8);
      expect(result.learningResult.sampleSize).toBe(10);
    });

    it('应该处理context_used事件', async () => {
      const mockLearningResult = {
        learningResult: {
          confidence: 0.5,
          sampleSize: 5,
        },
      };

      contextLearningService.learn.mockResolvedValue(mockLearningResult as any);

      const input: ContextLearnInput = {
        userId: 'user-123',
        eventType: 'context_used',
        eventData: {
          usedBlocks: ['COUNTRY_WEATHER', 'COUNTRY_VISA'],
        },
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
      };

      const result = await skill.execute(input);

      expect(contextLearningService.learn).toHaveBeenCalled();
      const learnCall = contextLearningService.learn.mock.calls[0][0];
      expect(learnCall.eventType).toBe('context_used');
      expect(learnCall.eventData.usedBlocks).toEqual(['COUNTRY_WEATHER', 'COUNTRY_VISA']);
    });

    it('应该处理decision_made事件', async () => {
      const mockLearningResult = {
        learningResult: {
          confidence: 0.7,
          sampleSize: 8,
        },
      };

      contextLearningService.learn.mockResolvedValue(mockLearningResult as any);

      const input: ContextLearnInput = {
        userId: 'user-123',
        eventType: 'decision_made',
        eventData: {
          decisionResult: {
            accepted: true,
            satisfaction: 0.8,
          },
        },
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
      };

      const result = await skill.execute(input);

      expect(contextLearningService.learn).toHaveBeenCalled();
      const learnCall = contextLearningService.learn.mock.calls[0][0];
      expect(learnCall.eventType).toBe('decision_made');
      expect(learnCall.eventData.decisionResult?.accepted).toBe(true);
      expect(learnCall.eventData.decisionResult?.satisfaction).toBe(0.8);
    });

    it('应该处理user_feedback事件', async () => {
      const mockLearningResult = {
        learningResult: {
          confidence: 0.9,
          sampleSize: 12,
        },
      };

      contextLearningService.learn.mockResolvedValue(mockLearningResult as any);

      const input: ContextLearnInput = {
        userId: 'user-123',
        eventType: 'user_feedback',
        eventData: {
          feedback: {
            relevantBlocks: ['COUNTRY_WEATHER'],
            irrelevantBlocks: ['COUNTRY_CURRENCY'],
            missingBlocks: ['COUNTRY_VISA'],
          },
        },
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
      };

      const result = await skill.execute(input);

      expect(contextLearningService.learn).toHaveBeenCalled();
      const learnCall = contextLearningService.learn.mock.calls[0][0];
      expect(learnCall.eventType).toBe('user_feedback');
      expect(learnCall.eventData.feedback?.relevantBlocks).toEqual(['COUNTRY_WEATHER']);
      expect(learnCall.eventData.feedback?.irrelevantBlocks).toEqual(['COUNTRY_CURRENCY']);
      expect(learnCall.eventData.feedback?.missingBlocks).toEqual(['COUNTRY_VISA']);
    });

    it('应该在ContextLearningService未注入时抛出错误', async () => {
      const moduleWithoutService: TestingModule = await Test.createTestingModule({
        providers: [
          ContextLearnSkill,
        ],
      }).compile();

      const skillWithoutService = moduleWithoutService.get<ContextLearnSkill>(ContextLearnSkill);

      const input: ContextLearnInput = {
        userId: 'user-123',
        eventType: 'context_built',
        eventData: {
          contextPackage: {
            id: 'ctx-123',
            tripId: 'trip-123',
            phase: 'PLANNING',
            agent: 'PlanningWorkbench',
            userQuery: '测试查询',
            blocks: [],
            totalTokens: 1000,
            tokenBudget: 3600,
            compressed: false,
            createdAt: new Date().toISOString(),
          },
        },
      };

      await expect(skillWithoutService.execute(input)).rejects.toThrow('ContextLearningService 未注入');
    });

    it('应该处理学习失败的情况', async () => {
      contextLearningService.learn.mockRejectedValue(new Error('学习失败'));

      const input: ContextLearnInput = {
        userId: 'user-123',
        eventType: 'context_built',
        eventData: {
          contextPackage: {
            id: 'ctx-123',
            tripId: 'trip-123',
            phase: 'PLANNING',
            agent: 'PlanningWorkbench',
            userQuery: '测试查询',
            blocks: [],
            totalTokens: 1000,
            tokenBudget: 3600,
            compressed: false,
            createdAt: new Date().toISOString(),
          },
        },
      };

      await expect(skill.execute(input)).rejects.toThrow('学习失败');
    });
  });
});
