#!/usr/bin/env npx tsx
/**
 * KPU和知识库CRUD接口测试脚本
 * 
 * 测试内容：
 * 1. KPU接口（检索并验证、生成并验证、健康检查、指标等）
 * 2. 知识库文档CRUD接口（创建、读取、更新、删除）
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface TestResult {
  name: string;
  success: boolean;
  statusCode?: number;
  message?: string;
  data?: any;
  error?: string;
}

// 测试结果存储
const results: TestResult[] = [];

/**
 * 打印带颜色的消息
 */
function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 测试API端点
 */
async function testEndpoint(
  name: string,
  method: string,
  endpoint: string,
  body?: any,
  expectedStatus: number = 200
): Promise<TestResult> {
  const url = `${BASE_URL}${endpoint}`;
  
  log(`\n🧪 测试: ${name}`, 'cyan');
  log(`   ${method} ${endpoint}`, 'blue');

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const startTime = Date.now();
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    const responseData = await response.json();

    const success = response.status === expectedStatus && responseData.success !== false;

    if (success) {
      log(`   ✅ 成功 (HTTP ${response.status}, ${duration}ms)`, 'green');
      if (responseData.data) {
        // 只显示关键信息，避免输出过长
        if (responseData.data.id) {
          log(`   📄 ID: ${responseData.data.id}`, 'yellow');
        }
        if (responseData.data.message) {
          log(`   💬 ${responseData.data.message}`, 'yellow');
        }
      }
    } else {
      log(`   ❌ 失败 (HTTP ${response.status})`, 'red');
      if (responseData.error) {
        log(`   ⚠️  错误: ${responseData.error.message || responseData.error}`, 'red');
      }
    }

    return {
      name,
      success,
      statusCode: response.status,
      message: responseData.error?.message || responseData.message,
      data: responseData.data,
      error: responseData.error?.message,
    };
  } catch (error: any) {
    log(`   ❌ 异常: ${error.message}`, 'red');
    return {
      name,
      success: false,
      error: error.message,
    };
  }
}

/**
 * 等待指定时间
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主测试函数
 */
