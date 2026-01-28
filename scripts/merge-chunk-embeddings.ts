#!/usr/bin/env ts-node
/**
 * 将 Chunk 表的临时列 embedding_new 合并到主列 embedding
 * 
 * 用法:
 *   npm run script:merge-chunk-embeddings
 *   或
 *   npx tsx scripts/merge-chunk-embeddings.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function mergeChunkEmbeddings() {
  try {
    console.log('🔄 合并 Chunk 表的 embedding 数据');
    console.log('='.repeat(60));

    // 1. 检查临时列数据
    console.log('📊 检查临时列数据...\n');
    const tempStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM chunks
      WHERE embedding_new IS NOT NULL
    `;
    
    const tempCount = Number(tempStats[0]?.count || 0);
    console.log(`临时列中有 ${tempCount.toLocaleString()} 条记录\n`);

    if (tempCount === 0) {
      console.log('⚠️  临时列中没有数据，无需合并');
      return;
    }

    // 2. 检查主列维度
    console.log('🔍 检查主列维度...\n');
    const mainColumnDim = await prisma.$queryRaw<Array<{ dim: number | null }>>`
      SELECT vector_dims(embedding) as dim
      FROM chunks
      WHERE embedding IS NOT NULL
      LIMIT 1
    `;
    
    const currentDim = mainColumnDim[0]?.dim;
    console.log(`当前主列维度: ${currentDim || 'NULL'}\n`);

    if (currentDim === 1536) {
      console.log('⚠️  主列是 vector(1536)，需要先清空主列\n');
      
      // 3. 清空主列
      console.log('🧹 清空主列 embedding...');
      const cleared = await prisma.$executeRaw`
        UPDATE chunks SET embedding = NULL WHERE embedding IS NOT NULL
      `;
      console.log(`✅ 已清空 ${cleared} 条记录的主列\n`);
    }

    // 4. 修改主列定义（如果需要）
    if (currentDim === 1536) {
      console.log('🔄 修改主列定义为 vector(1024)...');
      
      // 删除索引
      await prisma.$executeRaw`DROP INDEX IF EXISTS chunk_embedding_idx`;
      
      // 删除旧列
      await prisma.$executeRaw`ALTER TABLE chunks DROP COLUMN IF EXISTS embedding`;
      
      // 创建新列（1024维）
      await prisma.$executeRaw`ALTER TABLE chunks ADD COLUMN embedding vector(1024)`;
      
      console.log('✅ 主列已修改为 vector(1024)\n');
    }

    // 5. 将临时列数据复制到主列
    console.log('📋 将临时列数据复制到主列...');
    const merged = await prisma.$executeRaw`
      UPDATE chunks SET embedding = embedding_new WHERE embedding_new IS NOT NULL
    `;
    console.log(`✅ 已合并 ${merged} 条记录\n`);

    // 6. 创建索引
    console.log('📊 创建向量索引...');
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS chunk_embedding_idx ON chunks 
      USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 10)
    `;
    console.log('✅ 索引已创建\n');

    // 7. 删除临时列
    console.log('🗑️  删除临时列...');
    await prisma.$executeRaw`ALTER TABLE chunks DROP COLUMN IF EXISTS embedding_new`;
    console.log('✅ 临时列已删除\n');

    // 8. 验证结果
    console.log('🔍 验证合并结果...\n');
    const finalStats = await prisma.$queryRaw<Array<{ dim: number; count: bigint }>>`
      SELECT 
        vector_dims(embedding) as dim,
        COUNT(*) as count
      FROM chunks
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
    
    console.log('最终维度分布:');
    if (finalStats.length === 0) {
      console.log('  （无 embedding 数据）');
    } else {
      finalStats.forEach(stat => {
        console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
      });
    }

    console.log('\n✅ 合并完成！');

  } catch (error: any) {
    console.error('\n❌ 合并失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

mergeChunkEmbeddings().catch(console.error);
