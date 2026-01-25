/**
 * RAG 架构使用示例
 *
 * 演示如何使用 P0 核心服务:
 * 1. RagFallbackService - 带降级策略的 RAG 查询
 * 2. GateDecisionLoggerService - 记录 Gate 决策
 * 3. RagFreshnessService - 数据新鲜度验证
 * 4. RAGEvaluationService - Gate 质量评估
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RagFallbackService, QueryCategory } from '../src/rag/services/rag-fallback.service';
import {
  GateDecisionLoggerService,
  GateResult,
  ViolationType,
  ViolationSeverity,
  AdjustmentAction,
} from '../src/rag/services/gate-decision-logger.service';
import { RagFreshnessService, ChunkCategory } from '../src/rag/services/rag-freshness.service';
import { RAGEvaluationService } from '../src/rag/services/rag-evaluation.service';

async function main() {
  // 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);

  // 获取服务实例
  const fallbackService = app.get(RagFallbackService);
  const loggerService = app.get(GateDecisionLoggerService);
  const freshnessService = app.get(RagFreshnessService);
  const evaluationService = app.get(RAGEvaluationService);

  console.log('='.repeat(60));
  console.log('RAG 架构使用示例');
  console.log('='.repeat(60));
  console.log();

  // ========================================
  // 示例 1: 使用降级策略查询规则
  // ========================================
  console.log('📋 示例 1: 规则查询（带降级策略）');
  console.log('-'.repeat(60));

  const ruleQuery = '瓦德拉海德隧道怎么收费？多久内必须缴费？';
  const ruleResult = await fallbackService.queryWithFallback(
    ruleQuery,
    {
      query: ruleQuery,
      limit: 5,
      category: 'decision_support',
      useHybridSearch: true,
    },
    {
      category: QueryCategory.RULES,
      requiresCitation: true,
      allowWebBrowse: true,
    }
  );

  console.log(`查询: "${ruleQuery}"`);
  console.log(`使用方法: ${ruleResult.method}`);
  console.log(`置信度: ${ruleResult.confidence.toFixed(2)}`);
  console.log(`结果数量: ${ruleResult.results.length}`);
  console.log(`尝试的方法: ${ruleResult.metadata?.attemptedMethods.join(' → ')}`);

  if (ruleResult.fallback) {
    console.log('\n⚠️  降级到 Graceful Failure:');
    console.log(`  消息: ${ruleResult.fallback.message}`);
    console.log(`  官方链接: ${ruleResult.fallback.officialLinks?.join(', ')}`);
  } else if (ruleResult.results.length > 0) {
    console.log('\n✅ 检索到相关内容:');
    ruleResult.results.slice(0, 2).forEach((result, i) => {
      console.log(`  [${i + 1}] ${result.content.substring(0, 100)}...`);
      console.log(`      相似度: ${result.similarity.toFixed(3)}`);
    });
  }

  console.log();

  // ========================================
  // 示例 2: Should-Exist Gate 决策流程
  // ========================================
  console.log('🚪 示例 2: Should-Exist Gate 决策');
  console.log('-'.repeat(60));

  const requestId = `req_${Date.now()}`;
  const gateQuery = '2月份自驾去 F208 高地公路是否可行？';

  // Step 1: RAG 检索
  const gateRagResult = await fallbackService.queryWithFallback(
    gateQuery,
    {
      query: gateQuery,
      limit: 5,
      category: 'decision_support',
    },
    {
      category: QueryCategory.GATE,
      requiresCitation: true,
    }
  );

  // Step 2: 确保数据新鲜度
  const freshChunks = await freshnessService.ensureFreshness(
    gateRagResult.results as any,
    ChunkCategory.GATE
  );

  console.log(`查询: "${gateQuery}"`);
  console.log(`RAG 检索结果: ${freshChunks.length} 个`);
  console.log(`新鲜度状态:`);
  const freshCount = freshChunks.filter(c => c.metadata?.freshness === 'FRESH').length;
  const staleCount = freshChunks.filter(c => c.metadata?.freshness === 'STALE').length;
  console.log(`  - 新鲜: ${freshCount}`);
  console.log(`  - 过期: ${staleCount}`);

  // Step 3: 模拟 Tool 调用（实际应调用真实 API）
  const mockWeatherData = {
    temperature: -15,
    condition: '大雪',
    alerts: [{ type: 'SNOW', severity: 'HIGH', description: '暴雪预警' }],
  };

  const mockRoadStatus = {
    closures: [{ road_name: 'F208', reason: '冬季封闭', expected_open: '2026-06-01' }],
  };

  // Step 4: 综合决策
  const gateEvaluation = {
    gate_result: GateResult.BLOCK,
    confidence: 0.98,
    violations: [
      {
        type: ViolationType.ROAD_CLOSURE,
        severity: ViolationSeverity.HARD,
        detail: 'F208 冬季封闭，预计 6 月 1 日开放',
      },
      {
        type: ViolationType.WEATHER,
        severity: ViolationSeverity.HARD,
        detail: '暴雪预警，不适合出行',
      },
    ],
    required_adjustments: [
      {
        action: AdjustmentAction.CHANGE_DATES,
        why: '建议 6-9 月访问',
        priority: 1,
      },
      {
        action: AdjustmentAction.CHANGE_ROUTE,
        why: '使用 1 号环岛公路替代',
        priority: 2,
      },
    ],
    alternatives: [
      {
        description: '1 号环岛公路全年开放，可欣赏南部海岸风光',
        type: 'ROUTE' as const,
        details: { route_id: 'route_1', distance_km: 400 },
      },
    ],
    ragChunks: freshChunks,
    toolCalls: [
      {
        tool_name: 'weather.getForecast',
        input: { location: 'F208', date: '2026-02-15' },
        output: mockWeatherData,
        output_summary: '暴雪预警，气温 -15°C',
        latency_ms: 500,
        success: true,
      },
      {
        tool_name: 'road_status.getClosures',
        input: { road: 'F208' },
        output: mockRoadStatus,
        output_summary: 'F208 冬季封闭',
        latency_ms: 300,
        success: true,
      },
    ],
  };

  // Step 5: 创建证据引用
  const evidenceRefs = [
    ...loggerService.createEvidenceRefsFromChunks(freshChunks as any),
    ...loggerService.createEvidenceRefsFromTools(gateEvaluation.toolCalls as any),
  ];

  // Step 6: 记录决策日志
  await loggerService.logGateDecision(
    requestId,
    gateEvaluation as any,
    evidenceRefs,
    { latency_ms: 1050 }
  );

  console.log('\n✅ Gate 决策完成:');
  console.log(`  决策结果: ${gateEvaluation.gate_result}`);
  console.log(`  置信度: ${gateEvaluation.confidence.toFixed(2)}`);
  console.log(`  违规数量: ${gateEvaluation.violations.length}`);
  console.log(`  调整建议: ${gateEvaluation.required_adjustments.length}`);
  console.log(`  替代方案: ${gateEvaluation.alternatives.length}`);
  console.log(`  证据数量: ${evidenceRefs.length} (${evidenceRefs.filter(e => e.source.startsWith('RAG')).length} RAG + ${evidenceRefs.filter(e => e.source.startsWith('Tool')).length} Tool)`);

  console.log('\n📝 决策日志已保存 (request_id: ' + requestId + ')');

  console.log();

  // ========================================
  // 示例 3: 数据新鲜度检查
  // ========================================
  console.log('🔄 示例 3: 数据新鲜度检查');
  console.log('-'.repeat(60));

  const freshnessStats = await freshnessService.getFreshnessStats();

  console.log('新鲜度统计:');
  console.log(`  总 Chunks: ${freshnessStats.totalChunks}`);
  console.log(`  新鲜: ${freshnessStats.byFreshness.FRESH}`);
  console.log(`  过期: ${freshnessStats.byFreshness.STALE}`);
  console.log(`  已失效: ${freshnessStats.byFreshness.EXPIRED}`);

  if (freshnessStats.staleChunks.length > 0) {
    console.log(`\n⚠️  发现 ${freshnessStats.staleChunks.length} 个过期 chunks`);
    console.log('  建议运行: await freshnessService.refreshStaleChunks()');
  }

  console.log();

  // ========================================
  // 示例 4: Gate 质量评估
  // ========================================
  console.log('📊 示例 4: Gate 质量评估');
  console.log('-'.repeat(60));

  // 模拟测试集
  const mockTestSet = [
    {
      requestId: 'test_001',
      request: { route: 'F208', date: '2026-02-15' },
      expectedGateResult: 'BLOCK' as const,
    },
    {
      requestId: 'test_002',
      request: { route: 'Route 1', date: '2026-07-15' },
      expectedGateResult: 'ALLOW' as const,
    },
  ];

  // 注意：这会调用模拟数据，实际应使用真实 Gate 服务
  const gateAccuracyResult = await evaluationService.evaluateGateAccuracy(mockTestSet);

  console.log('Gate 准确率评估结果:');
  console.log(`  准确率: ${(gateAccuracyResult.accuracy * 100).toFixed(1)}%`);
  console.log(`  平均置信度: ${gateAccuracyResult.avgConfidence.toFixed(2)}`);
  console.log(`  平均证据数: ${gateAccuracyResult.avgEvidenceCount.toFixed(1)}`);
  console.log(`  替代方案覆盖率: ${(gateAccuracyResult.alternativesCoverage * 100).toFixed(1)}%`);

  console.log();

  // ========================================
  // 示例 5: 证据覆盖率评估
  // ========================================
  console.log('🔍 示例 5: 证据覆盖率评估');
  console.log('-'.repeat(60));

  const mockDecisionLogs = [
    {
      requestId: 'req_001',
      evidenceRefs: [
        { source: 'RAG: rules.json' },
        { source: 'RAG: safety.json' },
        { source: 'Tool: weather.getForecast' },
        { source: 'Tool: road_status.getClosures' },
      ],
    },
    {
      requestId: 'req_002',
      evidenceRefs: [
        { source: 'RAG: pois.json' },
        // 缺少 Tool 证据
      ],
    },
  ];

  const coverageResult = await evaluationService.evaluateEvidenceCoverage(mockDecisionLogs);

  console.log('证据覆盖率评估结果:');
  console.log(`  覆盖率: ${(coverageResult.coverageRate * 100).toFixed(1)}% (充分证据: >= 2 RAG + >= 1 Tool)`);
  console.log(`  平均 RAG 证据: ${coverageResult.avgRagEvidence.toFixed(1)}`);
  console.log(`  平均 Tool 证据: ${coverageResult.avgToolEvidence.toFixed(1)}`);
  console.log(`  证据不足案例: ${coverageResult.insufficientCases.length}`);

  if (coverageResult.insufficientCases.length > 0) {
    console.log('\n⚠️  证据不足的案例:');
    coverageResult.insufficientCases.forEach((c) => {
      console.log(`  - ${c.requestId}: RAG=${c.ragCount}, Tool=${c.toolCount}`);
    });
  }

  console.log();

  // ========================================
  // 总结
  // ========================================
  console.log('='.repeat(60));
  console.log('✅ 示例运行完成');
  console.log('='.repeat(60));
  console.log();
  console.log('📚 相关文档:');
  console.log('  - docs/RAG_ARCHITECTURE_EVALUATION.md');
  console.log('  - docs/RAG_IMPLEMENTATION_GUIDE.md');
  console.log('  - docs/VECTOR_EMBEDDING_SUCCESS.md');
  console.log();
  console.log('🚀 下一步:');
  console.log('  1. 执行数据库迁移: psql ... -f prisma/migrations/add_decision_logs_and_knowledge_gaps.sql');
  console.log('  2. 更新 Prisma Schema: 参考 prisma/schema-extensions-rag.prisma');
  console.log('  3. 重新生成 Prisma Client: npx prisma generate');
  console.log('  4. 集成 MCP Skills: Web Browse + Google Places');
  console.log('  5. 创建 Gate 测试集并评估质量');
  console.log();

  await app.close();
}

main()
  .then(() => {
    console.log('示例脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('示例脚本执行失败:', error);
    process.exit(1);
  });
