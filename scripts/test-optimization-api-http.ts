#!/usr/bin/env npx tsx
/**
 * 优化系统 API HTTP 测试脚本
 * 
 * 实际发送 HTTP 请求测试接口
 * 
 * 使用方法: 
 *   1. 先启动服务器: npm run start:dev
 *   2. 运行测试: npx tsx scripts/test-optimization-api-http.ts
 * 
 * 环境变量:
 *   API_URL - API 服务器地址（默认: http://localhost:3000）
 *   TEST_JWT_TOKEN - JWT 认证 token（必须，接口需要认证）
 * 
 * 获取 JWT Token:
 *   1. 通过登录接口获取
 *   2. 或从前端 localStorage 中复制
 *   3. 或使用数据库直接创建测试用户
 */

// 声明为模块，避免全局作用域污染
export {};

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_TOKEN = process.env.TEST_JWT_TOKEN || '';

// ========== 测试数据 ==========

const TEST_USER_ID = 'test-user-http-001';
const TEST_TRIP_ID = 'test-trip-http-001';

const mockWeights = {
  safety: 0.25,
  experienceDensity: 0.20,
  philosophyAlignment: 0.15,
  timeSlack: 0.10,
  fatigueRisk: 0.10,
  weatherRisk: 0.10,
  budgetRisk: 0.05,
  crowdAvoidance: 0.05,
};

const mockPlan = {
  tripId: TEST_TRIP_ID,
  days: [
    {
      date: '2026-03-01',
      segments: [{ from: 'A', to: 'B', distanceKm: 100 }],
      activities: [{ name: 'Hiking', durationHours: 3 }],
    },
  ],
};

const mockContext = {
  physical: { 
    month: 3, 
    climate: { accessibilityScore: 0.8 },
    weather: { temperature: 10, windSpeed: 8, precipitation: 0.1 },
    terrain: { elevation: 500, gradient: 5 },
    hazards: [],
  },
  human: { 
    fitnessLevel: 'INTERMEDIATE',
    currentFatigue: 0.2,
    maxDailyAscentM: 800,
    riskTolerance: 0.5,
  },
  routeDirection: { 
    id: 'test-route', 
    philosophy: { scenic: true, challenging: false },
    constraints: { maxDailyDrivingHours: 8 },
  },
};

// ========== HTTP 工具 ==========

interface TestResult {
  endpoint: string;
  method: string;
  status: number | 'ERROR';
  success: boolean;
  message: string;
  data?: any;
}

async function httpRequest(
  method: string,
  path: string,
  body?: any,
): Promise<TestResult> {
  const endpoint = `${method} ${path}`;
  const url = `${BASE_URL}${path}`;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // 添加 JWT 认证
    if (JWT_TOKEN) {
      headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
    }
    
    const options: RequestInit = {
      method,
      headers,
    };
    
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);
    
    return {
      endpoint,
      method,
      status: response.status,
      success: response.ok,
      message: response.ok ? 'OK' : `HTTP ${response.status}`,
      data,
    };
  } catch (error: any) {
    return {
      endpoint,
      method,
      status: 'ERROR',
      success: false,
      message: error.message || 'Request failed',
    };
  }
}

function printResult(result: TestResult) {
  let icon: string;
  if (result.success) {
    icon = '✅';
  } else if (result.status === 404) {
    icon = '⚠️';
  } else if (result.status === 401) {
    icon = '🔒';  // 需要认证
  } else {
    icon = '❌';
  }
  const statusStr = typeof result.status === 'number' ? result.status : result.status;
  console.log(`${icon} [${statusStr}] ${result.endpoint}`);
  if (!result.success && result.data?.message) {
    console.log(`   └─ ${result.data.message}`);
  }
}

// ========== 测试用例 ==========

async function testUserAPIs(): Promise<TestResult[]> {
  console.log('\n🔵 用户端 API 测试\n');
  const results: TestResult[] = [];

  // 优化 API
  console.log('--- /api/v2/user/optimization ---');
  
  results.push(await httpRequest('POST', '/api/v2/user/optimization/evaluate', {
    plan: mockPlan,
    context: mockContext,
    userId: TEST_USER_ID,
  }));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('POST', '/api/v2/user/optimization/compare', {
    plans: [mockPlan],
    context: mockContext,
    userId: TEST_USER_ID,
  }));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', `/api/v2/user/optimization/preferences/${TEST_USER_ID}`));
  printResult(results[results.length - 1]);

  // 风险评估（需要完整的 world 对象）
  results.push(await httpRequest('POST', '/api/v2/user/optimization/risk-assessment', {
    plan: mockPlan,
    world: mockContext,  // 使用 'world' 不是 'context'
    sampleSize: 100,
  }));
  printResult(results[results.length - 1]);

  // 协商接口
  results.push(await httpRequest('POST', '/api/v2/user/optimization/negotiation', {
    plan: mockPlan,
    world: mockContext,  // 使用 'world' 不是 'context'
  }));
  printResult(results[results.length - 1]);

  // 团队 API
  console.log('\n--- /api/v2/user/team ---');
  
  results.push(await httpRequest('POST', '/api/v2/user/team', {
    name: 'Test Family',
    type: 'FAMILY',
    decisionWeightMode: 'EQUAL',
  }));
  printResult(results[results.length - 1]);

  // 实时状态 API
  console.log('\n--- /api/v2/user/realtime ---');
  
  results.push(await httpRequest('GET', `/api/v2/user/realtime/state/${TEST_TRIP_ID}`));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', `/api/v2/user/realtime/state/${TEST_TRIP_ID}/predict?hoursAhead=6`));
  printResult(results[results.length - 1]);

  return results;
}

