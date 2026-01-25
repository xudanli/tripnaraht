// scripts/quick-test-rag-api.ts
/**
 * 快速测试 RAG API 接口
 * 
 * 使用方法：
 *   npx ts-node scripts/quick-test-rag-api.ts
 */

import axios from 'axios';

try {
  require('dotenv').config();
} catch (e) {}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

async function quickTest() {
  console.log('🧪 快速测试 RAG API 接口\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // 测试1: 获取测试集
  try {
    console.log('1️⃣ 测试: GET /api/rag/evaluation/testset');
    const res1 = await client.get('/api/rag/evaluation/testset');
    console.log(`   ✅ 成功: ${res1.data.data.testCases.length} 个测试用例\n`);
  } catch (error: any) {
    console.log(`   ❌ 失败: ${error.message}\n`);
  }

  // 测试2: 查找相关 chunks
  try {
    console.log('2️⃣ 测试: GET /api/rag/evaluation/testset/find-chunks?query=冰岛租车保险');
    const res2 = await client.get('/api/rag/evaluation/testset/find-chunks', {
      params: { query: '冰岛租车保险', limit: 5 },
    });
    console.log(`   ✅ 成功: 找到 ${res2.data.data.chunks.length} 个相关 chunks`);
    if (res2.data.data.chunks.length > 0) {
      console.log(`   📝 第一个 chunk ID: ${res2.data.data.chunks[0].id}\n`);
    } else {
      console.log('   ⚠️  未找到相关 chunks（可能数据库中没有数据）\n');
    }
  } catch (error: any) {
    console.log(`   ❌ 失败: ${error.message}\n`);
  }

  // 测试3: Chunk 检索
  try {
    console.log('3️⃣ 测试: POST /api/rag/chunks/retrieve');
    const res3 = await client.post('/api/rag/chunks/retrieve', {
      query: '冰岛租车保险',
      limit: 5,
      credibilityMin: 0.0,
      useHybridSearch: true,
    });
    console.log(`   ✅ 成功: 找到 ${res3.data.data.length} 个相关 chunks`);
    if (res3.data.data.length > 0) {
      const first = res3.data.data[0];
      console.log(`   📝 第一个 chunk:`);
      console.log(`      ID: ${first.id}`);
      console.log(`      相似度: ${(first.similarity || first.hybridScore || 0).toFixed(3)}`);
      if (first.file) {
        console.log(`      文件: ${first.file.filename}`);
      }
      console.log('');
    } else {
      console.log('   ⚠️  未找到相关 chunks（可能数据库中没有数据或 embedding 未生成）\n');
    }
  } catch (error: any) {
    console.log(`   ❌ 失败: ${error.message}\n`);
  }

  // 测试4: 列出所有 chunks
  try {
    console.log('4️⃣ 测试: GET /api/rag/evaluation/testset/list-chunks?limit=5');
    const res4 = await client.get('/api/rag/evaluation/testset/list-chunks', {
      params: { limit: 5 },
    });
    console.log(`   ✅ 成功: 数据库中共有 ${res4.data.data.count} 个 chunks，返回 ${res4.data.data.chunks.length} 个`);
    if (res4.data.data.chunks.length > 0) {
      console.log(`   📝 第一个 chunk ID: ${res4.data.data.chunks[0].id}\n`);
    } else {
      console.log('   ⚠️  数据库中没有 chunks\n');
    }
  } catch (error: any) {
    console.log(`   ❌ 失败: ${error.message}\n`);
  }

  console.log('✅ 测试完成！');
}

quickTest().catch((error) => {
  console.error('❌ 测试失败:', error.message);
  if (error.response) {
    console.error('响应状态:', error.response.status);
    console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1);
});
