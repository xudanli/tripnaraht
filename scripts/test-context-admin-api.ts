// scripts/test-context-admin-api.ts
/**
 * Context Admin API 测试脚本
 * 
 * 测试 Context 后台管理接口：
 * 1. GET /context/admin/metrics - Context 指标统计
 * 2. GET /context/admin/packages - Context Package 列表
 * 3. GET /context/admin/packages/:id - Context Package 详情
 * 4. GET /context/admin/analytics - Context 分析报告
 * 
 * 使用方法：
 * npm run test:context-admin-api
 * 或
 * ts-node scripts/test-context-admin-api.ts
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
      const dataStr = JSON.stringify(responseData.data, null, 2);
      console.log(`      ${dataStr.substring(0, 800)}${dataStr.length > 800 ? '...' : ''}`);
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
  console.log('🚀 开始测试 Context Admin API 接口\n');
  console.log(`📍 基础 URL: ${BASE_URL}`);
  console.log(`📍 Context API: ${CONTEXT_API_BASE}\n`);

  // 测试数据
  const testTripId = 'test-trip-123';
  const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7天前
  const endTime = new Date().toISOString();

  // 1. 测试获取指标统计（无参数）
  const metricsResult1 = await testEndpoint(
    'GET /context/admin/metrics - 指标统计（无参数）',
    'GET',
    '/admin/metrics',
  );
  results.push(metricsResult1);

  // 2. 测试获取指标统计（带参数）
  const metricsResult2 = await testEndpoint(
    'GET /context/admin/metrics - 指标统计（带参数）',
    'GET',
    `/admin/metrics?tripId=${testTripId}&phase=planning&agent=PLANNER&startTime=${startTime}&endTime=${endTime}`,
  );
  results.push(metricsResult2);

  // 3. 测试获取 Context Package 列表（无参数）
  const packagesResult1 = await testEndpoint(
    'GET /context/admin/packages - Package 列表（无参数）',
    'GET',
    '/admin/packages',
  );
  results.push(packagesResult1);

  // 4. 测试获取 Context Package 列表（带参数）
  const packagesResult2 = await testEndpoint(
    'GET /context/admin/packages - Package 列表（带参数）',
    'GET',
    `/admin/packages?page=1&limit=10&phase=planning&agent=PLANNER&search=冰岛`,
  );
  results.push(packagesResult2);

  // 5. 测试获取 Context Package 详情（需要先有一个 package ID）
  let packageId: string | null = null;
  if (packagesResult2.success && packagesResult2.data?.success && packagesResult2.data?.data?.packages?.length > 0) {
    packageId = packagesResult2.data.data.packages[0].id;
    console.log(`\n   💾 使用 Package ID: ${packageId}`);
    
    const packageDetailResult = await testEndpoint(
      'GET /context/admin/packages/:id - Package 详情',
      'GET',
      `/admin/packages/${packageId}`,
    );
    results.push(packageDetailResult);
  } else {
    console.log(`\n⚠️  跳过 Package 详情测试：没有可用的 Package ID`);
    
    // 尝试使用一个可能存在的 ID
    const packageDetailResult = await testEndpoint(
      'GET /context/admin/packages/:id - Package 详情（测试不存在）',
      'GET',
      '/admin/packages/test-package-id-12345',
    );
    results.push(packageDetailResult);
  }

  // 6. 测试获取分析报告（无参数）
  const analyticsResult1 = await testEndpoint(
    'GET /context/admin/analytics - 分析报告（无参数）',
    'GET',
    '/admin/analytics',
  );
  results.push(analyticsResult1);

  // 7. 测试获取分析报告（带参数）
  const analyticsResult2 = await testEndpoint(
    'GET /context/admin/analytics - 分析报告（带参数）',
    'GET',
    `/admin/analytics?startTime=${startTime}&endTime=${endTime}&granularity=day`,
  );
  results.push(analyticsResult2);

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