async function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 KPU和知识库CRUD接口测试', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`\n📍 API地址: ${BASE_URL}\n`, 'blue');

  // 检查服务器状态
  log('🔍 检查服务器状态...', 'yellow');
  try {
    const healthCheck = await fetch(`${BASE_URL}/kpu/health`);
    if (healthCheck.ok) {
      log('✅ 服务器运行正常\n', 'green');
    } else {
      log('⚠️  服务器响应异常，但继续测试...\n', 'yellow');
    }
  } catch (error: any) {
    log(`❌ 无法连接到服务器: ${error.message}`, 'red');
    log('请确保服务器正在运行: npm run start:dev\n', 'yellow');
    process.exit(1);
  }

  // ==================== KPU接口测试 ====================
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 KPU接口测试', 'cyan');
  log('='.repeat(60), 'cyan');

  // 1. 健康检查
  results.push(await testEndpoint(
    'KPU健康检查',
    'GET',
    '/kpu/health'
  ));

  // 2. 获取指标
  results.push(await testEndpoint(
    '获取KPU指标',
    'GET',
    '/kpu/metrics'
  ));

  // 3. 验证单个片段
  results.push(await testEndpoint(
    '验证知识片段',
    'POST',
    '/kpu/validate-snippet',
    {
      content: 'F26公路是冰岛的一条重要公路，连接雷克雅未克和东部地区。',
      source: 'test-source',
      options: {
        enableFactCheck: true,
        enableConsistencyCheck: true,
        enableCitationCheck: true,
      },
    }
  ));

  // 4. 检索并验证（需要知识库中有数据）
  log('\n⏳ 等待2秒后测试检索并验证...', 'yellow');
  await sleep(2000);
  
  results.push(await testEndpoint(
    '检索并验证知识片段',
    'POST',
    '/kpu/retrieve-and-validate',
    {
      query: '冰岛F26公路',
      limit: 3,
      enableSnippetValidation: true,
      minValidationScore: 0.5,
      validationOptions: {
        enableFactCheck: true,
        enableConsistencyCheck: true,
        enableCitationCheck: true,
      },
    }
  ));

  // 5. 获取缓存统计
  results.push(await testEndpoint(
    '获取缓存统计',
    'GET',
    '/kpu/cache/stats'
  ));

  // ==================== 知识库文档CRUD接口测试 ====================
  log('\n' + '='.repeat(60), 'cyan');
  log('📚 知识库文档CRUD接口测试', 'cyan');
  log('='.repeat(60), 'cyan');

  let createdDocId: string | null = null;

  // 1. 创建文档
  const createResult = await testEndpoint(
    '创建文档',
    'POST',
    '/rag/index',
    {
      collection: 'travel_guides',
      title: '测试文档 - 冰岛F26公路指南',
      content: 'F26公路是冰岛的一条重要公路，连接雷克雅未克和东部地区。这条公路在冬天通常关闭，因为路况危险。建议在夏季使用此路线。',
      source: 'test-api',
      countryCode: 'IS',
      tags: ['road', 'iceland', 'test'],
      metadata: {
        author: 'Test Script',
        version: '1.0',
        test: true,
      },
    }
  );
  results.push(createResult);
  
  if (createResult.data?.id) {
    createdDocId = createResult.data.id;
    log(`\n📝 创建的文档ID: ${createdDocId}`, 'green');
  }

  // 等待文档索引完成
  if (createdDocId) {
    log('\n⏳ 等待3秒让文档索引完成...', 'yellow');
    await sleep(3000);
  }

  // 2. 获取文档列表
  results.push(await testEndpoint(
    '获取文档列表',
    'GET',
    '/rag/documents?page=1&pageSize=10'
  ));

  // 3. 按集合筛选
  results.push(await testEndpoint(
    '按集合筛选文档',
    'GET',
    '/rag/documents?collection=travel_guides&page=1&pageSize=5'
  ));

  // 4. 搜索文档
  results.push(await testEndpoint(
    '搜索文档',
    'GET',
    '/rag/documents?search=F26&page=1&pageSize=5'
  ));

  // 5. 获取文档详情
  if (createdDocId) {
    results.push(await testEndpoint(
      '获取文档详情',
      'GET',
      `/rag/documents/${createdDocId}`
    ));

    // 6. 更新文档
    log('\n⏳ 等待2秒后更新文档...', 'yellow');
    await sleep(2000);
    
    results.push(await testEndpoint(
      '更新文档',
      'PUT',
      `/rag/documents/${createdDocId}`,
      {
        title: '测试文档 - 冰岛F26公路指南（已更新）',
        tags: ['road', 'iceland', 'test', 'updated'],
        metadata: {
          author: 'Test Script',
          version: '2.0',
          test: true,
          updatedAt: new Date().toISOString(),
        },
      }
    ));

    // 7. 验证更新后的文档
    await sleep(1000);
    results.push(await testEndpoint(
      '验证更新后的文档',
      'GET',
      `/rag/documents/${createdDocId}`
    ));
  }

  // 8. 批量创建文档
  log('\n⏳ 等待2秒后测试批量创建...', 'yellow');
  await sleep(2000);
  
  results.push(await testEndpoint(
    '批量创建文档',
    'POST',
    '/rag/index/batch',
    {
      documents: [
        {
          collection: 'travel_guides',
          title: '批量测试文档1',
          content: '这是批量创建的测试文档1。',
          countryCode: 'IS',
          tags: ['test', 'batch'],
        },
        {
          collection: 'travel_guides',
          title: '批量测试文档2',
          content: '这是批量创建的测试文档2。',
          countryCode: 'NO',
          tags: ['test', 'batch'],
        },
      ],
    }
  ));

  // ==================== 清理测试数据 ====================
  log('\n' + '='.repeat(60), 'cyan');
  log('🧹 清理测试数据', 'cyan');
  log('='.repeat(60), 'cyan');

  if (createdDocId) {
    log('\n⚠️  是否删除测试文档？', 'yellow');
    log(`   文档ID: ${createdDocId}`, 'yellow');
    log('   (在实际测试中，可以取消注释下面的代码来删除)', 'yellow');
    
    // 取消注释以下代码来删除测试文档
    // results.push(await testEndpoint(
    //   '删除测试文档',
    //   'DELETE',
    //   `/rag/documents/${createdDocId}`
    // ));
  }

  // ==================== 测试结果统计 ====================
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 测试结果统计', 'cyan');
  log('='.repeat(60), 'cyan');

  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  log(`\n总计: ${total}`, 'blue');
  log(`✅ 通过: ${passed}`, 'green');
  log(`❌ 失败: ${failed}`, 'red');
  log(`📈 成功率: ${((passed / total) * 100).toFixed(1)}%\n`, 'cyan');

  // 显示失败的测试
  if (failed > 0) {
    log('失败的测试:', 'red');
    results
      .filter(r => !r.success)
      .forEach(r => {
        log(`  ❌ ${r.name}`, 'red');
        if (r.error) {
          log(`     错误: ${r.error}`, 'red');
        }
        if (r.statusCode) {
          log(`     HTTP状态: ${r.statusCode}`, 'red');
        }
      });
    log('');
  }

  // 显示成功的测试摘要
  if (passed > 0) {
    log('通过的测试:', 'green');
    results
      .filter(r => r.success)
      .forEach(r => {
        log(`  ✅ ${r.name}`, 'green');
      });
    log('');
  }

  log('='.repeat(60), 'cyan');
  log('✨ 测试完成！', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');

  // 返回退出码
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
main().catch(error => {
  log(`\n❌ 测试执行失败: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
