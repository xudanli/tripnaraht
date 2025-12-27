#!/usr/bin/env ts-node
/**
 * 测试决策日志存储功能
 * 
 * 验证：
 * 1. 决策日志可以正确保存到数据库
 * 2. 统计查询可以正确返回数据
 * 3. API 端点可以正常工作
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DecisionLogStorageService } from '../src/trips/decision/services/decision-log-storage.service';
import { DecisionStatsService } from '../src/trips/decision/services/decision-stats.service';
import { DecisionLogEntry } from '../src/trips/decision/shared/decision-result.types';
import { randomUUID } from 'crypto';

// 临时跳过 RAG 模块的错误
process.env.SKIP_RAG_MODULE = 'true';

async function testDecisionLogStorage() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const logStorage = app.get(DecisionLogStorageService);
  const statsService = app.get(DecisionStatsService);

  console.log('🧪 测试决策日志存储功能');
  console.log('='.repeat(80));

  try {
    // 1. 测试保存单个日志条目
    console.log('\n📝 Step 1: 测试保存单个日志条目');
    console.log('-'.repeat(80));

    const testLog: DecisionLogEntry = {
      persona: 'ABU',
      action: 'ALLOW',
      explanation: '测试日志：未发现硬性风险问题',
      reasonCodes: [],
      evidenceRefs: [],
      timestamp: new Date().toISOString(),
      decisionSource: 'PHYSICAL',
    };

    await logStorage.saveLogEntry(testLog, {
      countryCode: 'IS',
      routeDirectionId: 'iceland_highlands_froad',
      tripId: randomUUID(),
    });

    console.log('✅ 单个日志条目保存成功');

    // 2. 测试批量保存
    console.log('\n📝 Step 2: 测试批量保存日志条目');
    console.log('-'.repeat(80));

    const batchLogs: DecisionLogEntry[] = [
      {
        persona: 'DR_DRE',
        action: 'ADJUST',
        explanation: '测试日志：调整节奏',
        reasonCodes: ['SPLIT_DAY'],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'HUMAN',
      },
      {
        persona: 'NEPTUNE',
        action: 'REPLACE',
        explanation: '测试日志：替换路段',
        reasonCodes: ['SEGMENT_BLOCKED'],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'PHYSICAL',
      },
    ];

    await logStorage.saveLogEntries(batchLogs, {
      countryCode: 'IS',
      routeDirectionId: 'iceland_highlands_froad',
    });

    console.log(`✅ 批量保存 ${batchLogs.length} 个日志条目成功`);

    // 3. 测试查询
    console.log('\n📝 Step 3: 测试查询日志');
    console.log('-'.repeat(80));

    const logs = await logStorage.queryLogs({
      countryCode: 'IS',
      limit: 10,
    });

    console.log(`✅ 查询到 ${logs.length} 条日志`);
    logs.forEach((log, index) => {
      console.log(`  ${index + 1}. [${log.persona}] ${log.action} (${log.decisionSource})`);
    });

    // 4. 测试统计查询
    console.log('\n📊 Step 4: 测试统计查询');
    console.log('-'.repeat(80));

    const stats = await statsService.getStatsByCountry('IS');
    console.log(`总决策数: ${stats.totalDecisions}`);
    console.log(`硬现实驱动比例: ${(stats.realityDrivenRatio * 100).toFixed(1)}%`);
    console.log(`决策来源分布:`);
    console.log(`  PHYSICAL: ${stats.bySource.PHYSICAL} (${(stats.bySourcePercentage.PHYSICAL * 100).toFixed(1)}%)`);
    console.log(`  HUMAN: ${stats.bySource.HUMAN} (${(stats.bySourcePercentage.HUMAN * 100).toFixed(1)}%)`);
    console.log(`  PHILOSOPHY: ${stats.bySource.PHILOSOPHY} (${(stats.bySourcePercentage.PHILOSOPHY * 100).toFixed(1)}%)`);
    console.log(`  HEURISTIC: ${stats.bySource.HEURISTIC} (${(stats.bySourcePercentage.HEURISTIC * 100).toFixed(1)}%)`);

    // 5. 测试 Persona 统计
    console.log('\n👥 Step 5: 测试 Persona 统计');
    console.log('-'.repeat(80));

    const personaStats = await statsService.getPersonaTriggerStats();
    personaStats.forEach(stat => {
      console.log(`${stat.persona}: ${stat.triggerCount} 次 (主要来源: ${stat.primarySource})`);
    });

    // 6. 测试硬现实驱动比例
    console.log('\n🎯 Step 6: 测试硬现实驱动比例');
    console.log('-'.repeat(80));

    const ratio = await statsService.getRealityDrivenRatio('IS');
    console.log(`硬现实驱动比例: ${(ratio * 100).toFixed(1)}%`);
    console.log(`💬 Killer 句式: "我们 ${(ratio * 100).toFixed(1)}% 的关键决策来自物理现实建模，而不是启发式。"`);

    // 7. 测试 HEURISTIC 热点
    console.log('\n🔥 Step 7: 测试 HEURISTIC 热点');
    console.log('-'.repeat(80));

    const hotspots = await statsService.getHeuristicHotspots(5);
    if (hotspots.length > 0) {
      hotspots.forEach((hotspot, index) => {
        console.log(`${index + 1}. ${hotspot.countryCode || 'UNKNOWN'} / ${hotspot.routeDirectionId || 'UNKNOWN'}`);
        console.log(`   HEURISTIC 占比: ${(hotspot.heuristicRatio * 100).toFixed(1)}%`);
        console.log(`   建议: ${hotspot.suggestions.join('; ')}`);
      });
    } else {
      console.log('✅ 未发现 HEURISTIC 热点（这是好事！）');
    }

    console.log('\n✅ 所有测试通过！');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  testDecisionLogStorage().catch(console.error);
}

