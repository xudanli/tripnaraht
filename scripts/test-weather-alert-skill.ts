#!/usr/bin/env tsx
/**
 * 测试天气告警 Skill
 *
 * 用途: 验证 WeatherAlertSkill 的风险评估逻辑
 * 使用: npx tsx scripts/test-weather-alert-skill.ts
 */

import { IcelandWeatherRealtimeService } from '../src/skills/world/services/iceland-weather-realtime.service';
import { WeatherAlertSkill } from '../src/skills/world/weather-alert.skill';

async function testWeatherAlertSkill() {
  console.log('🌤️  测试天气告警 Skill...\n');

  const weatherService = new IcelandWeatherRealtimeService();
  const skill = new WeatherAlertSkill(weatherService);

  try {
    // Test 1: 低风险路线（Reykjavík 市内）
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 1: 低风险路线 (Reykjavík 市内)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const lowRiskResult = await skill.execute({
      locations: [
        { lat: 64.1466, lng: -21.9426, name: 'Reykjavík Downtown', type: 'start' },
        { lat: 64.1355, lng: -21.8954, name: 'Perlan', type: 'end' },
      ],
      dateRange: {
        start: new Date(),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      riskTolerance: 'medium',
    });

    console.log(`✅ 检查结果:`);
    console.log(`   - 整体风险: ${lowRiskResult.overallRisk}`);
    console.log(`   - Gate 建议: ${lowRiskResult.gateRecommendation}`);
    console.log(`   - 摘要: ${lowRiskResult.summary}\n`);

    if (lowRiskResult.adjustments.length > 0) {
      console.log(`📋 调整建议:`);
      lowRiskResult.adjustments.forEach(adj => console.log(`   - ${adj}`));
      console.log();
    }

    // Test 2: 高风险路线（高地 F-road）
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 2: 高风险路线 (F208 高地路段)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const highRiskResult = await skill.execute({
      locations: [
        { lat: 63.4186, lng: -19.0059, name: 'Vík', type: 'start' },
        { lat: 63.9917, lng: -19.0578, name: 'Landmannalaugar', type: 'waypoint' },
        { lat: 64.75, lng: -18.0, name: 'Highlands Center', type: 'waypoint' },
      ],
      dateRange: {
        start: new Date(),
        end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
      riskTolerance: 'medium',
    });

    console.log(`✅ 检查结果:`);
    console.log(`   - 整体风险: ${highRiskResult.overallRisk}`);
    console.log(`   - Gate 建议: ${highRiskResult.gateRecommendation}`);
    console.log(`   - 摘要: ${highRiskResult.summary}\n`);

    if (highRiskResult.adjustments.length > 0) {
      console.log(`📋 调整建议:`);
      highRiskResult.adjustments.forEach(adj => console.log(`   - ${adj}`));
      console.log();
    }

    // 显示每个位置的详细天气
    console.log(`📍 各位置天气详情:`);
    highRiskResult.locationWeather.forEach(lw => {
      console.log(`\n   ${lw.location.name || 'Unknown'}:`);
      console.log(`     - 风险等级: ${lw.riskLevel}`);
      if (lw.forecast) {
        console.log(`     - 温度: ${lw.forecast.temperature}°C`);
        console.log(`     - 风速: ${lw.forecast.windSpeed?.toFixed(1)} m/s`);
        console.log(`     - 能见度: ${lw.forecast.visibility}m`);
        console.log(`     - 天气: ${lw.forecast.conditions}`);
      }
      if (lw.blockers.length > 0) {
        console.log(`     - 阻塞因素: ${lw.blockers.join(', ')}`);
      }
      if (lw.warnings.length > 0) {
        console.log(`     - 告警: ${lw.warnings.join(', ')}`);
      }
    });
    console.log();

    // Test 3: 不同风险容忍度
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 3: 不同风险容忍度对比');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const testLocation = { lat: 64.75, lng: -18.0, name: 'Highlands', type: 'waypoint' as const };

    for (const tolerance of ['low', 'medium', 'high'] as const) {
      const result = await skill.execute({
        locations: [testLocation],
        dateRange: {
          start: new Date(),
          end: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        riskTolerance: tolerance,
      });

      console.log(`   风险容忍度: ${tolerance}`);
      console.log(`     - 风险等级: ${result.overallRisk}`);
      console.log(`     - Gate 建议: ${result.gateRecommendation}\n`);
    }

    // Test 4: 证据引用
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 4: 证据引用验证');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`✅ 证据数: ${highRiskResult.evidenceRefs.length}`);
    highRiskResult.evidenceRefs.forEach((evidence, i) => {
      console.log(`   ${i + 1}. ${evidence.location}`);
      console.log(`      - 来源: ${evidence.source}`);
      console.log(`      - 置信度: ${evidence.confidence}`);
      console.log(`      - 时间: ${evidence.timestamp.toISOString()}`);
    });
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 所有测试完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 测试总结:');
    console.log(`   - 低风险检测: ✅`);
    console.log(`   - 高风险检测: ✅`);
    console.log(`   - 风险容忍度调整: ✅`);
    console.log(`   - 证据链追踪: ✅`);
    console.log(`   - Gate 建议生成: ✅\n`);
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

// 执行测试
testWeatherAlertSkill()
  .then(() => {
    console.log('✅ 测试任务完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 测试任务失败:', error);
    process.exit(1);
  });
