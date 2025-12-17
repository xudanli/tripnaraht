// scripts/check-place-coordinates.ts

/**
 * 检查Place的坐标是否正确
 * 
 * 使用方法:
 *   npm run ts-node -- scripts/check-place-coordinates.ts <placeId1> [placeId2] ...
 * 
 * 或者检查包含特定名称的Place:
 *   npm run ts-node -- scripts/check-place-coordinates.ts --name="武功山"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 计算两点之间的距离（公里）
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 地球半径（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 检查坐标是否在中国境内
 */
function isInChina(lat: number, lng: number): boolean {
  // 中国大致范围：纬度18-54，经度73-135
  return lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135;
}

/**
 * 检查Place坐标
 */
async function checkPlace(placeId: number) {
  try {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        address: true,
      },
    });

    if (!place) {
      console.error(`❌ Place ID ${placeId} 不存在`);
      return;
    }

    // 获取坐标
    const locationResult = await prisma.$queryRaw<Array<{
      lat: number;
      lng: number;
    }>>`
      SELECT 
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE id = ${placeId}
        AND location IS NOT NULL
    `;

    if (locationResult.length === 0) {
      console.log(`\n📍 Place: ${place.nameCN || place.nameEN} (ID: ${placeId})`);
      console.log(`   ⚠️  没有坐标信息`);
      return;
    }

    const { lat, lng } = locationResult[0];

    console.log(`\n📍 Place: ${place.nameCN || place.nameEN} (ID: ${placeId})`);
    console.log(`   类别: ${place.category}`);
    console.log(`   地址: ${place.address || '无'}`);
    console.log(`   坐标: 纬度 ${lat.toFixed(6)}, 经度 ${lng.toFixed(6)}`);

    // 检查是否在中国境内
    const inChina = isInChina(lat, lng);
    if (!inChina) {
      console.warn(`   ⚠️  警告：坐标不在中国境内范围！`);
      console.warn(`      如果这是中国的地点，可能经纬度被交换了`);
      console.warn(`      交换后的坐标应该是: 纬度 ${lng.toFixed(6)}, 经度 ${lat.toFixed(6)}`);
    } else {
      console.log(`   ✅ 坐标在中国境内`);
    }

    // 检查是否是合理的坐标（不是0,0或明显错误的值）
    if (lat === 0 && lng === 0) {
      console.warn(`   ⚠️  警告：坐标为 (0, 0)，可能是默认值或错误数据`);
    }

    // 如果是武功山相关，检查是否在正确位置
    const name = (place.nameCN || place.nameEN || '').toLowerCase();
    if (name.includes('武功山')) {
      // 武功山应该在：纬度约 27.5，经度约 114.2
      const wugongLat = 27.5;
      const wugongLng = 114.2;
      const distance = calculateDistance(lat, lng, wugongLat, wugongLng);
      console.log(`\n   武功山位置检查:`);
      console.log(`   期望位置: 纬度 ${wugongLat}, 经度 ${wugongLng}`);
      console.log(`   实际位置: 纬度 ${lat.toFixed(6)}, 经度 ${lng.toFixed(6)}`);
      console.log(`   距离: ${distance.toFixed(2)} 公里`);
      
      if (distance > 50) {
        console.warn(`   ⚠️  警告：距离武功山实际位置超过50公里！`);
        console.warn(`      可能的原因：`);
        console.warn(`      1. 经纬度被交换了（应该是 纬度 ${lng.toFixed(6)}, 经度 ${lat.toFixed(6)}）`);
        console.warn(`      2. 坐标数据本身错误`);
      } else if (distance > 10) {
        console.warn(`   ⚠️  注意：距离武功山实际位置 ${distance.toFixed(2)} 公里，请确认是否正确`);
      } else {
        console.log(`   ✅ 位置正确（距离 ${distance.toFixed(2)} 公里）`);
      }
    }

  } catch (error: any) {
    console.error(`❌ 检查 Place ID ${placeId} 时出错: ${error?.message || String(error)}`);
  }
}

/**
 * 按名称搜索Place
 */
async function searchPlacesByName(name: string) {
  try {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
    }>>`
      SELECT id, "nameCN", "nameEN", category
      FROM "Place"
      WHERE "nameCN" ILIKE ${`%${name}%`}
         OR "nameEN" ILIKE ${`%${name}%`}
      LIMIT 20
    `;

    if (places.length === 0) {
      console.log(`❌ 未找到名称包含 "${name}" 的Place`);
      return;
    }

    console.log(`\n找到 ${places.length} 个匹配的Place:\n`);
    for (const place of places) {
      await checkPlace(place.id);
    }
  } catch (error: any) {
    console.error(`❌ 搜索失败: ${error?.message || String(error)}`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ 请提供Place ID或使用 --name="名称" 搜索');
    console.log('\n使用方法:');
    console.log('  npm run ts-node -- scripts/check-place-coordinates.ts <placeId1> [placeId2] ...');
    console.log('  npm run ts-node -- scripts/check-place-coordinates.ts --name="武功山"');
    return;
  }

  const nameArg = args.find(arg => arg.startsWith('--name='));
  
  if (nameArg) {
    const name = nameArg.split('=')[1].trim();
    await searchPlacesByName(name);
  } else {
    // 检查指定的Place ID
    for (const arg of args) {
      const placeId = parseInt(arg, 10);
      if (isNaN(placeId)) {
        console.warn(`⚠️  跳过无效的Place ID: ${arg}`);
        continue;
      }
      await checkPlace(placeId);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

