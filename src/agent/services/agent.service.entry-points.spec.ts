/**
 * AgentService 入口点验证测试
 * 
 * 测试 trip_id 强制验证和只读模式限制功能
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

describe('AgentService - Entry Points Validation', () => {
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
      return {
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
    mockRequestDeduplication.getCachedResponse.mockReturnValue(null);
    mockRequestDeduplication.checkDuplicate.mockReturnValue(null);
  });

  describe('trip_id 强制验证', () => {
    it('应该拒绝缺少 trip_id 的请求', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-001',
        user_id: 'user-123',
        message: '查询我的行程',
        // trip_id 缺失
      };

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).toBe('FAILED');
      expect(response.result.answer_text).toContain('智能体统一入口只为具体行程服务');
      expect(response.result.answer_text).toContain('请提供 trip_id');
      expect(response.route.reasons).toContain(RouterReason.MISSING_INFO);
      expect(response.route.ui_hint.status).toBe(UIStatus.AWAITING_CONFIRMATION);
      expect(response.result.payload.redirectInfo).toBeDefined();
      expect(response.result.payload.redirectInfo?.redirect_reason).toBe('MISSING_TRIP_ID');
    });

    it('应该拒绝空字符串 trip_id 的请求', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-002',
        user_id: 'user-123',
        trip_id: '',
        message: '查询我的行程',
      };

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).toBe('FAILED');
      expect(response.result.answer_text).toContain('智能体统一入口只为具体行程服务');
    });

    it('应该允许有 trip_id 的请求正常通过', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-003',
        user_id: 'user-123',
        trip_id: 'trip-456',
        message: '查询我的行程',
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
        answerText: '这是您的行程',
        payload: {},
      });

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).not.toBe('FAILED');
      expect(mockRouterService.route).toHaveBeenCalled();
    });
  });

  describe('只读模式限制', () => {
    it('应该拦截行程详情页的修改请求', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-004',
        user_id: 'user-123',
        trip_id: 'trip-456',
        message: '修改第2天的行程',
        options: {
          entry_point: 'trip_detail_page',
          readonly_mode: true,
        },
      };

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      expect(response.result.answer_text).toContain('行程详情页只支持查询操作');
      expect(response.result.answer_text).toContain('前往规划工作台');
      expect(response.route.reasons).toContain(RouterReason.HIGH_RISK_ACTION);
      expect(response.route.ui_hint.status).toBe(UIStatus.REDIRECT_REQUIRED);
      expect(response.result.payload.redirectInfo?.redirect_reason).toBe('READONLY_MODE_RESTRICTION');
      expect(response.result.payload.redirectInfo?.redirect_to).toBe(
        '/dashboard/plan-studio?tripId=trip-456',
      );
    });

    it('应该允许行程详情页的查询请求', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-005',
        user_id: 'user-123',
        trip_id: 'trip-456',
        message: '查询第2天的行程',
        options: {
          entry_point: 'trip_detail_page',
          readonly_mode: true,
        },
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
        answerText: '第2天的行程是...',
        payload: {},
      });

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      expect(mockRouterService.route).toHaveBeenCalled();
    });

    it('应该允许非只读模式的修改请求', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-006',
        user_id: 'user-123',
        trip_id: 'trip-456',
        message: '修改第2天的行程',
        options: {
          entry_point: 'trip_list_page',
          readonly_mode: false, // 非只读模式
        },
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
      expect(mockRouterService.route).toHaveBeenCalled();
    });
  });

  describe('isModificationRequest() 方法测试', () => {
    it('应该识别中文修改关键词', async () => {
      const testCases = [
        { message: '修改第2天的行程', expected: true },
        { message: '删除这个POI', expected: true },
        { message: '添加一个新的景点', expected: true },
        { message: '更新行程信息', expected: true },
        { message: '调整时间安排', expected: true },
      ];

      for (const testCase of testCases) {
        const request: RouteAndRunRequestDto = {
          request_id: `test-${Date.now()}`,
          user_id: 'user-123',
          trip_id: 'trip-456',
          message: testCase.message,
          options: {
            entry_point: 'trip_detail_page',
            readonly_mode: true,
          },
        };

        const response = await agentService.routeAndRun(request);
        expect(response.result.status === 'REDIRECT_REQUIRED').toBe(testCase.expected);
      }
    });

    it('应该识别英文修改关键词', async () => {
      const testCases = [
        { message: 'modify day 2', expected: true },
        { message: 'delete this POI', expected: true },
        { message: 'add a new place', expected: true },
        { message: 'update the itinerary', expected: true },
        { message: 'change the schedule', expected: true },
      ];

      for (const testCase of testCases) {
        const request: RouteAndRunRequestDto = {
          request_id: `test-${Date.now()}`,
          user_id: 'user-123',
          trip_id: 'trip-456',
          message: testCase.message,
          options: {
            entry_point: 'trip_detail_page',
            readonly_mode: true,
          },
        };

        const response = await agentService.routeAndRun(request);
        expect(response.result.status === 'REDIRECT_REQUIRED').toBe(testCase.expected);
      }
    });

    it('应该区分查询和修改意图', async () => {
      const testCases = [
        { message: '查询修改后的行程', expected: false }, // 查询意图更强
        { message: '查看修改记录', expected: false }, // 查询意图更强
        { message: '显示修改内容', expected: false }, // 查询意图更强
        { message: '修改行程并查看', expected: true }, // 修改意图更强
      ];

      for (const testCase of testCases) {
        const request: RouteAndRunRequestDto = {
          request_id: `test-${Date.now()}`,
          user_id: 'user-123',
          trip_id: 'trip-456',
          message: testCase.message,
          options: {
            entry_point: 'trip_detail_page',
            readonly_mode: true,
          },
        };

        const response = await agentService.routeAndRun(request);
        expect(response.result.status === 'REDIRECT_REQUIRED').toBe(testCase.expected);
      }
    });
  });
});
