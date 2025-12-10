// 为City表添加adcode字段
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addAdcodeColumn() {
  console.log('🔧 为City表添加adcode字段...\n');

  try {
    // 添加adcode列
    await prisma.$executeRaw`
      ALTER TABLE "City" 
      ADD COLUMN IF NOT EXISTS adcode VARCHAR(10)
    `;

    console.log('✅ 已添加adcode字段');

    // 添加索引
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "City_adcode_idx" ON "City"(adcode)
    `;

    console.log('✅ 已添加adcode索引');
    console.log('\n✅ 完成！现在可以运行 update-city-adcode.ts 来填充数据了。');
  } catch (error: any) {
    // 如果字段已存在，忽略错误
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('ℹ️  adcode字段已存在，跳过创建');
    } else {
      console.error('❌ 添加字段失败:', error.message);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addAdcodeColumn();
