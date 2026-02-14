#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const CATEGORY_TO_CANONICAL_TYPE = {
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
    cultural: 'MUSEUM',
    museum: 'MUSEUM',
    church: 'CHURCH',
    historical: 'HISTORICAL_SITE',
    lighthouse: 'LIGHTHOUSE',
    monument: 'MONUMENT',
    gas_station: 'FUEL_STATION',
    fuel_station: 'FUEL_STATION',
    fuel: 'FUEL_STATION',
    charging_station: 'EV_CHARGING',
    ev_charging: 'EV_CHARGING',
    supermarket: 'SUPERMARKET',
    convenience: 'CONVENIENCE_STORE',
    convenience_store: 'CONVENIENCE_STORE',
    restaurant: 'RESTAURANT',
    cafe: 'CAFE',
    fast_food: 'FAST_FOOD',
    bakery: 'BAKERY',
    bar: 'BAR',
    hotel: 'HOTEL',
    guesthouse: 'GUESTHOUSE',
    hostel: 'HOSTEL',
    camping: 'CAMPING',
    campsite: 'CAMPING',
    farm_stay: 'FARM_STAY',
    cabin: 'CABIN',
    hospital: 'HOSPITAL',
    clinic: 'CLINIC',
    pharmacy: 'PHARMACY',
    police: 'POLICE',
    fire_station: 'FIRE_STATION',
    visitor_center: 'INFORMATION_CENTER',
    information_center: 'INFORMATION_CENTER',
    information: 'INFORMATION_CENTER',
    tour_operator: 'TOUR_OPERATOR',
    car_rental: 'CAR_RENTAL',
    car_repair: 'CAR_RENTAL',
    bank: 'BANK_ATM',
    atm: 'BANK_ATM',
    post_office: 'POST_OFFICE',
    wifi_hotspot: 'WIFI_HOTSPOT',
    wifi: 'WIFI_HOTSPOT',
    parking: 'PARKING',
    toilets: 'TOILETS',
    toilet: 'TOILETS',
    shower: 'SHOWER',
    laundry: 'TOILETS',
    car_wash: 'PARKING',
    rest_stop: 'REST_STOP',
    picnic_area: 'PICNIC_AREA',
    airport: 'AIRPORT',
    ferry_terminal: 'PORT_FERRY_TERMINAL',
    bus_station: 'BUS_STATION',
    trailhead: 'TRAILHEAD',
    hiking: 'TRAILHEAD',
    swimming_pool: 'SWIMMING_POOL',
    spa: 'SPA_POOL',
    hot_tub: 'HOT_TUB',
    whale_watching: 'WHALE_WATCHING',
    puffin_watching: 'PUFFIN_WATCHING',
    glacier_walk: 'GLACIER_WALK',
    ice_cave: 'ICE_CAVE',
    snowmobile: 'SNOWMOBILE',
    horse_riding: 'HORSE_RIDING',
    diving: 'DIVING_SNORKELING',
    snorkeling: 'DIVING_SNORKELING',
    kayaking: 'KAYAKING',
    northern_lights: 'NORTHERN_LIGHTS_TOUR',
    aurora: 'AURORA_VIEWING',
};
const CANONICAL_TO_PLACE_CATEGORY = {
    ATTRACTION_NATURE_WATERFALL: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_GLACIER: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_BEACH: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_BLACK_BEACH: client_1.PlaceCategory.ATTRACTION,
    NATIONAL_PARK: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_VOLCANO: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_GEOTHERMAL: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_HOT_SPRING: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_GEYSER: client_1.PlaceCategory.ATTRACTION,
    VIEWPOINT: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_CANYON: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_CAVE: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_MOUNTAIN: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_FJORD: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_LAKE: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_GLACIER_LAGOON: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_LAVA_FIELD: client_1.PlaceCategory.ATTRACTION,
    ATTRACTION_NATURE_BIRD_CLIFF: client_1.PlaceCategory.ATTRACTION,
    MUSEUM: client_1.PlaceCategory.ATTRACTION,
    CHURCH: client_1.PlaceCategory.ATTRACTION,
    HISTORICAL_SITE: client_1.PlaceCategory.ATTRACTION,
    LIGHTHOUSE: client_1.PlaceCategory.ATTRACTION,
    MONUMENT: client_1.PlaceCategory.ATTRACTION,
    FUEL_STATION: client_1.PlaceCategory.SHOPPING,
    EV_CHARGING: client_1.PlaceCategory.SHOPPING,
    SUPERMARKET: client_1.PlaceCategory.SHOPPING,
    CONVENIENCE_STORE: client_1.PlaceCategory.SHOPPING,
    RESTAURANT: client_1.PlaceCategory.RESTAURANT,
    CAFE: client_1.PlaceCategory.RESTAURANT,
    FAST_FOOD: client_1.PlaceCategory.RESTAURANT,
    BAKERY: client_1.PlaceCategory.RESTAURANT,
    BAR: client_1.PlaceCategory.RESTAURANT,
    HOTEL: client_1.PlaceCategory.HOTEL,
    GUESTHOUSE: client_1.PlaceCategory.HOTEL,
    HOSTEL: client_1.PlaceCategory.HOTEL,
    CAMPING: client_1.PlaceCategory.HOTEL,
    FARM_STAY: client_1.PlaceCategory.HOTEL,
    CABIN: client_1.PlaceCategory.HOTEL,
    HOSPITAL: client_1.PlaceCategory.HOSPITAL,
    CLINIC: client_1.PlaceCategory.HOSPITAL,
    PHARMACY: client_1.PlaceCategory.HOSPITAL,
    POLICE: client_1.PlaceCategory.HOSPITAL,
    FIRE_STATION: client_1.PlaceCategory.HOSPITAL,
    INFORMATION_CENTER: client_1.PlaceCategory.TRANSIT_HUB,
    TOUR_OPERATOR: client_1.PlaceCategory.TRANSIT_HUB,
    CAR_RENTAL: client_1.PlaceCategory.TRANSIT_HUB,
    BANK_ATM: client_1.PlaceCategory.TRANSIT_HUB,
    POST_OFFICE: client_1.PlaceCategory.TRANSIT_HUB,
    WIFI_HOTSPOT: client_1.PlaceCategory.TRANSIT_HUB,
    PARKING: client_1.PlaceCategory.TRANSIT_HUB,
    TOILETS: client_1.PlaceCategory.TRANSIT_HUB,
    SHOWER: client_1.PlaceCategory.TRANSIT_HUB,
    REST_STOP: client_1.PlaceCategory.TRANSIT_HUB,
    PICNIC_AREA: client_1.PlaceCategory.TRANSIT_HUB,
    AIRPORT: client_1.PlaceCategory.TRANSIT_HUB,
    PORT_FERRY_TERMINAL: client_1.PlaceCategory.TRANSIT_HUB,
    BUS_STATION: client_1.PlaceCategory.TRANSIT_HUB,
    TRAILHEAD: client_1.PlaceCategory.ATTRACTION,
    SWIMMING_POOL: client_1.PlaceCategory.ATTRACTION,
    SPA_POOL: client_1.PlaceCategory.ATTRACTION,
    HOT_TUB: client_1.PlaceCategory.ATTRACTION,
    WHALE_WATCHING: client_1.PlaceCategory.ATTRACTION,
    PUFFIN_WATCHING: client_1.PlaceCategory.ATTRACTION,
    GLACIER_WALK: client_1.PlaceCategory.ATTRACTION,
    ICE_CAVE: client_1.PlaceCategory.ATTRACTION,
    SNOWMOBILE: client_1.PlaceCategory.ATTRACTION,
    HORSE_RIDING: client_1.PlaceCategory.ATTRACTION,
    DIVING_SNORKELING: client_1.PlaceCategory.ATTRACTION,
    KAYAKING: client_1.PlaceCategory.ATTRACTION,
    NORTHERN_LIGHTS_TOUR: client_1.PlaceCategory.ATTRACTION,
    AURORA_VIEWING: client_1.PlaceCategory.ATTRACTION,
};
const NAME_BASED_OVERRIDES = [
    { pattern: /N1/i, canonicalType: 'FUEL_N1', onlyForCategories: ['gas_station', 'fuel_station', 'fuel', 'car_wash'] },
    { pattern: /Orkan|奥尔坎/i, canonicalType: 'FUEL_ORKAN', onlyForCategories: ['gas_station', 'fuel_station', 'fuel'] },
    { pattern: /ÓB|OB/i, canonicalType: 'FUEL_OB', onlyForCategories: ['gas_station', 'fuel_station', 'fuel'] },
    { pattern: /Bonus|Bónus/i, canonicalType: 'SUPERMARKET_BONUS', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
    { pattern: /Krónan/i, canonicalType: 'SUPERMARKET_KRONAN', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
    { pattern: /Hagkaup/i, canonicalType: 'SUPERMARKET_HAGKAUP', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
    { pattern: /萨姆考普|Samkaup/i, canonicalType: 'SUPERMARKET', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
    { pattern: /内托|Nettó/i, canonicalType: 'SUPERMARKET', onlyForCategories: ['supermarket', 'convenience', 'convenience_store'] },
    { pattern: /黑沙滩|black.*sand|Reynisfjara/i, canonicalType: 'ATTRACTION_NATURE_BLACK_BEACH', onlyForCategories: ['beach', 'viewpoint', 'national_park'] },
    { pattern: /冰河湖|glacier.*lagoon|Jökulsárlón/i, canonicalType: 'ATTRACTION_NATURE_GLACIER_LAGOON', onlyForCategories: ['glacier', 'lake', 'viewpoint'] },
    { pattern: /间歇泉|geyser|Geysir|Strokkur/i, canonicalType: 'ATTRACTION_NATURE_GEYSER', onlyForCategories: ['geothermal', 'geyser'] },
    { pattern: /钻石沙滩|diamond.*beach/i, canonicalType: 'ATTRACTION_NATURE_BEACH', onlyForCategories: ['beach', 'viewpoint'] },
    { pattern: /蓝湖|Blue.*Lagoon/i, canonicalType: 'SPA_POOL', onlyForCategories: ['geothermal', 'spa', 'hot_spring'] },
    { pattern: /露营/i, canonicalType: 'CAMPING' },
    { pattern: /游客.*中心|visitor.*center|信息.*中心/i, canonicalType: 'INFORMATION_CENTER' },
    { pattern: /洗车/i, canonicalType: 'PARKING' },
    { pattern: /洗衣/i, canonicalType: 'TOILETS' },
    { pattern: /充电|charging/i, canonicalType: 'EV_CHARGING' },
    { pattern: /WiFi|wifi/i, canonicalType: 'WIFI_HOTSPOT' },
];
async function migrateIcelandPOIs() {
    console.log('='.repeat(60));
    console.log('冰岛 POI 分类迁移脚本');
    console.log('='.repeat(60));
    console.log('');
    const result = {
        updated: 0,
        skipped: 0,
        errors: 0,
        details: [],
    };
    try {
        const icelandCities = await prisma.city.findMany({
            where: { countryCode: 'IS' },
            select: { id: true, nameCN: true },
        });
        const cityIds = icelandCities.map(c => c.id);
        console.log(`📍 找到 ${icelandCities.length} 个冰岛城市`);
        console.log('');
        const places = await prisma.place.findMany({
            where: { cityId: { in: cityIds } },
        });
        console.log(`📦 找到 ${places.length} 个 POI 需要迁移`);
        console.log('');
        for (const place of places) {
            try {
                const metadata = place.metadata || {};
                const oldCategory = metadata.category || metadata.type || '';
                let newCanonicalType = CATEGORY_TO_CANONICAL_TYPE[oldCategory.toLowerCase()] || 'OTHER';
                const accommodationCategories = ['hotel', 'guesthouse', 'hostel', 'camping', 'cabin', 'farm_stay'];
                const isAccommodation = accommodationCategories.includes(oldCategory.toLowerCase());
                const nameToCheck = `${place.nameCN || ''} ${place.nameEN || ''}`;
                for (const override of NAME_BASED_OVERRIDES) {
                    if (override.onlyForCategories) {
                        if (!override.onlyForCategories.includes(oldCategory.toLowerCase())) {
                            continue;
                        }
                    }
                    if (override.pattern.test(nameToCheck)) {
                        newCanonicalType = override.canonicalType;
                        break;
                    }
                }
                const newPlaceCategory = CANONICAL_TO_PLACE_CATEGORY[newCanonicalType] || place.category;
                const newMetadata = {
                    ...metadata,
                    canonicalType: newCanonicalType,
                    _migratedFrom: {
                        category: metadata.category,
                        type: metadata.type,
                        originalPlaceCategory: place.category,
                        migratedAt: new Date().toISOString(),
                    },
                };
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
            }
            catch (error) {
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
        console.log('');
        console.log('🔍 验证迁移结果...');
        const categoryStats = await prisma.$queryRaw `
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=migrate-iceland-poi-categories.js.map