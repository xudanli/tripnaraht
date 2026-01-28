#!/usr/bin/env ts-node
/**
 * 迁移 Chunk 表的 embedding：1536维 → 1024维
 * 
 * 用法:
 *   npm run script:migrate-chunk-embeddings
 *   或
 *   npx tsx scripts/migrate-chunk-embeddings.ts
 * 
 * 参数:
 *   --dry-run    预览模式（不实际更新）
 *   --limit=N    限制迁移数量（用于测试）
 *   --country=IS 只迁移指定国家的数据（可选）
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';

const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://101.37.210.241:8001';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '100', 10);

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const countryCodeArg = args.find(arg => arg.startsWith('--country='));
const countryCode = countryCodeArg ? countryCodeArg.split('=')[1] : undefined;

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
 * 使用 Python AI Service 生成 BGE-M3 embedding
 */
async function generateBGE3Embedding(text: string): Promise<number[]> {
  const response = await httpClient.post('/api/v1/embeddings', {
    texts: [text],
    model: 'bge-m3',
    return_sparse: false,
  });
  
  return response.data.embeddings[0].dense;
}

/**
 * 更新单个 Chunk 的 embedding
 */
async function updateChunkEmbedding(
  prisma: PrismaClient,
  chunkId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!content || content.trim().length === 0) {
      return { success: false, error: '内容为空' };
    }

    // 生成 BGE-M3 embedding
    const embedding = await generateBGE3Embedding(content);
    
    // 检查是否为零向量
    const isZeroVector = embedding.every(v => v === 0);
    if (isZeroVector) {
      return { success: false, error: 'embedding 生成失败（零向量）' };
    }

    if (isDryRun) {
      return { success: true };
    }

    // 更新数据库
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // 检查是否有临时列
    const tempColumnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chunks' AND column_name = 'embedding_new'
      ) as exists
    `;
    
    if (tempColumnExists[0]?.exists) {
      // 使用临时列
      await prisma.$executeRawUnsafe(
        `UPDATE chunks SET embedding_new = $1::vector(1024) WHERE id = $2::uuid`,
        embeddingStr,
        chunkId
      );
    } else {
      // 直接更新主列（先清空再插入）
      await prisma.$executeRawUnsafe(
        `UPDATE chunks SET embedding = NULL WHERE id = $1::uuid`,
        chunkId
      );
      await prisma.$executeRawUnsafe(
        `UPDATE chunks SET embedding = $1::vector(1024) WHERE id = $2::uuid`,
        embeddingStr,
        chunkId
      );
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * 批量迁移
 */
async function migrateChunkEmbeddings() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🚀 Chunk 表 Embedding 迁移工具: OpenAI (1536维) → BGE-M3 (1024维)');
    console.log('='.repeat(60));
    
    if (countryCode) {
      console.log(`🌍 目标国家: ${countryCode}\n`);
    }
    
    if (isDryRun) {
      console.log('⚠️  DRY RUN 模式：只预览，不实际更新数据库\n');
    }
    
    if (limit) {
      console.log(`📌 限制迁移数量: ${limit} 条\n`);
    }

    // 1. 检查当前维度分布
    console.log('📊 检查当前 embedding 维度分布...\n');
    const dimensionStats = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
      SELECT 
        vector_dims(embedding) as dim,
        COUNT(*) as count
      FROM chunks
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
    
    console.log('当前维度分布:');
    if (dimensionStats.length === 0) {
      console.log('  （无 embedding 数据）');
    } else {
      dimensionStats.forEach(stat => {
        console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
      });
    }
    console.log();

    // 2. 检查数据库列定义
    console.log('🔍 检查数据库列定义...\n');
    const sampleChunk = await prisma.$queryRaw<Array<{ dim: number | null }>>`
      SELECT vector_dims(embedding) as dim
      FROM chunks
      WHERE embedding IS NOT NULL
      LIMIT 1
    `;
    
    const actualDim = sampleChunk[0]?.dim;
    
    if (actualDim === 1536) {
      console.log(`   ℹ️  当前列是 vector(1536)，将使用临时列方案\n`);
      
      // 检查是否已有临时列
      const tempColumnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'chunks' AND column_name = 'embedding_new'
        ) as exists
      `;
      
      if (!tempColumnExists[0]?.exists && !isDryRun) {
        console.log('   创建临时列 embedding_new (1024维)...');
        await prisma.$executeRaw`
          ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_new vector(1024)
        `;
        console.log('   ✅ 临时列已创建\n');
      } else if (tempColumnExists[0]?.exists) {
        console.log('   ✅ 临时列已存在\n');
      }
    } else if (actualDim === 1024) {
      console.log('   ✅ 列定义正确 (vector(1024))\n');
    } else {
      console.log(`   ℹ️  当前维度: ${actualDim || '未知'}\n`);
    }

    // 3. 获取需要迁移的记录
    console.log('🔍 查找需要迁移的记录...\n');
    
    // 使用 Prisma 查询，避免列名问题
    const whereClause: any = {
      OR: [
        { embedding: null },
        // 1536维的记录需要通过原始 SQL 查询
      ],
    };
    
    // 先查询所有需要迁移的记录（使用原始 SQL）
    let sqlQuery = `
      SELECT 
        id,
        chunk_id as "chunkId",
        content,
        type,
        category
      FROM chunks
      WHERE embedding IS NULL OR vector_dims(embedding) = 1536
    `;
    
    // 如果指定了国家，添加过滤条件
    if (countryCode) {
      sqlQuery = `
        SELECT 
          c.id,
          c.chunk_id as "chunkId",
          c.content,
          c.type,
          c.category
        FROM chunks c
        LEFT JOIN knowledge_files k ON k.id = c.file_id
        WHERE (c.embedding IS NULL OR vector_dims(c.embedding) = 1536)
          AND (
            k.metadata->>'countryCode' = '${countryCode}'
            OR c.category = '${countryCode}'
            OR c.content ILIKE '%${countryCode === 'IS' ? '冰岛' : ''}%'
            OR c.content ILIKE '%${countryCode === 'IS' ? 'Iceland' : ''}%'
          )
      `;
    }
    
    sqlQuery += ` ORDER BY id`;
    
    if (limit) {
      sqlQuery += ` LIMIT ${limit}`;
    }
    
    const chunksToMigrate = await prisma.$queryRawUnsafe<Array<{
      id: string;
      chunkId: string;
      content: string;
      type: string;
      category: string | null;
    }>>(sqlQuery);

    const totalCount = chunksToMigrate.length;
    console.log(`找到 ${totalCount.toLocaleString()} 条需要迁移的记录\n`);

    if (totalCount === 0) {
      console.log('✅ 没有需要迁移的记录');
      return;
    }

    // 4. 确认迁移
    if (!isDryRun) {
      console.log('⚠️  警告: 这将重新生成所有 1536 维的 embedding');
      console.log('   按 Ctrl+C 取消，或等待 5 秒后继续...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 5. 批量迁移
    console.log('🚀 开始迁移...\n');
    
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ chunkId: string; error: string }> = [];

    for (let i = 0; i < chunksToMigrate.length; i += BATCH_SIZE) {
      const batch = chunksToMigrate.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalCount / BATCH_SIZE);

      console.log(`[${batchNum}/${totalBatches}] 处理批次 (${batch.length} 条记录)...`);

      for (const chunk of batch) {
        const result = await updateChunkEmbedding(prisma, chunk.id, chunk.content);
        
        if (result.success) {
          successCount++;
          process.stdout.write('.');
        } else {
          failedCount++;
          errors.push({
            chunkId: chunk.chunkId,
            error: result.error || 'Unknown error',
          });
          process.stdout.write('F');
        }
      }

      console.log(` ✅ (成功: ${successCount}, 失败: ${failedCount})`);

      // 批次间延迟
      if (i + BATCH_SIZE < chunksToMigrate.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    // 6. 输出结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 迁移完成！');
    console.log(`   ✅ 成功: ${successCount.toLocaleString()} 条`);
    console.log(`   ❌ 失败: ${failedCount.toLocaleString()} 条`);
    console.log(`   📈 成功率: ${totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(2) : 0}%`);

    if (errors.length > 0) {
      console.log('\n❌ 失败记录（前10条）:');
      errors.slice(0, 10).forEach(err => {
        console.log(`   - ${err.chunkId}: ${err.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... 还有 ${errors.length - 10} 条失败记录`);
      }
    }

    // 7. 验证迁移结果
    if (!isDryRun) {
      console.log('\n🔍 验证迁移结果...\n');
      
      const tempColumnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'chunks' AND column_name = 'embedding_new'
        ) as exists
      `;
      
      if (tempColumnExists[0]?.exists) {
        const tempStats = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
          SELECT 
            vector_dims(embedding_new) as dim,
            COUNT(*) as count
          FROM chunks
          WHERE embedding_new IS NOT NULL
          GROUP BY dim
          ORDER BY dim
        `;
        
        console.log(`迁移到临时列 (embedding_new) 的数据:`);
        if (tempStats.length === 0) {
          console.log('  （无数据）');
        } else {
          tempStats.forEach(stat => {
            console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
          });
        }
        console.log('\n💡 下一步：将临时列数据合并到主列');
        console.log('   SQL: UPDATE chunks SET embedding = embedding_new WHERE embedding_new IS NOT NULL;');
        console.log('   SQL: ALTER TABLE chunks DROP COLUMN embedding_new;');
      } else {
        const newDimensionStats = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
          SELECT 
            vector_dims(embedding) as dim,
            COUNT(*) as count
          FROM chunks
          WHERE embedding IS NOT NULL
          GROUP BY dim
          ORDER BY dim
        `;
        
        console.log('迁移后维度分布:');
        if (newDimensionStats.length === 0) {
          console.log('  （无 embedding 数据）');
        } else {
          newDimensionStats.forEach(stat => {
            console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
          });
        }
      }
    }

  } catch (error: any) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateChunkEmbeddings().catch(console.error);
