// src/agent/services/agent.service.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { RouteType } from '../interfaces/router.interface';

/**
 * Agent Service 集成测试
 * 
 * 测试完整的路由和执行流程
 */
describe('AgentService Integration', () => {
  let service: AgentService;
  let routerService: RouterService;
  let stateService: AgentStateService;
  let testingModule: TestingModule;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: RouterService,
          useValue: {
            route: jest.fn(),
          },
        },
        {
          provide: AgentStateService,
          useValue: {
            createInitialState: jest.fn(),
            update: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: System1ExecutorService,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: OrchestratorService,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: EventTelemetryService,
          useValue: {
            recordRouterDecision: jest.fn(),
            recordWebbrowseBlocked: jest.fn(),
            recordFallbackTriggered: jest.fn(),
            recordAgentComplete: jest.fn(),
          },
        },
        {
          provide: RequestDeduplicationService,
          useValue: {
            generateRequestHash: jest.fn(),
            checkDuplicate: jest.fn().mockReturnValue(null),
            cacheResponse: jest.fn(),
          },
        },
      ],
    }).compile();

    service = testingModule.get<AgentService>(AgentService);
    routerService = testingModule.get<RouterService>(RouterService);
    stateService = testingModule.get<AgentStateService>(AgentStateService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('路由和执行流程', () => {
    it('应该处理 SYSTEM1_API 路由', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-request-id',
        user_id: 'test-user-id',
        trip_id: 'test-trip-id',
        message: '删除清水寺',
        conversation_context: {},
        options: {},
      };

      const mockState = {
        request_id: 'test-request-id',
        user_input: '删除清水寺',
        trip: { trip_id: 'test-trip-id', days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 60, window: ['', ''] }, pacing: 'normal' },
        draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
        memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
        compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
        react: { step: 0, max_steps: 8, observations: [], decision_log: [] },
        result: { status: 'DRAFT', timeline: [], dropped_items: [], explanations: [] },
        observability: { router_ms: 0, latency_ms: 0, tool_calls: 0, browser_steps: 0, cost_est_usd: 0, fallback_used: false },
      };

      jest.spyOn(stateService, 'createInitialState').mockReturnValue(mockState as any);
      jest.spyOn(stateService, 'update').mockReturnValue(mockState as any);
      jest.spyOn(routerService, 'route').mockResolvedValue({
        route: RouteType.SYSTEM1_API,
        confidence: 0.85,
        reasons: [],
        required_capabilities: ['places', 'trips'],
        consent_required: false,
        budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
        ui_hint: { mode: 'fast', status: 'thinking', message: '正在处理...' },
      });

      const system1Executor = testingModule.get(System1ExecutorService);
      jest.spyOn(system1Executor, 'execute').mockResolvedValue({
        success: true,
        result: { action: 'delete', target: '清水寺', resolved: true },
        answerText: '已删除清水寺',
      });

      const result = await service.routeAndRun(request);

      expect(result).toBeDefined();
      expect(result.route.route).toBe(RouteType.SYSTEM1_API);
      // System1Executor 返回 success: true 时，状态应该是 READY，映射为 OK
      expect(['OK', 'NEED_MORE_INFO']).toContain(result.result.status);
    });

    it('应该处理 SYSTEM2_WEBBROWSE 路由（有授权）', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-request-id',
        user_id: 'test-user-id',
        trip_id: null,
        message: '查一下 https://example.com 这个网站',
        conversation_context: {},
        options: {
          allow_webbrowse: true,
        },
      };

      const mockState = {
        request_id: 'test-request-id',
        user_input: '查一下 https://example.com 这个网站',
        trip: { trip_id: null, days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 60, window: ['', ''] }, pacing: 'normal' },
        draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
        memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
        compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
        react: { step: 0, max_steps: 8, observations: [], decision_log: [] },
        result: { status: 'DRAFT', timeline: [], dropped_items: [], explanations: [] },
        observability: { router_ms: 0, latency_ms: 0, tool_calls: 0, browser_steps: 0, cost_est_usd: 0, fallback_used: false },
      };

      jest.spyOn(stateService, 'createInitialState').mockReturnValue(mockState as any);
      jest.spyOn(stateService, 'update').mockReturnValue(mockState as any);
      jest.spyOn(routerService, 'route').mockResolvedValue({
        route: RouteType.SYSTEM2_WEBBROWSE,
        confidence: 0.9,
        reasons: [],
        required_capabilities: ['browser'],
        consent_required: true,
        budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 12 },
        ui_hint: { mode: 'slow', status: 'awaiting_consent', message: '此操作需要您的确认' },
      });

      const orchestrator = testingModule.get(OrchestratorService);
      jest.spyOn(orchestrator, 'execute').mockResolvedValue({
        ...mockState,
        result: { status: 'READY', timeline: [], dropped_items: [], explanations: [] },
        observability: { ...mockState.observability, browser_steps: 1 },
      } as any);

      const result = await service.routeAndRun(request);

      expect(result).toBeDefined();
      expect(result.route.route).toBe(RouteType.SYSTEM2_WEBBROWSE);
      expect(orchestrator.execute).toHaveBeenCalled();
    });

    it('应该处理 SYSTEM2_WEBBROWSE 路由（无授权，降级）', async () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-request-id',
        user_id: 'test-user-id',
        trip_id: null,
        message: '查一下这个网站',
        conversation_context: {},
        options: {
          allow_webbrowse: false,
        },
      };

      const mockState = {
        request_id: 'test-request-id',
        user_input: '查一下这个网站',
        trip: { trip_id: null, days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 60, window: ['', ''] }, pacing: 'normal' },
        draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
        memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
        compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
        react: { step: 0, max_steps: 8, observations: [], decision_log: [] },
        result: { status: 'DRAFT', timeline: [], dropped_items: [], explanations: [] },
        observability: { router_ms: 0, latency_ms: 0, tool_calls: 0, browser_steps: 0, cost_est_usd: 0, fallback_used: false },
      };

      jest.spyOn(stateService, 'createInitialState').mockReturnValue(mockState as any);
      jest.spyOn(stateService, 'update').mockReturnValue(mockState as any);
      jest.spyOn(routerService, 'route').mockResolvedValue({
        route: RouteType.SYSTEM2_WEBBROWSE,
        confidence: 0.9,
        reasons: [],
        required_capabilities: ['browser'],
        consent_required: true,
        budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 12 },
        ui_hint: { mode: 'slow', status: 'awaiting_consent', message: '此操作需要您的确认' },
      });

      const orchestrator = testingModule.get(OrchestratorService);
      jest.spyOn(orchestrator, 'execute').mockResolvedValue({
        ...mockState,
        result: { status: 'READY', timeline: [], dropped_items: [], explanations: [] },
      } as any);

      const result = await service.routeAndRun(request);

      expect(result).toBeDefined();
      // 应该降级到 SYSTEM2_REASONING
      expect(result.route.route).toBe(RouteType.SYSTEM2_REASONING);
      expect(orchestrator.execute).toHaveBeenCalled();
    });
  });
});

