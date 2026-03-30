// src/agent/utils/orchestration-policy.util.spec.ts

import { routePolicy } from './orchestration-policy.util';
import { RoutingSignals, signalsFromRequest } from './orchestration-signals.util';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('routePolicy - 决策真值表测试', () => {
  // 测试用例表
  const testCases: Array<{
    name: string;
    env: NodeJS.ProcessEnv;
    options: any;
    signals: Partial<RoutingSignals>;
    expected: {
      mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
      requireConsent?: boolean;
      enableAudit?: boolean;
    };
  }> = [
    // ==================== Claude disabled → always LEGACY ====================
    {
      name: 'Claude disabled (env=false, options=undefined) → LEGACY',
      env: { USE_CLAUDE_ORCHESTRATION: 'false' },
      options: undefined,
      signals: {
        taskType: 'TRIP_PLANNING',
        complexity: 'COMPLEX',
        requiresStructuredOutput: true,
        expectsToolCalls: true,
      },
      expected: { mode: 'LEGACY' },
    },
    {
      name: 'Claude disabled (env=undefined, options=false) → LEGACY',
      env: {},
      options: { use_claude_orchestration: false },
      signals: {
        taskType: 'TRIP_PLANNING',
      },
      expected: { mode: 'LEGACY' },
    },

    // ==================== Claude enabled + SM enabled + TRIP_PLANNING → SM ====================
    {
      name: 'Claude enabled + SM enabled + TRIP_PLANNING → CLAUDE_SM',
      env: { USE_CLAUDE_ORCHESTRATION: 'true' },
      options: { use_state_machine_orchestration: true },
      signals: {
        taskType: 'TRIP_PLANNING',
        complexity: 'COMPLEX',
        requiresStructuredOutput: true,
        expectsToolCalls: true,
      },
      expected: { mode: 'CLAUDE_SM' },
    },
    {
      name: 'Claude enabled + SM default (true) + TRIP_PLANNING → CLAUDE_SM',
      env: { USE_CLAUDE_ORCHESTRATION: 'true' },
      options: undefined, // 默认 use_state_machine_orchestration = true
      signals: {
        taskType: 'TRIP_PLANNING',
        complexity: 'MODERATE',
        requiresStructuredOutput: true,
        expectsToolCalls: true,
      },
      expected: { mode: 'CLAUDE_SM' },
    },

    // ==================== Claude enabled + SM disabled + TRIP_PLANNING → Dynamic ====================
    {
      name: 'Claude enabled + SM disabled + TRIP_PLANNING → CLAUDE_DYNAMIC',
      env: { USE_CLAUDE_ORCHESTRATION: 'true' },
      options: { use_state_machine_orchestration: false },
      signals: {
        taskType: 'TRIP_PLANNING',
        complexity: 'COMPLEX',
      },
      expected: { mode: 'CLAUDE_DYNAMIC' },
    },

    // ==================== 硬规则 C: 简单请求不走 SM ====================
    {
      name: 'SIMPLE + fast budget + legacyWellSupported → LEGACY (even if Claude enabled)',
      env: { USE_CLAUDE_ORCHESTRATION: 'true' },
      options: undefined, // 未显式启用
      signals: {
        taskType: 'DATA_LOOKUP',
        complexity: 'SIMPLE',
        legacyWellSupported: true,
        latencyBudgetMs: 2000, // fast budget
        requiresStructuredOutput: false,
      },
      expected: { mode: 'LEGACY' },
    },
    {
      name: 'SIMPLE but explicitly enabled Claude → CLAUDE_DYNAMIC (optimized)',
      env: { USE_CLAUDE_ORCHESTRATION: 'true' },
      options: { use_claude_orchestration: true }, // 显式启用
      signals: {
        taskType: 'DATA_LOOKUP',
        complexity: 'SIMPLE',
        legacyWellSupported: true,
        latencyBudgetMs: 2000,
        requiresStructuredOutput: false, // 不需要结构化输出
      },
      expected: { mode: 'CLAUDE_DYNAMIC' }, // 显式启用但简单任务优化为 DYNAMIC
    },
    {
      name: 'SIMPLE + explicit Claude + requiresStructuredOutput → CLAUDE_SM',
      env: { USE_CLAUDE_ORCHESTRATION: 'true' },
      options: { use_claude_orchestration: true }, // 显式启用
      signals: {
        taskType: 'DATA_LOOKUP',
        complexity: 'SIMPLE',
        legacyWellSupported: true,
        latencyBudgetMs: 2000,
        requiresStructuredOutput: true, // 需要结构化输出
        expectsToolCalls: true,
      },
      expected: { mode: 'CLAUDE_SM' }, // 需要结构化输出时走 SM
    },

    // ==================== dry_run=true → needsAudit=false ====================
    {
      name: 'dry_run=true → enableAudit=false',
      env: {},
      options: { dry_run: true },
      signals: {
        taskType: 'TRIP_PLANNING',
        needsAudit: true, // signals 建议 audit
      },
      expected: { mode: 'LEGACY', enableAudit: false },
    },

    // ==================== Consent 边界测试 ====================
    {
      name: 'allow_webbrowse=false + timeSensitive + expectsToolCalls → requireConsent=true',
      env: {},
      options: { allow_webbrowse: false },
      signals: {
        taskType: 'TRIP_PLANNING',
        expectsToolCalls: true,
      },
      expected: { mode: 'LEGACY', requireConsent: true },
    },
    {
      name: 'allow_webbrowse=true → requireConsent=false',
      env: {},
      options: { allow_webbrowse: true },
      signals: {
        taskType: 'BOOKING_WORKFLOW',
        expectsToolCalls: true,
      },
      expected: { mode: 'LEGACY', requireConsent: false },
    },
    {
      name: 'no webbrowse needed → requireConsent=false',
      env: {},
      options: { allow_webbrowse: false },
      signals: {
        taskType: 'DATA_LOOKUP',
        expectsToolCalls: false,
      },
      expected: { mode: 'LEGACY', requireConsent: false },
    },
  ];

  testCases.forEach((testCase) => {
    it(testCase.name, () => {
      // 构建完整的 signals
      const fullSignals: RoutingSignals = {
        taskType: testCase.signals.taskType || 'GENERIC_QA',
        risk: testCase.signals.risk || 'LOW',
        complexity: testCase.signals.complexity || 'SIMPLE',
        needsAudit: testCase.signals.needsAudit ?? false,
        requiresStructuredOutput: testCase.signals.requiresStructuredOutput ?? false,
        expectsToolCalls: testCase.signals.expectsToolCalls ?? false,
        legacyWellSupported: testCase.signals.legacyWellSupported ?? true,
        latencyBudgetMs: testCase.signals.latencyBudgetMs ?? 60000,
      };

      const decision = routePolicy(testCase.env, testCase.options, fullSignals);

      expect(decision.mode).toBe(testCase.expected.mode);
      
      if (testCase.expected.requireConsent !== undefined) {
        expect(decision.recommendations?.requireConsent).toBe(testCase.expected.requireConsent);
      }
      
      if (testCase.expected.enableAudit !== undefined) {
        expect(decision.recommendations?.enableAudit).toBe(testCase.expected.enableAudit);
      }

      // 验证决策不可变性
      expect(() => {
        (decision as any).mode = 'LEGACY';
      }).toThrow();
    });
  });
});

