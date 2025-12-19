// scripts/diagnose-place-data.ts
/**
 * 诊断 Place 表的数据情况
 * 
 * 运行方式: npx tsx scripts/diagnose-place-data.ts
 */

import { PrismaClient } from '@prisma/client';

async function diagnosePlaceData() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 开始诊断 Place 表数据...\n');

    // 1. 检查 Place 总数和 cityId 填充情况
    const placeStats = await prisma.$queryRaw<Array<{
      total: bigint;
      with_cityid: bigint;
      without_cityid: bigint;
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT("cityId") as with_cityid,
        COUNT(*) - COUNT("cityId") as without_cityid
      FROM "Place"
    `;

    console.log('📊 Place 表统计:');
    console.log(`  - 总数: ${placeStats[0]?.total || 0}`);
    console.log(`  - 有 cityId: ${placeStats[0]?.with_cityid || 0}`);
    console.log(`  - 无 cityId: ${placeStats[0]?.without_cityid || 0}\n`);

    // 2. 检查北京的 Place 数量
    const beijingCities = await prisma.city.findMany({
      where: {
        OR: [
          { nameCN: '北京' },
          { nameCN: { contains: '北京' } },
          { name: 'Beijing' },
          { name: { contains: 'Beijing' } },
          { nameEN: 'Beijing' },
        ],
      },
      select: { id: true, nameCN: true, name: true, nameEN: true },
    });

    console.log('🏙️  北京相关的城市记录:');
    if (beijingCities.length === 0) {
      console.log('  ❌ 未找到北京的城市记录！');
    } else {
      for (const city of beijingCities) {
        console.log(`  - ID: ${city.id}, nameCN: ${city.nameCN}, name: ${city.name}, nameEN: ${city.nameEN}`);
        
        // 检查该城市的 Place 数量
        const beijingPlaces = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) as count 
          FROM "Place" 
          WHERE "cityId" = ${city.id}
        `;
        console.log(`    该城市的 Place 数量: ${beijingPlaces[0]?.count || 0}`);
      }
    }
    console.log('');

    // 3. 检查 embedding 数量
    const embeddingStats = await prisma.$queryRaw<Array<{
      total: bigint;
      with_embedding: bigint;
      without_embedding: bigint;
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM "Place"
    `;

    console.log('🔢 Embedding 统计:');
    console.log(`  - Place 总数: ${embeddingStats[0]?.total || 0}`);
    console.log(`  - 有 embedding: ${embeddingStats[0]?.with_embedding || 0}`);
    console.log(`  - 无 embedding: ${embeddingStats[0]?.without_embedding || 0}\n`);

    // 4. 检查有坐标的 Place 数量
    const locationStats = await prisma.$queryRaw<Array<{
      total: bigint;
      with_location: bigint;
      without_location: bigint;
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT(location) as with_location,
        COUNT(*) - COUNT(location) as without_location
      FROM "Place"
    `;

    console.log('📍 坐标统计:');
    console.log(`  - Place 总数: ${locationStats[0]?.total || 0}`);
    console.log(`  - 有坐标: ${locationStats[0]?.with_location || 0}`);
    console.log(`  - 无坐标: ${locationStats[0]?.without_location || 0}\n`);

    // 5. 检查北京的 Place（通过 cityId）
    if (beijingCities.length > 0) {
      const beijingCityId = beijingCities[0].id;
      const beijingPlacesWithData = await prisma.$queryRaw<Array<{
        total: bigint;
        with_location: bigint;
        with_embedding: bigint;
        with_both: bigint;
      }>>`
        SELECT 
          COUNT(*) as total,
          COUNT(location) as with_location,
          COUNT(embedding) as with_embedding,
          COUNT(CASE WHEN location IS NOT NULL AND embedding IS NOT NULL THEN 1 END) as with_both
        FROM "Place"
        WHERE "cityId" = ${beijingCityId}
      `;

      console.log(`📋 北京的 Place 详细统计 (cityId: ${beijingCityId}):`);
      console.log(`  - 总数: ${beijingPlacesWithData[0]?.total || 0}`);
      console.log(`  - 有坐标: ${beijingPlacesWithData[0]?.with_location || 0}`);
      console.log(`  - 有 embedding: ${beijingPlacesWithData[0]?.with_embedding || 0}`);
      console.log(`  - 同时有坐标和 embedding: ${beijingPlacesWithData[0]?.with_both || 0}\n`);
    }

    // 6. 检查 City 表中的北京记录格式
    console.log('🔍 检查 City 表中所有包含"北京"或"Beijing"的记录:');
    const allBeijingLike = await prisma.city.findMany({
      where: {
        OR: [
          { nameCN: { contains: '北京' } },
          { name: { contains: 'Beijing' } },
          { nameEN: { contains: 'Beijing' } },
        ],
      },
      select: { id: true, nameCN: true, name: true, nameEN: true, countryCode: true },
      take: 10,
    });

    if (allBeijingLike.length === 0) {
      console.log('  ❌ 未找到任何包含"北京"或"Beijing"的城市记录！');
    } else {
      for (const city of allBeijingLike) {
        console.log(`  - ID: ${city.id}, nameCN: "${city.nameCN}", name: "${city.name}", nameEN: "${city.nameEN}", countryCode: "${city.countryCode}"`);
      }
    }

  } catch (error: any) {
    console.error('❌ 诊断失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

diagnosePlaceData();

