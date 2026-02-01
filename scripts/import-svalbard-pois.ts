#!/usr/bin/env tsx
/**
 * 导入斯瓦尔巴POI数据到Place表
 * 数据源：docs/svalbard/pois/attractions.json 和 services.json
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
    credibility_score: number;
  };
  attractions: Array<{
    attraction_id: string;
    name: string;
    name_en: string;
    name_no?: string;
    name_ru?: string;
    category: string;
    sub_categories: string[];
    coordinates: [number, number]; // [lat, lng]
    elevation_m: number;
    region: string;
    overview: {
      short_description: string;
      long_description: string;
      unique_fact?: string;
    };
    highlights: string[];
    activities: Array<{
      activity: string;
      duration_minutes?: number;
      duration_hours?: number;
      difficulty: string;
      cost_nok: number;
      guide_required?: boolean;
      note?: string;
      location?: string;
    }>;
    visit_info: {
      recommended_time_hours?: number;
      best_time: string;
      accessibility?: any;
    };
    safety_notes?: string[];
    polar_bear_risk?: string; // 斯瓦尔巴特有字段
    user_ratings?: {
      total_reviews: number;
      average_rating: number;
      top_praises: string[];
      top_complaints: string[];
    };
    decision_relevance?: {
      must_visit?: boolean;
      suitable_for_beginners?: boolean;
      suitable_for_families?: boolean;
      unique_experience?: boolean;
    };
  }>;
}

interface ServiceData {
  metadata: {
    version: string;
    last_updated: string;
    credibility_score: number;
  };
  accommodations?: {
    luxury_hotels?: Array<any>;
    midrange_hotels?: Array<any>;
    budget_options?: Array<any>;
    specialty_accommodations?: Array<any>;
  };
  dining?: {
    fine_dining?: Array<any>;
    casual_dining?: Array<any>;
    grocery_stores?: Array<any>;
  };
  medical_services?: {
    primary_hospital?: any;
    dentistry?: any;
    pharmacies?: Array<any>;
  };
  transportation?: {
    airport?: any;
    local_transport?: any;
    boat_services?: any;
  };
  shopping?: {
    souvenirs?: Array<any>;
    outdoor_equipment?: Array<any>;
  };
  communication?: any;
  education_and_culture?: {
    museums?: Array<any>;
    libraries?: Array<any>;
  };
  emergency_services?: any;
}

/**
 * 导入景点数据
 */
