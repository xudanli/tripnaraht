#!/usr/bin/env tsx
/**
 * 导入冰岛机场POI数据到Place表
 * 数据源：用户提供的冰岛机场JSON数据
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface AirportData {
  metadata: {
    version: string;
    last_updated: string;
    data_sources: string[];
    credibility_score: number;
    language: string;
    description: string;
    critical_importance: string;
    total_airports: number;
    main_airports: string[];
  };
  airports: Array<{
    id: number;
    uuid?: string;
    airportNameCN: string;
    airportNameEN: string;
    category: string;
    location: {
      type: string;
      coordinates: [number, number]; // [lng, lat]
    };
    address: string;
    phoneNumber?: string;
    website?: string;
    cityId?: number;
    cityName: string;
    iata_code?: string;
    icao_code?: string;
    rating?: number;
    review_count?: number;
    description: string;
    description_en?: string;
    airport_type?: string;
    terminals?: number;
    annual_passengers?: string;
    distance_to_reykjavik?: string;
    distance_to_golden_circle?: string;
    distance_to_blue_lagoon?: string;
    main_airlines?: string[];
    terminals_info?: Record<string, any>;
    facilities?: Record<string, any>;
    car_rental_center?: Record<string, any>;
    public_transportation?: Record<string, any>;
    checkin_baggage?: Record<string, any>;
    security_customs?: Record<string, any>;
    duty_free_shopping?: Record<string, any>;
    domestic_flights?: Record<string, any>;
    characteristics?: Record<string, any>;
    why_fly_here?: Record<string, any>;
    comparison_with_kef?: Array<Record<string, any>>;
    highlights?: string[];
    user_reviews_summary?: Record<string, any>;
    decision_relevance?: Record<string, any>;
    westfjords_overview?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

// 将机场类别映射到 PlaceCategory
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  return PlaceCategory.TRANSIT_HUB; // 机场归类为交通枢纽
}

// 构建 metadata
function buildMetadata(airport: AirportData['airports'][0]): any {
  const metadata: any = {
    // 机场基本信息
    airport_id: airport.id,
    airport_name_cn: airport.airportNameCN,
    airport_name_en: airport.airportNameEN,
    airport_type: airport.airport_type,
    category: airport.category,
    
    // 机场代码
    iata_code: airport.iata_code,
    icao_code: airport.icao_code,
    
    // 联系方式
    contact: {
      phone: airport.phoneNumber,
      website: airport.website,
    },
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 标签
    rawTags: [
      'AIRPORT',
      airport.category,
      airport.airport_type || '',
      ...(airport.iata_code ? [airport.iata_code] : []),
      ...(airport.highlights || []),
    ],
    
    // 机场规模信息
    terminals: airport.terminals,
    annual_passengers: airport.annual_passengers,
    
    // 距离信息
    distances: {
      to_reykjavik: airport.distance_to_reykjavik,
      to_golden_circle: airport.distance_to_golden_circle,
      to_blue_lagoon: airport.distance_to_blue_lagoon,
    },
    
    // 航空公司
    main_airlines: airport.main_airlines,
    
    // 航站楼信息
    terminals_info: airport.terminals_info,
    
    // 设施
    facilities: airport.facilities,
    
    // 租车中心
    car_rental_center: airport.car_rental_center,
    
    // 公共交通
    public_transportation: airport.public_transportation,
    
    // 值机行李
    checkin_baggage: airport.checkin_baggage,
    
    // 安检海关
    security_customs: airport.security_customs,
    
    // 免税购物
    duty_free_shopping: airport.duty_free_shopping,
    
    // 国内航班（区域机场）
    domestic_flights: airport.domestic_flights,
    
    // 特点
    characteristics: airport.characteristics,
    
    // 为什么飞这里
    why_fly_here: airport.why_fly_here,
    
    // 与KEF对比
    comparison_with_kef: airport.comparison_with_kef,
    
    // 西峡湾概览（仅IFJ）
    westfjords_overview: airport.westfjords_overview,
    
    // 用户评价摘要
    ...(airport.user_reviews_summary ? {
      user_reviews: {
        avg_rating: airport.user_reviews_summary.avg_rating,
        total_reviews: airport.user_reviews_summary.total_reviews,
        pros: airport.user_reviews_summary.pros,
        cons: airport.user_reviews_summary.cons,
      },
    } : {}),
    
    // 决策相关性
    ...(airport.decision_relevance ? {
      decision_relevance: airport.decision_relevance,
    } : {}),
    
    // 数据来源信息
    data_source: 'Iceland Airport Database',
    last_updated: airport.updatedAt || new Date().toISOString(),
  };

  return metadata;
}

// 查找或创建城市
async function findOrCreateCity(cityName: string, countryCode: string = 'IS'): Promise<number> {
  // 常见城市名映射
  const cityMap: Record<string, string> = {
    'Keflavík': 'Keflavik',
    'Keflavik': 'Keflavik',
    'Akureyri': 'Akureyri',
    'Ísafjörður': 'Isafjordur',
    'Isafjordur': 'Isafjordur',
  };

  const cityNameToSearch = cityMap[cityName] || cityName;

  let city = await prisma.city.findFirst({
    where: {
      OR: [
        { nameEN: cityNameToSearch },
        { nameCN: cityNameToSearch },
      ],
      countryCode: countryCode,
    },
  });

  if (!city) {
    // 创建城市
    const cityNameCN: Record<string, string> = {
      'Keflavik': '凯夫拉维克',
      'Akureyri': '阿克雷里',
      'Isafjordur': '伊萨弗约尔',
    };

    city = await prisma.city.create({
      data: {
        name: cityNameToSearch,
        nameEN: cityNameToSearch,
        nameCN: cityNameCN[cityNameToSearch] || cityNameToSearch,
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
  console.log('导入冰岛机场POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件
    const dataPath = process.argv[2] || path.join(process.cwd(), 'data/iceland-airports.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const airportData: AirportData = JSON.parse(rawData);

    console.log(`  找到 ${airportData.airports.length} 个机场\n`);

    // 2. 导入机场
    console.log('📍 开始导入机场...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const airport of airportData.airports) {
      try {
        // 提取坐标
        const [lng, lat] = airport.location.coordinates;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
          console.log(`  ⚠️  跳过: ${airport.airportNameCN} (无效坐标)`);
          skipped++;
          continue;
        }

        // 查找或创建城市
        const cityId = await findOrCreateCity(airport.cityName);

        // 检查是否已存在（通过 IATA 代码或名称）
        let existingPlace = null;
        if (airport.iata_code) {
          const metadataQuery = await prisma.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "Place"
            WHERE metadata->>'iata_code' = ${airport.iata_code}
            AND "category" = 'TRANSIT_HUB'
            LIMIT 1
          `;
          if (metadataQuery.length > 0) {
            existingPlace = await prisma.place.findUnique({
              where: { id: metadataQuery[0].id },
            });
          }
        }

        if (!existingPlace) {
          existingPlace = await prisma.place.findFirst({
            where: {
              OR: [
                { nameCN: airport.airportNameCN },
                { nameEN: airport.airportNameEN },
              ],
              cityId: cityId,
              category: PlaceCategory.TRANSIT_HUB,
            },
          });
        }

        // 构建数据
        const placeData = {
          uuid: uuidv4(),
          nameCN: airport.airportNameCN,
          nameEN: airport.airportNameEN,
          category: mapCategoryToPlaceCategory(airport.category),
          address: airport.address,
          cityId: cityId,
          googlePlaceId: null,
          rating: airport.rating || null,
          description: airport.description_en || airport.description,
          metadata: buildMetadata(airport) as any,
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
          console.log(`  ✅ 更新: ${airport.airportNameCN} (${airport.iata_code || ''})`);
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
          console.log(`  ✅ 创建: ${airport.airportNameCN} (${airport.iata_code || ''})`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ 错误: ${airport.airportNameCN} - ${error.message}`);
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
