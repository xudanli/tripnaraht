// scripts/test-planning-workbench-with-trip.ts
/**
 * 规划工作台 API 测试脚本（使用指定 tripId）
 * 
 * 测试接口：
 * - POST /execute-async: 异步执行，立即返回 taskId
 * - GET /tasks/:taskId/status: 轮询任务状态
 * - GET /plans/:planId: 获取方案详情
 * 
 * 使用指定的 tripId 进行测试
 */

import * as http from 'http';
import * as https from 'https';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TRIP_ID = process.env.TRIP_ID || '6a227a13-b90a-4afb-85fd-d975c38779b7';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
  duration?: number;
}

/**
 * HTTP请求工具
 */
function httpRequest(
  method: string,
  url: string,
  data?: any,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          resolve({
            statusCode: res.statusCode || 200,
            body: parsedBody,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode || 200,
            body: body,
          });
        }
      });
    });

            req.on('error', (error) => {
              const errorMsg = error.message || error.toString() || '未知错误';
              reject(new Error(`连接失败: ${errorMsg}`));
            });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时（10秒）'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * 轮询任务状态
 */
async function pollTaskStatus(
  taskId: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<{ status: string; progress: any }> {
  console.log(`\n⏳ 开始轮询任务状态 (taskId: ${taskId})...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await httpRequest('GET', `${API_BASE_URL}/api/planning-workbench/tasks/${taskId}/status`);
      
      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
      }

      const taskProgress = response.body.data;
      const status = taskProgress.status;
      const progress = taskProgress.progress || 0;
      const currentStage = taskProgress.currentStage || '未知';

      console.log(`  [${attempt}/${maxAttempts}] 状态: ${status}, 进度: ${progress}%, 阶段: ${currentStage}`);

      if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
        return { status, progress: taskProgress };
      }

      // 等待后继续轮询
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    } catch (error: any) {
      console.error(`  轮询失败 (尝试 ${attempt}/${maxAttempts}): ${error.message}`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } else {
        throw error;
      }
    }
  }

  throw new Error(`轮询超时：${maxAttempts} 次尝试后仍未完成`);
}

/**
 * 测试用例
 */
async function runTests(): Promise<void> {
  const results: TestResult[] = [];

  console.log('🚀 开始测试规划工作台 API（使用指定 tripId）...\n');
  console.log(`📍 API地址: ${API_BASE_URL}`);
  console.log(`🆔 Trip ID: ${TRIP_ID}\n`);

  // 测试1: 获取 Trip 信息（验证 tripId 有效）
  console.log('📋 测试1: 获取 Trip 信息');
  try {
    const startTime = Date.now();
    const response = await httpRequest('GET', `${API_BASE_URL}/api/trips/${TRIP_ID}`);
    const duration = Date.now() - startTime;

    if (response.statusCode === 200) {
      const trip = response.body.data;
      console.log(`  ✅ Trip 信息获取成功:`);
      console.log(`     - 目的地: ${trip.destination?.country || trip.destination?.city || '未知'}`);
      console.log(`     - 天数: ${trip.days || '未知'}`);
      console.log(`     - 开始日期: ${trip.startDate || '未知'}`);
      console.log(`     - 结束日期: ${trip.endDate || '未知'}`);
      results.push({
        name: '获取 Trip 信息',
        success: true,
        data: { tripId: TRIP_ID, destination: trip.destination },
        duration,
      });
    } else {
      throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
    }
              } catch (error: any) {
                const errorMsg = error?.message || error?.toString() || '未知错误';
                console.error(`  ❌ 测试失败: ${errorMsg}`);
                console.error(`  💡 提示: 请确保服务器正在运行 (npm run dev)`);
                console.error(`  💡 提示: 检查 API 地址是否正确: ${API_BASE_URL}`);
                results.push({
                  name: '获取 Trip 信息',
                  success: false,
                  error: errorMsg,
                });
                console.log(`\n⚠️  无法连接到服务器或 Trip ID 无效，无法继续测试`);
                return;
              }

  // 测试2: 异步执行（generate）
  console.log('\n📋 测试2: 异步执行规划工作台（generate）');
  let taskId: string | null = null;
  try {
    const startTime = Date.now();
    
    // 先获取 Trip 信息以构建 context
    const tripResponse = await httpRequest('GET', `${API_BASE_URL}/api/trips/${TRIP_ID}`);
    const trip = tripResponse.body.data;
    
    const requestBody = {
      context: {
        destination: {
          country: trip.destination?.country || 'IS',
          city: trip.destination?.city,
        },
        days: trip.days || 5,
        travelMode: trip.travelMode || 'self_drive',
        constraints: {
          budget: trip.budget ? {
            total: trip.budget.total,
            currency: trip.budget.currency || 'CNY',
          } : undefined,
          fitness: trip.fitness ? {
            level: trip.fitness.level || 'medium',
          } : undefined,
          time: {
            startDate: trip.startDate,
            endDate: trip.endDate,
          },
        },
      },
      userAction: 'generate',
      tripId: TRIP_ID,
    };

    const response = await httpRequest(
      'POST',
      `${API_BASE_URL}/api/planning-workbench/execute-async`,
      requestBody
    );

    const duration = Date.now() - startTime;

    if (response.statusCode === 202) {
      taskId = response.body.data?.taskId;
      if (taskId) {
        console.log(`  ✅ 异步任务已创建: taskId=${taskId}`);
        console.log(`  ⏱️  响应时间: ${duration}ms`);
        results.push({
          name: '异步执行（创建任务）',
          success: true,
          data: { taskId, statusUrl: response.body.data?.statusUrl },
          duration,
        });
      } else {
        throw new Error('响应中缺少 taskId');
      }
    } else {
      throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
    }
  } catch (error: any) {
    console.error(`  ❌ 测试失败: ${error.message}`);
    results.push({
      name: '异步执行（创建任务）',
      success: false,
      error: error.message,
    });
    return; // 如果创建任务失败，无法继续测试
  }

  // 测试3: 轮询任务状态
  console.log('\n📊 测试3: 轮询任务状态');
  try {
    const startTime = Date.now();
    const taskProgress = await pollTaskStatus(taskId!, 60, 2000); // 最多轮询2分钟
    const duration = Date.now() - startTime;

    console.log(`\n  ✅ 任务完成: 状态=${taskProgress.status}`);
    console.log(`  ⏱️  总耗时: ${duration}ms`);

    if (taskProgress.status === 'COMPLETED') {
      const result = taskProgress.progress.result;
      if (result?.planState?.skeletonOptions?.options) {
        const optionCount = result.planState.skeletonOptions.options.length;
        console.log(`  📋 生成了 ${optionCount} 个骨架方案`);
        
        // 检查季节性警告
        for (const option of result.planState.skeletonOptions.options) {
          if ((option as any).metadata?.seasonalWarnings) {
            const warnings = (option as any).metadata.seasonalWarnings;
            console.log(`  ⚠️  方案 "${option.name}" 有 ${warnings.length} 个季节性警告:`);
            warnings.forEach((w: any) => {
              console.log(`     - 第${w.day}天: ${w.reason}`);
            });
          }
        }
      }
      if (result?.segments) {
        console.log(`  🗺️  生成了 ${result.segments.length} 个路线段`);
        
        // 检查DEM数据
        const segmentsWithDem = result.segments.filter((seg: any) => 
          seg.distanceKm > 0 || seg.ascentM > 0 || seg.slopePct > 0
        );
        console.log(`  📊 ${segmentsWithDem.length}/${result.segments.length} 个segments包含DEM数据`);
      }
    } else if (taskProgress.status === 'FAILED') {
      console.error(`  ❌ 任务失败: ${taskProgress.progress.error || '未知错误'}`);
    }

    results.push({
      name: '轮询任务状态',
      success: taskProgress.status === 'COMPLETED',
      data: taskProgress.progress,
      duration,
    });
  } catch (error: any) {
    console.error(`  ❌ 测试失败: ${error.message}`);
    results.push({
      name: '轮询任务状态',
      success: false,
      error: error.message,
    });
  }

  // 测试4: 直接查询任务状态（不轮询）
  console.log('\n🔍 测试4: 直接查询任务状态');
  try {
    const startTime = Date.now();
    const response = await httpRequest(
      'GET',
      `${API_BASE_URL}/api/planning-workbench/tasks/${taskId}/status`
    );
    const duration = Date.now() - startTime;

    if (response.statusCode === 200) {
      const taskProgress = response.body.data;
      console.log(`  ✅ 查询成功: 状态=${taskProgress.status}, 进度=${taskProgress.progress}%`);
      results.push({
        name: '直接查询任务状态',
        success: true,
        data: taskProgress,
        duration,
      });
    } else {
      throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
    }
  } catch (error: any) {
    console.error(`  ❌ 测试失败: ${error.message}`);
    results.push({
      name: '直接查询任务状态',
      success: false,
      error: error.message,
    });
  }

  // 输出测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${icon} ${index + 1}. ${result.name}${duration}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log(`\n总计: ${successCount}/${totalCount} 通过`);
  
  if (successCount === totalCount) {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败');
    process.exit(1);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('\n💥 测试执行失败:', error);
  process.exit(1);
});
