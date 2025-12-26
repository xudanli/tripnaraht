// scripts/ensure-route-direction-indexes.ts
/**
 * 确保 RouteDirection 相关索引存在
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始创建 RouteDirection 相关索引...');

  try {
    // 1. 为 RouteDirection.corridorGeom 创建 GiST 索引
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_corridor_geom_gist_idx 
      ON "RouteDirection" USING GIST (corridorGeom);
    `);
    console.log('✓ 创建 route_direction_corridor_geom_gist_idx');

    // 2. 确认 Place.location 的 GiST 索引存在
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS place_location_gist_idx 
      ON "Place" USING GIST (location);
    `);
    console.log('✓ 创建/确认 place_location_gist_idx');

    // 3. 为 RouteDirection 的常用查询字段创建复合索引
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_country_active_idx 
      ON "RouteDirection" (countryCode, isActive) 
      WHERE isActive = true;
    `);
    console.log('✓ 创建 route_direction_country_active_idx');

    // 4. 为 RouteDirection 的 tags 创建 GIN 索引
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_tags_gin_idx 
      ON "RouteDirection" USING GIN (tags);
    `);
    console.log('✓ 创建/确认 route_direction_tags_gin_idx');

    // 5. 为 RouteDirection 的 seasonality JSONB 字段创建 GIN 索引
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS route_direction_seasonality_gin_idx 
      ON "RouteDirection" USING GIN (seasonality);
    `);
    console.log('✓ 创建 route_direction_seasonality_gin_idx');

    // 添加注释
    await prisma.$executeRawUnsafe(`
      COMMENT ON INDEX route_direction_corridor_geom_gist_idx IS 
        'RouteDirection 走廊几何的 GiST 索引，用于加速 ST_DWithin 空间查询';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON INDEX place_location_gist_idx IS 
        'Place 位置的 GiST 索引，用于加速地理位置查询';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON INDEX route_direction_country_active_idx IS 
        'RouteDirection 国家+激活状态的复合索引，用于快速筛选激活的路线方向';
    `);

    console.log('\n✅ 所有索引创建完成！');
  } catch (error: any) {
    // 如果表不存在，给出提示
    if (error.message?.includes('does not exist') || error.message?.includes('RouteDirection')) {
      console.warn('⚠️  RouteDirection 表不存在，请先运行 RouteDirection 表的迁移');
      console.warn('   索引将在表创建后自动创建（使用 IF NOT EXISTS）');
    } else {
      console.error('❌ 创建索引时出错:', error.message);
      throw error;
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

