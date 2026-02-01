#!/usr/bin/env tsx
/**
 * 测试 Decision Draft HTTP API 接口
 * 
 * 测试所有用户端和管理端 API 端点
 */

// 使用 export {} 使文件成为模块
export {};

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  method: string;
  endpoint: string;
  success: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];
let testDraftId: string | null = null;
let testStepId: string | null = null;
let testVersionId: string | null = null;

/**
 * 颜色输出函数
 */
function log(message: string, color: 'green' | 'red' | 'yellow' | 'blue' | 'cyan' | 'white' = 'white') {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 测试 API 端点
 */
async function testEndpoint(
  name: string,
  method: string,
  endpoint: string,
  body?: any,
  expectedStatus: number = 200,
): Promise<TestResult> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  log(`\n🧪 测试: ${name}`, 'cyan');
  log(`   ${method} ${endpoint}`, 'blue');

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    
    let responseData: any;
    try {
      responseData = await response.json();
    } catch {
      responseData = { message: await response.text() };
    }

    const success = response.status === expectedStatus;

    if (success) {
      log(`   ✅ 成功 (HTTP ${response.status}, ${duration}ms)`, 'green');
      if (responseData.draft?.draft_id) {
        log(`   📄 Draft ID: ${responseData.draft.draft_id}`, 'yellow');
      }
      if (responseData.draft?.decision_steps) {
        log(`   📊 决策步骤数: ${responseData.draft.decision_steps.length}`, 'yellow');
      }
    } else {
      log(`   ❌ 失败 (HTTP ${response.status})`, 'red');
      if (responseData.message) {
        log(`   ⚠️  错误: ${responseData.message}`, 'red');
      }
      if (responseData.error) {
        log(`   ⚠️  错误: ${responseData.error}`, 'red');
      }
    }

    return {
      name,
      method,
      endpoint,
      success,
      statusCode: response.status,
      data: responseData,
      error: responseData.message || responseData.error?.message,
      duration,
    };
  } catch (error: any) {
    log(`   ❌ 异常: ${error.message}`, 'red');
    return {
      name,
      method,
      endpoint,
      success: false,
      error: error.message,
    };
  }
}

/**
 * 等待指定时间
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 主测试函数
 */
