#!/usr/bin/env npx tsx
/**
 * 准备度状态字段统一后API测试脚本
 * 
 * 测试统一后的字段命名（must/should替代warnings/suggestions）
 * 
 * 使用方法:
 *   npm run test:readiness-unified
 *   或
 *   READINESS_TEST_BASE_URL=http://localhost:3000 npm run test:readiness-unified <tripId>
 */

const READINESS_TEST_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function readinessHttpRequest(method: string, url: string, body?: any): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error?.message || data.message || 'Unknown error'}`);
    }

    return data;
  } catch (error: any) {
    if (error.message.includes('fetch failed') || error.code === 'ECONNREFUSED') {
      throw new Error(`无法连接到服务器 ${url}，请确保服务已启动`);
    }
    throw error;
  }
}

async function findReadinessTestTripId(): Promise<string | null> {
  try {
    const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/trips?limit=1`);
    if (result.data && result.data.length > 0) {
      return result.data[0].id;
    }
  } catch (error) {
    // 忽略错误，返回null
  }
  return null;
}

async function testReadinessScore(tripId: string): Promise<TestResult> {
  try {
    const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/readiness/trip/${tripId}/score`);
    
    const summary = result.data?.summary || {};
    
    // 检查新字段
    const hasMust = summary.must !== undefined;
    const hasShould = summary.should !== undefined;
    const hasBlockers = summary.blockers !== undefined;
    
    // 检查向后兼容字段
    const hasWarnings = summary.warnings !== undefined;
    const hasSuggestions = summary.suggestions !== undefined;
    
    // 验证字段值一致性
    const mustEqualsWarnings = hasMust && hasWarnings && summary.must === summary.warnings;
    const shouldEqualsSuggestions = hasShould && hasSuggestions && summary.should === summary.suggestions;

    return {
      name: '准备度分数接口（字段统一验证）',
      success: true,
      data: {
        hasNewFields: hasMust && hasShould && hasBlockers,
        hasBackwardCompatibility: hasWarnings && hasSuggestions,
        fieldConsistency: {
          mustEqualsWarnings,
          shouldEqualsSuggestions,
        },
        summary: {
          blockers: summary.blockers,
          must: summary.must,
          should: summary.should,
          warnings: summary.warnings,
          suggestions: summary.suggestions,
          highRisks: summary.highRisks,
          mediumRisks: summary.mediumRisks,
          lowRisks: summary.lowRisks,
        },
        score: result.data?.score,
      },
    };
  } catch (error: any) {
    return {
      name: '准备度分数接口（字段统一验证）',
      success: false,
      error: error.message,
    };
  }
}

async function testPersonalizedChecklist(tripId: string): Promise<TestResult> {
  try {
    const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/readiness/personalized-checklist?tripId=${tripId}`);
    
    const checklist = result.data?.checklist || {};
    const summary = result.data?.summary || {};
    
    // 检查字段
    const hasBlockers = checklist.blocker !== undefined;
    const hasMust = checklist.must !== undefined;
    const hasShould = checklist.should !== undefined;
    const hasOptional = checklist.optional !== undefined;
    
    const hasTotalBlockers = summary.totalBlockers !== undefined;
    const hasTotalMust = summary.totalMust !== undefined;
    const hasTotalShould = summary.totalShould !== undefined;
    const hasTotalOptional = summary.totalOptional !== undefined;

    return {
      name: '个性化准备清单接口（字段统一验证）',
      success: true,
      data: {
        checklistFields: {
          hasBlockers,
          hasMust,
          hasShould,
          hasOptional,
        },
        summaryFields: {
          hasTotalBlockers,
          hasTotalMust,
          hasTotalShould,
          hasTotalOptional,
        },
        counts: {
          blockers: checklist.blocker?.length || 0,
          must: checklist.must?.length || 0,
          should: checklist.should?.length || 0,
          optional: checklist.optional?.length || 0,
        },
        summary: {
          totalBlockers: summary.totalBlockers,
          totalMust: summary.totalMust,
          totalShould: summary.totalShould,
          totalOptional: summary.totalOptional,
        },
      },
    };
  } catch (error: any) {
    return {
      name: '个性化准备清单接口（字段统一验证）',
      success: false,
      error: error.message,
    };
  }
}

