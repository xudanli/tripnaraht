#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/prisma/prisma.service");
const world_build_context_skill_1 = require("../src/skills/world/world-build-context.skill");
const physical_reality_model_1 = require("../src/trips/decision/models/physical-reality.model");
const crypto_1 = require("crypto");
const luxon_1 = require("luxon");
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}
const FROAD_POIS = [
    { name: 'Selfoss', lat: 63.9330, lng: -21.0023, category: 'ROUTE_GATE' },
    { name: 'Landmannalaugar', lat: 63.9833, lng: -19.0667, category: 'SCENIC' },
    { name: 'Askja 火山', lat: 65.0333, lng: -16.75, category: 'SCENIC' },
    { name: 'Þingvellir', lat: 64.2553, lng: -21.1150, category: 'SCENIC' },
    { name: 'Vík', lat: 63.4194, lng: -19.0067, category: 'ROUTE_GATE' },
    { name: 'Akureyri', lat: 65.6836, lng: -18.1000, category: 'ROUTE_GATE' },
];
async function findOrCreatePlace(prisma, poi) {
    const existing = await prisma.place.findFirst({
        where: {
            OR: [
                { nameCN: { contains: poi.name } },
                { nameEN: { contains: poi.name } },
            ],
            City: {
                countryCode: 'IS',
            },
        },
        include: {
            City: true,
        },
    });
    if (existing) {
        return existing;
    }
    let city = await prisma.city.findFirst({
        where: {
            countryCode: 'IS',
            nameEN: { contains: 'Reykjavik' },
        },
    });
    if (!city) {
        city = await prisma.city.create({
            data: {
                nameCN: '雷克雅未克',
                nameEN: 'Reykjavik',
                countryCode: 'IS',
                latitude: 64.1466,
                longitude: -21.9426,
            },
        });
    }
    const now = new Date();
    const place = await prisma.place.create({
        data: {
            uuid: (0, crypto_1.randomUUID)(),
            nameCN: poi.name,
            nameEN: poi.name,
            category: poi.category === 'SCENIC' ? 'ATTRACTION' : 'POINT_OF_INTEREST',
            cityId: city.id,
            updatedAt: now,
            metadata: {
                countryCode: 'IS',
                coordinates: { lat: poi.lat, lng: poi.lng },
                lat: poi.lat,
                lng: poi.lng,
            },
        },
    });
    await prisma.$executeRaw `
    UPDATE "Place"
    SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
    WHERE id = ${place.id}
  `;
    return place;
}
async function main() {
    var _a, _b, _c, _d, _e, _f, _g;
    log('========================================', 'blue');
    log('创建冰岛 F 路测试行程并展示世界模型', 'blue');
    log('========================================', 'blue');
    console.log('');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const prisma = app.get(prisma_service_1.PrismaService);
    const worldBuildContextSkill = app.get(world_build_context_skill_1.WorldBuildContextSkill);
    try {
        log('步骤 1: 创建 Trip...', 'cyan');
        const startDate = luxon_1.DateTime.now().plus({ days: 30 }).startOf('day');
        const endDate = startDate.plus({ days: 7 });
        const tripId = (0, crypto_1.randomUUID)();
        const trip = await prisma.trip.create({
            data: {
                id: tripId,
                name: '冰岛高地 F 路穿越',
                destination: 'IS',
                startDate: startDate.toJSDate(),
                endDate: endDate.toJSDate(),
                status: 'PLANNING',
                pacingConfig: {
                    fitness: 'high',
                    pace: 'moderate',
                    riskTolerance: 'high',
                },
                budgetConfig: {
                    totalBudget: 50000,
                    currency: 'CNY',
                },
                metadata: {
                    routeType: 'ADVENTURE_DRIVE',
                    vehicleRequired: '4x4',
                    testTrip: true,
                },
                updatedAt: new Date(),
            },
        });
        log(`✅ Trip 创建成功: ${trip.id}`, 'green');
        console.log(`  名称: ${trip.name}`);
        console.log(`  目的地: ${trip.destination}`);
        console.log(`  开始日期: ${startDate.toFormat('yyyy-MM-dd')}`);
        console.log(`  结束日期: ${endDate.toFormat('yyyy-MM-dd')}`);
        console.log('');
        log('步骤 2: 创建 TripDay...', 'cyan');
        const tripDays = [];
        for (let i = 0; i < 8; i++) {
            const dayDate = startDate.plus({ days: i });
            const tripDay = await prisma.tripDay.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    tripId: trip.id,
                    date: dayDate.toJSDate(),
                },
            });
            tripDays.push(tripDay);
        }
        log(`✅ 创建了 ${tripDays.length} 个 TripDay`, 'green');
        console.log('');
        log('步骤 3: 查找或创建 Place...', 'cyan');
        const places = [];
        for (const poi of FROAD_POIS) {
            const place = await findOrCreatePlace(prisma, poi);
            places.push(place);
            log(`  ✅ ${place.nameCN} (ID: ${place.id})`, 'green');
        }
        console.log('');
        log('步骤 4: 创建 ItineraryItem...', 'cyan');
        const itineraryItems = [];
        const day1 = tripDays[0];
        const selfoss = places.find(p => p.nameCN === 'Selfoss');
        const landmannalaugar = places.find(p => p.nameCN === 'Landmannalaugar');
        if (selfoss) {
            const item1 = await prisma.itineraryItem.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    tripDayId: day1.id,
                    placeId: selfoss.id,
                    type: 'ACTIVITY',
                    startTime: luxon_1.DateTime.fromJSDate(day1.date).set({ hour: 9 }).toJSDate(),
                    endTime: luxon_1.DateTime.fromJSDate(day1.date).set({ hour: 10 }).toJSDate(),
                    note: 'F208 起点，准备进入高地',
                },
            });
            itineraryItems.push(item1);
        }
        if (landmannalaugar) {
            const item2 = await prisma.itineraryItem.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    tripDayId: day1.id,
                    placeId: landmannalaugar.id,
                    type: 'ACTIVITY',
                    startTime: luxon_1.DateTime.fromJSDate(day1.date).set({ hour: 14 }).toJSDate(),
                    endTime: luxon_1.DateTime.fromJSDate(day1.date).set({ hour: 18 }).toJSDate(),
                    note: 'Landmannalaugar 高地探索',
                },
            });
            itineraryItems.push(item2);
        }
        for (let i = 1; i < 3; i++) {
            const day = tripDays[i];
            if (landmannalaugar) {
                const item = await prisma.itineraryItem.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripDayId: day.id,
                        placeId: landmannalaugar.id,
                        type: 'ACTIVITY',
                        startTime: luxon_1.DateTime.fromJSDate(day.date).set({ hour: 9 }).toJSDate(),
                        endTime: luxon_1.DateTime.fromJSDate(day.date).set({ hour: 17 }).toJSDate(),
                        note: `第${i + 1}天：高地徒步和温泉`,
                    },
                });
                itineraryItems.push(item);
            }
        }
        const askja = places.find(p => p.nameCN === 'Askja 火山');
        for (let i = 3; i < 5; i++) {
            const day = tripDays[i];
            if (askja) {
                const item = await prisma.itineraryItem.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripDayId: day.id,
                        placeId: askja.id,
                        type: 'ACTIVITY',
                        startTime: luxon_1.DateTime.fromJSDate(day.date).set({ hour: 9 }).toJSDate(),
                        endTime: luxon_1.DateTime.fromJSDate(day.date).set({ hour: 17 }).toJSDate(),
                        note: `第${i + 1}天：Askja 火山探索`,
                    },
                });
                itineraryItems.push(item);
            }
        }
        const thingvellir = places.find(p => p.nameCN === 'Þingvellir');
        for (let i = 5; i < 7; i++) {
            const day = tripDays[i];
            if (thingvellir) {
                const item = await prisma.itineraryItem.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripDayId: day.id,
                        placeId: thingvellir.id,
                        type: 'ACTIVITY',
                        startTime: luxon_1.DateTime.fromJSDate(day.date).set({ hour: 9 }).toJSDate(),
                        endTime: luxon_1.DateTime.fromJSDate(day.date).set({ hour: 17 }).toJSDate(),
                        note: `第${i + 1}天：Þingvellir 国家公园`,
                    },
                });
                itineraryItems.push(item);
            }
        }
        const day8 = tripDays[7];
        const akureyri = places.find(p => p.nameCN === 'Akureyri');
        if (akureyri) {
            const item = await prisma.itineraryItem.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    tripDayId: day8.id,
                    placeId: akureyri.id,
                    type: 'ACTIVITY',
                    startTime: luxon_1.DateTime.fromJSDate(day8.date).set({ hour: 9 }).toJSDate(),
                    endTime: luxon_1.DateTime.fromJSDate(day8.date).set({ hour: 12 }).toJSDate(),
                    note: '第8天：返回 Akureyri，结束 F 路穿越',
                },
            });
            itineraryItems.push(item);
        }
        log(`✅ 创建了 ${itineraryItems.length} 个 ItineraryItem`, 'green');
        console.log('');
        log('步骤 5: 构建世界模型...', 'cyan');
        const worldModelResult = await worldBuildContextSkill.execute({
            tripId: trip.id,
        });
        const { world, missingPieces } = worldModelResult;
        log('✅ 世界模型构建完成', 'green');
        console.log('');
        log('========================================', 'blue');
        log('世界模型详情', 'blue');
        log('========================================', 'blue');
        console.log('');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
        log('PhysicalRealityModel（物理现实模型）', 'magenta');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
        console.log(`国家代码: ${world.physical.countryCode}`);
        console.log(`月份: ${world.physical.month} (${world.physical.month === 7 ? 'F路开放季节' : '可能关闭'})`);
        console.log(`DEM 证据数量: ${world.physical.demEvidence.length}`);
        console.log(`道路状态数量: ${world.physical.roadStates.length}`);
        console.log(`危险区域数量: ${world.physical.hazardZones.length}`);
        console.log(`渡轮状态数量: ${world.physical.ferryStates.length}`);
        if (world.physical.climateSeasonality) {
            console.log(`气候季节性: 可达性评分 ${world.physical.climateSeasonality.accessibilityScore}`);
        }
        if (world.physical.demEvidence.length > 0) {
            console.log('\nDEM 证据:');
            world.physical.demEvidence.slice(0, 3).forEach((evidence, idx) => {
                console.log(`  [${idx + 1}] Segment: ${evidence.segmentId}`);
                if (evidence.segmentId.includes('placeholder')) {
                    console.log(`      ⚠️ 占位符数据（需要从路线段计算）`);
                }
                else {
                    console.log(`      累计爬升: ${evidence.cumulativeAscent}m`);
                    console.log(`      最大坡度: ${evidence.maxSlopePct}%`);
                    console.log(`      滚动爬升(3天): ${evidence.rollingAscent3Days}m`);
                    console.log(`      疲劳指数: ${evidence.fatigueIndex}`);
                }
                console.log(`      违规级别: ${evidence.violation}`);
                console.log(`      说明: ${evidence.explanation}`);
            });
        }
        const fRoads = world.physical.roadStates.filter(r => r.roadId.startsWith('F'));
        if (fRoads.length > 0) {
            console.log(`\nF 路状态 (${fRoads.length} 条):`);
            fRoads.slice(0, 5).forEach((road, idx) => {
                console.log(`  [${idx + 1}] ${road.roadId}`);
                console.log(`      状态: ${road.status}`);
                if (road.seasonOpenFrom && road.seasonOpenTo) {
                    const isOpenInMonth = world.physical.month >= road.seasonOpenFrom &&
                        world.physical.month <= road.seasonOpenTo;
                    console.log(`      季节性开放: ${road.seasonOpenFrom}-${road.seasonOpenTo}月 ${isOpenInMonth ? '✅' : '❌'}`);
                }
                console.log(`      需要4x4: ${road.requires4x4 ? '是' : '否'}`);
            });
        }
        if (world.physical.hazardZones.length > 0) {
            console.log(`\n危险区域 (${world.physical.hazardZones.length} 个):`);
            world.physical.hazardZones.slice(0, 5).forEach((zone, idx) => {
                console.log(`  [${idx + 1}] ${zone.zoneId}: ${zone.type} - ${zone.level}`);
            });
        }
        console.log('');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
        log('HumanCapabilityModel（人体能力模型）', 'magenta');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
        console.log(`用户画像 ID: ${world.human.profileId}`);
        console.log(`单日最大爬升: ${world.human.maxDailyAscentM}m`);
        console.log(`连续3天滚动爬升阈值: ${world.human.rollingAscent3DaysM}m`);
        console.log(`最大可接受坡度: ${world.human.maxSlopePct}%`);
        console.log(`节奏偏好: ${world.human.preferredPace}`);
        console.log(`风险承受度: ${world.human.riskTolerance}`);
        console.log(`高海拔经验: ${world.human.highAltitudeExperience}`);
        if (world.human.maxElevationM) {
            console.log(`最大海拔: ${world.human.maxElevationM}m`);
        }
        console.log('');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
        log('RouteDirection（路线方向）', 'magenta');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
        if (world.routeDirection) {
            console.log(`路线名称: ${world.routeDirection.nameCN || world.routeDirection.name}`);
            console.log(`国家代码: ${world.routeDirection.countryCode}`);
            console.log(`标签: ${((_a = world.routeDirection.tags) === null || _a === void 0 ? void 0 : _a.join(', ')) || '无'}`);
            if (world.routeDirection.seasonality) {
                console.log(`最佳月份: ${((_b = world.routeDirection.seasonality.bestMonths) === null || _b === void 0 ? void 0 : _b.join(', ')) || '无'}`);
                console.log(`避免月份: ${((_c = world.routeDirection.seasonality.avoidMonths) === null || _c === void 0 ? void 0 : _c.join(', ')) || '无'}`);
            }
            if (world.routeDirection.narrative) {
                console.log(`路线哲学: ${world.routeDirection.narrative.philosophy || world.routeDirection.narrative.internal || '无'}`);
            }
        }
        else {
            log('⚠️ RouteDirection 未找到', 'yellow');
        }
        console.log('');
        log('步骤 6: 验证世界模型...', 'cyan');
        const physicalValidation = (0, physical_reality_model_1.validatePhysicalRealityModel)(world.physical);
        if (physicalValidation.valid) {
            log('✅ PhysicalRealityModel 验证通过', 'green');
        }
        else {
            log('⚠️ PhysicalRealityModel 验证失败', 'yellow');
            console.log(`缺失字段: ${physicalValidation.missingFields.join(', ')}`);
        }
        if (Object.keys(missingPieces).length === 0) {
            log('✅ 所有数据完整', 'green');
        }
        else {
            log('⚠️ 存在缺失数据:', 'yellow');
            if (missingPieces.demGaps) {
                console.log(`  - DEM 缺口: ${missingPieces.demGaps.join(', ')}`);
            }
            if (missingPieces.humanProfileIncomplete) {
                console.log(`  - 人体能力模型不完整`);
            }
            if (missingPieces.routeDirectionMissing) {
                console.log(`  - 路线方向缺失`);
            }
            if (missingPieces.physicalRealityIncomplete) {
                console.log(`  - 物理现实模型不完整`);
            }
        }
        console.log('');
        log('步骤 7: 生成 JSON 摘要...', 'cyan');
        const summary = {
            timestamp: new Date().toISOString(),
            trip: {
                id: trip.id,
                name: trip.name,
                destination: trip.destination,
                startDate: trip.startDate.toISOString(),
                endDate: trip.endDate.toISOString(),
                daysCount: tripDays.length,
                itemsCount: itineraryItems.length,
            },
            worldModel: {
                physical: {
                    countryCode: world.physical.countryCode,
                    month: world.physical.month,
                    demEvidenceCount: world.physical.demEvidence.length,
                    roadStatesCount: world.physical.roadStates.length,
                    fRoadsCount: fRoads.length,
                    hazardZonesCount: world.physical.hazardZones.length,
                    ferryStatesCount: world.physical.ferryStates.length,
                    hasClimateSeasonality: !!world.physical.climateSeasonality,
                },
                human: {
                    profileId: world.human.profileId,
                    maxDailyAscentM: world.human.maxDailyAscentM,
                    rollingAscent3DaysM: world.human.rollingAscent3DaysM,
                    maxSlopePct: world.human.maxSlopePct,
                    preferredPace: world.human.preferredPace,
                    riskTolerance: world.human.riskTolerance,
                    highAltitudeExperience: world.human.highAltitudeExperience,
                },
                routeDirection: {
                    name: ((_d = world.routeDirection) === null || _d === void 0 ? void 0 : _d.nameCN) || ((_e = world.routeDirection) === null || _e === void 0 ? void 0 : _e.name),
                    countryCode: (_f = world.routeDirection) === null || _f === void 0 ? void 0 : _f.countryCode,
                    hasPhilosophy: !!((_g = world.routeDirection) === null || _g === void 0 ? void 0 : _g.philosophy),
                },
            },
            validation: {
                physicalRealityValid: physicalValidation.valid,
                missingFields: physicalValidation.missingFields,
                missingPieces,
            },
        };
        console.log(JSON.stringify(summary, null, 2));
        console.log('');
        log('========================================', 'blue');
        log('✅ 行程创建和世界模型构建完成', 'green');
        log('========================================', 'blue');
        console.log('');
        console.log(`📋 Trip ID: ${trip.id}`);
        console.log(`📋 行程名称: ${trip.name}`);
        console.log(`📋 天数: ${tripDays.length} 天`);
        console.log(`📋 行程项: ${itineraryItems.length} 个`);
        console.log('');
        console.log('🌍 世界模型已构建:');
        console.log(`  - PhysicalRealityModel: ${physicalValidation.valid ? '✅' : '⚠️'}`);
        console.log(`  - HumanCapabilityModel: ✅`);
        console.log(`  - RouteDirection: ${world.routeDirection ? '✅' : '⚠️'}`);
        console.log('');
        console.log('💡 下一步:');
        console.log(`  1. 使用 Trip ID 查询行程: GET /api/trips/${trip.id}`);
        console.log(`  2. 使用 Trip ID 构建世界模型: world.buildContext({ tripId: '${trip.id}' })`);
        console.log(`  3. 生成 DEM 证据: POST /api/itinerary-items/trip/${trip.id}/days/:dayId/calculate-travel`);
    }
    catch (error) {
        log(`❌ 操作失败: ${error.message}`, 'red');
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await app.close();
    }
}
main().catch(console.error);
//# sourceMappingURL=create-iceland-froad-trip-with-world-model.js.map