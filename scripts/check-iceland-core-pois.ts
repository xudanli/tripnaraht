#!/usr/bin/env tsx
/**
 * 检查冰岛核心 POI 的状态
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('检查冰岛核心 POI');
  console.log('='.repeat(60));
  console.log('');

  // 查询所有有 tier 标记的 POI
  const pois = await prisma.$queryRaw<any[]>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      "cityId",
      metadata->>'tier' as tier,
      metadata->>'is_landmark' as is_landmark,
      metadata->>'safety_warning' as safety_warning,
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng
    FROM "Place"
    WHERE category = 'ATTRACTION'
      AND metadata->>'tier' IS NOT NULL
    ORDER BY metadata->>'tier', "nameCN"
  `;

  console.log(`找到 ${pois.length} 个已标记 tier 的 POI：\n`);

  const tier1 = pois.filter(p => p.tier === 'Tier 1 (Classic)');
  const tier2 = pois.filter(p => p.tier === 'Tier 2 (Photographer/Advanced)');

  console.log(`Tier 1: ${tier1.length} 个`);
  console.log(`Tier 2: ${tier2.length} 个\n`);

  console.log('Tier 1 POIs:');
  for (const poi of tier1) {
    console.log(`  - ${poi.nameCN} (${poi.nameEN || 'N/A'})`);
    console.log(`    ID: ${poi.id}, cityId: ${poi.cityId || 'NULL'}, is_landmark: ${poi.is_landmark}`);
  }

  console.log('\nTier 2 POIs:');
  for (const poi of tier2) {
    console.log(`  - ${poi.nameCN} (${poi.nameEN || 'N/A'})`);
    console.log(`    ID: ${poi.id}, cityId: ${poi.cityId || 'NULL'}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
