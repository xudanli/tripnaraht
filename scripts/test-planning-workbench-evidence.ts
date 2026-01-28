#!/usr/bin/env ts-node

/**
 * 规划工作台证据获取接口测试脚本
 * 使用方法: ts-node scripts/test-planning-workbench-evidence.ts [tripId]
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const TRIP_ID = process.argv[2];

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60秒超时，因为证据获取可能需要较长时间
  headers: {
    'Content-Type': 'application/json',
  },
});

// 日志函数
function logSection(title: string) {
  console.log('\n' + '='.repeat(50));
  console.log(title);
  console.log('-'.repeat(50));
}

function logInfo(message: string) {
  console.log(`ℹ️  ${message}`);
}

function logSuccess(message: string) {
  console.log(`✅ ${message}`);
}

function logError(message: string) {
  console.log(`❌ ${message}`);
}

function logWarning(message: string) {
  console.log(`⚠️  ${message}`);
}

// 获取行程ID
async function getTripId(): Promise<string> {
  if (TRIP_ID) {
    return TRIP_ID;
  }

  try {
    logInfo('未提供 TRIP_ID，尝试从数据库获取最近的行程...');
    const response = await api.get('/trips', {
      params: { limit: 1 },
    });
    
    if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
      const tripId = response.data.data[0].id;
      logInfo(`使用行程ID: ${tripId}`);
      return tripId;
    }
    
    throw new Error('未找到任何行程');
  } catch (error: any) {
    logError(`无法获取行程ID: ${error.message}`);
    throw error;
  }
}

// 检查服务状态
async function checkServiceStatus(): Promise<boolean> {
  try {
    const response = await api.get('/planning-workbench/trips/test/readiness', {
      validateStatus: () => true, // 接受任何状态码
    });
    return response.status === 200 || response.status === 404 || response.status === 400;
  } catch (error) {
    return false;
  }
}

// 测试结果统计
let passed = 0;
let failed = 0;
let skipped = 0;

// 测试 1: 获取准备度检查结果
async function testGetReadiness(tripId: string) {
  logSection('【测试 1】获取准备度检查结果（查看缺少的证据）');
  
  try {
    const response = await api.get(`/planning-workbench/trips/${tripId}/readiness`, {
      params: { lang: 'zh' },
    });
    
    if (response.data.success) {
      const summary = response.data.data.summary || {};
      const findingsCount = response.data.data.findings?.length || 0;
      
      logSuccess('准备度检查接口测试通过');
      console.log(`  检查结果数量: ${findingsCount}`);
      console.log(`  阻塞项: ${summary.totalBlockers || 0}`);
      console.log(`  必须项: ${summary.totalMust || 0}`);
      console.log(`  建议项: ${summary.totalShould || 0}`);
      console.log(`  可选项: ${summary.totalOptional || 0}`);
      
      passed++;
      return response.data;
    } else {
      logError(`准备度检查接口测试失败: ${response.data.error?.message || 'Unknown error'}`);
      failed++;
      return null;
    }
  } catch (error: any) {
    logError(`准备度检查接口测试失败: ${error.message}`);
    failed++;
    return null;
  }
}

// 测试 2: 综合证据获取接口
async function testFetchAllEvidence(tripId: string) {
  logSection('【测试 2】综合证据获取接口 - 获取所有类型的证据');
  
  try {
    const response = await api.post(`/planning-workbench/trips/${tripId}/fetch-evidence`);
    
    if (response.data.success) {
      const data = response.data.data;
      const totalPlaces = data.totalPlaces || 0;
      const processed = data.processedPlaces || 0;
      const successCount = data.successCount || 0;
      const partialCount = data.partialCount || 0;
      const failedCount = data.failedCount || 0;
      const requestedTypes = data.requestedEvidenceTypes?.join(', ') || 'all';
      
      logSuccess('综合证据获取接口测试通过');
      console.log(`  总地点数: ${totalPlaces}`);
      console.log(`  已处理地点数: ${processed}`);
      console.log(`  成功获取: ${successCount}`);
      console.log(`  部分成功: ${partialCount}`);
      console.log(`  失败: ${failedCount}`);
      console.log(`  请求的证据类型: ${requestedTypes}`);
      
      // 显示前3个结果详情
      if (data.results && data.results.length > 0) {
        console.log('\n  前3个处理结果:');
        data.results.slice(0, 3).forEach((result: any) => {
          const evidenceTypes = result.evidenceTypes?.join(', ') || 'none';
          console.log(`    - ${result.placeName} (ID: ${result.placeId}): ${result.status} [${evidenceTypes}]`);
          if (result.errors && Object.keys(result.errors).length > 0) {
            Object.entries(result.errors).forEach(([type, error]: [string, any]) => {
              console.log(`      错误 (${type}): ${error}`);
            });
          }
        });
      }
      
      passed++;
      return data;
    } else {
      logError(`综合证据获取接口测试失败: ${response.data.error?.message || 'Unknown error'}`);
      failed++;
      return null;
    }
  } catch (error: any) {
    logError(`综合证据获取接口测试失败: ${error.message}`);
    if (error.response) {
      console.log(`  响应状态: ${error.response.status}`);
      console.log(`  响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    failed++;
    return null;
  }
}

// 测试 3: 只获取天气数据
async function testFetchWeather(tripId: string) {
  logSection('【测试 3】只获取天气数据');
  
  try {
    const response = await api.post(`/planning-workbench/trips/${tripId}/fetch-evidence?evidenceTypes=weather`);
    
    if (response.data.success) {
      const data = response.data.data;
      const successCount = data.successCount || 0;
      const requestedTypes = data.requestedEvidenceTypes?.join(', ') || 'weather';
      
      logSuccess('天气数据获取接口测试通过');
      console.log(`  成功获取天气数据的地点数: ${successCount}`);
      console.log(`  请求的证据类型: ${requestedTypes}`);
      
      // 显示一个成功获取天气数据的示例
      const weatherExample = data.results?.find((r: any) => 
        r.status === 'success' && r.evidenceTypes?.includes('weather')
      );
      if (weatherExample) {
        console.log(`  示例地点: ${weatherExample.placeName}`);
        if (weatherExample.fetched?.weather) {
          const weather = weatherExample.fetched.weather;
          console.log(`    温度: ${weather.temperature}°C`);
          console.log(`    条件: ${weather.condition}`);
          console.log(`    数据源: ${weather.source}`);
        }
      }
      
      passed++;
      return data;
    } else {
      logWarning(`天气数据获取接口测试失败: ${response.data.error?.message || 'Unknown error'}`);
      skipped++;
      return null;
    }
  } catch (error: any) {
    logWarning(`天气数据获取接口测试失败: ${error.message}`);
    skipped++;
    return null;
  }
}

// 测试 4: 只获取道路封闭信息
async function testFetchRoadClosure(tripId: string) {
  logSection('【测试 4】只获取道路封闭信息');
  
  try {
    const response = await api.post(`/planning-workbench/trips/${tripId}/fetch-evidence?evidenceTypes=road_closure`);
    
    if (response.data.success) {
      const data = response.data.data;
      const successCount = data.successCount || 0;
      const partialCount = data.partialCount || 0;
      
      logSuccess('道路封闭信息获取接口测试通过');
      console.log(`  成功获取: ${successCount}`);
      console.log(`  部分成功: ${partialCount}`);
      
      passed++;
      return data;
    } else {
      logWarning(`道路封闭信息获取接口测试失败: ${response.data.error?.message || 'Unknown error'}`);
      skipped++;
      return null;
    }
  } catch (error: any) {
    logWarning(`道路封闭信息获取接口测试失败: ${error.message}`);
    skipped++;
    return null;
  }
}

// 测试 5: 只获取开放时间
async function testFetchOpeningHours(tripId: string) {
  logSection('【测试 5】只获取开放时间');
  
  try {
    const response = await api.post(`/planning-workbench/trips/${tripId}/fetch-evidence`, null, {
      params: { evidenceTypes: 'opening_hours' },
    });
    
    if (response.data.success) {
      const data = response.data.data;
      const successCount = data.successCount || 0;
      
      logSuccess('开放时间获取接口测试通过');
      console.log(`  成功获取开放时间的地点数: ${successCount}`);
      
      passed++;
      return data;
    } else {
      logWarning(`开放时间获取接口测试失败: ${response.data.error?.message || 'Unknown error'}`);
      skipped++;
      return null;
    }
  } catch (error: any) {
    logWarning(`开放时间获取接口测试失败: ${error.message}`);
    skipped++;
    return null;
  }
}

// 测试 6: 获取天气和道路封闭信息（组合）
async function testFetchCombined(tripId: string) {
  logSection('【测试 6】获取天气和道路封闭信息（组合）');
  
  try {
    const response = await api.post(`/planning-workbench/trips/${tripId}/fetch-evidence?evidenceTypes=weather,road_closure`);
    
    if (response.data.success) {
      const data = response.data.data;
      const successCount = data.successCount || 0;
      const requestedTypes = data.requestedEvidenceTypes?.join(', ') || 'weather,road_closure';
      
      logSuccess('组合证据获取接口测试通过');
      console.log(`  成功获取: ${successCount}`);
      console.log(`  请求的证据类型: ${requestedTypes}`);
      
      passed++;
      return data;
    } else {
      logWarning(`组合证据获取接口测试失败: ${response.data.error?.message || 'Unknown error'}`);
      skipped++;
      return null;
    }
  } catch (error: any) {
    logWarning(`组合证据获取接口测试失败: ${error.message}`);
    skipped++;
    return null;
  }
}

// 测试 7: 验证证据数据是否已更新
async function testVerifyEvidenceUpdate(tripId: string) {
  logSection('【测试 7】验证证据数据是否已更新');
  
  try {
    const response = await api.get(`/planning-workbench/trips/${tripId}/readiness`, {
      params: { lang: 'zh' },
    });
    
    if (response.data.success) {
      const summary = response.data.data.summary || {};
      const mustCount = summary.totalMust || 0;
      
      logSuccess('验证接口测试通过');
      console.log(`  当前必须项数量: ${mustCount}`);
      console.log(`  （如果比之前少，说明证据已成功获取）`);
      
      passed++;
      return summary;
    } else {
      logWarning('无法验证证据更新');
      skipped++;
      return null;
    }
  } catch (error: any) {
    logWarning(`验证接口测试失败: ${error.message}`);
    skipped++;
    return null;
  }
}

// 主函数
async function main() {
  console.log('==========================================');
  console.log('规划工作台证据获取接口测试');
  console.log('==========================================');
  console.log('');
  console.log(`Base URL: ${API_BASE_URL}`);
  console.log('');

  // 检查服务状态
  logSection('【检查】服务状态');
  const serviceRunning = await checkServiceStatus();
  if (!serviceRunning) {
    logError('服务未运行或不可访问');
    console.log('请确保服务已启动: npm run start:dev');
    process.exit(1);
  }
  logSuccess('服务运行正常');

  // 获取 tripId
  let tripId: string;
  try {
    tripId = await getTripId();
  } catch (error: any) {
    logError(`无法获取行程ID: ${error.message}`);
    console.log('\n请手动提供 tripId:');
    console.log('  ts-node scripts/test-planning-workbench-evidence.ts <tripId>');
    process.exit(1);
  }

  console.log(`\n使用行程 ID: ${tripId}\n`);

  // 执行测试
  const readinessBefore = await testGetReadiness(tripId);
  await testFetchAllEvidence(tripId);
  await testFetchWeather(tripId);
  await testFetchRoadClosure(tripId);
  await testFetchOpeningHours(tripId);
  await testFetchCombined(tripId);
  await testVerifyEvidenceUpdate(tripId);

  // 测试总结
  logSection('测试总结');
  console.log('\n测试结果:');
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log(`  ⚠️  跳过: ${skipped}`);
  console.log('\n已测试接口:');
  console.log('  1. GET /api/planning-workbench/trips/:tripId/readiness');
  console.log('  2. POST /api/planning-workbench/trips/:tripId/fetch-evidence (所有类型)');
  console.log('  3. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=weather');
  console.log('  4. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=road_closure');
  console.log('  5. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=opening_hours');
  console.log('  6. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=weather,road_closure');
  console.log('  7. 验证证据数据更新');
  console.log(`\n测试行程 ID: ${tripId}`);
  console.log('\n注意事项:');
  console.log('  - 如果某些测试失败，可能是因为：');
  console.log('    1. 地点没有坐标信息（天气和道路封闭需要坐标）');
  console.log('    2. 地点类别不是 ATTRACTION（开放时间仅支持 ATTRACTION）');
  console.log('    3. 外部 API 不可用或配额用尽');
  console.log('    4. 冰岛以外的地区可能不支持某些数据源');
  console.log('');

  if (failed === 0) {
    logSuccess('所有核心测试通过！');
    process.exit(0);
  } else {
    logWarning('部分测试失败，请查看上面的错误信息');
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  logError(`测试执行失败: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
