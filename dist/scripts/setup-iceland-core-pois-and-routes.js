#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const TIER_1_POIS = [
    {
        nameCN: '蓝湖',
        nameEN: 'Blue Lagoon',
        tier: 'Tier 1 (Classic)',
        isLandmark: true,
        lat: 63.8804,
        lng: -22.4494,
        description: '地热温泉，世界级地标',
        tags: ['geothermal', 'spa', 'landmark'],
    },
    {
        nameCN: '黄金瀑布',
        nameEN: 'Gullfoss',
        tier: 'Tier 1 (Classic)',
        isLandmark: true,
        lat: 64.3261,
        lng: -20.1200,
        description: '黄金圈核心，气势磅礴',
        tags: ['waterfall', 'golden-circle'],
    },
    {
        nameCN: '杰古沙龙冰河湖',
        nameEN: 'Jökulsárlón',
        tier: 'Tier 1 (Classic)',
        isLandmark: true,
        lat: 64.0485,
        lng: -16.1794,
        description: '巨大的漂浮冰山，电影取景地',
        tags: ['glacier', 'lagoon', 'photography'],
    },
    {
        nameCN: '黑沙滩',
        nameEN: 'Reynisfjara',
        tier: 'Tier 1 (Classic)',
        isLandmark: true,
        lat: 63.4048,
        lng: -19.0453,
        safetyWarning: 'high',
        description: '玄武岩柱和海浪，需标记 safety_warning: high',
        tags: ['beach', 'basalt', 'dangerous'],
    },
    {
        nameCN: '辛格维利尔国家公园',
        nameEN: 'Þingvellir National Park',
        tier: 'Tier 1 (Classic)',
        isLandmark: true,
        lat: 64.2556,
        lng: -21.1297,
        description: '欧美板块裂缝，世界遗产',
        tags: ['national-park', 'geology', 'unesco'],
    },
];
const TIER_2_POIS = [
    {
        nameCN: '钻石沙滩',
        nameEN: 'Diamond Beach',
        tier: 'Tier 2 (Photographer/Advanced)',
        isLandmark: false,
        lat: 64.0485,
        lng: -16.1794,
        description: '就在冰河湖对面，黑沙上的碎冰',
        tags: ['beach', 'photography', 'ice'],
    },
    {
        nameCN: '斯科加瀑布',
        nameEN: 'Skógafoss',
        tier: 'Tier 2 (Photographer/Advanced)',
        isLandmark: false,
        lat: 63.5314,
        lng: -19.5114,
        description: '南岸两大瀑布之一',
        tags: ['waterfall', 'south-coast'],
    },
    {
        nameCN: '塞里雅兰瀑布',
        nameEN: 'Seljalandsfoss',
        tier: 'Tier 2 (Photographer/Advanced)',
        isLandmark: false,
        lat: 63.6156,
        lng: -19.9897,
        description: '南岸两大瀑布之一，可以走到水帘后面',
        tags: ['waterfall', 'south-coast', 'photography'],
    },
    {
        nameCN: '教会山',
        nameEN: 'Kirkjufell',
        tier: 'Tier 2 (Photographer/Advanced)',
        isLandmark: false,
        lat: 64.9417,
        lng: -23.3069,
        description: '《权力的游戏》取景地，斯奈山半岛标志',
        tags: ['mountain', 'photography', 'snaefellsnes'],
    },
    {
        nameCN: '斯蒂德吉尔峡谷',
        nameEN: 'Stuðlagil Canyon',
        tier: 'Tier 2 (Photographer/Advanced)',
        isLandmark: false,
        lat: 65.1644,
        lng: -15.3011,
        description: '网红玄武岩峡谷，近几年非常火，适合增加到"小众/深度"推荐中',
        tags: ['canyon', 'basalt', 'hidden-gem'],
    },
];
const ROUTES = [
    {
        name: 'golden_circle',
        nameCN: '黄金圈',
        nameEN: 'Golden Circle',
        description: '300公里闭环，当天往返雷克雅未克',
        tags: ['classic', 'day-trip', 'easy'],
        regions: ['IS_GOLDEN_CIRCLE'],
        entryHubs: ['IS_REYKJAVIK'],
        seasonality: {
            bestMonths: [5, 6, 7, 8, 9],
        },
        constraints: {
            difficulty: 'easy',
            season: 'all_year',
            duration: '1_day',
        },
        signaturePoiNames: ['Þingvellir National Park', 'Gullfoss', 'Geysir'],
    },
    {
        name: 'ring_road',
        nameCN: '1号公路环岛',
        nameEN: 'Ring Road',
        description: '环绕冰岛一周的主干道，约 1332 公里',
        tags: ['classic', 'road-trip', 'scenic'],
        regions: ['IS_SOUTH_COAST', 'IS_VIK', 'IS_HOFN', 'IS_EGILSSTADIR', 'IS_AKUREYRI'],
        entryHubs: ['IS_REYKJAVIK', 'IS_KEFLAVIK_AIRPORT'],
        seasonality: {
            bestMonths: [5, 6, 7, 8, 9],
        },
        constraints: {
            difficulty: 'medium',
            season: 'all_year',
            duration: '7_to_10_days',
        },
        riskProfile: {
            roadClosure: true,
            weatherWindow: true,
            weatherWindowMonths: [12, 1, 2],
        },
        signaturePoiNames: ['Gullfoss', 'Jökulsárlón', 'Reynisfjara', 'Skógafoss', 'Seljalandsfoss'],
    },
    {
        name: 'diamond_circle',
        nameCN: '钻石圈',
        nameEN: 'Diamond Circle',
        description: '北部的"黄金圈"，针对去北部深度游的用户',
        tags: ['north', 'advanced', 'scenic'],
        regions: ['IS_AKUREYRI', 'IS_HUSAVIK'],
        entryHubs: ['IS_AKUREYRI'],
        seasonality: {
            bestMonths: [6, 7, 8],
        },
        constraints: {
            difficulty: 'medium',
            season: 'summer_only',
            duration: '2_to_3_days',
        },
        signaturePoiNames: ['Goðafoss', 'Lake Mývatn', 'Dettifoss', 'Ásbyrgi', 'Húsavík'],
    },
    {
        name: 'arctic_coast_way',
        nameCN: '北极海岸之路',
        nameEN: 'Arctic Coast Way',
        description: '2019年新开通的官方路线，主打"远离人群"和"北极圈"。沿着北部海岸线行驶，全长 900 公里，经过 21 个渔村',
        tags: ['off-the-beaten-path', 'arctic', 'remote'],
        regions: ['IS_AKUREYRI', 'IS_HUSAVIK'],
        entryHubs: ['IS_AKUREYRI'],
        seasonality: {
            bestMonths: [6, 7, 8],
        },
        constraints: {
            difficulty: 'hard',
            season: 'summer_only',
            duration: '5_to_7_days',
            vehicle: '4x4_recommended',
        },
        riskProfile: {
            roadClosure: true,
            weatherWindow: true,
        },
        signaturePoiNames: [],
    },
    {
        name: 'westfjords_way',
        nameCN: '西峡湾之路',
        nameEN: 'Westfjords Way',
        description: '终极探险路线',
        tags: ['adventure', 'remote', 'extreme'],
        regions: [],
        entryHubs: ['IS_REYKJAVIK'],
        seasonality: {
            bestMonths: [6, 7, 8],
            avoidMonths: [12, 1, 2, 3, 4, 5, 9, 10, 11],
        },
        constraints: {
            difficulty: 'hard',
            season: 'summer_only',
            duration: '3_to_5_days',
            vehicle: '4x4_recommended',
        },
        riskProfile: {
            roadClosure: true,
            weatherWindow: true,
        },
        signaturePoiNames: ['Dynjandi', 'Rauðasandur', 'Látrabjarg'],
    },
];
async function getOrCreateIcelandCity() {
    let city = await prisma.city.findFirst({
        where: { countryCode: 'IS' },
    });
    if (!city) {
        city = await prisma.city.create({
            data: {
                name: 'Iceland',
                countryCode: 'IS',
                nameCN: '冰岛',
                nameEN: 'Iceland',
            },
        });
    }
    return city.id;
}
function isNameMatch(placeName, targetName) {
    if (!placeName)
        return false;
    const normalizedPlace = placeName.toLowerCase().trim();
    const normalizedTarget = targetName.toLowerCase().trim();
    if (normalizedPlace === normalizedTarget)
        return true;
    if (normalizedTarget.length >= 5 && normalizedPlace.includes(normalizedTarget))
        return true;
    if (normalizedPlace.length >= 5 && normalizedTarget.includes(normalizedPlace))
        return true;
    return false;
}
async function findOrCreatePoi(poi, cityId, dryRun) {
    var _a, _b;
    let place = await prisma.place.findFirst({
        where: {
            OR: [
                { nameCN: poi.nameCN },
                { nameEN: poi.nameEN },
            ],
            category: 'ATTRACTION',
        },
    });
    if (!place) {
        const places = await prisma.place.findMany({
            where: {
                OR: [
                    { nameCN: { contains: poi.nameCN } },
                    { nameEN: { contains: poi.nameEN } },
                ],
                category: 'ATTRACTION',
            },
        });
        place = places.find(p => isNameMatch(p.nameCN, poi.nameCN) || isNameMatch(p.nameEN, poi.nameEN)) || places[0];
    }
    if (!place) {
        const result = await prisma.$queryRaw `
      SELECT id, "nameCN", "nameEN", ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
      ) as distance
      FROM "Place"
      WHERE category = 'ATTRACTION'
        AND location IS NOT NULL
        AND ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
        ) < 1000
      ORDER BY distance
      LIMIT 1
    `;
        if (result && result.length > 0) {
            const distance = parseFloat(result[0].distance);
            if (distance < 500) {
                const candidatePlace = await prisma.place.findUnique({
                    where: { id: result[0].id },
                });
                if (candidatePlace && (isNameMatch(candidatePlace.nameCN, poi.nameCN) ||
                    isNameMatch(candidatePlace.nameEN, poi.nameEN) ||
                    (poi.nameCN.includes('蓝湖') && ((_a = candidatePlace.nameCN) === null || _a === void 0 ? void 0 : _a.includes('蓝湖'))) ||
                    (poi.nameEN.includes('Diamond') && ((_b = candidatePlace.nameEN) === null || _b === void 0 ? void 0 : _b.includes('Diamond'))))) {
                    place = candidatePlace;
                    console.log(`    ℹ️  通过坐标匹配找到: ${result[0].nameCN} (距离: ${distance.toFixed(0)}m)`);
                }
            }
        }
    }
    if (place) {
        const metadata = place.metadata || {};
        metadata.tier = poi.tier;
        metadata.is_landmark = poi.isLandmark;
        if (poi.safetyWarning) {
            metadata.safety_warning = poi.safetyWarning;
        }
        if (poi.tags) {
            metadata.tags = [...(metadata.tags || []), ...poi.tags];
        }
        if (!dryRun) {
            await prisma.place.update({
                where: { id: place.id },
                data: {
                    metadata: metadata,
                    cityId: place.cityId || cityId,
                    updatedAt: new Date(),
                },
            });
        }
        console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}更新 POI: ${poi.nameCN} (ID: ${place.id}, cityId: ${place.cityId || cityId})`);
        return place.id;
    }
    else {
        if (!dryRun) {
            const newPlace = await prisma.place.create({
                data: {
                    uuid: (0, crypto_1.randomUUID)(),
                    nameCN: poi.nameCN,
                    nameEN: poi.nameEN,
                    category: 'ATTRACTION',
                    description: poi.description,
                    cityId: cityId,
                    metadata: {
                        tier: poi.tier,
                        is_landmark: poi.isLandmark,
                        safety_warning: poi.safetyWarning,
                        tags: poi.tags || [],
                    },
                    updatedAt: new Date(),
                },
            });
            await prisma.$executeRaw `
        UPDATE "Place"
        SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
        WHERE id = ${newPlace.id}
      `;
            console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}创建 POI: ${poi.nameCN} (ID: ${newPlace.id}, cityId: ${cityId})`);
            return newPlace.id;
        }
        else {
            console.log(`  ✓ [DRY RUN] 将创建 POI: ${poi.nameCN}`);
            return null;
        }
    }
}
async function findPoiIdsByNames(names) {
    const ids = [];
    for (const name of names) {
        const place = await prisma.place.findFirst({
            where: {
                OR: [
                    { nameCN: { contains: name } },
                    { nameEN: { contains: name } },
                ],
                category: 'ATTRACTION',
            },
        });
        if (place) {
            ids.push(place.id);
        }
    }
    return ids;
}
async function createOrUpdateRoute(route, poiIds, dryRun) {
    const existing = await prisma.routeDirection.findFirst({
        where: {
            countryCode: 'IS',
            name: route.name,
        },
    });
    const signaturePois = {
        types: route.tags,
        examples: poiIds.length > 0 ? poiIds.map(id => ({ placeId: id })) : [],
    };
    const routeData = {
        countryCode: 'IS',
        name: route.name,
        nameCN: route.nameCN,
        nameEN: route.nameEN,
        description: route.description,
        tags: route.tags,
        regions: route.regions,
        entryHubs: route.entryHubs,
        seasonality: route.seasonality,
        constraints: route.constraints,
        riskProfile: route.riskProfile,
        signaturePois: signaturePois,
        isActive: true,
        status: 'active',
        updatedAt: new Date(),
    };
    if (existing) {
        if (!dryRun) {
            await prisma.routeDirection.update({
                where: { id: existing.id },
                data: routeData,
            });
        }
        console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}更新路线: ${route.nameCN} (ID: ${existing.id})`);
    }
    else {
        if (!dryRun) {
            await prisma.routeDirection.create({
                data: {
                    ...routeData,
                    uuid: (0, crypto_1.randomUUID)(),
                    createdAt: new Date(),
                },
            });
        }
        console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}创建路线: ${route.nameCN}`);
    }
}
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    console.log('='.repeat(60));
    console.log('冰岛核心景点和路线架构设置');
    console.log('='.repeat(60));
    console.log(`模式: ${dryRun ? '🔍 预览模式（不会实际修改）' : '✅ 执行模式'}`);
    console.log('');
    try {
        console.log('🏙️  查找或创建冰岛城市...');
        const cityId = await getOrCreateIcelandCity();
        console.log(`  ✓ 冰岛城市 ID: ${cityId}\n`);
        console.log('📌 处理 Tier 1 核心景点...');
        const tier1PoiIds = [];
        for (const poi of TIER_1_POIS) {
            const id = await findOrCreatePoi(poi, cityId, dryRun);
            if (id)
                tier1PoiIds.push(id);
        }
        console.log(`  完成 ${TIER_1_POIS.length} 个 Tier 1 POI (找到/创建: ${tier1PoiIds.length})\n`);
        console.log('📌 处理 Tier 2 景点...');
        const tier2PoiIds = [];
        for (const poi of TIER_2_POIS) {
            const id = await findOrCreatePoi(poi, cityId, dryRun);
            if (id)
                tier2PoiIds.push(id);
        }
        console.log(`  完成 ${TIER_2_POIS.length} 个 Tier 2 POI (找到/创建: ${tier2PoiIds.length})\n`);
        console.log('🛣️  创建或更新路线...');
        for (const route of ROUTES) {
            const poiIds = route.signaturePoiNames
                ? await findPoiIdsByNames(route.signaturePoiNames)
                : [];
            await createOrUpdateRoute(route, poiIds, dryRun);
        }
        console.log(`  完成 ${ROUTES.length} 条路线\n`);
        console.log('='.repeat(60));
        console.log('✅ 完成！');
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('❌ 错误:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=setup-iceland-core-pois-and-routes.js.map