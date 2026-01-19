#!/usr/bin/env ts-node
/**
 * 测试路线模块 CRUD 接口
 * 
 * 使用方法:
 *   ts-node scripts/test-route-crud-api.ts
 * 
 * 或者:
 *   npm run test:route-crud
 */

import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/route-directions`;

interface TestResult {
  name: string;
  success: boolean;
  status?: number;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

// 检查服务器是否运行
async function checkServerHealth(): Promise<boolean> {
  try {
    // 尝试访问一个简单的路由来检查服务器是否运行
    await axios.get(`${API_BASE}?limit=1`, {
      timeout: 3000,
      validateStatus: () => true, // 接受任何状态码，包括404
    });
    // 只要服务器响应（无论状态码），就认为服务器在运行
    return true;
  } catch (error: any) {
    // 如果是连接错误或超时，服务器可能未运行
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return false;
    }
    // 其他错误（如网络错误）也认为服务器在运行（可能是路由问题）
    return true;
  }
}

async function testRequest(
  name: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: any
): Promise<TestResult> {
  try {
    const config: any = {
      method: method.toLowerCase(),
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10秒超时
    };

    if (body) {
      config.data = body;
    }

    const response = await axios(config);
    const data: any = response.data;

    return {
      name,
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      data: data.success ? data.data : data,
      error: (response.status >= 200 && response.status < 300) ? undefined : (data.error?.message || JSON.stringify(data)),
    };
  } catch (error: any) {
    return {
      name,
      success: false,
      status: error.response?.status,
      error: error.response?.data?.error?.message || error.message || String(error),
    };
  }
}

async function runTests() {
  console.log('🧪 开始测试路线模块 CRUD 接口...\n');
  console.log(`📍 API 地址: ${API_BASE}\n`);

  // 检查服务器是否运行
  console.log('🔍 检查服务器状态...');
  const serverOk = await checkServerHealth();
  if (!serverOk) {
    console.log('❌ 服务器未运行或无法访问！');
    console.log(`   请确保服务器正在运行在 ${BASE_URL}`);
    console.log('   启动服务器: npm run dev');
    process.exit(1);
  }
  console.log('✅ 服务器运行正常\n');

  // ============================================
  // 1. 路线方向（RouteDirection）CRUD 测试
  // ============================================

  console.log('📋 1. 路线方向（RouteDirection）CRUD 测试\n');

  // 1.1 创建路线方向
  console.log('  ➕ 测试创建路线方向...');
  const createResult = await testRequest(
    '创建路线方向',
    'POST',
    API_BASE,
    {
      countryCode: 'IS',
      name: 'Test Iceland Route',
      nameCN: '测试冰岛路线',
      nameEN: 'Test Iceland Route',
      description: '这是一个测试路线方向',
      tags: ['test', 'scenic'],
      regions: ['South'],
      entryHubs: ['Reykjavik'],
      isActive: true,
    }
  );
  results.push(createResult);
  console.log(`    ${createResult.success ? '✅' : '❌'} ${createResult.name}: ${createResult.success ? '成功' : createResult.error}`);
  
  let routeDirectionId: number | null = null;
  let routeDirectionUuid: string | null = null;
  if (createResult.success && createResult.data) {
    routeDirectionId = createResult.data.id;
    routeDirectionUuid = createResult.data.uuid;
    console.log(`    📌 创建的路线方向 ID: ${routeDirectionId}, UUID: ${routeDirectionUuid}`);
  }

  // 1.2 查询路线方向列表
  console.log('\n  📋 测试查询路线方向列表...');
  const listResult = await testRequest(
    '查询路线方向列表',
    'GET',
    `${API_BASE}?countryCode=IS&isActive=true`
  );
  results.push(listResult);
  console.log(`    ${listResult.success ? '✅' : '❌'} ${listResult.name}: ${listResult.success ? `成功，返回 ${Array.isArray(listResult.data) ? listResult.data.length : 0} 条记录` : listResult.error}`);

  // 1.3 根据ID获取路线方向
  if (routeDirectionId) {
    console.log('\n  🔍 测试根据ID获取路线方向...');
    const getByIdResult = await testRequest(
      '根据ID获取路线方向',
      'GET',
      `${API_BASE}/${routeDirectionId}`
    );
    results.push(getByIdResult);
    console.log(`    ${getByIdResult.success ? '✅' : '❌'} ${getByIdResult.name}: ${getByIdResult.success ? '成功' : getByIdResult.error}`);
  }

  // 1.4 根据UUID获取路线方向
  if (routeDirectionUuid) {
    console.log('\n  🔍 测试根据UUID获取路线方向...');
    const getByUuidResult = await testRequest(
      '根据UUID获取路线方向',
      'GET',
      `${API_BASE}/uuid/${routeDirectionUuid}`
    );
    results.push(getByUuidResult);
    console.log(`    ${getByUuidResult.success ? '✅' : '❌'} ${getByUuidResult.name}: ${getByUuidResult.success ? '成功' : getByUuidResult.error}`);
  }

  // 1.5 更新路线方向
  if (routeDirectionId) {
    console.log('\n  ✏️  测试更新路线方向...');
    const updateResult = await testRequest(
      '更新路线方向',
      'PUT',
      `${API_BASE}/${routeDirectionId}`,
      {
        nameCN: '测试冰岛路线（已更新）',
        description: '这是更新后的描述',
      }
    );
    results.push(updateResult);
    console.log(`    ${updateResult.success ? '✅' : '❌'} ${updateResult.name}: ${updateResult.success ? '成功' : updateResult.error}`);
  }

  // 1.6 根据国家获取路线方向
  console.log('\n  🌍 测试根据国家获取路线方向...');
  const getByCountryResult = await testRequest(
    '根据国家获取路线方向',
    'GET',
    `${API_BASE}/by-country/IS?limit=10`
  );
  results.push(getByCountryResult);
  console.log(`    ${getByCountryResult.success ? '✅' : '❌'} ${getByCountryResult.name}: ${getByCountryResult.success ? '成功' : getByCountryResult.error}`);

  // ============================================
  // 2. 路线模板（RouteTemplate）CRUD 测试
  // ============================================

  console.log('\n\n📋 2. 路线模板（RouteTemplate）CRUD 测试\n');

  // 2.1 创建路线模板
  if (routeDirectionId) {
    console.log('  ➕ 测试创建路线模板...');
    const createTemplateResult = await testRequest(
      '创建路线模板',
      'POST',
      `${API_BASE}/templates`,
      {
        routeDirectionId: routeDirectionId,
        durationDays: 7,
        name: 'Test 7-Day Template',
        nameCN: '测试7天模板',
        nameEN: 'Test 7-Day Template',
        dayPlans: [
          {
            day: 1,
            theme: '雷克雅未克探索',
            requiredNodes: [],
          },
          {
            day: 2,
            theme: '黄金圈',
            requiredNodes: [],
          },
        ],
        defaultPacePreference: 'BALANCED',
        isActive: true,
      }
    );
    results.push(createTemplateResult);
    console.log(`    ${createTemplateResult.success ? '✅' : '❌'} ${createTemplateResult.name}: ${createTemplateResult.success ? '成功' : createTemplateResult.error}`);
    
    let templateId: number | null = null;
    if (createTemplateResult.success && createTemplateResult.data) {
      templateId = createTemplateResult.data.id;
      console.log(`    📌 创建的路线模板 ID: ${templateId}`);
    }

    // 2.2 查询路线模板列表
    console.log('\n  📋 测试查询路线模板列表...');
    const listTemplatesResult = await testRequest(
      '查询路线模板列表',
      'GET',
      `${API_BASE}/templates?routeDirectionId=${routeDirectionId}&isActive=true`
    );
    results.push(listTemplatesResult);
    console.log(`    ${listTemplatesResult.success ? '✅' : '❌'} ${listTemplatesResult.name}: ${listTemplatesResult.success ? `成功，返回 ${Array.isArray(listTemplatesResult.data) ? listTemplatesResult.data.length : 0} 条记录` : listTemplatesResult.error}`);

    // 2.3 根据ID获取路线模板
    if (templateId) {
      console.log('\n  🔍 测试根据ID获取路线模板...');
      const getTemplateByIdResult = await testRequest(
        '根据ID获取路线模板',
        'GET',
        `${API_BASE}/templates/${templateId}`
      );
      results.push(getTemplateByIdResult);
      console.log(`    ${getTemplateByIdResult.success ? '✅' : '❌'} ${getTemplateByIdResult.name}: ${getTemplateByIdResult.success ? '成功' : getTemplateByIdResult.error}`);
    }

    // 2.4 更新路线模板
    if (templateId) {
      console.log('\n  ✏️  测试更新路线模板...');
      const updateTemplateResult = await testRequest(
        '更新路线模板',
        'PUT',
        `${API_BASE}/templates/${templateId}`,
        {
          nameCN: '测试7天模板（已更新）',
          durationDays: 8,
        }
      );
      results.push(updateTemplateResult);
      console.log(`    ${updateTemplateResult.success ? '✅' : '❌'} ${updateTemplateResult.name}: ${updateTemplateResult.success ? '成功' : updateTemplateResult.error}`);
    }

    // 2.5 删除路线模板（软删除）
    if (templateId) {
      console.log('\n  🗑️  测试删除路线模板（软删除）...');
      const deleteTemplateResult = await testRequest(
        '删除路线模板',
        'DELETE',
        `${API_BASE}/templates/${templateId}`
      );
      results.push(deleteTemplateResult);
      console.log(`    ${deleteTemplateResult.success ? '✅' : '❌'} ${deleteTemplateResult.name}: ${deleteTemplateResult.success ? '成功' : deleteTemplateResult.error}`);
    }
  }

  // 1.7 删除路线方向（软删除）
  if (routeDirectionId) {
    console.log('\n  🗑️  测试删除路线方向（软删除）...');
    const deleteResult = await testRequest(
      '删除路线方向',
      'DELETE',
      `${API_BASE}/${routeDirectionId}`
    );
    results.push(deleteResult);
    console.log(`    ${deleteResult.success ? '✅' : '❌'} ${deleteResult.name}: ${deleteResult.success ? '成功' : deleteResult.error}`);
  }

  // ============================================
  // 3. 测试结果汇总
  // ============================================

  console.log('\n\n📊 测试结果汇总\n');
  console.log('=' .repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`总计: ${results.length} 个测试`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  
  if (failCount > 0) {
    console.log('\n失败的测试:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
  }
  
  console.log('=' .repeat(60));
  
  // 返回退出码
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