async function main() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🧪 Decision Draft HTTP API 接口测试', 'cyan');
  log('='.repeat(70), 'cyan');
  log(`\n📍 API地址: ${API_BASE_URL}\n`, 'blue');

  // 检查服务器状态（带重试）
  log('🔍 检查服务器状态...', 'yellow');
  let serverReady = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const healthCheck = await fetch(`${API_BASE_URL}/api-docs`, { 
        signal: AbortSignal.timeout(3000) 
      });
      if (healthCheck.ok) {
        log('✅ 服务器运行正常\n', 'green');
        serverReady = true;
        break;
      }
    } catch (error: any) {
      if (attempt < 5) {
        log(`   尝试 ${attempt}/5: 等待服务器启动...`, 'yellow');
        await sleep(2000);
      } else {
        log(`❌ 无法连接到服务器: ${error.message}`, 'red');
        log('请确保服务器正在运行: npm run dev', 'yellow');
        log(`   服务器地址: ${API_BASE_URL}`, 'yellow');
        log('   如果服务器正在启动，请稍等片刻后重试\n', 'yellow');
        process.exit(1);
      }
    }
  }
  
  if (!serverReady) {
    log('❌ 服务器未就绪，退出测试', 'red');
    process.exit(1);
  }

  // ==================== 管理端 API 测试 ====================
  log('\n' + '='.repeat(70), 'cyan');
  log('🔧 管理端 API 测试', 'cyan');
  log('='.repeat(70), 'cyan');

  // 1. 生成决策草案
  log('\n📋 测试 1: 生成决策草案', 'yellow');
  const generateResult = await testEndpoint(
    '生成决策草案',
    'POST',
    '/api/decision-draft/admin/generate',
    {
      user_input: '我们 3 个人，去冰岛 7 天，不想太赶，但想去高地。',
      trip_plan_request: {
        request_id: `test-${Date.now()}`,
        origin: 'Beijing',
        destination: 'Iceland',
        days: 7,
        party: {
          count: 3,
          fitness_level: 'medium',
        },
        constraints: {
          budget: {
            currency: 'USD',
            total: 5000,
          },
        },
      },
      config: {
        model: 'claude-3-5-sonnet',
        temperature: 0.7,
        user_mode: 'toc',
      },
    },
    201, // 期望状态码：201 Created
  );
  results.push(generateResult);

  if (generateResult.success && generateResult.data?.draft?.draft_id) {
    testDraftId = generateResult.data.draft.draft_id;
    if (generateResult.data.draft.decision_steps?.length > 0) {
      testStepId = generateResult.data.draft.decision_steps[0].id;
    }
    log(`\n✅ 测试数据准备完成:`, 'green');
    log(`   - Draft ID: ${testDraftId}`, 'yellow');
    log(`   - Step ID: ${testStepId || 'N/A'}`, 'yellow');
  } else {
    log('\n❌ 无法获取测试数据，跳过后续测试', 'red');
    printSummary();
    return;
  }

  await sleep(1000);

  // ==================== 用户端 API 测试 ====================
  log('\n' + '='.repeat(70), 'cyan');
  log('🎯 用户端 API 测试', 'cyan');
  log('='.repeat(70), 'cyan');

  // 2. 获取决策草案
  if (testDraftId) {
    results.push(await testEndpoint(
      '获取决策草案',
      'GET',
      `/api/decision-draft/${testDraftId}`,
    ));
    await sleep(500);
  }

  // 3. 获取决策解释
  if (testDraftId) {
    results.push(await testEndpoint(
      '获取决策解释 (ToC 模式)',
      'GET',
      `/api/decision-draft/${testDraftId}/explanation?mode=toc`,
    ));
    await sleep(500);
  }

  // 4. 获取决策步骤解释
  if (testDraftId && testStepId) {
    results.push(await testEndpoint(
      '获取决策步骤解释',
      'GET',
      `/api/decision-draft/${testDraftId}/step/${testStepId}/explanation`,
    ));
    await sleep(500);
  }

  // 5. 编辑决策步骤 - 批准
  if (testDraftId && testStepId) {
    results.push(await testEndpoint(
      '编辑决策步骤 - 批准',
      'PUT',
      `/api/decision-draft/${testDraftId}/step/${testStepId}`,
      {
        operation: {
          decision_step_id: testStepId,
          action: 'approve',
          reasoning: '测试批准',
        },
      },
    ));
    await sleep(500);
  }

  // 6. 编辑决策步骤 - 修改
  if (testDraftId && testStepId) {
    results.push(await testEndpoint(
      '编辑决策步骤 - 修改',
      'PUT',
      `/api/decision-draft/${testDraftId}/step/${testStepId}`,
      {
        operation: {
          decision_step_id: testStepId,
          action: 'modify',
          modifications: {
            title: '修改后的标题',
            description: '修改后的描述',
          },
          reasoning: '测试修改',
        },
      },
    ));
    await sleep(500);
  }

  // ==================== 管理端 API 测试（续）====================
  log('\n' + '='.repeat(70), 'cyan');
  log('🔧 管理端 API 测试（续）', 'cyan');
  log('='.repeat(70), 'cyan');

  // 7. 批量编辑决策步骤
  if (testDraftId && testStepId) {
    results.push(await testEndpoint(
      '批量编辑决策步骤',
      'PUT',
      `/api/decision-draft/admin/${testDraftId}/steps/batch`,
      {
        operations: [
          {
            decision_step_id: testStepId,
            action: 'approve',
            reasoning: '批量批准',
          },
        ],
      },
    ));
    await sleep(500);
  }

  // 8. 保存版本
  if (testDraftId) {
    const versionResult = await testEndpoint(
      '保存版本',
      'POST',
      `/api/decision-draft/admin/${testDraftId}/version`,
      {
        creator: 'test-user',
        description: '测试版本',
        tags: ['test', 'v1.0'],
      },
      201, // 期望状态码：201 Created
    );
    results.push(versionResult);
    
    if (versionResult.success && versionResult.data?.version_id) {
      testVersionId = versionResult.data.version_id;
      log(`   📦 Version ID: ${testVersionId}`, 'yellow');
    }
    await sleep(500);
  }

  // 9. 获取版本列表
  if (testDraftId) {
    results.push(await testEndpoint(
      '获取版本列表',
      'GET',
      `/api/decision-draft/${testDraftId}/versions`,
    ));
    await sleep(500);
  }

  // 10. 获取版本详情
  if (testDraftId && testVersionId) {
    results.push(await testEndpoint(
      '获取版本详情',
      'GET',
      `/api/decision-draft/${testDraftId}/versions/${testVersionId}`,
    ));
    await sleep(500);
  }

  // 11. 对比版本（如果有多个版本）
  if (testDraftId && testVersionId) {
    // 先创建第二个版本
    const version2Result = await testEndpoint(
      '保存第二个版本（用于对比）',
      'POST',
      `/api/decision-draft/admin/${testDraftId}/version`,
      {
        creator: 'test-user',
        description: '测试版本 2',
      },
      201, // 期望状态码：201 Created
    );
    await sleep(1000);

    if (version2Result.success && version2Result.data?.version_id) {
      results.push(await testEndpoint(
        '对比版本',
        'GET',
        `/api/decision-draft/${testDraftId}/versions/${testVersionId}/compare/${version2Result.data.version_id}`,
      ));
      await sleep(500);
    }
  }

  // 12. 局部重算
  if (testDraftId) {
    results.push(await testEndpoint(
      '局部重算',
      'POST',
      `/api/decision-draft/admin/${testDraftId}/regenerate`,
      {
        config: {
          regenerate_step_drafts: false,
          regenerate_decision_steps: true,
          preserve_approved_decisions: true,
        },
      },
      201, // 期望状态码：201 Created
    ));
    await sleep(1000);
  }

  // 13. 应用决策草案
  if (testDraftId) {
    results.push(await testEndpoint(
      '应用决策草案',
      'POST',
      `/api/decision-draft/${testDraftId}/apply`,
      undefined,
      201, // 期望状态码：201 Created
    ));
    await sleep(500);
  }

  // 14. 获取统计信息
  results.push(await testEndpoint(
    '获取统计信息',
    'GET',
    '/api/decision-draft/admin/stats',
  ));
  await sleep(500);

  // 15. 获取调试信息（Studio 模式）
  if (testDraftId) {
    results.push(await testEndpoint(
      '获取调试信息',
      'GET',
      `/api/decision-draft/admin/${testDraftId}/debug-info`,
    ));
    await sleep(500);
  }

  // ==================== 测试总结 ====================
  printSummary();
}

/**
 * 打印测试总结
 */
function printSummary() {
  log('\n' + '='.repeat(70), 'cyan');
  log('📊 测试总结', 'cyan');
  log('='.repeat(70), 'cyan');

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  log(`\n✅ 成功: ${successCount}`, 'green');
  log(`❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'green');
  log(`⏱️  总耗时: ${totalDuration}ms`, 'blue');
  log(`📈 平均耗时: ${Math.round(totalDuration / results.length)}ms`, 'blue');

  if (failCount > 0) {
    log('\n❌ 失败的测试:', 'red');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        log(`   - ${r.name} (${r.method} ${r.endpoint})`, 'red');
        if (r.error) {
          log(`     错误: ${r.error}`, 'red');
        }
      });
  }

  log('\n' + '='.repeat(70), 'cyan');
  log('✅ 测试完成', 'green');
  log('='.repeat(70), 'cyan');
}

// 运行测试
main().catch((error) => {
  log(`\n❌ 测试执行失败: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
