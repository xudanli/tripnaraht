#!/usr/bin/env ts-node
/**
 * 检查新西兰 POI 导入进度
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProgress() {
  try {
    const stats = await prisma.$queryRaw<Array<{
      region: string;
      count: bigint;
      with_city_id: bigint;
    }>>`
      SELECT 
        metadata->>'regionKey' as region,
        COUNT(*) as count,
        COUNT(CASE WHEN "cityId" IS NOT NULL THEN 1 END) as with_city_id
      FROM "Place"
      WHERE metadata->>'countryCode' = 'NZ'
      GROUP BY metadata->>'regionKey'
      ORDER BY count DESC
    `;

    console.log('\n📊 新西兰 POI 导入进度统计:\n');
    console.log('Region'.padEnd(30) + '总数'.padEnd(12) + '有cityId'.padEnd(12) + '覆盖率');
    console.log('-'.repeat(60));
    
    let total = 0;
    let totalWithCity = 0;
    
    for (const s of stats) {
      const count = Number(s.count);
      const withCity = Number(s.with_city_id);
      total += count;
      totalWithCity += withCity;
      const coverage = count > 0 ? Math.round((withCity / count) * 100) : 0;
      console.log(
        (s.region || '未知').padEnd(30) + 
        count.toString().padEnd(12) + 
        withCity.toString().padEnd(12) + 
        coverage + '%'
      );
    }
    
    console.log('-'.repeat(60));
    const totalCoverage = total > 0 ? Math.round((totalWithCity / total) * 100) : 0;
    console.log(
      '总计'.padEnd(30) + 
      total.toString().padEnd(12) + 
      totalWithCity.toString().padEnd(12) + 
      totalCoverage + '%'
    );
    
    console.log(`\n✅ 已导入 ${total.toLocaleString()} 个新西兰 POI`);
    console.log(`🏙️  其中 ${totalWithCity.toLocaleString()} 个已匹配 cityId (${totalCoverage}%)`);
    
    // 按 profile 统计
    const profileStats = await prisma.$queryRaw<Array<{
      profile: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'profile' as profile,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'countryCode' = 'NZ'
      GROUP BY metadata->>'profile'
      ORDER BY count DESC
    `;
    
    if (profileStats.length > 0) {
      console.log('\n📋 按 Profile 统计:');
      profileStats.forEach(p => {
        console.log(`  ${p.profile || '未知'}: ${Number(p.count).toLocaleString()} 个`);
      });
    }
    
    // 详细进度（按 Region 和 Profile）
    const detailedStats = await prisma.$queryRaw<Array<{
      region: string;
      profile: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'regionKey' as region,
        metadata->>'profile' as profile,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'countryCode' = 'NZ'
      GROUP BY metadata->>'regionKey', metadata->>'profile'
      ORDER BY metadata->>'regionKey', metadata->>'profile'
    `;
    
    if (detailedStats.length > 0) {
      console.log('\n📋 详细进度（按 Region 和 Profile）:');
      let currentRegion = '';
      for (const r of detailedStats) {
        if (r.region !== currentRegion) {
          if (currentRegion) console.log('');
          currentRegion = r.region || '';
          console.log(`📍 ${currentRegion}:`);
        }
        console.log(`  - ${r.profile || '未知'}: ${Number(r.count).toLocaleString()} 个`);
      }
    }
    
  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProgress();

