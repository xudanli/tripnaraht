#!/usr/bin/env tsx
/**
 * 验证冰岛住宿POI数据导入结果
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证冰岛住宿POI数据导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找所有冰岛住宿（HOTEL类别）
    const accommodations = await prisma.place.findMany({
      where: {
        category: PlaceCategory.HOTEL,
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
      take: 20, // 只显示最近20个
    });

    console.log(`📊 找到 ${accommodations.length} 个冰岛住宿（显示最近20个）\n`);

    // 2. 验证每个住宿的数据完整性
    let validCount = 0;
    let invalidCount = 0;
    const issues: Array<{ name: string; issues: string[] }> = [];

    for (const accommodation of accommodations) {
      const accommodationIssues: string[] = [];

      if (!accommodation.nameCN) accommodationIssues.push('缺少中文名称');
      if (!accommodation.nameEN) accommodationIssues.push('缺少英文名称');
      if (!accommodation.address) accommodationIssues.push('缺少地址');

      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${accommodation.id}
      `;
      
      if (locationQuery.length === 0 || !locationQuery[0].lng || !locationQuery[0].lat) {
        accommodationIssues.push('缺少坐标');
      }

      const metadata = accommodation.metadata as any;
      if (!metadata) {
        accommodationIssues.push('缺少元数据');
      } else {
        if (!metadata.accommodation_category) accommodationIssues.push('缺少住宿类别');
        if (!metadata.price_range) accommodationIssues.push('缺少价格信息');
      }

      if (accommodationIssues.length > 0) {
        invalidCount++;
        issues.push({ name: accommodation.nameCN, issues: accommodationIssues });
      } else {
        validCount++;
      }
    }

    // 3. 显示验证结果
    console.log('📋 验证结果：');
    console.log(`  ✅ 有效: ${validCount}`);
    console.log(`  ❌ 无效: ${invalidCount}\n`);

    // 4. 显示详细信息
    console.log('📝 住宿详细信息：\n');
    for (let i = 0; i < Math.min(12, accommodations.length); i++) {
      const a = accommodations[i];
      const metadata = a.metadata as any;

      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${a.id}
      `;
      const location = locationQuery.length > 0 ? locationQuery[0] : null;

      console.log(`${i + 1}. ${a.nameCN} (${a.nameEN})`);
      console.log(`   ID: ${a.id}`);
      console.log(`   城市: ${a.City?.nameCN || a.City?.nameEN || '未知'}`);
      console.log(`   地址: ${a.address || '无'}`);
      console.log(`   评分: ${a.rating || '无'}`);
      console.log(`   坐标: ${location ? `(${location.lng}, ${location.lat})` : '无'}`);
      
      if (metadata) {
        console.log(`   类别: ${metadata.accommodation_category || '无'}`);
        console.log(`   区域: ${metadata.region || '无'}`);
        
        if (metadata.price_range) {
          const price = metadata.price_range;
          if (price.low_season_per_night_usd) {
            console.log(`   价格: $${price.low_season_per_night_usd}-${price.high_season_per_night_usd || price.low_season_per_night_usd} USD/晚`);
          } else if (price.dorm_bed_per_night_usd) {
            console.log(`   价格: 宿舍 $${price.dorm_bed_per_night_usd}/床位, 私人间 $${price.private_room_per_night_usd}/晚`);
          } else if (price.per_person_per_night_usd) {
            console.log(`   价格: $${price.per_person_per_night_usd}/人/晚`);
          }
        }
        
        if (metadata.strategic_value) {
          console.log(`   战略价值: ${metadata.strategic_value}`);
        }
        if (metadata.critical_note) {
          console.log(`   ⚠️  重要提示: ${metadata.critical_note}`);
        }
        if (metadata.booking_notes) {
          console.log(`   预订提示: ${metadata.booking_notes}`);
        }
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
    
    // 按类别分组
    const categoryGroups: Record<string, number> = {};
    accommodations.forEach(a => {
      const metadata = a.metadata as any;
      const category = metadata?.accommodation_category || '未知';
      categoryGroups[category] = (categoryGroups[category] || 0) + 1;
    });
    
    console.log('   按类别分组:');
    Object.entries(categoryGroups).forEach(([category, count]) => {
      console.log(`     ${category}: ${count} 个`);
    });

    const avgRating = accommodations
      .filter(a => a.rating !== null)
      .reduce((sum, a) => sum + (a.rating || 0), 0) / accommodations.filter(a => a.rating !== null).length;
    console.log(`   平均评分: ${avgRating.toFixed(2)}`);

    const cities = new Set(accommodations.map(a => a.City?.nameCN || a.City?.nameEN).filter(Boolean));
    console.log(`   覆盖城市: ${Array.from(cities).join(', ')}`);

    // 7. 关键住宿点
    console.log('\n⚠️  关键住宿点：');
    const criticalAccommodations = accommodations.filter(a => {
      const metadata = a.metadata as any;
      return metadata?.critical_note || 
             (metadata?.strategic_value && metadata.strategic_value.includes('⚠️')) ||
             (metadata?.route_position && metadata.route_position.includes('南线'));
    });
    
    criticalAccommodations.forEach(a => {
      const metadata = a.metadata as any;
      console.log(`   - ${a.nameCN}: ${metadata?.strategic_value || metadata?.route_position || ''}`);
    });

  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