async function importAttractions(cityId: number) {
  const dataPath = path.join(process.cwd(), 'docs/svalbard/pois/attractions.json');
  console.log(`📖 读取景点数据文件: ${dataPath}`);

  if (!fs.existsSync(dataPath)) {
    console.log(`  ⚠️  文件不存在，跳过`);
    return { imported: 0, updated: 0, skipped: 0 };
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const attractionData: AttractionData = JSON.parse(rawData);

  console.log(`  找到 ${attractionData.attractions.length} 个景点\n`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const attraction of attractionData.attractions) {
    try {
      const [lat, lng] = attraction.coordinates;

      // 检查是否已存在
      const existingPlace = await prisma.place.findFirst({
        where: {
          nameEN: attraction.name_en,
          cityId: cityId,
        },
      });

      // 构建metadata
      const metadata = {
        attraction_id: attraction.attraction_id,
        name_no: attraction.name_no,
        name_ru: attraction.name_ru,
        category: attraction.category,
        sub_categories: attraction.sub_categories,
        region: attraction.region,
        elevation_m: attraction.elevation_m,
        highlights: attraction.highlights,
        activities: attraction.activities,
        visit_info: attraction.visit_info,
        safety_notes: attraction.safety_notes || [],
        polar_bear_risk: attraction.polar_bear_risk, // 斯瓦尔巴特有
        user_ratings: attraction.user_ratings,
        decision_relevance: attraction.decision_relevance,
        overview: attraction.overview,
        credibility_score: attractionData.metadata.credibility_score,
      };

      const placeData = {
        nameEN: attraction.name_en,
        nameCN: attraction.name,
        category: PlaceCategory.ATTRACTION,
        cityId: cityId,
        description: attraction.overview.long_description,
        metadata: metadata as any,
        rating: attraction.user_ratings?.average_rating || 5.0,
        updatedAt: new Date(),
      };

      if (existingPlace) {
        await prisma.place.update({
          where: { id: existingPlace.id },
          data: placeData,
        });
        updated++;
        console.log(`  ♻️  更新: ${attraction.name} (${attraction.name_en})`);
      } else {
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

      // 更新location字段
      await prisma.$executeRawUnsafe(
        `UPDATE "Place"
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         WHERE "nameEN" = $3 AND "cityId" = $4`,
        lng,
        lat,
        attraction.name_en,
        cityId
      );

    } catch (error) {
      console.error(`  ❌ 导入失败: ${attraction.name}`, error);
      skipped++;
    }
  }

  return { imported, updated, skipped };
}

/**
 * 导入单个服务项
 */
async function importServiceItem(
  item: any,
  category: PlaceCategory,
  cityId: number,
  credibilityScore: number
): Promise<{ imported: number; updated: number; skipped: number }> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // 跳过没有名称或坐标的项目
    if (!item.name || !item.coordinates || !Array.isArray(item.coordinates) || item.coordinates.length < 2) {
      return { imported, updated, skipped };
    }

    const [lat, lng] = item.coordinates;
    const nameEN = item.name_en || item.name;
    const nameCN = item.name || nameEN;

    // 检查是否已存在
    const existingPlace = await prisma.place.findFirst({
      where: {
        nameEN: nameEN,
        cityId: cityId,
      },
    });

    // 构建metadata
    const metadata = {
      ...item,
      credibility_score: credibilityScore,
    };

    const placeData: any = {
      nameEN: nameEN,
      nameCN: nameCN,
      category: category,
      cityId: cityId,
      description: item.description || item.overview || '',
      metadata: metadata as any,
      rating: item.rating || item.average_rating || 5.0,
      updatedAt: new Date(),
    };

    if (existingPlace) {
      await prisma.place.update({
        where: { id: existingPlace.id },
        data: placeData,
      });
      updated++;
      console.log(`  ♻️  更新: ${nameCN} (${nameEN})`);
    } else {
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
      cityId
    );

  } catch (error) {
    console.error(`  ❌ 导入失败: ${item.name || 'Unknown'}`, error);
    skipped++;
  }

  return { imported, updated, skipped };
}

/**
 * 导入服务设施数据
 */
