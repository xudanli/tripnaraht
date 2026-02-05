// src/agent/context-engine/services/context-learning.service.spec.ts
/**
 * ContextLearningService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ContextLearningService, ContextLearningInput } from './context-learning.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPackage } from '../types/context-package.types';

describe('ContextLearningService', () => {
  let service: ContextLearningService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
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
        ContextLearningService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ContextLearningService>(ContextLearningService);
    prisma = module.get(PrismaService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('learn - context_built事件', () => {
    it('应该从Context构建事件学习Block重要性', async () => {
      const mockContextPackage: ContextPackage = {
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

      prisma.contextLearningResult.findFirst.mockResolvedValue(null);
      prisma.contextLearningResult.create.mockResolvedValue({
        id: 'learning-1',
        userId: 'user-123',
        blockKey: 'COUNTRY_WEATHER',
        importanceScore: 0.85,
        confidence: 0.1,
        sampleSize: 1,
      } as any);
      prisma.contextLearningResult.findMany.mockResolvedValue([]);

      const input: ContextLearningInput = {
        userId: 'user-123',
        tripId: 'trip-123',
        eventType: 'context_built',
        eventData: {
          contextPackage: mockContextPackage,
        },
        phase: 'PLANNING',
        agent: 'PlanningWorkbench',
      };

      const result = await service.learn(input);

      expect(result.learningResult).toBeDefined();
      expect(prisma.contextLearningResult.findFirst).toHaveBeenCalled();
    });
  });

  describe('PrismaService未注入', () => {
    it('应该在PrismaService未注入时返回空结果', async () => {
      const moduleWithoutPrisma: TestingModule = await Test.createTestingModule({
        providers: [
          ContextLearningService,
        ],
      }).compile();

      const serviceWithoutPrisma = moduleWithoutPrisma.get<ContextLearningService>(ContextLearningService);

      const input: ContextLearningInput = {
        userId: 'user-123',
        eventType: 'context_built',
        eventData: {
          contextPackage: {
            id: 'ctx-123',
            tripId: 'trip-123',
            phase: 'PLANNING',
            agent: 'PlanningWorkbench',
            userQuery: '测试',
            blocks: [],
            totalTokens: 1000,
            tokenBudget: 3600,
            compressed: false,
            createdAt: new Date().toISOString(),
          },
        },
      };

      const result = await serviceWithoutPrisma.learn(input);

      expect(result.learningResult.confidence).toBe(0);
      expect(result.learningResult.sampleSize).toBe(0);
    });
  });
});
