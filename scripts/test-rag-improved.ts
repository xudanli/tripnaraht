#!/usr/bin/env tsx
/**
 * 改进的RAG检索测试脚本
 * 修复相似度计算问题，优化检索相关性
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

// 提取查询关键词（中英文）
function extractKeywords(query: string): string[] {
  const keywords: Set<string> = new Set();
  
  // 中英文关键词映射
  const keywordMap: Record<string, string[]> = {
    '朝圣': ['pilgrimage', 'camino', 'santiago'],
    '极光': ['aurora', 'northern lights'],
    '潜水': ['diving', 'snorkel', 'underwater'],
    '徒步': ['trek', 'hike', 'trail', 'walking'],
    '勃朗峰': ['mont blanc', 'tmb'],
    '科科斯': ['cocos'],
    '亚当峰': ['adams peak', 'adam'],
  };
  
  // 提取中文关键词
  Object.keys(keywordMap).forEach(chinese => {
    if (query.includes(chinese)) {
      keywords.add(chinese);
      keywordMap[chinese].forEach(en => keywords.add(en));
    }
  });
  
  // 提取英文单词
  const englishWords = query.match(/[a-zA-Z]+/g);
  if (englishWords) {
    englishWords.forEach(word => {
      if (word.length > 2) {
        keywords.add(word.toLowerCase());
      }
    });
  }
  
  return Array.from(keywords);
}

async function testHybridRetrieval(query: string, description: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 测试: ${description}`);
  console.log(`📝 查询: "${query}"`);
  console.log('='.repeat(80));

  try {
    // 1. 生成向量
    const response = await httpClient.post('/api/v1/embeddings', {
      texts: [query],
      model: 'bge-m3',
      return_sparse: false,
    });
    
    const embedding = response.data.embeddings[0].dense || response.data.embeddings[0];
    const embeddingStr = `[${embedding.join(',')}]`;

    // 2. 提取关键词
    const keywords = extractKeywords(query);
    console.log(`\n🔑 提取关键词: ${keywords.join(', ')}`);

    // 3. Dense检索（向量相似度）
    const denseResults = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      filename: string;
      filepath: string;
      category: string;
      type: string;
      section: string | null;
      content_preview: string;
      similarity: number;
      is_markdown: boolean;
    }>>(
      `
      SELECT 
        c.chunk_id,
        kf.filename,
        kf.filepath,
        kf.category,
        c.type,
        c.section,
        LEFT(c.content, 200) as content_preview,
        CAST(1 - (c.embedding <=> $1::vector) AS FLOAT) as similarity,
        kf.filename LIKE '%.md' as is_markdown
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT 10
      `,
      embeddingStr
    );

    // 4. Sparse检索（关键词匹配）
    const keywordConditions = keywords.map((kw, idx) => 
      `(LOWER(kf.filename) LIKE LOWER($${idx + 2}) OR LOWER(kf.filepath) LIKE LOWER($${idx + 2}) OR EXISTS (
        SELECT 1 FROM unnest(c.keywords) as kw WHERE LOWER(kw) LIKE LOWER($${idx + 2})
      ) OR LOWER(c.content) LIKE LOWER($${idx + 2}))`
    ).join(' OR ');

    const sparseResults = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      filename: string;
      filepath: string;
      category: string;
      type: string;
      section: string | null;
      content_preview: string;
      keyword_score: number;
      is_markdown: boolean;
    }>>(
      `
      SELECT 
        c.chunk_id,
        kf.filename,
        kf.filepath,
        kf.category,
        c.type,
        c.section,
        LEFT(c.content, 200) as content_preview,
        (
          SELECT COUNT(*) 
          FROM unnest(c.keywords) as kw 
          WHERE ${keywords.map((_, idx) => `LOWER(kw) LIKE LOWER($${idx + 2})`).join(' OR ')}
        ) + 
        CASE WHEN LOWER(kf.filename) LIKE ANY(ARRAY[${keywords.map((_, idx) => `LOWER($${idx + 2})`).join(',')}]) THEN 2 ELSE 0 END +
        CASE WHEN LOWER(kf.filepath) LIKE ANY(ARRAY[${keywords.map((_, idx) => `LOWER($${idx + 2})`).join(',')}]) THEN 1 ELSE 0 END
        as keyword_score,
        kf.filename LIKE '%.md' as is_markdown
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE ${keywordConditions}
      ORDER BY keyword_score DESC
      LIMIT 10
      `,
      embeddingStr,
      ...keywords.map(kw => `%${kw}%`)
    );

    // 5. 合并结果（Reciprocal Rank Fusion）
    const denseMap = new Map<string, { rank: number; data: typeof denseResults[0] }>();
    denseResults.forEach((r, idx) => {
      denseMap.set(r.chunk_id, { rank: idx + 1, data: r });
    });

    const sparseMap = new Map<string, { rank: number; data: typeof sparseResults[0] }>();
    sparseResults.forEach((r, idx) => {
      sparseMap.set(r.chunk_id, { rank: idx + 1, data: r });
    });

    // RRF分数计算: score = 1 / (k + rank)
    const k = 60; // RRF参数
    const combinedScores = new Map<string, {
      chunk_id: string;
      rrfScore: number;
      denseScore: number;
      sparseScore: number;
      data: any;
    }>();

    denseMap.forEach(({ rank, data }) => {
      const rrfScore = 1 / (k + rank);
      combinedScores.set(data.chunk_id, {
        chunk_id: data.chunk_id,
        rrfScore,
        denseScore: data.similarity,
        sparseScore: 0,
        data,
      });
    });

    sparseMap.forEach(({ rank, data }) => {
      const existing = combinedScores.get(data.chunk_id);
      const rrfScore = 1 / (k + rank);
      if (existing) {
        existing.rrfScore += rrfScore;
        existing.sparseScore = data.keyword_score;
      } else {
        combinedScores.set(data.chunk_id, {
          chunk_id: data.chunk_id,
          rrfScore,
          denseScore: 0,
          sparseScore: data.keyword_score,
          data,
        });
      }
    });

    // 6. 排序并取Top-5
    const finalResults = Array.from(combinedScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, 5);

    console.log(`\n📊 Dense检索: ${denseResults.length}个结果`);
    console.log(`📊 Sparse检索: ${sparseResults.length}个结果`);
    console.log(`📊 合并后Top-5结果:\n`);

    finalResults.forEach((r, i) => {
      const fileType = r.data.is_markdown ? '📄 Markdown' : '📋 JSON';
      console.log(`${i + 1}. ${fileType}`);
      console.log(`   RRF分数: ${r.rrfScore.toFixed(4)}`);
      console.log(`   向量相似度: ${(r.denseScore * 100).toFixed(2)}%`);
      console.log(`   关键词匹配: ${r.sparseScore}`);
      console.log(`   文件: ${r.data.filename}`);
      console.log(`   路径: ${r.data.filepath}`);
      console.log(`   类别: ${r.data.category} | 类型: ${r.data.type}`);
      if (r.data.section) console.log(`   章节: ${r.data.section}`);
      console.log(`   内容: ${r.data.content_preview.replace(/\n/g, ' ').substring(0, 150)}...`);
      console.log('');
    });

    // 统计
    const mdCount = finalResults.filter(r => r.data.is_markdown).length;
    console.log(`📊 Markdown文件占比: ${mdCount}/${finalResults.length} (${((mdCount / finalResults.length) * 100).toFixed(1)}%)`);

    return finalResults;
  } catch (error: any) {
    console.error(`❌ 测试失败: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return [];
  }
}

async function main() {
  const scenarios = [
    {
      query: '圣地亚哥朝圣之路怎么走',
      description: '朝圣路线查询 - 应该找到camino-de-santiago.md',
    },
    {
      query: '在哪里可以看到极光',
      description: '极光观赏查询 - 应该找到aurora相关Markdown文件',
    },
    {
      query: '科科斯岛潜水',
      description: '潜水地点查询 - 应该找到cocos-island-diving.md',
    },
    {
      query: '环勃朗峰徒步路线',
      description: '徒步路线查询 - 应该找到tmb-tour-mont-blanc.md',
    },
    {
      query: '亚当峰朝圣',
      description: '文化景点查询 - 应该找到adams-peak.md',
    },
  ];

  console.log('\n' + '='.repeat(80));
  console.log('🧪 改进的RAG检索测试（混合检索 + 相似度修复）');
  console.log('='.repeat(80));

  for (const scenario of scenarios) {
    await testHybridRetrieval(scenario.query, scenario.description);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await prisma.$disconnect();
  console.log('\n' + '='.repeat(80));
  console.log('✅ 测试完成');
  console.log('='.repeat(80));
}

main().catch(console.error);
