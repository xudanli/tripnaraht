#!/usr/bin/env tsx
/**
 * 冰岛 POI 分类迁移脚本
 * 
 * 将现有的 metadata.category 值迁移到新的 canonicalType 枚举
 * 同时更新 PlaceCategory 以匹配正确的分类
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// ============================================
// 旧分类 -> 新分类映射
// ============================================

/**
 * 旧 metadata.category -> 新 canonicalType 映射
 */
const CATEGORY_TO_CANONICAL_TYPE: Record<string, string> = {
  // 自然景观
  waterfall: 'ATTRACTION_NATURE_WATERFALL',
  glacier: 'ATTRACTION_NATURE_GLACIER',
  beach: 'ATTRACTION_NATURE_BEACH',
  black_beach: 'ATTRACTION_NATURE_BLACK_BEACH',
  national_park: 'NATIONAL_PARK',
  volcano: 'ATTRACTION_NATURE_VOLCANO',
  geothermal: 'ATTRACTION_NATURE_GEOTHERMAL',
  hot_spring: 'ATTRACTION_NATURE_HOT_SPRING',
  geyser: 'ATTRACTION_NATURE_GEYSER',
  viewpoint: 'VIEWPOINT',
  canyon: 'ATTRACTION_NATURE_CANYON',
  cave: 'ATTRACTION_NATURE_CAVE',
  mountain: 'ATTRACTION_NATURE_MOUNTAIN',
  fjord: 'ATTRACTION_NATURE_FJORD',
  lake: 'ATTRACTION_NATURE_LAKE',
  glacier_lagoon: 'ATTRACTION_NATURE_GLACIER_LAGOON',
  lava_field: 'ATTRACTION_NATURE_LAVA_FIELD',
  bird_cliff: 'ATTRACTION_NATURE_BIRD_CLIFF',
  
  // 人文景观
  cultural: 'MUSEUM',  // 文化类默认映射到博物馆，后续可细分
  museum: 'MUSEUM',
  church: 'CHURCH',
  historical: 'HISTORICAL_SITE',
  lighthouse: 'LIGHTHOUSE',
  monument: 'MONUMENT',
  
  // 补给
  gas_station: 'FUEL_STATION',
  fuel_station: 'FUEL_STATION',
  fuel: 'FUEL_STATION',
  charging_station: 'EV_CHARGING',
  ev_charging: 'EV_CHARGING',
  supermarket: 'SUPERMARKET',
  convenience: 'CONVENIENCE_STORE',
  convenience_store: 'CONVENIENCE_STORE',
  
  // 餐饮
  restaurant: 'RESTAURANT',
  cafe: 'CAFE',
  fast_food: 'FAST_FOOD',
  bakery: 'BAKERY',
  bar: 'BAR',
  
  // 住宿
  hotel: 'HOTEL',
  guesthouse: 'GUESTHOUSE',
  hostel: 'HOSTEL',
  camping: 'CAMPING',
  campsite: 'CAMPING',
  farm_stay: 'FARM_STAY',
  cabin: 'CABIN',
  
  // 安全
  hospital: 'HOSPITAL',
  clinic: 'CLINIC',
  pharmacy: 'PHARMACY',
  police: 'POLICE',
  fire_station: 'FIRE_STATION',
  
  // 服务
  visitor_center: 'INFORMATION_CENTER',
  information_center: 'INFORMATION_CENTER',
  information: 'INFORMATION_CENTER',
  tour_operator: 'TOUR_OPERATOR',
  car_rental: 'CAR_RENTAL',
  car_repair: 'CAR_RENTAL',  // 汽车维修归类到租车服务
  bank: 'BANK_ATM',
  atm: 'BANK_ATM',
  post_office: 'POST_OFFICE',
  wifi_hotspot: 'WIFI_HOTSPOT',
  wifi: 'WIFI_HOTSPOT',
  
  // 基础设施
  parking: 'PARKING',
  toilets: 'TOILETS',
  toilet: 'TOILETS',
  shower: 'SHOWER',
  laundry: 'TOILETS',  // 洗衣归类到基础设施
  car_wash: 'PARKING',  // 洗车归类到停车场附属
  rest_stop: 'REST_STOP',
  picnic_area: 'PICNIC_AREA',
  
  // 交通
  airport: 'AIRPORT',
  ferry_terminal: 'PORT_FERRY_TERMINAL',
  bus_station: 'BUS_STATION',
  
  // 活动 — tour-like 旧词映射到 Place 地理实体；可履约 SKU 走 Travel Product Catalog
  trailhead: 'TRAILHEAD',
  hiking: 'TRAILHEAD',
  swimming_pool: 'SWIMMING_POOL',
  spa: 'SPA_POOL',
  hot_tub: 'HOT_TUB',
  // 观鲸/冰川徒步等不再写入 Place：迁移脚本将落地理热点/设施，产品另种
  whale_watching: 'ATTRACTION_NATURE_WHALE_AREA',
  puffin_watching: 'PUFFIN_WATCHING',
  glacier_walk: 'ATTRACTION_NATURE_GLACIER',
  ice_cave: 'ATTRACTION_NATURE_CAVE',
  snowmobile: 'ATTRACTION_NATURE_GLACIER',
  horse_riding: 'FARM_STAY',
  diving: 'ATTRACTION_NATURE_LAKE',
  snorkeling: 'ATTRACTION_NATURE_LAKE',
  kayaking: 'ATTRACTION_NATURE_FJORD',
  northern_lights: 'AURORA_VIEWING',
  aurora: 'AURORA_VIEWING',
};

