// scripts/find-ground-truth-chunks.ts
/**
 * 查找测试集的 Ground Truth Chunk UUIDs
 * 
 * 使用方法：
 *   npx ts-node scripts/find-ground-truth-chunks.ts
 * 
 * 功能：
 * 1. 读取测试集文件
 * 2. 对每个查询执行向量检索，找到最相关的 chunks
 * 3. 显示结果，让用户确认哪些是正确答案
 * 4. 更新测试集文件
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

const prisma = new PrismaClient();

/**
 * 生成 embedding
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const proxyUrl = process.env.HTTPS_PROXY;

  let client: any;
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    client = axios.create({
      baseURL: baseUrl,
      timeout: 60000,
      httpsAgent: agent,
      httpAgent: agent,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  } else {
    client = axios.create({
      baseURL: baseUrl,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  const response = await client.post('/embeddings', {
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data.data[0].embedding;
}

/**
 * 提取关键词（简单实现）
 */
function extractKeywords(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
    .trim();

  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .filter((w) => !isStopWord(w));

  return words;
}

/**
 * 判断是否为停用词
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
    '怎么', '哪些', '什么', '时候', '需要',
  ]);
  return stopWords.has(word.toLowerCase());
}

interface TestCase {
  id: string;
  query: string;
  groundTruthChunkIds: string[];
  tags?: string[];
  notes?: string;
}

interface Testset {
  version: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  testCases: TestCase[];
}

async function findGroundTruthChunks() {
  try {
    console.log('🔍 查找 Ground Truth Chunk UUIDs...\n');

    // 1. 读取测试集文件
    const testsetPath = path.resolve(process.cwd(), 'e2e-cases', 'rag-eval-testset.json');
    console.log(`📖 读取测试集: ${testsetPath}\n`);

    let testset: Testset;
    try {
      const testsetContent = await fs.readFile(testsetPath, 'utf-8');
      testset = JSON.parse(testsetContent);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('⚠️  测试集文件不存在，创建默认文件...\n');
        testset = {
          version: 1,
          name: 'iceland-kb-smoke',
          description: 'Seed testset for Chunk retrieval evaluation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          testCases: [
            {
              id: 'is-car-insurance-001',
              query: '冰岛租车保险怎么选？有哪些必买的险种？',
              groundTruthChunkIds: [],
              tags: ['iceland', 'car-rental', 'insurance'],
            },
            {
              id: 'is-f-road-001',
              query: '冰岛F路什么时候开放？需要什么车型？',
              groundTruthChunkIds: [],
              tags: ['iceland', 'f-road'],
            },
          ],
        };
      } else {
        throw error;
      }
    }

    console.log(`找到 ${testset.testCases.length} 个测试用例\n`);

    // 2. 检查数据库中的 chunks
    const totalChunks = await prisma.chunk.count();
    const chunksWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`
    );
    console.log(`📊 数据库状态:`);
    console.log(`  - 总分块数: ${totalChunks}`);
    console.log(`  - 有向量的分块: ${Number(chunksWithEmbedding[0]?.count || 0)}\n`);

    if (totalChunks === 0) {
      console.log('⚠️  数据库中没有 chunks，请先索引知识库文件\n');
      return;
    }

    // 3. 获取所有 chunks 的简要信息（用于匹配）
    const allChunks = await prisma.chunk.findMany({
      select: {
        id: true,
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        file: {
          select: {
            filename: true,
            category: true,
          },
        },
      },
    });

    console.log(`📚 加载了 ${allChunks.length} 个 chunks 用于匹配\n`);

    // 4. 对每个测试用例，查找相关的 chunks
    const updatedTestCases: TestCase[] = [];

    for (const testCase of testset.testCases) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📝 测试用例: ${testCase.id}`);
      console.log(`查询: "${testCase.query}"`);
      console.log(`${'='.repeat(80)}\n`);

      // 使用关键词匹配找到可能相关的 chunks
      const queryKeywords = extractKeywords(testCase.query);
      console.log(`提取的关键词: ${queryKeywords.join(', ')}\n`);

      const relevantChunks = allChunks.filter((chunk) => {
        const contentLower = chunk.content.toLowerCase();
        const keywordsLower = chunk.keywords.map((k) => k.toLowerCase());
        const queryLower = testCase.query.toLowerCase();

        // 检查是否包含查询关键词
        const hasKeywords = queryKeywords.some(
          (kw) =>
            contentLower.includes(kw.toLowerCase()) ||
            keywordsLower.some((k) => k.includes(kw.toLowerCase()))
        );

        // 检查是否包含查询中的关键短语
        const hasQueryPhrase = queryLower.split(/\s+/).some((word) => {
          if (word.length < 2) return false;
          return contentLower.includes(word);
        });

        return hasKeywords || hasQueryPhrase;
      });

      // 按相关性排序（简单启发式：匹配的关键词越多越相关）
      const scoredChunks = relevantChunks.map((chunk) => {
        const contentLower = chunk.content.toLowerCase();
        const keywordsLower = chunk.keywords.map((k) => k.toLowerCase());
        let score = 0;

        queryKeywords.forEach((kw) => {
          if (contentLower.includes(kw.toLowerCase())) score += 2;
          if (keywordsLower.some((k) => k.includes(kw.toLowerCase()))) score += 3;
        });

        // 检查特定关键词（保险、F路等）
        if (testCase.query.includes('保险') && contentLower.includes('保险')) score += 5;
        if (testCase.query.includes('F路') && (contentLower.includes('f路') || contentLower.includes('f-road'))) score += 5;
        if (testCase.query.includes('租车') && contentLower.includes('租车')) score += 5;
        if (testCase.query.includes('车型') && contentLower.includes('车型')) score += 3;
        if (testCase.query.includes('开放') && contentLower.includes('开放')) score += 3;

        return { chunk, score };
      });

      scoredChunks.sort((a, b) => b.score - a.score);

      // 显示 Top-5 候选
      console.log(`找到 ${scoredChunks.length} 个可能相关的 chunks（显示 Top-5）:\n`);

      const topCandidates = scoredChunks.slice(0, 5);
      topCandidates.forEach(({ chunk, score }, index) => {
        console.log(`${index + 1}. [分数: ${score}] ${chunk.chunkId}`);
        console.log(`   ID: ${chunk.id}`);
        console.log(`   文件: ${chunk.file.filename} (${chunk.file.category})`);
        console.log(`   类型: ${chunk.type}`);
        console.log(`   关键词: ${chunk.keywords.slice(0, 5).join(', ')}`);
        console.log(`   内容预览: ${chunk.content.substring(0, 150)}...`);
        console.log('');
      });

      // 自动选择分数 >= 5 的 chunks 作为 ground truth
      const selectedChunkIds = topCandidates
        .filter(({ score }) => score >= 5)
        .map(({ chunk }) => chunk.id);

      if (selectedChunkIds.length > 0) {
        console.log(`✅ 自动选择 ${selectedChunkIds.length} 个 chunks 作为 Ground Truth:`);
        selectedChunkIds.forEach((id) => console.log(`   - ${id}`));
        console.log('');
      } else if (topCandidates.length > 0) {
        // 如果没有高分chunks，至少选择Top-1
        const topId = topCandidates[0].chunk.id;
        selectedChunkIds.push(topId);
        console.log(`⚠️  未找到高分chunks，选择Top-1作为候选: ${topId}`);
        console.log(`   请手动检查并更新测试集文件\n`);
      } else {
        console.log(`⚠️  未找到相关 chunks，请手动检查\n`);
      }

      updatedTestCases.push({
        ...testCase,
        groundTruthChunkIds: selectedChunkIds.length > 0 ? selectedChunkIds : testCase.groundTruthChunkIds,
      });
    }

    // 5. 更新测试集文件
    const updatedTestset: Testset = {
      ...testset,
      updatedAt: new Date().toISOString(),
      testCases: updatedTestCases,
    };

    // 备份原文件（如果存在）
    try {
      const backupPath = testsetPath + '.backup';
      await fs.copyFile(testsetPath, backupPath);
      console.log(`\n💾 已备份原文件到: ${backupPath}`);
    } catch (error: any) {
      // 文件不存在，跳过备份
    }

    // 确保目录存在
    const dir = path.dirname(testsetPath);
    await fs.mkdir(dir, { recursive: true });

    // 保存更新后的文件
    await fs.writeFile(testsetPath, JSON.stringify(updatedTestset, null, 2), 'utf-8');
    console.log(`✅ 已更新测试集文件: ${testsetPath}`);
    console.log(`\n📊 更新摘要:`);
    updatedTestCases.forEach((tc) => {
      console.log(`   ${tc.id}: ${tc.groundTruthChunkIds.length} 个 Ground Truth chunks`);
      if (tc.groundTruthChunkIds.length > 0) {
        tc.groundTruthChunkIds.forEach((id) => console.log(`      - ${id}`));
      }
    });
  } catch (error: any) {
    console.error(`❌ 错误: ${error.message}`, error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}


// 运行脚本
findGroundTruthChunks();
