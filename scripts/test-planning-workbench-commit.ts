#!/usr/bin/env ts-node
/**
 * 规划工作台提交方案接口测试脚本
 * 
 * 测试 POST /planning-workbench/plans/:planId/commit 接口
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/planning-workbench`;

// 颜色输出
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];

// 测试函数
async function testCommitPlan(
  testName: string,
  planId: string,
  tripId: string,
  options?: { partialCommit?: boolean; commitDays?: number[] },
): Promise<TestResult> {
  console.log(`${YELLOW}测试: ${testName}${RESET}`);
  console.log(`  Plan ID: ${planId}`);
  console.log(`  Trip ID: ${tripId}`);
  if (options) {
    console.log(`  Options: ${JSON.stringify(options)}`);
  }
  console.log('');

  try {
    const response = await axios.post(
      `${API_URL}/plans/${planId}/commit`,
      {
        tripId,
        options,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: () => true, // 不抛出错误，返回所有状态码
      },
    );

    console.log(`  HTTP 状态码: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
      console.log(`${GREEN}✅ 通过${RESET}`);
      console.log(`  响应数据:`, JSON.stringify(response.data.data, null, 2));
      return {
        name: testName,
        passed: true,
        response: response.data,
      };
    } else {
      const errorMsg = response.data.error?.message || `HTTP ${response.status}`;
      console.log(`${RED}❌ 失败: ${errorMsg}${RESET}`);
      console.log(`  响应:`, JSON.stringify(response.data, null, 2));
      return {
        name: testName,
        passed: false,
        error: errorMsg,
        response: response.data,
      };
    }
  } catch (error: any) {
    let errorMsg = error.message || '未知错误';
    
    // 如果是网络错误，提供更详细的信息
    if (error.code === 'ECONNREFUSED') {
      errorMsg = '连接被拒绝，请确保服务器正在运行 (npm run dev)';
    } else if (error.code === 'ENOTFOUND') {
      errorMsg = `无法解析主机名: ${error.hostname}`;
    } else if (error.response) {
      errorMsg = `HTTP ${error.response.status}: ${error.response.statusText}`;
      if (error.response.data) {
        errorMsg += ` - ${JSON.stringify(error.response.data)}`;
      }
    }
    
    console.log(`${RED}❌ 异常: ${errorMsg}${RESET}`);
    if (error.response) {
      console.log(`  响应状态: ${error.response.status}`);
      console.log(`  响应数据:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.code) {
      console.log(`  错误代码: ${error.code}`);
    }
    if (error.stack) {
      console.log(`  堆栈: ${error.stack.split('\n')[0]}`);
    }
    return {
      name: testName,
      passed: false,
      error: errorMsg,
      response: error.response?.data,
    };
  } finally {
    console.log('');
    console.log('----------------------------------------');
    console.log('');
  }
}

// 创建测试数据
async function createTestData(): Promise<{ planId: string; tripId: string } | null> {
  console.log(`${BLUE}创建测试数据...${RESET}`);
  
  try {
    // 1. 先通过规划工作台创建一个 PlanState
    const executeResponse = await axios.post(
      `${API_URL}/execute`,
      {
        context: {
          destination: {
            country: 'IS',
            city: 'Reykjavik',
          },
          days: 3,
          travelMode: 'self_drive',
        },
        userAction: 'generate',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      },
    );

    if (executeResponse.status === 200 && executeResponse.data.success) {
      const planState = executeResponse.data.data?.planState;
      if (planState?.plan_id) {
        const planId = planState.plan_id;
        const tripId = planState.itinerary?.tripId || `trip_${Date.now()}`;
        
        console.log(`${GREEN}✅ 测试数据创建成功${RESET}`);
        console.log(`  Plan ID: ${planId}`);
        console.log(`  Trip ID: ${tripId}`);
        console.log('');
        
        return { planId, tripId };
      }
    }
    
    console.log(`${YELLOW}⚠️  无法从 execute 接口获取 PlanState，使用默认值${RESET}`);
    return null;
  } catch (error: any) {
    console.log(`${YELLOW}⚠️  创建测试数据失败: ${error.message}${RESET}`);
    return null;
  }
}

// 主测试函数
async function main() {
  console.log('==========================================');
  console.log('规划工作台提交方案接口测试');
  console.log('==========================================');
  console.log(`API URL: ${API_URL}`);
  console.log('');

  // 尝试创建测试数据
  const testData = await createTestData();
  
  // 使用环境变量或测试数据
  const testPlanId = process.env.TEST_PLAN_ID || testData?.planId || `plan_${Date.now()}`;
  const testTripId = process.env.TEST_TRIP_ID || testData?.tripId || `trip_${Date.now()}`;

  console.log(`${BLUE}使用测试数据:${RESET}`);
  console.log(`  TEST_PLAN_ID=${testPlanId}`);
  console.log(`  TEST_TRIP_ID=${testTripId}`);
  console.log('');

  // 测试 1: 全量提交
  results.push(
    await testCommitPlan(
      '全量提交方案',
      testPlanId,
      testTripId,
    ),
  );

  // 测试 2: 部分提交（指定天数）
  results.push(
    await testCommitPlan(
      '部分提交方案（第1、2天）',
      testPlanId,
      testTripId,
      {
        partialCommit: true,
        commitDays: [1, 2],
      },
    ),
  );

  // 测试 3: 部分提交（单天）
  results.push(
    await testCommitPlan(
      '部分提交方案（第3天）',
      testPlanId,
      testTripId,
      {
        partialCommit: true,
        commitDays: [3],
      },
    ),
  );

  // 测试 4: 无效的 planId
  results.push(
    await testCommitPlan(
      '无效的 Plan ID（应该返回 404）',
      'invalid_plan_id_12345',
      testTripId,
    ),
  );

  // 测试 5: 无效的 tripId
  results.push(
    await testCommitPlan(
      '无效的 Trip ID（应该返回 404）',
      testPlanId,
      'invalid_trip_id_12345',
    ),
  );

  // 汇总结果
  console.log('==========================================');
  console.log('测试结果汇总');
  console.log('==========================================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`${GREEN}通过: ${passed}${RESET}`);
  console.log(`${RED}失败: ${failed}${RESET}`);
  console.log(`总计: ${results.length}`);
  console.log('');

  // 详细结果
  console.log('详细结果:');
  results.forEach((result, index) => {
    const status = result.passed ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
    console.log(`  ${index + 1}. ${status} ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`     错误: ${result.error}`);
    }
  });

  console.log('');

  // 退出码
  if (failed === 0) {
    console.log(`${GREEN}✅ 所有测试通过！${RESET}`);
    process.exit(0);
  } else {
    console.log(`${RED}❌ 有 ${failed} 个测试失败${RESET}`);
    process.exit(1);
  }
}

// 运行测试
main().catch((error) => {
  console.error(`${RED}测试执行失败:${RESET}`, error);
  process.exit(1);
});
