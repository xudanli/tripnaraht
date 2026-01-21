// scripts/test-agent-admin-api.ts
/**
 * Agent 运行管理 API 测试脚本
 * 
 * 测试接口：
 * 1. GET /agent/admin/runs/stats - Agent 运行统计
 * 2. GET /agent/admin/performance - Agent 性能分析
 * 
 * 使用方法：
 * npm run test:agent-admin-api
 * 或
 * ts-node scripts/test-agent-admin-api.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

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
  params?: any,
  timeout: number = 30000,
): Promise<TestResult> {
  const startTime = Date.now();
  const fullUrl = `${API_BASE}${url}`;
  
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${fullUrl}`);
    if (params) {
      console.log(`   参数:`, params);
    }

    const config: any = {
      method,
      url: fullUrl,
      timeout,
      validateStatus: () => true, // 接受所有状态码
    };

    if (method === 'GET' && params) {
      config.params = params;
    } else if (method === 'POST' && params) {
      config.data = params;
    }

    const response = await axios(config);
    const duration = Date.now() - startTime;

    const result: TestResult = {
      name,
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      data: response.data,
      duration,
    };

    if (result.success) {
      console.log(`   ✅ 成功 (${response.status}) - ${duration}ms`);
      if (response.data?.data) {
        console.log(`   响应数据:`, JSON.stringify(response.data.data, null, 2).substring(0, 500));
      }
    } else {
      console.log(`   ❌ 失败 (${response.status}) - ${duration}ms`);
      console.log(`   错误:`, response.data?.message || response.statusText);
      result.error = response.data?.message || response.statusText;
    }

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`   ❌ 异常 - ${duration}ms`);
    console.log(`   错误:`, error.message);
    
    return {
      name,
      success: false,
      error: error.message,
      duration,
    };
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 开始测试 Agent 运行管理 API');
  console.log(`📍 基础 URL: ${BASE_URL}`);
  console.log(`📍 API 路径: ${API_BASE}`);

  // 1. 测试统计信息接口
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试 1: Agent 运行统计');
  console.log('='.repeat(60));
  
  // 1.1 无参数统计
  results.push(await testEndpoint(
    '获取运行统计（无参数）',
    'GET',
    '/agent/admin/runs/stats'
  ));

  // 1.2 带时间范围统计
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // 最近7天

  results.push(await testEndpoint(
    '获取运行统计（最近7天）',
    'GET',
    '/agent/admin/runs/stats',
    {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }
  ));

  // 1.3 按阶段筛选统计
  results.push(await testEndpoint(
    '获取运行统计（按阶段）',
    'GET',
    '/agent/admin/runs/stats',
    {
      planningPhase: 'planning',
    }
  ));

  // 2. 测试性能分析接口
  console.log('\n' + '='.repeat(60));
  console.log('⚡ 测试 2: Agent 性能分析');
  console.log('='.repeat(60));

  // 2.1 无参数性能分析
  results.push(await testEndpoint(
    '获取性能分析（无参数）',
    'GET',
    '/agent/admin/performance'
  ));

  // 2.2 带时间范围性能分析
  results.push(await testEndpoint(
    '获取性能分析（最近7天）',
    'GET',
    '/agent/admin/performance',
    {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }
  ));

  // 2.3 带时间范围性能分析（最近30天）
  const startDate30 = new Date();
  startDate30.setDate(startDate30.getDate() - 30);

  results.push(await testEndpoint(
    '获取性能分析（最近30天）',
    'GET',
    '/agent/admin/performance',
    {
      startDate: startDate30.toISOString(),
      endDate: endDate.toISOString(),
    }
  ));

  // 打印总结
  console.log('\n' + '='.repeat(60));
  console.log('📋 测试总结');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;

  console.log(`\n总计: ${results.length} 个测试`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log(`⏱️  平均耗时: ${avgDuration.toFixed(0)}ms`);

  console.log('\n详细结果:');
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    const status = result.status ? `(${result.status})` : '';
    const duration = result.duration ? `${result.duration}ms` : '';
    console.log(`${icon} ${index + 1}. ${result.name} ${status} ${duration}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  // 打印响应示例
  console.log('\n' + '='.repeat(60));
  console.log('📄 响应示例');
  console.log('='.repeat(60));

  const statsResult = results.find(r => r.name.includes('统计') && r.success);
  if (statsResult?.data?.data) {
    console.log('\n统计信息响应:');
    console.log(JSON.stringify(statsResult.data.data, null, 2));
  }

  const performanceResult = results.find(r => r.name.includes('性能') && r.success);
  if (performanceResult?.data?.data) {
    console.log('\n性能分析响应:');
    console.log(JSON.stringify(performanceResult.data.data, null, 2));
  }

  // 退出码
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
