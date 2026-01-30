// scripts/test-risk-warnings-enhanced.ts
/**
 * 测试增强后的风险预警接口
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const TEST_TRIP_ID = process.env.TEST_TRIP_ID || '';

const axiosConfig = {
  proxy: false,
  timeout: 30000,
};

async function httpRequest(method: 'GET' | 'POST', url: string, data?: any) {
  try {
    const config: any = {
      method,
      url: `${BASE_URL}${url}`,
      ...axiosConfig,
    };

    if (data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/json' };
    }

    const response = await axios(config);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`API错误 (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function findTestTripId(): Promise<string> {
  if (TEST_TRIP_ID) {
    return TEST_TRIP_ID;
  }

  try {
    const response = await httpRequest('GET', '/api/trips?limit=1');
    if (response.success && response.data?.items?.length > 0) {
      return response.data.items[0].id;
    }
  } catch (error) {
    console.warn('无法获取测试行程ID，请设置 TEST_TRIP_ID 环境变量');
  }

  throw new Error('未找到测试行程ID，请设置 TEST_TRIP_ID 环境变量');
}

async function testRiskWarnings(tripId: string) {
  console.log(`\n📋 测试风险预警接口: GET /readiness/risk-warnings?tripId=${tripId}`);
  
  const response = await httpRequest('GET', `/readiness/risk-warnings?tripId=${tripId}&lang=zh`);
  
  if (!response.success) {
    throw new Error(`接口返回失败: ${JSON.stringify(response.error)}`);
  }

  const data = response.data;
  
  console.log('\n✅ 接口调用成功');
  console.log(`\n📊 风险摘要:`);
  console.log(`  - 总风险数: ${data.summary?.totalRisks || 0}`);
  console.log(`  - 高风险: ${data.summary?.highSeverity || 0}`);
  console.log(`  - 中风险: ${data.summary?.mediumSeverity || 0}`);
  console.log(`  - 低风险: ${data.summary?.lowSeverity || 0}`);
  
  if (data.summary?.byCategory) {
    console.log(`\n📊 按分类统计:`);
    console.log(`  - 天气: ${data.summary.byCategory.weather || 0}`);
    console.log(`  - 地形: ${data.summary.byCategory.terrain || 0}`);
    console.log(`  - 安全: ${data.summary.byCategory.safety || 0}`);
    console.log(`  - 物流: ${data.summary.byCategory.logistics || 0}`);
    console.log(`  - 其他: ${data.summary.byCategory.other || 0}`);
  }

  // 验证增强字段
  console.log(`\n🔍 验证增强字段:`);
  const risks = data.risks || [];
  let hasTypeLabel = 0;
  let hasCategory = 0;
  let hasAffectedPois = 0;
  let hasMitigationDetails = 0;
  
  risks.forEach((risk: any) => {
    if (risk.typeLabel) hasTypeLabel++;
    if (risk.category) hasCategory++;
    if (risk.affectedPois && risk.affectedPois.length > 0) hasAffectedPois++;
    if (risk.mitigationDetails && risk.mitigationDetails.length > 0) hasMitigationDetails++;
  });

  console.log(`  ✅ 有类型标签: ${hasTypeLabel}/${risks.length}`);
  console.log(`  ✅ 有分类: ${hasCategory}/${risks.length}`);
  console.log(`  ✅ 有影响的POI: ${hasAffectedPois}/${risks.length}`);
  console.log(`  ✅ 有详细缓解建议: ${hasMitigationDetails}/${risks.length}`);

  // 显示前3个风险的详细信息
  console.log(`\n📝 风险详情（前${Math.min(3, risks.length)}个）:`);
  risks.slice(0, 3).forEach((risk: any, index: number) => {
    console.log(`\n  ${index + 1}. ${risk.typeIcon || '⚠️'} ${risk.typeLabel || risk.type} (${risk.severityLabel || risk.severity})`);
    console.log(`     描述: ${risk.message || risk.description || '无描述'}`);
    if (risk.impact) {
      console.log(`     影响: ${risk.impact}`);
    }
    if (risk.affectedPois && risk.affectedPois.length > 0) {
      console.log(`     影响的POI:`);
      risk.affectedPois.forEach((poi: any) => {
        console.log(`       - ${poi.nameCN || poi.name} (第${poi.day}天)`);
      });
    }
    if (risk.mitigation && risk.mitigation.length > 0) {
      console.log(`     缓解建议:`);
      risk.mitigation.forEach((mit: string, idx: number) => {
        const priority = risk.mitigationDetails?.[idx]?.priority || '';
        console.log(`       ${idx + 1}. ${mit}${priority ? ` [${priority}]` : ''}`);
      });
    }
  });

  // 验证按分类分组
  if (data.risksByCategory) {
    console.log(`\n📂 按分类分组:`);
    Object.entries(data.risksByCategory).forEach(([category, risks]: [string, any]) => {
      if (risks && risks.length > 0) {
        console.log(`  ${category}: ${risks.length} 个风险`);
      }
    });
  }

  return data;
}

async function main() {
  try {
    console.log('🚀 开始测试增强后的风险预警接口');
    console.log(`📍 Base URL: ${BASE_URL}`);

    const tripId = await findTestTripId();
    console.log(`✅ 使用行程ID: ${tripId}`);

    await testRiskWarnings(tripId);

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
