#!/usr/bin/env ts-node

/**
 * 国家 Pack KPI 验收脚本
 * 
 * P1.4: 国家 Pack KPI 验收
 * 
 * 用法：
 *   npx ts-node --project tsconfig.backend.json scripts/pack-kpi-acceptance.ts <countryCode>
 * 
 * 示例：
 *   npx ts-node --project tsconfig.backend.json scripts/pack-kpi-acceptance.ts IS
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PackKPIAcceptanceService } from '../src/route-directions/services/pack-kpi-acceptance.service';
import { PackKPIAcceptanceResult } from '../src/route-directions/interfaces/pack-kpi.interface';

function formatReport(result: PackKPIAcceptanceResult): void {
  console.log('\n' + '='.repeat(80));
  console.log(`📊 国家 Pack KPI 验收报告: ${result.countryCode} (${result.countryName})`);
  console.log('='.repeat(80));
  console.log(`验收时间: ${result.acceptanceTime}`);
  console.log(`总体得分: ${result.overallScore}/100`);
  console.log(`验收结果: ${result.passed ? '✅ 通过' : '❌ 未通过'}\n`);

  // 1. RouteDirection 独特性 KPI
  console.log('─'.repeat(80));
  console.log('1️⃣  RouteDirection 独特性 KPI');
  console.log('─'.repeat(80));
  console.log(`平均独特性得分: ${result.personalityKPI.averagePersonalityScore}/100`);
  console.log(`最低得分: ${result.personalityKPI.minPersonalityScore}/100`);
  console.log(`最高得分: ${result.personalityKPI.maxPersonalityScore}/100`);
  console.log(`验收结果: ${result.personalityKPI.passed ? '✅ 通过' : '❌ 未通过'}\n`);

  console.log('详细指标:');
  result.personalityKPI.details.forEach((detail, index) => {
    console.log(`\n  ${index + 1}. ${detail.name} (ID: ${detail.routeDirectionId})`);
    console.log(`     标签独特性: ${detail.tagUniquenessScore}/100`);
    console.log(`     约束独特性: ${detail.constraintUniquenessScore}/100`);
    console.log(`     风险画像独特性: ${detail.riskProfileUniquenessScore}/100`);
    console.log(`     综合得分: ${detail.overallPersonalityScore}/100`);
    if (detail.analysis.uniqueTags.length > 0) {
      console.log(`     独特标签: ${detail.analysis.uniqueTags.join(', ')}`);
    }
    if (detail.analysis.uniqueConstraints.length > 0) {
      console.log(`     独特约束: ${detail.analysis.uniqueConstraints.join(', ')}`);
    }
    if (detail.analysis.uniqueRiskFeatures.length > 0) {
      console.log(`     独特风险特征: ${detail.analysis.uniqueRiskFeatures.join(', ')}`);
    }
  });

  // 2. 约束组合多样性 KPI
  console.log('\n' + '─'.repeat(80));
  console.log('2️⃣  约束组合多样性 KPI');
  console.log('─'.repeat(80));
  console.log(`约束组合总数: ${result.constraintCombinationKPI.details.totalCombinations}`);
  console.log(`唯一组合数: ${result.constraintCombinationKPI.details.uniqueCombinations}`);
  console.log(`多样性得分: ${result.constraintCombinationKPI.diversityScore}/100`);
  console.log(`验收结果: ${result.constraintCombinationKPI.passed ? '✅ 通过' : '❌ 未通过'}\n`);

  if (result.constraintCombinationKPI.details.combinations.length > 0) {
    console.log('约束组合详情:');
    result.constraintCombinationKPI.details.combinations.forEach((combo, index) => {
      console.log(`\n  ${index + 1}. ${combo.description}`);
      console.log(`     使用该组合的RouteDirection数量: ${combo.routeDirectionCount}`);
    });
  }

  // 3. 用户偏好差异化 KPI
  console.log('\n' + '─'.repeat(80));
  console.log('3️⃣  用户偏好差异化 KPI');
  console.log('─'.repeat(80));
  console.log(`测试场景总数: ${result.userPreferenceDifferentiationKPI.details.totalScenarios}`);
  console.log(`产生差异化结果的场景数: ${result.userPreferenceDifferentiationKPI.details.differentiatedScenarios}`);
  console.log(`差异化得分: ${result.userPreferenceDifferentiationKPI.differentiationScore}/100`);
  console.log(`验收结果: ${result.userPreferenceDifferentiationKPI.passed ? '✅ 通过' : '❌ 未通过'}\n`);

  if (result.userPreferenceDifferentiationKPI.details.scenarios.length > 0) {
    console.log('测试场景详情:');
    result.userPreferenceDifferentiationKPI.details.scenarios.forEach((scenario, index) => {
      console.log(`\n  ${index + 1}. ${scenario.description} (${scenario.scenarioId})`);
      console.log(`     用户偏好: pace=${scenario.preferences.pace}, riskTolerance=${scenario.preferences.riskTolerance}`);
      console.log(`     结果数量: ${scenario.results.length}`);
      if (scenario.results.length > 0) {
        scenario.results.forEach((result, rIndex) => {
          console.log(`       ${rIndex + 1}. ${result.selectedRouteDirectionName} (得分: ${result.score.toFixed(2)})`);
        });
      }
      console.log(`     是否差异化: ${scenario.isDifferentiated ? '✅ 是' : '❌ 否'}`);
      if (scenario.differentiationReason) {
        console.log(`     差异化原因: ${scenario.differentiationReason}`);
      }
    });
  }

  // 问题和建议
  if (result.issues.length > 0 || result.recommendations.length > 0) {
    console.log('\n' + '─'.repeat(80));
    console.log('💡 问题和建议');
    console.log('─'.repeat(80));

    if (result.issues.length > 0) {
      console.log('\n❌ 问题:');
      result.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }

    if (result.recommendations.length > 0) {
      console.log('\n💡 建议:');
      result.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`总结: ${result.passed ? '✅ Pack KPI 验收通过' : '❌ Pack KPI 验收未通过'}`);
  console.log('='.repeat(80) + '\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('用法: npx ts-node scripts/pack-kpi-acceptance.ts <countryCode>');
    console.error('示例: npx ts-node scripts/pack-kpi-acceptance.ts IS');
    process.exit(1);
  }

  const countryCode = args[0].toUpperCase();

  console.log(`🚀 开始验收 ${countryCode} 的 Pack KPI...\n`);

  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const kpiService = app.get(PackKPIAcceptanceService);

    const result = await kpiService.acceptPackKPI(countryCode);

    formatReport(result);

    await app.close();

    process.exit(result.passed ? 0 : 1);
  } catch (error: any) {
    console.error(`❌ 验收失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
