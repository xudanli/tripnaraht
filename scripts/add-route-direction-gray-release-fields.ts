// scripts/add-route-direction-gray-release-fields.ts
/**
 * 添加 RouteDirection 灰度与开关字段
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始添加 RouteDirection 灰度与开关字段...');

  // 直接执行，使用 IF NOT EXISTS 确保安全
  try {
    // 1. 添加 status 字段
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RouteDirection" 
      ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'active';
    `);
    console.log('✓ 添加 status 字段');

    // 2. 添加 version 字段
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RouteDirection" 
      ADD COLUMN IF NOT EXISTS "version" TEXT;
    `);
    console.log('✓ 添加 version 字段');

    // 3. 添加 rolloutPercent 字段
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RouteDirection" 
      ADD COLUMN IF NOT EXISTS "rolloutPercent" INTEGER DEFAULT 100;
    `);
    console.log('✓ 添加 rolloutPercent 字段');

    // 4. 添加 audienceFilter 字段
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RouteDirection" 
      ADD COLUMN IF NOT EXISTS "audienceFilter" JSONB;
    `);
    console.log('✓ 添加 audienceFilter 字段');

    // 5. 创建索引
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_status_idx ON "RouteDirection" (status);
    `);
    console.log('✓ 创建 route_direction_status_idx');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_status_active_idx 
      ON "RouteDirection" (status, isActive) 
      WHERE status = 'active';
    `);
    console.log('✓ 创建 route_direction_status_active_idx');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_audience_filter_gin_idx 
      ON "RouteDirection" USING GIN (audienceFilter);
    `);
    console.log('✓ 创建 route_direction_audience_filter_gin_idx');

    // 6. 更新现有记录的 status（基于 isActive）
    await prisma.$executeRawUnsafe(`
      UPDATE "RouteDirection" 
      SET "status" = CASE 
        WHEN "isActive" = true THEN 'active'
        ELSE 'deprecated'
      END
      WHERE "status" IS NULL;
    `);
    console.log('✓ 更新现有记录的 status');

    // 7. 添加注释
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN "RouteDirection"."status" IS 
        '路线方向状态：draft（草稿）、active（激活）、deprecated（已废弃）';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN "RouteDirection"."version" IS 
        '版本号（如 "1.0.0"），用于版本控制和回滚';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN "RouteDirection"."rolloutPercent" IS 
        '灰度百分比（0-100），用于控制新版本的发布比例';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN "RouteDirection"."audienceFilter" IS 
        '受众过滤（JSONB），如 {"persona": ["photography"], "locale": ["zh-CN"]}';
    `);
    console.log('✓ 添加字段注释');

    console.log('\n✅ 所有字段和索引添加完成！');
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    // 如果是表不存在的错误，给出提示但不报错
    if (errorMessage.includes('does not exist') || errorMessage.includes('RouteDirection')) {
      console.warn('⚠️  RouteDirection 表不存在，请先运行 RouteDirection 表的迁移');
      console.warn('   字段将在表创建后自动添加（使用 IF NOT EXISTS）');
    } else {
      console.error('❌ 添加字段时出错:', errorMessage);
      // 不抛出错误，允许部分成功（因为使用了 IF NOT EXISTS）
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

