#!/usr/bin/env tsx
/**
 * 导入冰岛POI数据到Place表
 * 数据源：docs/iceland/pois/attractions.json
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface AttractionData {
  metadata: {
    version: string;
    last_updated: string;
    total_attractions: number;
  };
  attractions: Array<{
    attraction_id: string;
    name: string;
    name_en: string;
    name_is: string;
    category: string;
    sub_categories: string[];
    coordinates: [number, number]; // [lat, lng]
    elevation_m: number;
    region: string;
    unesco_site?: boolean;
    overview: {
      short_description: string;
      long_description: string;
    };
    highlights: string[];
    activities: Array<{
      activity: string;
      duration_minutes: number;
      difficulty: string;
      cost_usd: number;
    }>;
    visit_info: {
      recommended_time_minutes: number;
      best_time_of_day: string;
      best_season: string;
      accessibility: any;
      fees: any;
    };
    safety_warnings?: string[];
    crowd_level?: any;
    photography?: any;
    nearby_services?: any;
    connections?: any;
  }>;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件
    const dataPath = path.join(process.cwd(), 'docs/iceland/pois/attractions.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const attractionData: AttractionData = JSON.parse(rawData);

    console.log(`  找到 ${attractionData.attractions.length} 个景点\n`);

    // 2. 查找或创建雷克雅未克城市（作为冰岛景点的默认城市）
    console.log('🏙️  查找冰岛城市...');
    let reykjavikCity = await prisma.city.findFirst({
      where: {
        nameEN: 'Reykjavík',
        countryCode: 'IS',
      },
    });

    if (!reykjavikCity) {
      console.log('  未找到雷克雅未克，创建城市记录...');
      reykjavikCity = await prisma.city.create({
        data: {
          name: 'Reykjavík',
          nameEN: 'Reykjavík',
          nameCN: '雷克雅未克',
          countryCode: 'IS',
          timezone: 'Atlantic/Reykjavik',
        },
      });
      console.log(`  ✅ 创建城市: ${reykjavikCity.nameCN} (ID: ${reykjavikCity.id})`);
    } else {
      console.log(`  ✅ 找到城市: ${reykjavikCity.nameCN} (ID: ${reykjavikCity.id})`);
    }
    console.log('');

    // 3. 导入景点
    console.log('📍 开始导入景点...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const attraction of attractionData.attractions) {
      try {
        const [lat, lng] = attraction.coordinates;

        // 检查是否已存在（通过nameEN判断）
        const existingPlace = await prisma.place.findFirst({
          where: {
            nameEN: attraction.name_en,
            cityId: reykjavikCity.id,
          },
        });

        // 构建metadata
        const metadata = {
          attraction_id: attraction.attraction_id,
          name_is: attraction.name_is,
          category: attraction.category,
          sub_categories: attraction.sub_categories,
          region: attraction.region,
          unesco_site: attraction.unesco_site || false,
          elevation_m: attraction.elevation_m,
          highlights: attraction.highlights,
          activities: attraction.activities,
          visit_info: attraction.visit_info,
          safety_warnings: attraction.safety_warnings || [],
          crowd_level: attraction.crowd_level || {},
          photography: attraction.photography || {},
          nearby_services: attraction.nearby_services || {},
          connections: attraction.connections || {},
          overview: attraction.overview,
        };

        const placeData = {
          nameEN: attraction.name_en,
          nameCN: attraction.name,
          category: PlaceCategory.ATTRACTION,
          cityId: reykjavikCity.id,
          description: attraction.overview.long_description,
          metadata: metadata as any,
          rating: 5.0, // 默认评分
          updatedAt: new Date(),
        };

        if (existingPlace) {
          // 更新现有记录
          await prisma.place.update({
            where: { id: existingPlace.id },
            data: placeData,
          });
          updated++;
          console.log(`  ♻️  更新: ${attraction.name} (${attraction.name_en})`);
        } else {
          // 创建新记录
          await prisma.place.create({
            data: {
              ...placeData,
              uuid: uuidv4(),
              createdAt: new Date(),
            },
          });
          imported++;
          console.log(`  ✅ 导入: ${attraction.name} (${attraction.name_en})`);
        }

        // 更新location字段（使用原生SQL，因为Prisma不支持geography类型）
        await prisma.$executeRawUnsafe(
          `UPDATE "Place"
           SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           WHERE "nameEN" = $3 AND "cityId" = $4`,
          lng,
          lat,
          attraction.name_en,
          reykjavikCity.id
        );

      } catch (error) {
        console.error(`  ❌ 导入失败: ${attraction.name}`, error);
        skipped++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 导入统计:');
    console.log(`  新增: ${imported} 个`);
    console.log(`  更新: ${updated} 个`);
    console.log(`  跳过: ${skipped} 个`);
    console.log(`  总计: ${attractionData.attractions.length} 个`);
    console.log('='.repeat(60));
    console.log('');

    // 4. 验证导入结果
    console.log('🔍 验证导入结果...');
    const totalPlaces = await prisma.place.count({
      where: { cityId: reykjavikCity.id },
    });
    console.log(`  冰岛景点总数: ${totalPlaces}`);
    console.log('');

    console.log('✅ 导入完成！');

  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
