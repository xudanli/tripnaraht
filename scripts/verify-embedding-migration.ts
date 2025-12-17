// scripts/verify-embedding-migration.ts
/**
 * 验证 embedding 字段迁移是否成功
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyMigration() {
  try {
    console.log('验证 embedding 字段迁移...\n');

    // 1. 检查 pgvector 扩展
    const extension = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector';
    `;
    
    if (extension.length > 0) {
      console.log('✅ pgvector 扩展已安装');
    } else {
      console.log('❌ pgvector 扩展未安装');
      return;
    }

    // 2. 检查 embedding 字段
    const columns = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Place' AND column_name = 'embedding';
    `;

    if (columns.length > 0) {
      console.log(`✅ embedding 字段已添加 (类型: ${columns[0].data_type})`);
    } else {
      console.log('❌ embedding 字段未找到');
      return;
    }

    // 3. 检查索引
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Place' AND indexname LIKE '%embedding%';
    `;

    if (indexes.length > 0) {
      console.log(`✅ embedding 索引已创建: ${indexes.map(i => i.indexname).join(', ')}`);
    } else {
      console.log('⚠️  embedding 索引未创建（如果数据量 < 100 条，这是正常的）');
    }

    // 4. 检查现有数据
    const placeCount = await prisma.place.count();
    const placesWithEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL;
    `;

    console.log(`\n数据统计:`);
    console.log(`  - 总地点数: ${placeCount}`);
    console.log(`  - 已有 embedding 的地点: ${placesWithEmbedding[0]?.count || 0}`);

    console.log('\n✅ 迁移验证完成！');
  } catch (error: any) {
    console.error('❌ 验证失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();

