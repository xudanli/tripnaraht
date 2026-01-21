#!/usr/bin/env ts-node
/**
 * 测试规划工作台 API 接口
 * 
 * 使用方法:
 *   ts-node scripts/test-planning-workbench-api.ts
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// 测试数据
const TEST_TRIP_ID = 'test-trip-123';
const TEST_PLAN_ID = 'plan_1234567890';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
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
): Promise<TestResult> {
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${url}`);
    
    const config: any = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.data = data;
      console.log(`   请求体:`, JSON.stringify(data, null, 2));
    }

    const response = await axios(config);
    
    console.log(`   ✅ 状态码: ${response.status}`);
    console.log(`   📦 响应:`, JSON.stringify(response.data, null, 2).substring(0, 500));

    return {
      name,
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    const errorMessage = error.response
      ? `状态码: ${error.response.status}, 消息: ${error.response.data?.message || error.message}`
      : error.message;
    
    console.log(`   ❌ 错误: ${errorMessage}`);
    
    return {
      name,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 开始测试规划工作台 API 接口\n');
  console.log(`📍 基础 URL: ${BASE_URL}\n`);

  // 1. 测试获取行程工作台数据
  results.push(
    await testEndpoint(
      'GET /planning-workbench/trips/:tripId',
      'GET',
      `/planning-workbench/trips/${TEST_TRIP_ID}`,
    ),
  );

  // 2. 测试获取方案列表
  results.push(
    await testEndpoint(
      'GET /planning-workbench/trips/:tripId/plans',
      'GET',
      `/planning-workbench/trips/${TEST_TRIP_ID}/plans?limit=10&offset=0`,
    ),
  );

  // 3. 测试获取方案详情
  results.push(
    await testEndpoint(
      'GET /planning-workbench/plans/:planId',
      'GET',
      `/planning-workbench/plans/${TEST_PLAN_ID}`,
    ),
  );

  // 4. 测试对比方案
  results.push(
    await testEndpoint(
      'POST /planning-workbench/plans/compare',
      'POST',
      '/planning-workbench/plans/compare',
      {
        planIds: [TEST_PLAN_ID, 'plan_0987654321'],
        compareFields: ['budget.total', 'constraints.time.days'],
      },
    ),
  );

  // 5. 测试调整方案
  results.push(
    await testEndpoint(
      'POST /planning-workbench/plans/:planId/adjust',
      'POST',
      `/planning-workbench/plans/${TEST_PLAN_ID}/adjust`,
      {
        adjustments: [
          {
            type: 'modify_budget',
            data: { total: 10000 },
          },
        ],
        regenerate: false,
      },
    ),
  );

  // 6. 测试预算评估
  results.push(
    await testEndpoint(
      'POST /planning-workbench/budget/evaluate',
      'POST',
      '/planning-workbench/budget/evaluate',
      {
        planId: TEST_PLAN_ID,
        tripId: TEST_TRIP_ID,
        estimatedCost: 8000,
        categoryBreakdown: {
          accommodation: 3000,
          transportation: 2000,
          food: 1500,
          activities: 1000,
          other: 500,
        },
        budgetConstraint: {
          total: 10000,
          currency: 'CNY',
          dailyBudget: 1000,
          categoryLimits: {},
          alertThreshold: 0.9,
        },
      },
    ),
  );

  // 7. 测试获取预算决策日志
  results.push(
    await testEndpoint(
      'GET /planning-workbench/budget/decision-log',
      'GET',
      `/planning-workbench/budget/decision-log?planId=${TEST_PLAN_ID}&tripId=${TEST_TRIP_ID}&limit=10&offset=0`,
    ),
  );

  // 8. 测试获取方案预算评估结果
  results.push(
    await testEndpoint(
      'GET /planning-workbench/plans/:planId/budget-evaluation',
      'GET',
      `/planning-workbench/plans/${TEST_PLAN_ID}/budget-evaluation?tripId=${TEST_TRIP_ID}`,
    ),
  );

  // 9. 测试应用预算优化建议
  results.push(
    await testEndpoint(
      'POST /planning-workbench/budget/apply-optimization',
      'POST',
      '/planning-workbench/budget/apply-optimization',
      {
        planId: TEST_PLAN_ID,
        tripId: TEST_TRIP_ID,
        optimizationIds: ['opt_1', 'opt_2'],
        autoCommit: false,
      },
    ),
  );

  // 打印测试结果摘要
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 测试结果摘要');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log('='.repeat(60) + '\n');

  // 如果有失败的测试，退出码为 1
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
