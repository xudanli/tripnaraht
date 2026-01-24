#!/usr/bin/env tsx
/**
 * 导入所有冰岛POI数据到Place表
 * 数据源：docs/iceland/pois/*.json
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// POI文件到PlaceCategory的映射
// 注意：PlaceCategory只有5个类型：ATTRACTION, RESTAURANT, SHOPPING, HOTEL, TRANSIT_HUB
const POI_FILE_MAPPING: Record<string, { file: string; category: PlaceCategory; description: string }> = {
  attractions: {
    file: 'attractions.json',
    category: PlaceCategory.ATTRACTION,
    description: '景点',
  },
  accommodations: {
    file: 'accommodations.json',
    category: PlaceCategory.HOTEL, // 映射到HOTEL类型
    description: '住宿',
  },
  services: {
    file: 'services.json',
    category: PlaceCategory.TRANSIT_HUB, // 服务设施映射到TRANSIT_HUB
    description: '服务设施',
  },
  supplies: {
    file: 'supplies.json',
    category: PlaceCategory.SHOPPING, // 补给点映射到SHOPPING
    description: '补给点',
  },
};

interface POIData {
  metadata?: {
    version: string;
    last_updated: string;
    total_attractions?: number;
    total_accommodations?: number;
    total_services?: number;
    total_supplies?: number;
  };
  attractions?: POIItem[];
  accommodations?: POIItem[];
  services?: POIItem[];
  supplies?: POIItem[];
}

interface POIItem {
  attraction_id?: string;
  accommodation_id?: string;
  service_id?: string;
  supply_id?: string;
  name: string;
  name_en: string;
  name_is?: string;
  category?: string;
  type?: string;
  coordinates: [number, number];
  elevation_m?: number;
  region?: string;
  overview?: {
    short_description?: string;
    long_description?: string;
  };
  description?: string;
  [key: string]: any;
}

async function importPOIFile(
  fileKey: string,
  config: { file: string; category: PlaceCategory; description: string },
  reykjavikCity: any
): Promise<{ imported: number; updated: number; skipped: number }> {
  const filePath = path.join(process.cwd(), 'docs/iceland/pois', config.file);

  console.log(`\n📂 处理: ${config.description} (${config.file})`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  文件不存在，跳过`);
    return { imported: 0, updated: 0, skipped: 0 };
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const data: any = JSON.parse(rawData);

  // 根据文件类型获取POI列表（处理不同的键名）
  let poiList = data[fileKey];

  // 特殊处理：services文件使用service_points键名
  if (!poiList && fileKey === 'services') {
    poiList = data.service_points;
  }

  // 特殊处理：supplies文件使用supply_points键名
  if (!poiList && fileKey === 'supplies') {
    poiList = data.supply_points;
  }

  if (!poiList || !Array.isArray(poiList)) {
    console.log(`  ⚠️  未找到${fileKey}数据，跳过`);
    return { imported: 0, updated: 0, skipped: 0 };
  }

  console.log(`  找到 ${poiList.length} 个${config.description}`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const poi of poiList) {
    try {
      // 检查坐标是否存在
      if (!poi.coordinates || !Array.isArray(poi.coordinates) || poi.coordinates.length < 2) {
        console.log(`  ⚠️  跳过: ${poi.name} (缺少坐标)`);
        skipped++;
        continue;
      }

      const [lat, lng] = poi.coordinates;

      // 处理名称字段（不同文件格式不同）
      const nameEN = poi.name_en || poi.name;
      const nameCN = poi.name;

      // 检查是否已存在
      const existingPlace = await prisma.place.findFirst({
        where: {
          nameEN: nameEN,
          cityId: reykjavikCity.id,
        },
      });

      // 获取POI的唯一ID
      const poiId = poi.attraction_id || poi.accommodation_id || poi.service_id || poi.supply_id || `poi_${Date.now()}`;

      // 构建描述
      const description =
        poi.overview?.long_description ||
        poi.overview?.short_description ||
        poi.description ||
        `${poi.name}位于${poi.region || '冰岛'}`;

      // 构建metadata
      const metadata = {
        poi_id: poiId,
        name_is: poi.name_is,
        category: poi.category || poi.type,
        region: poi.region,
        elevation_m: poi.elevation_m,
        overview: poi.overview,
        ...Object.keys(poi).reduce((acc, key) => {
          // 排除已经处理的字段
          if (!['name', 'name_en', 'name_is', 'coordinates', 'overview', 'description'].includes(key)) {
            acc[key] = poi[key];
          }
          return acc;
        }, {} as Record<string, any>),
      };

      const placeData = {
        nameEN: nameEN,
        nameCN: nameCN,
        category: config.category,
        cityId: reykjavikCity.id,
        description: description,
        metadata: metadata as any,
        rating: poi.rating?.score || 4.5, // 使用实际评分或默认值
        updatedAt: new Date(),
      };

      if (existingPlace) {
        // 更新现有记录
        await prisma.place.update({
          where: { id: existingPlace.id },
          data: placeData,
        });
        updated++;
        console.log(`  ♻️  更新: ${nameCN} (${nameEN})`);
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
        console.log(`  ✅ 导入: ${nameCN} (${nameEN})`);
      }

      // 更新location字段
      await prisma.$executeRawUnsafe(
        `UPDATE "Place"
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         WHERE "nameEN" = $3 AND "cityId" = $4`,
        lng,
        lat,
        nameEN,
        reykjavikCity.id
      );
    } catch (error) {
      console.error(`  ❌ 导入失败: ${poi.name}`, error);
      skipped++;
    }
  }

  return { imported, updated, skipped };
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入所有冰岛POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找雷克雅未克城市
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
          updatedAt: new Date(),
        },
      });
      console.log(`  ✅ 创建城市: ${reykjavikCity.nameCN} (ID: ${reykjavikCity.id})`);
    } else {
      console.log(`  ✅ 找到城市: ${reykjavikCity.nameCN} (ID: ${reykjavikCity.id})`);
    }
    console.log('');

    // 2. 导入所有POI文件
    console.log('📍 开始导入POI数据...');
    let totalImported = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const [fileKey, config] of Object.entries(POI_FILE_MAPPING)) {
      const result = await importPOIFile(fileKey, config, reykjavikCity);
      totalImported += result.imported;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 导入统计:');
    console.log(`  新增: ${totalImported} 个`);
    console.log(`  更新: ${totalUpdated} 个`);
    console.log(`  跳过: ${totalSkipped} 个`);
    console.log(`  总计: ${totalImported + totalUpdated + totalSkipped} 个`);
    console.log('='.repeat(60));
    console.log('');

    // 3. 验证导入结果
    console.log('🔍 验证导入结果...');
    const categories = await prisma.place.groupBy({
      by: ['category'],
      where: { cityId: reykjavikCity.id },
      _count: { id: true },
    });

    categories.forEach(cat => {
      console.log(`  ${cat.category}: ${cat._count.id} 个`);
    });

    const totalPlaces = await prisma.place.count({
      where: { cityId: reykjavikCity.id },
    });
    console.log(`\n  冰岛POI总数: ${totalPlaces}`);
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
