#!/usr/bin/env tsx
/**
 * RAG Service修复验证脚本
 * 
 * 验证修复后的RagService.retrieve()方法是否能正常工作
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../src/places/services/embedding.service';
import { RagService } from '../src/rag/services/rag.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function testRagServiceFix() {
  console.log('🧪 RAG Service修复验证\n');
  console.log('='.repeat(80));

  const prisma = new PrismaClient();
  const prismaService = new PrismaService();

  try {
    // 检查document_index表是否存在
    const tableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'document_index'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      console.log('⚠️  document_index表不存在，跳过测试');
      console.log('💡 提示: RagService使用document_index表，但新系统推荐使用ChunkRetrievalService');
      return;
    }

    // 检查是否有数据（document_index表已删除）
    // document_index表已删除，使用KnowledgeFile + Chunks表
    const dataCount = 0;
    console.log(`📊 document_index表已删除，跳过测试`);
    console.log('💡 提示: 请使用ChunkRetrievalService进行检索');
    return;
    
    // const dataCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    //   SELECT COUNT(*) as count FROM document_index
    // `;
    // if (Number(dataCount[0].count) === 0) {
    //   console.log('⚠️  document_index表为空，跳过测试');
    //   console.log('💡 提示: 需要先索引文档数据');
    //   return;
    // }

    // 尝试初始化EmbeddingService（需要ConfigService）
    let embeddingService: EmbeddingService | null = null;
    let ragService: RagService | null = null;

    try {
      // 创建简单的ConfigService mock
      const configService = new ConfigService();
      embeddingService = new EmbeddingService(configService);
      ragService = new RagService(prismaService, embeddingService);
    } catch (error: any) {
      console.log(`⚠️  无法初始化服务: ${error.message}`);
      console.log('💡 提示: 需要在NestJS应用上下文中运行完整测试');
      return;
    }

    if (!ragService || !embeddingService) {
      console.log('⚠️  服务初始化失败');
      return;
    }

    // 测试用例
    const testCases = [
      {
        name: '基本检索',
        params: {
          query: '冰岛旅游',
          collection: 'travel_guides',
          limit: 5,
        },
      },
      {
        name: '带countryCode的检索',
        params: {
          query: '冰岛租车',
          collection: 'travel_guides',
          countryCode: 'IS',
          limit: 5,
        },
      },
      {
        name: '带tags的检索',
        params: {
          query: '冰岛F-road',
          collection: 'travel_guides',
          tags: ['iceland', 'f-road'],
          limit: 5,
        },
      },
    ];

    for (const testCase of testCases) {
      console.log(`\n📋 测试: ${testCase.name}`);
      console.log('─'.repeat(80));
      console.log(`查询: "${testCase.params.query}"`);
      console.log(`Collection: ${testCase.params.collection}`);

      try {
        const startTime = Date.now();
        const results = await ragService.retrieve(testCase.params);
        const latency = Date.now() - startTime;

        console.log(`✅ 检索成功: ${results.length}条结果 (延迟: ${latency}ms)`);

        if (results.length > 0) {
          console.log('\n前3个结果:');
          results.slice(0, 3).forEach((r, idx) => {
            console.log(`  ${idx + 1}. [分数: ${r.score.toFixed(3)}] ${r.title || '无标题'}`);
            console.log(`     内容预览: ${r.content.substring(0, 60)}...`);
          });
        } else {
          console.log('  ⚠️  未找到结果');
        }
      } catch (error: any) {
        console.error(`  ❌ 检索失败: ${error.message}`);
        if (error.stack) {
          console.error(`  堆栈: ${error.stack.substring(0, 200)}...`);
        }
      }
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ RAG Service修复验证完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRagServiceFix().catch(console.error);
