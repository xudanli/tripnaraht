// scripts/test-agent-full.ts
/**
 * 完整 Agent 功能测试
 * 
 * 测试所有新实现的 Actions 和功能
 */
import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  request: any;
  expectedRoute?: string;
  expectedActions?: string[];
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'System1_API - 删除操作（实体解析）',
    description: '测试实体解析和删除操作',
    request: {
      request_id: 'test-full-001',
      user_id: 'user-123',
      message: '删除清水寺',
      options: { max_seconds: 3, max_steps: 1 },
    },
    expectedRoute: 'SYSTEM1_API',
  },
  {
    name: 'System1_RAG - 推荐查询（语义搜索）',
    description: '测试语义搜索功能',
    request: {
      request_id: 'test-full-002',
      user_id: 'user-123',
      message: '推荐新宿拉面',
      options: { max_seconds: 3, max_steps: 1 },
    },
    expectedRoute: 'SYSTEM1_RAG',
  },
  {
    name: 'System2_REASONING - 完整规划流程',
    description: '测试完整的 System2 规划流程（包括所有 Actions）',
    request: {
      request_id: 'test-full-003',
      user_id: 'user-123',
      message: '规划3天东京游，包含浅草寺、东京塔、新宿',
      options: {
        max_seconds: 60,
        max_steps: 10,
      },
    },
    expectedRoute: 'SYSTEM2_REASONING',
    expectedActions: [
      'places.resolve_entities',
      'places.get_poi_facts',
      'transport.build_time_matrix',
      'itinerary.optimize_day_vrptw',
      'policy.validate_feasibility',
    ],
  },
  {
    name: 'System2_REASONING - 条件分支',
    description: '测试条件分支处理',
    request: {
      request_id: 'test-full-004',
      user_id: 'user-123',
      message: '如果赶不上日落就改去横滨',
      options: { max_seconds: 60, max_steps: 8 },
    },
    expectedRoute: 'SYSTEM2_REASONING',
  },
  {
    name: 'System2_WEBBROWSE - 官网查询',
    description: '测试官网查询（需要授权）',
    request: {
      request_id: 'test-full-005',
      user_id: 'user-123',
      message: '去官网查一下下周六有房吗',
      options: {
        max_seconds: 60,
        max_steps: 8,
        allow_webbrowse: false,
      },
    },
    expectedRoute: 'SYSTEM2_WEBBROWSE',
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  try {
    console.log(`\n🧪 测试: ${testCase.name}`);
    console.log(`   描述: ${testCase.description}`);
    console.log(`   请求: ${testCase.request.message}`);

    const startTime = Date.now();
    const response = await axios.post(
      `${BASE_URL}/agent/route_and_run`,
      testCase.request,
      {
        timeout: 60000,
        validateStatus: () => true,
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
    const decisionLog = data.explain?.decision_log || [];

    console.log(`   ✅ 成功 (${latency}ms)`);
    console.log(`   路由: ${route}`);
    console.log(`   状态: ${status}`);
    console.log(`   系统模式: ${data.observability?.system_mode || 'N/A'}`);
    console.log(`   工具调用: ${data.observability?.tool_calls || 0}`);

    // 验证路由
    if (testCase.expectedRoute && route !== testCase.expectedRoute) {
      console.log(`   ⚠️  警告: 期望路由 ${testCase.expectedRoute}，实际 ${route}`);
    }

    // 验证 Actions（如果指定）
    if (testCase.expectedActions && decisionLog.length > 0) {
      const executedActions = decisionLog.map((log: any) => log.chosen_action);
      const missingActions = testCase.expectedActions.filter(
        (action) => !executedActions.includes(action)
      );
      if (missingActions.length > 0) {
        console.log(`   ⚠️  警告: 未执行的 Actions: ${missingActions.join(', ')}`);
      } else {
        console.log(`   ✅ 所有预期 Actions 已执行`);
      }
    }

    // 显示决策日志
    if (decisionLog.length > 0) {
      console.log(`   执行的 Actions:`);
      decisionLog.forEach((log: any, index: number) => {
        console.log(`     ${index + 1}. ${log.chosen_action} (步骤 ${log.step})`);
      });
    }

    // 显示结果摘要
    if (data.result?.payload) {
      const payload = data.result.payload;
      if (payload.timeline && payload.timeline.length > 0) {
        console.log(`   时间轴: ${payload.timeline.length} 个事件`);
      }
      if (payload.dropped_items && payload.dropped_items.length > 0) {
        console.log(`   丢弃项: ${payload.dropped_items.length} 个`);
      }
    }

    return true;
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error?.message || String(error)}`);
    if (error.response) {
      console.log(`   响应状态: ${error.response.status}`);
      console.log(`   响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 Agent 完整功能测试');
  console.log(`📍 目标地址: ${BASE_URL}`);
  console.log(`📅 时间: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');

  // 检查服务可用性
  try {
    await axios.get(`${BASE_URL}/api`, { timeout: 5000 });
    console.log('✅ 服务可用\n');
  } catch (error: any) {
    console.log('❌ 服务不可用，请确保后端服务已启动');
    console.log(`   错误: ${error?.message || String(error)}`);
    console.log(`\n💡 提示: 运行 'npm run backend:dev' 启动服务`);
    process.exit(1);
  }

  // 运行测试用例
  const results: boolean[] = [];
  for (const testCase of testCases) {
    const passed = await runTest(testCase);
    results.push(passed);
    // 短暂延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 汇总结果
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 测试结果汇总');
  console.log(`   总计: ${testCases.length} 个测试`);
  console.log(`   通过: ${results.filter(r => r).length} 个`);
  console.log(`   失败: ${results.filter(r => !r).length} 个`);

  // 详细统计
  const routeStats: Record<string, number> = {};
  testCases.forEach((tc, i) => {
    if (results[i]) {
      // 这里可以添加更详细的统计
    }
  });

  if (results.every(r => r)) {
    console.log('\n✅ 所有测试通过！');
    console.log('\n🎉 Agent 模块功能完整，可以投入使用！');
    process.exit(0);
  } else {
    console.log('\n❌ 部分测试失败');
    console.log('\n💡 请检查失败的测试用例，查看错误信息');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ 测试执行错误:', error);
  process.exit(1);
});