describe('signalsFromRequest - 关键词误触发测试', () => {
  it('不应该将"我想删除烦恼"识别为 CRUD', () => {
    const req: RouteAndRunRequestDto = {
      request_id: 'test-001',
      user_id: 'user-123',
      message: '我想删除烦恼',
    };
    const signals = signalsFromRequest(req);
    expect(signals.taskType).not.toBe('CRUD');
  });

  it('应该将"删除行程"识别为 CRUD', () => {
    const req: RouteAndRunRequestDto = {
      request_id: 'test-002',
      user_id: 'user-123',
      message: '删除行程123',
    };
    const signals = signalsFromRequest(req);
    expect(signals.taskType).toBe('CRUD');
  });

  it('不应该将"提到护照"识别为 CRITICAL', () => {
    const req: RouteAndRunRequestDto = {
      request_id: 'test-003',
      user_id: 'user-123',
      message: '去日本需要带护照吗？',
    };
    const signals = signalsFromRequest(req);
    expect(signals.risk).not.toBe('CRITICAL');
  });

  it('应该将"帮我填写护照信息"识别为 CRITICAL', () => {
    const req: RouteAndRunRequestDto = {
      request_id: 'test-004',
      user_id: 'user-123',
      message: '帮我填写护照号码和姓名',
      options: { use_claude_orchestration: true },
    };
    const signals = signalsFromRequest(req);
    // "帮我填写护照号码" 应该匹配 piiActionPatterns，识别为 CRITICAL
    expect(signals.risk).toBe('CRITICAL');
  });
  
  it('应该将"帮我提交护照信息"识别为 CRITICAL', () => {
    const req: RouteAndRunRequestDto = {
      request_id: 'test-005',
      user_id: 'user-123',
      message: '帮我提交护照信息',
    };
    const signals = signalsFromRequest(req);
    expect(signals.risk).toBe('CRITICAL');
  });
  
  it('应该将"请处理我的身份证信息"识别为 CRITICAL', () => {
    const req: RouteAndRunRequestDto = {
      request_id: 'test-006',
      user_id: 'user-123',
      message: '请处理我的身份证信息',
    };
    const signals = signalsFromRequest(req);
    expect(signals.risk).toBe('CRITICAL');
  });
});
