#!/usr/bin/env tsx
/**
 * 导入罗弗敦POI数据到Place表
 * 数据源：docs/norway/lofoten/pois/lofoten-pois.json
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface LofotenPoiData {
  元数据: {
    版本: string;
    最后更新: string;
    数据来源: string;
    描述: string;
    可信度评分: number;
    语言: string;
    总POI数: number;
  };
  poi列表: Array<{
    id: number;
    nameCN: string;
    nameEN: string;
    category: string;
    坐标: {
      纬度: number;
      经度: number;
    };
    address: string;
    rating: number;
    description: string;
    metadata: any;
  }>;
}

/**
 * 将类别字符串映射到PlaceCategory枚举
 * 新版本数据已经使用标准类别名称，直接映射即可
 */
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  // 如果已经是标准枚举值，直接返回
  const upperCategory = category.toUpperCase();
  const validCategories: PlaceCategory[] = [
    PlaceCategory.ATTRACTION,
    PlaceCategory.RESTAURANT,
    PlaceCategory.SHOPPING,
    PlaceCategory.HOTEL,
    PlaceCategory.TRANSIT_HUB,
    PlaceCategory.HOSPITAL,
  ];
  
  // 检查是否是有效的枚举值
  if (validCategories.includes(upperCategory as PlaceCategory)) {
    return upperCategory as PlaceCategory;
  }
  
  // 向后兼容：处理旧版本的中文类别
  const categoryMap: Record<string, PlaceCategory> = {
    '徒步路线': PlaceCategory.ATTRACTION,
    '景观点': PlaceCategory.ATTRACTION,
    '渔村': PlaceCategory.ATTRACTION,
    '艺术社区': PlaceCategory.ATTRACTION,
    '博物馆': PlaceCategory.ATTRACTION,
    '海滩': PlaceCategory.ATTRACTION,
    '住宿': PlaceCategory.HOTEL,
    '餐饮': PlaceCategory.RESTAURANT,
    '医疗设施': PlaceCategory.HOSPITAL,
    '信息中心': PlaceCategory.ATTRACTION,
    '设施': PlaceCategory.ATTRACTION,
    // 标准类别映射
    'MUSEUM': PlaceCategory.ATTRACTION, // 注意：数据库中没有MUSEUM，映射到ATTRACTION
    'PARK': PlaceCategory.ATTRACTION,    // 注意：数据库中没有PARK，映射到ATTRACTION
    'CAFE': PlaceCategory.RESTAURANT,   // 咖啡厅映射到餐厅
    'BAR': PlaceCategory.RESTAURANT,    // 酒吧映射到餐厅
    'TRANSPORT': PlaceCategory.TRANSIT_HUB,
    'OTHER': PlaceCategory.ATTRACTION,
  };

  return categoryMap[upperCategory] || categoryMap[category] || PlaceCategory.ATTRACTION;
}

/**
 * 从地址提取城市名
 */
function extractCityFromAddress(address: string): string {
  // 罗弗敦主要城市/地区（按优先级）
  if (address.includes('Leknes') || address.includes('Vestvågøy')) {
    return 'Leknes';
  }
  if (address.includes('Stokmarknes')) {
    return 'Stokmarknes';
  }
  if (address.includes('Kabelvåg') || address.includes('Kabelvåg Harbor')) {
    return 'Kabelvåg';
  }
  if (address.includes('Svolvær') || address.includes('Svolvær Waterfront')) {
    return 'Svolvær';
  }
  if (address.includes('Reine') || address.includes('Moskenes')) {
    return 'Reine';
  }
  if (address.includes('Henningsvær')) {
    return 'Henningsvær';
  }
  if (address.includes('Nusfjord') || address.includes('Flakstad')) {
    return 'Nusfjord';
  }
  if (address.includes('Å') || address.includes('Moskenesøy')) {
    return 'Å';
  }
  if (address.includes('Ramberg')) {
    return 'Ramberg';
  }
  if (address.includes('Gimsøy')) {
    return 'Gimsøy';
  }
  if (address.includes('Trollfjord')) {
    return 'Svolvær'; // Trollfjord靠近Svolvær
  }
  
  // 默认返回Svolvær（罗弗敦最大城市）
  return 'Svolvær';
}

/**
 * 查找或创建城市
 */
