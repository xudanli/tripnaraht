#!/usr/bin/env tsx
/**
 * 调试 RAG 检索问题
 */

import { PrismaClient } from '@prisma/client';
import { EmbeddingService } from '../src/places/services/embedding.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 调试 RAG 检索问题\n');
    
    // 1. 检查数据
    const totalChunks = await prisma.chunk.count();
    const chunksWithEmbedding = await prisma.chunk.count({
      where: { embedding: { not: null } },
    });
    
    console.log('📊 数据状态:');
    console.log(`  总Chunk数: ${totalChunks}`);
    console.log(`  有Embedding的Chunk数: ${chunksWithEmbedding}\n`);
    
    // 2. 生成查询的embedding
    const query = '冰岛环岛路线推荐';
    console.log(`📝 测试查询: "${query}"\n`);
    
    // 创建NestJS应用上下文以获取EmbeddingService
    const app = await NestFactory.createApplicationContext(AppModule);
    const embeddingService = app.get(EmbeddingService);
    
    console.log('🔄 生成查询embedding...');
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    console.log(`  Embedding维度: ${queryEmbedding.length}\n`);
    
    // 3. 直接执行向量搜索
    console.log('🔍 执行向量搜索...');
    const embeddingStr = JSON.stringify(queryEmbedding);
    
    const results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      similarity: number;
      credibility_score: number;
    }>>(
      `SELECT 
        c.id,
        c.chunk_id,
        c.content,
        1 - (c.embedding <=> $1::vector) as similarity,
        c.credibility_score
      FROM chunks c
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT 10`,
      embeddingStr
    );
    
    console.log(`  找到 ${results.length} 个结果\n`);
    
    if (results.length > 0) {
      console.log('📋 前5个结果:');
      results.slice(0, 5).forEach((r, i) => {
        console.log(`\n  [${i + 1}] ${r.chunk_id}`);
        console.log(`     相似度: ${parseFloat(String(r.similarity)).toFixed(4)}`);
        console.log(`     可信度: ${parseFloat(String(r.credibility_score)).toFixed(2)}`);
        console.log(`     内容预览: ${r.content.substring(0, 100)}...`);
        
        // 检查是否会被过滤
        const similarity = parseFloat(String(r.similarity));
        const credibility = parseFloat(String(r.credibility_score));
        const similarityThreshold = 0.1;
        const credibilityMin = 0.0;
        
        if (similarity < similarityThreshold) {
          console.log(`     ⚠️  相似度 ${similarity.toFixed(4)} < 阈值 ${similarityThreshold}，会被过滤`);
        }
        if (credibility < credibilityMin) {
          console.log(`     ⚠️  可信度 ${credibility.toFixed(2)} < 阈值 ${credibilityMin}，会被过滤`);
        }
        if (similarity >= similarityThreshold && credibility >= credibilityMin) {
          console.log(`     ✅ 会通过过滤`);
        }
      });
    } else {
      console.log('  ⚠️  没有找到任何结果');
    }
    
    await app.close();
    
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
