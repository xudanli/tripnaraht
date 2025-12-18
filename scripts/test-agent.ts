// scripts/test-agent.ts
import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  request: any;
  expectedRoute?: string;
  expectedStatus?: string;
}

const testCases: TestCase[] = [
  {
    name: 'System1_API - 删除操作',
    request: {
      request_id: 'test-001',
      user_id: 'user-123',
      message: '删除清水寺',
      options: {
        max_seconds: 3,
        max_steps: 1,
      },
    },
    expectedRoute: 'SYSTEM1_API',
  },
  {
    name: 'System1_RAG - 推荐查询',
    request: {
      request_id: 'test-002',
      user_id: 'user-123',
      message: '推荐新宿拉面',
      options: {
        max_seconds: 3,
        max_steps: 1,
      },
    },
    expectedRoute: 'SYSTEM1_RAG',
  },
  {
    name: 'System2_REASONING - 规划请求',
    request: {
      request_id: 'test-003',
      user_id: 'user-123',
      message: '规划5天日本游，包含东京、京都、大阪，要能订到酒店',
      options: {
        max_seconds: 60,
        max_steps: 8,
      },
    },
    expectedRoute: 'SYSTEM2_REASONING',
  },
  {
    name: 'System2_REASONING - 条件分支',
    request: {
      request_id: 'test-004',
      user_id: 'user-123',
      message: '如果赶不上日落就改去横滨',
      options: {
        max_seconds: 60,
        max_steps: 8,
      },
    },
    expectedRoute: 'SYSTEM2_REASONING',
  },
  {
    name: 'System2_WEBBROWSE - 官网查询',
    request: {
      request_id: 'test-005',
      user_id: 'user-123',
      message: '去官网查一下下周六有房吗',
      options: {
        max_seconds: 60,
        max_steps: 8,
        allow_webbrowse: false, // 测试 consent 流程
      },
    },
    expectedRoute: 'SYSTEM2_WEBBROWSE',
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  try {
    console.log(`\n🧪 测试: ${testCase.name}`);
    console.log(`   请求: ${testCase.request.message}`);

    const startTime = Date.now();
    const response = await axios.post(
      `${BASE_URL}/agent/route_and_run`,
      testCase.request,
      {
        timeout: 30000,
        validateStatus: () => true, // 接受所有状态码
      }
    );
    const latency = Date.now() - startTime;

    if (response.status !== 200) {
      console.log(`   ❌ 失败: HTTP ${response.status}`);
      console.log(`   响应: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }

    const data = response.data;
    const route = data.route?.route;
    const status = data.result?.status;

    console.log(`   ✅ 成功 (${latency}ms)`);
    console.log(`   路由: ${route}`);
    console.log(`   置信度: ${data.route?.confidence || 'N/A'}`);
    console.log(`   状态: ${status}`);
    console.log(`   系统模式: ${data.observability?.system_mode || 'N/A'}`);

    // 验证路由
    if (testCase.expectedRoute && route !== testCase.expectedRoute) {
      console.log(`   ⚠️  警告: 期望路由 ${testCase.expectedRoute}，实际 ${route}`);
    }

    // 验证状态
    if (testCase.expectedStatus && status !== testCase.expectedStatus) {
      console.log(`   ⚠️  警告: 期望状态 ${testCase.expectedStatus}，实际 ${status}`);
    }

    // 显示可观测性指标
    if (data.observability) {
      console.log(`   指标:`);
      console.log(`     - Router: ${data.observability.router_ms}ms`);
      console.log(`     - 总延迟: ${data.observability.latency_ms}ms`);
      console.log(`     - 工具调用: ${data.observability.tool_calls || 0}`);
    }

    return true;
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error.message}`);
    if (error.response) {
      console.log(`   响应状态: ${error.response.status}`);
      console.log(`   响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 开始测试 Agent API');
  console.log(`📍 目标地址: ${BASE_URL}`);
  console.log(`📅 时间: ${new Date().toISOString()}`);

  // 先测试服务是否可用
  try {
    console.log('\n🔍 检查服务可用性...');
    // 尝试多个可能的健康检查端点
    try {
      await axios.get(`${BASE_URL}/system/health`, { timeout: 5000 });
      console.log('✅ 服务可用 (/system/health)');
    } catch {
      // 尝试根路径
      await axios.get(`${BASE_URL}/`, { timeout: 5000 });
      console.log('✅ 服务可用 (/)');
    }
  } catch (error: any) {
    console.log('⚠️  无法确认服务状态，继续测试...');
    console.log(`   提示: 如果测试失败，请运行 'npm run backend:dev' 启动服务`);
    // 不退出，继续尝试测试
  }

  // 运行测试用例
  const results: boolean[] = [];
  for (const testCase of testCases) {
    const passed = await runTest(testCase);
    results.push(passed);
    // 短暂延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 汇总结果
  console.log('\n📊 测试结果汇总');
  console.log(`   总计: ${testCases.length} 个测试`);
  console.log(`   通过: ${results.filter(r => r).length} 个`);
  console.log(`   失败: ${results.filter(r => !r).length} 个`);

  if (results.every(r => r)) {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n❌ 部分测试失败');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ 测试执行错误:', error);
  process.exit(1);
});

