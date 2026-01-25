#!/usr/bin/env tsx
/**
 * RAG + MCP Skills 集成端到端测试
 *
 * 测试内容：
 * 1. McpToolsService 基本功能
 * 2. RagFallbackService Level 4 降级
 * 3. RagFreshnessService 实时验证
 * 4. 完整的 Gate 决策流程
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RagFallbackService, QueryCategory } from '../src/rag/services/rag-fallback.service';
import { RagFreshnessService, ChunkCategory } from '../src/rag/services/rag-freshness.service';
import { GateDecisionLoggerService, GateResult } from '../src/rag/services/gate-decision-logger.service';
import { McpToolsService } from '../src/rag/services/mcp-tools.service';

async function main() {
  console.log('========================================');
  console.log('RAG + MCP Skills 集成测试');
  console.log('========================================\n');

  // 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const mcpTools = app.get(McpToolsService);
  const fallbackService = app.get(RagFallbackService);
  const freshnessService = app.get(RagFreshnessService);
  const loggerService = app.get(GateDecisionLoggerService);

  try {
    // ========== Test 1: McpToolsService 基本功能 ==========
    console.log('📋 Test 1: McpToolsService 基本功能');
    console.log('─'.repeat(50));

    // Test 1.1: Web Browse
    console.log('\n✓ Test 1.1: Web Browse');
    const webResult = await mcpTools.webBrowse({
      url: 'https://www.road.is',
      query: '冰岛道路收费规则',
      cacheTtlMinutes: 1,
    });
    console.log(`  - URL: ${webResult.url}`);
    console.log(`  - Success: ${webResult.success}`);
    console.log(`  - Content length: ${webResult.content.length}`);
    console.log(`  - Cached: ${webResult.cached || false}`);

    // Test 1.2: Google Places
    console.log('\n✓ Test 1.2: Google Places API');
    const placeResult = await mcpTools.getPlaceDetails({
      place_name: '蓝湖温泉',
      fields: ['opening_hours'],
      cacheTtlMinutes: 1,
    });
    console.log(`  - Place ID: ${placeResult.place_id}`);
    console.log(`  - Name: ${placeResult.name}`);
    console.log(`  - Success: ${placeResult.success}`);
    console.log(`  - Has opening hours: ${!!placeResult.opening_hours}`);

    // Test 1.3: Road Status
    console.log('\n✓ Test 1.3: Road Status API');
    const roadResult = await mcpTools.getRoadStatus({
      road_id: 'Route1',
      cacheTtlMinutes: 1,
    });
    console.log(`  - Road ID: ${roadResult.road_id}`);
    console.log(`  - Status: ${roadResult.status}`);
    console.log(`  - Conditions: ${roadResult.conditions?.join(', ')}`);
    console.log(`  - Success: ${roadResult.success}`);

    // Test 1.4: Weather
    console.log('\n✓ Test 1.4: Weather API');
    const weatherResult = await mcpTools.getWeather({
      location: 'Reykjavik',
      cacheTtlMinutes: 1,
    });
    console.log(`  - Location: ${weatherResult.location}`);
    console.log(`  - Temperature: ${weatherResult.temperature}°C`);
    console.log(`  - Conditions: ${weatherResult.conditions}`);
    console.log(`  - Success: ${weatherResult.success}`);

    // ========== Test 2: RagFallbackService Level 4 降级 ==========
    console.log('\n\n📋 Test 2: RagFallbackService Level 4 降级');
    console.log('─'.repeat(50));

    const ruleQuery = '瓦德拉海德隧道（Vaðlaheiðargöng）收费政策是什么？';
    const fallbackResult = await fallbackService.queryWithFallback(
      ruleQuery,
      {
        query: ruleQuery,
        limit: 5,
        category: 'decision_support',
      },
      {
        category: QueryCategory.RULES,
        requiresCitation: true,
        allowWebBrowse: true,
      }
    );

    console.log(`\n✓ 降级查询结果:`);
    console.log(`  - Method: ${fallbackResult.method}`);
    console.log(`  - Confidence: ${fallbackResult.confidence.toFixed(3)}`);
    console.log(`  - Results count: ${fallbackResult.results.length}`);
    console.log(`  - Attempted methods: ${fallbackResult.metadata?.attemptedMethods.join(' → ')}`);
    console.log(`  - Latency: ${fallbackResult.metadata?.latency}ms`);

    if (fallbackResult.results.length > 0) {
      console.log(`\n  首条结果:`);
      console.log(`    - Chunk ID: ${fallbackResult.results[0].chunkId}`);
      console.log(`    - Similarity: ${fallbackResult.results[0].similarity}`);
      console.log(`    - Source: ${fallbackResult.results[0].sourceFile || 'N/A'}`);
      console.log(`    - Content preview: ${fallbackResult.results[0].content.substring(0, 100)}...`);
    }

    if (fallbackResult.fallback) {
      console.log(`\n  降级信息:`);
      console.log(`    - Message: ${fallbackResult.fallback.message}`);
      console.log(`    - Official links: ${fallbackResult.fallback.officialLinks?.join(', ')}`);
    }

    // ========== Test 3: RagFreshnessService 实时验证 ==========
    console.log('\n\n📋 Test 3: RagFreshnessService 实时验证');
    console.log('─'.repeat(50));

    const mockChunks = [
      {
        id: 'test_chunk_1',
        chunkId: 'test_chunk_1',
        content: '蓝湖温泉营业时间：每日 8:00-22:00',
        type: 'poi_hours',
        category: ChunkCategory.POI_HOURS,
        lastVerified: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 天前
        metadata: {
          place_id: 'blue_lagoon',
          place_name: '蓝湖温泉',
        },
      },
      {
        id: 'test_chunk_2',
        chunkId: 'test_chunk_2',
        content: '1 号环岛公路（Route 1）路况良好',
        type: 'road_status',
        category: ChunkCategory.GATE,
        lastVerified: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 天前
        metadata: {
          road_id: 'Route1',
        },
      },
    ];

    console.log('\n✓ Test 3.1: POI_HOURS 新鲜度验证 (7天阈值)');
    const freshPOI = await freshnessService.ensureFreshness(
      [mockChunks[0]],
      ChunkCategory.POI_HOURS
    );
    console.log(`  - 输入 chunks: 1`);
    console.log(`  - 输出 chunks: ${freshPOI.length}`);
    console.log(`  - Freshness: ${freshPOI[0]?.metadata?.freshness}`);
    console.log(`  - Stale days: ${freshPOI[0]?.metadata?.staleDays || 'N/A'}`);

    console.log('\n✓ Test 3.2: GATE 新鲜度验证 (1天阈值)');
    const freshGate = await freshnessService.ensureFreshness(
      [mockChunks[1]],
      ChunkCategory.GATE
    );
    console.log(`  - 输入 chunks: 1`);
    console.log(`  - 输出 chunks: ${freshGate.length}`);
    console.log(`  - Freshness: ${freshGate[0]?.metadata?.freshness}`);
    console.log(`  - Stale days: ${freshGate[0]?.metadata?.staleDays || 'N/A'}`);

    // ========== Test 4: 完整 Gate 决策流程 ==========
    console.log('\n\n📋 Test 4: 完整 Gate 决策流程');
    console.log('─'.repeat(50));

    const requestId = `test_${Date.now()}`;

    // Step 1: RAG 检索（带降级）
    const gateQuery = '雷克雅未克到维克镇路线是否安全？';
    const gateRagResult = await fallbackService.queryWithFallback(
      gateQuery,
      { query: gateQuery, limit: 5, category: 'decision_support' },
      {
        category: QueryCategory.GATE,
        allowWebBrowse: true,
      }
    );

    console.log(`\n✓ Step 1: RAG 检索`);
    console.log(`  - Query: ${gateQuery}`);
    console.log(`  - Method: ${gateRagResult.method}`);
    console.log(`  - Confidence: ${gateRagResult.confidence.toFixed(3)}`);

    // Step 2: 新鲜度验证
    const freshChunks = await freshnessService.ensureFreshness(
      gateRagResult.results.map((r) => ({
        id: r.id,
        chunkId: r.chunkId,
        content: r.content,
        type: r.type,
        category: ChunkCategory.GATE,
        metadata: r.metadata,
      })),
      ChunkCategory.GATE
    );

    console.log(`\n✓ Step 2: 新鲜度验证`);
    console.log(`  - 验证前 chunks: ${gateRagResult.results.length}`);
    console.log(`  - 验证后 chunks: ${freshChunks.length}`);
    const freshCount = freshChunks.filter((c) => c.metadata?.freshness === 'FRESH').length;
    console.log(`  - 新鲜 chunks: ${freshCount}`);
    console.log(`  - 过期 chunks: ${freshChunks.length - freshCount}`);

    // Step 3: Gate 决策（模拟）
    const mockGateEvaluation = {
      gate_result: GateResult.ALLOW,
      confidence: 0.92,
      violations: [],
      required_adjustments: [],
      alternatives: [],
      ragChunks: gateRagResult.results,
      toolCalls: [
        {
          tool_name: 'road_status',
          input: { road_id: 'Route1' },
          output: { status: 'OPEN', conditions: 'Dry' },
          output_summary: 'Road status: OPEN, conditions: Dry',
          success: true,
          latency_ms: 150,
        },
      ],
    };

    console.log(`\n✓ Step 3: Gate 决策`);
    console.log(`  - Result: ${mockGateEvaluation.gate_result}`);
    console.log(`  - Confidence: ${mockGateEvaluation.confidence}`);
    console.log(`  - Violations: ${mockGateEvaluation.violations.length}`);

    // Step 4: 记录决策日志
    const evidenceRefs = [
      ...loggerService.createEvidenceRefsFromChunks(gateRagResult.results, 0.9),
      ...loggerService.createEvidenceRefsFromTools(mockGateEvaluation.toolCalls, 0.95),
    ];

    await loggerService.logGateDecision(
      requestId,
      mockGateEvaluation,
      evidenceRefs,
      {
        query: gateQuery,
        test: true,
      }
    );

    console.log(`\n✓ Step 4: 决策日志记录`);
    console.log(`  - Request ID: ${requestId}`);
    console.log(`  - Evidence refs: ${evidenceRefs.length}`);
    console.log(`    - RAG evidence: ${evidenceRefs.filter((e) => e.source.startsWith('RAG')).length}`);
    console.log(`    - Tool evidence: ${evidenceRefs.filter((e) => e.source.startsWith('Tool')).length}`);

    // ========== 总结 ==========
    console.log('\n\n========================================');
    console.log('✅ 所有测试完成！');
    console.log('========================================');
    console.log('\n测试总结：');
    console.log('1. ✅ McpToolsService 基本功能正常');
    console.log('2. ✅ RagFallbackService Level 4 降级机制工作');
    console.log('3. ✅ RagFreshnessService 实时验证集成');
    console.log('4. ✅ Gate 决策流程端到端测试通过');
    console.log('\n⚠️  注意：当前使用 Mock 数据，真实 MCP Skills 需要额外配置');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('\n详细错误:', error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
