// scripts/test-claude-orchestration.ts
/**
 * Claude 编排功能测试脚本
 * 
 * 使用方法：
 * npm run test:claude-orchestration
 * 或
 * ts-node scripts/test-claude-orchestration.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/agent/route_and_run`;

interface TestCase {
  name: string;
  request: {
    request_id: string;
    user_id: string;
    message: string;
    options?: {
      use_claude_orchestration?: boolean;
      llm_provider?: string;
    };
  };
  expectedStatus?: string;
  expectedRoute?: string;
  expectedSystemMode?: 'SYSTEM1' | 'SYSTEM2';
}

const testCases: TestCase[] = [
  {
    name: '简单查询（System 1 路径）',
    request: {
      request_id: 'test-simple-001',
      user_id: 'user-123',
      message: '查询我的行程',
      options: {
        use_claude_orchestration: true,
        llm_provider: 'anthropic',
      },
    },
    expectedStatus: 'OK',
    expectedSystemMode: 'SYSTEM1',
  },
  {
    name: '复杂分析请求（System 2 路径）',
    request: {
      request_id: 'test-analysis-001',
      user_id: 'user-123',
      message: '分析 TripNARA 的市场机会',
      options: {
        use_claude_orchestration: true,
        llm_provider: 'anthropic',
      },
    },
    expectedStatus: 'OK',
    expectedSystemMode: 'SYSTEM2',
  },
  {
    name: 'PEST 分析请求',
    request: {
      request_id: 'test-pest-001',
      user_id: 'user-123',
      message: '/分析 TripNARA（决策型旅行应用）— 面向全球市场',
      options: {
        use_claude_orchestration: true,
        llm_provider: 'anthropic',
      },
    },
    expectedStatus: 'OK',
    expectedSystemMode: 'SYSTEM2',
  },
  {
    name: '行程规划请求',
    request: {
      request_id: 'test-planning-001',
      user_id: 'user-123',
      message: '我想在7月去冰岛，但我膝盖不好，不想太累',
      options: {
        use_claude_orchestration: true,
        llm_provider: 'anthropic',
      },
    },
    expectedStatus: 'OK',
    expectedSystemMode: 'SYSTEM2',
  },
  {
    name: '模糊请求（可能需要更多信息）',
    request: {
      request_id: 'test-ambiguous-001',
      user_id: 'user-123',
      message: '帮我改一下',
      options: {
        use_claude_orchestration: true,
        llm_provider: 'anthropic',
      },
    },
    expectedStatus: 'NEED_MORE_INFO',
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  console.log(`\n==========================================`);
  console.log(`测试: ${testCase.name}`);
  console.log(`==========================================`);
  console.log(`请求: ${JSON.stringify(testCase.request, null, 2)}`);
  console.log('');

  try {
    const startTime = Date.now();
    const response = await axios.post(API_URL, testCase.request, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2 分钟超时
    });

    const duration = Date.now() - startTime;
    const data = response.data;

    console.log(`✅ HTTP 状态码: ${response.status}`);
    console.log(`⏱️  响应时间: ${duration}ms`);
    console.log(`📊 结果状态: ${data.result?.status}`);
    console.log(`🛣️  路由类型: ${data.route?.route}`);
    console.log(`⚙️  系统模式: ${data.observability?.system_mode}`);
    console.log(`🔧 工具调用: ${data.observability?.tool_calls}`);
    console.log(`💰 预估成本: $${data.observability?.cost_est_usd || 0}`);
    console.log(`📝 Token 估算: ${data.observability?.tokens_est || 0}`);

    // 验证结果
    let passed = true;
    const errors: string[] = [];

    if (testCase.expectedStatus && data.result?.status !== testCase.expectedStatus) {
      passed = false;
      errors.push(`期望状态 ${testCase.expectedStatus}, 实际 ${data.result?.status}`);
    }

    if (testCase.expectedSystemMode && data.observability?.system_mode !== testCase.expectedSystemMode) {
      passed = false;
      errors.push(`期望系统模式 ${testCase.expectedSystemMode}, 实际 ${data.observability?.system_mode}`);
    }

    if (testCase.expectedRoute && data.route?.route !== testCase.expectedRoute) {
      passed = false;
      errors.push(`期望路由 ${testCase.expectedRoute}, 实际 ${data.route?.route}`);
    }

    if (passed) {
      console.log(`\n✅ 测试通过`);
    } else {
      console.log(`\n❌ 测试失败:`);
      errors.forEach(error => console.log(`   - ${error}`));
    }

    // 显示决策日志
    if (data.explain?.decision_log && data.explain.decision_log.length > 0) {
      console.log(`\n📋 决策日志:`);
      data.explain.decision_log.forEach((log: any, index: number) => {
        console.log(`   ${index + 1}. ${log.step}: ${log.decision}`);
        console.log(`      理由: ${log.reasoning}`);
      });
    }

    // 显示答案文本（前 200 字符）
    if (data.result?.answer_text) {
      const preview = data.result.answer_text.substring(0, 200);
      console.log(`\n💬 回答预览: ${preview}${data.result.answer_text.length > 200 ? '...' : ''}`);
    }

    return passed;
  } catch (error: any) {
    console.log(`\n❌ 测试失败: ${error.message}`);
    if (error.response) {
      console.log(`   HTTP 状态码: ${error.response.status}`);
      console.log(`   响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function main() {
  console.log('==========================================');
  console.log('Claude 编排功能测试');
  console.log('==========================================');
  console.log(`API URL: ${API_URL}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    
    // 等待一下再执行下一个测试
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n==========================================');
  console.log('测试结果汇总');
  console.log('==========================================');
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📊 总计: ${passed + failed}`);
  console.log('');

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
