#!/usr/bin/env tsx
/**
 * 测试冰岛信息源API接口
 */

// 使用 export {} 使文件成为模块，避免全局作用域冲突
export {};

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  endpoint: string;
  success: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}

async function testEndpoint(name: string, endpoint: string): Promise<TestResult> {
  console.log(`\n📋 测试: ${name}`);
  console.log(`   URL: ${API_BASE_URL}${endpoint}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const statusCode = response.status;
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success !== false) {
      console.log(`   ✅ 成功 (${statusCode})`);
      if (data.data) {
        console.log(`   📦 数据预览:`, JSON.stringify(data.data).substring(0, 200) + '...');
      }
      return {
        name,
        endpoint,
        success: true,
        statusCode,
        data,
      };
    } else {
      console.log(`   ❌ 失败 (${statusCode})`);
      console.log(`   📄 响应:`, JSON.stringify(data).substring(0, 200));
      return {
        name,
        endpoint,
        success: false,
        statusCode,
        error: data.message || data.error?.message || 'Unknown error',
      };
    }
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error.message}`);
    return {
      name,
      endpoint,
      success: false,
      error: error.message,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('🧪 测试冰岛信息源API接口');
  console.log('='.repeat(70));
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  const tests: TestResult[] = [];

  // 测试1: vedur.is 天气预报
  tests.push(await testEndpoint(
    'vedur.is 天气预报 - 中央高地',
    '/api/iceland-info/weather?region=centralhighlands'
  ));

  tests.push(await testEndpoint(
    'vedur.is 天气预报 - 带坐标',
    '/api/iceland-info/weather?lat=64.5&lng=-18.5&includeWindDetails=true'
  ));

  // 测试2: safetravel.is 安全信息
  tests.push(await testEndpoint(
    'safetravel.is 安全信息 - 高地区域',
    '/api/iceland-info/safety?region=highlands'
  ));

  tests.push(await testEndpoint(
    'safetravel.is 安全信息 - 天气警报',
    '/api/iceland-info/safety?alertType=weather'
  ));

  // 测试3: road.is 路况信息
  tests.push(await testEndpoint(
    'road.is 路况信息 - 所有F路',
    '/api/iceland-info/road-conditions'
  ));

  tests.push(await testEndpoint(
    'road.is 路况信息 - 指定F路',
    '/api/iceland-info/road-conditions?fRoads=F208,F26,F910'
  ));

  tests.push(await testEndpoint(
    'road.is 路况信息 - 需要谨慎的F路',
    '/api/iceland-info/road-conditions?status=caution'
  ));

  // 统计结果
  console.log('\n' + '='.repeat(70));
  console.log('📊 测试结果统计');
  console.log('='.repeat(70));

  const successCount = tests.filter(t => t.success).length;
  const failCount = tests.filter(t => !t.success).length;

  console.log(`\n✅ 成功: ${successCount} 个`);
  console.log(`❌ 失败: ${failCount} 个`);
  console.log(`📦 总计: ${tests.length} 个\n`);

  if (failCount > 0) {
    console.log('❌ 失败的测试:');
    tests.filter(t => !t.success).forEach(test => {
      console.log(`   • ${test.name}`);
      console.log(`     端点: ${test.endpoint}`);
      if (test.statusCode) {
        console.log(`     状态码: ${test.statusCode}`);
      }
      if (test.error) {
        console.log(`     错误: ${test.error}`);
      }
    });
    console.log('');
  }

  // 检查服务是否运行
  if (failCount === tests.length) {
    console.log('⚠️  所有测试都失败了，可能的原因：');
    console.log('   1. 服务未运行 - 请运行: npm run dev');
    console.log('   2. 服务需要重启以加载新模块');
    console.log('   3. 路由未正确注册');
    console.log('');
  }

  console.log('✅ 测试完成！');
}

main().catch(console.error);
