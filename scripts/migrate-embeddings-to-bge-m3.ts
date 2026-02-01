#!/usr/bin/env ts-node
/**
 * 将数据库中的 OpenAI embedding (1536维) 迁移到 BGE-M3 (1024维)
 * 
 * ⚠️  重要：迁移前必须先修改数据库列定义！
 * 
 * 步骤：
 *   1. 备份数据库
 *   2. 执行 SQL: ALTER TABLE "Place" DROP COLUMN embedding; ALTER TABLE "Place" ADD COLUMN embedding vector(1024);
 *   3. 运行此脚本重新生成 embedding
 * 
 * 用法:
 *   npm run script:migrate-embeddings
 *   或
 *   npx tsx scripts/migrate-embeddings-to-bge-m3.ts
 * 
 * 参数:
 *   --dry-run    预览模式（不实际更新）
 *   --limit=N    限制迁移数量（用于测试）
 * 
 * 注意:
 *   - 迁移前建议备份数据库
 *   - 确保数据库列已修改为 vector(1024)
 *   - 可以分批迁移，使用 --limit 参数限制数量
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';

const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '100', 10);

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const countryCodeArg = args.find(arg => arg.startsWith('--country='));
const countryCode = countryCodeArg ? countryCodeArg.split('=')[1] : 'IS'; // 默认只处理冰岛

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
 * 构建搜索文本（与 generate-place-embeddings.ts 保持一致）
 */
function buildSearchText(place: {
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  description?: string | null;
}): string {
  const parts: string[] = [];
  
  if (place.nameCN) parts.push(place.nameCN);
  if (place.nameEN) parts.push(place.nameEN);
  if (place.address) parts.push(place.address);
  if (place.description) parts.push(place.description);
  
  return parts.join(' ');
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
  
  return response.data.embeddings[0].dense;
}

/**
 * 更新单个 Place 的 embedding
 */
