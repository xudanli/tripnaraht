#!/usr/bin/env tsx
/**
 * 验证冰岛机场POI数据导入结果
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证冰岛机场POI数据导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找所有冰岛机场（TRANSIT_HUB类别，且metadata包含iata_code）
    const airports = await prisma.place.findMany({
      where: {
        category: PlaceCategory.TRANSIT_HUB,
        City: {
          countryCode: 'IS',
        },
        metadata: {
          path: ['iata_code'],
          not: null,
        },
      },
      include: {
        City: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 找到 ${airports.length} 个冰岛机场\n`);

    // 2. 获取每个机场的地理位置信息（使用原始SQL）
    const airportsWithLocation = await prisma.$queryRaw<Array<{ id: number; has_location: boolean }>>`
      SELECT 
        id,
        CASE WHEN "location" IS NOT NULL THEN true ELSE false END as has_location
      FROM "Place"
      WHERE "category" = 'TRANSIT_HUB'
      AND "cityId" IN (
        SELECT id FROM "City" WHERE "countryCode" = 'IS'
      )
      AND metadata->>'iata_code' IS NOT NULL
    `;

    const locationMap = new Map<number, boolean>();
    airportsWithLocation.forEach(item => {
      locationMap.set(item.id, item.has_location);
    });

    // 3. 验证每个机场的数据完整性
    let validCount = 0;
    let invalidCount = 0;
    const issues: Array<{ name: string; issues: string[] }> = [];

    for (const airport of airports) {
      const airportIssues: string[] = [];
      const metadata = airport.metadata as any;
      const hasLocation = locationMap.get(airport.id) || false;

      // 检查必需字段
      if (!airport.nameCN) airportIssues.push('缺少中文名称');
      if (!airport.nameEN) airportIssues.push('缺少英文名称');
      if (!airport.address) airportIssues.push('缺少地址');
      if (!metadata?.iata_code) airportIssues.push('缺少IATA代码');
      if (!hasLocation) airportIssues.push('缺少地理位置');

      // 检查metadata字段
      if (!metadata?.airport_id) airportIssues.push('metadata缺少airport_id');
      if (!metadata?.airport_type) airportIssues.push('metadata缺少airport_type');

      if (airportIssues.length === 0) {
        validCount++;
      } else {
        invalidCount++;
        issues.push({
          name: airport.nameCN || airport.nameEN || 'Unknown',
          issues: airportIssues,
        });
      }
    }

    // 4. 显示机场详情
    console.log('📍 机场列表:');
    console.log('='.repeat(80));
    airports.forEach((airport, index) => {
      const metadata = airport.metadata as any;
      const hasLocation = locationMap.get(airport.id) || false;
      console.log(`\n${index + 1}. ${airport.nameCN} (${airport.nameEN})`);
      console.log(`   ID: ${airport.id}`);
      console.log(`   UUID: ${airport.uuid}`);
      console.log(`   城市: ${airport.City.nameCN} (${airport.City.nameEN})`);
      console.log(`   地址: ${airport.address || '无'}`);
      console.log(`   IATA代码: ${metadata?.iata_code || '无'}`);
      console.log(`   ICAO代码: ${metadata?.icao_code || '无'}`);
      console.log(`   机场类型: ${metadata?.airport_type || '无'}`);
      console.log(`   评分: ${airport.rating || '无'}`);
      console.log(`   地理位置: ${hasLocation ? '✅ 已设置' : '❌ 未设置'}`);
      
      if (metadata?.facilities?.rental_car_desk?.available) {
        const companies = metadata.facilities.rental_car_desk.companies || [];
        console.log(`   租车公司: ${companies.length} 家`);
      }
      
      if (metadata?.main_airlines) {
        console.log(`   主要航空公司: ${metadata.main_airlines.length} 家`);
      }
    });

    // 5. 显示验证结果
    console.log('\n' + '='.repeat(80));
    console.log('📊 验证结果:');
    console.log(`   ✅ 有效: ${validCount} 个`);
    console.log(`   ❌ 无效: ${invalidCount} 个`);

    if (issues.length > 0) {
      console.log('\n⚠️  发现的问题:');
      issues.forEach(({ name, issues: issueList }) => {
        console.log(`   ${name}:`);
        issueList.forEach(issue => console.log(`     - ${issue}`));
      });
    }

    // 6. 按城市统计
    const airportsByCity = await prisma.place.groupBy({
      by: ['cityId'],
      where: {
        category: PlaceCategory.TRANSIT_HUB,
        City: {
          countryCode: 'IS',
        },
        metadata: {
          path: ['iata_code'],
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    console.log('\n' + '='.repeat(80));
    console.log('📊 按城市统计:');
    for (const stat of airportsByCity) {
      const city = await prisma.city.findUnique({
        where: { id: stat.cityId },
      });
      console.log(`   ${city?.nameCN || city?.nameEN || 'Unknown'}: ${stat._count.id} 个`);
    }

    // 7. 检查地理位置统计
    const locationStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE "category" = 'TRANSIT_HUB'
      AND "location" IS NOT NULL
      AND "cityId" IN (
        SELECT id FROM "City" WHERE "countryCode" = 'IS'
      )
      AND metadata->>'iata_code' IS NOT NULL
    `;

    console.log('\n' + '='.repeat(80));
    console.log('📍 地理位置统计:');
    console.log(`   有地理位置: ${locationStats[0]?.count || 0} 个`);
    console.log(`   无地理位置: ${airports.length - Number(locationStats[0]?.count || 0)} 个`);

  } catch (error: any) {
    console.error('❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
