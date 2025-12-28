#!/usr/bin/env ts-node
/**
 * 检查冰岛 POI 数据详情
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkIcelandPoi() {
  console.log('🇮🇸 检查冰岛 POI 数据详情...\n');

  // 查找所有包含 iceland 关键词的 POI
  const icelandPois = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: string;
    externalSource: string | null;
    countryCode: string | null;
    subCategory: string | null;
    lat: number;
    lng: number;
  }>>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      category::text as category,
      metadata->>'externalSource' as "externalSource",
      metadata->>'countryCode' as "countryCode",
      metadata->>'subCategory' as "subCategory",
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng
    FROM "Place"
    WHERE (
      metadata->>'externalSource' LIKE '%iceland%'
      OR metadata->>'externalSource' LIKE '%Iceland%'
      OR "nameEN" ILIKE '%iceland%'
      OR "nameCN" LIKE '%冰岛%'
      OR metadata::text ILIKE '%iceland%'
    )
    ORDER BY id
    LIMIT 20
  `;

  console.log(`找到 ${icelandPois.length} 个冰岛相关 POI:\n`);
  
  icelandPois.forEach((poi, i) => {
    console.log(`${i + 1}. ${poi.nameCN}${poi.nameEN ? ` (${poi.nameEN})` : ''}`);
    console.log(`   ID: ${poi.id}`);
    console.log(`   Category: ${poi.category}`);
    console.log(`   ExternalSource: ${poi.externalSource || 'N/A'}`);
    console.log(`   CountryCode: ${poi.countryCode || 'N/A'}`);
    console.log(`   SubCategory: ${poi.subCategory || 'N/A'}`);
    console.log(`   坐标: ${poi.lat?.toFixed(4)}, ${poi.lng?.toFixed(4)}`);
    console.log('');
  });

  // 统计
  const stats = await prisma.$queryRaw<Array<{
    externalSource: string | null;
    countryCode: string | null;
    count: bigint;
  }>>`
    SELECT 
      metadata->>'externalSource' as "externalSource",
      metadata->>'countryCode' as "countryCode",
      COUNT(*) as count
    FROM "Place"
    WHERE (
      metadata->>'externalSource' LIKE '%iceland%'
      OR metadata->>'externalSource' LIKE '%Iceland%'
      OR "nameEN" ILIKE '%iceland%'
      OR "nameCN" LIKE '%冰岛%'
      OR metadata::text ILIKE '%iceland%'
    )
    GROUP BY metadata->>'externalSource', metadata->>'countryCode'
    ORDER BY count DESC
  `;

  console.log('📊 统计:\n');
  stats.forEach(s => {
    console.log(`  ${s.externalSource || 'N/A'} (countryCode: ${s.countryCode || 'N/A'}): ${s.count} 个`);
  });
}

checkIcelandPoi()
  .catch((error) => {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


