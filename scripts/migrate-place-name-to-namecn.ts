// scripts/migrate-place-name-to-namecn.ts
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function migratePlaceName() {
  console.log('🚀 开始迁移 Place.name 到 nameCN...\n');

  try {
    // 1. 添加 nameCN 字段（如果不存在）
    console.log('步骤 1: 添加 nameCN 字段...');
    await prisma.$executeRaw`
      ALTER TABLE "Place" 
      ADD COLUMN IF NOT EXISTS "nameCN" TEXT;
    `;
    console.log('✅ nameCN 字段已添加\n');

    // 2. 将现有的 name 数据复制到 nameCN
    console.log('步骤 2: 复制 name 数据到 nameCN...');
    const result = await prisma.$executeRaw`
      UPDATE "Place"
      SET "nameCN" = "name"
      WHERE "nameCN" IS NULL;
    `;
    console.log(`✅ 已复制数据到 nameCN\n`);

    // 3. 检查是否有空值
    const nullCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE "nameCN" IS NULL;
    `;
    
    if (nullCount[0].count > 0) {
      console.log(`⚠️  警告: 仍有 ${nullCount[0].count} 条记录的 nameCN 为空`);
      console.log('   这些记录将使用空字符串作为默认值\n');
      
      // 使用空字符串作为默认值
      await prisma.$executeRaw`
        UPDATE "Place"
        SET "nameCN" = ''
        WHERE "nameCN" IS NULL;
      `;
    }

    // 4. 将 nameCN 设为 NOT NULL
    console.log('步骤 3: 将 nameCN 设为 NOT NULL...');
    await prisma.$executeRaw`
      ALTER TABLE "Place"
      ALTER COLUMN "nameCN" SET NOT NULL;
    `;
    console.log('✅ nameCN 已设为 NOT NULL\n');

    // 5. 删除旧的 name 字段
    console.log('步骤 4: 删除旧的 name 字段...');
    await prisma.$executeRaw`
      ALTER TABLE "Place"
      DROP COLUMN IF EXISTS "name";
    `;
    console.log('✅ 旧的 name 字段已删除\n');

    // 6. 验证迁移结果
    console.log('步骤 5: 验证迁移结果...');
    const sample = await prisma.$queryRaw<Array<{ id: number; nameCN: string; nameEN: string | null }>>`
      SELECT id, "nameCN", "nameEN"
      FROM "Place"
      LIMIT 5;
    `;
    
    console.log('样本数据:');
    sample.forEach((row) => {
      console.log(`  ID ${row.id}: nameCN="${row.nameCN}", nameEN=${row.nameEN || 'NULL'}`);
    });

    const totalCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Place";
    `;
    console.log(`\n✅ 迁移完成！总共 ${totalCount[0].count} 条记录`);

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migratePlaceName()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
