#!/usr/bin/env tsx
/**
 * 测试RAG文档检索功能
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

async function testVectorSearch(query: string, limit: number = 5) {
  console.log(`\n🔍 测试查询: "${query}"`);
  console.log('='.repeat(60));

  try {
    // 1. 生成查询向量
    console.log('📊 生成查询向量...');
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    console.log(`✅ 向量生成成功，维度: ${queryEmbedding.length}`);

    // 2. 执行向量相似度搜索
    console.log('\n🔎 执行向量相似度搜索...');
    const results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      credibility_score: number;
      keywords: string[];
      similarity: number;
      filename: string;
      category: string;
    }>>(
      `
      SELECT 
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.credibility_score,
        c.keywords,
        1 - (c.embedding <=> $1::vector) as similarity,
        kf.filename,
        kf.category
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
      `,
      JSON.stringify(queryEmbedding),
      limit
    );

    console.log(`✅ 找到 ${results.length} 个相关结果\n`);

    // 3. 显示结果
    results.forEach((result, index) => {
      console.log(`\n📄 结果 ${index + 1}:`);
      console.log(`  相似度: ${(result.similarity * 100).toFixed(2)}%`);
      console.log(`  文件: ${result.filename}`);
      console.log(`  类别: ${result.category}`);
      console.log(`  类型: ${result.type}`);
      console.log(`  可信度: ${result.credibility_score}`);
      console.log(`  关键词: ${result.keywords?.slice(0, 5).join(', ') || '无'}`);
      console.log(`  内容预览: ${result.content.substring(0, 200)}...`);
    });

    return results;
  } catch (error: any) {
    console.error(`❌ 搜索失败:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return [];
  }
}

async function testDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 数据库状态检查');
  console.log('='.repeat(60));

  try {
    // 检查基本统计
    const totalFiles = await prisma.knowledgeFile.count();
    const totalChunks = await prisma.chunk.count();
    const chunksWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`
    );

    console.log(`\n总文件数: ${totalFiles}`);
    console.log(`总chunks数: ${totalChunks}`);
    console.log(`已向量化chunks: ${chunksWithEmbedding[0]?.count || 0}`);

    // 检查向量维度（使用PostgreSQL函数）
    const dimResult = await prisma.$queryRawUnsafe<Array<{ dim: number }>>(
      `SELECT array_length(embedding::text::float[], 1) as dim FROM chunks WHERE embedding IS NOT NULL LIMIT 1`
    ).catch(() => []);

    if (dimResult[0]?.dim) {
      console.log(`向量维度: ${dimResult[0].dim}维 ✅`);
    } else {
      // 尝试另一种方法
      const sampleChunk = await prisma.$queryRawUnsafe<Array<{ embedding_text: string }>>(
        `SELECT embedding::text as embedding_text FROM chunks WHERE embedding IS NOT NULL LIMIT 1`
      ).catch(() => []);

      if (sampleChunk[0]?.embedding_text) {
        const embeddingArray = JSON.parse(sampleChunk[0].embedding_text);
        console.log(`向量维度: ${embeddingArray.length}维 ✅`);
      } else {
        console.log(`向量维度: 无法读取 ⚠️`);
      }
    }

    // 按类别统计
    const byCategory = await prisma.$queryRawUnsafe<Array<{ category: string; count: bigint; chunks: bigint }>>(
      `SELECT 
        kf.category,
        COUNT(DISTINCT kf.id) as count,
        COUNT(c.id) as chunks
      FROM knowledge_files kf
      LEFT JOIN chunks c ON c.file_id = kf.id
      GROUP BY kf.category
      ORDER BY count DESC`
    );

    console.log(`\n按类别统计:`);
    byCategory.forEach(c => {
      console.log(`  ${c.category}: ${c.count}个文件, ${c.chunks}个chunks`);
    });

    // 检查样本数据
    const sampleChunks = await prisma.chunk.findMany({
      take: 3,
      include: {
        file: {
          select: {
            filename: true,
            category: true,
          },
        },
      },
    });

    console.log(`\n样本chunks:`);
    sampleChunks.forEach((chunk, i) => {
      console.log(`  ${i + 1}. [${chunk.file.category}] ${chunk.file.filename} - ${chunk.type}`);
    });

  } catch (error: any) {
    console.error(`❌ 数据库检查失败:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

async function main() {
  try {
    // 1. 检查数据库状态
    await testDatabase();

    // 2. 测试向量检索
    console.log('\n' + '='.repeat(60));
    console.log('🧪 向量检索测试');
    console.log('='.repeat(60));

    const testQueries = [
      '法罗群岛旅游攻略',
      '登山装备推荐',
      '8000米山峰攀登',
      '旅游安全注意事项',
      '景点推荐',
    ];

    for (const query of testQueries) {
      await testVectorSearch(query, 3);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟避免API限流
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成');
    console.log('='.repeat(60));

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
