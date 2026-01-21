// scripts/test-admin-api.ts
/**
 * 后台管理 API 测试脚本
 * 
 * 测试后台管理系统接口（按优先级）：
 * 
 * Phase 1 (高优先级):
 * 1. 行程管理接口
 *    - GET /trips/admin - 行程列表
 *    - GET /trips/admin/stats - 行程统计
 *    - GET /trips/admin/:id - 行程详情
 *    - POST /trips/admin/batch - 批量操作
 *    - GET /trips/admin/:id/export - 导出数据
 * 
 * 2. 决策日志管理接口
 *    - GET /decision/admin/logs - 决策日志列表
 *    - GET /decision/admin/logs/:id - 决策日志详情
 *    - GET /decision/admin/stats - 决策统计
 *    - GET /decision/admin/analytics - 决策分析报告
 * 
 * 3. 系统监控接口
 *    - GET /system/admin/metrics - 系统指标
 *    - GET /system/admin/performance - 性能指标
 *    - GET /system/admin/errors - 错误统计
 * 
 * Phase 2 (中优先级):
 * 4. Context 管理接口
 *    - GET /context/admin/metrics - Context 指标统计
 *    - GET /context/admin/packages - Context Package 列表
 *    - GET /context/admin/packages/:id - Context Package 详情
 * 
 * 使用方法：
 * npm run test:admin-api
 * 或
 * ts-node scripts/test-admin-api.ts
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
  category: string;
}

const results: TestResult[] = [];

/**
 * 测试函数
 */
