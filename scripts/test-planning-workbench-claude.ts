#!/usr/bin/env ts-node
/**
 * 规划工作台 Claude API 测试脚本
 * 
 * 测试规划工作台接口是否正常使用 Claude (Anthropic) API
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/planning-workbench`;

// 颜色输出
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
  duration?: number;
}

const results: TestResult[] = [];

// 测试函数
async function testPlanningWorkbench(
  testName: string,
  requestBody: any,
  expectedSuccess: boolean = true,
): Promise<TestResult> {
  console.log(`${YELLOW}测试: ${testName}${RESET}`);
  console.log(`  请求: ${JSON.stringify(requestBody, null, 2).substring(0, 200)}...`);
  console.log('');

  const startTime = Date.now();

  try {
    const response = await axios.post(
      `${API_URL}/execute`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: () => true, // 不抛出错误，返回所有状态码
        timeout: 120000, // 2 分钟超时（给 Claude API 足够时间）
      },
    );

    const duration = Date.now() - startTime;

    console.log(`  HTTP 状态码: ${response.status}`);
    console.log(`  耗时: ${duration}ms`);
    
    if (response.status === 200 && response.data.success === expectedSuccess) {
      const data = response.data.data;
      
      // 检查是否有 planState
      if (data?.planState) {
        console.log(`${GREEN}✅ 通过${RESET}`);
        console.log(`  Plan ID: ${data.planState.plan_id}`);
        console.log(`  方案数量: ${data.uiOutput?.skeletonOptions?.options?.length || 0}`);
        
        // 检查是否使用了默认方案
        const isDefault = data.uiOutput?.skeletonOptions?.options?.some(
          (opt: any) => opt.id === 'default_1' || opt.name === '默认方案'
        );
        
        if (isDefault) {
          console.log(`  ${YELLOW}⚠️  使用了默认方案（可能是 API 调用失败）${RESET}`);
        } else {
          console.log(`  ${GREEN}✓ 使用了 LLM 生成的方案${RESET}`);
        }
      } else {
        console.log(`${YELLOW}⚠️  响应格式异常${RESET}`);
      }
      
      return {
        name: testName,
        passed: true,
        response: response.data,
        duration,
      };
    } else {
      const errorMsg = response.data.error?.message || `HTTP ${response.status}`;
      console.log(`${RED}❌ 失败: ${errorMsg}${RESET}`);
      console.log(`  响应:`, JSON.stringify(response.data, null, 2).substring(0, 500));
      return {
        name: testName,
        passed: false,
        error: errorMsg,
        response: response.data,
        duration,
      };
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    let errorMsg = error.message || '未知错误';
    
    if (error.code === 'ECONNREFUSED') {
      errorMsg = '连接被拒绝，请确保服务器正在运行 (npm run dev)';
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorMsg = `请求超时（${duration}ms），Claude API 可能需要更长时间`;
    }
    
    console.log(`${RED}❌ 异常: ${errorMsg}${RESET}`);
    if (error.response) {
      console.log(`  响应:`, JSON.stringify(error.response.data, null, 2).substring(0, 500));
    }
    return {
      name: testName,
      passed: false,
      error: errorMsg,
      duration,
    };
  } finally {
    console.log('');
    console.log('----------------------------------------');
    console.log('');
  }
}

// 主测试函数
async function main() {
  console.log('==========================================');
  console.log('规划工作台 Claude API 测试');
  console.log('==========================================');
  console.log(`API URL: ${API_URL}`);
  console.log(`BASE URL: ${BASE_URL}`);
  console.log('');

  // 检查服务器是否运行（尝试多个端点）
  console.log(`${BLUE}检查服务器状态...${RESET}`);
  let serverRunning = false;
  const healthEndpoints = ['/api', '/planning-workbench/execute', '/'];
  
  for (const endpoint of healthEndpoints) {
    try {
      await axios.get(`${BASE_URL}${endpoint}`, { timeout: 3000, validateStatus: () => true });
      serverRunning = true;
      console.log(`${GREEN}✅ 服务器运行中 (通过 ${endpoint} 验证)${RESET}`);
      break;
    } catch (error: any) {
      // 继续尝试下一个端点
    }
  }
  
  if (!serverRunning) {
    console.log(`${RED}❌ 无法连接到服务器，请确保服务器正在运行: npm run dev${RESET}`);
    process.exit(1);
  }
  console.log('');

  // 测试用例 1: 简单行程规划（3天）
  results.push(
    await testPlanningWorkbench(
      '简单行程规划（3天，冰岛）',
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
    ),
  );

  // 测试用例 2: 中等复杂度行程（6天）
  results.push(
    await testPlanningWorkbench(
      '中等复杂度行程（6天，冰岛）',
      {
        context: {
          destination: {
            country: 'IS',
            city: 'Reykjavik',
          },
          days: 6,
          travelMode: 'self_drive',
          mustDo: ['黄金圈', '蓝湖'],
        },
        userAction: 'generate',
      },
    ),
  );

  // 测试用例 3: 长行程（10天）
  results.push(
    await testPlanningWorkbench(
      '长行程规划（10天，冰岛）',
      {
        context: {
          destination: {
            country: 'IS',
            city: 'Reykjavik',
          },
          days: 10,
          travelMode: 'self_drive',
          constraints: {
            budget: {
              total: 50000,
              currency: 'CNY',
            },
          },
        },
        userAction: 'generate',
      },
    ),
  );

  // 汇总结果
  console.log('==========================================');
  console.log('测试结果汇总');
  console.log('==========================================');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = results.length > 0 ? Math.round(totalDuration / results.length) : 0;
  
  console.log(`${GREEN}通过: ${passed}${RESET}`);
  console.log(`${RED}失败: ${failed}${RESET}`);
  console.log(`总计: ${results.length}`);
  console.log(`平均耗时: ${avgDuration}ms`);
  console.log('');

  // 详细结果
  console.log('详细结果:');
  results.forEach((result, index) => {
    const status = result.passed ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`  ${index + 1}. ${status} ${result.name}${duration}`);
    if (!result.passed && result.error) {
      console.log(`     错误: ${result.error}`);
    }
  });

  console.log('');

  // 检查是否使用了 Claude API
  console.log(`${CYAN}提示:${RESET}`);
  console.log(`  - 如果看到 "使用了默认方案" 警告，可能是 Claude API 调用失败`);
  console.log(`  - 检查服务器日志中的 "Anthropic" 或 "Claude" 关键字`);
  console.log(`  - 确保 .env 文件中配置了 ANTHROPIC_API_KEY`);
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
