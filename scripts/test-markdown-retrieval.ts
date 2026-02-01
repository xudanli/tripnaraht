#!/usr/bin/env tsx
/**
 * Markdown文件检索测试
 * 测试几个场景，验证Markdown文件索引效果
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

async function testQuery(query: string, description: string) {
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

    // 2. 检索（优先Markdown文件）
    const results = await prisma.$queryRawUnsafe<Array<{
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
        kf.filename,
        kf.filepath,
        kf.category,
        c.type,
        c.section,
        LEFT(c.content, 200) as content_preview,
        1 - (c.embedding <=> $1::vector) as similarity,
        kf.filename LIKE '%.md' as is_markdown
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY 
        (kf.filename LIKE '%.md') DESC,
        c.embedding <=> $1::vector
      LIMIT 5
      `,
      embeddingStr
    );

    console.log(`\n✅ 找到 ${results.length} 个结果\n`);

    results.forEach((r, i) => {
      const fileType = r.is_markdown ? '📄 Markdown' : '📋 JSON';
      console.log(`${i + 1}. ${fileType} | 相似度: ${(r.similarity * 100).toFixed(2)}%`);
      console.log(`   文件: ${r.filename}`);
      console.log(`   路径: ${r.filepath}`);
      console.log(`   类别: ${r.category} | 类型: ${r.type}`);
      if (r.section) console.log(`   章节: ${r.section}`);
      console.log(`   内容: ${r.content_preview.replace(/\n/g, ' ')}...`);
      console.log('');
    });

    // 统计
    const mdCount = results.filter(r => r.is_markdown).length;
    console.log(`📊 Markdown文件占比: ${mdCount}/${results.length} (${((mdCount / results.length) * 100).toFixed(1)}%)`);

    return results;
  } catch (error: any) {
    console.error(`❌ 测试失败: ${error.message}`);
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
  console.log('🧪 Markdown文件检索测试');
  console.log('='.repeat(80));

  for (const scenario of scenarios) {
    await testQuery(scenario.query, scenario.description);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await prisma.$disconnect();
  console.log('\n' + '='.repeat(80));
  console.log('✅ 测试完成');
  console.log('='.repeat(80));
}

main().catch(console.error);
