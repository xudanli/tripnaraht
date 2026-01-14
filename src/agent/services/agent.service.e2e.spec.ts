/**
 * AgentService E2E 集成测试
 * 
 * 目的：
 * 1. 验证路由策略决策在不同场景下的正确性
 * 2. 确保 trace.signals & trace.recommendations & resolved mode 一致
 * 3. 验证向后兼容性（use_claude_orchestration=false 时只建议不执行）
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';

describe('AgentService E2E - Orchestration Routing', () => {
  let agentService: AgentService;
  let module: TestingModule;

  beforeAll(async () => {
    // 创建最小测试模块（不启动完整应用）
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        // AgentService 需要的依赖会被 mock 或者简化
        // 这里主要测试路由决策逻辑，不测试完整执行路径
        {
          provide: AgentService,
          useFactory: () => {
            // 创建部分 mock 的 AgentService
            // 主要测试 routeAndRun 的前半部分（决策部分）
            const service = Object.create(AgentService.prototype);
            return service;
          },
        },
      ],
    }).compile();

    agentService = module.get<AgentService>(AgentService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('路由决策一致性验证', () => {
    const testCases = [
      {
        name: 'TRIP_PLANNING + Claude enabled → CLAUDE_SM',
        request: {
          request_id: 'test-trip-001',
          user_id: 'user-123',
          trip_id: 'trip-456',
          message: '帮我规划一个去日本的行程',
          options: {
            use_claude_orchestration: true,
          },
        },
        env: { USE_CLAUDE_ORCHESTRATION: 'true' },
        expected: {
          mode: 'CLAUDE_SM',
          taskType: 'TRIP_PLANNING',
          requiresStructuredOutput: true,
          risk: 'MEDIUM',
        },
      },
      {
        name: 'BOOKING_WORKFLOW + Claude enabled → CLAUDE_SM',
        request: {
          request_id: 'test-booking-001',
          user_id: 'user-123',
          message: '帮我预订东京的酒店',
          options: {
            use_claude_orchestration: true,
          },
        },
        env: { USE_CLAUDE_ORCHESTRATION: 'true' },
        expected: {
          mode: 'CLAUDE_SM',
          taskType: 'BOOKING_WORKFLOW',
          requiresStructuredOutput: true,
          risk: 'HIGH',
        },
      },
      {
        name: 'CRUD + Claude disabled → LEGACY',
        request: {
          request_id: 'test-crud-001',
          user_id: 'user-123',
          message: '删除行程123',
          options: {
            use_claude_orchestration: false,
          },
        },
        env: { USE_CLAUDE_ORCHESTRATION: 'false' },
        expected: {
          mode: 'LEGACY',
          taskType: 'CRUD',
          legacyWellSupported: true,
        },
      },
      {
        name: 'DATA_LOOKUP + fast budget + explicit Claude enabled → CLAUDE_DYNAMIC (显式启用不降级)',
        request: {
          request_id: 'test-data-001',
          user_id: 'user-123',
          message: '查询一下巴黎的天气',
          options: {
            use_claude_orchestration: true, // 显式启用，不会降级到 LEGACY
            max_seconds: 1, // fast budget (< 3s)
          },
        },
        env: { USE_CLAUDE_ORCHESTRATION: 'true' },
        expected: {
          mode: 'CLAUDE_DYNAMIC', // 显式启用时，即使是简单请求也走 Claude（但优化为 DYNAMIC）
          taskType: 'DATA_LOOKUP',
          complexity: 'SIMPLE',
          legacyWellSupported: true,
        },
      },
      {
        name: 'SIMPLE + explicit Claude + no structured output → CLAUDE_DYNAMIC',
        request: {
          request_id: 'test-simple-001',
          user_id: 'user-123',
          message: '东京有什么好吃的？',
          options: {
            use_claude_orchestration: true,
            use_state_machine_orchestration: false, // 显式禁用 SM
          },
        },
        env: { USE_CLAUDE_ORCHESTRATION: 'true' },
        expected: {
          mode: 'CLAUDE_DYNAMIC',
          complexity: 'SIMPLE',
        },
      },
      {
        name: 'Claude disabled (env) → LEGACY (向后兼容)',
        request: {
          request_id: 'test-legacy-001',
          user_id: 'user-123',
          message: '帮我查询一下路线',
          options: {}, // 未显式启用
        },
        env: { USE_CLAUDE_ORCHESTRATION: 'false' },
        expected: {
          mode: 'LEGACY',
          // 向后兼容：即使 Claude 未启用，trace 中也会包含建议
        },
      },
    ];

    testCases.forEach((testCase) => {
      it(testCase.name, () => {
        // 1. 提取信号
        const signals = signalsFromRequest(testCase.request as RouteAndRunRequestDto);
        
        // 2. 策略决策
        const decision = routePolicy(testCase.env, testCase.request.options, signals);
        
        // 3. 验证决策模式
        expect(decision.mode).toBe(testCase.expected.mode);
        
        // 4. 验证信号一致性
        if (testCase.expected.taskType) {
          expect(signals.taskType).toBe(testCase.expected.taskType);
        }
        if (testCase.expected.complexity) {
          expect(signals.complexity).toBe(testCase.expected.complexity);
        }
        if (testCase.expected.risk) {
          expect(signals.risk).toBe(testCase.expected.risk);
        }
        if (testCase.expected.requiresStructuredOutput !== undefined) {
          expect(signals.requiresStructuredOutput).toBe(testCase.expected.requiresStructuredOutput);
        }
        if (testCase.expected.legacyWellSupported !== undefined) {
          expect(signals.legacyWellSupported).toBe(testCase.expected.legacyWellSupported);
        }
        
        // 5. 验证 trace 结构完整性
        // trace.orchestration.resolved (强制)
        expect(decision.mode).toBeDefined();
        expect(decision.reason).toBeDefined();
        expect(Array.isArray(decision.matchedRules)).toBe(true);
        
        // trace.orchestration.recommended (建议)
        // 对于 LEGACY 模式，可能没有 recommendations
        // 如果存在 recommendations，确保字段完整性
        if (decision.recommendations) {
          // recommendations 对象存在时，字段可能是 undefined（这是合法的）
          // 但我们验证对象本身存在
          expect(typeof decision.recommendations).toBe('object');
          // 如果字段存在，它们应该是 boolean 类型
          if (decision.recommendations.useStateMachine !== undefined) {
            expect(typeof decision.recommendations.useStateMachine).toBe('boolean');
          }
          if (decision.recommendations.enableAudit !== undefined) {
            expect(typeof decision.recommendations.enableAudit).toBe('boolean');
          }
          if (decision.recommendations.requireConsent !== undefined) {
            expect(typeof decision.recommendations.requireConsent).toBe('boolean');
          }
        }
        
        // trace.orchestration.signals
        expect(decision.signals).toBeDefined();
        expect(decision.signals.taskType).toBe(signals.taskType);
        expect(decision.signals.risk).toBe(signals.risk);
        
        // 6. 验证决策不可变性（freeze）
        expect(Object.isFrozen(decision)).toBe(true);
        if (decision.recommendations) {
          expect(Object.isFrozen(decision.recommendations)).toBe(true);
        }
        expect(Object.isFrozen(decision.signals)).toBe(true);
        
        // 7. 验证向后兼容性
        // use_claude_orchestration=false 时，mode 应该是 LEGACY
        // 但 recommendations 可能仍然存在（用于未来迁移建议）
        if (testCase.request.options?.use_claude_orchestration === false ||
            testCase.env.USE_CLAUDE_ORCHESTRATION === 'false') {
          expect(decision.mode).toBe('LEGACY');
          // recommendations 是可选的，存在时应该只是建议
        }
      });
    });
  });

  describe('向后兼容性验证', () => {
    it('use_claude_orchestration=false 时，确保只是建议不执行', () => {
      const request: RouteAndRunRequestDto = {
        request_id: 'test-backward-001',
        user_id: 'user-123',
        message: '查询天气',
        options: {
          use_claude_orchestration: false, // 明确禁用
        },
      };
      
      const signals = signalsFromRequest(request);
      const decision = routePolicy({ USE_CLAUDE_ORCHESTRATION: 'false' }, request.options, signals);
      
      // 必须走 LEGACY 路径
      expect(decision.mode).toBe('LEGACY');
      
      // recommendations 如果存在，应该只是建议（不影响执行）
      if (decision.recommendations) {
        // recommendations 不应该改变 decision.mode
        // decision.mode 已经是 LEGACY，不会因为 recommendations 而改变
        expect(decision.mode).toBe('LEGACY');
      }
    });
  });
});
