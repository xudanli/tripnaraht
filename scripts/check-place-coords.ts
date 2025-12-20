import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCoords() {
  try {
    // 查询这两个 ID 的完整信息
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      category: string;
      lat: number | null;
      lng: number | null;
      location_status: string;
      address_status: string;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        category,
        -- 提取 location 的经纬度（PostGIS geography 类型）
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        -- 检查 location 是否为 NULL
        CASE WHEN location IS NULL THEN 'NULL' ELSE 'NOT NULL' END as location_status,
        -- 检查是否有地址信息
        CASE WHEN address IS NULL OR address = '' THEN 'NO_ADDRESS' ELSE 'HAS_ADDRESS' END as address_status
      FROM "Place"
      WHERE id IN (11510, 26377)
      ORDER BY id
    `;
    
    console.log('查询结果:');
    console.log(JSON.stringify(places, null, 2));
    
    // 分析结果
    console.log('\n分析:');
    for (const place of places) {
      console.log(`\nID ${place.id}: ${place.nameCN}`);
      console.log(`  - location_status: ${place.location_status}`);
      console.log(`  - lat: ${place.lat}`);
      console.log(`  - lng: ${place.lng}`);
      console.log(`  - address_status: ${place.address_status}`);
      console.log(`  - address: ${place.address || 'N/A'}`);
      
      if (place.location_status === 'NULL') {
        console.log(`  ❌ 结论: 数据缺失 - location 字段为 NULL`);
      } else if (place.lat === null || place.lng === null) {
        console.log(`  ⚠️  结论: 数据异常 - location 不为 NULL 但无法提取坐标`);
      } else {
        console.log(`  ✅ 结论: 数据正常 - 有坐标 (${place.lat}, ${place.lng})`);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkCoords();

