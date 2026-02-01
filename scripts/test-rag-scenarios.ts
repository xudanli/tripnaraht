#!/usr/bin/env tsx
/**
 * RAG场景测试脚本
 * 测试不同场景下的检索效果，验证Markdown文件索引质量
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

interface TestScenario {
  name: string;
  query: string;
  expectedCategory?: string;
  expectedType?: string;
  expectedKeywords?: string[];
  description: string;
}

const testScenarios: TestScenario[] = [
  {
    name: '场景1: 朝圣路线查询',
    query: '圣地亚哥朝圣之路怎么走',
    expectedCategory: 'culture',
    expectedType: 'routes',
    expectedKeywords: ['camino', 'santiago', 'pilgrimage', '朝圣'],
    description: '测试文化遗产类Markdown文件的检索效果',
  },
  {
    name: '场景2: 登山装备查询',
    query: '8000米山峰需要什么装备',
    expectedCategory: 'practical_guides',
    expectedType: 'general',
    expectedKeywords: ['equipment', 'gear', 'mountaineering', '8000m'],
    description: '测试实用指南类Markdown文件的检索效果',
  },
  {
    name: '场景3: 极光观赏查询',
    query: '在哪里可以看到极光',
    expectedCategory: 'general',
    expectedType: 'general',
    expectedKeywords: ['aurora', 'northern lights', '极光'],
    description: '测试自然现象类Markdown文件的检索效果',
  },
  {
    name: '场景4: 潜水地点查询',
    query: '科科斯岛潜水怎么样',
    expectedCategory: 'practical_guides',
    expectedType: 'general',
    expectedKeywords: ['diving', 'cocos', 'underwater'],
    description: '测试潜水相关Markdown文件的检索效果',
  },
  {
    name: '场景5: 徒步路线查询',
    query: '环勃朗峰徒步路线',
    expectedCategory: 'routes',
    expectedType: 'routes',
    expectedKeywords: ['tmb', 'tour mont blanc', 'trek', 'hike'],
    description: '测试路线类Markdown文件的检索效果',
  },
  {
    name: '场景6: 文化景点查询',
    query: '亚当峰朝圣',
    expectedCategory: 'culture',
    expectedType: 'pois',
    expectedKeywords: ['adams peak', 'pilgrimage', 'sri lanka'],
    description: '测试文化景点类Markdown文件的检索效果',
  },
  {
    name: '场景7: 火山相关查询',
    query: '冰岛火山活动情况',
    expectedCategory: 'general',
    expectedType: 'general',
    expectedKeywords: ['volcano', 'iceland', 'eruption'],
    description: '测试自然现象类Markdown文件的检索效果',
  },
  {
    name: '场景8: 长距离徒步查询',
    query: '新西兰大徒步路线',
    expectedCategory: 'routes',
    expectedType: 'routes',
    expectedKeywords: ['new zealand', 'great walks', 'trek'],
    description: '测试长距离徒步路线类Markdown文件的检索效果',
  },
];

async function testVectorSearch(scenario: TestScenario, limit: number = 5) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 ${scenario.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📝 查询: "${scenario.query}"`);
  console.log(`📖 描述: ${scenario.description}`);
  console.log(`🎯 预期类别: ${scenario.expectedCategory || '无'}`);
  console.log(`🎯 预期类型: ${scenario.expectedType || '无'}`);

  try {
    // 1. 生成查询向量
    const startTime = Date.now();
    const queryEmbedding = await embeddingService.generateEmbedding(scenario.query);
    const embeddingTime = Date.now() - startTime;
    console.log(`\n⏱️  向量生成耗时: ${embeddingTime}ms`);

    // 2. 执行向量相似度搜索
    const searchStartTime = Date.now();
    const results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      section: string | null;
      credibility_score: number;
      keywords: string[];
      similarity: number;
      filename: string;
      filepath: string;
      category: string;
      is_markdown: boolean;
    }>>(
      `
      SELECT 
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.section,
        c.credibility_score,
        c.keywords,
        1 - (c.embedding <=> $1::vector) as similarity,
        kf.filename,
        kf.filepath,
        kf.category,
        kf.filename LIKE '%.md' as is_markdown
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
      `,
      JSON.stringify(queryEmbedding),
      limit
    );
    const searchTime = Date.now() - searchStartTime;

    console.log(`\n⏱️  检索耗时: ${searchTime}ms`);
    console.log(`✅ 找到 ${results.length} 个相关结果\n`);

    // 3. 分析结果
    let matchCount = 0;
    let markdownCount = 0;
    let avgSimilarity = 0;

    results.forEach((result, index) => {
      const similarity = result.similarity;
      avgSimilarity += similarity;

      // 检查是否符合预期
      let matchStatus = '';
      if (scenario.expectedCategory && result.category === scenario.expectedCategory) {
        matchStatus += '✅类别匹配 ';
        matchCount++;
      }
      if (scenario.expectedType && result.type === scenario.expectedType) {
        matchStatus += '✅类型匹配 ';
      }
      if (result.is_markdown) {
        markdownCount++;
        matchStatus += '📄Markdown ';
      }

      console.log(`\n📄 结果 ${index + 1}:`);
      console.log(`   相似度: ${(similarity * 100).toFixed(2)}% ${matchStatus}`);
      console.log(`   文件: ${result.filename}`);
      console.log(`   路径: ${result.filepath}`);
      console.log(`   类别: ${result.category}`);
      console.log(`   类型: ${result.type}`);
      console.log(`   章节: ${result.section || '无'}`);
      console.log(`   可信度: ${result.credibility_score}`);
      console.log(`   关键词: ${result.keywords?.slice(0, 5).join(', ') || '无'}`);
      console.log(`   内容预览: ${result.content.substring(0, 150).replace(/\n/g, ' ')}...`);
    });

    avgSimilarity = avgSimilarity / results.length;

    // 4. 评估结果
    console.log(`\n📊 结果评估:`);
    console.log(`   平均相似度: ${(avgSimilarity * 100).toFixed(2)}%`);
    console.log(`   Markdown文件数: ${markdownCount}/${results.length}`);
    console.log(`   类别匹配数: ${matchCount}/${results.length}`);
    console.log(`   检索质量: ${avgSimilarity > 0.7 ? '✅优秀' : avgSimilarity > 0.5 ? '⚠️良好' : '❌需改进'}`);

    return {
      scenario: scenario.name,
      query: scenario.query,
      results: results.length,
      avgSimilarity,
      markdownCount,
      matchCount,
      embeddingTime,
      searchTime,
    };
  } catch (error: any) {
    console.error(`\n❌ 搜索失败:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return null;
  }
}

async function testHybridSearch(scenario: TestScenario) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 混合检索测试: ${scenario.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📝 查询: "${scenario.query}"`);

  try {
    // 生成查询向量
    const queryEmbedding = await embeddingService.generateEmbedding(scenario.query);
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;

    // 提取关键词（简单版本）
    const keywords = scenario.query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 5);

    // Dense检索（向量相似度）
    const denseResults = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      similarity: number;
      filename: string;
    }>>(
      `
      SELECT 
        c.chunk_id,
        1 - (c.embedding <=> $1::vector) as similarity,
        kf.filename
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT 10
      `,
      queryEmbeddingStr
    );

    // Sparse检索（关键词匹配）
    const sparseResults = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      match_count: number;
      filename: string;
    }>>(
      `
      SELECT 
        c.chunk_id,
        (
          SELECT COUNT(*) 
          FROM unnest(c.keywords) as kw 
          WHERE kw ILIKE ANY(ARRAY[${keywords.map(k => `'%${k}%'`).join(',')}])
        ) as match_count,
        kf.filename
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.keywords IS NOT NULL
        AND array_length(c.keywords, 1) > 0
      ORDER BY match_count DESC
      LIMIT 10
      `,
    );

    console.log(`\n📊 Dense检索结果: ${denseResults.length}个`);
    console.log(`📊 Sparse检索结果: ${sparseResults.length}个`);

    // 合并结果（简单版本）
    const combined = new Map<string, { dense: number; sparse: number; filename: string }>();
    
    denseResults.forEach((r, idx) => {
      combined.set(r.chunk_id, {
        dense: r.similarity,
        sparse: 0,
        filename: r.filename,
      });
    });

    sparseResults.forEach((r) => {
      const existing = combined.get(r.chunk_id);
      if (existing) {
        existing.sparse = r.match_count / 10; // 归一化
      } else {
        combined.set(r.chunk_id, {
          dense: 0,
          sparse: r.match_count / 10,
          filename: r.filename,
        });
      }
    });

    // 计算混合分数
    const hybridResults = Array.from(combined.entries())
      .map(([chunkId, scores]) => ({
        chunkId,
        hybridScore: scores.dense * 0.6 + scores.sparse * 0.4,
        dense: scores.dense,
        sparse: scores.sparse,
        filename: scores.filename,
      }))
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, 5);

    console.log(`\n🔀 混合检索Top-5:`);
    hybridResults.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.filename}`);
      console.log(`      Hybrid: ${(r.hybridScore * 100).toFixed(2)}% | Dense: ${(r.dense * 100).toFixed(2)}% | Sparse: ${(r.sparse * 100).toFixed(2)}%`);
    });

  } catch (error: any) {
    console.error(`\n❌ 混合检索失败:`, error.message);
  }
}

async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 RAG场景测试');
    console.log('='.repeat(80));
    console.log(`📅 测试时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`📊 测试场景数: ${testScenarios.length}`);

    // 检查数据库状态
    const totalFiles = await prisma.knowledgeFile.count();
    const totalChunks = await prisma.chunk.count();
    const mdFiles = await prisma.knowledgeFile.count({
      where: { filename: { endsWith: '.md' } },
    });
    const mdChunks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count 
       FROM chunks c
       INNER JOIN knowledge_files kf ON c.file_id = kf.id
       WHERE kf.filename LIKE '%.md'`
    );

    console.log(`\n📊 数据库状态:`);
    console.log(`   总文件数: ${totalFiles}`);
    console.log(`   总Chunks数: ${totalChunks}`);
    console.log(`   Markdown文件数: ${mdFiles}`);
    console.log(`   Markdown Chunks数: ${mdChunks[0]?.count || 0}`);

    // 执行测试场景
    const results: any[] = [];

    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n\n${'🔄'.repeat(40)}`);
      console.log(`测试进度: ${i + 1}/${testScenarios.length}`);
      
      const result = await testVectorSearch(scenario, 5);
      if (result) {
        results.push(result);
      }

      // 延迟避免API限流
      if (i < testScenarios.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 测试混合检索（选择一个场景）
    if (testScenarios.length > 0) {
      await testHybridSearch(testScenarios[0]);
    }

    // 总结报告
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📊 测试总结报告');
    console.log('='.repeat(80));

    if (results.length > 0) {
      const avgSimilarity = results.reduce((sum, r) => sum + r.avgSimilarity, 0) / results.length;
      const totalMarkdownCount = results.reduce((sum, r) => sum + r.markdownCount, 0);
      const totalMatchCount = results.reduce((sum, r) => sum + r.matchCount, 0);
      const avgEmbeddingTime = results.reduce((sum, r) => sum + r.embeddingTime, 0) / results.length;
      const avgSearchTime = results.reduce((sum, r) => sum + r.searchTime, 0) / results.length;

      console.log(`\n✅ 成功测试场景: ${results.length}/${testScenarios.length}`);
      console.log(`📈 平均相似度: ${(avgSimilarity * 100).toFixed(2)}%`);
      console.log(`📄 Markdown文件命中率: ${((totalMarkdownCount / (results.length * 5)) * 100).toFixed(1)}%`);
      console.log(`🎯 类别匹配率: ${((totalMatchCount / (results.length * 5)) * 100).toFixed(1)}%`);
      console.log(`⏱️  平均向量生成时间: ${avgEmbeddingTime.toFixed(0)}ms`);
      console.log(`⏱️  平均检索时间: ${avgSearchTime.toFixed(0)}ms`);

      console.log(`\n📋 各场景详情:`);
      results.forEach((r, idx) => {
        console.log(`\n   ${idx + 1}. ${r.scenario}`);
        console.log(`      查询: "${r.query}"`);
        console.log(`      结果数: ${r.results}`);
        console.log(`      平均相似度: ${(r.avgSimilarity * 100).toFixed(2)}%`);
        console.log(`      Markdown文件: ${r.markdownCount}/${r.results}`);
        console.log(`      类别匹配: ${r.matchCount}/${r.results}`);
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ 测试完成');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
