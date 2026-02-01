#!/usr/bin/env tsx
/**
 * 导入冰岛超市POI数据到Place表
 * 数据源：用户提供的冰岛超市JSON数据
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface SupermarketData {
  metadata: {
    version: string;
    last_updated: string;
    data_sources: string[];
    credibility_score: number;
    language: string;
    description: string;
    total_supermarkets: number;
    main_chains: number;
  };
  supermarket_chains: Array<{
    id: number;
    uuid?: string;
    chainNameCN: string;
    chainNameEN: string;
    category: string;
    subcategory: string;
    price_level?: string;
    overall_rating?: number;
    review_count?: number;
    description: string;
    description_en?: string;
    market_segment?: string;
    headquarters?: {
      location: {
        type: string;
        coordinates: [number, number];
      };
      address: string;
    };
    chain_info?: Record<string, any>;
    main_locations?: Array<{
      id: string;
      location_name: string;
      address: string;
      coordinates: [number, number];
      operating_hours?: string;
      parking?: string;
      highlights?: string;
    }>;
    product_categories?: string[];
    price_comparison?: Record<string, string>;
    payment_methods?: string[];
    amenities?: string[];
    advantages?: string[];
    disadvantages?: string[];
    user_reviews_summary?: Record<string, any>;
    best_for?: string[];
    route_relevance?: Record<string, string>;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

// 将超市类别映射到 PlaceCategory
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  return PlaceCategory.SHOPPING;
}

// 转换价格等级
function convertPriceLevel(priceLevel?: string): number | undefined {
  if (!priceLevel) return undefined;
  
  // $ = 1, $$ = 2, $$$ = 3, $$$$ = 4
  const count = priceLevel.split('$').length - 1;
  return count > 0 && count <= 4 ? count : undefined;
}

// 解析营业时间
function parseOperatingHours(operatingHours?: string): any {
  if (!operatingHours) return undefined;

  // 尝试解析格式如 "10:00-19:00 (Mon-Sun)" 或 "09:00-20:00 (Mon-Sun)"
  const match = operatingHours.match(/(\d{2}:\d{2})-(\d{2}:\d{2})\s*\(([^)]+)\)/);
  if (match) {
    const [, open, close, days] = match;
    const hours = `${open} - ${close}`;
    
    // 如果包含 Mon-Sun 或类似的，设置为所有天
    if (days.includes('Mon-Sun') || days.includes('Daily')) {
      return {
        mon: hours,
        tue: hours,
        wed: hours,
        thu: hours,
        fri: hours,
        sat: hours,
        sun: hours,
      };
    }
    
    return {
      text: operatingHours,
    };
  }

  return {
    text: operatingHours,
  };
}

// 构建 metadata
function buildMetadata(
  chain: SupermarketData['supermarket_chains'][0],
  location?: SupermarketData['supermarket_chains'][0]['main_locations'][0]
): any {
  const metadata: any = {
    // 超市链信息
    chain_name_cn: chain.chainNameCN,
    chain_name_en: chain.chainNameEN,
    chain_id: chain.id,
    category: chain.category,
    subcategory: chain.subcategory,
    market_segment: chain.market_segment,
    
    // 价格信息
    priceLevel: convertPriceLevel(chain.price_level),
    price_comparison: chain.price_comparison,
    
    // 营业时间
    openingHours: location?.operating_hours 
      ? parseOperatingHours(location.operating_hours)
      : undefined,
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 标签
    rawTags: [
      'SUPERMARKET',
      'GROCERY',
      chain.category,
      chain.subcategory,
      ...(chain.product_categories || []),
      ...(chain.amenities || []),
    ],
    
    // 产品类别
    product_categories: chain.product_categories,
    
    // 支付方式
    payment_methods: chain.payment_methods,
    
    // 设施
    amenities: chain.amenities,
    
    // 优势劣势
    advantages: chain.advantages,
    disadvantages: chain.disadvantages,
    
    // 用户评价摘要
    ...(chain.user_reviews_summary ? {
      user_reviews: {
        avg_rating: chain.user_reviews_summary.avg_rating,
        total_reviews: chain.user_reviews_summary.total_reviews,
        pros: chain.user_reviews_summary.pros,
        cons: chain.user_reviews_summary.cons,
      },
    } : {}),
    
    // 适用人群
    best_for: chain.best_for,
    
    // 路线相关性
    ...(chain.route_relevance ? {
      route_relevance: chain.route_relevance,
    } : {}),
    
    // 位置特定信息
    ...(location ? {
      location_id: location.id,
      location_name: location.location_name,
      parking: location.parking,
      highlights: location.highlights,
    } : {}),
    
    // 数据来源信息
    data_source: 'Iceland Supermarket Database',
    last_updated: chain.updatedAt || new Date().toISOString(),
  };

  return metadata;
}

// 查找或创建城市
async function findOrCreateCity(cityName: string, countryCode: string = 'IS'): Promise<number> {
  // 从地址中提取城市名
  let cityNameToSearch = cityName;
  
  // 常见城市名映射
  const cityMap: Record<string, string> = {
    'Reykjavik': 'Reykjavik',
    'Reykjavík': 'Reykjavik',
    'Keflavik': 'Keflavik',
    'Keflavík': 'Keflavik',
    'Akureyri': 'Akureyri',
    'Vík': 'Vik',
    'Vik': 'Vik',
  };

  cityNameToSearch = cityMap[cityName] || cityName;

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
      'Reykjavik': '雷克雅未克',
      'Keflavik': '凯夫拉维克',
      'Akureyri': '阿克雷里',
      'Vik': '维克',
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

// 从地址提取城市名
function extractCityFromAddress(address: string): string {
  // 尝试从地址中提取城市名
  // 格式如 "Laugavegur 52, 101 Reykjavik" 或 "Reykjavik, Iceland"
  const reykjavikMatch = address.match(/Reykjavik|Reykjavík/i);
  if (reykjavikMatch) return 'Reykjavik';
  
  const keflavikMatch = address.match(/Keflavik|Keflavík/i);
  if (keflavikMatch) return 'Keflavik';
  
  const akureyriMatch = address.match(/Akureyri/i);
  if (akureyriMatch) return 'Akureyri';
  
  const vikMatch = address.match(/\bVík\b|Vik\b/i);
  if (vikMatch) return 'Vik';
  
  // 默认返回雷克雅未克
  return 'Reykjavik';
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛超市POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件（从命令行参数或默认路径）
    const dataPath = process.argv[2] || path.join(process.cwd(), 'data/iceland-supermarkets.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const supermarketData: SupermarketData = JSON.parse(rawData);

    console.log(`  找到 ${supermarketData.supermarket_chains.length} 个超市链\n`);

    // 2. 导入超市（每个分店位置作为独立POI）
    console.log('📍 开始导入超市...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const chain of supermarketData.supermarket_chains) {
      // 如果有主要位置列表，导入每个位置
      if (chain.main_locations && chain.main_locations.length > 0) {
        for (const location of chain.main_locations) {
          try {
            // 提取坐标
            const [lng, lat] = location.coordinates;
            if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
              console.log(`  ⚠️  跳过: ${location.location_name} (无效坐标)`);
              skipped++;
              continue;
            }

            // 从地址提取城市名
            const cityName = extractCityFromAddress(location.address);
            const cityId = await findOrCreateCity(cityName);

            // 检查是否已存在
            const existingPlace = await prisma.place.findFirst({
              where: {
                OR: [
                  { nameCN: location.location_name },
                  { nameEN: location.location_name },
                ],
                cityId: cityId,
                category: PlaceCategory.SHOPPING,
              },
            });

            // 构建数据
            const placeData = {
              uuid: uuidv4(),
              nameCN: location.location_name,
              nameEN: `${chain.chainNameEN} ${location.location_name.replace(chain.chainNameCN, '').trim()}`,
              category: mapCategoryToPlaceCategory(chain.category),
              address: location.address,
              cityId: cityId,
              googlePlaceId: null,
              rating: chain.overall_rating || null,
              description: chain.description_en || chain.description,
              metadata: buildMetadata(chain, location) as any,
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
              console.log(`  ✅ 更新: ${location.location_name}`);
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
              console.log(`  ✅ 创建: ${location.location_name}`);
            }
          } catch (error: any) {
            errors++;
            console.error(`  ❌ 错误: ${location.location_name} - ${error.message}`);
          }
        }
      } else {
        // 如果没有具体位置，使用总部位置
        if (chain.headquarters?.location) {
          try {
            const [lng, lat] = chain.headquarters.location.coordinates;
            if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
              console.log(`  ⚠️  跳过: ${chain.chainNameCN} (无效坐标)`);
              skipped++;
              continue;
            }

            const cityName = extractCityFromAddress(chain.headquarters.address);
            const cityId = await findOrCreateCity(cityName);

            const existingPlace = await prisma.place.findFirst({
              where: {
                OR: [
                  { nameCN: chain.chainNameCN },
                  { nameEN: chain.chainNameEN },
                ],
                cityId: cityId,
                category: PlaceCategory.SHOPPING,
              },
            });

            const placeData = {
              uuid: chain.uuid || uuidv4(),
              nameCN: chain.chainNameCN,
              nameEN: chain.chainNameEN,
              category: mapCategoryToPlaceCategory(chain.category),
              address: chain.headquarters.address,
              cityId: cityId,
              googlePlaceId: null,
              rating: chain.overall_rating || null,
              description: chain.description_en || chain.description,
              metadata: buildMetadata(chain) as any,
              updatedAt: new Date(),
            };

            if (existingPlace) {
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
              console.log(`  ✅ 更新: ${chain.chainNameCN}`);
            } else {
              const newPlace = await prisma.place.create({
                data: placeData as any,
              });

              await prisma.$executeRaw`
                UPDATE "Place"
                SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                WHERE "id" = ${newPlace.id}
              `;
              imported++;
              console.log(`  ✅ 创建: ${chain.chainNameCN}`);
            }
          } catch (error: any) {
            errors++;
            console.error(`  ❌ 错误: ${chain.chainNameCN} - ${error.message}`);
          }
        }
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
