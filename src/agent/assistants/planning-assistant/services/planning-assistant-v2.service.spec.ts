// src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanningAssistantV2Service } from './planning-assistant-v2.service';
import { PlanningAssistantService } from './planning-assistant.service';
import { RailDirectService } from '../../../../mcp/rail-direct.service';
import { TransitousDirectService } from '../../../../mcp/transitous-direct.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';
import { PreferenceLearningService } from '../../shared/services/preference-learning.service';
import { PersonaLanguageService } from '../../shared/services/persona-language.service';
import { LlmService } from '../../../../llm/services/llm.service';
import { SmartRouterService } from './smart-router.service';
import { TaskService } from '../../../infra/task.service';
import { CacheService } from '../../../../common/cache/cache.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SessionNotFoundException, SessionExpiredException, DestinationRequiredException } from '../exceptions/planning-assistant.exceptions';
import { CreateSessionRequestDto } from '../dto/v2/create-session-request.dto';
import { GeneratePlanRequestDto } from '../dto/v2/generate-plan-request.dto';
import { ComparePlansRequestDto } from '../dto/v2/compare-plans-request.dto';
import { ConfirmPlanRequestDto } from '../dto/v2/confirm-plan-request.dto';
import { PlanningConversationState, PlanCandidate } from '../interfaces/planning-assistant.interface';

