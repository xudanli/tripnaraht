/**
 * AgentService 规划请求拦截 - 集成测试
 * 
 * 测试从统一入口拦截规划请求并重定向到规划工作台的完整流程
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
import { PlanningWorkbenchAgentService } from './planning-workbench-agent.service';
import { ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS } from '../memory/testing/route-and-run-memory.providers';

describe('AgentService - Planning Request Interception (Integration)', () => {
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

  const mockPlanningWorkbenchAgent = {
    execute: jest.fn(),
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
        {
          provide: PlanningWorkbenchAgentService,
          useValue: mockPlanningWorkbenchAgent,
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

  describe('端到端流程测试', () => {
    it('应该拦截规划请求并返回正确的重定向响应', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-001',
        user_id: 'user-123',
        message: '规划一个5天冰岛行程',
      };

      const response = await agentService.routeAndRun(request);

      // 验证重定向状态
      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      expect(response.route.reasons).toContain(RouterReason.REDIRECT_TO_PLANNING_WORKBENCH);
      expect(response.route.ui_hint.status).toBe(UIStatus.REDIRECT_REQUIRED);

      // 验证重定向信息
      expect(response.result.payload.redirectInfo).toBeDefined();
      expect(response.result.payload.redirectInfo?.redirect_to).toBe('/dashboard/plan-studio');
      expect(response.result.payload.redirectInfo?.redirect_reason).toBe('PLANNING_REQUEST_DETECTED');
      expect(response.result.payload.redirectInfo?.original_request.message).toBe('规划一个5天冰岛行程');
      expect(response.result.payload.redirectInfo?.original_request.user_id).toBe('user-123');

      // 验证不应该调用 RouterService（因为被提前拦截）
      expect(mockRouterService.route).not.toHaveBeenCalled();
      expect(mockSystem1Executor.execute).not.toHaveBeenCalled();
      expect(mockOrchestrator.execute).not.toHaveBeenCalled();
    });

    it('应该允许已有 trip_id 的请求正常通过', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-002',
        user_id: 'user-123',
        trip_id: 'trip-456',
        message: '修改第2天的行程',
      };

      // Mock RouterService 返回正常路由
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

      // Mock Orchestrator 返回结果
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

      // 验证不应该被拦截
      expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      
      // 验证正常流程被调用
      expect(mockRouterService.route).toHaveBeenCalled();
      expect(mockOrchestrator.execute).toHaveBeenCalled();
    });

    it('应该正确处理白名单关键词（查询规划）', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-003',
        user_id: 'user-123',
        trip_id: 'trip-456', // 添加 trip_id，因为现在统一入口强制要求 trip_id
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

      // 验证不应该被拦截（白名单）
      expect(response.result.status).not.toBe('REDIRECT_REQUIRED');
      expect(mockRouterService.route).toHaveBeenCalled();
    });
  });

  describe('重定向响应完整性测试', () => {
    it('重定向响应应该包含所有必需字段', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-004',
        user_id: 'user-123',
        message: '帮我设计一个日本7天行程',
      };

      const response = await agentService.routeAndRun(request);

      // 验证基本结构
      expect(response.request_id).toBe('integration-test-004');
      expect(response.route).toBeDefined();
      expect(response.result).toBeDefined();
      expect(response.explain).toBeDefined();
      expect(response.observability).toBeDefined();

      // 验证 route 字段
      expect(response.route.route).toBe(RouteType.SYSTEM2_REASONING);
      expect(response.route.confidence).toBe(1.0);
      expect(response.route.reasons).toContain(RouterReason.REDIRECT_TO_PLANNING_WORKBENCH);
      expect(response.route.ui_hint.status).toBe(UIStatus.REDIRECT_REQUIRED);

      // 验证 result 字段
      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      expect(response.result.answer_text).toContain('规划工作台');
      expect(response.result.payload.redirectInfo).toBeDefined();

      // 验证 explain 字段
      expect(response.explain.decision_log).toBeDefined();
      expect(response.explain.decision_log.length).toBeGreaterThan(0);
      expect(response.explain.decision_log[0].inputs_summary).toContain('规划请求');

      // 验证 observability 字段
      expect(response.observability.system_mode).toBe('REDIRECT');
      expect(response.observability.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('性能测试', () => {
    it('重定向响应应该在合理时间内返回（< 100ms）', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-005',
        user_id: 'user-123',
        message: '规划一个行程',
      };

      const startTime = Date.now();
      const response = await agentService.routeAndRun(request);
      const latency = Date.now() - startTime;

      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      expect(latency).toBeLessThan(100); // 重定向应该非常快
    });
  });

  describe('边界情况测试', () => {
    it('应该处理包含规划关键词但无 trip_id 的复杂消息', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-006',
        user_id: 'user-123',
        message: '我想规划一个去冰岛的自驾游，大概7天，预算2万以内，不要太累',
      };

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).toBe('REDIRECT_REQUIRED');
      expect(response.result.payload.redirectInfo?.original_request.message).toBe(request.message);
    });

    it('应该处理英文规划请求', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'integration-test-007',
        user_id: 'user-123',
        message: 'I want to plan a 5-day trip to Iceland',
      };

      const response = await agentService.routeAndRun(request);

      expect(response.result.status).toBe('REDIRECT_REQUIRED');
    });
  });
});