async function testAdminAPIs(): Promise<TestResult[]> {
  console.log('\n🟠 管理端 API 测试\n');
  const results: TestResult[] = [];

  // 优化管理 API
  console.log('--- /api/v2/admin/optimization ---');
  
  results.push(await httpRequest('GET', '/api/v2/admin/optimization/stats'));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', '/api/v2/admin/optimization/health'));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', '/api/v2/admin/optimization/default-weights'));
  printResult(results[results.length - 1]);

  // 实时数据 API
  console.log('\n--- /api/v2/admin/realtime ---');
  
  results.push(await httpRequest('GET', '/api/v2/admin/realtime/subscriptions/stats'));
  printResult(results[results.length - 1]);

  // A/B 测试 API
  console.log('\n--- /api/v2/admin/experiments ---');
  
  results.push(await httpRequest('GET', '/api/v2/admin/experiments'));
  printResult(results[results.length - 1]);

  // 公理 API
  console.log('\n--- /api/v2/admin/axioms ---');
  
  results.push(await httpRequest('GET', '/api/v2/admin/axioms/report'));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', '/api/v2/admin/axioms/health'));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', '/api/v2/admin/axioms/utility/structure'));
  printResult(results[results.length - 1]);

  results.push(await httpRequest('GET', '/api/v2/admin/axioms/essence'));
  printResult(results[results.length - 1]);

  return results;
}

// ========== 主函数 ==========

async function main() {
  const tokenStatus = JWT_TOKEN ? `已设置 (${JWT_TOKEN.substring(0, 20)}...)` : '❌ 未设置';
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         TripNARA 优化系统 HTTP 测试                          ║
║                                                              ║
║  目标服务器: ${BASE_URL.padEnd(42)}║
╚══════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`🔑 JWT Token: ${tokenStatus}`);
  if (!JWT_TOKEN) {
    console.log(`
⚠️  警告: 未设置 JWT Token，所有需要认证的接口将返回 401

💡 设置方法:
   export TEST_JWT_TOKEN="your_jwt_token_here"
   npx tsx scripts/test-optimization-api-http.ts

   或直接运行:
   TEST_JWT_TOKEN="your_token" npx tsx scripts/test-optimization-api-http.ts
`);
  }
  console.log('');

  // 检查服务器是否运行
  console.log('🔍 检查服务器状态...');
  try {
    const healthCheck = await fetch(`${BASE_URL}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (healthCheck.ok) {
      console.log('✅ 服务器运行正常\n');
    } else {
      console.log(`⚠️ 服务器返回 ${healthCheck.status}\n`);
    }
  } catch (error: any) {
    console.log(`❌ 无法连接服务器: ${error.message}`);
    console.log('\n💡 请先启动服务器: npm run start:dev\n');
    process.exit(1);
  }

  // 运行测试
  const allResults: TestResult[] = [];
  
  allResults.push(...await testUserAPIs());
  allResults.push(...await testAdminAPIs());

  // 统计结果
  console.log('\n' + '='.repeat(60));
  console.log('  测试结果统计');
  console.log('='.repeat(60) + '\n');

  const successCount = allResults.filter(r => r.success).length;
  const authCount = allResults.filter(r => r.status === 401).length;
  const notFoundCount = allResults.filter(r => r.status === 404).length;
  const failCount = allResults.filter(r => !r.success && r.status !== 404 && r.status !== 401).length;
  const errorCount = allResults.filter(r => r.status === 'ERROR').length;

  console.log(`✅ 成功: ${successCount}`);
  console.log(`🔒 401 (需要认证): ${authCount}`);
  console.log(`⚠️ 404 (路由未注册): ${notFoundCount}`);
  console.log(`❌ 其他失败: ${failCount}`);
  console.log(`🔴 连接错误: ${errorCount}`);
  console.log(`📊 总计: ${allResults.length}`);

  if (notFoundCount > 0) {
    console.log('\n💡 404 错误说明:');
    console.log('   新增的控制器可能需要重新构建或热重载');
    console.log('   尝试重启服务器: npm run start:dev');
  }

  // 详细失败信息
  const failures = allResults.filter(r => !r.success && r.status !== 404);
  if (failures.length > 0) {
    console.log('\n❌ 失败详情:');
    failures.forEach(f => {
      console.log(`   ${f.endpoint}: ${f.message}`);
    });
  }
}

main().catch(console.error);
