#!/usr/bin/env tsx
/**
 * 修复chunks数为0的文件
 * 重新生成chunks并保存
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Embedding服务
class EmbeddingService {
  private httpClient: any;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      proxy: false,
      httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
    });
  }

  async generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      try {
        const response = await this.httpClient.post('/api/v1/embeddings', {
          texts: batch,
          model: 'bge-m3',
          return_sparse: false,
        });
        if (response.data && response.data.embeddings) {
          const embeddings = response.data.embeddings.map((e: any) => e.dense || e);
          results.push(...embeddings);
        }
      } catch (error: any) {
        console.error(`  ⚠️  批次 ${i}-${i + batch.length} 向量化失败:`, error.message);
        batch.forEach(() => {
          const zeroVector = new Array(1024).fill(0);
          results.push(zeroVector);
        });
      }
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    return results;
  }
}

const embeddingService = new EmbeddingService();

// 简化的chunk生成函数
function generateChunks(content: any, filename: string): Array<{
  chunkId: string;
  content: string;
  type: string;
  section?: string;
  credibilityScore: number;
  keywords: string[];
  metadata?: any;
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    type: string;
    section?: string;
    credibilityScore: number;
    keywords: string[];
    metadata?: any;
  }> = [];

  const baseFilename = filename.replace('.json', '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const text = JSON.stringify(content, null, 2);

  // 如果内容较小，直接作为一个chunk
  if (text.length < 10000) {
    chunks.push({
      chunkId: `${baseFilename}_full`,
      content: text,
      type: 'full',
      credibilityScore: 0.9,
      keywords: ['general'],
      metadata: { source: filename },
    });
  } else {
    // 分块处理
    const chunkSize = 5000;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunkText = text.substring(i, i + chunkSize);
      chunks.push({
        chunkId: `${baseFilename}_chunk_${Math.floor(i / chunkSize)}`,
        content: chunkText,
        type: 'content',
        section: `part_${Math.floor(i / chunkSize)}`,
        credibilityScore: 0.9,
        keywords: ['general'],
        metadata: { source: filename, chunkIndex: Math.floor(i / chunkSize) },
      });
    }
  }

  return chunks;
}

async function fixEmptyChunks() {
  try {
    console.log('🔧 开始修复chunks数为0的文件...\n');

    // 查找chunks数为0的文件
    const filesWithoutChunks = await prisma.knowledgeFile.findMany({
      where: {
        chunks: {
          none: {},
        },
        NOT: {
          filepath: { contains: 'official-sources' },
        },
      },
    });

    console.log(`📊 找到 ${filesWithoutChunks.length} 个chunks数为0的文件\n`);

    let successCount = 0;
    let failCount = 0;

    for (const file of filesWithoutChunks) {
      try {
        console.log(`📝 处理: ${file.filepath}`);

        // 检查文件是否存在
        if (!fs.existsSync(file.filepath)) {
          console.log(`  ⚠️  文件不存在，跳过`);
          continue;
        }

        // 读取文件
        const content = JSON.parse(fs.readFileSync(file.filepath, 'utf-8'));

        // 生成chunks
        const chunks = generateChunks(content, file.filename);
        console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

        if (chunks.length === 0) {
          console.log(`  ⚠️  未生成chunks，跳过`);
          continue;
        }

        // 生成向量
        console.log(`  🔢 开始向量化...`);
        const texts = chunks.map(c => c.content);
        const embeddings = await embeddingService.generateEmbeddingsBatch(texts, 10);
        console.log(`  ✅ 向量化完成`);

        // 保存chunks
        console.log(`  💾 保存chunks到数据库...`);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];
          const embeddingStr = `[${embedding.join(',')}]`;
          const keywordsArray = `{${chunk.keywords.map(k => `"${k.replace(/"/g, '\\"')}"`).join(',')}}`;

          await prisma.$executeRawUnsafe(
            `
            INSERT INTO chunks (
              id, chunk_id, content, embedding, type, section, credibility_score, keywords, file_id, metadata, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3::vector(1024),
              $4,
              $5,
              $6,
              $7::text[],
              $8::uuid,
              $9::jsonb,
              NOW(),
              NOW()
            )
          `,
            chunk.chunkId,
            chunk.content,
            embeddingStr,
            chunk.type,
            chunk.section || null,
            chunk.credibilityScore,
            keywordsArray,
            file.id,
            chunk.metadata ? JSON.stringify(chunk.metadata) : null
          );
        }

        console.log(`  ✅ 完成: ${file.filename}`);
        successCount++;

        // 延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error: any) {
        console.error(`  ❌ 处理失败: ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 修复完成！`);
    console.log(`   成功: ${successCount} 个文件`);
    console.log(`   失败: ${failCount} 个文件`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ 修复失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEmptyChunks().catch(console.error);
