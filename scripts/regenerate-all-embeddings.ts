#!/usr/bin/env tsx
/**
 * 重新生成所有chunks的向量
 * 修复之前Python AI Service返回的异常向量（全0.1）
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://101.37.240.9:18001';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '200', 10);

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

const httpClient = axios.create({
  baseURL: PYTHON_AI_SERVICE_URL,
  timeout: 30000,
  proxy: false,
  httpsAgent: new https.Agent({
    keepAlive: true,
    family: 4,
  }),
});

/**
 * 检查向量是否异常（全0.1或其他异常值）
 */
function isAbnormalVector(embedding: number[]): boolean {
  if (!embedding || embedding.length === 0) return true;
  
  // 检查是否所有值都相同（异常）
  const uniqueValues = new Set(embedding.map(v => v.toFixed(4)));
  if (uniqueValues.size < 10) {
    return true; // 唯一值少于10个，可能是异常向量
  }
  
  // 检查值范围是否异常
  const min = Math.min(...embedding);
  const max = Math.max(...embedding);
  const range = max - min;
  
  if (range < 0.01) {
    return true; // 值范围太小，可能是异常向量
  }
  
  return false;
}

/**
 * 使用 Python AI Service 生成 BGE-M3 embedding
 */
async function generateBGE3Embedding(text: string): Promise<number[]> {
  const response = await httpClient.post('/api/v1/embeddings', {
    texts: [text],
    model: 'bge-m3',
    return_sparse: false,
  });
  
  return response.data.embeddings[0].dense || response.data.embeddings[0];
}

/**
 * 更新单个 Chunk 的 embedding
 */
async function regenerateChunkEmbedding(
  chunkId: string,
  content: string
): Promise<{ success: boolean; error?: string; embedding?: number[] }> {
  try {
    if (!content || content.trim().length === 0) {
      return { success: false, error: '内容为空' };
    }

    // 生成 BGE-M3 embedding
    const embedding = await generateBGE3Embedding(content);
    
    // 检查向量质量
    if (embedding.length !== 1024) {
      return { success: false, error: `向量维度错误: ${embedding.length} (期望1024)` };
    }
    
    // 检查是否为零向量
    const isZeroVector = embedding.every(v => v === 0);
    if (isZeroVector) {
      return { success: false, error: 'embedding 生成失败（零向量）' };
    }
    
    // 检查是否异常向量
    if (isAbnormalVector(embedding)) {
      return { success: false, error: 'embedding 生成失败（异常向量）' };
    }

    if (isDryRun) {
      return { success: true, embedding };
    }

    // 更新数据库
    const embeddingStr = `[${embedding.join(',')}]`;
    
    await prisma.$executeRawUnsafe(
      `UPDATE chunks SET embedding = $1::vector(1024) WHERE id = $2::uuid`,
      embeddingStr,
      chunkId
    );

    return { success: true, embedding };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * 批量重新生成
 */
async function regenerateAllEmbeddings() {
  try {
    console.log('🚀 重新生成所有chunks的向量');
    console.log('='.repeat(80));
    console.log(`📍 Python AI Service: ${PYTHON_AI_SERVICE_URL}`);
    console.log(`📦 批次大小: ${BATCH_SIZE}`);
    console.log(`⏱️  延迟: ${DELAY_MS}ms`);
    
    if (isDryRun) {
      console.log('⚠️  DRY RUN 模式：只预览，不实际更新数据库\n');
    }
    
    if (limit) {
      console.log(`📌 限制处理数量: ${limit} 条\n`);
    }

    // 1. 获取所有需要重新生成的chunks
    console.log('\n📊 查找需要重新生成向量的chunks...\n');
    
    const chunks = await prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      filename: string;
      embedding_text: string | null;
    }>>(
      `
      SELECT 
        c.id,
        c.chunk_id,
        c.content,
        kf.filename,
        c.embedding::text as embedding_text
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
        AND c.content IS NOT NULL
        AND LENGTH(c.content) > 10
      ORDER BY c.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
      `
    );

    console.log(`✅ 找到 ${chunks.length} 个chunks需要处理\n`);

    if (chunks.length === 0) {
      console.log('✅ 没有需要处理的chunks');
      return;
    }

    // 2. 检查异常向量数量
    let abnormalCount = 0;
    chunks.forEach(chunk => {
      if (chunk.embedding_text) {
        try {
          const embedding = JSON.parse(chunk.embedding_text);
          if (isAbnormalVector(embedding)) {
            abnormalCount++;
          }
        } catch {
          abnormalCount++;
        }
      }
    });

    console.log(`📊 统计:`);
    console.log(`   总chunks: ${chunks.length}`);
    console.log(`   异常向量: ${abnormalCount} (${((abnormalCount / chunks.length) * 100).toFixed(1)}%)`);
    console.log(`   正常向量: ${chunks.length - abnormalCount} (${(((chunks.length - abnormalCount) / chunks.length) * 100).toFixed(1)}%)\n`);

    // 3. 批量处理
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    console.log('🔄 开始重新生成向量...\n');

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      
      console.log(`\n📦 处理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length})`);

      for (const chunk of batch) {
        try {
          // 检查当前向量是否异常
          let needsRegeneration = true;
          if (chunk.embedding_text) {
            try {
              const currentEmbedding = JSON.parse(chunk.embedding_text);
              if (!isAbnormalVector(currentEmbedding)) {
                needsRegeneration = false;
                skipCount++;
                console.log(`   ⏭️  跳过: ${chunk.filename} (${chunk.chunk_id}) - 向量正常`);
                continue;
              }
            } catch {
              // 解析失败，需要重新生成
            }
          }

          const result = await regenerateChunkEmbedding(chunk.id, chunk.content);
          
          if (result.success) {
            successCount++;
            const uniqueValues = new Set(result.embedding!.map(v => v.toFixed(4)));
            console.log(`   ✅ ${chunk.filename} (${chunk.chunk_id}) - 唯一值: ${uniqueValues.size}`);
          } else {
            failCount++;
            console.log(`   ❌ ${chunk.filename} (${chunk.chunk_id}) - ${result.error}`);
          }

          // 延迟避免API限流
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        } catch (error: any) {
          failCount++;
          console.log(`   ❌ ${chunk.filename} (${chunk.chunk_id}) - ${error.message}`);
        }
      }

      // 批次间延迟
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS * 2));
      }
    }

    // 4. 总结
    console.log('\n' + '='.repeat(80));
    console.log('📊 处理完成统计');
    console.log('='.repeat(80));
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${failCount} 个`);
    console.log(`⏭️  跳过: ${skipCount} 个 (向量已正常)`);
    console.log(`📦 总计: ${chunks.length} 个`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('\n❌ 处理失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

regenerateAllEmbeddings().catch(console.error);
