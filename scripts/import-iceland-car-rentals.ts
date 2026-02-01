#!/usr/bin/env tsx
/**
 * 导入冰岛租车公司POI数据到Place表
 * 数据源：用户提供的冰岛租车公司JSON数据
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface CarRentalData {
  metadata: {
    version: string;
    last_updated: string;
    data_sources: string[];
    credibility_score: number;
    language: string;
    description: string;
    total_companies: number;
    categories: string[];
  };
  rental_companies: Array<{
    id: number;
    uuid?: string;
    nameCN: string;
    nameEN: string;
    category: string;
    subcategory: string;
    location_type: string;
    headquarters_location: {
      type: string;
      coordinates: [number, number]; // [lng, lat]
    };
    headquarters_address: string;
    phoneNumber?: string;
    website?: string;
    email?: string;
    cityId?: number;
    cityName: string;
    googlePlaceId?: string;
    rating?: number;
    review_count?: number;
    price_level?: string;
    description: string;
    description_en?: string;
    company_type?: string;
    market_segment?: string;
    reputation?: string;
    avg_price_per_day?: Record<string, any>;
    vehicle_options?: string[];
    locations?: Record<string, any>;
    insurance_options?: Array<{
      name: string;
      cost_per_day: number;
      coverage: string;
      recommendation?: string;
      note?: string;
    }>;
    booking_methods?: string[];
    cancellation_policy?: string;
    deposit_requirement?: string;
    required_documents?: string[];
    highlights?: string[];
    advantages?: string[];
    disadvantages?: string[];
    user_reviews_summary?: Record<string, any>;
    metadata?: Record<string, any>;
    decision_relevance?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

// 将租车公司类别映射到 PlaceCategory
// 租车公司可以归类为 TRANSIT_HUB（交通枢纽）或 ATTRACTION（服务类景点）
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  // 租车公司归类为 TRANSIT_HUB，因为它们是交通服务提供商
  return PlaceCategory.TRANSIT_HUB;
}

// 转换价格等级
function convertPriceLevel(priceLevel?: string): number | undefined {
  if (!priceLevel) return undefined;
  
  // $ = 1, $$ = 2, $$$ = 3, $$$$ = 4
  const count = priceLevel.split('$').length - 1;
  return count > 0 && count <= 4 ? count : undefined;
}

// 构建 metadata
function buildMetadata(company: CarRentalData['rental_companies'][0]): any {
  const metadata: any = {
    // 公司类型信息
    company_type: company.company_type,
    market_segment: company.market_segment,
    reputation: company.reputation,
    
    // 价格信息
    priceLevel: convertPriceLevel(company.price_level),
    avg_price_per_day: company.avg_price_per_day,
    
    // 联系方式
    contact: {
      phone: company.phoneNumber,
      website: company.website,
      email: company.email,
    },
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 标签
    rawTags: [
      'CAR_RENTAL',
      company.category,
      company.subcategory,
      ...(company.market_segment ? [company.market_segment] : []),
      ...(company.highlights || []),
    ],
    
    // 车辆选项
    vehicle_options: company.vehicle_options,
    
    // 位置信息
    locations: company.locations,
    
    // 保险选项
    insurance_options: company.insurance_options,
    
    // 预订信息
    booking_methods: company.booking_methods,
    cancellation_policy: company.cancellation_policy,
    deposit_requirement: company.deposit_requirement,
    required_documents: company.required_documents,
    
    // 优势劣势
    advantages: company.advantages,
    disadvantages: company.disadvantages,
    
    // 用户评价摘要
    ...(company.user_reviews_summary ? {
      user_reviews: {
        avg_rating: company.user_reviews_summary.avg_rating,
        total_reviews: company.user_reviews_summary.total_reviews,
        pros: company.user_reviews_summary.pros,
        cons: company.user_reviews_summary.cons,
      },
    } : {}),
    
    // 决策相关性
    ...(company.decision_relevance ? {
      decision_relevance: company.decision_relevance,
    } : {}),
    
    // 其他元数据
    ...(company.metadata || {}),
    
    // 数据来源信息
    data_source: 'Iceland Car Rental Database',
    last_updated: company.updatedAt || new Date().toISOString(),
  };

  return metadata;
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
  console.log('导入冰岛租车公司POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件（从命令行参数或默认路径）
    const dataPath = process.argv[2] || path.join(process.cwd(), 'data/iceland-car-rentals.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const rentalData: CarRentalData = JSON.parse(rawData);

    console.log(`  找到 ${rentalData.rental_companies.length} 个租车公司\n`);

    // 2. 导入租车公司
    console.log('📍 开始导入租车公司...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const company of rentalData.rental_companies) {
      try {
        // 提取坐标
        const [lng, lat] = company.headquarters_location.coordinates;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
          console.log(`  ⚠️  跳过: ${company.nameCN} (无效坐标)`);
          skipped++;
          continue;
        }

        // 查找或创建城市
        const cityId = await findOrCreateCity(company.cityName);

        // 检查是否已存在（通过名称+城市）
        // 注意：不通过 googlePlaceId 查找，因为数据中的都是占位符
        const existingPlace = await prisma.place.findFirst({
          where: {
            OR: [
              { nameCN: company.nameCN },
              { nameEN: company.nameEN },
            ],
            cityId: cityId,
            category: PlaceCategory.TRANSIT_HUB,
          },
        });

        // 构建数据
        // 如果 googlePlaceId 是占位符（如 "ChIJk..."），则设为 null
        let googlePlaceId = company.googlePlaceId || null;
        if (googlePlaceId) {
          // 检查是否是占位符：包含 "..." 或长度太短
          if (googlePlaceId.includes('...') || googlePlaceId.length < 15 || googlePlaceId === 'ChIJk...') {
            googlePlaceId = null;
          }
        }

        const placeData = {
          uuid: company.uuid || uuidv4(),
          nameCN: company.nameCN,
          nameEN: company.nameEN,
          category: mapCategoryToPlaceCategory(company.category),
          address: company.headquarters_address,
          cityId: cityId,
          googlePlaceId: googlePlaceId,
          rating: company.rating || null,
          description: company.description_en || company.description,
          metadata: buildMetadata(company) as any,
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
              "updatedAt" = ${placeData.updatedAt},
              "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            WHERE "id" = ${existingPlace.id}
          `;
          updated++;
          console.log(`  ✅ 更新: ${company.nameCN}`);
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
          console.log(`  ✅ 创建: ${company.nameCN}`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ 错误: ${company.nameCN} - ${error.message}`);
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
