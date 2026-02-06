/**
 * Booking.com API 测试脚本
 * 
 * 测试 Booking.com 租车搜索 API 的所有端点
 * 
 * 使用方法:
 *   npx ts-node scripts/test-booking-com-api.ts
 * 
 * 环境要求:
 *   - 服务器运行在 http://localhost:3000
 *   - RAPIDAPI_BOOKING_COM_API_KEY 已配置
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/booking-com`;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 测试结果统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function recordTest(success: boolean) {
  totalTests++;
  if (success) {
    passedTests++;
  } else {
    failedTests++;
  }
}

// 测试用例
async function testHealthCheck() {
  logInfo('\n📋 测试 1: 检查服务状态');
  try {
    const response = await api.get('/health');
    if (response.data.success && response.data.data.available) {
      logSuccess('服务可用');
      recordTest(true);
      return true;
    } else {
      logError(`服务不可用: ${JSON.stringify(response.data)}`);
      logWarning('💡 请检查 RAPIDAPI_BOOKING_COM_API_KEY 配置');
      recordTest(false);
      return false;
    }
  } catch (error: any) {
    logError(`健康检查失败: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      logWarning('💡 请确保服务器运行在 http://localhost:3000');
    }
    recordTest(false);
    return false;
  }
}

async function testSearchCarRentals() {
  logInfo('\n📋 测试 2: 搜索租车（基本参数）');
  try {
    const params = {
      pick_up_latitude: 40.7128,      // 纽约市
      pick_up_longitude: -74.0060,
      drop_off_latitude: 40.7589,    // 纽约市（不同位置）
      drop_off_longitude: -73.9851,
      pick_up_date: '2026-02-15',
      drop_off_date: '2026-02-20',
      pick_up_time: '10:00',
      drop_off_time: '10:00',
      driver_age: 25,
      currency_code: 'USD',
      location: 'US',
    };

    const response = await api.post('/search', params);
    
    if (response.data.success) {
      const rentals = response.data.data?.data || [];
      logSuccess(`搜索成功，找到 ${rentals.length} 个租车选项`);
      
      if (rentals.length > 0) {
        const firstRental = rentals[0];
        logInfo(`  示例: ${firstRental.company} - ${firstRental.vehicle_type}`);
        if (firstRental.price) {
          logInfo(`  价格: ${firstRental.price.currency} ${firstRental.price.amount}`);
        }
      }
      
      recordTest(true);
      return true;
    } else {
      logError(`搜索失败: ${JSON.stringify(response.data)}`);
      recordTest(false);
      return false;
    }
  } catch (error: any) {
    logError(`搜索租车失败: ${error.message}`);
    if (error.response) {
      logError(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    recordTest(false);
    return false;
  }
}

async function testSearchCarRentalsWithDates() {
  logInfo('\n📋 测试 3: 搜索租车（指定日期）');
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const params = {
      pick_up_latitude: 34.0522,      // 洛杉矶
      pick_up_longitude: -118.2437,
      drop_off_latitude: 34.0522,
      drop_off_longitude: -118.2437,
      pick_up_date: tomorrow.toISOString().split('T')[0],
      drop_off_date: nextWeek.toISOString().split('T')[0],
      pick_up_time: '14:00',
      drop_off_time: '14:00',
      driver_age: 30,
      currency_code: 'USD',
      location: 'US',
    };

    const response = await api.post('/search', params);
    
    if (response.data.success) {
      const rentals = response.data.data?.data || [];
      logSuccess(`搜索成功，找到 ${rentals.length} 个租车选项`);
      recordTest(true);
      return true;
    } else {
      logError(`搜索失败: ${JSON.stringify(response.data)}`);
      recordTest(false);
      return false;
    }
  } catch (error: any) {
    logError(`搜索租车失败: ${error.message}`);
    recordTest(false);
    return false;
  }
}

async function testMonitoringStats() {
  logInfo('\n📋 测试 4: 获取监控统计');
  try {
    const response = await api.get('/monitoring/stats?days=7');
    
    if (response.data.success) {
      const data = response.data.data;
      logSuccess('获取监控统计成功');
      logInfo(`  总调用次数: ${data.performance.totalCalls}`);
      logInfo(`  成功率: ${(data.performance.successRate * 100).toFixed(2)}%`);
      logInfo(`  平均响应时间: ${data.performance.avgResponseTime}ms`);
      logInfo(`  总成本估算: $${data.totalCostEstimate.toFixed(2)}`);
      logInfo(`  每日统计数量: ${data.dailyStats.length}`);
      recordTest(true);
      return true;
    } else {
      logError(`获取监控统计失败: ${JSON.stringify(response.data)}`);
      recordTest(false);
      return false;
    }
  } catch (error: any) {
    logError(`获取监控统计失败: ${error.message}`);
    recordTest(false);
    return false;
  }
}

async function testCostCheck() {
  logInfo('\n📋 测试 5: 检查成本限制');
  try {
    const response = await api.get('/monitoring/cost-check?limit=100&days=7');
    
    if (response.data.success) {
      const data = response.data.data;
      logSuccess('检查成本限制成功');
      logInfo(`  当前成本: $${data.currentCost.toFixed(2)}`);
      logInfo(`  限制值: $${data.limit}`);
      logInfo(`  是否超过限制: ${data.exceeded ? '是' : '否'}`);
      
      if (data.exceeded) {
        logWarning('⚠️ 成本超过限制！');
      } else {
        logSuccess('✅ 成本在限制范围内');
      }
      
      recordTest(true);
      return true;
    } else {
      logError(`检查成本限制失败: ${JSON.stringify(response.data)}`);
      recordTest(false);
      return false;
    }
  } catch (error: any) {
    logError(`检查成本限制失败: ${error.message}`);
    recordTest(false);
    return false;
  }
}

async function testInvalidParameters() {
  logInfo('\n📋 测试 6: 无效参数处理');
  try {
    const params = {
      pick_up_latitude: 40.7128,
      // 缺少必需参数
    };

    const response = await api.post('/search', params);
    
    // 应该返回错误
    if (!response.data.success) {
      logSuccess('正确处理了无效参数');
      recordTest(true);
      return true;
    } else {
      logError('应该返回错误但没有返回');
      recordTest(false);
      return false;
    }
  } catch (error: any) {
    // 400 错误是预期的
    if (error.response && error.response.status === 400) {
      logSuccess('正确处理了无效参数（返回 400）');
      recordTest(true);
      return true;
    } else {
      logError(`意外的错误: ${error.message}`);
      recordTest(false);
      return false;
    }
  }
}

// 主测试函数
async function runTests() {
  log('\n🚀 开始测试 Booking.com API...', 'blue');
  log(`📡 API Base URL: ${API_BASE}\n`, 'cyan');

  // 检查服务器连接
  logInfo('检查服务器连接...');
  try {
    await axios.get(`${BASE_URL}/api/booking-com/health`, { timeout: 5000 });
    logSuccess('服务器连接正常');
  } catch (error: any) {
    logError(`无法连接到服务器: ${error.message}`);
    logWarning('💡 请确保服务器运行在 http://localhost:3000');
    logWarning('💡 运行命令: npm run start:dev');
    process.exit(1);
  }

  // 运行测试
  await testHealthCheck();
  await testSearchCarRentals();
  await testSearchCarRentalsWithDates();
  await testMonitoringStats();
  await testCostCheck();
  await testInvalidParameters();

  // 输出测试结果
  log('\n' + '='.repeat(50), 'blue');
  log(`📊 测试结果总结`, 'blue');
  log('='.repeat(50), 'blue');
  log(`总测试数: ${totalTests}`, 'cyan');
  log(`通过: ${passedTests}`, 'green');
  log(`失败: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  log(`成功率: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%`, 'cyan');
  log('='.repeat(50) + '\n', 'blue');

  if (failedTests === 0) {
    logSuccess('🎉 所有测试通过！');
    process.exit(0);
  } else {
    logError(`❌ ${failedTests} 个测试失败`);
    process.exit(1);
  }
}

// 运行测试
runTests().catch((error) => {
  logError(`测试执行失败: ${error.message}`);
  process.exit(1);
});
