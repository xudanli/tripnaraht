#!/usr/bin/env tsx
/**
 * Physical Reality 数据质量检查脚本
 * 
 * 检查Physical Reality数据的质量指标并生成报告
 */

import { PrismaClient } from '@prisma/client';
import { PhysicalRealityQualityMonitorService } from '../src/trips/readiness/services/physical-reality-quality-monitor.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function checkPhysicalRealityQuality() {
  console.log('🔍 检查 Physical Reality 数据质量...\n');

  const prisma = new PrismaClient();
  const prismaService = new PrismaService();
  const qualityMonitor = new PhysicalRealityQualityMonitorService(prismaService);

  try {
    const report = await qualityMonitor.generateQualityReport();

    console.log('📊 Physical Reality 数据质量报告');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`生成时间: ${report.generatedAt.toISOString()}`);
    console.log(`质量评分: ${report.qualityScore}/100\n`);

    // 数据完整性
    console.log('📋 数据完整性');
    console.log('─────────────────────────────────────────');
    console.log(`道路状态:`);
    console.log(`  - Chunks: ${report.metrics.completeness.roadStatus.totalChunks}`);
    console.log(`  - 覆盖区域: ${report.metrics.completeness.roadStatus.regionsWithData}/${report.metrics.completeness.roadStatus.totalRegions}`);
    console.log(`  - 覆盖率: ${report.metrics.completeness.roadStatus.coverageRate.toFixed(1)}%`);
    console.log(`  - 平均Chunks/区域: ${report.metrics.completeness.roadStatus.avgChunksPerRegion.toFixed(1)}`);
    
    console.log(`\n渡轮时刻表:`);
    console.log(`  - Chunks: ${report.metrics.completeness.ferrySchedules.totalChunks}`);
    console.log(`  - 覆盖区域: ${report.metrics.completeness.ferrySchedules.regionsWithData}/${report.metrics.completeness.ferrySchedules.totalRegions}`);
    console.log(`  - 覆盖率: ${report.metrics.completeness.ferrySchedules.coverageRate.toFixed(1)}%`);
    console.log(`  - 平均Chunks/区域: ${report.metrics.completeness.ferrySchedules.avgChunksPerRegion.toFixed(1)}`);
    
    console.log(`\n天气窗口:`);
    console.log(`  - Chunks: ${report.metrics.completeness.weatherWindows.totalChunks}`);
    console.log(`  - 覆盖区域: ${report.metrics.completeness.weatherWindows.regionsWithData}/${report.metrics.completeness.weatherWindows.totalRegions}`);
    console.log(`  - 覆盖率: ${report.metrics.completeness.weatherWindows.coverageRate.toFixed(1)}%`);
    console.log(`  - 平均Chunks/区域: ${report.metrics.completeness.weatherWindows.avgChunksPerRegion.toFixed(1)}`);
    
    console.log(`\n总体:`);
    console.log(`  - 总Chunks: ${report.metrics.completeness.overall.totalChunks}`);
    console.log(`  - 覆盖区域: ${report.metrics.completeness.overall.regionsWithData}/${report.metrics.completeness.overall.totalRegions}`);
    console.log(`  - 覆盖率: ${report.metrics.completeness.overall.coverageRate.toFixed(1)}%`);

    // 数据准确性
    console.log('\n\n📋 数据准确性');
    console.log('─────────────────────────────────────────');
    console.log(`Metadata覆盖率: ${report.metrics.accuracy.metadataCoverage.toFixed(1)}%`);
    console.log(`Embedding覆盖率: ${report.metrics.accuracy.embeddingCoverage.toFixed(1)}%`);
    console.log(`Keywords覆盖率: ${report.metrics.accuracy.keywordsCoverage.toFixed(1)}%`);

    // 数据时效性
    console.log('\n\n📋 数据时效性');
    console.log('─────────────────────────────────────────');
    if (report.metrics.timeliness.lastUpdated) {
      console.log(`最新更新: ${report.metrics.timeliness.lastUpdated.toISOString()}`);
    }
    if (report.metrics.timeliness.oldestUpdated) {
      console.log(`最旧更新: ${report.metrics.timeliness.oldestUpdated.toISOString()}`);
    }
    console.log(`平均更新天数: ${report.metrics.timeliness.avgDaysSinceUpdate}天`);
    console.log(`超过30天未更新: ${report.metrics.timeliness.staleChunks30Days}个文件`);
    console.log(`超过90天未更新: ${report.metrics.timeliness.staleChunks90Days}个文件`);

    // 检索性能
    console.log('\n\n📋 检索性能');
    console.log('─────────────────────────────────────────');
    console.log(`平均延迟: ${report.metrics.retrievalPerformance.avgLatency}ms`);
    console.log(`P95延迟: ${report.metrics.retrievalPerformance.p95Latency}ms`);
    console.log(`成功率: ${report.metrics.retrievalPerformance.successRate.toFixed(1)}%`);
    console.log(`总检索次数: ${report.metrics.retrievalPerformance.totalRetrievals}`);

    // 质量问题
    if (report.issues.length > 0) {
      console.log('\n\n⚠️  质量问题');
      console.log('─────────────────────────────────────────');
      report.issues.forEach((issue, idx) => {
        const icon = issue.level === 'error' ? '❌' : issue.level === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${idx + 1}. ${icon} [${issue.level.toUpperCase()}] ${issue.message}`);
        if (issue.recommendation) {
          console.log(`   建议: ${issue.recommendation}`);
        }
      });
    } else {
      console.log('\n\n✅ 未发现质量问题');
    }

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log(`质量评分: ${report.qualityScore}/100`);
    
    if (report.qualityScore >= 90) {
      console.log('✅ 数据质量优秀');
    } else if (report.qualityScore >= 75) {
      console.log('⚠️  数据质量良好，但有改进空间');
    } else if (report.qualityScore >= 60) {
      console.log('⚠️  数据质量一般，建议改进');
    } else {
      console.log('❌ 数据质量较差，需要立即改进');
    }

    console.log('\n✅ 质量检查完成！');
  } catch (error) {
    console.error('❌ 质量检查失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkPhysicalRealityQuality().catch(console.error);
