"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const rag_fallback_service_1 = require("../src/rag/services/rag-fallback.service");
const gate_decision_logger_service_1 = require("../src/rag/services/gate-decision-logger.service");
const rag_freshness_service_1 = require("../src/rag/services/rag-freshness.service");
const rag_evaluation_service_1 = require("../src/rag/services/rag-evaluation.service");
async function main() {
    var _a, _b;
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const fallbackService = app.get(rag_fallback_service_1.RagFallbackService);
    const loggerService = app.get(gate_decision_logger_service_1.GateDecisionLoggerService);
    const freshnessService = app.get(rag_freshness_service_1.RagFreshnessService);
    const evaluationService = app.get(rag_evaluation_service_1.RAGEvaluationService);
    console.log('='.repeat(60));
    console.log('RAG 架构使用示例');
    console.log('='.repeat(60));
    console.log();
    console.log('📋 示例 1: 规则查询（带降级策略）');
    console.log('-'.repeat(60));
    const ruleQuery = '瓦德拉海德隧道怎么收费？多久内必须缴费？';
    const ruleResult = await fallbackService.queryWithFallback(ruleQuery, {
        query: ruleQuery,
        limit: 5,
        category: 'decision_support',
        useHybridSearch: true,
    }, {
        category: rag_fallback_service_1.QueryCategory.RULES,
        requiresCitation: true,
        allowWebBrowse: true,
    });
    console.log(`查询: "${ruleQuery}"`);
    console.log(`使用方法: ${ruleResult.method}`);
    console.log(`置信度: ${ruleResult.confidence.toFixed(2)}`);
    console.log(`结果数量: ${ruleResult.results.length}`);
    console.log(`尝试的方法: ${(_a = ruleResult.metadata) === null || _a === void 0 ? void 0 : _a.attemptedMethods.join(' → ')}`);
    if (ruleResult.fallback) {
        console.log('\n⚠️  降级到 Graceful Failure:');
        console.log(`  消息: ${ruleResult.fallback.message}`);
        console.log(`  官方链接: ${(_b = ruleResult.fallback.officialLinks) === null || _b === void 0 ? void 0 : _b.join(', ')}`);
    }
    else if (ruleResult.results.length > 0) {
        console.log('\n✅ 检索到相关内容:');
        ruleResult.results.slice(0, 2).forEach((result, i) => {
            console.log(`  [${i + 1}] ${result.content.substring(0, 100)}...`);
            console.log(`      相似度: ${result.similarity.toFixed(3)}`);
        });
    }
    console.log();
    console.log('🚪 示例 2: Should-Exist Gate 决策');
    console.log('-'.repeat(60));
    const requestId = `req_${Date.now()}`;
    const gateQuery = '2月份自驾去 F208 高地公路是否可行？';
    const gateRagResult = await fallbackService.queryWithFallback(gateQuery, {
        query: gateQuery,
        limit: 5,
        category: 'decision_support',
    }, {
        category: rag_fallback_service_1.QueryCategory.GATE,
        requiresCitation: true,
    });
    const freshChunks = await freshnessService.ensureFreshness(gateRagResult.results, rag_freshness_service_1.ChunkCategory.GATE);
    console.log(`查询: "${gateQuery}"`);
    console.log(`RAG 检索结果: ${freshChunks.length} 个`);
    console.log(`新鲜度状态:`);
    const freshCount = freshChunks.filter(c => { var _a; return ((_a = c.metadata) === null || _a === void 0 ? void 0 : _a.freshness) === 'FRESH'; }).length;
    const staleCount = freshChunks.filter(c => { var _a; return ((_a = c.metadata) === null || _a === void 0 ? void 0 : _a.freshness) === 'STALE'; }).length;
    console.log(`  - 新鲜: ${freshCount}`);
    console.log(`  - 过期: ${staleCount}`);
    const mockWeatherData = {
        temperature: -15,
        condition: '大雪',
        alerts: [{ type: 'SNOW', severity: 'HIGH', description: '暴雪预警' }],
    };
    const mockRoadStatus = {
        closures: [{ road_name: 'F208', reason: '冬季封闭', expected_open: '2026-06-01' }],
    };
    const gateEvaluation = {
        gate_result: gate_decision_logger_service_1.GateResult.BLOCK,
        confidence: 0.98,
        violations: [
            {
                type: gate_decision_logger_service_1.ViolationType.ROAD_CLOSURE,
                severity: gate_decision_logger_service_1.ViolationSeverity.HARD,
                detail: 'F208 冬季封闭，预计 6 月 1 日开放',
            },
            {
                type: gate_decision_logger_service_1.ViolationType.WEATHER,
                severity: gate_decision_logger_service_1.ViolationSeverity.HARD,
                detail: '暴雪预警，不适合出行',
            },
        ],
        required_adjustments: [
            {
                action: gate_decision_logger_service_1.AdjustmentAction.CHANGE_DATES,
                why: '建议 6-9 月访问',
                priority: 1,
            },
            {
                action: gate_decision_logger_service_1.AdjustmentAction.CHANGE_ROUTE,
                why: '使用 1 号环岛公路替代',
                priority: 2,
            },
        ],
        alternatives: [
            {
                description: '1 号环岛公路全年开放，可欣赏南部海岸风光',
                type: 'ROUTE',
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
    const evidenceRefs = [
        ...loggerService.createEvidenceRefsFromChunks(freshChunks),
        ...loggerService.createEvidenceRefsFromTools(gateEvaluation.toolCalls),
    ];
    await loggerService.logGateDecision(requestId, gateEvaluation, evidenceRefs, { latency_ms: 1050 });
    console.log('\n✅ Gate 决策完成:');
    console.log(`  决策结果: ${gateEvaluation.gate_result}`);
    console.log(`  置信度: ${gateEvaluation.confidence.toFixed(2)}`);
    console.log(`  违规数量: ${gateEvaluation.violations.length}`);
    console.log(`  调整建议: ${gateEvaluation.required_adjustments.length}`);
    console.log(`  替代方案: ${gateEvaluation.alternatives.length}`);
    console.log(`  证据数量: ${evidenceRefs.length} (${evidenceRefs.filter(e => e.source.startsWith('RAG')).length} RAG + ${evidenceRefs.filter(e => e.source.startsWith('Tool')).length} Tool)`);
    console.log('\n📝 决策日志已保存 (request_id: ' + requestId + ')');
    console.log();
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
    console.log('📊 示例 4: Gate 质量评估');
    console.log('-'.repeat(60));
    const mockTestSet = [
        {
            requestId: 'test_001',
            request: { route: 'F208', date: '2026-02-15' },
            expectedGateResult: 'BLOCK',
        },
        {
            requestId: 'test_002',
            request: { route: 'Route 1', date: '2026-07-15' },
            expectedGateResult: 'ALLOW',
        },
    ];
    const gateAccuracyResult = await evaluationService.evaluateGateAccuracy(mockTestSet);
    console.log('Gate 准确率评估结果:');
    console.log(`  准确率: ${(gateAccuracyResult.accuracy * 100).toFixed(1)}%`);
    console.log(`  平均置信度: ${gateAccuracyResult.avgConfidence.toFixed(2)}`);
    console.log(`  平均证据数: ${gateAccuracyResult.avgEvidenceCount.toFixed(1)}`);
    console.log(`  替代方案覆盖率: ${(gateAccuracyResult.alternativesCoverage * 100).toFixed(1)}%`);
    console.log();
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
//# sourceMappingURL=example-rag-usage.js.map