#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma = new client_1.PrismaClient();
async function createTripDirectly() {
    try {
        const templateId = 36;
        console.log('='.repeat(70));
        console.log('🧪 直接从数据库创建Trip（验证修复效果）');
        console.log('='.repeat(70));
        console.log('');
        console.log(`📋 步骤1: 获取模板 ${templateId}...`);
        const template = await prisma.routeTemplate.findUnique({
            where: { id: templateId },
            include: {
                routeDirection: true,
            },
        });
        if (!template) {
            console.error(`❌ 模板 ${templateId} 不存在`);
            return;
        }
        console.log(`✅ 模板: ${template.nameCN || template.name}`);
        console.log(`   天数: ${template.durationDays}`);
        console.log('');
        const dayPlans = template.dayPlans;
        if (!Array.isArray(dayPlans)) {
            console.error(`❌ dayPlans格式错误`);
            return;
        }
        console.log(`📋 步骤2: 解析dayPlans...`);
        let totalPois = 0;
        dayPlans.forEach((plan) => {
            const pois = plan.pois || [];
            totalPois += pois.length;
            console.log(`   第${plan.day}天: ${pois.length}个POI, 主题: ${plan.theme || '(无)'}`);
        });
        console.log(`✅ 总POI数: ${totalPois}`);
        console.log('');
        console.log(`📋 步骤3: 创建Trip...`);
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-05');
        const countryCode = 'IS';
        const trip = await prisma.trip.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                destination: countryCode,
                startDate: startDate,
                endDate: endDate,
                status: 'PLANNING',
                budgetConfig: {
                    totalBudget: 50000,
                    currency: 'CNY',
                },
                pacingConfig: {
                    pacePreference: template.defaultPacePreference || 'BALANCED',
                    intensity: 'balanced',
                    transport: 'car',
                },
                metadata: {
                    createdFromTemplate: templateId,
                    templateName: template.nameCN || template.name,
                    dayThemes: dayPlans.reduce((acc, plan) => {
                        if (plan.theme) {
                            acc[plan.day] = plan.theme;
                        }
                        return acc;
                    }, {}),
                },
                updatedAt: new Date(),
            },
        });
        console.log(`✅ Trip创建成功: ${trip.id}`);
        console.log('');
        console.log(`📋 步骤4: 创建TripDay...`);
        const tripDays = [];
        const dayThemes = {};
        for (let i = 0; i < template.durationDays; i++) {
            const dayDate = new Date(startDate);
            dayDate.setDate(dayDate.getDate() + i);
            const dayPlan = dayPlans[i];
            const theme = (dayPlan === null || dayPlan === void 0 ? void 0 : dayPlan.theme) || '';
            if (theme) {
                dayThemes[i + 1] = theme;
            }
            const tripDay = await prisma.tripDay.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    tripId: trip.id,
                    date: dayDate,
                },
            });
            tripDays.push(tripDay);
            console.log(`   第${i + 1}天: ${theme || '(无主题)'}`);
        }
        if (Object.keys(dayThemes).length > 0) {
            const updatedMetadata = {
                ...(trip.metadata || {}),
                dayThemes: dayThemes,
            };
            await prisma.trip.update({
                where: { id: trip.id },
                data: { metadata: updatedMetadata },
            });
            console.log(`✅ 主题已保存到metadata`);
        }
        console.log('');
        console.log(`📋 步骤5: 查询POI并创建ItineraryItem...`);
        const allPoiIds = [];
        dayPlans.forEach((plan) => {
            if (plan.pois && Array.isArray(plan.pois)) {
                plan.pois.forEach((poi) => {
                    if (poi.id && !allPoiIds.includes(poi.id)) {
                        allPoiIds.push(poi.id);
                    }
                });
            }
        });
        console.log(`   查询 ${allPoiIds.length} 个POI...`);
        const places = await prisma.$queryRaw `
      SELECT 
        p.id,
        p.uuid,
        p."nameCN",
        p."nameEN",
        p.category,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        AND p.id = ANY(${allPoiIds}::int[])
    `;
        console.log(`   ✅ 找到 ${places.length} 个POI`);
        console.log('');
        console.log(`📋 步骤6: 创建ItineraryItem...`);
        const itemsToCreate = [];
        let placesMatched = 0;
        let placesMissing = 0;
        for (let i = 0; i < dayPlans.length; i++) {
            const dayPlan = dayPlans[i];
            const tripDay = tripDays[i];
            const pois = dayPlan.pois || [];
            const sortedPois = [...pois].sort((a, b) => (a.order || 0) - (b.order || 0));
            for (const poi of sortedPois) {
                const place = places.find(p => p.id === poi.id || p.uuid === poi.uuid);
                if (!place) {
                    placesMissing++;
                    console.log(`   ⚠️  第${i + 1}天: POI ${poi.id} 未找到`);
                    continue;
                }
                placesMatched++;
                const startTime = new Date(tripDay.date);
                startTime.setHours(9 + itemsToCreate.filter(item => item.tripDayId === tripDay.id).length * 2, 0, 0, 0);
                const endTime = new Date(startTime);
                endTime.setHours(startTime.getHours() + 2);
                let note = `模板${poi.required ? '要求' : '推荐'}的${place.category === 'ATTRACTION' ? '景点' : '餐厅'}: ${place.nameCN}`;
                if (poi.required) {
                    note += ' [必游]';
                }
                itemsToCreate.push({
                    id: (0, crypto_1.randomUUID)(),
                    tripDayId: tripDay.id,
                    placeId: place.id,
                    type: place.category === 'RESTAURANT' ? 'MEAL' : 'ACTIVITY',
                    startTime: startTime,
                    endTime: endTime,
                    note: note,
                });
            }
        }
        if (itemsToCreate.length > 0) {
            await prisma.itineraryItem.createMany({
                data: itemsToCreate,
            });
            console.log(`   ✅ 创建了 ${itemsToCreate.length} 个ItineraryItem`);
        }
        console.log('');
        console.log('='.repeat(70));
        console.log('✅ Trip创建完成!');
        console.log('='.repeat(70));
        console.log(`Trip ID: ${trip.id}`);
        console.log(`天数: ${template.durationDays}`);
        console.log(`行程项: ${itemsToCreate.length}`);
        console.log(`匹配的POI: ${placesMatched}`);
        console.log(`缺失的POI: ${placesMissing}`);
        console.log('');
        console.log(`📋 验证命令:`);
        console.log(`   npx tsx scripts/check-trip-vs-template.ts ${trip.id}`);
        console.log('='.repeat(70));
    }
    catch (error) {
        console.error(`\n❌ 错误:`, error.message);
        console.error(error.stack);
    }
    finally {
        await prisma.$disconnect();
    }
}
createTripDirectly();
//# sourceMappingURL=create-trip-from-template-direct.js.map