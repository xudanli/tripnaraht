#!/usr/bin/env tsx
/**
 * 测试RAG相似度分数
 * 直接查询数据库，不经过API过滤
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = 'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
  proxy: false,
  httpAgent: false,
  httpsAgent: false,
});

async function testSimilarity() {
  console.log('🔍 测试RAG相似度分数\n');
  
  const query = '冰岛环岛路线推荐';
  console.log(`查询: "${query}"\n`);
  
  // 1. 通过API获取embedding（模拟）
  console.log('1️⃣ 通过API测试（会经过formatResults过滤）:');
  try {
    const apiResponse = await client.post('/api/rag/chunks/retrieve', {
      query,
      limit: 10,
      useHybridSearch: false,
      credibilityMin: 0.0,
    });
    
    const apiResults = apiResponse.data.data || [];
    console.log(`   API返回: ${apiResults.length} 个结果`);
    
    if (apiResults.length === 0) {
      console.log('   ⚠️  API返回0个结果（可能被similarityThreshold=0.1过滤）\n');
    } else {
      apiResults.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`   [${i+1}] ${r.chunkId}: similarity=${(r.similarity || 0).toFixed(4)}`);
      });
    }
  } catch (error: any) {
    console.log(`   ❌ API错误: ${error.message}\n`);
  }
  
  // 2. 检查数据库中chunks的内容，看看是否有相关数据
  console.log('2️⃣ 检查数据库中的chunks内容:');
  const sampleChunks = await prisma.chunk.findMany({
    take: 5,
    select: {
      chunkId: true,
      content: true,
      type: true,
    },
  });
  
  console.log(`   找到 ${sampleChunks.length} 个示例chunks:`);
  sampleChunks.forEach((chunk, i) => {
    const preview = chunk.content.substring(0, 80).replace(/\n/g, ' ');
    console.log(`   [${i+1}] ${chunk.chunkId} (${chunk.type}): ${preview}...`);
  });
  
  // 3. 检查是否有包含"冰岛"或"环岛"或"路线"的chunks
  console.log('\n3️⃣ 检查关键词匹配:');
  const keywordChunks = await prisma.chunk.findMany({
    where: {
      OR: [
        { content: { contains: '冰岛', mode: 'insensitive' } },
        { content: { contains: '环岛', mode: 'insensitive' } },
        { content: { contains: '路线', mode: 'insensitive' } },
        { keywords: { hasSome: ['冰岛', '环岛', '路线'] } },
      ],
    },
    take: 5,
    select: {
      chunkId: true,
      content: true,
      keywords: true,
    },
  });
  
  console.log(`   找到 ${keywordChunks.length} 个包含关键词的chunks`);
  if (keywordChunks.length > 0) {
    keywordChunks.forEach((chunk, i) => {
      console.log(`   [${i+1}] ${chunk.chunkId}`);
      console.log(`       关键词: ${chunk.keywords?.slice(0, 3).join(', ') || 'N/A'}`);
      const preview = chunk.content.substring(0, 60).replace(/\n/g, ' ');
      console.log(`       内容: ${preview}...`);
    });
  } else {
    console.log('   ⚠️  没有找到包含相关关键词的chunks');
  }
  
  console.log('\n💡 建议:');
  console.log('   如果API返回0个结果但数据库有相关chunks，可能是:');
  console.log('   1. similarityThreshold=0.1 太高，需要降低');
  console.log('   2. Embedding生成有问题，导致相似度分数过低');
  console.log('   3. 查询的embedding与chunks的embedding不匹配');
}

testSimilarity()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
