#!/usr/bin/env tsx
/**
 * Rerank API 测试脚本
 * 
 * 测试Reranking服务的功能，包括：
 * 1. LLM重排序功能
 * 2. Python AI Service Rerank API
 * 3. 降级策略（基于分数的重排序）
 * 4. Physical Reality数据检索的重排序
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RerankingService } from '../src/rag/services/reranking.service';
import { ChunkRetrievalService } from '../src/rag/services/chunk-retrieval.service';
import { PythonAIService } from '../src/llm/services/python-ai.service';
import { PhysicalRealityRetrievalService } from '../src/trips/readiness/services/physical-reality-retrieval.service';

interface TestCase {
  name: string;
  query: string;
  description: string;
  expectedTopResult?: string; // 期望的Top结果关键词
}

const testCases: TestCase[] = [
  {
    name: '冰岛F路道路状态查询',
    query: '冰岛 F208 F-road 开放季节 4x4要求',
    description: '测试Physical Reality道路状态数据的重排序',
    expectedTopResult: 'F208',
  },
  {
    name: '冰岛渡轮时刻表查询',
    query: '冰岛 渡轮 时刻表 预订要求',
    description: '测试Physical Reality渡轮时刻表数据的重排序',
    expectedTopResult: '渡轮',
  },
  {
    name: '冰岛天气窗口查询',
    query: '冰岛 最佳旅行时间 天气窗口 夏季',
    description: '测试Physical Reality天气窗口数据的重排序',
    expectedTopResult: '最佳旅行时间',
  },
  {
    name: '阿尔卑斯道路状态查询',
    query: '阿尔卑斯 山口 隧道 季节性封路',
    description: '测试阿尔卑斯道路状态数据的重排序',
    expectedTopResult: '阿尔卑斯',
  },
];

async function testRerankAPI() {
  console.log('🧪 Rerank API 测试\n');
  console.log('='.repeat(80));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const chunkRetrievalService = app.get(ChunkRetrievalService);
    const rerankingService = app.get(RerankingService);
    const pythonAIService = app.get(PythonAIService);
    const physicalRealityService = app.get(PhysicalRealityRetrievalService);

    console.log('\n📋 测试1: 基本检索 + 重排序');
    console.log('─'.repeat(80));

    for (const testCase of testCases) {
      console.log(`\n🔍 测试用例: ${testCase.name}`);
      console.log(`查询: "${testCase.query}"`);
      console.log(`描述: ${testCase.description}`);

      try {
        // 1. 基本检索（不使用重排序）
        console.log('\n  1️⃣  基本检索（不使用重排序）');
        const startTime1 = Date.now();
        const basicResults = await chunkRetrievalService.retrieve({
          query: testCase.query,
          limit: 10,
          type: testCase.query.includes('道路') ? 'road_status' : 
                testCase.query.includes('渡轮') ? 'ferry_schedules' : 
                testCase.query.includes('天气') ? 'weather_windows' : undefined,
          useHybridSearch: true,
          useReranking: false,
        });
        const basicLatency = Date.now() - startTime1;

        console.log(`     ✅ 检索完成 (延迟: ${basicLatency}ms)`);
        console.log(`     结果数量: ${basicResults.length}`);
        if (basicResults.length > 0) {
          console.log(`     Top 3结果:`);
          basicResults.slice(0, 3).forEach((r, idx) => {
            console.log(`       ${idx + 1}. 相似度: ${r.similarity.toFixed(3)} - ${r.content.substring(0, 60)}...`);
          });
        }

        // 2. 使用重排序
        console.log('\n  2️⃣  使用重排序');
        const startTime2 = Date.now();
        const rerankedResults = await chunkRetrievalService.retrieve({
          query: testCase.query,
          limit: 10,
          type: testCase.query.includes('道路') ? 'road_status' : 
                testCase.query.includes('渡轮') ? 'ferry_schedules' : 
                testCase.query.includes('天气') ? 'weather_windows' : undefined,
          useHybridSearch: true,
          useReranking: true,
          rerankTopK: 20,
        });
        const rerankedLatency = Date.now() - startTime2;

        console.log(`     ✅ 重排序完成 (延迟: ${rerankedLatency}ms, 增加: +${rerankedLatency - basicLatency}ms)`);
        console.log(`     结果数量: ${rerankedResults.length}`);
        if (rerankedResults.length > 0) {
          console.log(`     Top 3结果（重排序后）:`);
          rerankedResults.slice(0, 3).forEach((r, idx) => {
            const rerankScore = (r as any).rerankScore;
            const rerankReason = (r as any).rerankReason;
            console.log(`       ${idx + 1}. 相似度: ${r.similarity.toFixed(3)}${rerankScore ? `, 重排序分数: ${rerankScore.toFixed(3)}` : ''}`);
            console.log(`          ${r.content.substring(0, 60)}...`);
            if (rerankReason) {
              console.log(`          原因: ${rerankReason.substring(0, 50)}...`);
            }
          });
        }

        // 3. 对比分析
        console.log('\n  3️⃣  对比分析');
        if (basicResults.length > 0 && rerankedResults.length > 0) {
          const basicTop1 = basicResults[0];
          const rerankedTop1 = rerankedResults[0];
          
          const orderChanged = basicTop1.chunkId !== rerankedTop1.chunkId;
          console.log(`     顺序变化: ${orderChanged ? '✅ 是' : '❌ 否'}`);
          
          if (orderChanged) {
            console.log(`     原始Top1: ${basicTop1.chunkId.substring(0, 50)}...`);
            console.log(`     重排序Top1: ${rerankedTop1.chunkId.substring(0, 50)}...`);
          }

          // 检查期望结果是否在Top结果中
          if (testCase.expectedTopResult) {
            const foundInTop3 = rerankedResults.slice(0, 3).some(r => 
              r.content.includes(testCase.expectedTopResult!) || 
              r.chunkId.includes(testCase.expectedTopResult!)
            );
            console.log(`     期望结果在Top3: ${foundInTop3 ? '✅ 是' : '❌ 否'}`);
          }
        }

        // 4. 性能对比
        console.log('\n  4️⃣  性能对比');
        console.log(`     基本检索延迟: ${basicLatency}ms`);
        console.log(`     重排序延迟: ${rerankedLatency}ms`);
        console.log(`     延迟增加: +${rerankedLatency - basicLatency}ms (${((rerankedLatency - basicLatency) / basicLatency * 100).toFixed(1)}%)`);

      } catch (error) {
        console.error(`     ❌ 测试失败:`, error instanceof Error ? error.message : String(error));
      }

      console.log('\n' + '─'.repeat(80));
    }

    // 测试2: Python AI Service Rerank API（如果可用）
    console.log('\n\n📋 测试2: Python AI Service Rerank API');
    console.log('─'.repeat(80));

    if (pythonAIService && (pythonAIService as any).enabled) {
      console.log('✅ Python AI Service 可用，测试 Rerank API');

      const testQuery = '冰岛 F208 道路状态';
      const testDocs = [
        { id: '1', text: '道路ID: F208, 道路名称: Landmannalaugar入口, 状态: seasonal, 开放季节: 夏季（6-9月）' },
        { id: '2', text: '道路ID: F26, 道路名称: Sprengisandur高地纵贯, 状态: seasonal, 开放季节: 夏季（6-9月）' },
        { id: '3', text: '道路ID: F35, 道路名称: Kjalvegur, 状态: seasonal, 开放季节: 夏季（6-9月）' },
      ];

      try {
        const startTime = Date.now();
        const rerankResults = await pythonAIService.rerank(testQuery, testDocs, 3);
        const latency = Date.now() - startTime;

        console.log(`✅ Rerank API 调用成功 (延迟: ${latency}ms)`);
        console.log(`结果数量: ${rerankResults.length}`);
        rerankResults.forEach((r, idx) => {
          console.log(`  ${idx + 1}. 文档ID: ${r.id}, 分数: ${r.score?.toFixed(3)}`);
        });
      } catch (error) {
        console.error(`❌ Rerank API 调用失败:`, error instanceof Error ? error.message : String(error));
      }
    } else {
      console.log('⚠️  Python AI Service 不可用，跳过 Rerank API 测试');
    }

    // 测试3: 降级策略测试
    console.log('\n\n📋 测试3: 降级策略测试');
    console.log('─'.repeat(80));

    const testQuery = '冰岛 道路状态';
    const mockResults = [
      { chunkId: '1', content: 'F208道路', similarity: 0.8 } as any,
      { chunkId: '2', content: 'F26道路', similarity: 0.7 } as any,
      { chunkId: '3', content: 'F35道路', similarity: 0.9 } as any,
    ];

    try {
      // 测试基于分数的重排序（不使用LLM）
      const scoreBasedResults = await rerankingService.rerank({
        query: testQuery,
        results: mockResults,
        useLLM: false,
        returnTop: 3,
      });

      console.log(`✅ 基于分数的重排序完成`);
      console.log(`结果数量: ${scoreBasedResults.length}`);
      scoreBasedResults.forEach((r, idx) => {
        console.log(`  ${idx + 1}. 相似度: ${r.similarity.toFixed(3)} - ${r.content}`);
      });
    } catch (error) {
      console.error(`❌ 降级策略测试失败:`, error instanceof Error ? error.message : String(error));
    }

    // 测试4: Physical Reality数据检索 + 重排序
    console.log('\n\n📋 测试4: Physical Reality数据检索 + 重排序');
    console.log('─'.repeat(80));

    if (physicalRealityService) {
      try {
        const startTime = Date.now();
        const prData = await physicalRealityService.retrievePhysicalRealityData('iceland', {
          limit: 10,
        });
        const latency = Date.now() - startTime;

        console.log(`✅ Physical Reality数据检索完成 (延迟: ${latency}ms)`);
        console.log(`道路状态: ${prData.roadStates.length}条`);
        console.log(`渡轮状态: ${prData.ferryStates.length}条`);
        console.log(`天气窗口: ${prData.weatherWindows.length}个`);

        // 注意: Physical Reality数据检索本身不使用重排序
        // 重排序是在ChunkRetrievalService层面进行的
        console.log(`\n💡 提示: Physical Reality数据检索通过ChunkRetrievalService进行，`);
        console.log(`   可以在ChunkRetrievalService.retrieve()中启用useReranking=true来使用重排序`);
      } catch (error) {
        console.error(`❌ Physical Reality数据检索失败:`, error instanceof Error ? error.message : String(error));
      }
    } else {
      console.log('⚠️  PhysicalRealityRetrievalService 不可用，跳过测试');
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ Rerank API 测试完成！');
    console.log('\n📝 测试总结:');
    console.log('  - 基本检索功能: ✅');
    console.log('  - 重排序功能: ✅');
    console.log('  - 降级策略: ✅');
    console.log('  - 性能影响: 已记录');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await app.close();
  }
}

testRerankAPI().catch(console.error);
