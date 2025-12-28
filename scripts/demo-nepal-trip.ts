#!/usr/bin/env ts-node
/**
 * 尼泊尔行程规划 Demo
 * 
 * 演示如何使用导入的尼泊尔 POI 数据进行实际行程规划
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Demo 1: EBC 路线规划
 * 从 Lukla 到 Namche Bazaar 的徒步路线规划
 */
async function demoEBCRoute() {
  console.log('🏔️  Demo 1: EBC 路线规划 (Lukla → Namche Bazaar)\n');
  console.log('=' .repeat(60));

  const luklaLat = 27.6869;
  const luklaLng = 86.7298;
  const namcheLat = 27.80528;
  const namcheLng = 86.71058;

  // 1. 查找路线上的住宿点（茶屋/山屋）
  console.log('\n📍 路线上的住宿点:');
  const accommodations = await prisma.$queryRaw<Array<{
    nameCN: string;
    nameEN: string | null;
    canonicalType: string | null;
    distance_from_lukla_km: number;
    region: string;
  }>>`
    SELECT 
      "nameCN",
      "nameEN",
      metadata->>'canonicalType' as "canonicalType",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_from_lukla_km,
      metadata->>'regionKey' as region
    FROM "Place"
    WHERE metadata->>'regionKey' IN ('NP_LUKLA', 'NP_NAMCHE')
      AND metadata->>'canonicalType' IN ('TEAHOUSE_LODGE', 'HUT')
      AND ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) <= 20000  -- 20km 范围内
    ORDER BY distance_from_lukla_km
    LIMIT 10
  `;

  accommodations.forEach((acc, i) => {
    const type = acc.canonicalType === 'TEAHOUSE_LODGE' ? '🏠 茶屋' : '⛺ 山屋';
    console.log(`  ${i + 1}. ${acc.nameCN}${acc.nameEN ? ` (${acc.nameEN})` : ''}`);
    console.log(`     ${type} | 距离 Lukla: ${acc.distance_from_lukla_km}km | ${acc.region}`);
  });

  // 2. 查找补给点
  console.log('\n🛒 路线上的补给点:');
  const supplyPoints = await prisma.$queryRaw<Array<{
    nameCN: string;
    canonicalType: string | null;
    distance_from_lukla_km: number;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'canonicalType' as "canonicalType",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_from_lukla_km
    FROM "Place"
    WHERE metadata->>'regionKey' IN ('NP_LUKLA', 'NP_NAMCHE')
      AND metadata->>'canonicalType' = 'SUPPLY'
      AND ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) <= 20000
    ORDER BY distance_from_lukla_km
    LIMIT 5
  `;

  supplyPoints.forEach((sp, i) => {
    console.log(`  ${i + 1}. ${sp.nameCN} - ${sp.distance_from_lukla_km}km from Lukla`);
  });

  // 3. 查找医疗/安全点
  console.log('\n🏥 路线上的医疗/安全点:');
  const safetyPoints = await prisma.$queryRaw<Array<{
    nameCN: string;
    distance_from_lukla_km: number;
  }>>`
    SELECT 
      "nameCN",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_from_lukla_km
    FROM "Place"
    WHERE metadata->>'regionKey' IN ('NP_LUKLA', 'NP_NAMCHE')
      AND metadata->>'canonicalType' = 'SAFETY_MEDICAL'
      AND ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) <= 20000
    ORDER BY distance_from_lukla_km
    LIMIT 5
  `;

  safetyPoints.forEach((sp, i) => {
    console.log(`  ${i + 1}. ${sp.nameCN} - ${sp.distance_from_lukla_km}km from Lukla`);
  });

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Demo 2: 加德满都城市探索
 */
async function demoKathmanduCity() {
  console.log('🏛️  Demo 2: 加德满都城市探索\n');
  console.log('='.repeat(60));

  // 1. 查找加德满都的交通枢纽
  console.log('\n✈️  交通枢纽:');
  const transitHubs = await prisma.$queryRaw<Array<{
    nameCN: string;
    nameEN: string | null;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      "nameEN",
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND metadata->>'canonicalType' IN ('AIRPORT', 'TRANSIT')
    ORDER BY 
      CASE WHEN metadata->>'canonicalType' = 'AIRPORT' THEN 1 ELSE 2 END,
      "nameCN"
    LIMIT 10
  `;

  transitHubs.forEach((hub, i) => {
    const icon = hub.canonicalType === 'AIRPORT' ? '✈️' : '🚌';
    console.log(`  ${i + 1}. ${icon} ${hub.nameCN}${hub.nameEN ? ` (${hub.nameEN})` : ''}`);
  });

  // 2. 查找加德满都的住宿推荐
  console.log('\n🏨 推荐住宿:');
  const hotels = await prisma.$queryRaw<Array<{
    nameCN: string;
    nameEN: string | null;
  }>>`
    SELECT 
      "nameCN",
      "nameEN"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND category = 'HOTEL'
      AND "nameCN" != 'Unnamed place'
    ORDER BY "nameCN"
    LIMIT 10
  `;

  hotels.forEach((hotel, i) => {
    console.log(`  ${i + 1}. ${hotel.nameCN}${hotel.nameEN ? ` (${hotel.nameEN})` : ''}`);
  });

  // 3. 查找加德满都的观景点
  console.log('\n📸 观景点:');
  const viewpoints = await prisma.$queryRaw<Array<{
    nameCN: string;
    nameEN: string | null;
  }>>`
    SELECT 
      "nameCN",
      "nameEN"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND metadata->>'canonicalType' = 'VIEWPOINT'
      AND "nameCN" != 'Unnamed place'
    ORDER BY "nameCN"
    LIMIT 10
  `;

  viewpoints.forEach((vp, i) => {
    console.log(`  ${i + 1}. ${vp.nameCN}${vp.nameEN ? ` (${vp.nameEN})` : ''}`);
  });

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Demo 3: 博卡拉周边徒步
 */
