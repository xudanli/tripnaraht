#!/usr/bin/env tsx
/**
 * 直接测试 Weather Skill
 *
 * 测试 Weather Skill 能否正常工作
 */

import 'reflect-metadata';
import { WeatherSearchSkill } from '../src/skills/weather/weather-search.skill';
import { DataSourceRouterService } from '../src/data-contracts/services/data-source-router.service';
import { IcelandComprehensiveService } from '../src/data-contracts/services/iceland-comprehensive.service';

async function main() {
  console.log('========================================');
  console.log('Weather Skill 直接测试');
  console.log('========================================\n');

  // 创建 WeatherSearchSkill 实例（无依赖）
  const weatherSkill = new WeatherSearchSkill();

  try {
    console.log('测试 1: 查询 Reykjavik 天气');
    console.log('─'.repeat(50));

    const result = await weatherSkill.execute({
      lat: 64.1466,
      lng: -21.9426,
      locationName: 'Reykjavik',
      includeWindDetails: true,
      includeAuroraInfo: false,
    });

    console.log(`✓ Location: ${result.location.name}`);
    console.log(`✓ Evidence ID: ${result.evidence_id}`);
    console.log(`✓ Source: ${result.source}`);
    console.log(`✓ Temperature: ${result.weather.temperature}°C`);
    console.log(`✓ Condition: ${result.weather.condition}`);
    console.log(`✓ Wind Speed: ${result.weather.windSpeed} m/s`);
    console.log(`✓ Visibility: ${result.weather.visibility} km`);
    if (result.weather.alerts && result.weather.alerts.length > 0) {
      console.log(`✓ Alerts: ${result.weather.alerts.length} 条`);
    } else {
      console.log(`✓ Alerts: 无`);
    }

    if (result.impact_assessment) {
      console.log(`\n影响评估:`);
      console.log(`  - 户外活动: ${result.impact_assessment.outdoor_activities}`);
      console.log(`  - 交通: ${result.impact_assessment.transportation}`);
      console.log(`  - 安全风险: ${result.impact_assessment.safety_risks?.length || 0} 条`);
    }

    if (result.recommendations && result.recommendations.length > 0) {
      console.log(`\n建议:`);
      result.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    console.log('\n========================================');
    console.log('✅ 测试成功！');
    console.log('========================================');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
