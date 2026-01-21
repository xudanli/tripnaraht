// scripts/test-state-machine-flow.ts
/**
 * 状态机流程测试脚本
 * 
 * 测试 CLAUDE_SM 状态机的完整流程：
 * INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE → DONE
 * 
 * 使用方法：
 * npm run test:state-machine
 * 或
 * ts-node scripts/test-state-machine-flow.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/agent/route_and_run`;

interface TestCase {
  name: string;
  description: string;
  request: {
    request_id: string;
    user_id: string;
    message: string;
    trip_id?: string | null;
    options?: {
      use_claude_orchestration?: boolean;
      use_state_machine_orchestration?: boolean;
      llm_provider?: string;
      entry_point?: string;
      max_seconds?: number;
    };
  };
  expectedSteps?: string[]; // 期望执行的状态机步骤
  expectedGateResult?: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
  shouldComplete?: boolean; // 是否应该完成整个流程
  timeout?: number; // 超时时间（毫秒）
}

const testCases: TestCase[] = [
  {
    name: '完整流程测试 - 简单行程规划',
    description: '测试状态机完整流程，从 INTAKE 到 DONE',
    request: {
      request_id: `test-sm-flow-${Date.now()}-001`,
      user_id: 'test-user-001',
      message: '我想在7月去冰岛旅行5天，从雷克雅未克出发',
      trip_id: null,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        llm_provider: 'anthropic',
        entry_point: 'dashboard',
        max_seconds: 60, // 服务器端最大超时时间（状态机需要更多时间）
      },
    },
    expectedSteps: ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'NARRATE', 'DONE'],
    expectedGateResult: 'ALLOW',
    shouldComplete: true,
    timeout: 300000, // 5分钟
  },
  {
    name: 'Gate BLOCK 测试',
    description: '测试当 Gate 结果为 BLOCK 时，流程应该在 GATE_EVAL 后停止',
    request: {
      request_id: `test-sm-flow-${Date.now()}-002`,
      user_id: 'test-user-001',
      message: '我想在1月去冰岛高地F路自驾，但我没有4x4车辆',
      trip_id: null,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        llm_provider: 'anthropic',
        entry_point: 'dashboard',
        max_seconds: 60, // 服务器端最大超时时间（状态机需要更多时间）
      },
    },
    expectedSteps: ['INTAKE', 'RESEARCH', 'GATE_EVAL'], // 应该在 GATE_EVAL 后停止
    expectedGateResult: 'BLOCK',
    shouldComplete: false,
    timeout: 300000, // 5分钟
  },
  {
    name: 'Gate ADJUST_REQUIRED 测试',
    description: '测试当 Gate 结果为 ADJUST_REQUIRED 时，应该执行 REPAIR 步骤',
    request: {
      request_id: `test-sm-flow-${Date.now()}-003`,
      user_id: 'test-user-001',
      message: '我想在7月去冰岛，但我膝盖不好，不想走太多路',
      trip_id: null,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        llm_provider: 'anthropic',
        entry_point: 'dashboard',
        max_seconds: 60, // 服务器端最大超时时间（状态机需要更多时间）
      },
    },
    expectedSteps: ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE', 'DONE'],
    expectedGateResult: 'ADJUST_REQUIRED',
    shouldComplete: true,
    timeout: 300000, // 5分钟
  },
  {
    name: 'HARD 缺口测试',
    description: '测试当有 HARD 缺口时，应该在 INTAKE 后返回澄清问题',
    request: {
      request_id: `test-sm-flow-${Date.now()}-004`,
      user_id: 'test-user-001',
      message: '帮我规划一下',
      trip_id: null,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        llm_provider: 'anthropic',
        entry_point: 'dashboard',
        max_seconds: 60, // 服务器端最大超时时间（状态机需要更多时间）
      },
    },
    expectedSteps: ['INTAKE'], // 应该在 INTAKE 后停止
    shouldComplete: false,
    timeout: 120000, // 2分钟
  },
];

interface StepExecution {
  step: string;
  timestamp: string;
  duration_ms?: number;
  status?: string;
}

interface TestResult {
  testCase: TestCase;
  passed: boolean;
  errors: string[];
  warnings: string[];
  stepExecutions: StepExecution[];
  gateResult?: string;
  finalStep?: string;
  duration_ms: number;
  response?: any;
}

async function runTest(testCase: TestCase): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${testCase.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`描述: ${testCase.description}`);
  console.log(`请求: ${JSON.stringify(testCase.request, null, 2)}`);
  console.log('');

  const result: TestResult = {
    testCase,
    passed: true,
    errors: [],
    warnings: [],
    stepExecutions: [],
    duration_ms: 0,
  };

  try {
    const startTime = Date.now();
    const response = await axios.post(API_URL, testCase.request, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: testCase.timeout || 300000, // 默认5分钟
    });

    result.duration_ms = Date.now() - startTime;
    result.response = response.data;

    console.log(`✅ HTTP 状态码: ${response.status}`);
    console.log(`⏱️  响应时间: ${result.duration_ms}ms`);

    // 调试：打印响应结构
    console.log(`\n🔍 调试信息:`);
    console.log(`   - explain.decision_log 存在: ${!!response.data.explain?.decision_log}`);
    console.log(`   - explain.decision_log 长度: ${response.data.explain?.decision_log?.length || 0}`);
    console.log(`   - result.payload.orchestrationResult 存在: ${!!response.data.result?.payload?.orchestrationResult}`);
    console.log(`   - result.payload.orchestrationResult.state 存在: ${!!response.data.result?.payload?.orchestrationResult?.state}`);
    console.log(`   - result.payload.orchestrationResult.state.decision_log 存在: ${!!response.data.result?.payload?.orchestrationResult?.state?.decision_log}`);
    console.log(`   - result.payload.orchestrationResult.state.decision_log 长度: ${response.data.result?.payload?.orchestrationResult?.state?.decision_log?.length || 0}`);

    // 提取状态机步骤执行信息（从多个位置尝试）
    const decisionLog = 
      response.data.explain?.decision_log || 
      response.data.result?.payload?.orchestrationResult?.state?.decision_log || 
      response.data.result?.payload?.evidence || 
      [];
    
    const state = 
      response.data.result?.payload?.orchestrationResult?.state || 
      response.data.result?.state || 
      {};
    
    const gateResult = 
      response.data.result?.payload?.orchestrationResult?.gate_result ||
      response.data.result?.gate_result;

    // 记录步骤执行顺序
    const executedSteps: string[] = decisionLog
      .map((log: any) => log.step)
      .filter((step: any): step is string => typeof step === 'string' && step.length > 0);
    const uniqueSteps = Array.from(new Set(executedSteps));
    result.stepExecutions = uniqueSteps.map((step: string) => ({
      step,
      timestamp: new Date().toISOString(),
    }));

    console.log(`\n📋 执行的步骤顺序:`);
    result.stepExecutions.forEach((exec, index) => {
      console.log(`   ${index + 1}. ${exec.step}`);
    });

    // 检查最终步骤
    result.finalStep = state.current_step || response.data.result?.status || 'UNKNOWN';
    console.log(`\n🏁 最终步骤: ${result.finalStep}`);

    // 检查 Gate 结果
    if (gateResult) {
      result.gateResult = gateResult.gate_result;
      console.log(`🚪 Gate 结果: ${result.gateResult}`);
    }

    // 验证步骤顺序
    if (testCase.expectedSteps) {
      console.log(`\n🔍 验证步骤顺序...`);
      console.log(`   期望: ${testCase.expectedSteps.join(' → ')}`);
      console.log(`   实际: ${result.stepExecutions.map(e => e.step).join(' → ')}`);

      // 检查是否按顺序执行
      let lastIndex = -1;
      for (const expectedStep of testCase.expectedSteps) {
        const actualIndex = result.stepExecutions.findIndex(e => e.step === expectedStep);
        if (actualIndex === -1) {
          result.errors.push(`缺少期望步骤: ${expectedStep}`);
          result.passed = false;
        } else if (actualIndex < lastIndex) {
          result.errors.push(`步骤顺序错误: ${expectedStep} 应该在之前步骤之后执行`);
          result.passed = false;
        } else {
          lastIndex = actualIndex;
        }
      }

      // 检查是否有不应该执行的步骤
      const unexpectedSteps = result.stepExecutions
        .map(e => e.step)
        .filter(step => !testCase.expectedSteps?.includes(step));
      if (unexpectedSteps.length > 0) {
        result.warnings.push(`执行了未期望的步骤: ${unexpectedSteps.join(', ')}`);
      }
    }

    // 验证 Gate 结果
    if (testCase.expectedGateResult) {
      if (result.gateResult !== testCase.expectedGateResult) {
        result.errors.push(
          `Gate 结果不匹配: 期望 ${testCase.expectedGateResult}, 实际 ${result.gateResult || 'N/A'}`,
        );
        result.passed = false;
      }
    }

    // 验证流程是否完成
    if (testCase.shouldComplete !== undefined) {
      const isCompleted = result.finalStep === 'DONE';
      if (testCase.shouldComplete && !isCompleted) {
        result.errors.push(`流程未完成: 最终步骤是 ${result.finalStep}, 期望 DONE`);
        result.passed = false;
      } else if (!testCase.shouldComplete && isCompleted) {
        result.errors.push(`流程不应该完成: 最终步骤是 ${result.finalStep}, 但期望未完成`);
        result.passed = false;
      }
    }

    // 验证 Gate BLOCK 时不应该执行 PLAN_GEN
    if (result.gateResult === 'BLOCK') {
      const hasPlanGen = result.stepExecutions.some(e => e.step === 'PLAN_GEN');
      if (hasPlanGen) {
        result.errors.push(`Gate BLOCK 时不应该执行 PLAN_GEN 步骤`);
        result.passed = false;
      }
    }

    // 验证 Gate 在 Plan 之前执行
    const gateIndex = result.stepExecutions.findIndex(e => e.step === 'GATE_EVAL');
    const planIndex = result.stepExecutions.findIndex(e => e.step === 'PLAN_GEN');
    if (gateIndex !== -1 && planIndex !== -1 && gateIndex > planIndex) {
      result.errors.push(`GATE_EVAL 必须在 PLAN_GEN 之前执行`);
      result.passed = false;
    }

    // 显示决策日志
    if (decisionLog.length > 0) {
      console.log(`\n📋 决策日志:`);
      decisionLog.forEach((log: any, index: number) => {
        console.log(`   ${index + 1}. [${log.step}] ${log.actor}: ${log.outputs_summary}`);
      });
    }

    // 显示结果状态
    console.log(`\n📊 结果状态: ${response.data.result?.status || 'N/A'}`);
    console.log(`💰 预估成本: $${response.data.observability?.cost_est_usd || 0}`);
    console.log(`📝 Token 估算: ${response.data.observability?.tokens_est || 0}`);

    // 显示答案预览
    if (response.data.result?.answer_text) {
      const preview = response.data.result.answer_text.substring(0, 300);
      console.log(`\n💬 回答预览: ${preview}${response.data.result.answer_text.length > 300 ? '...' : ''}`);
    }

  } catch (error: any) {
    console.log(`\n❌ 测试执行失败: ${error.message}`);
    if (error.code === 'ECONNABORTED') {
      console.log(`   ⚠️  请求超时（超时时间: ${testCase.timeout || 300000}ms）`);
      result.errors.push(`请求超时: 可能需要更长的超时时间或检查服务器状态`);
    }
    if (error.response) {
      console.log(`   HTTP 状态码: ${error.response.status}`);
      console.log(`   响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
      result.response = error.response.data;
      
      // 尝试从错误响应中提取信息
      if (error.response.data?.result?.payload?.orchestrationResult?.state) {
        const errorState = error.response.data.result.payload.orchestrationResult.state;
        if (errorState.decision_log && errorState.decision_log.length > 0) {
          const errorSteps = errorState.decision_log.map((log: any) => log.step).filter(Boolean);
          result.stepExecutions = errorSteps.map((step: string) => ({
            step,
            timestamp: new Date().toISOString(),
          }));
          console.log(`   ⚠️  从错误响应中提取到步骤: ${errorSteps.join(' → ')}`);
        }
      }
    } else if (error.request) {
      console.log(`   ⚠️  无响应: 服务器可能未运行或无法连接`);
      result.errors.push(`服务器连接失败: 请确保服务器正在运行`);
    }
    result.errors.push(`请求失败: ${error.message}`);
    result.passed = false;
  }

  // 显示测试结果
  console.log(`\n${'='.repeat(60)}`);
  if (result.passed) {
    console.log(`✅ 测试通过`);
  } else {
    console.log(`❌ 测试失败`);
    if (result.errors.length > 0) {
      console.log(`\n错误:`);
      result.errors.forEach(error => console.log(`   - ${error}`));
    }
  }
  if (result.warnings.length > 0) {
    console.log(`\n警告:`);
    result.warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  console.log(`${'='.repeat(60)}\n`);

  return result;
}

async function main() {
  console.log('='.repeat(60));
  console.log('状态机流程测试');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`测试用例数量: ${testCases.length}`);
  console.log('');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push(result);
    if (result.passed) {
      passed++;
    } else {
      failed++;
    }

    // 等待一下再执行下一个测试
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 汇总报告
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📊 总计: ${passed + failed}`);
  console.log('');

  // 详细结果
  console.log('详细结果:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.testCase.name}`);
    console.log(`   状态: ${result.passed ? '✅ 通过' : '❌ 失败'}`);
    console.log(`   执行步骤: ${result.stepExecutions.map(e => e.step).join(' → ')}`);
    console.log(`   最终步骤: ${result.finalStep}`);
    if (result.gateResult) {
      console.log(`   Gate 结果: ${result.gateResult}`);
    }
    console.log(`   耗时: ${result.duration_ms}ms`);
    if (result.errors.length > 0) {
      console.log(`   错误: ${result.errors.join('; ')}`);
    }
  });

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    console.log('✅ 所有测试通过！');
    process.exit(0);
  } else {
    console.log(`❌ 有 ${failed} 个测试失败`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
});
