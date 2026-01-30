#!/usr/bin/env npx tsx
/**
 * 证据系统API HTTP测试脚本
 * 
 * 测试所有P0和P1功能的HTTP API接口
 * 
 * 使用方法:
 *   npm run test:evidence-apis:http
 *   或
 *   EVIDENCE_TEST_BASE_URL=http://localhost:3000 npm run test:evidence-apis:http
 */

const EVIDENCE_TEST_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function evidenceHttpRequest(method: string, url: string, body?: any): Promise<any> {
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

async function testEvidenceList(tripId: string): Promise<TestResult> {
  try {
    const result = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/trips/${tripId}/evidence`);
    
    const evidence = result.data || [];
    const firstEvidence = evidence[0];
    
    const hasFreshness = firstEvidence?.freshness !== undefined;
    const hasConfidence = firstEvidence?.confidence !== undefined;
    const hasQualityScore = firstEvidence?.qualityScore !== undefined;

    return {
      name: '获取证据列表（P0增强字段）',
      success: true,
      data: {
        count: evidence.length,
        hasFreshness,
        hasConfidence,
        hasQualityScore,
        firstEvidence: firstEvidence ? {
          type: firstEvidence.type,
          freshness: hasFreshness ? firstEvidence.freshness.status : null,
          confidence: hasConfidence ? firstEvidence.confidence.level : null,
          qualityScore: hasQualityScore ? firstEvidence.qualityScore.level : null,
        } : null,
      },
    };
  } catch (error: any) {
    return {
      name: '获取证据列表（P0增强字段）',
      success: false,
      error: error.message,
    };
  }
}

async function testEvidenceFiltering(tripId: string): Promise<TestResult> {
  try {
    const result = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/trips/${tripId}/evidence?priority=high&sortBy=importance`);
    
    return {
      name: '证据过滤和优先级机制',
      success: true,
      data: {
        count: result.data?.length || 0,
        firstEvidence: result.data?.[0] ? {
          type: result.data[0].type,
          importance: result.data[0].importance,
        } : null,
      },
    };
  } catch (error: any) {
    return {
      name: '证据过滤和优先级机制',
      success: false,
      error: error.message,
    };
  }
}

async function testEvidenceCompleteness(tripId: string): Promise<TestResult> {
  try {
    const result = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/trips/${tripId}/evidence/completeness`);
    
    return {
      name: '证据完整性检查',
      success: true,
      data: {
        completenessScore: result.data?.completenessScore,
        missingCount: result.data?.missingEvidence?.length || 0,
        recommendationsCount: result.data?.recommendations?.length || 0,
      },
    };
  } catch (error: any) {
    return {
      name: '证据完整性检查',
      success: false,
      error: error.message,
    };
  }
}

async function testEvidenceSuggestions(tripId: string): Promise<TestResult> {
  try {
    const result = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/trips/${tripId}/evidence/suggestions`);
    
    return {
      name: '智能触发机制',
      success: true,
      data: {
        suggestionsCount: result.data?.suggestions?.length || 0,
        hasBulkFetch: !!result.data?.bulkFetchSuggestion,
        shouldAutoTrigger: result.data?.shouldAutoTrigger || false,
      },
    };
  } catch (error: any) {
    return {
      name: '智能触发机制',
      success: false,
      error: error.message,
    };
  }
}

