#!/usr/bin/env tsx
/**
 * Rerank API 简单测试脚本
 * 
 * 直接测试RerankingService功能，不依赖完整的应用上下文
 */

import { PrismaClient } from '@prisma/client';
import { RerankingService } from '../src/rag/services/reranking.service';

async function testRerankAPISimple() {
  console.log('🧪 Rerank API 简单测试\n');
  console.log('='.repeat(80));

  const prisma = new PrismaClient();

  try {
    // RerankingService不依赖ConfigService，可以直接初始化
    const rerankingService = new RerankingService();
    
    // EmbeddingService和ChunkRetrievalService需要ConfigService，在独立脚本中不可用
    // 跳过检索测试，只测试基于分数的重排序功能
    console.log('⚠️  EmbeddingService需要ConfigService，跳过检索测试');
    console.log('✅ 将测试基于分数的重排序功能\n');

    // 测试1: 基于分数的重排序（不依赖LLM）
    console.log('📋 测试1: 基于分数的重排序');
    console.log('─'.repeat(80));

    const mockResults = [
      {
        id: '1',
        chunkId: 'test-chunk-1',
        content: '道路ID: F208, 道路名称: Landmannalaugar入口, 状态: seasonal, 开放季节: 夏季（6-9月）',
        type: 'road_status',
        credibilityScore: 0.95,
        keywords: ['F208', '道路状态', 'seasonal'],
        metadata: { roadId: 'F208', region: 'iceland' },
        similarity: 0.85,
      },
      {
        id: '2',
        chunkId: 'test-chunk-2',
        content: '道路ID: F26, 道路名称: Sprengisandur高地纵贯, 状态: seasonal, 开放季节: 夏季（6-9月）',
        type: 'road_status',
        credibilityScore: 0.95,
        keywords: ['F26', '道路状态', 'seasonal'],
        metadata: { roadId: 'F26', region: 'iceland' },
        similarity: 0.75,
      },
      {
        id: '3',
        chunkId: 'test-chunk-3',
        content: '道路ID: F35, 道路名称: Kjalvegur, 状态: seasonal, 开放季节: 夏季（6-9月）',
        type: 'road_status',
        credibilityScore: 0.95,
        keywords: ['F35', '道路状态', 'seasonal'],
        metadata: { roadId: 'F35', region: 'iceland' },
        similarity: 0.90,
      },
    ] as any[];

    if (rerankingService) {
      const query = '冰岛 F208 道路状态';
      const scoreBasedResults = await rerankingService.rerank({
        query,
        results: mockResults,
        useLLM: false, // 不使用LLM，使用基于分数的重排序
        returnTop: 3,
      });

      console.log(`查询: "${query}"`);
      console.log(`✅ 基于分数的重排序完成`);
      console.log(`结果数量: ${scoreBasedResults.length}\n`);

      console.log('重排序结果（按相似度降序）:');
      scoreBasedResults.forEach((r, idx) => {
        console.log(`  ${idx + 1}. 相似度: ${r.similarity.toFixed(3)}`);
        console.log(`     内容: ${r.content.substring(0, 80)}...`);
        console.log(`     Chunk ID: ${r.chunkId}`);
        console.log('');
      });

      // 验证排序正确性
      let isSorted = true;
      for (let i = 0; i < scoreBasedResults.length - 1; i++) {
        if (scoreBasedResults[i].similarity < scoreBasedResults[i + 1].similarity) {
          isSorted = false;
          break;
        }
      }
      console.log(`排序验证: ${isSorted ? '✅ 正确（按相似度降序）' : '❌ 错误'}`);
    }

    // 测试2: 通过ChunkRetrievalService测试重排序（需要应用上下文）
    // 注意：ChunkRetrievalService需要EmbeddingService，在独立脚本中不可用
    // 请使用 test-rerank-api-http.ts 或 test-rerank-api.ts 进行完整测试
    const chunkRetrievalService = null; // 在独立脚本中不可用
    if (chunkRetrievalService) {
      console.log('\n\n📋 测试2: 通过ChunkRetrievalService测试重排序');
      console.log('─'.repeat(80));

      const testQueries = [
        { query: '冰岛 F208 道路状态', type: 'road_status' as const },
        { query: '冰岛 渡轮 时刻表', type: 'ferry_schedules' as const },
        { query: '冰岛 天气 最佳旅行时间', type: 'weather_windows' as const },
      ];

      for (const testQuery of testQueries) {
        console.log(`\n🔍 查询: "${testQuery.query}"`);
        
        try {
          // 不使用重排序
          const startTime1 = Date.now();
          const basicResults = await chunkRetrievalService.retrieve({
            query: testQuery.query,
            limit: 5,
            type: testQuery.type,
            useHybridSearch: true,
            useReranking: false,
          });
          const basicLatency = Date.now() - startTime1;

          console.log(`  基本检索: ${basicResults.length}条结果 (延迟: ${basicLatency}ms)`);
          if (basicResults.length > 0) {
            console.log(`  Top1: 相似度 ${basicResults[0].similarity.toFixed(3)} - ${basicResults[0].content.substring(0, 60)}...`);
          }

          // 使用重排序
          const startTime2 = Date.now();
          const rerankedResults = await chunkRetrievalService.retrieve({
            query: testQuery.query,
            limit: 5,
            type: testQuery.type,
            useHybridSearch: true,
            useReranking: true,
            rerankTopK: 10,
          });
          const rerankedLatency = Date.now() - startTime2;

          console.log(`  重排序检索: ${rerankedResults.length}条结果 (延迟: ${rerankedLatency}ms, 增加: +${rerankedLatency - basicLatency}ms)`);
          if (rerankedResults.length > 0) {
            const top1 = rerankedResults[0] as any;
            console.log(`  Top1: 相似度 ${top1.similarity.toFixed(3)}${top1.rerankScore ? `, 重排序分数 ${top1.rerankScore.toFixed(3)}` : ''}`);
            console.log(`        ${top1.content.substring(0, 60)}...`);
            
            // 检查顺序是否变化
            if (basicResults.length > 0 && rerankedResults.length > 0) {
              const orderChanged = basicResults[0].chunkId !== rerankedResults[0].chunkId;
              console.log(`  顺序变化: ${orderChanged ? '✅ 是' : '❌ 否'}`);
            }
          }
        } catch (error) {
          console.error(`  ❌ 测试失败:`, error instanceof Error ? error.message : String(error));
        }
      }
    } else {
      console.log('\n⚠️  ChunkRetrievalService不可用（需要ConfigService），跳过检索测试');
    }

    // 测试3: 数据统计
    console.log('\n\n📋 测试3: Physical Reality数据统计');
    console.log('─'.repeat(80));

    const roadCount = await prisma.chunk.count({
      where: { type: 'road_status' },
    });
    const ferryCount = await prisma.chunk.count({
      where: { type: 'ferry_schedules' },
    });
    const weatherCount = await prisma.chunk.count({
      where: { type: 'weather_windows' },
    });

    console.log(`道路状态数据: ${roadCount}条`);
    console.log(`渡轮时刻表数据: ${ferryCount}条`);
    console.log(`天气窗口数据: ${weatherCount}条`);
    console.log(`总计: ${roadCount + ferryCount + weatherCount}条`);

    console.log('\n💡 提示:');
    console.log('  - 重排序功能可以提升检索准确率');
    console.log('  - 重排序会增加延迟（通常+2-3秒）');
    console.log('  - 建议在需要高准确率的场景使用重排序');
    console.log('  - Physical Reality数据检索可以通过ChunkRetrievalService启用重排序');

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ Rerank API 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRerankAPISimple().catch(console.error);
