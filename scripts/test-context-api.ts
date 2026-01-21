// scripts/test-context-api.ts
/**
 * Context API 测试脚本
 * 
 * 测试 Context 相关的 HTTP API 接口：
 * 1. POST /context/build - 构建 Context Package
 * 2. POST /context/compress - 压缩 Context
 * 3. POST /context/project-state - 投影状态
 * 4. POST /context/write-back - 写入回写
 * 5. GET /context/metrics - 获取指标
 * 
 * 使用方法：
 * npm run test:context-api
 * 或
 * ts-node scripts/test-context-api.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONTEXT_API_BASE = `${BASE_URL}/api/context`;

interface TestResult {
  name: string;
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

/**
 * 测试函数
 */
async function testEndpoint(
  name: string,
  method: 'GET' | 'POST',
  url: string,
  data?: any,
  timeout: number = 30000,
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${url}`);
    
    if (data) {
      console.log(`   请求体:`, JSON.stringify(data, null, 2).substring(0, 500));
    }

    const config: any = {
      method,
      url: `${CONTEXT_API_BASE}${url}`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout,
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ 状态码: ${response.status}`);
    console.log(`   ⏱️  耗时: ${duration}ms`);
    
    // 格式化响应输出
    const responseData = response.data;
    if (responseData.success) {
      console.log(`   📦 成功响应:`);
      console.log(`      ${JSON.stringify(responseData.data, null, 2).substring(0, 500)}...`);
    } else {
      console.log(`   ⚠️  响应包含错误:`);
      console.log(`      ${JSON.stringify(responseData.error, null, 2)}`);
    }

    return {
      name,
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      data: responseData,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    let errorMessage = '';
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = `连接失败: ${error.code} - 请确保服务器正在运行 (${BASE_URL})`;
    } else if (error.response) {
      errorMessage = `状态码: ${error.response.status}, 消息: ${error.response.data?.error?.message || error.response.data?.message || error.message}`;
      if (error.response.data) {
        console.log(`   📦 错误响应:`, JSON.stringify(error.response.data, null, 2).substring(0, 500));
      }
    } else {
      errorMessage = error.message || String(error);
    }
    
    console.log(`   ❌ 错误: ${errorMessage}`);
    console.log(`   ⏱️  耗时: ${duration}ms`);
    
    if (error.stack && errorMessage.includes('连接失败')) {
      console.log(`   💡 提示: 请先启动服务器: npm run dev`);
    }
    
    return {
      name,
      success: false,
      status: error.response?.status,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 开始测试 Context API 接口\n');
  console.log(`📍 基础 URL: ${BASE_URL}`);
  console.log(`📍 Context API: ${CONTEXT_API_BASE}\n`);

  // 测试数据
  const testTripId = 'test-trip-123';
  const testRunId = 'test-run-123';

  // 1. 测试构建 Context Package
  const buildResult = await testEndpoint(
    'POST /context/build - 构建 Context Package',
    'POST',
    '/build',
    {
      tripId: testTripId,
      phase: 'planning',
      agent: 'PLANNER',
      userQuery: '帮我规划冰岛7天行程',
      tokenBudget: 3600,
      requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
      useCache: true,
    },
    60000, // 60秒超时（构建可能需要时间）
  );
  results.push(buildResult);

  // 保存构建结果用于后续测试
  let contextPackage: any = null;
  if (buildResult.success && buildResult.data?.success && buildResult.data?.data?.contextPackage) {
    contextPackage = buildResult.data.data.contextPackage;
    console.log(`\n   💾 保存 Context Package ID: ${contextPackage.id}`);
    console.log(`   📊 Blocks 数量: ${contextPackage.blocks?.length || 0}`);
    console.log(`   🔢 Total Tokens: ${contextPackage.totalTokens || 0}`);
  }

  // 2. 测试压缩 Context
  // 创建测试用的 blocks（模拟超预算场景）
  const testBlocks = [
    {
      key: 'hard-threshold-1',
      type: 'ABU_RULES',
      text: '硬规则：不允许在恶劣天气下驾驶。这是非常重要的安全规则，必须严格遵守。',
      priority: 90,
      visibility: 'public',
      provenance: {
        source: 'skill',
        identifier: 'abu.check',
        timestamp: new Date().toISOString(),
      },
      estimatedTokens: 50,
    },
    {
      key: 'key-decision-1',
      type: 'DECISION_LOG',
      text: '关键决策：选择路线A而不是路线B，因为路线A更安全且时间更合理。路线A经过的主要景点包括黄金圈、南岸和冰川，总行程7天。',
      priority: 85,
      visibility: 'public',
      provenance: {
        source: 'db',
        identifier: 'decision_log',
        timestamp: new Date().toISOString(),
      },
      estimatedTokens: 80,
    },
    {
      key: 'world-model-1',
      type: 'WORLD_MODEL',
      text: '世界模型摘要：冰岛是一个位于北大西洋的岛国，以其壮观的自然景观而闻名。主要景点包括黄金圈、南岸、冰川、蓝湖等。'.repeat(5),
      priority: 80,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: 'iceland-pack',
        timestamp: new Date().toISOString(),
      },
      estimatedTokens: 200,
    },
    {
      key: 'visa-info-1',
      type: 'COUNTRY_VISA',
      text: '签证信息：中国公民前往冰岛需要申根签证。申请流程包括填写申请表、准备材料、预约面试等步骤。'.repeat(3),
      priority: 75,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: 'iceland-pack',
        timestamp: new Date().toISOString(),
      },
      estimatedTokens: 150,
    },
    {
      key: 'low-priority-1',
      type: 'METADATA',
      text: '这是低优先级的元数据块，包含一些辅助信息。'.repeat(20),
      priority: 30,
      visibility: 'public',
      provenance: {
        source: 'computed',
        identifier: 'test',
        timestamp: new Date().toISOString(),
      },
      estimatedTokens: 300,
    },
    {
      key: 'low-priority-2',
      type: 'METADATA',
      text: '另一个低优先级的元数据块，包含更多辅助信息。'.repeat(20),
      priority: 25,
      visibility: 'public',
      provenance: {
        source: 'computed',
        identifier: 'test',
        timestamp: new Date().toISOString(),
      },
      estimatedTokens: 280,
    },
  ];

  // 计算总 tokens（约 1060 tokens）
  const totalTokens = testBlocks.reduce((sum, b) => sum + (b.estimatedTokens || 0), 0);
  console.log(`\n   📊 测试压缩：${testBlocks.length} 个 blocks，总 tokens: ${totalTokens}`);

  const compressResult = await testEndpoint(
    'POST /context/compress - 压缩 Context（balanced 策略）',
    'POST',
    '/compress',
    {
      blocks: testBlocks,
      tokenBudget: 500, // 设置较小的预算，强制压缩
      strategy: 'balanced',
      preserveKeys: ['hard-threshold-1', 'key-decision-1'], // 保留关键块
    },
  );
  results.push(compressResult);

  // 测试不同的压缩策略
  const compressAggressiveResult = await testEndpoint(
    'POST /context/compress - 压缩 Context（aggressive 策略）',
    'POST',
    '/compress',
    {
      blocks: testBlocks,
      tokenBudget: 300,
      strategy: 'aggressive',
      preserveKeys: ['hard-threshold-1'],
    },
  );
  results.push(compressAggressiveResult);

  // 3. 测试投影状态
  const mockState = {
    user_intent: '规划冰岛7天行程',
    world_model: {
      countryCode: 'IS',
      season: 'summer',
    },
    planning_phase: 'planning',
    decision_log: [
      {
        agent: 'PLANNER',
        action: 'generate_skeleton',
        reasonCode: 'SUCCESS',
        explanation: '已生成7天行程骨架',
        timestamp: new Date().toISOString(),
      },
    ],
    plan: {
      totalDays: 7,
      segments: [
        { id: 'seg-1', name: '雷克雅未克-黄金圈' },
        { id: 'seg-2', name: '黄金圈-南岸' },
      ],
    },
    private_data: {
      toolRawOutputs: {
        poi_search: 'ref:/artifacts/poi_search_123.json',
      },
      debugLogs: ['ref:/artifacts/debug_123.log'],
    },
  };

  const projectStateResult = await testEndpoint(
    'POST /context/project-state - 投影状态',
    'POST',
    '/project-state',
    {
      state: mockState,
      decisionLogLimit: 5,
      tokenBudget: 3600,
    },
  );
  results.push(projectStateResult);

  // 4. 测试写入回写
  const writeBackResult = await testEndpoint(
    'POST /context/write-back - 写入回写',
    'POST',
    '/write-back',
    {
      tripRunId: testRunId,
      attemptNumber: 1,
      scratchpad: {
        planOutline: '已完成的计划大纲：冰岛7天行程包含黄金圈、南岸、冰川等',
        openQuestions: ['是否需要租车？', '预算范围？'],
        nextActions: ['decision.abuCheck', 'decision.drdrePace'],
        failureNotes: '某些POI不可用',
      },
      decisionLogDelta: [
        {
          agent: 'PLANNER',
          action: 'generate_skeleton',
          timestamp: new Date().toISOString(),
        },
      ],
      artifactsRefs: {
        poi_search: '/artifacts/poi_search_123.json',
        route_plan: '/artifacts/route_plan_123.json',
      },
    },
  );
  results.push(writeBackResult);

  // 5. 测试获取指标（无参数）
  const metricsResult1 = await testEndpoint(
    'GET /context/metrics - 获取指标（无参数）',
    'GET',
    '/metrics',
  );
  results.push(metricsResult1);

  // 6. 测试获取指标（带参数）
  const metricsResult2 = await testEndpoint(
    'GET /context/metrics - 获取指标（带参数）',
    'GET',
    `/metrics?tripId=${testTripId}&phase=planning&limit=10`,
  );
  results.push(metricsResult2);

  // 打印测试总结
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 测试总结');
  console.log(`${'='.repeat(60)}\n`);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(`✅ 成功: ${successCount}/${results.length}`);
  console.log(`❌ 失败: ${failCount}/${results.length}`);
  console.log(`⏱️  总耗时: ${totalDuration}ms`);
  console.log(`📊 平均耗时: ${Math.round(totalDuration / results.length)}ms\n`);

  // 详细结果
  console.log('详细结果:');
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`  ${index + 1}. ${icon} ${result.name}${duration}`);
    if (!result.success && result.error) {
      console.log(`     错误: ${result.error}`);
    }
  });

  // 返回测试结果
  if (failCount > 0) {
    console.log(`\n⚠️  有 ${failCount} 个测试失败`);
    process.exit(1);
  } else {
    console.log(`\n🎉 所有测试通过！`);
    process.exit(0);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