describe('PlanningAssistantV2Service', () => {
  let service: PlanningAssistantV2Service;
  let planningAssistantService: jest.Mocked<PlanningAssistantService>;
  let coreGateway: jest.Mocked<CoreGatewayService>;
  let recommendationEngine: jest.Mocked<RecommendationEngineService>;
  let smartRouter: jest.Mocked<SmartRouterService>;
  let taskService: jest.Mocked<TaskService>;
  let cacheService: jest.Mocked<CacheService>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPlanningAssistantService = {
      createSession: jest.fn(),
      getSessionState: jest.fn(),
      saveSession: jest.fn(),
      deleteSession: jest.fn(),
      chat: jest.fn(),
    };

    const mockCoreGateway = {
      execute: jest.fn(),
      generatePlan: jest.fn(),
      applyChangeIntent: jest.fn(),
      getTripStatus: jest.fn(),
    };

    const mockRecommendationEngine = {
      getRecommendations: jest.fn(),
    };

    const mockSmartRouter = {
      route: jest.fn(),
      routeWithTools: jest.fn(),
      extractParams: jest.fn(),
    };

    const mockTaskService = {
      createTask: jest.fn().mockResolvedValue({ id: 'task123' }),
      getTaskStatus: jest.fn(),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      updateProgress: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };

    const mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    };

    const mockPrisma = {
      trip: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tripCollaborator: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockPreferenceLearning = {
      learnFromAction: jest.fn().mockResolvedValue(undefined),
    };

    const mockPersonaLanguage = {
      // Add methods as needed
    };

    const mockLlmService = {
      // Add methods as needed
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningAssistantV2Service,
        {
          provide: PlanningAssistantService,
          useValue: mockPlanningAssistantService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CoreGatewayService,
          useValue: mockCoreGateway,
        },
        {
          provide: RecommendationEngineService,
          useValue: mockRecommendationEngine,
        },
        {
          provide: PreferenceLearningService,
          useValue: mockPreferenceLearning,
        },
        {
          provide: PersonaLanguageService,
          useValue: mockPersonaLanguage,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: SmartRouterService,
          useValue: mockSmartRouter,
        },
        {
          provide: TaskService,
          useValue: mockTaskService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PlanningAssistantV2Service>(PlanningAssistantV2Service);
    planningAssistantService = module.get(PlanningAssistantService);
    coreGateway = module.get(CoreGatewayService);
    recommendationEngine = module.get(RecommendationEngineService);
    smartRouter = module.get(SmartRouterService);
    taskService = module.get(TaskService);
    cacheService = module.get(CacheService);
    prisma = module.get(PrismaService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('RouteAndRun context bridge (buildRouteAndRunRequestForPaGenerate)', () => {
    const sessionId = 'mock-session-uuid';
    const baseState = (): PlanningConversationState => ({
      sessionId,
      userId: 'user-123',
      phase: 'PLANNING',
      preferences: {},
      messageHistory: [
        { id: 'm1', role: 'user', content: '我想去新疆', timestamp: '2026-01-01T00:00:00.000Z' },
        {
          id: 'm2',
          role: 'assistant',
          content: '新疆适合自驾，打算去南疆还是北疆？',
          timestamp: '2026-01-01T00:01:00.000Z',
        },
        { id: 'm3', role: 'user', content: '北疆吧，看风景', timestamp: '2026-01-01T00:02:00.000Z' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:02:00.000Z',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const baseDto = (): GeneratePlanRequestDto => ({
      sessionId,
      userId: 'user-123',
      destination: '新疆',
    });

    it('should populate conversation_context.recent_messages from session messageHistory', async () => {
      planningAssistantService.getSessionState.mockResolvedValue(baseState());

      const requestBody = await (service as any).buildRouteAndRunRequestForPaGenerate(
        baseDto(),
        '看风景',
        'trip-789',
        { locale: 'zh-CN', async_mode: 'FORCE' },
      );

      expect(requestBody.message).toBe('看风景');
      expect(requestBody.trip_id).toBe('trip-789');
      expect(requestBody.conversation_context).toBeDefined();
      expect(requestBody.conversation_context.locale).toBe('zh-CN');
      expect(requestBody.conversation_context.context_type).toBe('active_trip_summary');
      expect(requestBody.conversation_context.recent_messages).toEqual([
        '用户: 我想去新疆',
        '助手: 新疆适合自驾，打算去南疆还是北疆？',
        '用户: 北疆吧，看风景',
      ]);
      expect(planningAssistantService.getSessionState).toHaveBeenCalledWith(sessionId);
    });

    it('should exclude trailing user line when it duplicates the current message', async () => {
      const state = baseState();
      state.messageHistory.push({
        id: 'm4',
        role: 'user',
        content: '看风景',
        timestamp: '2026-01-01T00:03:00.000Z',
      });
      planningAssistantService.getSessionState.mockResolvedValue(state);

      const requestBody = await (service as any).buildRouteAndRunRequestForPaGenerate(
        baseDto(),
        '看风景',
        'trip-789',
      );

      expect(requestBody.conversation_context.recent_messages).toEqual([
        '用户: 我想去新疆',
        '助手: 新疆适合自驾，打算去南疆还是北疆？',
        '用户: 北疆吧，看风景',
      ]);
      expect(requestBody.conversation_context.recent_messages).not.toContain('用户: 看风景');
    });

    it('should omit recent_messages when there is no session history', async () => {
      planningAssistantService.getSessionState.mockResolvedValue(null);

      const requestBody = await (service as any).buildRouteAndRunRequestForPaGenerate(
        { ...baseDto(), sessionId: undefined },
        '帮我规划冰岛',
        undefined,
      );

      expect(requestBody.conversation_context?.recent_messages).toBeUndefined();
    });
  });

  describe('createSession', () => {
    it('应该成功创建会话', async () => {
      const dto: CreateSessionRequestDto = {
        userId: 'user123',
      };

      planningAssistantService.createSession.mockResolvedValue('session123');

      const result = await service.createSession(dto);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('session123');
      expect(result.userId).toBe('user123');
      expect(planningAssistantService.createSession).toHaveBeenCalledWith('user123');
    });

    it('应该处理创建会话失败', async () => {
      const dto: CreateSessionRequestDto = {
        userId: 'user123',
      };

      planningAssistantService.createSession.mockRejectedValue(new Error('创建失败'));

      await expect(service.createSession(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSessionState', () => {
    it('应该从缓存获取会话状态', async () => {
      const sessionId = 'session123';
      const cachedState = {
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      cacheService.get.mockResolvedValue(cachedState);

      const result = await service.getSessionState(sessionId);

      expect(result).toEqual(cachedState);
      expect(cacheService.get).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('应该从服务获取会话状态', async () => {
      const sessionId = 'session123';
      const state: PlanningConversationState = {
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      cacheService.get.mockResolvedValue(null);
      planningAssistantService.getSessionState.mockResolvedValue(state);

      const result = await service.getSessionState(sessionId);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe(sessionId);
      expect(planningAssistantService.getSessionState).toHaveBeenCalledWith(sessionId);
    });

    it('应该抛出会话不存在异常', async () => {
      const sessionId = 'session123';

      cacheService.get.mockResolvedValue(null);
      planningAssistantService.getSessionState.mockResolvedValue(null);

      await expect(service.getSessionState(sessionId)).rejects.toThrow(SessionNotFoundException);
    });

    it('应该抛出会话过期异常', async () => {
      const sessionId = 'session123';
      const expiredState: PlanningConversationState = {
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      };

      cacheService.get.mockResolvedValue(null);
      planningAssistantService.getSessionState.mockResolvedValue(expiredState);

      await expect(service.getSessionState(sessionId)).rejects.toThrow(SessionExpiredException);
    });
  });

  describe('generatePlan', () => {
    it('应该验证目的地必填', async () => {
      const dto: GeneratePlanRequestDto = {};

      await expect(service.generatePlan(dto)).rejects.toThrow(DestinationRequiredException);
    });

    it('应该从自然语言描述提取参数', async () => {
      const dto: GeneratePlanRequestDto = {
        naturalLanguageDescription: '我想去日本旅行7天',
        sessionId: 'session123',
      };

      smartRouter.extractParams.mockResolvedValue({
        destination: 'Japan',
        preferences: {
          budget: { total: 10000, currency: 'CNY' },
        },
      });

      coreGateway.generatePlan.mockResolvedValue({
        success: true,
        data: {
          planState: {},
          uiOutput: {
            skeletonOptions: {
              options: [],
            },
          },
        },
        meta: { traceId: 'trace123' },
      });

      // Mock session state
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 'session123',
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      await service.generatePlan(dto);

      expect(smartRouter.extractParams).toHaveBeenCalledWith(
        '我想去日本旅行7天',
        'generate'
      );
    });

    it('应该调用CoreGateway生成方案', async () => {
      const dto: GeneratePlanRequestDto = {
        destination: 'Japan',
        sessionId: 'session123',
      };

      coreGateway.generatePlan.mockResolvedValue({
        success: true,
        data: {
          planState: {},
          uiOutput: {
            skeletonOptions: {
              options: [],
            },
          },
        },
        meta: { traceId: 'trace123' },
      });

      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 'session123',
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.generatePlan(dto);

      expect(result).toBeDefined();
      expect(coreGateway.generatePlan).toHaveBeenCalled();
    });

    it('应该在CoreGateway不可用时抛出异常', async () => {
      const dto: GeneratePlanRequestDto = {
        destination: 'Japan',
      };

      // 创建一个没有coreGateway的service实例
      const moduleWithoutGateway = await Test.createTestingModule({
        providers: [
          PlanningAssistantV2Service,
          {
            provide: PlanningAssistantService,
            useValue: planningAssistantService,
          },
        ],
      }).compile();

      const serviceWithoutGateway = moduleWithoutGateway.get<PlanningAssistantV2Service>(
        PlanningAssistantV2Service
      );

      await expect(serviceWithoutGateway.generatePlan(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('comparePlans', () => {
    it('应该验证至少需要2个方案', async () => {
      const dto: ComparePlansRequestDto = {
        planIds: ['plan1'],
      };

      await expect(service.comparePlans(dto)).rejects.toThrow(BadRequestException);
    });

    it('应该从会话状态获取方案进行对比', async () => {
      const dto: ComparePlansRequestDto = {
        planIds: ['plan1', 'plan2'],
        sessionId: 'session123',
      };

      const state: PlanningConversationState = {
        sessionId: 'session123',
        userId: 'user123',
        phase: 'COMPARING',
        preferences: {},
        planCandidates: [
          {
            id: 'plan1',
            name: 'Plan 1',
            nameCN: '方案1',
            description: 'Description 1',
            descriptionCN: '描述1',
            destination: 'Japan',
            duration: 7,
            highlights: [],
            estimatedBudget: {
              total: 10000,
              breakdown: {
                flight: 3000,
                accommodation: 4000,
                activities: 2000,
                food: 1000,
                other: 0,
              },
            },
            pace: 'moderate',
            suitability: { score: 90, reasons: [] },
          },
          {
            id: 'plan2',
            name: 'Plan 2',
            nameCN: '方案2',
            description: 'Description 2',
            descriptionCN: '描述2',
            destination: 'Japan',
            duration: 7,
            highlights: [],
            estimatedBudget: {
              total: 12000,
              breakdown: {
                flight: 3500,
                accommodation: 5000,
                activities: 2500,
                food: 1000,
                other: 0,
              },
            },
            pace: 'intensive',
            suitability: { score: 85, reasons: [] },
          },
        ],
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      planningAssistantService.getSessionState.mockResolvedValue(state);

      // comparePlans 方法会从 session state 中获取方案，然后进行对比
      // 不需要 mock coreGateway.execute，因为已经有足够的方案了
      coreGateway.execute.mockResolvedValue({
        success: true,
        data: {},
        meta: { traceId: 'trace123' },
      });

      const result = await service.comparePlans(dto);

      expect(result).toBeDefined();
      expect(result.plans).toBeDefined();
      expect(result.plans.length).toBe(2);
      expect(result.dimensions).toBeDefined();
      expect(result.differences).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('confirmPlan', () => {
    it('应该验证方案ID必填', async () => {
      const dto: ConfirmPlanRequestDto = {
        sessionId: 'session123',
      };

      await expect(service.confirmPlan(dto)).rejects.toThrow(BadRequestException);
    });

    it('应该创建行程记录', async () => {
      const dto: ConfirmPlanRequestDto = {
        planId: 'plan1',
        sessionId: 'session123',
        userId: 'user123',
      };

      const state: PlanningConversationState = {
        sessionId: 'session123',
        userId: 'user123',
        phase: 'COMPARING',
        preferences: {},
        planCandidates: [
          {
            id: 'plan1',
            name: 'Plan 1',
            nameCN: '方案1',
            description: 'Description 1',
            descriptionCN: '描述1',
            destination: 'Japan',
            duration: 7,
            highlights: [],
            estimatedBudget: {
              total: 10000,
              breakdown: {
                flight: 3000,
                accommodation: 4000,
                activities: 2000,
                food: 1000,
                other: 0,
              },
            },
            pace: 'moderate',
            suitability: { score: 90, reasons: [] },
          },
        ],
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      planningAssistantService.getSessionState.mockResolvedValue(state);
      
      // Mock 事务：返回创建的 trip
      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          trip: {
            create: jest.fn().mockResolvedValue({
              id: 'trip123',
              name: 'Trip to Japan',
              destination: 'Japan',
              startDate: new Date(),
              endDate: new Date(),
              budgetConfig: {},
              pacingConfig: {},
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          tripCollaborator: {
            create: jest.fn().mockResolvedValue({
              id: 'collab123',
              tripId: 'trip123',
              userId: 'user123',
              role: 'OWNER',
            }),
          },
        };
        return await callback(tx);
      });

      const result = await service.confirmPlan(dto);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.tripId).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getRecommendations', () => {
    it('应该从缓存获取推荐结果', async () => {
      const params = {
        preferences: {
          budget: { total: 10000, currency: 'CNY' },
        },
      };

      const cachedResult = {
        recommendations: [],
        preferencesUsed: {},
        generatedAt: new Date().toISOString(),
      };

      cacheService.get.mockResolvedValue(cachedResult);

      const result = await service.getRecommendations(params);

      expect(result).toEqual(cachedResult);
      expect(cacheService.get).toHaveBeenCalled();
    });

    it('应该调用推荐引擎获取推荐', async () => {
      const params = {
        preferences: {
          budget: { total: 10000, currency: 'CNY' },
        },
      };

      cacheService.get.mockResolvedValue(null);
      recommendationEngine.getRecommendations.mockResolvedValue([]);

      const result = await service.getRecommendations(params);

      expect(result).toBeDefined();
      expect(recommendationEngine.getRecommendations).toHaveBeenCalled();
    });
  });

  describe('optimizePlan', () => {
    it('应该验证方案ID必填', async () => {
      const dto = {
        sessionId: 'session123',
      };

      await expect(service.optimizePlan(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('应该验证会话ID必填', async () => {
      const dto = {
        planId: 'plan1',
      };

      await expect(service.optimizePlan(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('应该从会话状态获取原始方案', async () => {
      const dto = {
        planId: 'plan1',
        sessionId: 'session123',
        optimizationType: 'pace' as const,
      };

      const state: PlanningConversationState = {
        sessionId: 'session123',
        userId: 'user123',
        phase: 'COMPARING',
        preferences: {},
        planCandidates: [
          {
            id: 'plan1',
            name: 'Plan 1',
            nameCN: '方案1',
            description: 'Description 1',
            descriptionCN: '描述1',
            destination: 'Japan',
            duration: 7,
            highlights: [],
            estimatedBudget: {
              total: 10000,
              breakdown: {
                flight: 3000,
                accommodation: 4000,
                activities: 2000,
                food: 1000,
                other: 0,
              },
            },
            pace: 'intensive',
            suitability: { score: 90, reasons: [] },
          },
        ],
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      planningAssistantService.getSessionState.mockResolvedValue(state);
      coreGateway.execute.mockResolvedValue({
        success: true,
        data: {
          planState: {},
          uiOutput: {
            skeletonOptions: {
              options: [],
            },
          },
        },
        meta: { traceId: 'trace123' },
      });

      const result = await service.optimizePlan(dto);

      expect(result).toBeDefined();
      expect(planningAssistantService.getSessionState).toHaveBeenCalledWith('session123');
    });
  });

  describe('optimizeTrip', () => {
    it('应该验证行程ID必填', async () => {
      const dto = {
        optimizationType: 'pace' as const,
      };

      await expect(service.optimizeTrip(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('应该从数据库获取行程数据', async () => {
      const dto = {
        tripId: 'trip123',
        optimizationType: 'pace' as const,
      };

      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip123',
        name: 'Trip to Japan',
        destination: 'Japan',
        startDate: new Date(),
        endDate: new Date(),
        budgetConfig: {},
        pacingConfig: {},
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      coreGateway.applyChangeIntent.mockResolvedValue({
        success: true,
        data: {},
        meta: { traceId: 'trace123' },
      });

      const result = await service.optimizeTrip(dto);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(prisma.trip.findUnique).toHaveBeenCalledWith({
        where: { id: 'trip123' },
        include: { TripCollaborator: true },
      });
    });

    it('应该在行程不存在时抛出异常', async () => {
      const dto = {
        tripId: 'trip123',
        optimizationType: 'pace' as const,
      };

      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(service.optimizeTrip(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('refineTrip', () => {
    it('应该验证行程ID必填', async () => {
      const dto = {
        days: [1, 2],
      };

      await expect(service.refineTrip(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('应该从数据库获取行程数据', async () => {
      const dto = {
        tripId: 'trip123',
        days: [1, 2],
        includeRestaurants: true,
      };

      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip123',
        name: 'Trip to Japan',
        destination: 'Japan',
        startDate: new Date(),
        endDate: new Date(),
        budgetConfig: {},
        pacingConfig: {},
        metadata: {},
        TripDay: [
          {
            id: 'day1',
            date: new Date(),
            ItineraryItem: [],
          },
          {
            id: 'day2',
            date: new Date(),
            ItineraryItem: [],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      coreGateway.applyChangeIntent.mockResolvedValue({
        success: true,
        data: {},
        meta: { traceId: 'trace123' },
      });

      const result = await service.refineTrip(dto);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(prisma.trip.findUnique).toHaveBeenCalled();
    });
  });

  describe('getTripSuggestions', () => {
    it('应该验证行程ID必填', async () => {
      await expect(service.getTripSuggestions('')).rejects.toThrow(BadRequestException);
    });

    it('应该从数据库获取行程数据并生成建议', async () => {
      const tripId = 'trip123';

      prisma.trip.findUnique.mockResolvedValue({
        id: tripId,
        name: 'Trip to Japan',
        destination: 'Japan',
        startDate: new Date(),
        endDate: new Date(),
        budgetConfig: {
          total: 10000,
          breakdown: {},
        },
        pacingConfig: {
          pacePreference: 'BALANCED',
        },
        metadata: {},
        TripDay: [
          {
            id: 'day1',
            date: new Date(),
            ItineraryItem: [
              {
                id: 'item1',
                type: 'ACTIVITY',
                startTime: new Date(),
                endTime: new Date(),
              },
            ],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      coreGateway.getTripStatus.mockResolvedValue({
        success: true,
        data: {
          health: 'good',
          issues: [],
        },
        meta: { traceId: 'trace123' },
      });

      const result = await service.getTripSuggestions(tripId);

      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(prisma.trip.findUnique).toHaveBeenCalledWith({
        where: { id: tripId },
        include: {
          TripCollaborator: true,
          TripDay: {
            include: {
              ItineraryItem: true,
            },
            orderBy: {
              date: 'asc',
            },
          },
        },
      });
    });
  });

  describe('铁路场景 (rail)', () => {
    let railDirectService: jest.Mocked<Pick<RailDirectService, 'searchRoutes' | 'isServiceAvailable'>>;
    let transitousDirectService: jest.Mocked<Pick<TransitousDirectService, 'searchRoutes' | 'isServiceAvailable'>>;
    const mockConfigService = { get: jest.fn((key: string, defaultValue?: any) => defaultValue) };
    const mockPreferenceLearning = { learnFromAction: jest.fn().mockResolvedValue(undefined) };
    const mockPersonaLanguage = {};
    const mockLlmService = {};

    beforeEach(async () => {
      railDirectService = {
        searchRoutes: jest.fn(),
        isServiceAvailable: jest.fn().mockReturnValue(true),
      };
      transitousDirectService = {
        searchRoutes: jest.fn(),
        isServiceAvailable: jest.fn().mockReturnValue(true),
      };

      const railModule = await Test.createTestingModule({
        providers: [
          PlanningAssistantV2Service,
          { provide: PlanningAssistantService, useValue: planningAssistantService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: CoreGatewayService, useValue: coreGateway },
          { provide: RecommendationEngineService, useValue: recommendationEngine },
          { provide: PreferenceLearningService, useValue: mockPreferenceLearning },
          { provide: PersonaLanguageService, useValue: mockPersonaLanguage },
          { provide: LlmService, useValue: mockLlmService },
          { provide: SmartRouterService, useValue: smartRouter },
          { provide: TaskService, useValue: taskService },
          { provide: CacheService, useValue: cacheService },
          { provide: PrismaService, useValue: prisma },
          { provide: RailDirectService, useValue: railDirectService },
          { provide: TransitousDirectService, useValue: transitousDirectService },
        ],
      }).compile();

      service = railModule.get<PlanningAssistantV2Service>(PlanningAssistantV2Service);
    });

    it('应返回铁路路线（RailDirectService 成功）', async () => {
      const mockRoutes = [
        { origin: 'Berlin Hbf', destination: 'München Hbf', legs: [], bookingUrl: 'https://www.bahn.de/...' },
      ];
      railDirectService.searchRoutes.mockResolvedValue({ routes: mockRoutes, journeys: [] });

      smartRouter.routeWithTools.mockResolvedValue({
        target: 'rail',
        confidence: 0.9,
        extractedParams: { origin: '柏林', destination: '慕尼黑', date: '2026-03-20' },
      });
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 's1',
        userId: 'u1',
        phase: 'RECOMMENDING',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.chat({
        sessionId: 's1',
        message: '查询柏林到慕尼黑的火车',
        options: { autoRoute: true },
      });

      expect(result.routing?.target).toBe('rail');
      expect(result.railRoutes).toBeDefined();
      expect(result.railRoutes!.length).toBeGreaterThan(0);
      expect(result.railRoutes![0]).toHaveProperty('actions');
      expect(result.railRoutes![0]).toHaveProperty('bookingUrl');
      expect(railDirectService.searchRoutes).toHaveBeenCalledWith(
        expect.objectContaining({ origin: '柏林', destination: '慕尼黑' })
      );
    });

    it('应进入日期澄清阶段（无 date 时）', async () => {
      smartRouter.routeWithTools.mockResolvedValue({
        target: 'rail',
        confidence: 0.9,
        extractedParams: { origin: '柏林', destination: '慕尼黑' },
      });
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 's1',
        userId: 'u1',
        phase: 'RECOMMENDING',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.chat({
        sessionId: 's1',
        message: '柏林到慕尼黑的火车',
        options: { autoRoute: true },
      });

      expect(result.phase).toBe('CLARIFYING_RAIL_DATES');
      expect(result.suggestedActions).toBeDefined();
      expect(result.suggestedActions!.some((a: any) => a.action === 'rail_date-tomorrow')).toBe(true);
      expect(result.suggestedActions!.some((a: any) => a.action === 'rail_date-day-after')).toBe(true);
      expect(railDirectService.searchRoutes).not.toHaveBeenCalled();
    });

    it('应在 RailDirect 失败时 fallback 到 Transitous', async () => {
      railDirectService.searchRoutes.mockRejectedValue(new Error('Station not found'));
      const fallbackRoutes = [
        { origin: 'Paris', destination: 'Barcelona', legs: [], bookingUrl: 'https://www.bahn.de/...' },
      ];
      transitousDirectService.searchRoutes.mockResolvedValue({ routes: fallbackRoutes, journeys: [] });

      smartRouter.routeWithTools.mockResolvedValue({
        target: 'rail',
        confidence: 0.9,
        extractedParams: { origin: '巴黎', destination: '巴塞罗那', date: '2026-03-20' },
      });
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 's1',
        userId: 'u1',
        phase: 'RECOMMENDING',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.chat({
        sessionId: 's1',
        message: '巴黎到巴塞罗那的火车 3月20日',
        options: { autoRoute: true },
      });

      expect(result.railRoutes).toBeDefined();
      expect(result.railRoutes!.length).toBeGreaterThan(0);
      expect(railDirectService.searchRoutes).toHaveBeenCalled();
      expect(transitousDirectService.searchRoutes).toHaveBeenCalled();
    });

    it('应在无铁路服务时返回友好错误', async () => {
      (railDirectService.isServiceAvailable as jest.Mock).mockReturnValue(false);
      (transitousDirectService.isServiceAvailable as jest.Mock).mockReturnValue(false);

      const mockPref = { learnFromAction: jest.fn().mockResolvedValue(undefined) };
      const moduleNoRail = await Test.createTestingModule({
        providers: [
          PlanningAssistantV2Service,
          { provide: PlanningAssistantService, useValue: planningAssistantService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: CoreGatewayService, useValue: coreGateway },
          { provide: RecommendationEngineService, useValue: recommendationEngine },
          { provide: PreferenceLearningService, useValue: mockPref },
          { provide: PersonaLanguageService, useValue: mockPersonaLanguage },
          { provide: LlmService, useValue: mockLlmService },
          { provide: SmartRouterService, useValue: smartRouter },
          { provide: TaskService, useValue: taskService },
          { provide: CacheService, useValue: cacheService },
          { provide: PrismaService, useValue: prisma },
          { provide: RailDirectService, useValue: railDirectService },
          { provide: TransitousDirectService, useValue: transitousDirectService },
        ],
      }).compile();
      const svcNoRail = moduleNoRail.get<PlanningAssistantV2Service>(PlanningAssistantV2Service);

      smartRouter.routeWithTools.mockResolvedValue({
        target: 'rail',
        confidence: 0.9,
        extractedParams: { origin: '柏林', destination: '慕尼黑', date: '2026-03-20' },
      });
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 's1',
        userId: 'u1',
        phase: 'RECOMMENDING',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await svcNoRail.chat({
        sessionId: 's1',
        message: '柏林到慕尼黑火车',
        options: { autoRoute: true },
      });

      expect(result.routing?.target).toBe('rail');
      expect(result.messageCN).toContain('暂不可用');
      expect(railDirectService.searchRoutes).not.toHaveBeenCalled();
    });

    it('应在日期澄清阶段用户选择「明天」后执行搜索', async () => {
      railDirectService.searchRoutes.mockResolvedValue({
        routes: [{ origin: 'Berlin', destination: 'Munich', legs: [], bookingUrl: 'https://bahn.de' }],
        journeys: [],
      });

      smartRouter.routeWithTools.mockResolvedValue({ target: 'chat', confidence: 0.5 });
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 's1',
        userId: 'u1',
        phase: 'CLARIFYING_RAIL_DATES',
        preferences: {},
        messageHistory: [],
        pendingRailSearch: {
          extractedParams: { origin: '柏林', destination: '慕尼黑' },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.chat({
        sessionId: 's1',
        message: '明天',
        options: { autoRoute: true },
      });

      expect(result.railRoutes).toBeDefined();
      expect(result.railRoutes!.length).toBeGreaterThan(0);
      expect(railDirectService.searchRoutes).toHaveBeenCalledWith(
        expect.objectContaining({ origin: '柏林', destination: '慕尼黑' })
      );
    });

    it('应返回巴黎↔伦敦 Eurostar 引导卡片', async () => {
      railDirectService.searchRoutes.mockResolvedValue({
        routes: [{
          origin: 'Paris Gare du Nord',
          destination: 'London St Pancras',
          legs: [],
          bookingUrl: 'https://www.eurostar.com/',
          note: '巴黎–伦敦 Eurostar 列车。请通过 Eurostar 官网查询实时车次、票价并预订。',
        }],
        journeys: [],
      });

      smartRouter.routeWithTools.mockResolvedValue({
        target: 'rail',
        confidence: 0.9,
        extractedParams: { origin: '巴黎', destination: '伦敦', date: '2026-03-20' },
      });
      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 's1',
        userId: 'u1',
        phase: 'RECOMMENDING',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.chat({
        sessionId: 's1',
        message: '巴黎到伦敦的火车',
        options: { autoRoute: true },
      });

      expect(result.railRoutes).toBeDefined();
      expect(result.railRoutes!.length).toBeGreaterThan(0);
      expect(result.railRoutes![0].bookingUrl).toBe('https://www.eurostar.com/');
      expect(result.railRoutes![0].note).toContain('Eurostar');
    });

    it('应在 RailDirect 和 Transitous 均失败时返回错误', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      try {
        railDirectService.searchRoutes.mockRejectedValue(new Error('API error'));
        transitousDirectService.searchRoutes.mockRejectedValue(new Error('Transitous error'));

        smartRouter.routeWithTools.mockResolvedValue({
          target: 'rail',
          confidence: 0.9,
          extractedParams: { origin: '北京', destination: '上海', date: '2026-03-20' },
        });
        planningAssistantService.getSessionState.mockResolvedValue({
          sessionId: 's1',
          userId: 'u1',
          phase: 'RECOMMENDING',
          preferences: {},
          messageHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });

        const result = await service.chat({
          sessionId: 's1',
          message: '北京到上海的高铁',
          options: { autoRoute: true },
        });

        expect(result.railRoutes).toBeUndefined();
        expect(result.messageCN).toContain('铁路查询失败');
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe('chat', () => {
    it('应该支持智能路由', async () => {
      const dto = {
        sessionId: 'session123',
        message: '我想去日本旅行',
        options: {
          autoRoute: true,
        },
      };

      smartRouter.routeWithTools.mockResolvedValue({
        target: 'recommendations',
        confidence: 0.9,
        extractedParams: {
          destination: 'Japan',
        },
      });

      recommendationEngine.getRecommendations.mockResolvedValue([]);

      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 'session123',
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      await service.chat(dto);

      expect(smartRouter.routeWithTools).toHaveBeenCalled();
    });

    it('应该在路由失败时回退到对话接口', async () => {
      const dto = {
        sessionId: 'session123',
        message: '你好',
        options: {
          autoRoute: true,
        },
      };

      smartRouter.routeWithTools.mockRejectedValue(new Error('路由失败'));

      planningAssistantService.chat.mockResolvedValue({
        message: 'Hello',
        messageCN: '你好',
        phase: 'INITIAL',
      });

      const result = await service.chat(dto);

      expect(result).toBeDefined();
      expect(planningAssistantService.chat).toHaveBeenCalled();
    });
  });

  describe('generatePlanAsync', () => {
    it('应该在任务服务不可用时抛出异常', async () => {
      const dto: GeneratePlanRequestDto = {
        destination: 'Japan',
      };

      const mockPreferenceLearningLocal = {
        learnFromAction: jest.fn(),
      };

      const mockPersonaLanguageLocal = {};

      const mockLlmServiceLocal = {};

      // 创建一个没有taskService的service实例
      const moduleWithoutTaskService = await Test.createTestingModule({
        providers: [
          PlanningAssistantV2Service,
          {
            provide: PlanningAssistantService,
            useValue: planningAssistantService,
          },
          {
            provide: CoreGatewayService,
            useValue: undefined, // 不提供 taskService
          },
          {
            provide: RecommendationEngineService,
            useValue: recommendationEngine,
          },
          {
            provide: PreferenceLearningService,
            useValue: mockPreferenceLearningLocal,
          },
          {
            provide: PersonaLanguageService,
            useValue: mockPersonaLanguageLocal,
          },
          {
            provide: LlmService,
            useValue: mockLlmServiceLocal,
          },
          {
            provide: SmartRouterService,
            useValue: smartRouter,
          },
          {
            provide: TaskService,
            useValue: undefined, // 不提供 taskService
          },
          {
            provide: CacheService,
            useValue: cacheService,
          },
          {
            provide: PrismaService,
            useValue: prisma,
          },
        ],
      }).compile();

      const serviceWithoutTaskService = moduleWithoutTaskService.get<PlanningAssistantV2Service>(
        PlanningAssistantV2Service
      );

      await expect(serviceWithoutTaskService.generatePlanAsync(dto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该创建异步任务', async () => {
      const dto: GeneratePlanRequestDto = {
        destination: 'Japan',
      };

      taskService.createTask.mockReturnValue('task123');
      taskService.getTaskStatus.mockResolvedValue({
        taskId: 'task123',
        status: 'PENDING',
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      const result = await service.generatePlanAsync(dto);

      expect(result).toBeDefined();
      expect(result.taskId).toBe('task123');
      expect(taskService.createTask).toHaveBeenCalled();
    });
  });

  describe('getGenerateTaskStatus', () => {
    it('应该在任务不存在时抛出异常', async () => {
      const taskId = 'task123';

      taskService.getTaskStatus.mockResolvedValue(null);

      await expect(service.getGenerateTaskStatus(taskId)).rejects.toThrow(NotFoundException);
    });

    it('应该返回任务状态', async () => {
      const taskId = 'task123';

      taskService.getTaskStatus.mockResolvedValue({
        taskId: 'task123',
        status: 'PROCESSING',
        progress: 50,
        currentStage: '正在生成方案...',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      const result = await service.getGenerateTaskStatus(taskId);

      expect(result).toBeDefined();
      expect(result.taskId).toBe('task123');
      expect(result.status).toBe('PROCESSING');
      expect(result.progress).toBe(50);
    });
  });

  describe('deleteSession', () => {
    it('应该成功删除会话', async () => {
      const sessionId = 'session123';

      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      await service.deleteSession(sessionId);

      expect(cacheService.delete).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('应该在会话不存在时抛出异常', async () => {
      const sessionId = 'session123';

      planningAssistantService.getSessionState.mockResolvedValue(null);

      await expect(service.deleteSession(sessionId)).rejects.toThrow(SessionNotFoundException);
    });
  });

  describe('getMessageHistory', () => {
    it('应该返回消息历史', async () => {
      const sessionId = 'session123';
      const limit = 10;
      const offset = 0;

      const state: PlanningConversationState = {
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [
          {
            id: 'msg1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg2',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      planningAssistantService.getSessionState.mockResolvedValue(state);

      const result = await service.getMessageHistory(sessionId, limit, offset);

      expect(result).toBeDefined();
      expect(result.messages.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('应该过滤system消息', async () => {
      const sessionId = 'session123';

      const state: PlanningConversationState = {
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [
          {
            id: 'msg1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg2',
            role: 'system',
            content: 'System message',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg3',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      planningAssistantService.getSessionState.mockResolvedValue(state);

      const result = await service.getMessageHistory(sessionId);

      expect(result.messages.length).toBe(2);
      expect(result.messages.every(msg => msg.role !== 'system')).toBe(true);
    });
  });

  describe('辅助方法测试', () => {
    describe('updateSessionState', () => {
      it('应该更新会话状态并清除缓存', async () => {
        const sessionId = 'session123';
        const state: PlanningConversationState = {
          sessionId,
          userId: 'user123',
          phase: 'INITIAL',
          preferences: {},
          messageHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };

        planningAssistantService.getSessionState.mockResolvedValue(state);
        (planningAssistantService as any).saveSession = jest.fn().mockResolvedValue(undefined);

        // 通过调用会触发updateSessionState的方法来测试
        // 需要mock prisma和其他依赖
        // Mock 事务：返回创建的 trip
        prisma.$transaction.mockImplementation(async (callback: any) => {
          const tx = {
            trip: {
              create: jest.fn().mockResolvedValue({
                id: 'trip123',
                name: 'Trip',
                destination: 'Japan',
                startDate: new Date(),
                endDate: new Date(),
                budgetConfig: {},
                pacingConfig: {},
                metadata: {},
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            },
            tripCollaborator: {
              create: jest.fn().mockResolvedValue({
                id: 'collab123',
                tripId: 'trip123',
                userId: 'user123',
                role: 'OWNER',
              }),
            },
          };
          return await callback(tx);
        });

        const stateWithPlan: PlanningConversationState = {
          ...state,
          planCandidates: [
            {
              id: 'plan1',
              name: 'Plan 1',
              nameCN: '方案1',
              description: 'Description',
              descriptionCN: '描述',
              destination: 'Japan',
              duration: 7,
              highlights: [],
              estimatedBudget: {
                total: 10000,
                breakdown: {
                  flight: 3000,
                  accommodation: 4000,
                  activities: 2000,
                  food: 1000,
                  other: 0,
                },
              },
              pace: 'moderate',
              suitability: { score: 90, reasons: [] },
            },
          ],
        };

        planningAssistantService.getSessionState.mockResolvedValue(stateWithPlan);
        (planningAssistantService as any).saveSession = jest.fn().mockResolvedValue(undefined);

        await service.confirmPlan({
          planId: 'plan1',
          sessionId,
        });

        expect(cacheService.delete).toHaveBeenCalled();
      });
    });

    describe('convertPlanCandidateToDto', () => {
      it('应该正确转换PlanCandidate为PlanCandidateDto', async () => {
        const plan: PlanCandidate = {
          id: 'plan1',
          name: 'Plan 1',
          nameCN: '方案1',
          description: 'Description',
          descriptionCN: '描述',
          destination: 'Japan',
          duration: 7,
          highlights: ['highlight1'],
          estimatedBudget: {
            total: 10000,
            breakdown: {
              flight: 3000,
              accommodation: 4000,
              activities: 2000,
              food: 1000,
              other: 0,
            },
          },
          pace: 'moderate',
          suitability: { score: 90, reasons: ['reason1'] },
        };

        const state: PlanningConversationState = {
          sessionId: 'session123',
          userId: 'user123',
          phase: 'COMPARING',
          preferences: {},
          planCandidates: [plan],
          messageHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };

        planningAssistantService.getSessionState.mockResolvedValue(state);

        const result = await service.getSessionState('session123');

        expect(result.planCandidates).toBeDefined();
        if (result.planCandidates && result.planCandidates.length > 0) {
          expect(result.planCandidates[0].estimatedBudget.currency).toBeDefined();
        }
      });
    });
  });

  describe('边界情况测试', () => {
    it('应该处理空推荐结果', async () => {
      const params = {
        preferences: {
          budget: { total: 10000, currency: 'CNY' },
        },
      };

      cacheService.get.mockResolvedValue(null);
      recommendationEngine.getRecommendations.mockResolvedValue([]);

      const result = await service.getRecommendations(params);

      expect(result).toBeDefined();
      expect(result.recommendations).toEqual([]);
    });

    it('应该处理空方案列表', async () => {
      const dto: GeneratePlanRequestDto = {
        destination: 'Japan',
      };

      coreGateway.generatePlan.mockResolvedValue({
        success: true,
        data: {
          planState: {},
          uiOutput: {
            skeletonOptions: {
              options: [],
            },
          },
        },
        meta: { traceId: 'trace123' },
      });

      planningAssistantService.getSessionState.mockResolvedValue({
        sessionId: 'session123',
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const result = await service.generatePlan(dto);

      expect(result).toBeDefined();
      expect(result.plans).toEqual([]);
    });

    it('应该处理缓存服务不可用的情况', async () => {
      const sessionId = 'session123';
      const state: PlanningConversationState = {
        sessionId,
        userId: 'user123',
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockPreferenceLearningLocal = {
        learnFromAction: jest.fn(),
      };

      const mockPersonaLanguageLocal = {};

      const mockLlmServiceLocal = {};

      // 创建一个没有cacheService的service实例
      const moduleWithoutCache = await Test.createTestingModule({
        providers: [
          PlanningAssistantV2Service,
          {
            provide: PlanningAssistantService,
            useValue: planningAssistantService,
          },
          {
            provide: CoreGatewayService,
            useValue: coreGateway,
          },
          {
            provide: RecommendationEngineService,
            useValue: recommendationEngine,
          },
          {
            provide: PreferenceLearningService,
            useValue: mockPreferenceLearningLocal,
          },
          {
            provide: PersonaLanguageService,
            useValue: mockPersonaLanguageLocal,
          },
          {
            provide: LlmService,
            useValue: mockLlmServiceLocal,
          },
          {
            provide: SmartRouterService,
            useValue: smartRouter,
          },
          {
            provide: TaskService,
            useValue: taskService,
          },
          {
            provide: CacheService,
            useValue: undefined, // 不提供 CacheService，测试缓存服务不可用的情况
          },
          {
            provide: PrismaService,
            useValue: prisma,
          },
        ],
      }).compile();

      const serviceWithoutCache = moduleWithoutCache.get<PlanningAssistantV2Service>(
        PlanningAssistantV2Service
      );

      planningAssistantService.getSessionState.mockResolvedValue(state);

      const result = await serviceWithoutCache.getSessionState(sessionId);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe(sessionId);
    });
  });
});
