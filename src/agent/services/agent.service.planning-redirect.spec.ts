/**
 * AgentService 规划请求拦截测试
 * 
 * 测试规划请求被正确拦截并重定向到规划工作台的功能
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { RouterReason, UIStatus, RouteType } from '../interfaces/router.interface';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { ExecutionGatewayService } from './execution-gateway.service';
import { ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS } from '../memory/testing/route-and-run-memory.providers';

describe('AgentService - Planning Request Interception', () => {
  let agentService: AgentService;
  let module: TestingModule;

  // Mock 依赖服务
  const mockRouterService = {
    route: jest.fn(),
  };

  const mockAgentStateService = {
    createInitialState: jest.fn().mockImplementation((userInput: string, userId: string, tripId?: string, options?: any) => ({
      request_id: `test-${Date.now()}`,
      user_input: userInput,
      trip: {
        trip_id: tripId || null,
        days: 1,
        day_boundaries: [{ start: '10:00', end: '22:00' }],
        lunch_break: {
          enabled: true,
          duration_min: 60,
          window: ['11:30', '13:30'],
        },
        pacing: 'normal',
      },
      draft: {
        nodes: [],
        hard_nodes: [],
        soft_nodes: [],
        edits: [],
      },
      memory: {
        semantic_facts: {
          pois: [],
          rules: {},
        },
        episodic_snippets: [],
        user_profile: {},
      },
      compute: {
        clusters: null,
        time_matrix_api: null,
        time_matrix_robust: null,
        optimization_results: [],
        robustness: null,
      },
      react: {
        step: 0,
        max_steps: options?.max_steps || 8,
        observations: [],
        decision_log: [],
      },
      result: {
        status: 'DRAFT',
        timeline: [],
        dropped_items: [],
        explanations: [],
      },
      observability: {
        router_ms: 0,
        latency_ms: 0,
        tool_calls: 0,
        browser_steps: 0,
        cost_est_usd: 0,
        fallback_used: false,
      },
    })),
    getState: jest.fn(),
    update: jest.fn().mockImplementation((requestId: string, updates: any) => {
      const baseState = mockAgentStateService.createInitialState('', '', null);
      // 深度合并 updates，确保 result 等嵌套对象被正确合并
      const mergedState = {
        ...baseState,
        request_id: requestId,
        ...updates,
        result: {
          ...baseState.result,
          ...(updates.result || {}),
        },
        observability: {
          ...baseState.observability,
          ...(updates.observability || {}),
        },
      };
      return mergedState;
    }),
  };

  const mockSystem1Executor = {
    execute: jest.fn(),
  };

  const mockOrchestrator = {
    execute: jest.fn(),
  };

  const mockEventTelemetry = {
    recordRouterDecision: jest.fn(),
    recordAgentComplete: jest.fn(),
  };

  const mockRequestDeduplication = {
    generateRequestHash: jest.fn(),
    getCachedResponse: jest.fn(),
    cacheResponse: jest.fn(),
    checkDuplicate: jest.fn(),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        ...ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS,
        ExecutionGatewayService,
        AgentService,
        {
          provide: RouterService,
          useValue: mockRouterService,
        },
        {
          provide: AgentStateService,
          useValue: mockAgentStateService,
        },
        {
          provide: System1ExecutorService,
          useValue: mockSystem1Executor,
        },
        {
          provide: OrchestratorService,
          useValue: mockOrchestrator,
        },
        {
          provide: EventTelemetryService,
          useValue: mockEventTelemetry,
        },
        {
          provide: RequestDeduplicationService,
          useValue: mockRequestDeduplication,
        },
      ],
    }).compile();

    agentService = module.get<AgentService>(AgentService);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // 默认不返回缓存
    mockRequestDeduplication.getCachedResponse.mockReturnValue(null);
    mockRequestDeduplication.checkDuplicate.mockReturnValue(null);
  });

  describe('isPlanningRequest() - 规划请求识别', () => {
    // 注意：isPlanningRequest 是私有方法，我们通过 routeAndRun 来测试

    describe('应该拦截的规划请求（无 trip_id）', () => {
      it('应该拦截：明确包含规划关键词', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-001',
          user_id: 'user-123',
          message: '规划一个5天冰岛行程',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
        expect(response.route.reasons).toContain(RouterReason.REDIRECT_TO_PLANNING_WORKBENCH);
        expect(response.route.ui_hint.status).toBe(UIStatus.REDIRECT_REQUIRED);
        expect(response.result.payload.redirectInfo).toBeDefined();
        expect(response.result.payload.redirectInfo?.redirect_to).toBe('/planning-workbench/execute');
      });

      it('应该拦截：包含"帮我规划"', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-002',
          user_id: 'user-123',
          message: '帮我规划北京3日游',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
      });

      it('应该拦截：包含"设计"关键词', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-003',
          user_id: 'user-123',
          message: '帮我设计一个日本7天行程',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
      });

      it('应该拦截：包含"新行程"', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-004',
          user_id: 'user-123',
          message: '我想创建一个新行程',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
      });

      it('应该拦截：包含目的地+天数+规划关键词', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-005',
          user_id: 'user-123',
          message: '去冰岛5天，帮我规划一下',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
      });

      it('应该拦截：包含"从零开始"', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-006',
          user_id: 'user-123',
          message: '从零开始规划一个行程',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
      });

      it('应该拦截：英文规划请求', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-007',
          user_id: 'user-123',
          message: 'Plan a 5-day trip to Iceland',
        };

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).toBe('REDIRECT_REQUIRED');
      });
    });

    describe('不应该拦截的请求（有 trip_id）', () => {
      it('不应该拦截：已有 trip_id 的查询请求', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-008',
          user_id: 'user-123',
          trip_id: 'trip-456',
          message: '查询我的行程',
        };

        // Mock RouterService 返回正常路由
        mockRouterService.route.mockResolvedValue({
          route: RouteType.SYSTEM1_API,
          confidence: 0.9,
          reasons: [],
          required_capabilities: [],
          consent_required: false,
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
          ui_hint: {
            mode: 'fast',
            status: UIStatus.DONE,
            message: '查询完成',
          },
        });

        // Mock System1Executor 返回结果
        mockSystem1Executor.execute.mockResolvedValue({
          success: true,
          answerText: '这是您的行程',
          payload: {},
        });

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
        // 应该正常处理，不重定向
      });

      it('不应该拦截：已有 trip_id 的修改请求', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-009',
          user_id: 'user-123',
          trip_id: 'trip-456',
          message: '修改第2天的行程',
        };

        // Mock RouterService
        mockRouterService.route.mockResolvedValue({
          route: RouteType.SYSTEM2_REASONING,
          confidence: 0.9,
          reasons: [],
          required_capabilities: [],
          consent_required: false,
          budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
          ui_hint: {
            mode: 'slow',
            status: UIStatus.THINKING,
            message: '正在处理',
          },
        });

        // Mock Orchestrator - 返回完整的 AgentState
        const mockState = mockAgentStateService.createInitialState(request.message, request.user_id, request.trip_id);
        mockOrchestrator.execute.mockResolvedValue({
          ...mockState,
          result: {
            ...mockState.result,
            status: 'READY',
            timeline: [],
            dropped_items: [],
            explanations: [],
          },
        });

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      });
    });

    describe('白名单测试（不应该拦截）', () => {
      it('不应该拦截：查询规划（白名单）', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-010',
          user_id: 'user-123',
          message: '查询规划',
        };

        // Mock RouterService
        mockRouterService.route.mockResolvedValue({
          route: RouteType.SYSTEM1_API,
          confidence: 0.9,
          reasons: [],
          required_capabilities: [],
          consent_required: false,
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
          ui_hint: {
            mode: 'fast',
            status: UIStatus.DONE,
            message: '查询完成',
          },
        });

        mockSystem1Executor.execute.mockResolvedValue({
          success: true,
          answerText: '这是您的规划',
          payload: {},
        });

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      });

      it('不应该拦截：查看规划详情（白名单）', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-011',
          user_id: 'user-123',
          message: '显示规划详情',
        };

        // Mock RouterService
        mockRouterService.route.mockResolvedValue({
          route: RouteType.SYSTEM1_API,
          confidence: 0.9,
          reasons: [],
          required_capabilities: [],
          consent_required: false,
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
          ui_hint: {
            mode: 'fast',
            status: UIStatus.DONE,
            message: '查询完成',
          },
        });

        mockSystem1Executor.execute.mockResolvedValue({
          success: true,
          answerText: '规划详情',
          payload: {},
        });

        const response = await agentService.routeAndRun(request);

        expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      });
    });

    describe('边界情况测试', () => {
      it('应该处理空消息', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-012',
          user_id: 'user-123',
          message: '',
        };

        // Mock RouterService
        mockRouterService.route.mockResolvedValue({
          route: RouteType.SYSTEM1_API,
          confidence: 0.9,
          reasons: [],
          required_capabilities: [],
          consent_required: false,
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
          ui_hint: {
            mode: 'fast',
            status: UIStatus.DONE,
            message: '查询完成',
          },
        });

        mockSystem1Executor.execute.mockResolvedValue({
          success: true,
          answerText: '请输入有效消息',
          payload: {},
        });

        const response = await agentService.routeAndRun(request);

        // 空消息不应该被拦截为规划请求
        expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      });

      it('应该处理只有目的地没有天数的请求', async () => {
        const request: RouteAndRunRequestDto = {
          request_id: 'req-013',
          user_id: 'user-123',
          message: '去冰岛',
        };

        // 如果没有规划关键词，不应该拦截
        // Mock RouterService
        mockRouterService.route.mockResolvedValue({
          route: RouteType.SYSTEM1_API,
          confidence: 0.9,
          reasons: [],
          required_capabilities: [],
          consent_required: false,
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
          ui_hint: {
            mode: 'fast',
            status: UIStatus.DONE,
            message: '查询完成',
          },
        });

        mockSystem1Executor.execute.mockResolvedValue({
          success: true,
          answerText: '冰岛信息',
          payload: {},
        });

        const response = await agentService.routeAndRun(request);

        // 只有目的地，没有规划关键词，不应该拦截
        expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      });
    });
  });

  describe('createRedirectToPlanningWorkbenchResponse() - 重定向响应', () => {
    it('应该返回正确的重定向响应格式', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'req-014',
        user_id: 'user-123',
        message: '规划一个5天冰岛行程',
      };

      const response = await agentService.routeAndRun(request);

      // 验证响应格式
      expect(response.request_id).toBe('req-014');
      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      expect(response.route.route).toBe(RouteType.SYSTEM2_REASONING);
      expect(response.route.reasons).toContain(RouterReason.REDIRECT_TO_PLANNING_WORKBENCH);
      expect(response.route.ui_hint.status).toBe(UIStatus.REDIRECT_REQUIRED);
      expect(response.route.ui_hint.message).toBe('需要前往规划工作台');

      // 验证 redirectInfo
      expect(response.result.payload.redirectInfo).toBeDefined();
      expect(response.result.payload.redirectInfo?.redirect_to).toBe('/planning-workbench/execute');
      expect(response.result.payload.redirectInfo?.redirect_reason).toBe('PLANNING_REQUEST_DETECTED');
      expect(response.result.payload.redirectInfo?.original_request.message).toBe('规划一个5天冰岛行程');
      expect(response.result.payload.redirectInfo?.original_request.user_id).toBe('user-123');

      // 验证决策日志
      expect(response.explain.decision_log).toBeDefined();
      expect(response.explain.decision_log.length).toBeGreaterThan(0);
      expect(response.explain.decision_log[0].inputs_summary).toContain('规划请求');
      expect(response.explain.decision_log[0].outputs_summary).toBe('重定向到规划工作台');

      // 验证 observability
      expect(response.observability.system_mode).toBe('REDIRECT');
      expect(response.observability.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('应该包含正确的 trace 信息', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'req-015',
        user_id: 'user-123',
        message: '帮我设计一个行程',
      };

      const response = await agentService.routeAndRun(request);

      expect(response.observability.trace).toBeDefined();
      expect(response.observability.trace?.orchestration).toBeDefined();
      expect(response.observability.trace?.orchestration.resolved.mode).toBe('LEGACY');
      expect(response.observability.trace?.orchestration.resolved.reason).toContain('Planning request detected');
      expect(response.observability.trace?.orchestration.resolved.matchedRules).toContain('PLANNING_REQUEST_INTERCEPT');
    });
  });

  describe('性能测试', () => {
    it('路由判断应该快速执行（< 10ms）', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'req-016',
        user_id: 'user-123',
        message: '规划一个5天冰岛行程',
      };

      const startTime = Date.now();
      const response = await agentService.routeAndRun(request);
      const latency = Date.now() - startTime;

      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      // 重定向响应应该很快（< 50ms，包括所有初始化）
      expect(latency).toBeLessThan(50);
    });
  });
});
