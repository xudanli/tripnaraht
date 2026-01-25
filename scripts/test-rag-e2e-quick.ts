#!/usr/bin/env tsx
/**
 * RAG E2E 快速测试
 *
 * 快速验证 RAG 核心功能（不需要完整应用上下文）
 *
 * 运行方式:
 * npx tsx scripts/test-rag-e2e-quick.ts
 */

import 'reflect-metadata';
import { Logger } from '@nestjs/common';

const logger = new Logger('RagE2EQuickTest');

interface QuickTestCase {
  id: string;
  name: string;
  query: string;
  expectedLevel: string;
  category: string;
}

const quickTestCases: QuickTestCase[] = [
  {
    id: 'quick-001',
    name: 'Level 1: Vector RAG',
    query: '冰岛环岛路线推荐',
    expectedLevel: 'VECTOR_RAG',
    category: 'GENERAL',
  },
  {
    id: 'quick-002',
    name: 'Level 2: Hybrid RAG',
    query: '冰岛F路什么时候开放',
    expectedLevel: 'HYBRID_RAG',
    category: 'RULES',
  },
  {
    id: 'quick-003',
    name: 'Weather API',
    query: '雷克雅未克现在的天气怎么样',
    expectedLevel: 'VECTOR_RAG',
    category: 'WEATHER',
  },
  {
    id: 'quick-004',
    name: 'POI Opening Hours',
    query: '蓝湖温泉现在开门吗',
    expectedLevel: 'VECTOR_RAG',
    category: 'POI_HOURS',
  },
  {
    id: 'quick-005',
    name: 'Web Browse (RULES)',
    query: '中国驾照在冰岛能用吗',
    expectedLevel: 'WEB_BROWSE',
    category: 'RULES',
  },
];

async function main() {
  logger.log('========================================');
  logger.log('RAG E2E 快速测试');
  logger.log('========================================\n');

  logger.log(`测试用例数: ${quickTestCases.length}\n`);

  let passed = 0;
  let failed = 0;

  for (const testCase of quickTestCases) {
    logger.log(`${'─'.repeat(80)}`);
    logger.log(`[${testCase.id}] ${testCase.name}`);
    logger.log(`查询: "${testCase.query}"`);
    logger.log(`预期层级: ${testCase.expectedLevel}`);
    logger.log(`类别: ${testCase.category}`);

    // 模拟测试逻辑（实际测试需要完整应用上下文）
    logger.log('\n状态: ⏳ 需要完整应用上下文才能执行');
    logger.log('建议运行: npx tsx scripts/test-rag-e2e.ts\n');

    failed++; // 标记为待执行
  }

  logger.log(`${'='.repeat(80)}`);
  logger.log('快速测试总结');
  logger.log(`${'='.repeat(80)}`);
  logger.log(`总用例数: ${quickTestCases.length}`);
  logger.log(`待执行: ${failed}`);
  logger.log(`\n⚠️  此脚本仅用于快速查看测试用例。`);
  logger.log(`完整测试请运行: npx tsx scripts/test-rag-e2e.ts`);
  logger.log(`${'='.repeat(80)}\n`);

  logger.log('✅ 快速测试脚本执行完成');
  logger.log('\n下一步:');
  logger.log('1. 确保数据库有知识库数据（Iceland routes, POIs）');
  logger.log('2. 确保环境变量配置正确（GOOGLE_PLACES_API_KEY, OPENAI_API_KEY）');
  logger.log('3. 运行完整 E2E 测试: npx tsx scripts/test-rag-e2e.ts');
}

main().catch(error => {
  logger.error('测试失败:', error.message);
  process.exit(1);
});
