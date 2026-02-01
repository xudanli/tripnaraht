#!/usr/bin/env tsx
/**
 * 导入冰岛餐厅POI数据到Place表
 * 数据源：用户提供的冰岛餐厅JSON数据
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface RestaurantData {
  metadata: {
    version: string;
    last_updated: string;
    data_sources: string[];
    credibility_score: number;
    language: string;
    description: string;
    total_restaurants: number;
    categories: string[];
  };
  restaurants: Array<{
    id: number;
    uuid?: string;
    nameCN: string;
    nameEN: string;
    category: string;
    subcategory: string;
    location: {
      type: string;
      coordinates: [number, number]; // [lng, lat]
    };
    address: string;
    phoneNumber?: string;
    website?: string;
    cityId?: number;
    cityName: string;
    googlePlaceId?: string;
    michelin_stars?: number;
    michelin_year?: number;
    rating?: number;
    review_count?: number;
    price_level?: string;
    description: string;
    description_en?: string;
    cuisine_types?: string[];
    meal_types?: string[];
    avg_price?: {
      currency: string;
      value: number;
      description: string;
    };
    operating_hours?: Record<string, string>;
    reservation_required?: boolean;
    advance_booking_days?: number;
    walk_in_friendly?: boolean;
    highlights?: string[];
    specialties?: string[];
    dietary_options?: string[];
    languages_spoken?: string[];
    amenities?: string[];
    metadata?: Record<string, any>;
    physicalMetadata?: Record<string, any>;
    user_reviews_summary?: Record<string, any>;
    decision_relevance?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

// 将餐厅类别映射到 PlaceCategory
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  switch (category.toUpperCase()) {
    case 'MICHELIN_STAR':
    case 'ICELANDIC_CUISINE':
    case 'SEAFOOD':
    case 'MEAT':
    case 'TRADITIONAL':
    case 'CASUAL':
    case 'BUDGET':
    case 'FUSION':
      return PlaceCategory.RESTAURANT;
    default:
      return PlaceCategory.RESTAURANT;
  }
}

// 转换营业时间格式
function convertOperatingHours(operatingHours?: Record<string, string>): any {
  if (!operatingHours) return undefined;

  const converted: any = {};
  
  // 映射星期几
  const dayMap: Record<string, string> = {
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    sunday: 'sun',
  };

  for (const [day, hours] of Object.entries(operatingHours)) {
    const normalizedDay = dayMap[day.toLowerCase()] || day.toLowerCase();
    if (hours && hours !== 'CLOSED') {
      converted[normalizedDay] = hours;
    } else if (hours === 'CLOSED') {
      converted[normalizedDay] = 'Closed';
    }
  }

  return Object.keys(converted).length > 0 ? converted : undefined;
}

// 转换价格等级
function convertPriceLevel(priceLevel?: string): number | undefined {
  if (!priceLevel) return undefined;
  
  // $ = 1, $$ = 2, $$$ = 3, $$$$ = 4
  const count = priceLevel.split('$').length - 1;
  return count > 0 && count <= 4 ? count : undefined;
}

// 构建 metadata
function buildMetadata(restaurant: RestaurantData['restaurants'][0]): any {
  const metadata: any = {
    // 营业时间
    openingHours: convertOperatingHours(restaurant.operating_hours),
    
    // 价格信息
    price: restaurant.avg_price?.value,
    priceLevel: convertPriceLevel(restaurant.price_level),
    
    // 联系方式
    contact: {
      phone: restaurant.phoneNumber,
      website: restaurant.website,
    },
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 标签
    rawTags: [
      ...(restaurant.cuisine_types || []),
      ...(restaurant.meal_types || []),
      ...(restaurant.dietary_options || []),
      ...(restaurant.highlights || []),
    ],
    
    // 米其林信息
    ...(restaurant.michelin_stars ? {
      michelin_stars: restaurant.michelin_stars,
      michelin_year: restaurant.michelin_year,
    } : {}),
    
    // 餐厅特色信息
    cuisine_types: restaurant.cuisine_types,
    meal_types: restaurant.meal_types,
    specialties: restaurant.specialties,
    dietary_options: restaurant.dietary_options,
    languages_spoken: restaurant.languages_spoken,
    amenities: restaurant.amenities,
    
    // 预订信息
    reservation_required: restaurant.reservation_required,
    advance_booking_days: restaurant.advance_booking_days,
    walk_in_friendly: restaurant.walk_in_friendly,
    
    // 用户评价摘要
    ...(restaurant.user_reviews_summary ? {
      user_reviews: {
        avg_rating: restaurant.user_reviews_summary.avg_rating,
        total_reviews: restaurant.user_reviews_summary.total_reviews,
        pros: restaurant.user_reviews_summary.pros,
        cons: restaurant.user_reviews_summary.cons,
      },
    } : {}),
    
    // 决策相关性
    ...(restaurant.decision_relevance ? {
      decision_relevance: restaurant.decision_relevance,
    } : {}),
    
    // 其他元数据
    ...(restaurant.metadata || {}),
    
    // 数据来源信息
    data_source: 'Iceland Restaurant Database',
    last_updated: restaurant.updatedAt || new Date().toISOString(),
  };

  return metadata;
}

// 构建 physicalMetadata
function buildPhysicalMetadata(restaurant: RestaurantData['restaurants'][0]): any {
  if (!restaurant.physicalMetadata) return undefined;

  const physicalMetadata: any = {
    ...restaurant.physicalMetadata,
  };

  return physicalMetadata;
}

// 查找或创建城市
async function findOrCreateCity(cityName: string, countryCode: string = 'IS'): Promise<number> {
  let city = await prisma.city.findFirst({
    where: {
      nameEN: cityName,
      countryCode: countryCode,
    },
  });

  if (!city) {
    // 创建城市
    const cityNameCN: Record<string, string> = {
      'Reykjavik': '雷克雅未克',
      'Akureyri': '阿克雷里',
    };

    city = await prisma.city.create({
      data: {
        name: cityName,
        nameEN: cityName,
        nameCN: cityNameCN[cityName] || cityName,
        countryCode: countryCode,
        timezone: cityName === 'Reykjavik' ? 'Atlantic/Reykjavik' : 'Atlantic/Reykjavik',
      },
    });
    console.log(`  ✅ 创建城市: ${city.nameCN} (ID: ${city.id})`);
  }

  return city.id;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛餐厅POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件（从命令行参数或默认路径）
    const dataPath = process.argv[2] || path.join(process.cwd(), 'data/iceland-restaurants.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const restaurantData: RestaurantData = JSON.parse(rawData);

    console.log(`  找到 ${restaurantData.restaurants.length} 个餐厅\n`);

    // 2. 导入餐厅
    console.log('📍 开始导入餐厅...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const restaurant of restaurantData.restaurants) {
      try {
        // 提取坐标
        const [lng, lat] = restaurant.location.coordinates;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
          console.log(`  ⚠️  跳过: ${restaurant.nameCN} (无效坐标)`);
          skipped++;
          continue;
        }

        // 查找或创建城市
        const cityId = await findOrCreateCity(restaurant.cityName);

        // 检查是否已存在（通过 googlePlaceId 或名称+地址）
        let existingPlace = null;
        if (restaurant.googlePlaceId) {
          existingPlace = await prisma.place.findFirst({
            where: {
              googlePlaceId: restaurant.googlePlaceId,
            },
          });
        }

        if (!existingPlace) {
          existingPlace = await prisma.place.findFirst({
            where: {
              nameCN: restaurant.nameCN,
              cityId: cityId,
            },
          });
        }

        // 构建数据
        const placeData = {
          uuid: restaurant.uuid || uuidv4(),
          nameCN: restaurant.nameCN,
          nameEN: restaurant.nameEN,
          category: mapCategoryToPlaceCategory(restaurant.category),
          address: restaurant.address,
          cityId: cityId,
          googlePlaceId: restaurant.googlePlaceId || null,
          rating: restaurant.rating || null,
          description: restaurant.description_en || restaurant.description,
          metadata: buildMetadata(restaurant) as any,
          physicalMetadata: buildPhysicalMetadata(restaurant) as any,
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
              "googlePlaceId" = ${placeData.googlePlaceId},
              "rating" = ${placeData.rating},
              "description" = ${placeData.description},
              "metadata" = ${JSON.stringify(placeData.metadata)}::jsonb,
              "physicalMetadata" = ${JSON.stringify(placeData.physicalMetadata)}::jsonb,
              "updatedAt" = ${placeData.updatedAt},
              "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            WHERE "id" = ${existingPlace.id}
          `;
          updated++;
          console.log(`  ✅ 更新: ${restaurant.nameCN}`);
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
          console.log(`  ✅ 创建: ${restaurant.nameCN}`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ 错误: ${restaurant.nameCN} - ${error.message}`);
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