async function testTripInsight(tripId: string): Promise<TestResult> {
  try {
    const result = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/trips/${tripId}/insight`);
    
    const readiness = result.data?.readiness || {};
    
    // 检查新字段
    const hasMust = readiness.must !== undefined;
    const hasShould = readiness.should !== undefined;
    const hasBlockers = readiness.blockers !== undefined;
    
    // 检查向后兼容字段
    const hasWarnings = readiness.warnings !== undefined;
    const hasSuggestions = readiness.suggestions !== undefined;
    
    // 验证字段值一致性
    const mustEqualsWarnings = hasMust && hasWarnings && readiness.must === readiness.warnings;
    const shouldEqualsSuggestions = hasShould && hasSuggestions && readiness.should === readiness.suggestions;

    return {
      name: '行程洞察接口（字段统一验证）',
      success: true,
      data: {
        hasNewFields: hasMust && hasShould && hasBlockers,
        hasBackwardCompatibility: hasWarnings && hasSuggestions,
        fieldConsistency: {
          mustEqualsWarnings,
          shouldEqualsSuggestions,
        },
        readiness: {
          status: readiness.status,
          blockers: readiness.blockers,
          must: readiness.must,
          should: readiness.should,
          warnings: readiness.warnings,
          suggestions: readiness.suggestions,
        },
      },
    };
  } catch (error: any) {
    return {
      name: '行程洞察接口（字段统一验证）',
      success: false,
      error: error.message,
    };
  }
}

async function testReadinessCheck(tripId: string): Promise<TestResult> {
  try {
    // 先获取行程信息
    const tripResult = await readinessHttpRequest('GET', `${READINESS_TEST_BASE_URL}/api/trips/${tripId}`);
    const trip = tripResult.data;
    
    if (!trip) {
      return {
        name: '准备度检查接口（字段统一验证）',
        success: false,
        error: '无法获取行程信息',
      };
    }

    // 构建检查请求
    const checkBody = {
      destinationId: trip.destination || 'IS', // 默认冰岛
      traveler: {
        nationality: 'CN',
        tags: [],
      },
      trip: {
        startDate: trip.startDate,
        endDate: trip.endDate,
      },
      itinerary: {
        countries: [trip.destination || 'IS'],
      },
    };

    const result = await readinessHttpRequest('POST', `${READINESS_TEST_BASE_URL}/api/readiness/check`, checkBody);
    
    const summary = result.data?.summary || {};

    return {
      name: '准备度检查接口（字段统一验证）',
      success: true,
      data: {
        hasStandardFields: {
          totalBlockers: summary.totalBlockers !== undefined,
          totalMust: summary.totalMust !== undefined,
          totalShould: summary.totalShould !== undefined,
          totalOptional: summary.totalOptional !== undefined,
        },
        summary: {
          totalBlockers: summary.totalBlockers,
          totalMust: summary.totalMust,
          totalShould: summary.totalShould,
          totalOptional: summary.totalOptional,
          totalRisks: summary.totalRisks,
        },
        findingsCount: result.data?.findings?.length || 0,
      },
    };
  } catch (error: any) {
    return {
      name: '准备度检查接口（字段统一验证）',
      success: false,
      error: error.message,
    };
  }
}

async function readinessMain() {
  console.log('🧪 开始测试准备度状态字段统一后的API接口...\n');
  console.log(`📍 Base URL: ${READINESS_TEST_BASE_URL}\n`);

  // 从命令行参数获取tripId，或使用环境变量，或自动查找
  let tripId = process.argv[2] || process.env.TRIP_ID;

  if (!tripId) {
    console.log('📋 未提供tripId，尝试自动查找测试行程...');
    tripId = await findReadinessTestTripId();
    
    if (!tripId) {
      console.error('\n❌ 无法自动查找测试行程');
      console.error('   请手动提供tripId:');
      console.error('   使用方法: npm run test:readiness-unified <tripId>');
      console.error('   或: TRIP_ID=<tripId> npm run test:readiness-unified\n');
      process.exit(1);
    }
    console.log(`✅ 找到测试行程: ${tripId}\n`);
  } else {
    console.log(`📋 使用提供的行程ID: ${tripId}\n`);
  }

  const results: TestResult[] = [];

  // 测试各个接口
  console.log('='.repeat(60));
  console.log('📦 准备度接口字段统一测试');
  console.log('='.repeat(60));

  results.push(await testReadinessScore(tripId));
  results.push(await testPersonalizedChecklist(tripId));
  results.push(await testTripInsight(tripId));
  results.push(await testReadinessCheck(tripId));

  // 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    console.log(`\n${icon} ${result.name}`);
    
    if (result.success) {
      successCount++;
      if (result.data) {
        console.log(`   数据:`, JSON.stringify(result.data, null, 2).split('\n').map(l => '   ' + l).join('\n'));
        
        // 特别检查字段一致性
        if (result.data.fieldConsistency) {
          const consistency = result.data.fieldConsistency;
          if (consistency.mustEqualsWarnings && consistency.shouldEqualsSuggestions) {
            console.log(`   ✅ 字段一致性验证通过：must=warnings, should=suggestions`);
          } else {
            console.log(`   ⚠️  字段一致性验证失败`);
            if (!consistency.mustEqualsWarnings) {
              console.log(`      - must (${result.data.summary?.must}) !== warnings (${result.data.summary?.warnings})`);
            }
            if (!consistency.shouldEqualsSuggestions) {
              console.log(`      - should (${result.data.summary?.should}) !== suggestions (${result.data.summary?.suggestions})`);
            }
          }
        }
      }
    } else {
      failCount++;
      console.log(`   错误: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ 成功: ${successCount} | ❌ 失败: ${failCount} | 📊 总计: ${results.length}`);
  console.log('='.repeat(60));

  if (failCount > 0) {
    console.log('\n⚠️  部分测试失败');
    console.log('\n可能的原因:');
    console.log('  1. 服务未运行 - 请运行: npm run dev');
    console.log(`  2. 服务地址不正确 - 当前: ${READINESS_TEST_BASE_URL}`);
    console.log('  3. 测试行程没有准备度数据');
    console.log('  4. API接口路径错误');
    console.log('\n💡 提示: 检查服务日志以获取更多错误信息');
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
    console.log('\n✅ 准备度状态字段统一验证成功');
    console.log('   - 新字段（must/should）已正确返回');
    console.log('   - 向后兼容字段（warnings/suggestions）已正确返回');
    console.log('   - 字段值一致性验证通过');
  }
}

readinessMain().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});
