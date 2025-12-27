// scripts/test-rag-api.ts
/**
 * 测试 RAG API 端点
 * 
 * 用途：测试所有 RAG 相关的 API 端点
 * 
 * 运行方式：
 * npx ts-node scripts/test-rag-api.ts
 */

import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testAPI(name: string, method: 'GET' | 'POST', endpoint: string, data?: any): Promise<TestResult> {
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${endpoint}`);

    const config: any = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method === 'GET' && data) {
      config.params = data;
    } else if (data) {
      config.data = data;
    }

    const response = await axios(config);
    
    console.log(`   ✅ 成功 (${response.status})`);
    if (response.data && typeof response.data === 'object') {
      console.log(`   📦 响应: ${JSON.stringify(response.data).substring(0, 200)}...`);
    }

    return {
      name,
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    console.log(`   ❌ 失败: ${error.message}`);
    if (error.response) {
      console.log(`   📦 响应: ${JSON.stringify(error.response.data)}`);
    }
    return {
      name,
      success: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log('🚀 开始测试 RAG API 端点...');
  console.log(`📍 Base URL: ${BASE_URL}\n`);

  const results: TestResult[] = [];

  // 1. 测试文档检索
  results.push(await testAPI(
    '文档检索 - Rail Pass 规则',
    'GET',
    '/rag/retrieve',
    {
      query: 'Eurail Global Pass rules for Iceland',
      collection: 'rail_pass_rules',
      countryCode: 'IS',
      limit: 5,
    }
  ));

  // 2. 测试文档检索 - 游记
  results.push(await testAPI(
    '文档检索 - 游记',
    'GET',
    '/rag/retrieve',
    {
      query: 'Iceland Highlands F-road experience',
      collection: 'travel_guides',
      countryCode: 'IS',
      limit: 5,
    }
  ));

  // 3. 测试索引单个文档
  results.push(await testAPI(
    '索引单个文档',
    'POST',
    '/rag/index',
    {
      collection: 'travel_guides',
      title: 'Test Document',
      content: 'This is a test document for RAG indexing.',
      source: 'https://test.com',
      countryCode: 'IS',
      tags: ['test'],
    }
  ));

  // 4. 测试提取 Rail Pass 规则
  results.push(await testAPI(
    '提取 Rail Pass 规则',
    'POST',
    '/rag/compliance/rail-pass',
    {
      passType: 'EURAIL_GLOBAL',
      countryCode: 'IS',
    }
  ));

  // 5. 测试提取 Trail Access 规则
  results.push(await testAPI(
    '提取 Trail Access 规则',
    'POST',
    '/rag/compliance/trail-access',
    {
      trailId: 'iceland-highlands-f26',
      countryCode: 'IS',
    }
  ));

  // 6. 测试生成路线叙事（需要有效的 routeDirectionId）
  // 注意：这个测试可能会失败，如果数据库中没有对应的 RouteDirection
  results.push(await testAPI(
    '生成路线叙事',
    'GET',
    '/rag/route-narrative/1',
    {
      countryCode: 'IS',
    }
  ));

  // 7. 测试生成路线段叙事
  results.push(await testAPI(
    '生成路线段叙事',
    'POST',
    '/rag/segment-narrative',
    {
      segmentId: 'test-segment-1',
      dayIndex: 1,
      name: 'Reykjavik to Landmannalaugar',
      description: 'From Reykjavik to the highlands',
      countryCode: 'IS',
    }
  ));

  // 8. 测试获取当地洞察
  results.push(await testAPI(
    '获取当地洞察',
    'GET',
    '/rag/local-insight',
    {
      countryCode: 'IS',
      tags: 'f_road,highlands',
      region: 'Highlands',
    }
  ));

  // 9. 测试获取当地洞察 - 尼泊尔
  results.push(await testAPI(
    '获取当地洞察 - 尼泊尔',
    'GET',
    '/rag/local-insight',
    {
      countryCode: 'NP',
      tags: 'ebc,trekking',
    }
  ));

  // 打印测试结果统计
  console.log('\n\n📊 测试结果统计:');
  console.log('='.repeat(50));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log('='.repeat(50));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log(`📈 成功率: ${((successCount / results.length) * 100).toFixed(1)}%`);

  if (failCount > 0) {
    console.log('\n⚠️  部分测试失败，请检查：');
    console.log('   1. 服务器是否正在运行');
    console.log('   2. 数据库是否已迁移');
    console.log('   3. 文档是否已索引');
    console.log('   4. API 端点是否正确');
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  }
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试运行失败:', error);
  process.exit(1);
});

