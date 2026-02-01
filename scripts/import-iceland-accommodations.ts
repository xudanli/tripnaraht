#!/usr/bin/env tsx
/**
 * 导入冰岛住宿POI数据到Place表
 * 数据源：用户提供的冰岛住宿JSON数据
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface AccommodationData {
  metadata: {
    version: string;
    last_updated: string;
    data_sources: string[];
    credibility_score: number;
    language: string;
    total_accommodations: number;
    coverage_area: string;
  };
  accommodations: Array<{
    accommodation_id: string;
    name: string;
    category: string;
    location: string;
    region: string;
    coordinates: [number, number]; // [lat, lng]
    price_range?: {
      low_season_per_night_usd?: number;
      high_season_per_night_usd?: number;
      per_person_per_night_usd?: number;
      dorm_bed_per_night_usd?: number;
      private_room_per_night_usd?: number;
      currency: string;
    };
    rating?: {
      score: number;
      max_score: number;
      review_count: number;
      source: string;
    };
    amenities?: Record<string, any>;
    room_types?: Array<{
      type: string;
      capacity: number;
    }>;
    accessibility?: Record<string, any>;
    facilities?: Record<string, any>;
    atmosphere?: string;
    strategic_value?: string;
    route_position?: string;
    booking_notes?: string;
    critical_note?: string;
    local_specialty?: string;
    nearby_activities?: string[];
    open_season?: string;
    capacity?: string;
  }>;
}

// 将住宿类别映射到 PlaceCategory
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  // 所有住宿都归类为 HOTEL
  return PlaceCategory.HOTEL;
}

// 转换评分（从10分制转换为5分制）
function convertRating(rating?: { score: number; max_score: number }): number | null {
  if (!rating) return null;
  
  // 如果是10分制，转换为5分制
  if (rating.max_score === 10) {
    return (rating.score / 2);
  }
  
  // 如果已经是5分制，直接返回
  if (rating.max_score === 5) {
    return rating.score;
  }
  
  // 其他情况，按比例转换
  return (rating.score / rating.max_score) * 5;
}

// 构建 metadata
function buildMetadata(accommodation: AccommodationData['accommodations'][0]): any {
  const metadata: any = {
    // 住宿基本信息
    accommodation_id: accommodation.accommodation_id,
    accommodation_category: accommodation.category,
    region: accommodation.region,
    
    // 价格信息
    price_range: accommodation.price_range,
    
    // 评分信息
    ...(accommodation.rating ? {
      rating_info: {
        score: accommodation.rating.score,
        max_score: accommodation.rating.max_score,
        review_count: accommodation.rating.review_count,
        source: accommodation.rating.source,
      },
    } : {}),
    
    // 设施
    amenities: accommodation.amenities,
    facilities: accommodation.facilities,
    
    // 房间类型
    room_types: accommodation.room_types,
    
    // 无障碍设施
    accessibility: accommodation.accessibility,
    
    // 其他信息
    atmosphere: accommodation.atmosphere,
    strategic_value: accommodation.strategic_value,
    route_position: accommodation.route_position,
    booking_notes: accommodation.booking_notes,
    critical_note: accommodation.critical_note,
    local_specialty: accommodation.local_specialty,
    nearby_activities: accommodation.nearby_activities,
    open_season: accommodation.open_season,
    capacity: accommodation.capacity,
    
    // 标签
    rawTags: [
      'ACCOMMODATION',
      accommodation.category.toUpperCase(),
      accommodation.region,
      ...(accommodation.amenities ? Object.keys(accommodation.amenities).filter(k => accommodation.amenities![k]) : []),
    ],
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 数据来源信息
    data_source: 'Iceland Accommodation Database',
    last_updated: new Date().toISOString(),
  };

  return metadata;
}

// 查找或创建城市
async function findOrCreateCity(location: string, region: string, countryCode: string = 'IS'): Promise<number> {
  // 从location中提取城市名
  let cityName = location;
  
  // 处理常见格式
  if (location.includes('雷克雅未克') || location.includes('Reykjavik')) {
    cityName = 'Reykjavik';
  } else if (location.includes('Vík') || location.includes('Vik')) {
    cityName = 'Vik';
  } else if (location.includes('Selfoss')) {
    cityName = 'Selfoss';
  } else if (location.includes('Höfn') || location.includes('Hofn')) {
    cityName = 'Hofn';
  } else if (location.includes('Akureyri') || location.includes('阿克雷里')) {
    cityName = 'Akureyri';
  } else if (location.includes('Grundarfjörður') || location.includes('Grundarfjordur')) {
    cityName = 'Grundarfjordur';
  } else if (location.includes('Egilsstaðir') || location.includes('Egilsstadir')) {
    cityName = 'Egilsstadir';
  } else if (location.includes('Mývatn') || location.includes('Myvatn')) {
    cityName = 'Myvatn';
  } else {
    // 尝试从region推断
    if (region === 'Reykjavik') cityName = 'Reykjavik';
    else if (region === 'North') cityName = 'Akureyri';
    else if (region === 'South' || region === 'South Coast') cityName = 'Vik';
    else cityName = 'Reykjavik'; // 默认
  }

  let city = await prisma.city.findFirst({
    where: {
      OR: [
        { nameEN: cityName },
        { nameCN: cityName },
      ],
      countryCode: countryCode,
    },
  });

  if (!city) {
    // 创建城市
    const cityNameCN: Record<string, string> = {
      'Reykjavik': '雷克雅未克',
      'Vik': '维克',
      'Selfoss': '塞尔福斯',
      'Hofn': '霍夫',
      'Akureyri': '阿克雷里',
      'Grundarfjordur': '格伦达菲厄泽',
      'Egilsstadir': '埃吉尔斯塔滇',
      'Myvatn': '米湖',
    };

    city = await prisma.city.create({
      data: {
        name: cityName,
        nameEN: cityName,
        nameCN: cityNameCN[cityName] || cityName,
        countryCode: countryCode,
        timezone: 'Atlantic/Reykjavik',
      },
    });
    console.log(`  ✅ 创建城市: ${city.nameCN} (ID: ${city.id})`);
  }

  return city.id;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛住宿POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件
    const dataPath = process.argv[2] || path.join(process.cwd(), 'data/iceland-accommodations.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const accommodationData: AccommodationData = JSON.parse(rawData);

    console.log(`  找到 ${accommodationData.accommodations.length} 个住宿\n`);

    // 2. 导入住宿
    console.log('📍 开始导入住宿...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const accommodation of accommodationData.accommodations) {
      try {
        // 提取坐标（注意：数据中是 [lat, lng]，需要转换为 [lng, lat]）
        const [lat, lng] = accommodation.coordinates;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
          console.log(`  ⚠️  跳过: ${accommodation.name} (无效坐标)`);
          skipped++;
          continue;
        }

        // 查找或创建城市
        const cityId = await findOrCreateCity(accommodation.location, accommodation.region);

        // 检查是否已存在
        const existingPlace = await prisma.place.findFirst({
          where: {
            OR: [
              { nameCN: accommodation.name },
              { nameEN: accommodation.name },
            ],
            cityId: cityId,
            category: PlaceCategory.HOTEL,
          },
        });

        // 构建数据
        const placeData = {
          uuid: uuidv4(),
          nameCN: accommodation.name,
          nameEN: accommodation.name,
          category: mapCategoryToPlaceCategory(accommodation.category),
          address: accommodation.location,
          cityId: cityId,
          googlePlaceId: null,
          rating: convertRating(accommodation.rating),
          description: accommodation.strategic_value || accommodation.atmosphere || '',
          metadata: buildMetadata(accommodation) as any,
          updatedAt: new Date(),
        };

        if (existingPlace) {
          // 更新现有记录
          await prisma.$executeRaw`
            UPDATE "Place"
            SET 
              "nameCN" = ${placeData.nameCN},
              "nameEN" = ${placeData.nameEN},
              "category" = ${placeData.category}::"PlaceCategory",
              "address" = ${placeData.address},
              "cityId" = ${placeData.cityId},
              "rating" = ${placeData.rating},
              "description" = ${placeData.description},
              "metadata" = ${JSON.stringify(placeData.metadata)}::jsonb,
              "updatedAt" = ${placeData.updatedAt},
              "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            WHERE "id" = ${existingPlace.id}
          `;
          updated++;
          console.log(`  ✅ 更新: ${accommodation.name}`);
        } else {
          // 创建新记录
          const newPlace = await prisma.place.create({
            data: placeData as any,
          });

          // 更新地理位置
          await prisma.$executeRaw`
            UPDATE "Place"
            SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            WHERE "id" = ${newPlace.id}
          `;
          imported++;
          console.log(`  ✅ 创建: ${accommodation.name}`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ 错误: ${accommodation.name} - ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('导入完成');
    console.log('='.repeat(60));
    console.log(`✅ 创建: ${imported}`);
    console.log(`🔄 更新: ${updated}`);
    console.log(`⏭️  跳过: ${skipped}`);
    console.log(`❌ 错误: ${errors}`);
    console.log(`📊 总计: ${imported + updated + skipped + errors}`);
  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