async function findOrCreateCity(cityName: string, countryCode: string = 'NO'): Promise<number> {
  // 城市名映射
  const cityMap: Record<string, { en: string; cn: string }> = {
    'Svolvær': { en: 'Svolvær', cn: '斯沃尔韦尔' },
    'Reine': { en: 'Reine', cn: '雷讷' },
    'Henningsvær': { en: 'Henningsvær', cn: '亨宁斯韦尔' },
    'Nusfjord': { en: 'Nusfjord', cn: '努斯峡湾' },
    'Å': { en: 'Å', cn: '奥' },
    'Leknes': { en: 'Leknes', cn: '莱克内斯' },
    'Kabelvåg': { en: 'Kabelvåg', cn: '卡贝尔沃格' },
    'Stokmarknes': { en: 'Stokmarknes', cn: '斯托克马克内斯' },
    'Ramberg': { en: 'Ramberg', cn: '拉姆贝格' },
    'Gimsøy': { en: 'Gimsøy', cn: '吉姆索伊' },
  };

  const cityInfo = cityMap[cityName] || { en: cityName, cn: cityName };

  let city = await prisma.city.findFirst({
    where: {
      OR: [
        { nameEN: cityInfo.en },
        { nameCN: cityInfo.cn },
        { name: cityInfo.en },
      ],
      countryCode: countryCode,
    },
  });

  if (!city) {
    city = await prisma.city.create({
      data: {
        name: cityInfo.en,
        nameEN: cityInfo.en,
        nameCN: cityInfo.cn,
        countryCode: countryCode,
        timezone: 'Europe/Oslo',
      },
    });
    console.log(`  ✅ 创建城市: ${city.nameCN} (ID: ${city.id})`);
  }

  return city.id;
}

/**
 * 转换metadata格式以匹配系统要求
 */
function transformMetadata(poi: LofotenPoiData['poi列表'][0]): any {
  const metadata = poi.metadata || {};
  
  // 转换营业时间格式
  const openingHours: any = {};
  if (metadata.openingHours) {
    if (metadata.openingHours.text) {
      openingHours.text = metadata.openingHours.text;
    }
    if (metadata.openingHours.summer) {
      openingHours.summer = metadata.openingHours.summer;
    }
    if (metadata.openingHours.winter) {
      openingHours.winter = metadata.openingHours.winter;
    }
    if (metadata.openingHours.closed) {
      openingHours.closed = metadata.openingHours.closed;
    }
    if (metadata.openingHours.osmFormat) {
      openingHours.osmFormat = metadata.openingHours.osmFormat;
    }
  }

  // 转换设施格式
  const facilities: any = {};
  if (metadata.facilities) {
    if (metadata.facilities.parking) {
      facilities.parking = {
        hasParking: metadata.facilities.parking.hasParking,
        isFree: metadata.facilities.parking.isFree,
        spots: metadata.facilities.parking.spots,
        price: metadata.facilities.parking.price,
        note: metadata.facilities.parking.note,
      };
    }
    if (metadata.facilities.wheelchair) {
      facilities.wheelchair = {
        accessible: metadata.facilities.wheelchair.accessible,
        hasElevator: metadata.facilities.wheelchair.hasElevator,
      };
    }
    if (metadata.facilities.toilets !== undefined) {
      facilities.toilets = metadata.facilities.toilets;
    }
    if (metadata.facilities.drinkingWater !== undefined) {
      facilities.drinkingWater = metadata.facilities.drinkingWater;
    }
    if (metadata.facilities.payment) {
      facilities.payment = metadata.facilities.payment;
    }
    if (metadata.facilities.internet) {
      facilities.internet = metadata.facilities.internet;
    }
  }

  // 转换联系方式
  const contact: any = {};
  if (metadata.contact) {
    if (metadata.contact.phone) contact.phone = metadata.contact.phone;
    if (metadata.contact.website) contact.website = metadata.contact.website;
  }

  // 转换价格信息
  const ticketPrice: any = {};
  if (metadata.ticketPrice) {
    ticketPrice.adult = metadata.ticketPrice.adult;
    ticketPrice.child = metadata.ticketPrice.child;
    ticketPrice.senior = metadata.ticketPrice.senior;
    ticketPrice.currency = metadata.ticketPrice.currency || 'NOK';
    ticketPrice.note = metadata.ticketPrice.note;
    ticketPrice.period = metadata.ticketPrice.period;
    ticketPrice.avgMeal = metadata.ticketPrice.avgMeal;
    ticketPrice.dayPass = metadata.ticketPrice.dayPass;
  }

  // 构建完整的metadata对象
  const transformedMetadata: any = {
    poi_id: poi.id,
    category: poi.category,
    tags: metadata.tags || [],
    openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
    business_status: metadata.business_status || 'OPERATIONAL',
    facilities: Object.keys(facilities).length > 0 ? facilities : undefined,
    contact: Object.keys(contact).length > 0 ? contact : undefined,
    ticketPrice: Object.keys(ticketPrice).length > 0 ? ticketPrice : undefined,
    // 保留原始metadata中的其他字段
    trailId: metadata.trailId,
    routeSource: metadata.routeSource,
    officialDurationMin: metadata.officialDurationMin,
    googlePopularTimesDurationMin: metadata.googlePopularTimesDurationMin,
    medianDurationBySimilarPoi: metadata.medianDurationBySimilarPoi,
    difficulty: metadata.difficulty,
    elevation_m: metadata.elevation_m,
    distanceKm: metadata.distanceKm,
    elevationGainM: metadata.elevationGainM,
    hotel_tier: metadata.hotel_tier,
    amenities: metadata.amenities,
    crowdLevel: metadata.crowdLevel,
    hazards: metadata.hazards,
    seasonalRisks: metadata.seasonalRisks,
    riskScore: metadata.riskScore,
    requiredExperience: metadata.requiredExperience,
    water: metadata.water,
    surfingConditions: metadata.surfingConditions,
    bestPhotoTime: metadata.bestPhotoTime,
    location_score: metadata.location_score,
    population: metadata.population,
    attractions: metadata.attractions,
    accommodation: metadata.accommodation,
    historicalSignificance: metadata.historicalSignificance,
    accessibility: metadata.accessibility,
    seasonalHighlight: metadata.seasonalHighlight,
    isolationLevel: metadata.isolationLevel,
    bookingNotice: metadata.bookingNotice,
    menu: metadata.menu,
    atmosphere: metadata.atmosphere,
    reservationNeeded: metadata.reservationNeeded,
    services: metadata.services,
    famousFeature: metadata.famousFeature,
    trailAccess: metadata.trailAccess,
    credibility_score: 0.93, // 从元数据中获取
  };

  return transformedMetadata;
}

