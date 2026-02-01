#!/usr/bin/env tsx
/**
 * Physical Reality 数据检索测试脚本
 * 测试新索引的Physical Reality数据在RAG检索中的表现
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// 使用 Python AI Service 生成 embedding
class SimpleEmbeddingService {
  private httpClient: any;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      proxy: false,
      httpsAgent: new https.Agent({
        keepAlive: true,
        family: 4,
      }),
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.httpClient.post(
        '/api/v1/embeddings',
        {
          texts: [text],
          model: 'bge-m3',
          return_sparse: false,
        }
      );

      if (response.data && response.data.embeddings && response.data.embeddings.length > 0) {
        return response.data.embeddings[0].dense || response.data.embeddings[0];
      }

      throw new Error('Python AI Service 返回格式错误');
    } catch (error: any) {
      console.error('Embedding 生成失败:', error.message);
      throw error;
    }
  }
}

const embeddingService = new SimpleEmbeddingService();

interface TestQuery {
  query: string;
  category: 'road_status' | 'ferry_schedules' | 'weather_windows';
  expectedRegion?: string;
  expectedKeywords?: string[];
  description: string;
}

const testQueries: TestQuery[] = [
  // 道路状态查询
  {
    query: 'F208什么时候开放？',
    category: 'road_status',
    expectedRegion: 'iceland',
    expectedKeywords: ['F208', '开放', 'open'],
    description: '测试冰岛F路开放时间查询',
  },
  {
    query: 'Milford Road冬季会关闭吗？',
    category: 'road_status',
    expectedRegion: 'new-zealand',
    expectedKeywords: ['Milford', 'Road', '冬季', 'winter', '关闭'],
    description: '测试新西兰道路状态查询',
  },
  {
    query: '哪些F路需要4x4车辆？',
    category: 'road_status',
    expectedRegion: 'iceland',
    expectedKeywords: ['4x4', '车辆', 'vehicle', 'required'],
    description: '测试车辆要求查询',
  },
  {
    query: '圣哥达山口的最佳通行时间是什么时候？',
    category: 'road_status',
    expectedRegion: 'alps',
    expectedKeywords: ['圣哥达', 'Gotthard', 'Pass', '通行时间'],
    description: '测试阿尔卑斯山口查询',
  },
  {
    query: '格陵兰的冰盖公路需要什么车辆？',
    category: 'road_status',
    expectedRegion: 'greenland',
    expectedKeywords: ['冰盖', 'Ice Sheet', 'Road', '车辆', 'vehicle'],
    description: '测试格陵兰道路查询',
  },
  {
    query: '法罗群岛的隧道在恶劣天气时会关闭吗？',
    category: 'road_status',
    expectedRegion: 'faroe',
    expectedKeywords: ['隧道', 'tunnel', '天气', 'weather', '关闭'],
    description: '测试法罗群岛道路查询',
  },
  {
    query: '罗弗敦群岛的E10公路冬季需要什么轮胎？',
    category: 'road_status',
    expectedRegion: 'lofoten',
    expectedKeywords: ['E10', '冬季', 'winter', '轮胎', 'tire'],
    description: '测试罗弗敦道路查询',
  },
  {
    query: 'Gimsøystraumen桥什么时候会关闭？',
    category: 'road_status',
    expectedRegion: 'lofoten',
    expectedKeywords: ['Gimsøystraumen', '桥', 'bridge', '关闭'],
    description: '测试桥梁状态查询',
  },
  {
    query: '从Kangerlussuaq到冰盖有多远？',
    category: 'road_status',
    expectedRegion: 'greenland',
    expectedKeywords: ['Kangerlussuaq', '冰盖', 'Ice Sheet', '距离'],
    description: '测试道路距离查询',
  },
  {
    query: '富尔卡山口什么时候开放？',
    category: 'road_status',
    expectedRegion: 'alps',
    expectedKeywords: ['富尔卡', 'Furka', 'Pass', '开放'],
    description: '测试阿尔卑斯山口开放时间查询',
  },
  
  // 渡轮时刻表查询
  {
    query: '西峡湾渡轮需要预订吗？',
    category: 'ferry_schedules',
    expectedRegion: 'iceland',
    expectedKeywords: ['西峡湾', 'Westfjords', '渡轮', 'ferry', '预订'],
    description: '测试冰岛渡轮预订查询',
  },
  {
    query: 'Cook Strait渡轮受天气影响大吗？',
    category: 'ferry_schedules',
    expectedRegion: 'new-zealand',
    expectedKeywords: ['Cook Strait', '渡轮', 'ferry', '天气', 'weather'],
    description: '测试新西兰渡轮天气影响查询',
  },
  {
    query: '前往罗弗敦群岛的渡轮时刻表是什么？',
    category: 'ferry_schedules',
    expectedRegion: 'lofoten',
    expectedKeywords: ['罗弗敦', 'Lofoten', '渡轮', 'ferry', '时刻表'],
    description: '测试罗弗敦渡轮时刻表查询',
  },
  {
    query: '格陵兰渡轮什么时候运营？',
    category: 'ferry_schedules',
    expectedRegion: 'greenland',
    expectedKeywords: ['格陵兰', 'Greenland', '渡轮', 'ferry', '运营'],
    description: '测试格陵兰渡轮运营时间查询',
  },
  {
    query: 'Primera Angostura渡轮需要预订吗？',
    category: 'ferry_schedules',
    expectedRegion: 'argentina',
    expectedKeywords: ['Primera Angostura', '渡轮', 'ferry', '预订'],
    description: '测试阿根廷渡轮预订查询',
  },
  {
    query: '斯瓦尔巴的渡轮什么时候运营？',
    category: 'ferry_schedules',
    expectedRegion: 'svalbard',
    expectedKeywords: ['斯瓦尔巴', 'Svalbard', '渡轮', 'ferry', '运营'],
    description: '测试斯瓦尔巴渡轮运营时间查询',
  },
  {
    query: '朗伊尔城到巴伦支堡的渡轮需要多长时间？',
    category: 'ferry_schedules',
    expectedRegion: 'svalbard',
    expectedKeywords: ['朗伊尔城', 'Longyearbyen', '巴伦支堡', 'Barentsburg', '时间'],
    description: '测试斯瓦尔巴渡轮时间查询',
  },
  {
    query: '冬季如何前往金字塔城？',
    category: 'ferry_schedules',
    expectedRegion: 'svalbard',
    expectedKeywords: ['冬季', 'winter', '金字塔城', 'Pyramiden', '前往'],
    description: '测试斯瓦尔巴冬季交通查询',
  },
  {
    query: '阿尔卑斯有哪些湖泊渡轮？',
    category: 'ferry_schedules',
    expectedRegion: 'alps',
    expectedKeywords: ['阿尔卑斯', 'Alps', '湖泊', 'lake', '渡轮'],
    description: '测试阿尔卑斯湖泊渡轮查询',
  },
  {
    query: '加尔达湖渡轮冬季运营吗？',
    category: 'ferry_schedules',
    expectedRegion: 'alps',
    expectedKeywords: ['加尔达湖', 'Lake Garda', '渡轮', 'ferry', '冬季'],
    description: '测试阿尔卑斯湖泊渡轮季节性查询',
  },
  
  // 天气窗口查询
  {
    query: '冰岛最佳旅行时间是什么时候？',
    category: 'weather_windows',
    expectedRegion: 'iceland',
    expectedKeywords: ['冰岛', 'Iceland', '最佳', 'best', '旅行时间'],
    description: '测试冰岛天气窗口查询',
  },
  {
    query: '乌斯怀亚的强风有多危险？',
    category: 'weather_windows',
    expectedRegion: 'argentina',
    expectedKeywords: ['乌斯怀亚', 'Ushuaia', '强风', 'wind', '危险'],
    description: '测试阿根廷天气风险查询',
  },
  {
    query: '新西兰南岛峡湾地区的天气风险是什么？',
    category: 'weather_windows',
    expectedRegion: 'new-zealand',
    expectedKeywords: ['新西兰', 'New Zealand', '峡湾', 'Fiordland', '天气风险'],
    description: '测试新西兰天气风险查询',
  },
  {
    query: '罗弗敦群岛的天气变化有多快？',
    category: 'weather_windows',
    expectedRegion: 'lofoten',
    expectedKeywords: ['罗弗敦', 'Lofoten', '天气', 'weather', '变化'],
    description: '测试罗弗敦天气变化查询',
  },
  {
    query: '多洛米蒂的午后雷暴有多危险？',
    category: 'weather_windows',
    expectedRegion: 'alps',
    expectedKeywords: ['多洛米蒂', 'Dolomites', '雷暴', 'thunderstorm', '危险'],
    description: '测试阿尔卑斯天气风险查询',
  },
  {
    query: '皇后镇地区的最佳旅行时间是什么时候？',
    category: 'weather_windows',
    expectedRegion: 'new-zealand',
    expectedKeywords: ['皇后镇', 'Queenstown', '最佳', 'best', '旅行时间'],
    description: '测试新西兰天气窗口查询',
  },
  {
    query: '库克山地区的雪崩风险是什么时候？',
    category: 'weather_windows',
    expectedRegion: 'new-zealand',
    expectedKeywords: ['库克山', 'Mt Cook', '雪崩', 'avalanche', '风险'],
    description: '测试新西兰天气风险查询',
  },
  {
    query: '马特洪峰地区的天气如何？',
    category: 'weather_windows',
    expectedRegion: 'alps',
    expectedKeywords: ['马特洪峰', 'Matterhorn', '天气', 'weather'],
    description: '测试阿尔卑斯天气查询',
  },
  {
    query: '法罗群岛的强风有多危险？',
    category: 'weather_windows',
    expectedRegion: 'faroe',
    expectedKeywords: ['法罗群岛', 'Faroe Islands', '强风', 'wind', '危险'],
    description: '测试法罗群岛天气风险查询',
  },
  {
    query: '格陵兰西海岸的最佳旅行时间是什么时候？',
    category: 'weather_windows',
    expectedRegion: 'greenland',
    expectedKeywords: ['格陵兰', 'Greenland', '西海岸', 'West Coast', '最佳'],
    description: '测试格陵兰天气窗口查询',
  },
];

interface RetrievalResult {
  chunkId: string;
  content: string;
  similarity: number;
  category: string;
  region?: string;
  metadata?: any;
}

interface TestResult {
  query: string;
  category: string;
  description: string;
  results: RetrievalResult[];
  top1Similarity: number;
  top5Similarity: number;
  avgSimilarity: number;
  hasRelevantResult: boolean;
  relevantAtTop1: boolean;
  relevantAtTop5: boolean;
  latency: number;
}

async function testRetrieval(testQuery: TestQuery, limit: number = 10): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // 1. 生成查询向量
    const queryEmbedding = await embeddingService.generateEmbedding(testQuery.query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    
    // 2. 构建SQL查询（使用ChunkRetrievalService的逻辑）
    const conditions: string[] = [];
    const params: any[] = [embeddingStr, limit];
    
    // 添加category过滤
    if (testQuery.category) {
      conditions.push(`kf.category = $${params.length + 1}`);
      params.push(testQuery.category);
    }
    
    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    
    // 3. 执行向量相似度搜索
    const querySql = `
      SELECT 
        c.chunk_id,
        c.content,
        c.metadata,
        kf.category,
        kf.filename,
        1 - (c.embedding <=> $1::vector) as similarity
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      ${whereClause}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
    `;
    
    const results = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      content: string;
      metadata: any;
      category: string;
      filename: string;
      similarity: number;
    }>>(querySql, ...params);
    
    const latency = Date.now() - startTime;
    
    // 4. 评估结果
    const formattedResults: RetrievalResult[] = results.map(r => ({
      chunkId: r.chunk_id,
      content: r.content.substring(0, 200) + '...',
      similarity: parseFloat(r.similarity as any),
      category: r.category,
      region: extractRegionFromFilename(r.filename),
      metadata: r.metadata,
    }));
    
    // 5. 检查相关性（简单关键词匹配）
    const hasRelevantResult = formattedResults.some(r => 
      testQuery.expectedKeywords?.some(kw => 
        r.content.toLowerCase().includes(kw.toLowerCase()) ||
        r.metadata?.roadId?.toLowerCase().includes(kw.toLowerCase()) ||
        r.metadata?.routeId?.toLowerCase().includes(kw.toLowerCase()) ||
        r.metadata?.regionId?.toLowerCase().includes(kw.toLowerCase())
      )
    );
    
    const relevantAtTop1 = formattedResults.length > 0 && (
      testQuery.expectedKeywords?.some(kw => 
        formattedResults[0].content.toLowerCase().includes(kw.toLowerCase()) ||
        formattedResults[0].metadata?.roadId?.toLowerCase().includes(kw.toLowerCase()) ||
        formattedResults[0].metadata?.routeId?.toLowerCase().includes(kw.toLowerCase()) ||
        formattedResults[0].metadata?.regionId?.toLowerCase().includes(kw.toLowerCase())
      ) || false
    );
    
    const relevantAtTop5 = formattedResults.slice(0, 5).some(r =>
      testQuery.expectedKeywords?.some(kw => 
        r.content.toLowerCase().includes(kw.toLowerCase()) ||
        r.metadata?.roadId?.toLowerCase().includes(kw.toLowerCase()) ||
        r.metadata?.routeId?.toLowerCase().includes(kw.toLowerCase()) ||
        r.metadata?.regionId?.toLowerCase().includes(kw.toLowerCase())
      )
    );
    
    return {
      query: testQuery.query,
      category: testQuery.category,
      description: testQuery.description,
      results: formattedResults,
      top1Similarity: formattedResults[0]?.similarity || 0,
      top5Similarity: formattedResults.slice(0, 5).reduce((sum, r) => sum + r.similarity, 0) / Math.min(5, formattedResults.length),
      avgSimilarity: formattedResults.reduce((sum, r) => sum + r.similarity, 0) / formattedResults.length,
      hasRelevantResult,
      relevantAtTop1,
      relevantAtTop5,
      latency,
    };
  } catch (error: any) {
    console.error(`检索失败: ${error.message}`);
    return {
      query: testQuery.query,
      category: testQuery.category,
      description: testQuery.description,
      results: [],
      top1Similarity: 0,
      top5Similarity: 0,
      avgSimilarity: 0,
      hasRelevantResult: false,
      relevantAtTop1: false,
      relevantAtTop5: false,
      latency: Date.now() - startTime,
    };
  }
}

function extractRegionFromFilename(filename: string): string {
  const parts = filename.split('-');
  if (parts.length >= 2) {
    if (parts[1] === 'ferry' || parts[1] === 'road' || parts[1] === 'weather') {
      return parts[0];
    }
    return parts.slice(0, 2).join('-');
  }
  return parts[0];
}

async function runTests() {
  console.log('🚀 Physical Reality 数据检索测试');
  console.log('='.repeat(80));
  console.log(`测试查询数: ${testQueries.length}`);
  console.log(`测试类别: 道路状态、渡轮时刻表、天气窗口`);
  console.log('='.repeat(80));
  
  const results: TestResult[] = [];
  
  // 按类别分组测试
  const queriesByCategory = {
    road_status: testQueries.filter(q => q.category === 'road_status'),
    ferry_schedules: testQueries.filter(q => q.category === 'ferry_schedules'),
    weather_windows: testQueries.filter(q => q.category === 'weather_windows'),
  };
  
  for (const [category, queries] of Object.entries(queriesByCategory)) {
    console.log(`\n\n📋 测试类别: ${category} (${queries.length} 个查询)`);
    console.log('='.repeat(80));
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`\n[${i + 1}/${queries.length}] ${query.description}`);
      console.log(`查询: "${query.query}"`);
      
      const result = await testRetrieval(query);
      results.push(result);
      
      console.log(`  ⏱️  延迟: ${result.latency}ms`);
      console.log(`  📊 Top-1 相似度: ${result.top1Similarity.toFixed(3)}`);
      console.log(`  📊 Top-5 平均相似度: ${result.top5Similarity.toFixed(3)}`);
      console.log(`  ✅ 有相关结果: ${result.hasRelevantResult ? '是' : '否'}`);
      console.log(`  ✅ Top-1 相关: ${result.relevantAtTop1 ? '是' : '否'}`);
      console.log(`  ✅ Top-5 相关: ${result.relevantAtTop5 ? '是' : '否'}`);
      
      if (result.results.length > 0) {
        console.log(`  📄 检索结果 (前3个):`);
        result.results.slice(0, 3).forEach((r, idx) => {
          console.log(`    ${idx + 1}. [相似度: ${r.similarity.toFixed(3)}] ${r.content.substring(0, 100)}...`);
        });
      }
      
      // 延迟以避免API限流
      if (i < queries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  // 生成统计报告
  console.log('\n\n📊 测试统计报告');
  console.log('='.repeat(80));
  
  const totalQueries = results.length;
  const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / totalQueries;
  const avgTop1Similarity = results.reduce((sum, r) => sum + r.top1Similarity, 0) / totalQueries;
  const avgTop5Similarity = results.reduce((sum, r) => sum + r.top5Similarity, 0) / totalQueries;
  const recallAt1 = results.filter(r => r.relevantAtTop1).length / totalQueries;
  const recallAt5 = results.filter(r => r.relevantAtTop5).length / totalQueries;
  const precisionAt1 = results.filter(r => r.relevantAtTop1).length / results.filter(r => r.results.length > 0).length;
  const precisionAt5 = results.filter(r => r.relevantAtTop5).length / results.filter(r => r.results.length >= 5).length;
  
  console.log(`总查询数: ${totalQueries}`);
  console.log(`平均延迟: ${avgLatency.toFixed(0)}ms`);
  console.log(`平均Top-1相似度: ${avgTop1Similarity.toFixed(3)}`);
  console.log(`平均Top-5相似度: ${avgTop5Similarity.toFixed(3)}`);
  console.log(`\n召回率 (Recall):`);
  console.log(`  Recall@1: ${(recallAt1 * 100).toFixed(1)}%`);
  console.log(`  Recall@5: ${(recallAt5 * 100).toFixed(1)}%`);
  console.log(`\n精确率 (Precision):`);
  console.log(`  Precision@1: ${(precisionAt1 * 100).toFixed(1)}%`);
  console.log(`  Precision@5: ${(precisionAt5 * 100).toFixed(1)}%`);
  
  // 按类别统计
  console.log(`\n按类别统计:`);
  for (const [category, queries] of Object.entries(queriesByCategory)) {
    const categoryResults = results.filter(r => r.category === category);
    const categoryRecallAt1 = categoryResults.filter(r => r.relevantAtTop1).length / categoryResults.length;
    const categoryRecallAt5 = categoryResults.filter(r => r.relevantAtTop5).length / categoryResults.length;
    const categoryAvgSimilarity = categoryResults.reduce((sum, r) => sum + r.top1Similarity, 0) / categoryResults.length;
    
    console.log(`\n  ${category}:`);
    console.log(`    查询数: ${categoryResults.length}`);
    console.log(`    平均相似度: ${categoryAvgSimilarity.toFixed(3)}`);
    console.log(`    Recall@1: ${(categoryRecallAt1 * 100).toFixed(1)}%`);
    console.log(`    Recall@5: ${(categoryRecallAt5 * 100).toFixed(1)}%`);
  }
  
  // 评估结果
  console.log(`\n\n✅ 评估结果`);
  console.log('='.repeat(80));
  
  const successCriteria = {
    recallAt1: recallAt1 >= 0.7,
    recallAt5: recallAt5 >= 0.85,
    avgSimilarity: avgTop1Similarity >= 0.6,
  };
  
  console.log(`Recall@1 >= 70%: ${successCriteria.recallAt1 ? '✅' : '❌'} (${(recallAt1 * 100).toFixed(1)}%)`);
  console.log(`Recall@5 >= 85%: ${successCriteria.recallAt5 ? '✅' : '❌'} (${(recallAt5 * 100).toFixed(1)}%)`);
  console.log(`平均相似度 >= 0.6: ${successCriteria.avgSimilarity ? '✅' : '❌'} (${avgTop1Similarity.toFixed(3)})`);
  
  const allPassed = Object.values(successCriteria).every(v => v);
  console.log(`\n总体评估: ${allPassed ? '✅ 通过' : '⚠️  需要优化'}`);
  
  await prisma.$disconnect();
}

runTests().catch(console.error);
