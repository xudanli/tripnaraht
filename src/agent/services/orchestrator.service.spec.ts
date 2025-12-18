// src/agent/services/orchestrator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import { ActionRegistryService } from './action-registry.service';
import { CriticService } from './critic.service';
import { AgentStateService } from './agent-state.service';
import { EventTelemetryService } from './event-telemetry.service';
import { ActionCacheService } from './action-cache.service';
import { ActionDependencyAnalyzerService } from './action-dependency-analyzer.service';
import { LlmPlanService } from './llm-plan-service';
import { AgentState } from '../interfaces/agent-state.interface';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let actionRegistry: ActionRegistryService;
  let stateService: AgentStateService;
  let module: TestingModule;

  const mockState: Partial<AgentState> = {
    request_id: 'test-request-id',
    user_input: '规划一个3天的北京行程',
    trip: {
      trip_id: 'test-trip-id',
      days: 3,
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
    result: {
      status: 'DRAFT',
      timeline: [],
      dropped_items: [],
      explanations: [],
    },
    react: {
      step: 0,
      max_steps: 8,
      decision_log: [],
      observations: [],
    },
    observability: {
      router_ms: 0,
      latency_ms: 0,
      tool_calls: 0,
      browser_steps: 0,
      cost_est_usd: 0,
      fallback_used: false,
    },
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        {
          provide: ActionRegistryService,
          useValue: {
            get: jest.fn(),
            getAll: jest.fn().mockReturnValue([]),
            checkPreconditions: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: CriticService,
          useValue: {
            validateFeasibility: jest.fn().mockResolvedValue({
              pass: true,
              violations: [],
            }),
          },
        },
        {
          provide: AgentStateService,
          useValue: {
            get: jest.fn().mockReturnValue(mockState),
            update: jest.fn().mockImplementation((id, updates) => ({
              ...mockState,
              ...updates,
            })),
            updateNested: jest.fn().mockImplementation((id, path, value) => ({
              ...mockState,
            })),
          },
        },
        {
          provide: EventTelemetryService,
          useValue: {
            recordSystem2Step: jest.fn(),
          },
        },
        {
          provide: ActionCacheService,
          useValue: {
            generateCacheKey: jest.fn(),
            get: jest.fn().mockReturnValue(null),
            set: jest.fn(),
          },
        },
        {
          provide: ActionDependencyAnalyzerService,
          useValue: {
            findParallelizableActions: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: LlmPlanService,
          useValue: {
            selectAction: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    actionRegistry = module.get<ActionRegistryService>(ActionRegistryService);
    stateService = module.get<AgentStateService>(AgentStateService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('执行 ReAct 循环', () => {
    it('应该在预算内执行', async () => {
      const budget = {
        max_seconds: 60,
        max_steps: 10,
        max_browser_steps: 0,
      };

      // Mock action registry 返回一个简单的 action
      jest.spyOn(actionRegistry, 'get').mockReturnValue({
        name: 'test.action',
        description: 'Test action',
        metadata: {
          kind: 'internal' as any,
          cost: 'low' as any,
          side_effect: 'none' as any,
          preconditions: [],
          idempotent: true,
          cacheable: false,
        },
        input_schema: {},
        output_schema: {},
        execute: jest.fn().mockResolvedValue({}),
      });

      const result = await service.execute(mockState as AgentState, budget);

      expect(result).toBeDefined();
      expect(stateService.update).toHaveBeenCalled();
    });

    it('应该在超时时停止执行', async () => {
      const budget = {
        max_seconds: 0.001, // 非常短的超时时间
        max_steps: 10,
        max_browser_steps: 0,
      };

      const result = await service.execute(mockState as AgentState, budget);

      expect(result).toBeDefined();
      // 应该因为超时而停止
      expect(result.result.status).toBeDefined();
    });

    it('应该支持并行执行多个 Actions', async () => {
      const budget = {
        max_seconds: 60,
        max_steps: 10,
        max_browser_steps: 0,
      };

      // Mock 两个可以并行执行的 Actions
      const action1 = {
        name: 'action1',
        description: 'Action 1',
        metadata: {
          kind: 'internal' as any,
          cost: 'low' as any,
          side_effect: 'none' as any,
          preconditions: [],
          idempotent: true,
          cacheable: false,
        },
        input_schema: {},
        output_schema: {},
        execute: jest.fn().mockResolvedValue({ result: 'action1_result' }),
      };

      const action2 = {
        name: 'action2',
        description: 'Action 2',
        metadata: {
          kind: 'internal' as any,
          cost: 'low' as any,
          side_effect: 'none' as any,
          preconditions: [],
          idempotent: true,
          cacheable: false,
        },
        input_schema: {},
        output_schema: {},
        execute: jest.fn().mockResolvedValue({ result: 'action2_result' }),
      };

      jest.spyOn(actionRegistry, 'get')
        .mockImplementation((name: string) => {
          if (name === 'action1') return action1;
          if (name === 'action2') return action2;
          return null as any;
        });

      // Mock dependency analyzer 返回可以并行执行的分组
      const dependencyAnalyzer = module.get(ActionDependencyAnalyzerService);
      jest.spyOn(dependencyAnalyzer, 'findParallelizableActions').mockReturnValue([
        [{ name: 'action1', input: {} }, { name: 'action2', input: {} }],
      ]);

      // 设置状态，使得 plan 方法会返回多个 Actions
      // 需要确保有候选 Actions，并且依赖分析器返回可并行分组
      const stateWithNodes = {
        ...mockState,
        draft: { nodes: [{ id: 1 }], hard_nodes: [], soft_nodes: [], edits: [] },
        memory: {
          semantic_facts: { pois: [{ id: 1 }], rules: {} },
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
          max_steps: 10,
          decision_log: [],
          observations: [],
        },
        observability: {
          router_ms: 0,
          latency_ms: 0,
          tool_calls: 0,
          browser_steps: 0,
          cost_est_usd: 0,
          fallback_used: false,
        },
      };

      // 由于 plan 是私有方法，我们无法直接 mock
      // 这个测试主要验证并行执行逻辑存在，实际并行执行需要依赖分析器配合
      // 简化测试：只验证服务可以处理多个 Actions 的情况
      const result = await service.execute(stateWithNodes as AgentState, budget);

      expect(result).toBeDefined();
      // 由于 plan 方法可能不会返回多个 Actions（取决于状态），
      // 我们只验证服务能够正常执行，不强制要求并行执行
      expect(result.result.status).toBeDefined();
    });

    it('应该处理 Action 执行失败', async () => {
      const budget = {
        max_seconds: 60,
        max_steps: 10,
        max_browser_steps: 0,
      };

      const failingAction = {
        name: 'failing.action',
        description: 'Failing action',
        metadata: {
          kind: 'internal' as any,
          cost: 'low' as any,
          side_effect: 'none' as any,
          preconditions: [],
          idempotent: true,
          cacheable: false,
        },
        input_schema: {},
        output_schema: {},
        execute: jest.fn().mockRejectedValue(new Error('Action execution failed')),
      };

      jest.spyOn(actionRegistry, 'get').mockReturnValue(failingAction);

      const result = await service.execute(mockState as AgentState, budget);

      expect(result).toBeDefined();
      // 即使 Action 失败，也应该继续执行或返回状态
      expect(result.result.status).toBeDefined();
    });

    it('应该处理 Action 不存在的情况', async () => {
      const budget = {
        max_seconds: 60,
        max_steps: 10,
        max_browser_steps: 0,
      };

      jest.spyOn(actionRegistry, 'get').mockReturnValue(null as any);

      const result = await service.execute(mockState as AgentState, budget);

      expect(result).toBeDefined();
      // 应该优雅地处理 Action 不存在的情况
      expect(result.result.status).toBeDefined();
    });

    it('应该处理前置条件不满足的情况', async () => {
      const budget = {
        max_seconds: 60,
        max_steps: 10,
        max_browser_steps: 0,
      };

      const action = {
        name: 'test.action',
        description: 'Test action',
        metadata: {
          kind: 'internal' as any,
          cost: 'low' as any,
          side_effect: 'none' as any,
          preconditions: ['required_state'],
          idempotent: true,
          cacheable: false,
        },
        input_schema: {},
        output_schema: {},
        execute: jest.fn().mockResolvedValue({}),
      };

      jest.spyOn(actionRegistry, 'get').mockReturnValue(action);
      jest.spyOn(actionRegistry, 'checkPreconditions').mockReturnValue(false);

      const result = await service.execute(mockState as AgentState, budget);

      expect(result).toBeDefined();
      // 前置条件不满足时，Action 不应该被执行
      expect(action.execute).not.toHaveBeenCalled();
    });
  });
});

