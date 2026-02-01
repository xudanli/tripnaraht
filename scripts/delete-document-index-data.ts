#!/usr/bin/env tsx
/**
 * 删除document_index表的所有数据
 * 
 * 注意：
 * - document_index表已废弃，新系统使用chunks表
 * - 此操作不可逆，请确认后再执行
 * 
 * 使用方法:
 *   npx tsx scripts/delete-document-index-data.ts [--confirm]
 */

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const isConfirmed = args.includes('--confirm');

const prisma = new PrismaClient();

async function deleteDocumentIndexData() {
  console.log('🗑️  删除document_index表数据\n');
  console.log('='.repeat(80));

  try {
    // 1. 检查当前数据
    console.log('📊 步骤1: 检查当前数据...\n');
    
    const count = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count FROM document_index
    `;
    const totalCount = count[0].count;
    console.log(`当前记录数: ${totalCount}`);

    const withEmbedding = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM document_index
      WHERE embedding IS NOT NULL
    `;
    console.log(`有embedding的记录数: ${withEmbedding[0].count}`);

    if (totalCount === 0) {
      console.log('\n✅ document_index表已经是空的，无需删除');
      return;
    }

    // 2. 显示数据样本
    console.log('\n📋 步骤2: 数据样本（前3条）...\n');
    const samples = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      collection: string;
      source: string | null;
    }>>`
      SELECT id, title, collection, source
      FROM document_index
      ORDER BY created_at
      LIMIT 3
    `;
    
    samples.forEach((doc, idx) => {
      console.log(`  ${idx + 1}. ${doc.title} (${doc.collection})`);
      if (doc.source) {
        console.log(`     来源: ${doc.source}`);
      }
    });

    // 3. 确认删除
    if (!isConfirmed) {
      console.log('\n⚠️  警告: 此操作将删除所有document_index数据，不可逆！');
      console.log('💡 如需执行删除，请添加 --confirm 参数:');
      console.log('   npx tsx scripts/delete-document-index-data.ts --confirm');
      return;
    }

    console.log('\n📊 步骤3: 删除数据...\n');
    
    // 删除所有数据
    const deleted = await prisma.$executeRaw`TRUNCATE TABLE document_index`;
    console.log(`✅ 已删除 ${totalCount} 条记录`);

    // 4. 验证删除结果
    console.log('\n📊 步骤4: 验证删除结果...\n');
    const remaining = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count FROM document_index
    `;
    
    if (remaining[0].count === 0) {
      console.log('✅ 删除成功！document_index表现在是空的');
    } else {
      console.log(`⚠️  仍有 ${remaining[0].count} 条记录未删除`);
    }

    // 5. 可选：删除索引（如果存在）
    console.log('\n📊 步骤5: 清理索引...\n');
    try {
      await prisma.$executeRaw`DROP INDEX IF EXISTS document_index_embedding_idx`;
      await prisma.$executeRaw`DROP INDEX IF EXISTS document_index_embedding_hnsw_idx`;
      console.log('✅ 索引已删除');
    } catch (error: any) {
      console.log(`⚠️  删除索引时出错（可能不存在）: ${error.message}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ 删除完成！');
    console.log('\n💡 提示:');
    console.log('  - document_index表已清空');
    console.log('  - 新系统使用chunks表，推荐使用ChunkRetrievalService');
    console.log('  - 如需重新索引数据，请使用新系统（KnowledgeFile + Chunks）');

  } catch (error) {
    console.error('\n❌ 删除失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteDocumentIndexData().catch(console.error);