async function importServices(cityId: number) {
  const dataPath = path.join(process.cwd(), 'docs/svalbard/pois/services.json');
  console.log(`📖 读取服务设施数据文件: ${dataPath}`);

  if (!fs.existsSync(dataPath)) {
    console.log(`  ⚠️  文件不存在，跳过`);
    return { imported: 0, updated: 0, skipped: 0 };
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const serviceData: ServiceData = JSON.parse(rawData);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const credibilityScore = serviceData.metadata.credibility_score;

  console.log(`  开始导入服务设施...\n`);

  // 导入住宿
  if (serviceData.accommodations) {
    console.log('  🏨 导入住宿...');
    const acc = serviceData.accommodations;
    const allAccommodations = [
      ...(acc.luxury_hotels || []),
      ...(acc.midrange_hotels || []),
      ...(acc.budget_options || []),
      ...(acc.specialty_accommodations || []),
    ];
    for (const item of allAccommodations) {
      const result = await importServiceItem(item, PlaceCategory.HOTEL, cityId, credibilityScore);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
    }
  }

  // 导入餐厅
  if (serviceData.dining) {
    console.log('  🍽️  导入餐厅...');
    const dining = serviceData.dining;
    const allRestaurants = [
      ...(dining.fine_dining || []),
      ...(dining.casual_dining || []),
    ];
    for (const item of allRestaurants) {
      const result = await importServiceItem(item, PlaceCategory.RESTAURANT, cityId, credibilityScore);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
    }

    // 导入超市
    if (dining.grocery_stores) {
      console.log('  🛒 导入超市...');
      for (const item of dining.grocery_stores) {
        const result = await importServiceItem(item, PlaceCategory.SHOPPING, cityId, credibilityScore);
        imported += result.imported;
        updated += result.updated;
        skipped += result.skipped;
      }
    }
  }

  // 导入医疗设施
  if (serviceData.medical_services) {
    console.log('  🏥 导入医疗设施...');
    const medical = serviceData.medical_services;
    if (medical.primary_hospital) {
      const result = await importServiceItem(medical.primary_hospital, PlaceCategory.HOSPITAL, cityId, credibilityScore);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
    }
    if (medical.dentistry) {
      const result = await importServiceItem(medical.dentistry, PlaceCategory.HOSPITAL, cityId, credibilityScore);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
    }
    if (medical.pharmacies) {
      for (const item of medical.pharmacies) {
        const result = await importServiceItem(item, PlaceCategory.HOSPITAL, cityId, credibilityScore);
        imported += result.imported;
        updated += result.updated;
        skipped += result.skipped;
      }
    }
  }

  // 导入交通设施
  if (serviceData.transportation) {
    console.log('  ✈️  导入交通设施...');
    const transport = serviceData.transportation;
    if (transport.airport) {
      const result = await importServiceItem(transport.airport, PlaceCategory.TRANSIT_HUB, cityId, credibilityScore);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
    }
  }

  // 导入购物设施
  if (serviceData.shopping) {
    console.log('  🛍️  导入购物设施...');
    const shopping = serviceData.shopping;
    const allShops = [
      ...(shopping.souvenirs || []),
      ...(shopping.outdoor_equipment || []),
    ];
    for (const item of allShops) {
      const result = await importServiceItem(item, PlaceCategory.SHOPPING, cityId, credibilityScore);
      imported += result.imported;
      updated += result.updated;
      skipped += result.skipped;
    }
  }

  // 导入文化教育设施
  if (serviceData.education_and_culture) {
    console.log('  🎭 导入文化教育设施...');
    const culture = serviceData.education_and_culture;
    if (culture.museums) {
      for (const item of culture.museums) {
        const result = await importServiceItem(item, PlaceCategory.ATTRACTION, cityId, credibilityScore);
        imported += result.imported;
        updated += result.updated;
        skipped += result.skipped;
      }
    }
  }

  return { imported, updated, skipped };
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入斯瓦尔巴POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找或创建朗伊尔城
    console.log('🏙️  查找斯瓦尔巴城市...');
    let longyearbyenCity = await prisma.city.findFirst({
      where: {
        nameEN: 'Longyearbyen',
        countryCode: 'SJ',
      },
    });

    if (!longyearbyenCity) {
      console.log('  未找到朗伊尔城，创建城市记录...');
      longyearbyenCity = await prisma.city.create({
        data: {
          name: 'Longyearbyen',
          nameEN: 'Longyearbyen',
          nameCN: '朗伊尔城',
          countryCode: 'SJ',
          timezone: 'Arctic/Longyearbyen',
        },
      });
      console.log(`  ✅ 创建城市: ${longyearbyenCity.nameCN} (ID: ${longyearbyenCity.id})`);
    } else {
      console.log(`  ✅ 找到城市: ${longyearbyenCity.nameCN} (ID: ${longyearbyenCity.id})`);
    }
    console.log('');

    // 2. 导入景点
    console.log('📍 开始导入景点...');
    const attractionsResult = await importAttractions(longyearbyenCity.id);
    console.log('');

    // 3. 导入服务设施
    console.log('🏪 开始导入服务设施...');
    const servicesResult = await importServices(longyearbyenCity.id);
    console.log('');

    // 4. 统计汇总
    console.log('='.repeat(60));
    console.log('📊 导入统计:');
    console.log(`  景点 - 新增: ${attractionsResult.imported}, 更新: ${attractionsResult.updated}, 跳过: ${attractionsResult.skipped}`);
    console.log(`  服务 - 新增: ${servicesResult.imported}, 更新: ${servicesResult.updated}, 跳过: ${servicesResult.skipped}`);
    console.log(`  总计 - 新增: ${attractionsResult.imported + servicesResult.imported}`);
    console.log(`  总计 - 更新: ${attractionsResult.updated + servicesResult.updated}`);
    console.log(`  总计 - 跳过: ${attractionsResult.skipped + servicesResult.skipped}`);
    console.log('='.repeat(60));
    console.log('');

    // 5. 验证导入结果
    console.log('🔍 验证导入结果...');
    const totalPlaces = await prisma.place.count({
      where: { cityId: longyearbyenCity.id },
    });
    console.log(`  斯瓦尔巴POI总数: ${totalPlaces}`);
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
