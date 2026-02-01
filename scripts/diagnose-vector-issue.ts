#!/usr/bin/env tsx
/**
 * 诊断向量问题
 * 检查向量生成、存储和相似度计算
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
const httpClient = axios.create({
  baseURL: baseUrl,
  timeout: 30000,
  proxy: false,
  httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
});

async function diagnoseVectors() {
  console.log('🔍 诊断向量问题...\n');

  // 1. 测试生成向量
  console.log('1️⃣ 测试向量生成');
  console.log('='.repeat(80));
  const testQuery = '圣地亚哥朝圣之路';
  try {
    const response = await httpClient.post('/api/v1/embeddings', {
      texts: [testQuery],
      model: 'bge-m3',
      return_sparse: false,
    });
    
    const embedding = response.data.embeddings[0].dense || response.data.embeddings[0];
    console.log(`✅ 向量生成成功`);
    console.log(`   维度: ${embedding.length}`);
    console.log(`   前10个值: ${embedding.slice(0, 10).map(v => v.toFixed(6)).join(', ')}`);
    console.log(`   值范围: [${Math.min(...embedding).toFixed(6)}, ${Math.max(...embedding).toFixed(6)}]`);
    console.log(`   平均值: ${(embedding.reduce((a, b) => a + b, 0) / embedding.length).toFixed(6)}`);
    
    // 检查是否都是相同值
    const uniqueValues = new Set(embedding.map(v => v.toFixed(4)));
    console.log(`   唯一值数量: ${uniqueValues.size}`);
    if (uniqueValues.size < 10) {
      console.log(`   ⚠️  警告: 向量值过于相似！`);
    }
  } catch (error: any) {
    console.error(`❌ 向量生成失败: ${error.message}`);
    return;
  }

  // 2. 检查数据库中的向量
  console.log('\n2️⃣ 检查数据库中的向量');
  console.log('='.repeat(80));
  try {
    const dbVectors = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      filename: string;
      embedding_text: string;
      dim: number;
    }>>(
      `
      SELECT 
        c.chunk_id,
        kf.filename,
        c.embedding::text as embedding_text,
        array_length(c.embedding::text::float[], 1) as dim
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
        AND kf.filename LIKE '%.md'
      LIMIT 3
      `
    );

    if (dbVectors.length > 0) {
      console.log(`✅ 找到 ${dbVectors.length} 个向量`);
      dbVectors.forEach((v, i) => {
        const vecArray = JSON.parse(v.embedding_text);
        const uniqueValues = new Set(vecArray.map((val: number) => val.toFixed(4)));
        console.log(`\n   ${i + 1}. ${v.filename}`);
        console.log(`      维度: ${v.dim}`);
        console.log(`      前10个值: ${vecArray.slice(0, 10).map((val: number) => val.toFixed(6)).join(', ')}`);
        console.log(`      值范围: [${Math.min(...vecArray).toFixed(6)}, ${Math.max(...vecArray).toFixed(6)}]`);
        console.log(`      唯一值数量: ${uniqueValues.size}`);
      });
    } else {
      console.log('❌ 未找到向量数据');
    }
  } catch (error: any) {
    console.error(`❌ 检查数据库向量失败: ${error.message}`);
  }

  // 3. 测试相似度计算
  console.log('\n3️⃣ 测试相似度计算');
  console.log('='.repeat(80));
  try {
    const response = await httpClient.post('/api/v1/embeddings', {
      texts: [testQuery],
      model: 'bge-m3',
      return_sparse: false,
    });
    
    const queryEmbedding = response.data.embeddings[0].dense || response.data.embeddings[0];
    
    // 使用Prisma.sql进行安全的向量查询
    const results = await prisma.$queryRaw<Array<{
      chunk_id: string;
      filename: string;
      distance: number;
      similarity: number;
    }>>`
      SELECT 
        c.chunk_id,
        kf.filename,
        (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as distance,
        1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
        AND kf.filename LIKE '%camino%'
      ORDER BY c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 5
    `;

    console.log(`✅ 相似度计算成功`);
    console.log(`   找到 ${results.length} 个结果\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.filename}`);
      console.log(`      距离: ${r.distance}`);
      console.log(`      相似度: ${(r.similarity * 100).toFixed(2)}%`);
    });
  } catch (error: any) {
    console.error(`❌ 相似度计算失败: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }

  await prisma.$disconnect();
}

diagnoseVectors().catch(console.error);
