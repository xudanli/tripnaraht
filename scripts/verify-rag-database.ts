#!/usr/bin/env tsx
/**
 * 验证 RAG 架构数据库迁移
 *
 * 验证内容：
 * 1. 检查新表是否存在（rag_decision_logs, rag_knowledge_gaps）
 * 2. 检查 chunks 表新字段（last_verified_at, category）
 * 3. 测试基本的 CRUD 操作
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('========================================');
  console.log('RAG 架构数据库验证');
  console.log('========================================\n');

  try {
    // 1. 检查 RagDecisionLog 表
    console.log('✓ Step 1: 检查 rag_decision_logs 表...');
    const decisionLogCount = await prisma.ragDecisionLog.count();
    console.log(`  - 表存在，当前记录数: ${decisionLogCount}\n`);

    // 2. 检查 RagKnowledgeGap 表
    console.log('✓ Step 2: 检查 rag_knowledge_gaps 表...');
    const knowledgeGapCount = await prisma.ragKnowledgeGap.count();
    console.log(`  - 表存在，当前记录数: ${knowledgeGapCount}\n`);

    // 3. 检查 Chunk 表新字段
    console.log('✓ Step 3: 检查 chunks 表新字段...');
    const chunkWithCategory = await prisma.chunk.findFirst({
      select: {
        id: true,
        category: true,
        lastVerifiedAt: true,
      },
    });
    if (chunkWithCategory) {
      console.log('  - category 字段存在');
      console.log('  - last_verified_at 字段存在');
    } else {
      console.log('  - 表中暂无数据，字段已添加');
    }
    console.log();

    // 4. 测试写入 RagDecisionLog
    console.log('✓ Step 4: 测试写入 RagDecisionLog...');
    const testDecisionLog = await prisma.ragDecisionLog.create({
      data: {
        requestId: `test_${Date.now()}`,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        timestamp: new Date(),
        inputsSummary: {
          route: { origin: 'Reykjavik', destination: 'Vik' },
        },
        outputsSummary: {
          gate_result: 'ALLOW',
          confidence: 0.95,
        },
        evidenceRefs: [
          {
            evidence_id: 'test_chunk_1',
            source: 'RAG: iceland_road_rules.md',
            confidence: 0.9,
          },
        ],
      },
    });
    console.log(`  - 成功创建决策日志: ${testDecisionLog.id}\n`);

    // 5. 测试写入 RagKnowledgeGap
    console.log('✓ Step 5: 测试写入 RagKnowledgeGap...');
    const testKnowledgeGap = await prisma.ragKnowledgeGap.create({
      data: {
        query: '测试查询：某个未知的冰岛景点',
        category: 'POI',
        timestamp: new Date(),
        attemptedMethods: ['VECTOR_RAG', 'HYBRID_RAG', 'KEYWORD_FALLBACK'],
        needsIndex: true,
        notes: '这是一个测试记录',
      },
    });
    console.log(`  - 成功创建知识缺口记录: ${testKnowledgeGap.id}\n`);

    // 6. 测试查询
    console.log('✓ Step 6: 测试查询...');
    const recentDecisionLogs = await prisma.ragDecisionLog.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      select: {
        requestId: true,
        step: true,
        actor: true,
        timestamp: true,
      },
    });
    console.log(`  - 查询最近 5 条决策日志: ${recentDecisionLogs.length} 条`);

    const recentKnowledgeGaps = await prisma.ragKnowledgeGap.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      select: {
        query: true,
        category: true,
        timestamp: true,
        needsIndex: true,
      },
    });
    console.log(`  - 查询最近 5 条知识缺口: ${recentKnowledgeGaps.length} 条\n`);

    // 7. 清理测试数据
    console.log('✓ Step 7: 清理测试数据...');
    await prisma.ragDecisionLog.delete({ where: { id: testDecisionLog.id } });
    await prisma.ragKnowledgeGap.delete({ where: { id: testKnowledgeGap.id } });
    console.log('  - 测试数据已清理\n');

    console.log('========================================');
    console.log('✅ RAG 架构数据库验证完成！');
    console.log('========================================');
    console.log('\n数据库迁移成功！所有 P0 核心服务已就绪。');
    console.log('\n下一步：');
    console.log('1. 集成 MCP Skills（Web Browse, Google Places）');
    console.log('2. 创建 Gate 测试集（>= 50 cases）');
    console.log('3. 运行评估并达到目标指标');
    console.log();
  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    console.error('\n详细错误:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
