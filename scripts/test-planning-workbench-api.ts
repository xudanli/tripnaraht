// scripts/test-planning-workbench-api.ts
/**
 * 规划工作台 API 测试脚本
 * 
 * 测试新增功能：
 * - DEM地形数据填充
 * - 地理特征查询
 * - Compare功能
 * - Commit功能
 * - RAG语义搜索
 * - 决策追溯链
 */

import * as http from 'http';
import * as https from 'https';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

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
      reject(new Error(`连接失败: ${error.message}`));
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时（30秒）'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * 测试用例
 */
async function runTests(): Promise<void> {
  const results: TestResult[] = [];

  console.log('🚀 开始测试规划工作台 API...\n');

  // 测试1: 生成方案（generate）
  console.log('📋 测试1: 生成行程骨架方案');
  try {
    const startTime = Date.now();
    const response = await httpRequest(
      'POST',
      `${API_BASE_URL}/api/planning-workbench/execute`,
      {
        context: {
          destination: {
            country: '冰岛',
          },
          days: 5,
          travelMode: 'self_drive',
          constraints: {
            budget: {
              total: 50000,
              currency: 'CNY',
            },
            fitness: {
              level: 'medium',
            },
          },
        },
        userAction: 'generate',
      }
    );

    const duration = Date.now() - startTime;
    const success = response.statusCode === 200 && response.body.success;

    if (success) {
      const planState = response.body.data?.planState;
      const segments = planState?.itinerary?.segments || [];
      
      // 检查DEM数据是否填充
      const hasDemData = segments.some((seg: any) => 
        seg.distanceKm > 0 || seg.ascentM > 0 || seg.slopePct > 0
      );
      
      // 检查地理特征是否填充
      const hasGeoFeatures = segments.some((seg: any) => 
        seg.metadata?.geoFeatures || seg.metadata?.hazards
      );
      
      // 检查决策追溯链
      const hasDecisionTrace = !!planState?.metadata?.exclusionLog || 
                               !!planState?.metadata?.decisionTrace;

      results.push({
        name: '生成方案（generate）',
        success: true,
        data: {
          planId: planState?.plan_id,
          segmentsCount: segments.length,
          hasDemData,
          hasGeoFeatures,
          hasDecisionTrace,
          skeletonOptionsCount: response.body.data?.uiOutput?.skeletonOptions?.options?.length || 0,
        },
        duration,
      });

      console.log(`✅ 成功 (${duration}ms)`);
      console.log(`   - Plan ID: ${planState?.plan_id}`);
      console.log(`   - Segments: ${segments.length}`);
      console.log(`   - DEM数据填充: ${hasDemData ? '✅' : '❌'}`);
      console.log(`   - 地理特征填充: ${hasGeoFeatures ? '✅' : '❌'}`);
      console.log(`   - 决策追溯链: ${hasDecisionTrace ? '✅' : '❌'}`);
      console.log(`   - 骨架方案数: ${response.body.data?.uiOutput?.skeletonOptions?.options?.length || 0}`);

      // 保存planId和skeletonOptions用于后续测试
      (global as any).testPlanId = planState?.plan_id;
      (global as any).testSkeletonOptions = response.body.data?.uiOutput?.skeletonOptions;
    } else {
      throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
    }
  } catch (error: any) {
    results.push({
      name: '生成方案（generate）',
      success: false,
      error: error.message,
    });
    console.log(`❌ 失败: ${error.message}`);
  }

  console.log('');

  // 测试2: 对比方案（compare）
  console.log('📊 测试2: 对比多个方案');
  try {
    const skeletonOptions = (global as any).testSkeletonOptions;
    if (!skeletonOptions || !skeletonOptions.options || skeletonOptions.options.length < 2) {
      throw new Error('需要至少2个方案才能对比');
    }

    const startTime = Date.now();
    const response = await httpRequest(
      'POST',
      `${API_BASE_URL}/api/planning-workbench/execute`,
      {
        context: {
          destination: {
            country: '冰岛',
          },
          days: 5,
        },
        userAction: 'compare',
        skeletonOptions,
      }
    );

    const duration = Date.now() - startTime;
    const success = response.statusCode === 200 && response.body.success;

    if (success) {
      const comparison = response.body.data?.uiOutput?.comparison;
      const hasComparison = !!comparison && comparison.options && comparison.options.length > 0;

      results.push({
        name: '对比方案（compare）',
        success: true,
        data: {
          hasComparison,
          comparisonOptionsCount: comparison?.options?.length || 0,
          hasRecommendation: !!comparison?.recommendation,
        },
        duration,
      });

      console.log(`✅ 成功 (${duration}ms)`);
      console.log(`   - 对比结果: ${hasComparison ? '✅' : '❌'}`);
      console.log(`   - 对比方案数: ${comparison?.options?.length || 0}`);
      console.log(`   - 推荐方案: ${comparison?.recommendation?.optionId || '无'}`);

      // 保存推荐方案ID用于commit测试
      if (comparison?.recommendation?.optionId) {
        (global as any).testSelectedOptionId = comparison.recommendation.optionId;
      }
    } else {
      throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
    }
  } catch (error: any) {
    results.push({
      name: '对比方案（compare）',
      success: false,
      error: error.message,
    });
    console.log(`❌ 失败: ${error.message}`);
  }

  console.log('');

  // 测试3: 提交方案（commit）
  console.log('💾 测试3: 提交方案');
  try {
    const planId = (global as any).testPlanId;
    const selectedOptionId = (global as any).testSelectedOptionId || 'balanced_1';
    const skeletonOptions = (global as any).testSkeletonOptions;

    if (!planId) {
      throw new Error('需要先生成方案');
    }

    const startTime = Date.now();
    const response = await httpRequest(
      'POST',
      `${API_BASE_URL}/api/planning-workbench/execute`,
      {
        context: {
          destination: {
            country: '冰岛',
          },
          days: 5,
        },
        userAction: 'commit',
        selectedOptionId,
        skeletonOptions,
        tripId: `test_trip_${Date.now()}`,
      }
    );

    const duration = Date.now() - startTime;
    const success = response.statusCode === 200 && response.body.success;

    if (success) {
      const planState = response.body.data?.planState;
      const segments = planState?.itinerary?.segments || [];
      
      // 检查提交后的DEM数据
      const hasDemData = segments.some((seg: any) => 
        seg.distanceKm > 0 || seg.ascentM > 0 || seg.slopePct > 0
      );

      results.push({
        name: '提交方案（commit）',
        success: true,
        data: {
          planId: planState?.plan_id,
          planVersion: planState?.plan_version,
          status: planState?.status,
          segmentsCount: segments.length,
          hasDemData,
          committedAt: planState?.metadata?.committedAt,
        },
        duration,
      });

      console.log(`✅ 成功 (${duration}ms)`);
      console.log(`   - Plan ID: ${planState?.plan_id}`);
      console.log(`   - Plan Version: ${planState?.plan_version}`);
      console.log(`   - Status: ${planState?.status}`);
      console.log(`   - DEM数据填充: ${hasDemData ? '✅' : '❌'}`);
      console.log(`   - 提交时间: ${planState?.metadata?.committedAt || '无'}`);
    } else {
      throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
    }
  } catch (error: any) {
    results.push({
      name: '提交方案（commit）',
      success: false,
      error: error.message,
    });
    console.log(`❌ 失败: ${error.message}`);
  }

  console.log('');

  // 测试4: 获取方案详情
  console.log('📄 测试4: 获取方案详情');
  try {
    const planId = (global as any).testPlanId;
    if (!planId) {
      throw new Error('需要先生成方案');
    }

    const startTime = Date.now();
    const response = await httpRequest(
      'GET',
      `${API_BASE_URL}/api/planning-workbench/plans/${planId}`
    );

    const duration = Date.now() - startTime;
    const success = response.statusCode === 200 && response.body.success;

    if (success) {
      const planState = response.body.data?.planState;
      const hasExclusionLog = !!planState?.metadata?.exclusionLog;
      const hasDecisionTrace = !!planState?.metadata?.decisionTrace;

      results.push({
        name: '获取方案详情',
        success: true,
        data: {
          planId: planState?.plan_id,
          hasExclusionLog,
          hasDecisionTrace,
          exclusionLogCount: planState?.metadata?.exclusionLog?.length || 0,
        },
        duration,
      });

      console.log(`✅ 成功 (${duration}ms)`);
      console.log(`   - Plan ID: ${planState?.plan_id}`);
      console.log(`   - 排除日志: ${hasExclusionLog ? '✅' : '❌'}`);
      console.log(`   - 决策追溯: ${hasDecisionTrace ? '✅' : '❌'}`);
      console.log(`   - 排除项数: ${planState?.metadata?.exclusionLog?.length || 0}`);
    } else {
      throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
    }
  } catch (error: any) {
    results.push({
      name: '获取方案详情',
      success: false,
      error: error.message,
    });
    console.log(`❌ 失败: ${error.message}`);
  }

  console.log('');

  // 测试总结
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  const successRate = ((successCount / totalCount) * 100).toFixed(1);

  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${icon} ${result.name}${duration}`);
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
    if (result.data) {
      Object.entries(result.data).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }
  });

  console.log('='.repeat(60));
  console.log(`总计: ${successCount}/${totalCount} 通过 (${successRate}%)`);

  if (successCount === totalCount) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('⚠️  部分测试失败');
    process.exit(1);
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
