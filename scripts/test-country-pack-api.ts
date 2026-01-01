// scripts/test-country-pack-api.ts
/**
 * Country Pack API 测试脚本
 * 
 * 测试 Country Pack 相关的 API 端点
 * 
 * 用法：
 *   ts-node --project tsconfig.backend.json scripts/test-country-pack-api.ts
 * 
 * 或指定 API URL：
 *   API_URL=http://localhost:3000 ts-node --project tsconfig.backend.json scripts/test-country-pack-api.ts
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  status?: number;
  error?: string;
  data?: any;
}

async function testAPI(
  name: string,
  method: 'GET' | 'POST' | 'PUT',
  endpoint: string,
  data?: any
): Promise<TestResult> {
  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   ${method} ${endpoint}`);
    if (data && method !== 'GET') {
      console.log(`   📦 请求数据: ${JSON.stringify(data).substring(0, 100)}...`);
    }

    const config: any = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && method !== 'GET') {
      config.data = data;
    }

    const response = await axios(config);
    
    console.log(`   ✅ 成功 (${response.status})`);
    if (response.data) {
      const responseStr = JSON.stringify(response.data).substring(0, 200);
      console.log(`   📦 响应: ${responseStr}${responseStr.length >= 200 ? '...' : ''}`);
    }

    return {
      name,
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error: any) {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.message || error.message;
    console.log(`   ❌ 失败 (${status || 'N/A'})`);
    console.log(`   ⚠️  错误: ${errorMessage}`);

    return {
      name,
      success: false,
      status,
      error: errorMessage,
    };
  }
}

async function main() {
  console.log('🚀 开始测试 Country Pack API 端点...');
  console.log(`📍 Base URL: ${API_URL}\n`);

  const results: TestResult[] = [];

  // ========== 1. 测试获取所有国家 Pack 配置列表 ==========
  results.push(await testAPI(
    '获取所有国家 Pack 配置列表',
    'GET',
    '/countries/packs'
  ));

  // ========== 2. 测试获取单个国家 Pack 配置 ==========
  // 测试存在的国家
  results.push(await testAPI(
    '获取中国西藏 Pack 配置',
    'GET',
    '/countries/CN_XIZANG/pack'
  ));

  results.push(await testAPI(
    '获取新西兰 Pack 配置',
    'GET',
    '/countries/NZ/pack'
  ));

  // 测试不存在的国家（应该返回 GLOBAL 默认配置）
  results.push(await testAPI(
    '获取不存在的国家 Pack（应返回 GLOBAL）',
    'GET',
    '/countries/XX/pack'
  ));

  // ========== 3. 测试更新国家 Pack 配置（应该提示需要手动修改） ==========
  results.push(await testAPI(
    '尝试更新国家 Pack 配置（应提示手动修改）',
    'PUT',
    '/countries/CN_XIZANG/pack',
    {
      countryName: '中国西藏',
      riskThresholds: {
        highAltitudeM: 3500,
        rapidAscentM: 500,
      },
    }
  ));

  // ========== 4. 测试批量导入 Country Pack ==========
  // 使用冰岛的示例数据
  const icelandPackData = {
    countryCode: 'IS',
    countryName: 'Iceland',
    countryNameCN: '冰岛',
    routeDirections: [
      {
        countryCode: 'IS',
        name: 'IS_TEST_CULTURAL_CITIES',
        nameCN: '冰岛城市文化之旅（测试）',
        nameEN: 'Iceland Cultural Cities (Test)',
        description: '测试用的路线方向',
        tags: ['文化', '城市', '博物馆', '历史'],
        regions: ['IS_CAPITAL', 'IS_MAJOR_CITY_1'],
        entryHubs: ['冰岛首都机场', '冰岛主要城市'],
        seasonality: {
          bestMonths: [5, 6, 7, 8, 9],
          avoidMonths: [12, 1, 2],
        },
        constraints: {
          soft: {
            maxDailyAscentM: 200,
            maxElevationM: 1000,
          },
        },
        riskProfile: {
          altitudeSickness: false,
          roadClosure: false,
        },
        signaturePois: {
          types: ['MUSEUM', 'HISTORIC_SITE', 'CITY_CENTER'],
        },
        itinerarySkeleton: {
          dayThemes: ['抵达适应', '城市探索', '文化体验', '购物休闲', '返程'],
          dailyPace: 'MODERATE',
        },
        isActive: true,
      },
    ],
    regions: ['IS_CAPITAL', 'IS_MAJOR_CITY_1'],
    policy: {
      defaultPace: 'BALANCED',
      defaultRiskTolerance: 'medium',
    },
  };

  results.push(await testAPI(
    '批量导入冰岛 Country Pack',
    'POST',
    '/route-directions/import-pack',
    icelandPackData
  ));

  // ========== 测试结果统计 ==========
  console.log('\n\n📊 测试结果统计:');
  console.log('='.repeat(50));
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   ⚠️  错误: ${result.error}`);
    }
  });

  console.log('='.repeat(50));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const total = results.length;
  const successRate = ((successCount / total) * 100).toFixed(1);

  console.log(`总计: ${total} 个测试`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log(`📈 成功率: ${successRate}%`);

  if (failCount === 0) {
    console.log('\n🎉 所有测试通过！');
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述错误信息。');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  });
}