async function demoPokharaTrekking() {
  console.log('🏔️  Demo 3: 博卡拉周边徒步\n');
  console.log('='.repeat(60));

  const pokharaLat = 28.2669;
  const pokharaLng = 83.9685;

  // 1. 查找徒步入口
  console.log('\n🚶 徒步入口:');
  const trailheads = await prisma.$queryRaw<Array<{
    nameCN: string;
    distance_km: number;
  }>>`
    SELECT 
      "nameCN",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${pokharaLng}, ${pokharaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_km
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_PKR'
      AND metadata->>'canonicalType' = 'TRAILHEAD'
    ORDER BY distance_km
    LIMIT 5
  `;

  if (trailheads.length > 0) {
    trailheads.forEach((th, i) => {
      console.log(`  ${i + 1}. ${th.nameCN} - ${th.distance_km}km from Pokhara`);
    });
  } else {
    console.log('  (未找到 TRAILHEAD 类型，查找附近的观景点作为替代)');
    const altTrailheads = await prisma.$queryRaw<Array<{
      nameCN: string;
      distance_km: number;
    }>>`
      SELECT 
        "nameCN",
        ROUND((ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(${pokharaLng}, ${pokharaLat}), 4326)::geography
        ) / 1000.0)::numeric, 1)::float as distance_km
      FROM "Place"
      WHERE metadata->>'regionKey' = 'NP_PKR'
        AND metadata->>'canonicalType' = 'VIEWPOINT'
        AND "nameCN" != 'Unnamed place'
      ORDER BY distance_km
      LIMIT 5
    `;
    altTrailheads.forEach((th, i) => {
      console.log(`  ${i + 1}. ${th.nameCN} - ${th.distance_km}km from Pokhara`);
    });
  }

  // 2. 查找露营地
  console.log('\n⛺ 露营地:');
  const campsites = await prisma.$queryRaw<Array<{
    nameCN: string;
    distance_km: number;
  }>>`
    SELECT 
      "nameCN",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${pokharaLng}, ${pokharaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_km
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_PKR'
      AND metadata->>'canonicalType' = 'CAMPING'
    ORDER BY distance_km
    LIMIT 5
  `;

  campsites.forEach((camp, i) => {
    console.log(`  ${i + 1}. ${camp.nameCN} - ${camp.distance_km}km from Pokhara`);
  });

  // 3. 查找山屋
  console.log('\n🏠 山屋/庇护所:');
  const huts = await prisma.$queryRaw<Array<{
    nameCN: string;
    distance_km: number;
  }>>`
    SELECT 
      "nameCN",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${pokharaLng}, ${pokharaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_km
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_PKR'
      AND metadata->>'canonicalType' = 'HUT'
    ORDER BY distance_km
    LIMIT 5
  `;

  huts.forEach((hut, i) => {
    console.log(`  ${i + 1}. ${hut.nameCN} - ${hut.distance_km}km from Pokhara`);
  });

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Demo 4: 行程规划建议
 */
async function demoTripPlanning() {
  console.log('📋 Demo 4: 智能行程规划建议\n');
  console.log('='.repeat(60));

  // 场景：规划一个 7 天的尼泊尔行程
  console.log('\n🎯 场景：7 天尼泊尔行程规划\n');

  // Day 1: 加德满都
  console.log('📅 Day 1: 加德满都 (抵达 & 适应)');
  const ktmDay1 = await prisma.$queryRaw<Array<{
    nameCN: string;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND metadata->>'canonicalType' IN ('AIRPORT', 'TRANSIT', 'VIEWPOINT')
      AND "nameCN" != 'Unnamed place'
    ORDER BY 
      CASE WHEN metadata->>'canonicalType' = 'AIRPORT' THEN 1 ELSE 2 END
    LIMIT 5
  `;

  ktmDay1.forEach((poi, i) => {
    const icon = poi.canonicalType === 'AIRPORT' ? '✈️' : poi.canonicalType === 'VIEWPOINT' ? '📸' : '🚌';
    console.log(`  ${i + 1}. ${icon} ${poi.nameCN}`);
  });

  // Day 2-3: 加德满都探索
  console.log('\n📅 Day 2-3: 加德满都探索');
  const ktmExplore = await prisma.$queryRaw<Array<{
    nameCN: string;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND metadata->>'canonicalType' = 'VIEWPOINT'
      AND "nameCN" != 'Unnamed place'
    ORDER BY "nameCN"
    LIMIT 5
  `;

  ktmExplore.forEach((poi, i) => {
    console.log(`  ${i + 1}. 📸 ${poi.nameCN}`);
  });

  // Day 4-5: 博卡拉
  console.log('\n📅 Day 4-5: 博卡拉 (前往 & 周边徒步)');
  const pokhara = await prisma.$queryRaw<Array<{
    nameCN: string;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_PKR'
      AND metadata->>'canonicalType' IN ('VIEWPOINT', 'CAMPING', 'HUT')
      AND "nameCN" != 'Unnamed place'
    ORDER BY 
      CASE WHEN metadata->>'canonicalType' = 'VIEWPOINT' THEN 1 ELSE 2 END
    LIMIT 5
  `;

  pokhara.forEach((poi, i) => {
    const icon = poi.canonicalType === 'VIEWPOINT' ? '📸' : poi.canonicalType === 'CAMPING' ? '⛺' : '🏠';
    console.log(`  ${i + 1}. ${icon} ${poi.nameCN}`);
  });

  // Day 6-7: 奇特旺或返回
  console.log('\n📅 Day 6-7: 奇特旺 (野生动物) 或返回加德满都');
  const chitwan = await prisma.$queryRaw<Array<{
    nameCN: string;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_CHITWAN_SAURAHA'
      AND metadata->>'canonicalType' IN ('VIEWPOINT', 'SAFETY_MEDICAL')
      AND "nameCN" != 'Unnamed place'
    ORDER BY "nameCN"
    LIMIT 5
  `;

  chitwan.forEach((poi, i) => {
    const icon = poi.canonicalType === 'VIEWPOINT' ? '📸' : '🏥';
    console.log(`  ${i + 1}. ${icon} ${poi.nameCN}`);
  });

  console.log('\n💡 规划建议:');
  console.log('  • 加德满都：适合文化探索和适应高海拔');
  console.log('  • 博卡拉：适合轻量徒步和观景');
  console.log('  • 奇特旺：适合野生动物观察');
  console.log('  • 如需深度徒步，建议延长行程至 10-14 天');

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Demo 5: 数据统计和洞察
 */
async function demoDataInsights() {
  console.log('📊 Demo 5: 数据洞察\n');
  console.log('='.repeat(60));

  // 1. 各区域 POI 密度
  console.log('\n📍 各区域 POI 密度:');
  const density = await prisma.$queryRaw<Array<{
    region: string;
    poi_count: bigint;
    teahouse_count: bigint;
    supply_count: bigint;
  }>>`
    SELECT 
      metadata->>'regionKey' as region,
      COUNT(*) as poi_count,
      COUNT(*) FILTER (WHERE metadata->>'canonicalType' = 'TEAHOUSE_LODGE') as teahouse_count,
      COUNT(*) FILTER (WHERE metadata->>'canonicalType' = 'SUPPLY') as supply_count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
    GROUP BY metadata->>'regionKey'
    ORDER BY poi_count DESC
  `;

  density.forEach((d) => {
    const teahouseRatio = (Number(d.teahouse_count) / Number(d.poi_count) * 100).toFixed(1);
    const supplyRatio = (Number(d.supply_count) / Number(d.poi_count) * 100).toFixed(1);
    console.log(`  ${d.region}:`);
    console.log(`    总 POI: ${d.poi_count} | 茶屋: ${d.teahouse_count} (${teahouseRatio}%) | 补给: ${d.supply_count} (${supplyRatio}%)`);
  });

  // 2. 徒步路线可执行性分析
  console.log('\n🥾 徒步路线可执行性分析:');
  const trekkingRegions = ['NP_LUKLA', 'NP_NAMCHE', 'NP_BESISAHAR', 'NP_PKR'];
  
  for (const region of trekkingRegions) {
    const analysis = await prisma.$queryRaw<Array<{
      teahouse: bigint;
      supply: bigint;
      safety: bigint;
      camping: bigint;
    }>>`
      SELECT 
        COUNT(*) FILTER (WHERE metadata->>'canonicalType' = 'TEAHOUSE_LODGE') as teahouse,
        COUNT(*) FILTER (WHERE metadata->>'canonicalType' = 'SUPPLY') as supply,
        COUNT(*) FILTER (WHERE metadata->>'canonicalType' = 'SAFETY_MEDICAL') as safety,
        COUNT(*) FILTER (WHERE metadata->>'canonicalType' = 'CAMPING') as camping
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
    `;

    const a = analysis[0];
    const score = Number(a.teahouse) * 2 + Number(a.supply) + Number(a.safety) + Number(a.camping);
    const level = score > 100 ? '高' : score > 50 ? '中' : '低';
    
    console.log(`  ${region}:`);
    console.log(`    可执行性: ${level} (评分: ${score})`);
    console.log(`    茶屋: ${a.teahouse} | 补给: ${a.supply} | 医疗: ${a.safety} | 露营: ${a.camping}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

async function main() {
  try {
    await demoEBCRoute();
    await demoKathmanduCity();
    await demoPokharaTrekking();
    await demoTripPlanning();
    await demoDataInsights();
    
    console.log('✅ 所有 Demo 完成！\n');
    console.log('💡 这些数据可以用于:');
    console.log('  • GeoFacts 服务 - 计算地理特征');
    console.log('  • Readiness 服务 - 检查行程准备度');
    console.log('  • Decision 服务 - 智能行程决策');
    console.log('  • Agent 规划 - 自动生成行程');
    
  } catch (error: any) {
    console.error('❌ Demo 失败:', error.message);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ Demo 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

