#!/usr/bin/env tsx
/**
 * 测试冰岛数据的 RAG 能力
 * 
 * 运行方式:
 * npx tsx scripts/test-iceland-rag.ts
 */

import axios from 'axios';

try {
  require('dotenv').config();
} catch (e) {}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
  // 禁用代理，直接连接
  proxy: false,
  httpAgent: false,
  httpsAgent: false,
});

interface TestCase {
  id: string;
  name: string;
  query: string;
  description: string;
}

const icelandTestCases: TestCase[] = [
  {
    id: 'iceland-001',
    name: '冰岛环岛路线推荐',
    query: '冰岛环岛路线推荐',
    description: '测试路线推荐查询',
  },
  {
    id: 'iceland-002',
    name: '冰岛F路开放时间',
    query: '冰岛F路什么时候开放？需要什么车型？',
    description: '测试规则类查询',
  },
  {
    id: 'iceland-003',
    name: '冰岛租车保险',
    query: '冰岛租车保险怎么选？有哪些必买的险种？',
    description: '测试租车相关查询',
  },
  {
    id: 'iceland-004',
    name: '冰岛天气查询',
    query: '雷克雅未克现在的天气怎么样',
    description: '测试实时天气查询（可能需要外部API）',
  },
  {
    id: 'iceland-005',
    name: '冰岛景点查询',
    query: '西峡湾路线有什么景点',
    description: '测试POI查询',
  },
  {
    id: 'iceland-006',
    name: '冰岛驾照规则',
    query: '中国驾照在冰岛能用吗',
    description: '测试规则类查询（可能需要Web Browse降级）',
  },
];

async function testIcelandRAG() {
  console.log('🧪 测试冰岛数据的 RAG 能力\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);
  console.log('='.repeat(80));
  console.log(`测试用例数: ${icelandTestCases.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const testCase of icelandTestCases) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`[${testCase.id}] ${testCase.name}`);
    console.log(`查询: "${testCase.query}"`);
    console.log(`描述: ${testCase.description}\n`);

    try {
      // 使用新的 ChunkRetrievalService (chunks/retrieve 端点)
      console.log('📡 调用: POST /api/rag/chunks/retrieve');
      
      // 先测试纯向量检索（不使用Hybrid）
      const response = await client.post('/api/rag/chunks/retrieve', {
        query: testCase.query,
        limit: 10,
        useHybridSearch: false, // 先测试纯向量检索
        credibilityMin: 0.0,
      });

      if (response.data.success && response.data.data) {
        const results = response.data.data;
        console.log(`✅ 成功: 找到 ${results.length} 个相关结果\n`);

        if (results.length > 0) {
          console.log('📝 前3个结果:');
          results.slice(0, 3).forEach((result: any, index: number) => {
            console.log(`\n  [${index + 1}]`);
            console.log(`    ID: ${result.chunkId || result.id || 'N/A'}`);
            const similarity = result.similarity || result.hybridScore || result.denseScore || 0;
            console.log(`    相似度: ${similarity.toFixed(4)}`);
            console.log(`    可信度: ${(result.credibilityScore || 0).toFixed(2)}`);
            if (result.sourceFile) {
              console.log(`    文件: ${result.sourceFile}`);
            }
            if (result.content) {
              const preview = result.content.substring(0, 150).replace(/\n/g, ' ');
              console.log(`    内容预览: ${preview}...`);
            }
            // 检查是否会被过滤（similarityThreshold = 0.1）
            if (similarity < 0.1) {
              console.log(`    ⚠️  相似度 ${similarity.toFixed(4)} < 0.1，可能被过滤`);
            }
          });
        } else {
          console.log('⚠️  未找到相关结果');
          console.log('   可能原因:');
          console.log('     1. 服务未重启（代码修改需重启生效）');
          console.log('     2. 相似度阈值仍然过高（当前动态阈值: credibilityMin<=0.0时为0.001）');
          console.log('     3. Embedding生成问题');
          console.log('     4. 查询与数据不匹配');
          console.log('   💡 建议: 检查服务日志查看实际相似度分数');
        }
        successCount++;
      } else {
        console.log(`❌ 失败: 响应格式异常`);
        console.log(`响应: ${JSON.stringify(response.data, null, 2)}`);
        failCount++;
      }
    } catch (error: any) {
      console.log(`❌ 失败: ${error.message}`);
      if (error.response) {
        console.log(`状态码: ${error.response.status}`);
        console.log(`响应: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      failCount++;
    }

    console.log('');
  }

  console.log('='.repeat(80));
  console.log('测试总结');
  console.log('='.repeat(80));
  console.log(`总用例数: ${icelandTestCases.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${failCount}`);
  console.log('='.repeat(80));

  if (failCount === 0) {
    console.log('\n✅ 所有测试通过！RAG 能力已成功集成。\n');
  } else {
    console.log(`\n⚠️  有 ${failCount} 个测试失败。请检查：`);
    console.log('  1. 数据库是否有冰岛知识库数据');
    console.log('  2. 服务是否正常运行');
    console.log('  3. 环境变量配置是否正确\n');
  }
}

testIcelandRAG().catch((error) => {
  console.error('❌ 测试失败:', error.message);
  if (error.response) {
    console.error('响应状态:', error.response.status);
    console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1);
});
