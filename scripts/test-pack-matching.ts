#!/usr/bin/env ts-node
/**
 * 测试准备度 Pack 多级匹配策略
 * 
 * 测试场景：
 * 1. 精确 destinationId 匹配
 * 2. 城市名称匹配
 * 3. Region 匹配
 * 4. 坐标匹配
 * 5. 国家代码匹配（降级）
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';

const prisma = new PrismaClient();

// 直接实现查询方法用于测试
async function findPackByDestination(destinationId: string): Promise<ReadinessPack | null> {
  const record = await prisma.readinessPack.findFirst({
    where: { destinationId, isActive: true },
    orderBy: { version: 'desc' },
  });
  return record ? (record.packData as unknown as ReadinessPack) : null;
}

async function findPackByCity(cityName: string, countryCode?: string): Promise<ReadinessPack | null> {
  let whereClause = Prisma.sql`WHERE "isActive" = true AND LOWER("city") = LOWER(${cityName})`;
  if (countryCode) {
    whereClause = Prisma.sql`${whereClause} AND "countryCode" = ${countryCode.toUpperCase()}`;
  }
  const records = await prisma.$queryRaw<any[]>`SELECT * FROM "ReadinessPack" ${whereClause} ORDER BY version DESC LIMIT 1`;
  return records.length > 0 ? (records[0].packData as unknown as ReadinessPack) : null;
}

async function findPacksByRegion(regionName: string): Promise<ReadinessPack[]> {
  const records = await prisma.$queryRaw<any[]>`
    SELECT * FROM "ReadinessPack"
    WHERE "isActive" = true AND LOWER("region") = LOWER(${regionName})
    ORDER BY "updatedAt" DESC
  `;
  return records.map(r => r.packData as unknown as ReadinessPack);
}

async function findNearestPack(lat: number, lng: number, maxDistanceKm: number = 50): Promise<ReadinessPack | null> {
  try {
    const records = await prisma.$queryRaw<any[]>`
      SELECT 
        *,
        (
          6371 * acos(
            cos(radians(${lat})) * 
            cos(radians("latitude")) * 
            cos(radians("longitude") - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians("latitude"))
          )
        ) AS distance_km
      FROM "ReadinessPack"
      WHERE 
        "isActive" = true
        AND "latitude" IS NOT NULL
        AND "longitude" IS NOT NULL
      ORDER BY distance_km ASC
      LIMIT 1
    `;
    if (records.length === 0) return null;
    const distanceKm = parseFloat(records[0].distance_km);
    if (distanceKm > maxDistanceKm) return null;
    return records[0].packData as unknown as ReadinessPack;
  } catch (error) {
    console.error('坐标匹配失败:', error);
    return null;
  }
}

async function findPacksByCountry(countryCode: string): Promise<ReadinessPack[]> {
  const records = await prisma.readinessPack.findMany({
    where: { countryCode: countryCode.toUpperCase(), isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  return records.map(r => r.packData as unknown as ReadinessPack);
}

async function testMatching() {
  console.log('🧪 测试准备度 Pack 多级匹配策略\n');

  // 测试场景 1: 精确 destinationId 匹配
  console.log('📋 测试场景 1: 精确 destinationId 匹配');
  console.log('   输入: destinationId = "FI-ROVANIEMI"');
  const pack1 = await findPackByDestination('FI-ROVANIEMI');
  if (pack1) {
    const displayName = typeof pack1.displayName === 'string' ? pack1.displayName : pack1.displayName.en;
    console.log(`   ✅ 找到: ${pack1.packId} (${displayName})`);
  } else {
    console.log('   ❌ 未找到');
  }
  console.log('');

  // 测试场景 2: 城市名称匹配
  console.log('📋 测试场景 2: 城市名称匹配');
  console.log('   输入: cityName = "Rovaniemi", countryCode = "FI"');
  const pack2 = await findPackByCity('Rovaniemi', 'FI');
  if (pack2) {
    const displayName = typeof pack2.displayName === 'string' ? pack2.displayName : pack2.displayName.en;
    console.log(`   ✅ 找到: ${pack2.packId} (${displayName})`);
  } else {
    console.log('   ❌ 未找到');
  }
  console.log('');

  // 测试场景 3: Region 匹配
  console.log('📋 测试场景 3: Region 匹配');
  console.log('   输入: regionName = "Lapland"');
  const packs3 = await findPacksByRegion('Lapland');
  if (packs3.length > 0) {
    console.log(`   ✅ 找到 ${packs3.length} 个 pack(s):`);
    packs3.forEach(p => {
      const displayName = typeof p.displayName === 'string' ? p.displayName : p.displayName.en;
      console.log(`      - ${p.packId} (${displayName})`);
    });
  } else {
    console.log('   ❌ 未找到');
  }
  console.log('');

  // 测试场景 4: 坐标匹配
  console.log('📋 测试场景 4: 坐标匹配');
  console.log('   输入: lat = 66.5039, lng = 25.7294 (罗瓦涅米坐标)');
  const pack4 = await findNearestPack(66.5039, 25.7294, 50);
  if (pack4) {
    const displayName = typeof pack4.displayName === 'string' ? pack4.displayName : pack4.displayName.en;
    console.log(`   ✅ 找到: ${pack4.packId} (${displayName})`);
  } else {
    console.log('   ❌ 未找到（可能距离超过阈值）');
  }
  console.log('');

  // 测试场景 5: 国家代码匹配
  console.log('📋 测试场景 5: 国家代码匹配（降级策略）');
  console.log('   输入: countryCode = "FI"');
  const packs5 = await findPacksByCountry('FI');
  if (packs5.length > 0) {
    console.log(`   ✅ 找到 ${packs5.length} 个 pack(s):`);
    packs5.forEach(p => {
      const displayName = typeof p.displayName === 'string' ? p.displayName : p.displayName.en;
      console.log(`      - ${p.packId} (${displayName})`);
    });
  } else {
    console.log('   ❌ 未找到');
  }
  console.log('');

  // 测试场景 6: 斯瓦尔巴（特殊地区）
  console.log('📋 测试场景 6: 特殊地区 - 斯瓦尔巴');
  console.log('   输入: destinationId = "SJ-SVALBARD"');
  const pack6 = await findPackByDestination('SJ-SVALBARD');
  if (pack6) {
    const displayName = typeof pack6.displayName === 'string' ? pack6.displayName : pack6.displayName.en;
    console.log(`   ✅ 找到: ${pack6.packId} (${displayName})`);
  } else {
    console.log('   ❌ 未找到');
  }
  console.log('');

  console.log('✅ 测试完成');
}

testMatching()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ 测试失败:', e);
    prisma.$disconnect();
    process.exit(1);
  });
