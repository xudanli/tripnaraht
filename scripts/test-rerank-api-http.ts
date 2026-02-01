#!/usr/bin/env tsx
/**
 * Rerank API HTTP测试脚本
 * 
 * 通过HTTP API端点测试重排序功能
 * 需要应用正在运行（默认 http://localhost:3000）
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

interface RetrievalRequest {
  query: string;
  limit?: number;
  type?: string;
  category?: string;
  useHybridSearch?: boolean;
  useReranking?: boolean;
  rerankTopK?: number;
  useQueryExpansion?: boolean;
}

interface RetrievalResult {
  id: string;
  chunkId: string;
  content: string;
  similarity?: number;
  hybridScore?: number;
  rerankScore?: number;
  rerankReason?: string;
  type?: string;
  metadata?: any;
}

async function testRerankAPIHTTP() {
  console.log('🧪 Rerank API HTTP测试\n');
  console.log('='.repeat(80));
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // 检查API是否可用
  try {
    await axios.get(`${API_BASE_URL.replace('/api', '')}/health`);
    console.log('✅ API服务可用\n');
  } catch (error) {
    console.error('❌ API服务不可用，请确保应用正在运行');
    console.error(`   尝试访问: ${API_BASE_URL.replace('/api', '')}/health`);
    console.error(`   错误: ${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }

  const testCases = [
    {
      name: '冰岛 F208 道路状态',
      query: '冰岛 F208 道路状态',
      type: 'road_status' as const,
    },
    {
      name: '冰岛 渡轮 时刻表',
      query: '冰岛 渡轮 时刻表',
      type: 'ferry_schedules' as const,
    },
    {
      name: '冰岛 天气 最佳旅行时间',
      query: '冰岛 天气 最佳旅行时间',
      type: 'weather_windows' as const,
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📋 测试: ${testCase.name}`);
    console.log('─'.repeat(80));
    console.log(`查询: "${testCase.query}"`);
    console.log(`类型: ${testCase.type}\n`);

    try {
      // 测试1: 不使用重排序
      console.log('🔍 测试1: 基本检索（不使用重排序）');
      const basicRequest: RetrievalRequest = {
        query: testCase.query,
        limit: 5,
        type: testCase.type,
        useHybridSearch: true,
        useReranking: false,
      };

      const startTime1 = Date.now();
      const basicResponse = await axios.post<{ success: boolean; data: RetrievalResult[] }>(
        `${API_BASE_URL}/rag/chunks/retrieve`,
        basicRequest
      );
      const basicLatency = Date.now() - startTime1;

      if (!basicResponse.data.success) {
        console.error('  ❌ 基本检索失败');
        continue;
      }

      const basicResults = basicResponse.data.data || [];
      console.log(`  ✅ 检索成功: ${basicResults.length}条结果 (延迟: ${basicLatency}ms)`);
      if (basicResults.length > 0) {
        const top1 = basicResults[0];
        const score = top1.rerankScore || top1.hybridScore || top1.similarity || 0;
        console.log(`  Top1: 分数 ${score.toFixed(3)} - ${top1.content.substring(0, 60)}...`);
      }

      // 测试2: 使用重排序
      console.log('\n🔍 测试2: 重排序检索');
      const rerankRequest: RetrievalRequest = {
        query: testCase.query,
        limit: 5,
        type: testCase.type,
        useHybridSearch: true,
        useReranking: true,
        rerankTopK: 10,
      };

      const startTime2 = Date.now();
      const rerankResponse = await axios.post<{ success: boolean; data: RetrievalResult[] }>(
        `${API_BASE_URL}/rag/chunks/retrieve`,
        rerankRequest
      );
      const rerankLatency = Date.now() - startTime2;

      if (!rerankResponse.data.success) {
        console.error('  ❌ 重排序检索失败');
        continue;
      }

      const rerankResults = rerankResponse.data.data || [];
      console.log(`  ✅ 重排序检索成功: ${rerankResults.length}条结果 (延迟: ${rerankLatency}ms, 增加: +${rerankLatency - basicLatency}ms)`);
      
      if (rerankResults.length > 0) {
        const top1 = rerankResults[0];
        const score = top1.rerankScore || top1.hybridScore || top1.similarity || 0;
        console.log(`  Top1: 分数 ${score.toFixed(3)}${top1.rerankScore ? ' (重排序分数)' : ''}`);
        console.log(`        ${top1.content.substring(0, 60)}...`);
        if (top1.rerankReason) {
          console.log(`        重排序原因: ${top1.rerankReason}`);
        }

        // 对比结果顺序
        if (basicResults.length > 0 && rerankResults.length > 0) {
          const orderChanged = basicResults[0].chunkId !== rerankResults[0].chunkId;
          console.log(`\n  📊 顺序变化: ${orderChanged ? '✅ 是' : '❌ 否'}`);
          
          if (orderChanged) {
            console.log(`  原始Top1: ${basicResults[0].content.substring(0, 50)}...`);
            console.log(`  重排序Top1: ${rerankResults[0].content.substring(0, 50)}...`);
          }

          // 显示前3个结果的对比
          console.log('\n  📋 前3个结果对比:');
          console.log('  基本检索:');
          basicResults.slice(0, 3).forEach((r, idx) => {
            const score = r.rerankScore || r.hybridScore || r.similarity || 0;
            console.log(`    ${idx + 1}. [${score.toFixed(3)}] ${r.content.substring(0, 50)}...`);
          });
          console.log('  重排序检索:');
          rerankResults.slice(0, 3).forEach((r, idx) => {
            const score = r.rerankScore || r.hybridScore || r.similarity || 0;
            console.log(`    ${idx + 1}. [${score.toFixed(3)}] ${r.content.substring(0, 50)}...`);
          });
        }
      }

    } catch (error: any) {
      console.error(`  ❌ 测试失败:`, error.response?.data || error.message || String(error));
      if (error.response) {
        console.error(`  状态码: ${error.response.status}`);
        console.error(`  响应:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  // 测试3: 性能对比
  console.log('\n\n📋 测试3: 性能对比');
  console.log('─'.repeat(80));

  const performanceTestQuery = '冰岛 F208 道路状态';
  const iterations = 3;

  try {
    // 基本检索性能
    const basicLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await axios.post(`${API_BASE_URL}/rag/chunks/retrieve`, {
        query: performanceTestQuery,
        limit: 5,
        type: 'road_status',
        useHybridSearch: true,
        useReranking: false,
      });
      basicLatencies.push(Date.now() - start);
    }

    // 重排序检索性能
    const rerankLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await axios.post(`${API_BASE_URL}/rag/chunks/retrieve`, {
        query: performanceTestQuery,
        limit: 5,
        type: 'road_status',
        useHybridSearch: true,
        useReranking: true,
        rerankTopK: 10,
      });
      rerankLatencies.push(Date.now() - start);
    }

    const avgBasic = basicLatencies.reduce((a, b) => a + b, 0) / basicLatencies.length;
    const avgRerank = rerankLatencies.reduce((a, b) => a + b, 0) / rerankLatencies.length;
    const overhead = avgRerank - avgBasic;

    console.log(`查询: "${performanceTestQuery}"`);
    console.log(`迭代次数: ${iterations}`);
    console.log(`\n基本检索:`);
    console.log(`  平均延迟: ${avgBasic.toFixed(0)}ms`);
    console.log(`  延迟范围: ${Math.min(...basicLatencies)}ms - ${Math.max(...basicLatencies)}ms`);
    console.log(`\n重排序检索:`);
    console.log(`  平均延迟: ${avgRerank.toFixed(0)}ms`);
    console.log(`  延迟范围: ${Math.min(...rerankLatencies)}ms - ${Math.max(...rerankLatencies)}ms`);
    console.log(`\n重排序开销: +${overhead.toFixed(0)}ms (${((overhead / avgBasic) * 100).toFixed(1)}%)`);

  } catch (error: any) {
    console.error(`  ❌ 性能测试失败:`, error.message || String(error));
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('✅ Rerank API HTTP测试完成！');
  console.log('\n💡 提示:');
  console.log('  - 如果API服务不可用，请先启动应用: npm run start:dev');
  console.log('  - 可以通过环境变量设置API地址: API_BASE_URL=http://your-api:port/api');
  console.log('  - 重排序会增加延迟，但可以提升准确率');
  console.log('  - 建议在需要高准确率的场景使用重排序');
}

testRerankAPIHTTP().catch(console.error);
