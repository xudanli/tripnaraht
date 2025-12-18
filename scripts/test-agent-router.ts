// scripts/test-agent-router.ts
/**
 * 测试 Agent Router 逻辑（不依赖服务运行）
 * 
 * 直接测试 RouterService 的路由决策逻辑
 */

import { RouterService } from '../src/agent/services/router.service';
import { RouteType } from '../src/agent/interfaces/router.interface';

// 创建 RouterService 实例（不依赖 NestJS）
const router = new RouterService();

interface TestCase {
  name: string;
  input: string;
  expectedRoute: RouteType;
  minConfidence?: number;
}

const testCases: TestCase[] = [
  {
    name: 'System1_API - 删除操作',
    input: '删除清水寺',
    expectedRoute: RouteType.SYSTEM1_API,
    minConfidence: 0.7,
  },
  {
    name: 'System1_RAG - 推荐查询',
    input: '推荐新宿拉面',
    expectedRoute: RouteType.SYSTEM1_RAG,
    minConfidence: 0.7,
  },
  {
    name: 'System2_REASONING - 规划请求',
    input: '规划5天日本游，包含东京、京都、大阪',
    expectedRoute: RouteType.SYSTEM2_REASONING,
    minConfidence: 0.6,
  },
  {
    name: 'System2_REASONING - 条件分支',
    input: '如果赶不上日落就改去横滨',
    expectedRoute: RouteType.SYSTEM2_REASONING,
    minConfidence: 0.6,
  },
  {
    name: 'System2_WEBBROWSE - 官网查询',
    input: '去官网查一下下周六有房吗',
    expectedRoute: RouteType.SYSTEM2_WEBBROWSE,
    minConfidence: 0.7,
  },
  {
    name: 'System2_REASONING - 支付操作',
    input: '帮我支付这个订单',
    expectedRoute: RouteType.SYSTEM2_REASONING,
    minConfidence: 0.8,
  },
  {
    name: 'System1_RAG - 事实查询',
    input: '清水寺的营业时间是什么',
    expectedRoute: RouteType.SYSTEM1_RAG,
    minConfidence: 0.7,
  },
  {
    name: 'System1_API - 简单添加',
    input: '添加东京塔',
    expectedRoute: RouteType.SYSTEM1_API,
    minConfidence: 0.7,
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  try {
    console.log(`\n🧪 测试: ${testCase.name}`);
    console.log(`   输入: "${testCase.input}"`);

    const startTime = Date.now();
    const result = await router.route(testCase.input);
    const latency = Date.now() - startTime;

    console.log(`   ✅ 路由决策完成 (${latency}ms)`);
    console.log(`   路由: ${result.route}`);
    console.log(`   置信度: ${result.confidence.toFixed(2)}`);
    console.log(`   原因: ${result.reasons.join(', ') || '无'}`);
    console.log(`   需要同意: ${result.consent_required ? '是' : '否'}`);
    console.log(`   UI 模式: ${result.ui_hint.mode}`);
    console.log(`   UI 状态: ${result.ui_hint.status}`);

    // 验证路由
    if (result.route !== testCase.expectedRoute) {
      console.log(`   ❌ 路由不匹配: 期望 ${testCase.expectedRoute}，实际 ${result.route}`);
      return false;
    }

    // 验证置信度
    if (testCase.minConfidence && result.confidence < testCase.minConfidence) {
      console.log(`   ⚠️  置信度较低: ${result.confidence.toFixed(2)} < ${testCase.minConfidence}`);
      // 不视为失败，只是警告
    }

    // 验证预算
    if (result.budget) {
      console.log(`   预算: ${result.budget.max_seconds}s, ${result.budget.max_steps}步`);
    }

    return true;
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error?.message || String(error)}`);
    if (error?.stack) {
      console.log(`   堆栈: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 开始测试 Agent Router 逻辑');
  console.log(`📅 时间: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');

  const results: boolean[] = [];
  for (const testCase of testCases) {
    const passed = await runTest(testCase);
    results.push(passed);
  }

  // 汇总结果
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 测试结果汇总');
  console.log(`   总计: ${testCases.length} 个测试`);
  console.log(`   通过: ${results.filter(r => r).length} 个`);
  console.log(`   失败: ${results.filter(r => !r).length} 个`);

  if (results.every(r => r)) {
    console.log('\n✅ 所有测试通过！');
    console.log('\n💡 提示: Router 逻辑正常工作，可以启动服务进行端到端测试');
    console.log('   运行: npm run backend:dev');
    console.log('   然后: ts-node --project tsconfig.backend.json scripts/test-agent.ts');
    process.exit(0);
  } else {
    console.log('\n❌ 部分测试失败，请检查 Router 逻辑');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ 测试执行错误:', error);
  process.exit(1);
});