/**
 * canonicalType -> PlaceCategory 映射
 */
const CANONICAL_TO_PLACE_CATEGORY: Record<string, PlaceCategory> = {
  // 自然景观 -> ATTRACTION
  ATTRACTION_NATURE_WATERFALL: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_GLACIER: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_BEACH: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_BLACK_BEACH: PlaceCategory.ATTRACTION,
  NATIONAL_PARK: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_VOLCANO: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_GEOTHERMAL: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_HOT_SPRING: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_GEYSER: PlaceCategory.ATTRACTION,
  VIEWPOINT: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_CANYON: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_CAVE: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_MOUNTAIN: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_FJORD: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_LAKE: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_GLACIER_LAGOON: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_LAVA_FIELD: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_BIRD_CLIFF: PlaceCategory.ATTRACTION,
  ATTRACTION_NATURE_WHALE_AREA: PlaceCategory.ATTRACTION,
  
  // 人文景观 -> ATTRACTION
  MUSEUM: PlaceCategory.ATTRACTION,
  CHURCH: PlaceCategory.ATTRACTION,
  HISTORICAL_SITE: PlaceCategory.ATTRACTION,
  LIGHTHOUSE: PlaceCategory.ATTRACTION,
  MONUMENT: PlaceCategory.ATTRACTION,
  
  // 补给 -> SHOPPING
  FUEL_STATION: PlaceCategory.SHOPPING,
  EV_CHARGING: PlaceCategory.SHOPPING,
  SUPERMARKET: PlaceCategory.SHOPPING,
  CONVENIENCE_STORE: PlaceCategory.SHOPPING,
  
  // 餐饮 -> RESTAURANT
  RESTAURANT: PlaceCategory.RESTAURANT,
  CAFE: PlaceCategory.RESTAURANT,
  FAST_FOOD: PlaceCategory.RESTAURANT,
  BAKERY: PlaceCategory.RESTAURANT,
  BAR: PlaceCategory.RESTAURANT,
  
  // 住宿 -> HOTEL
  HOTEL: PlaceCategory.HOTEL,
  GUESTHOUSE: PlaceCategory.HOTEL,
  HOSTEL: PlaceCategory.HOTEL,
  CAMPING: PlaceCategory.HOTEL,
  FARM_STAY: PlaceCategory.HOTEL,
  CABIN: PlaceCategory.HOTEL,
  
  // 安全 -> HOSPITAL
  HOSPITAL: PlaceCategory.HOSPITAL,
  CLINIC: PlaceCategory.HOSPITAL,
  PHARMACY: PlaceCategory.HOSPITAL,
  POLICE: PlaceCategory.HOSPITAL,
  FIRE_STATION: PlaceCategory.HOSPITAL,
  
  // 服务 -> TRANSIT_HUB
  INFORMATION_CENTER: PlaceCategory.TRANSIT_HUB,
  TOUR_OPERATOR: PlaceCategory.TRANSIT_HUB,
  CAR_RENTAL: PlaceCategory.TRANSIT_HUB,
  BANK_ATM: PlaceCategory.TRANSIT_HUB,
  POST_OFFICE: PlaceCategory.TRANSIT_HUB,
  WIFI_HOTSPOT: PlaceCategory.TRANSIT_HUB,
  
  // 基础设施 -> TRANSIT_HUB
  PARKING: PlaceCategory.TRANSIT_HUB,
  TOILETS: PlaceCategory.TRANSIT_HUB,
  SHOWER: PlaceCategory.TRANSIT_HUB,
  REST_STOP: PlaceCategory.TRANSIT_HUB,
  PICNIC_AREA: PlaceCategory.TRANSIT_HUB,
  
  // 交通 -> TRANSIT_HUB
  AIRPORT: PlaceCategory.TRANSIT_HUB,
  PORT_FERRY_TERMINAL: PlaceCategory.TRANSIT_HUB,
  BUS_STATION: PlaceCategory.TRANSIT_HUB,
  
  // 活动 -> ATTRACTION
  TRAILHEAD: PlaceCategory.ATTRACTION,
  SWIMMING_POOL: PlaceCategory.ATTRACTION,
  SPA_POOL: PlaceCategory.ATTRACTION,
  HOT_TUB: PlaceCategory.ATTRACTION,
  WHALE_WATCHING: PlaceCategory.ATTRACTION,
  PUFFIN_WATCHING: PlaceCategory.ATTRACTION,
  GLACIER_WALK: PlaceCategory.ATTRACTION,
  ICE_CAVE: PlaceCategory.ATTRACTION,
  SNOWMOBILE: PlaceCategory.ATTRACTION,
  HORSE_RIDING: PlaceCategory.ATTRACTION,
  DIVING_SNORKELING: PlaceCategory.ATTRACTION,
  KAYAKING: PlaceCategory.ATTRACTION,
  NORTHERN_LIGHTS_TOUR: PlaceCategory.ATTRACTION,
  AURORA_VIEWING: PlaceCategory.ATTRACTION,
};

