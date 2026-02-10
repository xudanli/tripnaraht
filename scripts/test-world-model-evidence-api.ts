#!/usr/bin/env npx tsx
/**
 * 世界模型证据 API 测试脚本
 * 
 * 测试世界模型证据API的各个端点
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/world-model-evidence`;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
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

/**
 * 测试1: POST方式获取世界模型证据（使用tripId）
 */
async function test1_PostWithTripId() {
  log('\n【测试1】POST方式获取世界模型证据（使用tripId）', 'cyan');
  
  try {
    // 使用一个示例tripId（如果数据库中有的话）
    const tripId = 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1'; // 示例ID
    
    const response = await axios.post(API_BASE, {
      tripId,
      include: 'all',
    });

    if (response.data.success) {
      logSuccess('请求成功');
      const data = response.data.data;
      
      logInfo(`行程ID: ${data.tripId || 'N/A'}`);
      logInfo(`国家代码: ${data.countryCode}`);
      logInfo(`路线方向: ${data.routeDirectionName || 'N/A'}`);
      
      if (data.demEvidence) {
        logInfo(`DEM证据: 总距离${data.demEvidence.totalDistanceKm}km, 累计爬升${data.demEvidence.cumulativeAscentM}m`);
      }
      
      if (data.roadStates && data.roadStates.length > 0) {
        logInfo(`道路状态: ${data.roadStates.length}条道路`);
        data.roadStates.forEach((road: any) => {
          log(`  - ${road.name}: ${road.status}`, 'yellow');
        });
      }
      
      if (data.weatherWindow) {
        logInfo(`天气窗口: 最佳月份${data.weatherWindow.bestMonths.join(', ')}, 可达性${data.weatherWindow.accessibilityScore}`);
      }
      
      if (data.philosophy) {
        logInfo(`路线哲学: "${data.philosophy.coreStatement}"`);
      }
      
      return true;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP错误 ${error.response.status}: ${error.response.data?.error?.message || error.response.data?.message || 'Unknown error'}`);
    } else if (error.request) {
      logError(`请求失败: 无法连接到服务器 ${BASE_URL}`);
      logWarning('请确保服务器正在运行');
    } else {
      logError(`错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试2: POST方式获取世界模型证据（使用countryCode）
 */
async function test2_PostWithCountryCode() {
  log('\n【测试2】POST方式获取世界模型证据（使用countryCode）', 'cyan');
  
  try {
    const response = await axios.post(API_BASE, {
      countryCode: 'IS',
      month: 7,
      include: 'all',
    });

    if (response.data.success) {
      logSuccess('请求成功');
      const data = response.data.data;
      
      logInfo(`国家代码: ${data.countryCode}`);
      logInfo(`路线方向: ${data.routeDirectionName || 'N/A'}`);
      
      if (data.demEvidence) {
        logInfo(`DEM证据: 总距离${data.demEvidence.totalDistanceKm}km`);
      }
      
      if (data.weatherWindow) {
        logInfo(`天气窗口: 最佳月份${data.weatherWindow.bestMonths.join(', ')}`);
      }
      
      return true;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP错误 ${error.response.status}: ${error.response.data?.error?.message || error.response.data?.message || 'Unknown error'}`);
    } else {
      logError(`错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试3: GET方式获取世界模型证据
 */
async function test3_GetWithQueryParams() {
  log('\n【测试3】GET方式获取世界模型证据（查询参数）', 'cyan');
  
  try {
    const response = await axios.get(API_BASE, {
      params: {
        countryCode: 'IS',
        month: 7,
        include: 'all',
      },
    });

    if (response.data.success) {
      logSuccess('请求成功');
      const data = response.data.data;
      logInfo(`国家代码: ${data.countryCode}`);
      return true;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP错误 ${error.response.status}: ${error.response.data?.error?.message || error.response.data?.message || 'Unknown error'}`);
    } else {
      logError(`错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试4: 只获取DEM证据
 */
async function test4_GetDemEvidenceOnly() {
  log('\n【测试4】只获取DEM证据', 'cyan');
  
  try {
    const response = await axios.post(API_BASE, {
      countryCode: 'IS',
      include: 'dem',
    });

    if (response.data.success) {
      logSuccess('请求成功');
      const data = response.data.data;
      
      if (data.demEvidence) {
        logInfo(`DEM证据:`);
        log(`  总距离: ${data.demEvidence.totalDistanceKm}km`, 'yellow');
        log(`  累计爬升: ${data.demEvidence.cumulativeAscentM}m`, 'yellow');
        log(`  最大坡度: ${data.demEvidence.maxSlopePct}%`, 'yellow');
        log(`  疲劳指数: ${data.demEvidence.fatigueIndex}`, 'yellow');
        log(`  3天滚动爬升: ${data.demEvidence.threeDayRollingAscentM}m`, 'yellow');
      } else {
        logWarning('未返回DEM证据');
      }
      
      // 验证其他证据类型不应该存在
      if (data.roadStates || data.weatherWindow || data.philosophy) {
        logWarning('警告: 请求只包含DEM证据，但返回了其他证据类型');
      }
      
      return true;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP错误 ${error.response.status}: ${error.response.data?.error?.message || error.response.data?.message || 'Unknown error'}`);
    } else {
      logError(`错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试5: 错误处理 - 缺少必需参数
 */
async function test5_ErrorHandling() {
  log('\n【测试5】错误处理 - 缺少必需参数', 'cyan');
  
  try {
    const response = await axios.post(API_BASE, {
      // 不提供tripId或countryCode
      include: 'all',
    });

    // 应该返回错误
    if (!response.data.success) {
      logSuccess('正确返回错误');
      logInfo(`错误信息: ${response.data.error?.message || 'Unknown error'}`);
      return true;
    } else {
      logError('应该返回错误，但请求成功了');
      return false;
    }
  } catch (error: any) {
    if (error.response && !error.response.data.success) {
      logSuccess('正确返回错误');
      logInfo(`错误信息: ${error.response.data.error?.message || 'Unknown error'}`);
      return true;
    } else {
      logError(`意外的错误: ${error.message}`);
      return false;
    }
  }
}

/**
 * 测试6: 获取路线哲学
 */
async function test6_GetPhilosophy() {
  log('\n【测试6】获取路线哲学', 'cyan');
  
  try {
    const response = await axios.post(API_BASE, {
      countryCode: 'IS',
      routeDirectionId: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      include: 'philosophy',
    });

    if (response.data.success) {
      logSuccess('请求成功');
      const data = response.data.data;
      
      if (data.philosophy) {
        logInfo(`路线哲学:`);
        log(`  核心陈述: "${data.philosophy.coreStatement}"`, 'yellow');
        log(`  必须体验: ${data.philosophy.mustVisitTags.join(', ')}`, 'yellow');
        log(`  路线红线: ${data.philosophy.nonNegotiableRules.length}条`, 'yellow');
        log(`  灵活部分: ${data.philosophy.flexibleParts.length}项`, 'yellow');
      } else {
        logWarning('未返回路线哲学');
      }
      
      return true;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP错误 ${error.response.status}: ${error.response.data?.error?.message || error.response.data?.message || 'Unknown error'}`);
    } else {
      logError(`错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 测试7: 获取失败画像
 */
async function test7_GetFailureProfile() {
  log('\n【测试7】获取失败画像', 'cyan');
  
  try {
    const response = await axios.post(API_BASE, {
      countryCode: 'IS',
      routeDirectionId: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      include: 'failure',
    });

    if (response.data.success) {
      logSuccess('请求成功');
      const data = response.data.data;
      
      if (data.failureProfile) {
        logInfo(`失败画像:`);
        log(`  常见失败日期: ${data.failureProfile.commonFailureDays.join(', ')}`, 'yellow');
        log(`  典型失败原因: ${data.failureProfile.typicalFailureReasons.join(', ')}`, 'yellow');
        log(`  救援难度: ${data.failureProfile.rescueDifficulty}`, 'yellow');
        log(`  失败场景数: ${data.failureProfile.failureScenarios.length}`, 'yellow');
      } else {
        logWarning('未返回失败画像');
      }
      
      return true;
    } else {
      logError(`请求失败: ${response.data.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      logError(`HTTP错误 ${error.response.status}: ${error.response.data?.error?.message || error.response.data?.message || 'Unknown error'}`);
    } else {
      logError(`错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  log('='.repeat(80), 'cyan');
  log('世界模型证据 API 测试', 'bright');
  log('='.repeat(80), 'cyan');
  log(`API地址: ${API_BASE}`, 'cyan');
  log(`服务器地址: ${BASE_URL}`, 'cyan');
  console.log('');

  const results: Array<{ name: string; passed: boolean }> = [];

  // 运行所有测试
  results.push({ name: '测试1: POST方式（tripId）', passed: await test1_PostWithTripId() });
  results.push({ name: '测试2: POST方式（countryCode）', passed: await test2_PostWithCountryCode() });
  results.push({ name: '测试3: GET方式（查询参数）', passed: await test3_GetWithQueryParams() });
  results.push({ name: '测试4: 只获取DEM证据', passed: await test4_GetDemEvidenceOnly() });
  results.push({ name: '测试5: 错误处理', passed: await test5_ErrorHandling() });
  results.push({ name: '测试6: 获取路线哲学', passed: await test6_GetPhilosophy() });
  results.push({ name: '测试7: 获取失败画像', passed: await test7_GetFailureProfile() });

  // 输出测试结果
  console.log('');
  log('='.repeat(80), 'cyan');
  log('测试结果汇总', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  let passedCount = 0;
  let failedCount = 0;

  results.forEach((result) => {
    if (result.passed) {
      logSuccess(`${result.name}`);
      passedCount++;
    } else {
      logError(`${result.name}`);
      failedCount++;
    }
  });

  console.log('');
  log(`总计: ${results.length}个测试`, 'cyan');
  logSuccess(`通过: ${passedCount}`);
  logError(`失败: ${failedCount}`);
  
  const successRate = ((passedCount / results.length) * 100).toFixed(1);
  log(`成功率: ${successRate}%`, passedCount === results.length ? 'green' : 'yellow');
  console.log('');

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((error) => {
  logError(`测试执行失败: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
