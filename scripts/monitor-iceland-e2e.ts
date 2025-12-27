#!/usr/bin/env ts-node
/**
 * 冰岛高地 E2E 监控脚本
 * 
 * 目标：统计最近 N 次冰岛高地 trip 的决策指标
 * 
 * 指标：
 * - Abu 拒绝率
 * - Dr.Dre 调整率
 * - Neptune 替换率
 * - decisionSource 分布
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DecisionStatsService } from '../src/trips/decision/services/decision-stats.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface IcelandE2EStats {
  /** 最近 N 次 trip */
  recentTrips: number;
  /** Abu 拒绝率 */
  abuRejectRate: number;
  /** Dr.Dre 调整率 */
  dreAdjustRate: number;
  /** Neptune 替换率 */
  neptuneReplaceRate: number;
  /** 决策来源分布 */
  decisionSourceDistribution: {
    PHYSICAL: number;
    HUMAN: number;
    PHILOSOPHY: number;
    HEURISTIC: number;
  };
  /** 硬现实驱动比例 */
  realityDrivenRatio: number;
  /** Persona 触发统计 */
  personaTriggers: {
    ABU: number;
    DR_DRE: number;
    NEPTUNE: number;
  };
}

async function monitorIcelandE2E() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const decisionStats = app.get(DecisionStatsService);
  const prisma = app.get(PrismaService);

  console.log('🔍 冰岛高地 E2E 监控报告');
  console.log('='.repeat(80));

  try {
    // 1. 获取冰岛决策统计
    const countryStats = await decisionStats.getStatsByCountry('IS');
    const personaStats = await decisionStats.getPersonaTriggerStats();

    // 2. 计算指标
    const stats: IcelandE2EStats = {
      recentTrips: countryStats.totalDecisions,
      abuRejectRate: 0, // TODO: 从数据库计算
      dreAdjustRate: 0, // TODO: 从数据库计算
      neptuneReplaceRate: 0, // TODO: 从数据库计算
      decisionSourceDistribution: countryStats.bySource,
      realityDrivenRatio: countryStats.realityDrivenRatio,
      personaTriggers: {
        ABU: personaStats.find(p => p.persona === 'ABU')?.triggerCount || 0,
        DR_DRE: personaStats.find(p => p.persona === 'DR_DRE')?.triggerCount || 0,
        NEPTUNE: personaStats.find(p => p.persona === 'NEPTUNE')?.triggerCount || 0,
      },
    };

    // 3. 输出报告
    console.log('\n📊 决策统计');
    console.log('-'.repeat(80));
    console.log(`总决策数: ${stats.recentTrips}`);
    console.log(`硬现实驱动比例: ${(stats.realityDrivenRatio * 100).toFixed(1)}%`);

    console.log('\n🎯 决策来源分布');
    console.log('-'.repeat(80));
    console.log(`PHYSICAL: ${stats.decisionSourceDistribution.PHYSICAL} (${(countryStats.bySourcePercentage.PHYSICAL * 100).toFixed(1)}%)`);
    console.log(`HUMAN: ${stats.decisionSourceDistribution.HUMAN} (${(countryStats.bySourcePercentage.HUMAN * 100).toFixed(1)}%)`);
    console.log(`PHILOSOPHY: ${stats.decisionSourceDistribution.PHILOSOPHY} (${(countryStats.bySourcePercentage.PHILOSOPHY * 100).toFixed(1)}%)`);
    console.log(`HEURISTIC: ${stats.decisionSourceDistribution.HEURISTIC} (${(countryStats.bySourcePercentage.HEURISTIC * 100).toFixed(1)}%)`);

    console.log('\n👥 Persona 触发统计');
    console.log('-'.repeat(80));
    console.log(`Abu: ${stats.personaTriggers.ABU} 次`);
    console.log(`Dr.Dre: ${stats.personaTriggers.DR_DRE} 次`);
    console.log(`Neptune: ${stats.personaTriggers.NEPTUNE} 次`);

    console.log('\n📈 关键指标');
    console.log('-'.repeat(80));
    console.log(`Abu 拒绝率: ${(stats.abuRejectRate * 100).toFixed(1)}%`);
    console.log(`Dr.Dre 调整率: ${(stats.dreAdjustRate * 100).toFixed(1)}%`);
    console.log(`Neptune 替换率: ${(stats.neptuneReplaceRate * 100).toFixed(1)}%`);

    // 4. 输出 Markdown 报告
    const markdownReport = generateMarkdownReport(stats);
    console.log('\n📄 Markdown 报告');
    console.log('-'.repeat(80));
    console.log(markdownReport);

    // 5. 保存到文件（可选）
    // await fs.writeFile('iceland-e2e-stats.md', markdownReport);

  } catch (error) {
    console.error('❌ 监控失败:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

function generateMarkdownReport(stats: IcelandE2EStats): string {
  return `
# 冰岛高地 E2E 监控报告

生成时间: ${new Date().toISOString()}

## 决策统计

- **总决策数**: ${stats.recentTrips}
- **硬现实驱动比例**: ${(stats.realityDrivenRatio * 100).toFixed(1)}%

## 决策来源分布

| 来源 | 数量 | 占比 |
|------|------|------|
| PHYSICAL | ${stats.decisionSourceDistribution.PHYSICAL} | ${(stats.decisionSourceDistribution.PHYSICAL / stats.recentTrips * 100).toFixed(1)}% |
| HUMAN | ${stats.decisionSourceDistribution.HUMAN} | ${(stats.decisionSourceDistribution.HUMAN / stats.recentTrips * 100).toFixed(1)}% |
| PHILOSOPHY | ${stats.decisionSourceDistribution.PHILOSOPHY} | ${(stats.decisionSourceDistribution.PHILOSOPHY / stats.recentTrips * 100).toFixed(1)}% |
| HEURISTIC | ${stats.decisionSourceDistribution.HEURISTIC} | ${(stats.decisionSourceDistribution.HEURISTIC / stats.recentTrips * 100).toFixed(1)}% |

## Persona 触发统计

- **Abu**: ${stats.personaTriggers.ABU} 次
- **Dr.Dre**: ${stats.personaTriggers.DR_DRE} 次
- **Neptune**: ${stats.personaTriggers.NEPTUNE} 次

## 关键指标

- **Abu 拒绝率**: ${(stats.abuRejectRate * 100).toFixed(1)}%
- **Dr.Dre 调整率**: ${(stats.dreAdjustRate * 100).toFixed(1)}%
- **Neptune 替换率**: ${(stats.neptuneReplaceRate * 100).toFixed(1)}%

## 结论

TripNARA 的冰岛高地 E2E 决策中，${(stats.realityDrivenRatio * 100).toFixed(1)}% 的关键决策来自物理现实建模和人体能力建模，而不是启发式规则。
`;
}

if (require.main === module) {
  monitorIcelandE2E().catch(console.error);
}

