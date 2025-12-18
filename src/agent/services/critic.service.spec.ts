// src/agent/services/critic.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CriticService } from './critic.service';
import { FeasibilityService } from '../../planning-policy/services/feasibility.service';
import { EventTelemetryService } from './event-telemetry.service';
import { AgentState } from '../interfaces/agent-state.interface';

describe('CriticService', () => {
  let service: CriticService;
  let feasibilityService: FeasibilityService;

  const mockState: Partial<AgentState> = {
    request_id: 'test-request-id',
    user_input: 'test input',
    trip: {
      trip_id: 'test-trip-id',
      days: 1,
      day_boundaries: [
        { start: '09:00', end: '22:00' },
      ],
      lunch_break: {
        enabled: false,
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
    result: {
      status: 'DRAFT',
      timeline: [
        {
          type: 'NODE',
          start: '10:00',
          end: '11:00',
        },
      ],
      dropped_items: [],
      explanations: [],
    },
    memory: {
      semantic_facts: {
        pois: [],
        rules: {},
      },
      episodic_snippets: [],
      user_profile: {
        policy: {
          day_boundaries: [
            { start: '09:00', end: '22:00' },
          ],
          lunch_time: { start: '12:00', end: '14:00' },
        },
      },
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
      max_steps: 8,
      observations: [],
      decision_log: [],
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriticService,
        {
          provide: FeasibilityService,
          useValue: {
            validate: jest.fn().mockResolvedValue({
              pass: true,
              violations: [],
            }),
          },
        },
        {
          provide: EventTelemetryService,
          useValue: {
            recordCriticResult: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CriticService>(CriticService);
    feasibilityService = module.get<FeasibilityService>(FeasibilityService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('验证可行性', () => {
    it('应该验证行程可行性', async () => {
      const result = await service.validateFeasibility(mockState as AgentState);

      expect(result).toBeDefined();
      expect(result.pass).toBeDefined();
      expect(result.violations).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
    });

    it('应该在通过时返回 pass=true', async () => {
      jest.spyOn(feasibilityService, 'validate').mockResolvedValue({
        pass: true,
        violations: [],
      });

      // 设置 time_matrix_robust 以避免 ROBUST_TIME_MISSING violation
      const testState = {
        ...mockState,
        compute: {
          ...mockState.compute,
          time_matrix_robust: [[0, 10], [10, 0]], // 设置一个非 null 值
        },
      } as AgentState;

      const result = await service.validateFeasibility(testState);

      expect(result.pass).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('应该在违反规则时返回 pass=false', async () => {
      jest.spyOn(feasibilityService, 'validate').mockResolvedValue({
        pass: false,
        violations: [
          {
            type: 'TIME_WINDOW_VIOLATION',
            message: '时间窗违反',
          },
        ],
      });

      const result = await service.validateFeasibility(mockState as AgentState);

      expect(result.pass).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});

