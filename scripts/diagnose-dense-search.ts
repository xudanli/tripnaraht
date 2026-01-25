#!/usr/bin/env tsx
/**
 * 诊断Dense Search问题
 * 深入检查SQL查询、embedding生成和相似度计算
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = 'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  proxy: false,
});

async function diagnoseDenseSearch() {
  console.log('🔍 Dense Search深度诊断\n');
  console.log('='.repeat(80));

  // 1. 检查数据库中的chunks
  console.log('\n1️⃣ 检查数据库中的chunks:');
  const totalChunks = await prisma.chunk.count();
  const chunksWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint as count FROM chunks WHERE embedding IS NOT NULL`
  );
  console.log(`   总Chunk数: ${totalChunks}`);
  console.log(`   有Embedding的Chunk数: ${Number(chunksWithEmbedding[0]?.count || 0)}`);

  // 2. 获取一个示例chunk的embedding
  console.log('\n2️⃣ 检查示例chunk的embedding:');
  const sampleChunk = await prisma.$queryRawUnsafe<Array<{
    chunk_id: string;
    content: string;
    embedding_text: string;
    embedding_dim: number;
  }>>(
    `SELECT 
      chunk_id,
      LEFT(content, 100) as content,
      embedding::text as embedding_text,
      array_length(string_to_array(embedding::text, ','), 1) - 1 as embedding_dim
    FROM chunks 
    WHERE embedding IS NOT NULL 
    LIMIT 1`
  );

  if (sampleChunk.length > 0) {
    const chunk = sampleChunk[0];
    console.log(`   Chunk ID: ${chunk.chunk_id}`);
    console.log(`   内容预览: ${chunk.content}...`);
    console.log(`   Embedding维度: ${chunk.embedding_dim}`);
    console.log(`   Embedding前10个值: ${chunk.embedding_text.split(',').slice(0, 10).join(', ')}...`);

    // 3. 使用一个chunk的embedding作为查询向量（模拟查询）
    console.log('\n3️⃣ 使用chunk embedding作为查询向量（模拟查询）:');
    const queryChunkId = chunk.chunk_id;
    console.log(`   使用chunk: ${queryChunkId} 的embedding作为查询向量`);
    
    // 4. 直接执行SQL查询（使用chunk的embedding查询其他chunks）
    console.log('\n4️⃣ 直接执行SQL查询（模拟Dense检索）:');
      
      const sqlResults = await prisma.$queryRawUnsafe<Array<{
        chunk_id: string;
        similarity: number;
        credibility_score: number;
        content_preview: string;
      }>>(
        `SELECT 
          c.chunk_id,
          1 - (c.embedding <=> $1::vector) as similarity,
          c.credibility_score,
          LEFT(c.content, 80) as content_preview
        FROM chunks c
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT 10`,
        embeddingStr
      );

      console.log(`   SQL查询返回: ${sqlResults.length} 个结果\n`);

      if (sqlResults.length > 0) {
        console.log('   前10个结果的相似度分数:');
        sqlResults.forEach((r, i) => {
          const sim = parseFloat(String(r.similarity));
          console.log(`   [${i+1}] ${r.chunk_id}`);
          console.log(`       相似度: ${sim.toFixed(6)}`);
          console.log(`       可信度: ${parseFloat(String(r.credibility_score)).toFixed(2)}`);
          console.log(`       内容: ${r.content_preview}...`);
          console.log('');
        });

        // 分析相似度分布
        const similarities = sqlResults.map(r => parseFloat(String(r.similarity)));
        const maxSim = Math.max(...similarities);
        const minSim = Math.min(...similarities);
        const avgSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;

        console.log('   相似度统计:');
        console.log(`      最高: ${maxSim.toFixed(6)}`);
        console.log(`      最低: ${minSim.toFixed(6)}`);
        console.log(`      平均: ${avgSim.toFixed(6)}`);

        // 检查是否会被过滤
        const threshold = 0; // 当前阈值
        const passed = sqlResults.filter(r => parseFloat(String(r.similarity)) >= threshold).length;
        console.log(`\n   过滤分析（阈值=${threshold}）:`);
        console.log(`      通过: ${passed}/${sqlResults.length}`);

        if (passed === 0 && sqlResults.length > 0) {
          console.log(`      ⚠️  所有结果被过滤！最高相似度${maxSim.toFixed(6)} < 阈值${threshold}`);
        }
      } else {
        console.log('   ⚠️  SQL查询返回0个结果');
        console.log('   可能原因:');
        console.log('     1. Embedding格式问题');
        console.log('     2. 向量类型转换问题');
        console.log('     3. 数据库中没有有效的embedding');
      }

    } catch (error: any) {
      console.error(`   ❌ 错误: ${error.message}`);
      console.error(`   堆栈: ${error.stack}`);
    }
  } else {
    console.log('   ⚠️  未找到有embedding的chunk');
  }

  // 5. 检查formatResults方法
  // 5. 测试API调用
  console.log('\n5️⃣ 测试API调用:');
  const testQuery = '冰岛';
  try {
    console.log(`   查询: "${testQuery}"`);
    const apiResponse = await client.post('/api/rag/chunks/retrieve', {
      query: testQuery,
      limit: 10,
      useHybridSearch: false,
      credibilityMin: 0.0,
    });

    const apiResults = apiResponse.data.data || [];
    console.log(`   API返回: ${apiResults.length} 个结果`);

    if (apiResults.length > 0) {
      console.log('   前3个结果:');
      apiResults.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`   [${i+1}] ${r.chunkId}: similarity=${(r.similarity || 0).toFixed(6)}`);
      });
    } else {
      console.log('   ⚠️  API返回0个结果');
    }
  } catch (error: any) {
    console.log(`   ❌ API调用失败: ${error.message}`);
  }

  // 6. 检查formatResults逻辑
  console.log('\n6️⃣ 检查formatResults逻辑:');
  console.log('   当前配置:');
  console.log('     - similarityThreshold: 0 (当credibilityMin=0.0时)');
  console.log('     - credibilityMin: 0.0');
  console.log('   这意味着: 只要credibility>=0.0，所有结果都应该通过');
  
  // 检查credibility_score分布
  const credibilityStats = await prisma.$queryRawUnsafe<Array<{
    min_score: number;
    max_score: number;
    avg_score: number;
  }>>(
    `SELECT 
      MIN(credibility_score) as min_score,
      MAX(credibility_score) as max_score,
      AVG(credibility_score) as avg_score
    FROM chunks`
  );
  
  if (credibilityStats.length > 0) {
    const stats = credibilityStats[0];
    console.log(`\n   Credibility分数统计:`);
    console.log(`     最低: ${parseFloat(String(stats.min_score)).toFixed(2)}`);
    console.log(`     最高: ${parseFloat(String(stats.max_score)).toFixed(2)}`);
    console.log(`     平均: ${parseFloat(String(stats.avg_score)).toFixed(2)}`);
    
    if (parseFloat(String(stats.min_score)) < 0) {
      console.log(`     ⚠️  有chunks的credibility_score < 0，会被过滤`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 诊断建议:');
  console.log('='.repeat(80));
  
  console.log('\n如果SQL查询返回结果但API返回0个结果:');
  console.log('   1. 检查formatResults方法是否正确执行');
  console.log('   2. 查看服务日志中的"所有结果被过滤"警告');
  console.log('   3. 检查credibility_score是否都>=0.0');
  
  console.log('\n如果SQL查询本身返回0个结果:');
  console.log('   1. 检查embedding生成是否成功（是否为零向量）');
  console.log('   2. 检查embedding格式是否正确');
  console.log('   3. 检查向量类型转换是否正确');
}

diagnoseDenseSearch()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