async function testEndpoint(
  name: string,
  category: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: any,
  timeout: number = 30000,
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🧪 [${category}] 测试: ${name}`);
    console.log(`   ${method} ${url}`);
    
    if (data) {
      const dataStr = JSON.stringify(data, null, 2);
      console.log(`   请求体: ${dataStr.substring(0, 500)}${dataStr.length > 500 ? '...' : ''}`);
    }

    const config: any = {
      method,
      url: `${API_BASE}${url}`,
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
      const dataStr = JSON.stringify(responseData.data, null, 2);
      console.log(`      ${dataStr.substring(0, 800)}${dataStr.length > 800 ? '...' : ''}`);
    } else {
      console.log(`   ⚠️  响应包含错误:`);
      console.log(`      ${JSON.stringify(responseData.error, null, 2)}`);
    }

    return {
      name,
      category,
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
      errorMessage = error.message || '未知错误';
    }
    
    console.log(`   ❌ 失败: ${errorMessage}`);
    console.log(`   ⏱️  耗时: ${duration}ms`);

    return {
      name,
      category,
      success: false,
      status: error.response?.status,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * 测试行程管理接口
 */
async function testTripsAdmin() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 测试行程管理接口 (Phase 1 - 高优先级)');
  console.log('='.repeat(80));

  // 1. 获取行程列表
  const listResult = await testEndpoint(
    '获取行程列表',
    '行程管理',
    'GET',
    '/trips/admin?page=1&limit=10&sortBy=createdAt&sortOrder=desc'
  );
  results.push(listResult);

  // 从列表中获取一个 tripId（如果存在）
  let testTripId: string | null = null;
  if (listResult.success && listResult.data?.data?.items?.length > 0) {
    testTripId = listResult.data.data.items[0].id;
    console.log(`\n   📌 使用测试 Trip ID: ${testTripId}`);
  }

  // 2. 获取行程统计
  await testEndpoint(
    '获取行程统计信息',
    '行程管理',
    'GET',
    '/trips/admin/stats?startDate=2024-01-01&endDate=2024-12-31'
  ).then(r => results.push(r));

  // 3. 获取行程详情（如果有测试ID）
  if (testTripId) {
    await testEndpoint(
      '获取行程详情',
      '行程管理',
      'GET',
      `/trips/admin/${testTripId}`
    ).then(r => results.push(r));

    // 4. 导出行程数据
    await testEndpoint(
      '导出行程数据 (JSON)',
      '行程管理',
      'GET',
      `/trips/admin/${testTripId}/export?format=json`
    ).then(r => results.push(r));
  } else {
    console.log('\n   ⚠️  跳过行程详情和导出测试（没有可用的 Trip ID）');
  }

  // 5. 批量操作（使用不存在的ID，避免实际删除）
  await testEndpoint(
    '批量操作（测试，不会实际执行）',
    '行程管理',
    'POST',
    '/trips/admin/batch',
    {
      action: 'UPDATE_STATUS',
      tripIds: ['test-id-1', 'test-id-2'],
      params: {
        status: 'CANCELLED'
      }
    }
  ).then(r => results.push(r));
}

/**
 * 测试决策日志管理接口
 */
async function testDecisionAdmin() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 测试决策日志管理接口 (Phase 1 - 高优先级)');
  console.log('='.repeat(80));

  // 1. 获取决策日志列表
  const logsResult = await testEndpoint(
    '获取决策日志列表',
    '决策日志管理',
    'GET',
    '/decision/admin/logs?page=1&limit=10&sortBy=timestamp&sortOrder=desc'
  );
  results.push(logsResult);

  // 从列表中获取一个 logId（如果存在）
  let testLogId: string | null = null;
  if (logsResult.success && logsResult.data?.data?.items?.length > 0) {
    testLogId = logsResult.data.data.items[0].id;
    console.log(`\n   📌 使用测试 Log ID: ${testLogId}`);
  }

  // 2. 获取决策日志详情（如果有测试ID）
  if (testLogId) {
    await testEndpoint(
      '获取决策日志详情',
      '决策日志管理',
      'GET',
      `/decision/admin/logs/${testLogId}`
    ).then(r => results.push(r));
  } else {
    console.log('\n   ⚠️  跳过决策日志详情测试（没有可用的 Log ID）');
  }

  // 3. 获取决策统计
  await testEndpoint(
    '获取决策统计信息',
    '决策日志管理',
    'GET',
    '/decision/admin/stats?startDate=2024-01-01&endDate=2024-12-31'
  ).then(r => results.push(r));

  // 4. 获取决策分析报告
  await testEndpoint(
    '获取决策分析报告',
    '决策日志管理',
    'GET',
    '/decision/admin/analytics?startDate=2024-01-01&endDate=2024-12-31'
  ).then(r => results.push(r));

  // 5. 测试现有的决策统计接口（按国家）
  await testEndpoint(
    '按国家统计决策分布',
    '决策日志管理',
    'GET',
    '/decision-stats/by-country?countryCode=IS&startDate=2024-01-01&endDate=2024-12-31'
  ).then(r => results.push(r));

  // 6. 按 Persona 统计
  await testEndpoint(
    '按 Persona 统计触发频次',
    '决策日志管理',
    'GET',
    '/decision-stats/by-persona?startDate=2024-01-01&endDate=2024-12-31'
  ).then(r => results.push(r));
}

/**
 * 测试系统监控接口
 */
async function testSystemAdmin() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 测试系统监控接口 (Phase 1 - 高优先级)');
  console.log('='.repeat(80));

  // 1. 获取系统指标
  await testEndpoint(
    '获取系统指标',
    '系统监控',
    'GET',
    '/system/admin/metrics'
  ).then(r => results.push(r));

  // 2. 获取性能指标
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await testEndpoint(
    '获取性能指标',
    '系统监控',
    'GET',
    `/system/admin/performance?startTime=${startTime}&endTime=${endTime}&granularity=hour`
  ).then(r => results.push(r));

  // 3. 获取错误统计
  await testEndpoint(
    '获取错误日志统计',
    '系统监控',
    'GET',
    `/system/admin/errors?startTime=${startTime}&endTime=${endTime}`
  ).then(r => results.push(r));

  // 4. 测试现有的系统状态接口
  await testEndpoint(
    '获取系统状态（现有接口）',
    '系统监控',
    'GET',
    '/system/status'
  ).then(r => results.push(r));
}

/**
 * 测试 Context 管理接口
 */
async function testContextAdmin() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 测试 Context 管理接口 (Phase 2 - 中优先级)');
  console.log('='.repeat(80));

  // 1. 获取 Context 指标统计
  await testEndpoint(
    '获取 Context 指标统计',
    'Context 管理',
    'GET',
    '/context/admin/metrics'
  ).then(r => results.push(r));

  // 2. 获取 Context Package 列表
  const packagesResult = await testEndpoint(
    '获取 Context Package 列表',
    'Context 管理',
    'GET',
    '/context/admin/packages?page=1&limit=10'
  );
  results.push(packagesResult);

  // 从列表中获取一个 packageId（如果存在）
  let testPackageId: string | null = null;
  if (packagesResult.success && packagesResult.data?.data?.items?.length > 0) {
    testPackageId = packagesResult.data.data.items[0].id;
    console.log(`\n   📌 使用测试 Package ID: ${testPackageId}`);
  }

  // 3. 获取 Context Package 详情（如果有测试ID）
  if (testPackageId) {
    await testEndpoint(
      '获取 Context Package 详情',
      'Context 管理',
      'GET',
      `/context/admin/packages/${testPackageId}`
    ).then(r => results.push(r));
  } else {
    console.log('\n   ⚠️  跳过 Context Package 详情测试（没有可用的 Package ID）');
  }
}

/**
 * 生成测试报告
 */
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试报告');
  console.log('='.repeat(80));

  const total = results.length;
  const success = results.filter(r => r.success).length;
  const failed = total - success;

  console.log(`\n总测试数: ${total}`);
  console.log(`✅ 成功: ${success}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`成功率: ${((success / total) * 100).toFixed(2)}%`);

  // 按分类统计
  const byCategory: Record<string, { total: number; success: number }> = {};
  results.forEach(r => {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { total: 0, success: 0 };
    }
    byCategory[r.category].total++;
    if (r.success) {
      byCategory[r.category].success++;
    }
  });

  console.log('\n按分类统计:');
  Object.entries(byCategory).forEach(([category, stats]) => {
    const rate = ((stats.success / stats.total) * 100).toFixed(2);
    console.log(`  ${category}: ${stats.success}/${stats.total} (${rate}%)`);
  });

  // 显示失败的测试
  const failedTests = results.filter(r => !r.success);
  if (failedTests.length > 0) {
    console.log('\n❌ 失败的测试:');
    failedTests.forEach(r => {
      console.log(`  - [${r.category}] ${r.name}`);
      console.log(`    错误: ${r.error || '未知错误'}`);
      if (r.status) {
        console.log(`    状态码: ${r.status}`);
      }
    });
  }

  // 显示平均响应时间
  const avgDuration = results
    .filter(r => r.duration)
    .reduce((sum, r) => sum + (r.duration || 0), 0) / results.filter(r => r.duration).length;
  console.log(`\n⏱️  平均响应时间: ${avgDuration.toFixed(2)}ms`);

  // 显示最慢的测试
  const slowTests = [...results]
    .filter(r => r.duration)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 5);
  if (slowTests.length > 0) {
    console.log('\n🐌 最慢的 5 个测试:');
    slowTests.forEach(r => {
      console.log(`  - [${r.category}] ${r.name}: ${r.duration}ms`);
    });
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始测试后台管理 API');
  console.log(`📍 服务器地址: ${BASE_URL}`);
  console.log(`📍 API 基础路径: ${API_BASE}`);

  try {
    // Phase 1: 高优先级接口
    await testTripsAdmin();
    await testDecisionAdmin();
    await testSystemAdmin();

    // Phase 2: 中优先级接口
    await testContextAdmin();

    // 生成报告
    generateReport();

    // 退出码
    const failedCount = results.filter(r => !r.success).length;
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('\n❌ 测试执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

export { testTripsAdmin, testDecisionAdmin, testSystemAdmin, testContextAdmin };
