#!/usr/bin/env tsx
/**
 * 验证冰岛餐厅POI数据导入结果
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证冰岛餐厅POI数据导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找所有冰岛餐厅（RESTAURANT类别）
    const restaurants = await prisma.place.findMany({
      where: {
        category: 'RESTAURANT',
        City: {
          countryCode: 'IS',
        },
      },
      include: {
        City: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 找到 ${restaurants.length} 个冰岛餐厅\n`);

    // 2. 验证每个餐厅的数据完整性
    let validCount = 0;
    let invalidCount = 0;
    const issues: Array<{ name: string; issues: string[] }> = [];

    for (const restaurant of restaurants) {
      const restaurantIssues: string[] = [];

      // 检查必需字段
      if (!restaurant.nameCN) restaurantIssues.push('缺少中文名称');
      if (!restaurant.nameEN) restaurantIssues.push('缺少英文名称');
      if (!restaurant.address) restaurantIssues.push('缺少地址');
      if (!restaurant.cityId) restaurantIssues.push('缺少城市ID');

      // 检查坐标（使用 SQL 查询，因为 Prisma 可能无法直接读取 PostGIS geography 类型）
      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${restaurant.id}
      `;
      
      if (locationQuery.length === 0 || !locationQuery[0].lng || !locationQuery[0].lat) {
        restaurantIssues.push('缺少坐标');
      } else {
        const { lng, lat } = locationQuery[0];
        // 冰岛大致范围：经度 -24.5 到 -13.5，纬度 63.3 到 66.5
        if (lng < -24.5 || lng > -13.5 || lat < 63.3 || lat > 66.5) {
          restaurantIssues.push(`坐标超出冰岛范围: (${lng}, ${lat})`);
        }
      }

      // 检查元数据
      const metadata = restaurant.metadata as any;
      if (!metadata) {
        restaurantIssues.push('缺少元数据');
      } else {
        // 检查关键元数据字段
        if (!metadata.openingHours) restaurantIssues.push('缺少营业时间');
        if (metadata.price === undefined && metadata.priceLevel === undefined) {
          restaurantIssues.push('缺少价格信息');
        }
      }

      if (restaurantIssues.length > 0) {
        invalidCount++;
        issues.push({
          name: restaurant.nameCN,
          issues: restaurantIssues,
        });
      } else {
        validCount++;
      }
    }

    // 3. 显示验证结果
    console.log('📋 验证结果：');
    console.log(`  ✅ 有效: ${validCount}`);
    console.log(`  ❌ 无效: ${invalidCount}\n`);

    // 4. 显示详细信息（前5个）
    console.log('📝 餐厅详细信息（前5个）：\n');
    for (let i = 0; i < Math.min(5, restaurants.length); i++) {
      const r = restaurants[i];
      const metadata = r.metadata as any;
      const physicalMetadata = r.physicalMetadata as any;

      // 获取坐标
      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${r.id}
      `;
      const location = locationQuery.length > 0 ? locationQuery[0] : null;

      console.log(`${i + 1}. ${r.nameCN} (${r.nameEN})`);
      console.log(`   ID: ${r.id}`);
      console.log(`   城市: ${r.City?.nameCN || r.City?.nameEN || '未知'}`);
      console.log(`   地址: ${r.address || '无'}`);
      console.log(`   评分: ${r.rating || '无'}`);
      console.log(`   坐标: ${location ? `(${location.lng}, ${location.lat})` : '无'}`);
      console.log(`   Google Place ID: ${r.googlePlaceId || '无'}`);
      
      if (metadata) {
        console.log(`   营业时间: ${metadata.openingHours ? '有' : '无'}`);
        console.log(`   价格: ${metadata.price ? `ISK ${metadata.price}` : metadata.priceLevel ? `等级 ${metadata.priceLevel}` : '无'}`);
        if (metadata.michelin_stars) {
          console.log(`   米其林: ${metadata.michelin_stars} 星 (${metadata.michelin_year || '未知年份'})`);
        }
        if (metadata.cuisine_types) {
          console.log(`   菜系: ${metadata.cuisine_types.join(', ')}`);
        }
      }

      if (physicalMetadata) {
        console.log(`   座位数: ${physicalMetadata.seating_capacity || '未知'}`);
        console.log(`   无障碍: ${physicalMetadata.wheelchair_accessible ? '是' : '否'}`);
      }

      console.log('');
    }

    // 5. 显示问题（如果有）
    if (issues.length > 0) {
      console.log('⚠️  发现的问题：\n');
      for (const issue of issues) {
        console.log(`  ${issue.name}:`);
        for (const problem of issue.issues) {
          console.log(`    - ${problem}`);
        }
        console.log('');
      }
    }

    // 6. 统计信息
    console.log('📊 统计信息：');
    const michelinCount = restaurants.filter(r => {
      const metadata = r.metadata as any;
      return metadata?.michelin_stars > 0;
    }).length;
    console.log(`   米其林餐厅: ${michelinCount}`);

    const avgRating = restaurants
      .filter(r => r.rating !== null)
      .reduce((sum, r) => sum + (r.rating || 0), 0) / restaurants.filter(r => r.rating !== null).length;
    console.log(`   平均评分: ${avgRating.toFixed(2)}`);

    const cities = new Set(restaurants.map(r => r.City?.nameCN || r.City?.nameEN).filter(Boolean));
    console.log(`   覆盖城市: ${Array.from(cities).join(', ')}`);

  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
