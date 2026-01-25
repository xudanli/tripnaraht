#!/usr/bin/env tsx
/**
 * 诊断RAG检索问题
 * 直接查询数据库，绕过API过滤，查看实际相似度分数
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// 简单的embedding生成（用于测试，实际应该使用EmbeddingService）
// 这里我们直接查询数据库，看看现有的chunks的embedding情况

async function diagnose() {
  console.log('🔍 RAG检索问题诊断\n');
  console.log('='.repeat(80));
  
  // 1. 检查数据状态
  console.log('\n1️⃣ 数据状态检查:');
  const totalChunks = await prisma.chunk.count();
  const embeddingStats = await prisma.$queryRawUnsafe<Array<{
    total: bigint;
    with_embedding: bigint;
  }>>(
    `SELECT 
      COUNT(*)::bigint as total,
      COUNT(embedding)::bigint as with_embedding
    FROM chunks`
  );
  
  const stats = embeddingStats[0];
  const chunksWithEmbedding = Number(stats.with_embedding);
  const chunksWithoutEmbedding = Number(stats.total) - chunksWithEmbedding;
  
  console.log(`   总Chunk数: ${Number(stats.total)}`);
  console.log(`   有Embedding: ${chunksWithEmbedding}`);
  console.log(`   无Embedding: ${chunksWithoutEmbedding}`);
  
  // 2. 检查embedding维度
  console.log('\n2️⃣ Embedding维度检查:');
  try {
    const sampleChunk = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      embedding_dim: number;
    }>>(
      `SELECT 
        chunk_id,
        array_length(embedding::float[], 1) as embedding_dim
      FROM chunks 
      WHERE embedding IS NOT NULL 
      LIMIT 1`
    );
    
    if (sampleChunk.length > 0) {
      console.log(`   Embedding维度: ${sampleChunk[0].embedding_dim}`);
      if (sampleChunk[0].embedding_dim !== 1536) {
        console.log(`   ⚠️  警告: 期望维度1536，实际${sampleChunk[0].embedding_dim}`);
      }
    }
  } catch (error: any) {
    console.log(`   ⚠️  无法检查维度: ${error.message}`);
  }
  
  // 3. 检查相似度分数分布（使用一个示例查询）
  console.log('\n3️⃣ 相似度分数测试:');
  console.log('   测试查询: "冰岛"');
  
  // 获取一个包含"冰岛"的chunk的embedding作为查询向量
  const icelandChunk = await prisma.$queryRawUnsafe<Array<{
    chunk_id: string;
    content: string;
    embedding: string;
  }>>(
    `SELECT 
      chunk_id,
      content,
      embedding::text as embedding
    FROM chunks 
    WHERE content ILIKE '%冰岛%' 
      AND embedding IS NOT NULL 
    LIMIT 1`
  );
  
  if (icelandChunk.length > 0) {
    console.log(`   ✅ 找到包含"冰岛"的chunk: ${icelandChunk[0].chunk_id}`);
    
    // 使用这个chunk的embedding作为查询向量，计算与其他chunks的相似度
    const similarityResults = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      similarity: number;
      content_preview: string;
    }>>(
      `SELECT 
        c2.chunk_id,
        1 - (c2.embedding <=> c1.embedding) as similarity,
        LEFT(c2.content, 50) as content_preview
      FROM chunks c1
      CROSS JOIN chunks c2
      WHERE c1.chunk_id = $1
        AND c2.embedding IS NOT NULL
        AND c2.chunk_id != c1.chunk_id
      ORDER BY c2.embedding <=> c1.embedding
      LIMIT 10`,
      icelandChunk[0].chunk_id
    );
    
    console.log(`\n   与其他chunks的相似度分数（Top 10）:`);
    similarityResults.forEach((r, i) => {
      const sim = parseFloat(String(r.similarity));
      const passed = sim >= 0.01 ? '✅' : '❌';
      console.log(`   [${i+1}] ${passed} ${r.chunk_id}: ${sim.toFixed(4)}`);
      console.log(`       内容: ${r.content_preview}...`);
    });
    
    // 统计
    const passedCount = similarityResults.filter(r => parseFloat(String(r.similarity)) >= 0.01).length;
    const failedCount = similarityResults.length - passedCount;
    console.log(`\n   统计: ${passedCount}个通过阈值(>=0.01), ${failedCount}个被过滤`);
    
  } else {
    console.log('   ⚠️  未找到包含"冰岛"的chunk');
  }
  
  // 4. 检查关键词匹配（Sparse Search）
  console.log('\n4️⃣ 关键词匹配测试:');
  const keywordChunks = await prisma.chunk.findMany({
    where: {
      OR: [
        { content: { contains: '冰岛', mode: 'insensitive' } },
        { keywords: { hasSome: ['冰岛'] } },
      ],
    },
    take: 5,
    select: {
      chunkId: true,
      content: true,
      keywords: true,
    },
  });
  
  console.log(`   找到 ${keywordChunks.length} 个包含"冰岛"的chunks（关键词匹配）`);
  if (keywordChunks.length > 0) {
    keywordChunks.forEach((chunk, i) => {
      console.log(`   [${i+1}] ${chunk.chunkId}`);
      console.log(`       关键词: ${chunk.keywords?.slice(0, 3).join(', ') || 'N/A'}`);
    });
    console.log('   💡 建议: 使用Hybrid Search（useHybridSearch: true）可以结合关键词匹配');
  }
  
  // 5. 测试API（如果服务运行）
  console.log('\n5️⃣ API测试:');
  try {
    const apiResponse = await axios.post('http://localhost:3000/api/rag/chunks/retrieve', {
      query: '冰岛',
      limit: 5,
      useHybridSearch: true, // 使用Hybrid Search
      credibilityMin: 0.0,
    }, {
      timeout: 10000,
      proxy: false,
    });
    
    const results = apiResponse.data.data || [];
    console.log(`   API返回: ${results.length} 个结果`);
    
    if (results.length > 0) {
      results.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`   [${i+1}] ${r.chunkId}: similarity=${(r.similarity || r.hybridScore || 0).toFixed(4)}`);
      });
    } else {
      console.log('   ⚠️  API返回0个结果');
      console.log('   💡 可能原因:');
      console.log('      - 服务未重启，代码修改未生效');
      console.log('      - 相似度阈值仍然过高');
      console.log('      - Embedding生成有问题');
    }
  } catch (error: any) {
    console.log(`   ⚠️  API测试失败: ${error.message}`);
  }
  
  // 6. 建议
  console.log('\n' + '='.repeat(80));
  console.log('💡 诊断建议:');
  console.log('='.repeat(80));
  
  if (chunksWithEmbedding === 0) {
    console.log('❌ 没有chunks有embedding，需要重新生成embedding');
  } else if (similarityResults && similarityResults.length > 0) {
    const maxSim = Math.max(...similarityResults.map(r => parseFloat(String(r.similarity))));
    if (maxSim < 0.01) {
      console.log('⚠️  最大相似度分数过低，建议:');
      console.log('   1. 进一步降低similarityThreshold（如0.001）');
      console.log('   2. 使用Hybrid Search（关键词匹配）');
      console.log('   3. 检查embedding模型是否支持中文');
    } else {
      console.log('✅ 相似度分数正常，问题可能在API过滤逻辑');
      console.log('   建议重启服务使代码修改生效');
    }
  }
  
  console.log('\n📋 下一步操作:');
  console.log('   1. 重启NestJS服务');
  console.log('   2. 重新运行测试: npx tsx scripts/test-iceland-rag.ts');
  console.log('   3. 如果仍无结果，考虑使用Hybrid Search或进一步降低阈值');
}

diagnose()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
