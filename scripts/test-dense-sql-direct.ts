#!/usr/bin/env tsx
/**
 * 直接测试Dense Search的SQL查询
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = 'http://localhost:3000';

async function testDenseSQL() {
  console.log('🔍 直接测试Dense Search SQL查询\n');
  console.log('='.repeat(80));

  // 1. 获取一个chunk的embedding作为查询向量
  console.log('\n1️⃣ 获取示例chunk的embedding:');
  const sampleChunk = await prisma.$queryRawUnsafe<Array<{
    chunk_id: string;
    content: string;
    embedding_text: string;
  }>>(
    `SELECT 
      chunk_id,
      LEFT(content, 100) as content,
      embedding::text as embedding_text
    FROM chunks 
    WHERE embedding IS NOT NULL 
    LIMIT 1`
  );

  if (sampleChunk.length === 0) {
    console.log('   ❌ 未找到有embedding的chunk');
    return;
  }

  const chunk = sampleChunk[0];
  console.log(`   Chunk ID: ${chunk.chunk_id}`);
  console.log(`   内容: ${chunk.content}...`);

  // 2. 使用这个embedding查询其他chunks（模拟Dense检索）
  console.log('\n2️⃣ 执行SQL查询（模拟Dense检索）:');
  const embeddingStr = chunk.embedding_text;

  // 测试不同的credibilityMin值
  const testCases = [
    { credibilityMin: 0.5, description: '默认值0.5' },
    { credibilityMin: 0.0, description: '诊断模式0.0' },
    { credibilityMin: undefined, description: '未指定' },
  ];

  for (const testCase of testCases) {
    console.log(`\n   测试: credibilityMin=${testCase.credibilityMin} (${testCase.description})`);

    // 构建SQL条件
    const conditions: string[] = ['c.embedding IS NOT NULL'];
    const params: any[] = [embeddingStr];

    if (testCase.credibilityMin !== undefined && testCase.credibilityMin !== null) {
      // 注意：当credibilityMin=0.0时，if(credibilityMin)为false，不会添加条件
      // 但我们需要显式检查
      if (testCase.credibilityMin > 0 || testCase.credibilityMin === 0) {
        conditions.push(`c.credibility_score >= $${params.length + 1}`);
        params.push(testCase.credibilityMin);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = 10;

    const sql = `
      SELECT 
        c.chunk_id,
        1 - (c.embedding <=> $1::vector) as similarity,
        c.credibility_score,
        LEFT(c.content, 60) as content_preview
      FROM chunks c
      ${whereClause}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $${params.length + 1}
    `;

    params.push(limit);

    try {
      const results = await prisma.$queryRawUnsafe<Array<{
        chunk_id: string;
        similarity: number;
        credibility_score: number;
        content_preview: string;
      }>>(sql, ...params);

      console.log(`      SQL返回: ${results.length} 个结果`);

      if (results.length > 0) {
        console.log(`      前3个结果:`);
        results.slice(0, 3).forEach((r, i) => {
          const sim = parseFloat(String(r.similarity));
          const cred = parseFloat(String(r.credibility_score));
          console.log(`        [${i+1}] ${r.chunk_id}`);
          console.log(`            相似度: ${sim.toFixed(6)}`);
          console.log(`            可信度: ${cred.toFixed(2)}`);
        });

        // 检查是否会被formatResults过滤
        const threshold = testCase.credibilityMin === 0.0 ? 0 : 0.01;
        const passed = results.filter(r => {
          const sim = parseFloat(String(r.similarity));
          const cred = parseFloat(String(r.credibility_score));
          const simPass = threshold === 0 ? true : sim >= threshold;
          return simPass && cred >= (testCase.credibilityMin || 0);
        }).length;

        console.log(`      formatResults过滤后: ${passed}/${results.length} 个结果`);
        if (passed === 0 && results.length > 0) {
          const maxSim = Math.max(...results.map(r => parseFloat(String(r.similarity))));
          console.log(`      ⚠️  所有结果被过滤！最高相似度=${maxSim.toFixed(6)}`);
        }
      } else {
        console.log(`      ⚠️  SQL查询返回0个结果`);
      }
    } catch (error: any) {
      console.log(`      ❌ SQL查询失败: ${error.message}`);
    }
  }

  // 3. 测试API调用
  console.log('\n3️⃣ 测试API调用:');
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    proxy: false,
  });

  try {
    const apiResponse = await client.post('/api/rag/chunks/retrieve', {
      query: '冰岛',
      limit: 10,
      useHybridSearch: false,
      credibilityMin: 0.0,
    });

    const apiResults = apiResponse.data.data || [];
    console.log(`   API返回: ${apiResults.length} 个结果`);

    if (apiResults.length === 0) {
      console.log('   ⚠️  API返回0个结果，但SQL查询可能有结果');
      console.log('   💡 建议: 查看服务日志中的"所有结果被过滤"警告');
    }
  } catch (error: any) {
    console.log(`   ❌ API调用失败: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 诊断结论:');
  console.log('='.repeat(80));
  console.log('如果SQL查询返回结果但API返回0个结果:');
  console.log('   1. 检查formatResults方法的过滤逻辑');
  console.log('   2. 查看服务日志中的警告信息');
  console.log('   3. 检查credibility_score是否都>=0.0');
}

testDenseSQL()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
