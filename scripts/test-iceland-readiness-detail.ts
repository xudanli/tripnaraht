#!/usr/bin/env ts-node
/**
 * 测试冰岛准备度接口详细返回信息
 * 
 * 展示冰岛准备度接口应该返回的所有信息
 */

import axios from 'axios';

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const API_PREFIX = '/api';

async function testIcelandReadiness() {
  console.log('🇮🇸 冰岛准备度接口测试\n');
  console.log('='.repeat(70));
  
  // 测试场景1: 冬季户外活动
  console.log('\n📋 测试场景 1: 冬季户外活动（hiking, outdoor, volcano）\n');
  
  const response1 = await axios.post(`${BASE_URL}${API_PREFIX}/readiness/check`, {
    destinationId: 'IS',
    itinerary: {
      countries: ['IS'],
      activities: ['hiking', 'outdoor', 'volcano'],
      season: 'winter',
    },
  });

  const finding1 = response1.data.data.findings[0];
  console.log(`✅ 成功获取冰岛准备度信息`);
  console.log(`   Pack ID: ${finding1.packId}`);
  console.log(`   版本: ${finding1.packVersion}`);
  console.log(`\n📊 返回内容统计:`);
  console.log(`   - 阻塞项 (Blockers): ${finding1.blockers.length} 项`);
  console.log(`   - 必须项 (Must): ${finding1.must.length} 项`);
  console.log(`   - 建议项 (Should): ${finding1.should.length} 项`);
  console.log(`   - 可选项 (Optional): ${finding1.optional.length} 项`);
  console.log(`   - 风险 (Risks): ${finding1.risks.length} 项`);

  // 显示风险详情
  if (finding1.risks.length > 0) {
    console.log(`\n⚠️  风险详情:`);
    finding1.risks.forEach((risk: any, index: number) => {
      console.log(`\n   ${index + 1}. [${risk.severity.toUpperCase()}] ${risk.type}`);
      console.log(`      摘要: ${risk.summary}`);
      console.log(`      应对措施:`);
      risk.mitigations.slice(0, 2).forEach((m: string) => {
        console.log(`        - ${m}`);
      });
    });
  }

  // 显示规则匹配结果
  if (finding1.must.length > 0) {
    console.log(`\n✅ 必须项 (Must):`);
    finding1.must.forEach((item: any, index: number) => {
      console.log(`\n   ${index + 1}. ${item.message}`);
      if (item.tasks && item.tasks.length > 0) {
        console.log(`      任务:`);
        item.tasks.forEach((task: any) => {
          console.log(`        - ${task.title}`);
        });
      }
    });
  }

  if (finding1.should.length > 0) {
    console.log(`\n💡 建议项 (Should):`);
    finding1.should.forEach((item: any, index: number) => {
      console.log(`   ${index + 1}. ${item.message}`);
    });
  }

  if (finding1.blockers.length > 0) {
    console.log(`\n🚫 阻塞项 (Blockers):`);
    finding1.blockers.forEach((item: any, index: number) => {
      console.log(`   ${index + 1}. ${item.message}`);
    });
  }

  // 测试场景2: 地热活动
  console.log('\n\n' + '='.repeat(70));
  console.log('\n📋 测试场景 2: 地热活动（geothermal, hot_springs）\n');
  
  const response2 = await axios.post(`${BASE_URL}${API_PREFIX}/readiness/check`, {
    destinationId: 'IS',
    itinerary: {
      countries: ['IS'],
      activities: ['geothermal', 'hot_springs', 'spa'],
    },
  });

  const finding2 = response2.data.data.findings[0];
  console.log(`✅ 成功获取冰岛准备度信息`);
  console.log(`\n📊 返回内容统计:`);
  console.log(`   - 阻塞项 (Blockers): ${finding2.blockers.length} 项`);
  console.log(`   - 必须项 (Must): ${finding2.must.length} 项`);
  console.log(`   - 建议项 (Should): ${finding2.should.length} 项`);

  if (finding2.must.length > 0) {
    console.log(`\n✅ 必须项 (Must):`);
    finding2.must.forEach((item: any, index: number) => {
      console.log(`   ${index + 1}. ${item.message}`);
    });
  }

  // 总结
  console.log('\n\n' + '='.repeat(70));
  console.log('\n📝 冰岛准备度接口应返回的信息总结:\n');
  console.log('1. 📍 基本信息:');
  console.log('   - destinationId: IS-ICELAND');
  console.log('   - packId: pack.is.iceland');
  console.log('   - packVersion: 1.0.0');
  console.log('\n2. ⚠️  风险信息 (Hazards):');
  console.log('   - weather_extreme (high): 极端天气风险');
  console.log('   - terrain (high): 地热区域灼伤风险');
  console.log('   - logistics_remote (high): 偏远地区物流风险');
  console.log('   - water_safety (medium): 水上安全风险');
  console.log('   - driving_conditions (high): 驾驶条件风险');
  console.log('\n3. ✅ 规则匹配结果 (Rules):');
  console.log('   - 根据行程活动类型和季节匹配规则');
  console.log('   - 规则分为: blocker, must, should, optional');
  console.log('   - 包含任务列表和用户询问项');
  console.log('\n4. 📋 检查清单 (Checklists):');
  console.log('   - 天气装备清单');
  console.log('   - 地热安全清单');
  console.log('   - 燃料补给规划清单');
  console.log('   - 驾驶准备清单');
  console.log('   - 海岸安全清单');
}

testIcelandReadiness().catch((error) => {
  console.error('❌ 测试失败:', error.message);
  if (error.response) {
    console.error('响应:', error.response.data);
  }
  process.exit(1);
});

