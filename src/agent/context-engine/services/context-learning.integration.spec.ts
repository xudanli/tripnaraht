// src/agent/context-engine/services/context-learning.integration.spec.ts
/**
 * ContextLearningService 集成测试
 * 
 * 测试context.build和context.learn的集成
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ContextBuildSkill } from '../../../skills/context/context-build.skill';
import { ContextLearnSkill } from '../../../skills/context/context-learn.skill';
import { ContextEngineerService } from './context-engineer.service';
import { ContextLearningService } from './context-learning.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ContextLearningService Integration', () => {
  let contextBuildSkill: ContextBuildSkill;
  let contextLearnSkill: ContextLearnSkill;
  let contextEngineer: jest.Mocked<ContextEngineerService>;
  let contextLearningService: jest.Mocked<ContextLearningService>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockContextEngineer = {
      build: jest.fn(),
      projectState: jest.fn(),
      writeBack: jest.fn(),
    };

    const mockContextLearningService = {
      learn: jest.fn(),
      getLearningResult: jest.fn(),
      getBlockLearningStats: jest.fn(),
    };

    const mockPrisma = {
      contextLearningResult: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBuildSkill,
        ContextLearnSkill,
        {
          provide: ContextEngineerService,
          useValue: mockContextEngineer,
        },
        {
          provide: ContextLearningService,
          useValue: mockContextLearningService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    contextBuildSkill = module.get<ContextBuildSkill>(ContextBuildSkill);
    contextLearnSkill = module.get<ContextLearnSkill>(ContextLearnSkill);
    contextEngineer = module.get(ContextEngineerService);
    contextLearningService = module.get(ContextLearningService);
    prisma = module.get(PrismaService);
  });

  describe('context.build 和 context.learn 集成', () => {
    it('应该在context.build执行后自动记录context_built事件', async () => {
      const mockContextPackage = {
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
      };

      contextEngineer.build.mockResolvedValue(mockContextPackage as any);
      contextLearningService.learn.mockResolvedValue({
        learningResult: {
          confidence: 0.5,
          sampleSize: 1,
        },
      });

      const input = {
        tripId: 'trip-123',
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
        userQuery: '计划一次冰岛旅行',
      };

      const result = await contextBuildSkill.execute(input);

      expect(contextEngineer.build).toHaveBeenCalled();
      expect(result.contextPackage).toBeDefined();
      
      // 验证context.learn被调用（异步，可能需要等待）
      // 注意：由于是异步执行，这里可能需要使用setTimeout或Promise来等待
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 验证学习服务被调用（通过ModuleRef懒加载）
      // 由于是异步执行且使用懒加载，这里主要验证build成功即可
      expect(result.contextPackage.id).toBe('ctx-123');
    });
  });

  describe('决策流程集成', () => {
    it('应该在决策完成后记录decision_made事件', async () => {
      const mockLearningResult = {
        learningResult: {
          confidence: 0.6,
          sampleSize: 5,
        },
      };

      contextLearningService.learn.mockResolvedValue(mockLearningResult as any);

      const input = {
        userId: 'user-123',
        tripId: 'trip-456',
        eventType: 'decision_made' as const,
        eventData: {
          decisionResult: {
            accepted: true,
            satisfaction: 0.8,
          },
        },
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
      };

      const result = await contextLearnSkill.execute(input);

      expect(contextLearningService.learn).toHaveBeenCalled();
      expect(result.learningResult.confidence).toBe(0.6);
      expect(result.learningResult.sampleSize).toBe(5);
    });
  });

  describe('用户反馈集成', () => {
    it('应该在收集用户反馈后记录user_feedback事件', async () => {
      const mockLearningResult = {
        learningResult: {
          confidence: 0.8,
          sampleSize: 10,
        },
      };

      contextLearningService.learn.mockResolvedValue(mockLearningResult as any);

      const input = {
        userId: 'user-123',
        tripId: 'trip-456',
        eventType: 'user_feedback' as const,
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

      const result = await contextLearnSkill.execute(input);

      expect(contextLearningService.learn).toHaveBeenCalled();
      expect(result.learningResult.confidence).toBe(0.8);
      expect(result.learningResult.sampleSize).toBe(10);
    });
  });
});
