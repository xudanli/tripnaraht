#!/usr/bin/env ts-node
/**
 * 测试准备度 API 接口
 * 
 * 测试所有准备度相关的接口：
 * 1. POST /readiness/check - 检查准备度
 * 2. GET /readiness/trip/:id - 根据行程ID检查准备度
 * 3. GET /readiness/capability-packs - 获取能力包列表
 * 4. POST /readiness/capability-packs/evaluate - 评估能力包
 * 5. GET /readiness/personalized-checklist - 获取个性化清单
 * 6. GET /readiness/risk-warnings - 获取风险预警
 * 
 * 使用方法:
 *   ts-node scripts/test-readiness-api.ts [baseUrl]
 *   例如: ts-node scripts/test-readiness-api.ts http://localhost:3000
 */

import axios from 'axios';

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const API_PREFIX = '/api'; // 所有路由都有 /api 前缀
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || process.argv[4]; // 从环境变量或参数获取token

// 创建带认证的 axios 实例
const api = axios.create({
  baseURL: BASE_URL + API_PREFIX,
  headers: ACCESS_TOKEN ? {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
  } : {},
});

interface TestResult {
  name: string;
  success: boolean;
  status?: number;
  error?: string;
  data?: any;
}

async function testCheckReadiness(): Promise<TestResult> {
  console.log('\n📋 测试 1: POST /readiness/check (冰岛)');
  
  try {
    const response = await api.post('/readiness/check', {
      destinationId: 'IS',
      traveler: {
        nationality: 'CN',
        budgetLevel: 'medium',
        riskTolerance: 'medium',
      },
      trip: {
        startDate: '2025-01-10',
        endDate: '2025-01-17',
      },
      itinerary: {
        countries: ['IS'],
        activities: ['hiking', 'outdoor', 'photography'],
        season: 'winter',
      },
      geo: {
        lat: 64.1466,
        lng: -21.9426,
        enhanceWithGeo: false, // 暂时关闭地理增强，避免依赖其他服务
      },
    });

    if (response.data.success) {
      const data = response.data.data;
      console.log('✅ 成功');
      console.log(`   - Findings: ${data.findings?.length || 0} 个分类`);
      console.log(`   - Blockers: ${data.summary?.totalBlockers || 0}`);
      console.log(`   - Must: ${data.summary?.totalMust || 0}`);
      console.log(`   - Should: ${data.summary?.totalShould || 0}`);
      console.log(`   - Optional: ${data.summary?.totalOptional || 0}`);
      console.log(`   - Risks: ${data.risks?.length || 0}`);
      
      // 显示第一个 finding 的详细信息
      if (data.findings && data.findings.length > 0) {
        const firstFinding = data.findings[0];
        console.log(`\n   第一个分类: ${firstFinding.category}`);
        if (firstFinding.blockers && firstFinding.blockers.length > 0) {
          console.log(`   - Blocker: ${firstFinding.blockers[0].message}`);
        }
        if (firstFinding.must && firstFinding.must.length > 0) {
          console.log(`   - Must: ${firstFinding.must[0].message}`);
        }
      }
      
      return {
        name: 'POST /readiness/check',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'POST /readiness/check',
        success: false,
        status: response.status,
        error: 'Response success is false',
        data: response.data,
      };
    }
  } catch (error: any) {
    console.log('❌ 失败');
    console.log(`   错误: ${error.message}`);
    if (error.response) {
      console.log(`   状态码: ${error.response.status}`);
      console.log(`   响应: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return {
      name: 'POST /readiness/check',
      success: false,
      status: error.response?.status,
      error: error.message,
    };
  }
}

async function testGetCapabilityPacks(): Promise<TestResult> {
  console.log('\n📋 测试 2: GET /readiness/capability-packs');
  
  try {
    const response = await api.get('/readiness/capability-packs');
    
    if (response.data.success) {
      const packs = response.data.data?.packs || [];
      console.log('✅ 成功');
      console.log(`   - 能力包数量: ${packs.length}`);
      packs.forEach((pack: any) => {
        console.log(`   - ${pack.type}: ${pack.displayName}`);
      });
      
      return {
        name: 'GET /readiness/capability-packs',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'GET /readiness/capability-packs',
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    console.log('❌ 失败');
    console.log(`   错误: ${error.message}`);
    return {
      name: 'GET /readiness/capability-packs',
      success: false,
      status: error.response?.status,
      error: error.message,
    };
  }
}

async function testEvaluateCapabilityPacks(): Promise<TestResult> {
  console.log('\n📋 测试 3: POST /readiness/capability-packs/evaluate (冰岛)');
  
  try {
    const response = await api.post('/readiness/capability-packs/evaluate', {
      destinationId: 'IS',
      itinerary: {
        countries: ['IS'],
        activities: ['hiking', 'driving'],
        season: 'winter',
      },
    });
    
    if (response.data.success) {
      const data = response.data.data;
      console.log('✅ 成功');
      console.log(`   - 总能力包: ${data.total || 0}`);
      console.log(`   - 触发的包: ${data.triggered || 0}`);
      if (data.results && data.results.length > 0) {
        data.results.forEach((result: any) => {
          console.log(`   - ${result.pack?.displayName}: ${result.triggered ? '✅ 触发' : '❌ 未触发'}`);
          if (result.reason) {
            console.log(`     原因: ${result.reason}`);
          }
        });
      }
      
      return {
        name: 'POST /readiness/capability-packs/evaluate',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'POST /readiness/capability-packs/evaluate',
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    console.log('❌ 失败');
    console.log(`   错误: ${error.message}`);
    return {
      name: 'POST /readiness/capability-packs/evaluate',
      success: false,
      status: error.response?.status,
      error: error.message,
    };
  }
}

async function testGetTripReadiness(tripId: string): Promise<TestResult> {
  console.log(`\n📋 测试 4: GET /readiness/trip/:id (${tripId})`);
  
  try {
    const response = await api.get(`/readiness/trip/${tripId}`);
    
    if (response.data.success) {
      const data = response.data.data;
      console.log('✅ 成功');
      console.log(`   - Findings: ${data.findings?.length || 0} 个分类`);
      console.log(`   - Blockers: ${data.summary?.totalBlockers || 0}`);
      console.log(`   - Must: ${data.summary?.totalMust || 0}`);
      console.log(`   - Should: ${data.summary?.totalShould || 0}`);
      
      return {
        name: `GET /readiness/trip/:id (${tripId})`,
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: `GET /readiness/trip/:id (${tripId})`,
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('⚠️  行程不存在 (404)');
      return {
        name: `GET /readiness/trip/:id (${tripId})`,
        success: false,
        status: 404,
        error: 'Trip not found',
      };
    } else {
      console.log('❌ 失败');
      console.log(`   错误: ${error.message}`);
      return {
        name: `GET /readiness/trip/:id (${tripId})`,
        success: false,
        status: error.response?.status,
        error: error.message,
      };
    }
  }
}

async function testGetPersonalizedChecklist(tripId: string): Promise<TestResult> {
  console.log(`\n📋 测试 5: GET /readiness/personalized-checklist?tripId=${tripId}`);
  
  try {
    const response = await api.get('/readiness/personalized-checklist', {
      params: { tripId },
    });
    
    if (response.data.success) {
      const data = response.data.data;
      console.log('✅ 成功');
      console.log(`   - Blocker: ${data.checklist?.blocker?.length || 0} 项`);
      console.log(`   - Must: ${data.checklist?.must?.length || 0} 项`);
      console.log(`   - Should: ${data.checklist?.should?.length || 0} 项`);
      console.log(`   - Optional: ${data.checklist?.optional?.length || 0} 项`);
      
      return {
        name: `GET /readiness/personalized-checklist`,
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: `GET /readiness/personalized-checklist`,
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('⚠️  行程不存在 (404)');
      return {
        name: `GET /readiness/personalized-checklist`,
        success: false,
        status: 404,
        error: 'Trip not found',
      };
    } else {
      console.log('❌ 失败');
      console.log(`   错误: ${error.message}`);
      return {
        name: `GET /readiness/personalized-checklist`,
        success: false,
        status: error.response?.status,
        error: error.message,
      };
    }
  }
}

async function testGetRiskWarnings(tripId: string): Promise<TestResult> {
  console.log(`\n📋 测试 6: GET /readiness/risk-warnings?tripId=${tripId}`);
  
  try {
    const response = await api.get('/readiness/risk-warnings', {
      params: { tripId },
    });
    
    if (response.data.success) {
      const data = response.data.data;
      console.log('✅ 成功');
      console.log(`   - 风险总数: ${data.summary?.totalRisks || 0}`);
      console.log(`   - 高风险: ${data.summary?.highSeverity || 0}`);
      console.log(`   - 中风险: ${data.summary?.mediumSeverity || 0}`);
      console.log(`   - 低风险: ${data.summary?.lowSeverity || 0}`);
      
      if (data.risks && data.risks.length > 0) {
        console.log('\n   风险详情:');
        data.risks.slice(0, 3).forEach((risk: any, index: number) => {
          console.log(`   ${index + 1}. [${risk.severity}] ${risk.type}: ${risk.message}`);
        });
      }
      
      return {
        name: `GET /readiness/risk-warnings`,
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: `GET /readiness/risk-warnings`,
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('⚠️  行程不存在 (404)');
      return {
        name: `GET /readiness/risk-warnings`,
        success: false,
        status: 404,
        error: 'Trip not found',
      };
    } else {
      console.log('❌ 失败');
      console.log(`   错误: ${error.message}`);
      return {
        name: `GET /readiness/risk-warnings`,
        success: false,
        status: error.response?.status,
        error: error.message,
      };
    }
  }
}

async function main() {
  console.log('🚀 开始测试准备度 API 接口');
  console.log(`📍 基础URL: ${BASE_URL}`);
  if (ACCESS_TOKEN) {
    console.log(`🔑 使用认证Token: ${ACCESS_TOKEN.substring(0, 20)}...`);
  } else {
    console.log('⚠️  未提供认证Token，如果接口需要认证可能会失败');
    console.log('   使用方法: ACCESS_TOKEN=your_token ts-node scripts/test-readiness-api.ts');
  }
  console.log('');

  const results: TestResult[] = [];

  // 测试 1: POST /readiness/check
  results.push(await testCheckReadiness());

  // 测试 2: GET /readiness/capability-packs
  results.push(await testGetCapabilityPacks());

  // 测试 3: POST /readiness/capability-packs/evaluate
  results.push(await testEvaluateCapabilityPacks());

  // 测试 4-6: 需要行程ID的接口
  // 尝试从环境变量或参数获取行程ID，如果没有则跳过
  const tripId = process.argv[3] || process.env.TRIP_ID;
  if (tripId) {
    results.push(await testGetTripReadiness(tripId));
    results.push(await testGetPersonalizedChecklist(tripId));
    results.push(await testGetRiskWarnings(tripId));
  } else {
    console.log('\n⚠️  跳过需要行程ID的测试（提供 tripId 作为第三个参数或设置 TRIP_ID 环境变量）');
  }

  // 汇总结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    const status = result.status ? ` [${result.status}]` : '';
    console.log(`${index + 1}. ${icon} ${result.name}${status}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`总计: ${successCount}/${totalCount} 通过`);
  console.log('-'.repeat(60));

  if (successCount === totalCount) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('⚠️  部分测试失败');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});