async function updatePlaceEmbedding(
  prisma: PrismaClient,
  placeId: number,
  place: {
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    description?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const searchText = buildSearchText(place);
    
    if (!searchText || searchText.trim().length === 0) {
      return { success: false, error: '没有可用的文本内容' };
    }

    // 生成 BGE-M3 embedding
    const embedding = await generateBGE3Embedding(searchText);
    
    // 检查是否为零向量
    const isZeroVector = embedding.every(v => v === 0);
    if (isZeroVector) {
      return { success: false, error: 'embedding 生成失败（零向量）' };
    }

    if (isDryRun) {
      // Dry run 模式：只验证，不更新
      return { success: true };
    }

    // 更新数据库
    // 策略：检查是否有临时列，如果有则使用临时列；否则尝试直接更新
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // 检查是否有临时列
    const tempColumnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Place' AND column_name = 'embedding_new'
      ) as exists
    `;
    
    if (tempColumnExists[0]?.exists) {
      // 使用临时列（当主列是 vector(1536) 时）
      await prisma.$executeRaw`
        UPDATE "Place" SET embedding_new = ${embeddingStr}::vector(1024) WHERE id = ${placeId}
      `;
    } else {
      // 尝试直接更新主列（如果列已经是 vector(1024)）
      // 先清空旧值，再插入新值
      await prisma.$executeRaw`
        UPDATE "Place" SET embedding = NULL WHERE id = ${placeId}
      `;
      await prisma.$executeRaw`
        UPDATE "Place" SET embedding = ${embeddingStr}::vector(1024) WHERE id = ${placeId}
      `;
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
async function migrateEmbeddings() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🚀 Embedding 迁移工具: OpenAI (1536维) → BGE-M3 (1024维)');
    console.log('='.repeat(60));
    console.log(`🌍 目标国家: ${countryCode}`);
    
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
      FROM "Place"
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
    
    console.log('当前维度分布:');
    dimensionStats.forEach(stat => {
      console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
    });
    console.log();

    // 2. 检查数据库列定义（仅针对目标国家）
    console.log('🔍 检查数据库列定义...\n');
    const columnInfo = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
    }>>`
      SELECT 
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_name = 'Place' AND column_name = 'embedding'
    `;
    
    if (columnInfo.length === 0) {
      console.log('⚠️  警告: Place 表中没有 embedding 列');
      console.log('   请先执行: ALTER TABLE "Place" ADD COLUMN embedding vector(1024);\n');
    } else {
      const colType = columnInfo[0].udt_name;
      console.log(`   列类型: ${colType}`);
      
      // 对于只迁移特定国家的情况，列可能是 vector(1536)，我们需要使用临时列方案
      // 检查实际列定义（通过查询一条记录）
      const samplePlace = await prisma.$queryRaw<Array<{ dim: number | null }>>`
        SELECT vector_dims(embedding) as dim
        FROM "Place"
        WHERE embedding IS NOT NULL
        LIMIT 1
      `;
      
      const actualDim = samplePlace[0]?.dim;
      
      if (actualDim === 1536) {
        console.log(`   ℹ️  当前列是 vector(1536)，将使用临时列方案迁移 ${countryCode} 的数据\n`);
        
        // 检查是否已有临时列
        const tempColumnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Place' AND column_name = 'embedding_new'
          ) as exists
        `;
        
        if (!tempColumnExists[0]?.exists && !isDryRun) {
          console.log('   创建临时列 embedding_new (1024维)...');
          await prisma.$executeRaw`
            ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS embedding_new vector(1024)
          `;
          console.log('   ✅ 临时列已创建\n');
        } else if (tempColumnExists[0]?.exists) {
          console.log('   ✅ 临时列已存在\n');
        }
      } else if (actualDim === 1024) {
        console.log('   ✅ 列定义正确 (vector(1024))\n');
      } else {
        console.log(`   ℹ️  当前维度: ${actualDim || '未知'}，将尝试直接更新\n`);
      }
    }

    // 3. 获取需要迁移的记录（仅指定国家，无 embedding 或 1536维）
    console.log(`🔍 查找需要迁移的记录（国家: ${countryCode}）...\n`);
    let query = `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.address,
        p.description
      FROM "Place" p
      LEFT JOIN "City" c ON c.id = p."cityId"
      WHERE (c."countryCode" = $1 OR p.metadata->>'countryCode' = $1)
        AND (p.embedding IS NULL OR vector_dims(p.embedding) = 1536)
      ORDER BY p.id
    `;
    
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    
    const placesToMigrate = await prisma.$queryRawUnsafe<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      description: string | null;
    }>>(query, countryCode);

    const totalCount = placesToMigrate.length;
    console.log(`找到 ${totalCount.toLocaleString()} 条需要迁移的记录（${countryCode}）\n`);

    if (totalCount === 0) {
      console.log('✅ 没有需要迁移的记录，所有 embedding 已经是 1024 维');
      return;
    }

    // 3. 确认迁移
    if (!isDryRun) {
      console.log('⚠️  警告: 这将重新生成所有 1536 维的 embedding');
      console.log('   建议先备份数据库\n');
      console.log('   按 Ctrl+C 取消，或等待 5 秒后继续...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 4. 批量迁移
    console.log('🚀 开始迁移...\n');
    
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ placeId: number; name: string; error: string }> = [];

    for (let i = 0; i < placesToMigrate.length; i += BATCH_SIZE) {
      const batch = placesToMigrate.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalCount / BATCH_SIZE);

      console.log(`[${batchNum}/${totalBatches}] 处理批次 (${batch.length} 条记录)...`);

      for (const place of batch) {
        const result = await updatePlaceEmbedding(prisma, place.id, place);
        
        if (result.success) {
          successCount++;
          process.stdout.write('.');
        } else {
          failedCount++;
          errors.push({
            placeId: place.id,
            name: place.nameCN,
            error: result.error || 'Unknown error',
          });
          process.stdout.write('F');
        }
      }

      console.log(` ✅ (成功: ${successCount}, 失败: ${failedCount})`);

      // 批次间延迟
      if (i + BATCH_SIZE < placesToMigrate.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    // 5. 输出结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 迁移完成！');
    console.log(`   ✅ 成功: ${successCount.toLocaleString()} 条`);
    console.log(`   ❌ 失败: ${failedCount.toLocaleString()} 条`);
    console.log(`   📈 成功率: ${totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(2) : 0}%`);

    if (errors.length > 0) {
      console.log('\n❌ 失败记录（前10条）:');
      errors.slice(0, 10).forEach(err => {
        console.log(`   - ID ${err.placeId} (${err.name}): ${err.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... 还有 ${errors.length - 10} 条失败记录`);
      }
    }

    // 6. 验证迁移结果
    if (!isDryRun) {
      console.log('\n🔍 验证迁移结果...\n');
      
      // 检查临时列（如果使用）
      const tempColumnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Place' AND column_name = 'embedding_new'
        ) as exists
      `;
      
      if (tempColumnExists[0]?.exists) {
        const tempStats = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
          SELECT 
            vector_dims(embedding_new) as dim,
            COUNT(*) as count
          FROM "Place"
          WHERE embedding_new IS NOT NULL
          GROUP BY dim
          ORDER BY dim
        `;
        
        console.log(`迁移到临时列 (embedding_new) 的 ${countryCode} 数据:`);
        if (tempStats.length === 0) {
          console.log('  （无数据）');
        } else {
          tempStats.forEach(stat => {
            console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
          });
        }
        console.log('\n💡 下一步：将临时列数据合并到主列');
        console.log('   SQL: UPDATE "Place" SET embedding = embedding_new WHERE embedding_new IS NOT NULL;');
        console.log('   SQL: ALTER TABLE "Place" DROP COLUMN embedding_new;');
      } else {
        const newDimensionStats = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
          SELECT 
            vector_dims(embedding) as dim,
            COUNT(*) as count
          FROM "Place"
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

// 运行迁移
migrateEmbeddings().catch(console.error);