async function testAsyncEvidenceFetch(tripId: string): Promise<TestResult> {
  try {
    // 启动异步任务
    const startResult = await evidenceHttpRequest('POST', `${EVIDENCE_TEST_BASE_URL}/api/planning-workbench/trips/${tripId}/fetch-evidence?async=true`);
    
    if (!startResult.data?.taskId) {
      return {
        name: '异步证据获取（启动任务）',
        success: false,
        error: '未返回taskId',
      };
    }

    const taskId = startResult.data.taskId;

    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 500));

    // 查询进度
    const progressResult = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/planning-workbench/tasks/${taskId}/progress`);
    
    return {
      name: '异步证据获取和进度查询',
      success: true,
      data: {
        taskId,
        status: progressResult.data?.status,
        totalPlaces: progressResult.data?.totalPlaces,
        processedPlaces: progressResult.data?.processedPlaces,
        canCancel: progressResult.data?.canCancel,
      },
    };
  } catch (error: any) {
    return {
      name: '异步证据获取和进度查询',
      success: false,
      error: error.message,
    };
  }
}

async function testTaskCancel(tripId: string): Promise<TestResult> {
  try {
    // 先创建一个任务
    const startResult = await evidenceHttpRequest('POST', `${EVIDENCE_TEST_BASE_URL}/api/planning-workbench/trips/${tripId}/fetch-evidence?async=true`);
    
    if (!startResult.data?.taskId) {
      return {
        name: '任务取消',
        success: false,
        error: '未返回taskId',
      };
    }

    const taskId = startResult.data.taskId;

    // 取消任务
    const cancelResult = await evidenceHttpRequest('POST', `${EVIDENCE_TEST_BASE_URL}/api/planning-workbench/tasks/${taskId}/cancel`);
    
    // 查询取消后的状态
    const progressResult = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/planning-workbench/tasks/${taskId}/progress`);
    
    return {
      name: '任务取消',
      success: true,
      data: {
        taskId,
        cancelled: cancelResult.data?.message === '任务已取消',
        finalStatus: progressResult.data?.status,
      },
    };
  } catch (error: any) {
    return {
      name: '任务取消',
      success: false,
      error: error.message,
    };
  }
}

async function findTestTripId(): Promise<string | null> {
  try {
    const result = await evidenceHttpRequest('GET', `${EVIDENCE_TEST_BASE_URL}/api/trips?limit=1`);
    if (result.data && result.data.length > 0) {
      return result.data[0].id;
    }
  } catch (error) {
    // 忽略错误，返回null
  }
  return null;
}

async function evidenceMain() {
  console.log('🧪 开始测试证据系统API接口...\n');
  console.log(`📍 Base URL: ${EVIDENCE_TEST_BASE_URL}\n`);

  // 从命令行参数获取tripId，或使用环境变量，或自动查找
  let tripId = process.argv[2] || process.env.TRIP_ID;

  if (!tripId) {
    console.log('📋 未提供tripId，尝试自动查找测试行程...');
    tripId = await findTestTripId();
    
    if (!tripId) {
      console.error('\n❌ 无法自动查找测试行程');
      console.error('   请手动提供tripId:');
      console.error('   使用方法: npm run test:evidence-apis:http <tripId>');
      console.error('   或: TRIP_ID=<tripId> npm run test:evidence-apis:http\n');
      process.exit(1);
    }
    console.log(`✅ 找到测试行程: ${tripId}\n`);
  } else {
    console.log(`📋 使用提供的行程ID: ${tripId}\n`);
  }

  const results: TestResult[] = [];

  // P0功能测试
  console.log('='.repeat(60));
  console.log('📦 P0功能测试');
  console.log('='.repeat(60));

  results.push(await testEvidenceList(tripId));

  // P1功能测试
  console.log('\n' + '='.repeat(60));
  console.log('📦 P1功能测试');
  console.log('='.repeat(60));

  results.push(await testEvidenceFiltering(tripId));
  results.push(await testEvidenceCompleteness(tripId));
  results.push(await testEvidenceSuggestions(tripId));
  results.push(await testAsyncEvidenceFetch(tripId));
  results.push(await testTaskCancel(tripId));

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
    console.log(`  2. 服务地址不正确 - 当前: ${EVIDENCE_TEST_BASE_URL}`);
    console.log('  3. 测试行程没有足够的证据数据');
    console.log('  4. API接口路径错误');
    console.log('\n💡 提示: 检查服务日志以获取更多错误信息');
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
    console.log('\n✅ 证据系统所有功能正常工作');
  }
}

evidenceMain().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});