/**
 * 特殊名称映射（根据名称判断更精确的类型）
 * 注意：顺序很重要！更具体的规则应该放在前面
 */
const NAME_BASED_OVERRIDES: Array<{
  pattern: RegExp;
  canonicalType: string;
  // 可选：只在特定原始分类时应用
  onlyForCategories?: string[];
}> = [
  // ========== 住宿类优先排除（防止名称中包含景点关键词的酒店被误判） ==========
  // 如果原始分类是住宿，跳过景点类的名称匹配
  
  // ========== 加油站品牌（仅限加油站类） ==========
  { pattern: /N1/i, canonicalType: 'FUEL_N1', onlyForCategories: ['gas_station', 'fuel_station', 'fuel', 'car_wash'] },
  { pattern: /Orkan|奥尔坎/i, canonicalType: 'FUEL_ORKAN', onlyForCategories: ['gas_station', 'fuel_station', 'fuel'] },
  { pattern: /ÓB|OB/i, canonicalType: 'FUEL_OB', onlyForCategories: ['gas_station', 'fuel_station', 'fuel'] },
  
  // ========== 超市品牌（仅限超市类） ==========
  { pattern: /Bonus|Bónus/i, canonicalType: 'SUPERMARKET_BONUS', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
  { pattern: /Krónan/i, canonicalType: 'SUPERMARKET_KRONAN', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
  { pattern: /Hagkaup/i, canonicalType: 'SUPERMARKET_HAGKAUP', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
  { pattern: /萨姆考普|Samkaup/i, canonicalType: 'SUPERMARKET', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
  { pattern: /内托|Nettó/i, canonicalType: 'SUPERMARKET', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
  
  // ========== 特定景点（仅限景点类） ==========
  { pattern: /黑沙滩|black.*sand|Reynisfjara/i, canonicalType: 'ATTRACTION_NATURE_BLACK_BEACH', onlyForCategories: ['beach', 'viewpoint', 'national_park'] },
  { pattern: /冰河湖|glacier.*lagoon|Jökulsárlón/i, canonicalType: 'ATTRACTION_NATURE_GLACIER_LAGOON', onlyForCategories: ['glacier', 'lake', 'viewpoint'] },
  { pattern: /间歇泉|geyser|Geysir|Strokkur/i, canonicalType: 'ATTRACTION_NATURE_GEYSER', onlyForCategories: ['geothermal', 'geyser'] },
  { pattern: /钻石沙滩|diamond.*beach/i, canonicalType: 'ATTRACTION_NATURE_BEACH', onlyForCategories: ['beach', 'viewpoint'] },
  { pattern: /蓝湖|Blue.*Lagoon/i, canonicalType: 'SPA_POOL', onlyForCategories: ['geothermal', 'spa', 'hot_spring'] },
  
  // ========== 通用规则（任何分类都适用） ==========
  // 露营地
  { pattern: /露营/i, canonicalType: 'CAMPING' },
  
  // 游客中心
  { pattern: /游客.*中心|visitor.*center|信息.*中心/i, canonicalType: 'INFORMATION_CENTER' },
  
  // 洗车
  { pattern: /洗车/i, canonicalType: 'PARKING' },
  
  // 洗衣
  { pattern: /洗衣/i, canonicalType: 'TOILETS' },
  
  // 充电站
  { pattern: /充电|charging/i, canonicalType: 'EV_CHARGING' },
  
  // WiFi
  { pattern: /WiFi|wifi/i, canonicalType: 'WIFI_HOTSPOT' },
];

interface MigrationResult {
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{
    name: string;
    oldCategory: string;
    newCanonicalType: string;
    newPlaceCategory: string;
  }>;
}

async function migrateIcelandPOIs(): Promise<MigrationResult> {
  console.log('='.repeat(60));
  console.log('冰岛 POI 分类迁移脚本');
  console.log('='.repeat(60));
  console.log('');

  const result: MigrationResult = {
    updated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  try {
    // 1. 获取所有冰岛城市
    const icelandCities = await prisma.city.findMany({
      where: { countryCode: 'IS' },
      select: { id: true, nameCN: true },
    });
    const cityIds = icelandCities.map(c => c.id);
    console.log(`📍 找到 ${icelandCities.length} 个冰岛城市`);
    console.log('');

    // 2. 获取所有冰岛 POI
    const places = await prisma.place.findMany({
      where: { cityId: { in: cityIds } },
    });
    console.log(`📦 找到 ${places.length} 个 POI 需要迁移`);
    console.log('');

    // 3. 逐个迁移
    for (const place of places) {
      try {
        const metadata = place.metadata as Record<string, any> || {};
        const oldCategory = metadata.category || metadata.type || '';
        
        // 确定新的 canonicalType
        let newCanonicalType = CATEGORY_TO_CANONICAL_TYPE[oldCategory.toLowerCase()] || 'OTHER';
        
        // 检查名称是否匹配特殊规则
        // 注意：住宿类（hotel, guesthouse, hostel, camping）不应用景点类的名称匹配
        const accommodationCategories = ['hotel', 'guesthouse', 'hostel', 'camping', 'cabin', 'farm_stay'];
        const isAccommodation = accommodationCategories.includes(oldCategory.toLowerCase());
        
        const nameToCheck = `${place.nameCN || ''} ${place.nameEN || ''}`;
        for (const override of NAME_BASED_OVERRIDES) {
          // 如果指定了 onlyForCategories，检查原始分类是否匹配
          if (override.onlyForCategories) {
            if (!override.onlyForCategories.includes(oldCategory.toLowerCase())) {
              continue; // 原始分类不匹配，跳过此规则
            }
          }
          
          if (override.pattern.test(nameToCheck)) {
            newCanonicalType = override.canonicalType;
            break;
          }
        }
        
        // 确定新的 PlaceCategory
        const newPlaceCategory = CANONICAL_TO_PLACE_CATEGORY[newCanonicalType] || place.category;
        
        // 更新 metadata
        const newMetadata = {
          ...metadata,
          canonicalType: newCanonicalType,
          // 保留原始分类信息以便追溯
          _migratedFrom: {
            category: metadata.category,
            type: metadata.type,
            originalPlaceCategory: place.category,
            migratedAt: new Date().toISOString(),
          },
        };
        
        // 执行更新
        await prisma.place.update({
          where: { id: place.id },
          data: {
            category: newPlaceCategory,
            metadata: newMetadata,
          },
        });
        
        result.updated++;
        result.details.push({
          name: place.nameCN || place.nameEN || `ID:${place.id}`,
          oldCategory: oldCategory || '-',
          newCanonicalType,
          newPlaceCategory,
        });
        
        console.log(`✅ ${place.nameCN}: ${oldCategory || '-'} -> ${newCanonicalType} [${newPlaceCategory}]`);
      } catch (error) {
        result.errors++;
        console.error(`❌ 迁移失败: ${place.nameCN}`, error);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 迁移统计:');
    console.log(`  成功更新: ${result.updated}`);
    console.log(`  跳过: ${result.skipped}`);
    console.log(`  错误: ${result.errors}`);
    console.log('='.repeat(60));

    // 4. 验证结果
    console.log('');
    console.log('🔍 验证迁移结果...');
    
    const categoryStats = await prisma.$queryRaw<Array<{ canonical_type: string; count: bigint }>>`
      SELECT 
        metadata->>'canonicalType' as canonical_type,
        COUNT(*) as count
      FROM "Place"
      WHERE "cityId" = ANY(${cityIds})
        AND metadata->>'canonicalType' IS NOT NULL
      GROUP BY metadata->>'canonicalType'
      ORDER BY count DESC
    `;
    
    console.log('');
    console.log('=== canonicalType 分布 ===');
    categoryStats.forEach(s => {
      console.log(`  ${s.canonical_type}: ${s.count}`);
    });

    const placeCategoryStats = await prisma.place.groupBy({
      by: ['category'],
      where: { cityId: { in: cityIds } },
      _count: true,
    });
    
    console.log('');
    console.log('=== PlaceCategory 分布 ===');
    placeCategoryStats.forEach(s => {
      console.log(`  ${s.category}: ${s._count}`);
    });

  } catch (error) {
    console.error('❌ 迁移过程出错:', error);
    throw error;
  }

  return result;
}

async function main() {
  try {
    await migrateIcelandPOIs();
    console.log('');
    console.log('✅ 迁移完成！');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();