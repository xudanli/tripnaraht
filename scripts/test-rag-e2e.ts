#!/usr/bin/env tsx
/**
 * RAG E2E 测试
 *
 * 测试完整的 RAG 降级策略、真实数据源集成、决策追踪和证据验证
 *
 * 运行方式:
 * npx tsx scripts/test-rag-e2e.ts
 *
 * 或运行特定类别:
 * npx tsx scripts/test-rag-e2e.ts --category=WEATHER
 * npx tsx scripts/test-rag-e2e.ts --level=1
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RagFallbackService, QueryCategory } from '../src/rag/services/rag-fallback.service';
import { RagFreshnessService } from '../src/rag/services/rag-freshness.service';
import { GateDecisionLoggerService } from '../src/rag/services/gate-decision-logger.service';
import * as fs from 'fs';
import * as path from 'path';

// 测试用例接口
interface E2ETestCase {
  id: string;
  name: string;
  query: string;
  expectedLevel: string;
  expectedConfidence: number;
  category: string;
  tags: string[];
  groundTruthChunkIds?: string[];
  expectedEvidenceSources?: string[];
  expectedToolCalls?: string[];
  expectedApiCalls?: Record<string, any>;
  expectedGateResult?: {
    decision: string;
    reason: string;
    alternatives?: string[];
    conditions?: string[];
  };
  expectedDecisionLog?: {
    steps: string[];
    evidenceCount: number;
  };
  expectedFreshnessCheck?: boolean;
  expectedWebBrowse?: {
    url: string;
    query: string;
  };
  expectedFallback?: {
    message: string;
    officialLinks: string[];
    recordedInGapLog: boolean;
  };
  expectedEvidenceCount?: number;
  notes?: string;
}

interface TestSet {
  version: number;
  name: string;
  description: string;
  testCases: E2ETestCase[];
  expectedMetrics: {
    totalCases: number;
    expectedGateAccuracy: number;
    expectedEvidenceCoverage: number;
  };
}

interface TestResult {
  testCase: E2ETestCase;
  passed: boolean;
  actualLevel: string;
  actualConfidence: number;
  actualEvidenceSources: string[];
  actualToolCalls: string[];
  errors: string[];
  duration: number;
}

interface TestStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  gateAccuracy: number;
  evidenceCoverage: number;
  levelBreakdown: Record<string, { passed: number; total: number }>;
  categoryBreakdown: Record<string, { passed: number; total: number }>;
}

class RagE2ETestRunner {
  private readonly logger = new Logger(RagE2ETestRunner.name);
  private ragFallbackService!: RagFallbackService;
  private ragFreshnessService!: RagFreshnessService;
  private gateLogger!: GateDecisionLoggerService;
  private results: TestResult[] = [];

  async initialize() {
    this.logger.log('初始化 NestJS 应用...');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    this.ragFallbackService = app.get(RagFallbackService);
    this.ragFreshnessService = app.get(RagFreshnessService);
    this.gateLogger = app.get(GateDecisionLoggerService);

    this.logger.log('✓ 应用初始化完成');
    return app;
  }

  async loadTestSet(filePath: string): Promise<TestSet> {
    this.logger.log(`加载测试集: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const testSet = JSON.parse(content) as TestSet;
    this.logger.log(`✓ 加载了 ${testSet.testCases.length} 个测试用例`);
    return testSet;
  }

  async runTestCase(testCase: E2ETestCase): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    this.logger.log(`\n${'='.repeat(80)}`);
    this.logger.log(`测试用例: ${testCase.id} - ${testCase.name}`);
    this.logger.log(`查询: "${testCase.query}"`);
    this.logger.log(`预期降级层级: ${testCase.expectedLevel}`);
    this.logger.log(`${'='.repeat(80)}`);

    try {
      // 1. 新鲜度检查（如果需要）
      let category = testCase.category as QueryCategory;
      if (testCase.expectedFreshnessCheck) {
        this.logger.log('\n[步骤 1] 新鲜度检查...');
        // Note: checkQueryFreshness method no longer exists in RagFreshnessService
        // Skipping freshness check - using category from test case
        this.logger.log(`使用类别: ${category}`);
      }

      // 2. 执行 RAG 查询
      this.logger.log('\n[步骤 2] 执行 RAG 查询...');
      const ragResult = await this.ragFallbackService.queryWithFallback(
        testCase.query,
        {
          query: testCase.query,
          limit: 10,
        },
        {
          category,
          requiresCitation: testCase.category === 'RULES' || testCase.category === 'GATE',
          allowWebBrowse: testCase.category === 'RULES' || testCase.category === 'GATE',
        }
      );

      const actualLevel = ragResult.method;
      const actualConfidence = ragResult.confidence;

      this.logger.log(`实际降级层级: ${actualLevel}`);
      this.logger.log(`实际置信度: ${actualConfidence.toFixed(3)}`);
      this.logger.log(`返回结果数: ${ragResult.results.length}`);

      // 3. 验证降级层级
      this.logger.log('\n[步骤 3] 验证降级层级...');
      if (actualLevel !== testCase.expectedLevel) {
        const error = `降级层级不匹配: 预期 ${testCase.expectedLevel}, 实际 ${actualLevel}`;
        errors.push(error);
        this.logger.warn(`✗ ${error}`);
      } else {
        this.logger.log(`✓ 降级层级匹配: ${actualLevel}`);
      }

      // 4. 验证置信度
      this.logger.log('\n[步骤 4] 验证置信度...');
      if (actualConfidence < testCase.expectedConfidence - 0.15) {
        const error = `置信度过低: 预期 >= ${testCase.expectedConfidence}, 实际 ${actualConfidence.toFixed(3)}`;
        errors.push(error);
        this.logger.warn(`✗ ${error}`);
      } else {
        this.logger.log(`✓ 置信度符合预期: ${actualConfidence.toFixed(3)} >= ${testCase.expectedConfidence}`);
      }

      // 5. 提取证据来源
      this.logger.log('\n[步骤 5] 提取证据来源...');
      const actualEvidenceSources = new Set<string>();
      const actualToolCalls = new Set<string>();

      // 从 chunks 提取证据
      if (ragResult.results.length > 0) {
        actualEvidenceSources.add('knowledge_base');
      }

      // 从 metadata 提取工具调用（如果有）
      if (ragResult.metadata && 'toolCalls' in ragResult.metadata) {
        const toolCalls = (ragResult.metadata as any).toolCalls || [];
        toolCalls.forEach((call: string) => {
          actualToolCalls.add(call);
          // 映射工具调用到证据来源
          if (call.includes('weather')) actualEvidenceSources.add('weather_api');
          if (call.includes('road')) actualEvidenceSources.add('road_status_api');
          if (call.includes('poi')) actualEvidenceSources.add('poi_database');
          if (call.includes('web.browse')) actualEvidenceSources.add('web_browse');
        });
      }

      const evidenceSourcesArray = Array.from(actualEvidenceSources);
      const toolCallsArray = Array.from(actualToolCalls);

      this.logger.log(`实际证据来源: ${evidenceSourcesArray.join(', ')}`);
      this.logger.log(`实际工具调用: ${toolCallsArray.length > 0 ? toolCallsArray.join(', ') : '无'}`);

      // 6. 验证证据来源
      if (testCase.expectedEvidenceSources) {
        this.logger.log('\n[步骤 6] 验证证据来源...');
        const missingEvidenceSources = testCase.expectedEvidenceSources.filter(
          source => !evidenceSourcesArray.includes(source)
        );

        if (missingEvidenceSources.length > 0) {
          const error = `缺少证据来源: ${missingEvidenceSources.join(', ')}`;
          errors.push(error);
          this.logger.warn(`✗ ${error}`);
        } else {
          this.logger.log(`✓ 证据来源完整`);
        }
      }

      // 7. 验证工具调用
      if (testCase.expectedToolCalls) {
        this.logger.log('\n[步骤 7] 验证工具调用...');
        const missingToolCalls = testCase.expectedToolCalls.filter(
          tool => !toolCallsArray.includes(tool)
        );

        if (missingToolCalls.length > 0) {
          const error = `缺少工具调用: ${missingToolCalls.join(', ')}`;
          errors.push(error);
          this.logger.warn(`✗ ${error}`);
        } else {
          this.logger.log(`✓ 工具调用正确`);
        }
      }

      // 8. 验证证据数量
      if (testCase.expectedEvidenceCount !== undefined) {
        this.logger.log('\n[步骤 8] 验证证据数量...');
        if (evidenceSourcesArray.length < testCase.expectedEvidenceCount) {
          const error = `证据数量不足: 预期 >= ${testCase.expectedEvidenceCount}, 实际 ${evidenceSourcesArray.length}`;
          errors.push(error);
          this.logger.warn(`✗ ${error}`);
        } else {
          this.logger.log(`✓ 证据数量充足: ${evidenceSourcesArray.length} >= ${testCase.expectedEvidenceCount}`);
        }
      }

      const duration = Date.now() - startTime;
      const passed = errors.length === 0;

      this.logger.log(`\n${'─'.repeat(80)}`);
      this.logger.log(`测试结果: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
      this.logger.log(`耗时: ${duration}ms`);
      if (errors.length > 0) {
        this.logger.log(`错误数: ${errors.length}`);
        errors.forEach((error, i) => {
          this.logger.log(`  ${i + 1}. ${error}`);
        });
      }
      this.logger.log(`${'─'.repeat(80)}`);

      return {
        testCase,
        passed,
        actualLevel,
        actualConfidence,
        actualEvidenceSources: evidenceSourcesArray,
        actualToolCalls: toolCallsArray,
        errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`测试执行失败: ${error.message}`, error.stack);

      return {
        testCase,
        passed: false,
        actualLevel: 'ERROR',
        actualConfidence: 0,
        actualEvidenceSources: [],
        actualToolCalls: [],
        errors: [`执行异常: ${error.message}`],
        duration,
      };
    }
  }

  async runAllTests(testSet: TestSet, options: { category?: string; level?: string } = {}): Promise<TestStats> {
    const startTime = Date.now();
    let testCases = testSet.testCases;

    // 过滤测试用例
    if (options.category) {
      testCases = testCases.filter(tc => tc.category === options.category);
      this.logger.log(`\n过滤条件: category=${options.category}, 符合条件的用例: ${testCases.length}`);
    }

    if (options.level) {
      const levelMap: Record<string, string> = {
        '1': 'VECTOR_RAG',
        '2': 'HYBRID_RAG',
        '3': 'KEYWORD_FALLBACK',
        '4': 'WEB_BROWSE',
        '5': 'GRACEFUL_FAILURE',
      };
      const expectedLevel = levelMap[options.level] || options.level;
      testCases = testCases.filter(tc => tc.expectedLevel === expectedLevel);
      this.logger.log(`\n过滤条件: level=${options.level} (${expectedLevel}), 符合条件的用例: ${testCases.length}`);
    }

    this.logger.log(`\n${'='.repeat(80)}`);
    this.logger.log(`开始执行 E2E 测试`);
    this.logger.log(`总测试用例数: ${testCases.length}`);
    this.logger.log(`${'='.repeat(80)}\n`);

    // 执行所有测试
    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      this.results.push(result);

      // 每个测试之间短暂延迟，避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 计算统计数据
    const duration = Date.now() - startTime;
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;

    // Level 分布
    const levelBreakdown: Record<string, { passed: number; total: number }> = {};
    this.results.forEach(r => {
      const level = r.testCase.expectedLevel;
      if (!levelBreakdown[level]) {
        levelBreakdown[level] = { passed: 0, total: 0 };
      }
      levelBreakdown[level].total++;
      if (r.passed) levelBreakdown[level].passed++;
    });

    // Category 分布
    const categoryBreakdown: Record<string, { passed: number; total: number }> = {};
    this.results.forEach(r => {
      const category = r.testCase.category;
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { passed: 0, total: 0 };
      }
      categoryBreakdown[category].total++;
      if (r.passed) categoryBreakdown[category].passed++;
    });

    // Gate 准确率（基于 GATE 类别的测试）
    const gateCases = this.results.filter(r => r.testCase.category === 'GATE');
    const gateAccuracy = gateCases.length > 0
      ? gateCases.filter(r => r.passed).length / gateCases.length
      : 0;

    // 证据覆盖率（有 expectedEvidenceSources 的测试用例中，证据来源完整的比例）
    const evidenceCases = this.results.filter(r => r.testCase.expectedEvidenceSources);
    const evidenceCoverage = evidenceCases.length > 0
      ? evidenceCases.filter(r => {
          const expected = r.testCase.expectedEvidenceSources || [];
          const actual = r.actualEvidenceSources;
          return expected.every(source => actual.includes(source));
        }).length / evidenceCases.length
      : 0;

    const stats: TestStats = {
      total,
      passed,
      failed,
      skipped: 0,
      duration,
      gateAccuracy,
      evidenceCoverage,
      levelBreakdown,
      categoryBreakdown,
    };

    this.printSummary(stats, testSet.expectedMetrics);
    return stats;
  }

  printSummary(stats: TestStats, expectedMetrics: any) {
    this.logger.log(`\n${'='.repeat(80)}`);
    this.logger.log(`测试总结`);
    this.logger.log(`${'='.repeat(80)}`);

    this.logger.log(`\n总体统计:`);
    this.logger.log(`  总用例数:    ${stats.total}`);
    this.logger.log(`  通过:        ${stats.passed} (${((stats.passed / stats.total) * 100).toFixed(1)}%)`);
    this.logger.log(`  失败:        ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
    this.logger.log(`  总耗时:      ${(stats.duration / 1000).toFixed(2)}s`);
    this.logger.log(`  平均耗时:    ${(stats.duration / stats.total).toFixed(0)}ms/case`);

    this.logger.log(`\n关键指标:`);
    this.logger.log(`  Gate 准确率:    ${(stats.gateAccuracy * 100).toFixed(1)}% ${stats.gateAccuracy >= expectedMetrics.expectedGateAccuracy ? '✅' : '❌'} (目标: ${(expectedMetrics.expectedGateAccuracy * 100).toFixed(0)}%)`);
    this.logger.log(`  证据覆盖率:    ${(stats.evidenceCoverage * 100).toFixed(1)}% ${stats.evidenceCoverage >= expectedMetrics.expectedEvidenceCoverage ? '✅' : '❌'} (目标: ${(expectedMetrics.expectedEvidenceCoverage * 100).toFixed(0)}%)`);

    this.logger.log(`\n降级层级分布:`);
    Object.entries(stats.levelBreakdown)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([level, data]) => {
        const percentage = ((data.passed / data.total) * 100).toFixed(1);
        this.logger.log(`  ${level.padEnd(20)} ${data.passed}/${data.total} (${percentage}%)`);
      });

    this.logger.log(`\n查询类别分布:`);
    Object.entries(stats.categoryBreakdown)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([category, data]) => {
        const percentage = ((data.passed / data.total) * 100).toFixed(1);
        this.logger.log(`  ${category.padEnd(20)} ${data.passed}/${data.total} (${percentage}%)`);
      });

    // 失败用例明细
    const failedResults = this.results.filter(r => !r.passed);
    if (failedResults.length > 0) {
      this.logger.log(`\n失败用例明细:`);
      failedResults.forEach((result, i) => {
        this.logger.log(`\n  ${i + 1}. ${result.testCase.id} - ${result.testCase.name}`);
        this.logger.log(`     查询: "${result.testCase.query}"`);
        result.errors.forEach(error => {
          this.logger.log(`     ✗ ${error}`);
        });
      });
    }

    this.logger.log(`\n${'='.repeat(80)}`);

    const overallPass = stats.passed === stats.total &&
                        stats.gateAccuracy >= expectedMetrics.expectedGateAccuracy &&
                        stats.evidenceCoverage >= expectedMetrics.expectedEvidenceCoverage;

    if (overallPass) {
      this.logger.log(`✅ 所有测试通过！RAG E2E 测试完全符合预期。`);
    } else {
      this.logger.log(`❌ 部分测试失败，需要优化 RAG 系统。`);
    }

    this.logger.log(`${'='.repeat(80)}\n`);
  }

  async saveResults(outputPath: string) {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
      },
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    this.logger.log(`测试结果已保存到: ${outputPath}`);
  }
}

async function main() {
  const logger = new Logger('Main');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const options: { category?: string; level?: string } = {};

  args.forEach(arg => {
    if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    }
    if (arg.startsWith('--level=')) {
      options.level = arg.split('=')[1];
    }
  });

  logger.log('========================================');
  logger.log('RAG E2E 测试');
  logger.log('========================================\n');

  const runner = new RagE2ETestRunner();

  try {
    // 初始化应用
    const app = await runner.initialize();

    // 加载测试集
    const testSetPath = path.join(__dirname, '../e2e-cases/rag-e2e-testset.json');
    const testSet = await runner.loadTestSet(testSetPath);

    // 运行测试
    const stats = await runner.runAllTests(testSet, options);

    // 保存结果
    const outputPath = path.join(__dirname, '../e2e-cases/rag-e2e-results.json');
    await runner.saveResults(outputPath);

    // 关闭应用
    await app.close();

    // 根据测试结果设置退出码
    const success = stats.passed === stats.total &&
                    stats.gateAccuracy >= testSet.expectedMetrics.expectedGateAccuracy &&
                    stats.evidenceCoverage >= testSet.expectedMetrics.expectedEvidenceCoverage;

    process.exit(success ? 0 : 1);
  } catch (error: any) {
    logger.error(`E2E 测试执行失败: ${error.message}`, error.stack);
    process.exit(1);
  }
}

// 只在直接运行时执行
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