/**
 * 导入POI数据
 */
async function importPois() {
  // 优先使用新版本数据文件，如果不存在则使用旧版本
  const dataPathV3 = path.join(process.cwd(), 'docs/norway/lofoten/pois/lofoten-pois-v3.json');
  const dataPathV2 = path.join(process.cwd(), 'docs/norway/lofoten/pois/lofoten-pois.json');
  const dataPath = fs.existsSync(dataPathV3) ? dataPathV3 : dataPathV2;
  console.log(`📖 读取POI数据文件: ${dataPath}`);

  if (!fs.existsSync(dataPath)) {
    throw new Error(`文件不存在: ${dataPath}`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const poiData: LofotenPoiData = JSON.parse(rawData);

  console.log(`  找到 ${poiData.poi列表.length} 个POI\n`);
  console.log(`  数据版本: ${poiData.元数据.版本}`);
  console.log(`  可信度评分: ${poiData.元数据.可信度评分}\n`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const poi of poiData.poi列表) {
    try {
      // 检查坐标
      if (!poi.坐标 || !poi.坐标.纬度 || !poi.坐标.经度) {
        console.log(`  ⚠️  跳过: ${poi.nameCN} (缺少坐标)`);
        skipped++;
        continue;
      }

      const lat = poi.坐标.纬度;
      const lng = poi.坐标.经度;

      // 提取城市
      const cityName = extractCityFromAddress(poi.address);
      const cityId = await findOrCreateCity(cityName, 'NO');

      // 检查是否已存在
      const existingPlace = await prisma.place.findFirst({
        where: {
          OR: [
            { nameEN: poi.nameEN, cityId: cityId },
            { nameCN: poi.nameCN, cityId: cityId },
          ],
        },
      });

      // 映射类别
      const category = mapCategoryToPlaceCategory(poi.category);

      // 转换metadata
      const metadata = transformMetadata(poi);

      const placeData = {
        nameEN: poi.nameEN,
        nameCN: poi.nameCN,
        category: category,
        cityId: cityId,
        address: poi.address,
        description: poi.description,
        metadata: metadata as any,
        rating: poi.rating || null,
        updatedAt: new Date(),
      };

      if (existingPlace) {
        await prisma.place.update({
          where: { id: existingPlace.id },
          data: placeData,
        });
        updated++;
        console.log(`  ♻️  更新: ${poi.nameCN} (${poi.nameEN})`);
      } else {
        await prisma.place.create({
          data: {
            ...placeData,
            uuid: uuidv4(),
            createdAt: new Date(),
          },
        });
        imported++;
        console.log(`  ✅ 导入: ${poi.nameCN} (${poi.nameEN})`);
      }

      // 更新location字段（使用PostGIS）
      await prisma.$executeRawUnsafe(
        `UPDATE "Place"
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         WHERE ("nameEN" = $3 OR "nameCN" = $4) AND "cityId" = $5`,
        lng,
        lat,
        poi.nameEN,
        poi.nameCN,
        cityId
      );

    } catch (error) {
      console.error(`  ❌ 导入失败: ${poi.nameCN}`, error);
      errors++;
    }
  }

  return { imported, updated, skipped, errors };
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('导入罗弗敦POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    const result = await importPois();

    console.log('\n' + '='.repeat(60));
    console.log('导入完成');
    console.log('='.repeat(60));
    console.log(`✅ 新增: ${result.imported}`);
    console.log(`♻️  更新: ${result.updated}`);
    console.log(`⚠️  跳过: ${result.skipped}`);
    console.log(`❌ 错误: ${result.errors}`);
    console.log(`📊 总计: ${result.imported + result.updated + result.skipped + result.errors}`);
  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
main();
