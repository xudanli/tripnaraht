"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkTripVsTemplate(tripId) {
    var _a, _b;
    try {
        console.log(`\n🔍 检查 Trip: ${tripId}\n`);
        const trip = await prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: {
                                    select: {
                                        id: true,
                                        uuid: true,
                                        nameCN: true,
                                        nameEN: true,
                                        category: true,
                                    },
                                },
                            },
                            orderBy: {
                                startTime: 'asc',
                            },
                        },
                    },
                    orderBy: {
                        date: 'asc',
                    },
                },
            },
        });
        if (!trip) {
            console.error(`❌ Trip ${tripId} 不存在`);
            return;
        }
        console.log(`✅ Trip 信息:`);
        console.log(`  - 名称: ${trip.name || '(无)'}`);
        console.log(`  - 状态: ${trip.status}`);
        console.log(`  - 创建时间: ${trip.createdAt}`);
        console.log(`  - 天数: ${((_a = trip.TripDay) === null || _a === void 0 ? void 0 : _a.length) || 0} 天`);
        const tripMetadata = trip.metadata;
        const createdFromTemplate = tripMetadata === null || tripMetadata === void 0 ? void 0 : tripMetadata.createdFromTemplate;
        const templateId = (tripMetadata === null || tripMetadata === void 0 ? void 0 : tripMetadata.templateId) || (tripMetadata === null || tripMetadata === void 0 ? void 0 : tripMetadata.createdFromTemplate);
        if (createdFromTemplate && templateId) {
            console.log(`\n📋 从模板创建: Template ID = ${templateId}`);
        }
        else {
            console.log(`\n⚠️  未找到模板信息`);
            console.log(`  metadata:`, JSON.stringify(tripMetadata, null, 2));
        }
        let template = null;
        if (templateId) {
            template = await prisma.routeTemplate.findUnique({
                where: { id: templateId },
                include: {
                    routeDirection: true,
                },
            });
            if (template) {
                console.log(`\n✅ 模板信息:`);
                console.log(`  - 名称: ${template.name}`);
                console.log(`  - 天数: ${template.durationDays} 天`);
                console.log(`  - 是否激活: ${template.isActive}`);
                const templateDayPlans = template.dayPlans;
                if (Array.isArray(templateDayPlans)) {
                    console.log(`\n📋 模板 dayPlans (${templateDayPlans.length} 天):`);
                    templateDayPlans.forEach((plan, index) => {
                        var _a, _b, _c, _d;
                        console.log(`\n  第 ${plan.day || index + 1} 天:`);
                        console.log(`    - 主题: ${plan.theme || '(无)'}`);
                        console.log(`    - requiredNodes: ${((_a = plan.requiredNodes) === null || _a === void 0 ? void 0 : _a.length) || 0} 个`);
                        if (((_b = plan.requiredNodes) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                            console.log(`      ${plan.requiredNodes.join(', ')}`);
                        }
                        console.log(`    - pois: ${((_c = plan.pois) === null || _c === void 0 ? void 0 : _c.length) || 0} 个`);
                        if (((_d = plan.pois) === null || _d === void 0 ? void 0 : _d.length) > 0) {
                            plan.pois.forEach((poi, poiIndex) => {
                                console.log(`      ${poiIndex + 1}. ID=${poi.id || '(无)'}, UUID=${poi.uuid || '(无)'}, required=${poi.required || false}, order=${poi.order || '(无)'}`);
                            });
                        }
                        else {
                            console.log(`    ⚠️  该天没有 pois 数据`);
                        }
                    });
                }
                else {
                    console.log(`\n⚠️  模板 dayPlans 格式异常:`, typeof templateDayPlans);
                }
            }
            else {
                console.log(`\n❌ 模板 ${templateId} 不存在`);
            }
        }
        const dayThemes = (tripMetadata === null || tripMetadata === void 0 ? void 0 : tripMetadata.dayThemes) || {};
        console.log(`\n📅 Trip 的行程安排 (${((_b = trip.TripDay) === null || _b === void 0 ? void 0 : _b.length) || 0} 天):`);
        if (trip.TripDay && trip.TripDay.length > 0) {
            trip.TripDay.forEach((day, index) => {
                var _a;
                const dayNumber = index + 1;
                const theme = dayThemes[dayNumber] || day.theme || '(无)';
                console.log(`\n  第 ${dayNumber} 天 (${day.date || '无日期'}):`);
                console.log(`    - 主题: ${theme}`);
                console.log(`    - POI数量: ${((_a = day.ItineraryItem) === null || _a === void 0 ? void 0 : _a.length) || 0} 个`);
                if (day.ItineraryItem && day.ItineraryItem.length > 0) {
                    day.ItineraryItem.forEach((item, itemIndex) => {
                        var _a;
                        const place = item.Place;
                        const isRequired = ((_a = item.note) === null || _a === void 0 ? void 0 : _a.includes('[必游]')) || false;
                        console.log(`      ${itemIndex + 1}. ${(place === null || place === void 0 ? void 0 : place.nameCN) || (place === null || place === void 0 ? void 0 : place.nameEN) || '(无名称)'}`);
                        console.log(`         - Place ID: ${(place === null || place === void 0 ? void 0 : place.id) || '(无)'}`);
                        console.log(`         - Place UUID: ${(place === null || place === void 0 ? void 0 : place.uuid) || '(无)'}`);
                        console.log(`         - 类别: ${(place === null || place === void 0 ? void 0 : place.category) || '(无)'}`);
                        console.log(`         - 是否必需: ${isRequired}`);
                        if (item.note) {
                            console.log(`         - 备注: ${item.note}`);
                        }
                    });
                }
                else {
                    console.log(`    ⚠️  该天没有 POI`);
                }
            });
        }
        else {
            console.log(`\n⚠️  Trip 没有行程安排`);
        }
        if (Object.keys(dayThemes).length > 0) {
            console.log(`\n📋 Trip Metadata 中的主题:`);
            Object.entries(dayThemes).forEach(([day, theme]) => {
                console.log(`  第 ${day} 天: ${theme}`);
            });
        }
        else {
            console.log(`\n⚠️  Trip Metadata 中没有 dayThemes`);
        }
        if (template && trip.TripDay) {
            console.log(`\n🔍 对比分析:\n`);
            const templateDayPlans = template.dayPlans;
            if (Array.isArray(templateDayPlans)) {
                for (let i = 0; i < Math.max(templateDayPlans.length, trip.TripDay.length); i++) {
                    const templateDay = templateDayPlans[i];
                    const tripDay = trip.TripDay[i];
                    console.log(`\n第 ${i + 1} 天对比:`);
                    if (!templateDay) {
                        console.log(`  ❌ 模板中没有第 ${i + 1} 天`);
                        continue;
                    }
                    if (!tripDay) {
                        console.log(`  ❌ Trip 中没有第 ${i + 1} 天`);
                        continue;
                    }
                    const templateTheme = templateDay.theme || '(无)';
                    const dayNumber = i + 1;
                    const tripTheme = dayThemes[dayNumber] || '(无)';
                    if (templateTheme !== tripTheme) {
                        console.log(`  ⚠️  主题不一致:`);
                        console.log(`    模板: ${templateTheme}`);
                        console.log(`    Trip: ${tripTheme}`);
                    }
                    else {
                        console.log(`  ✅ 主题一致: ${templateTheme}`);
                    }
                    const templatePois = templateDay.pois || [];
                    const tripPois = tripDay.ItineraryItem || [];
                    console.log(`  📊 POI 数量:`);
                    console.log(`    模板: ${templatePois.length} 个`);
                    console.log(`    Trip: ${tripPois.length} 个`);
                    const tripPlaceIds = new Set(tripPois.map((item) => { var _a; return (_a = item.Place) === null || _a === void 0 ? void 0 : _a.id; }).filter(Boolean));
                    const tripPlaceUuids = new Set(tripPois.map((item) => { var _a; return (_a = item.Place) === null || _a === void 0 ? void 0 : _a.uuid; }).filter(Boolean));
                    const missingPois = [];
                    templatePois.forEach((templatePoi) => {
                        const found = (templatePoi.id && tripPlaceIds.has(templatePoi.id)) ||
                            (templatePoi.uuid && tripPlaceUuids.has(templatePoi.uuid));
                        if (!found) {
                            missingPois.push(templatePoi);
                        }
                    });
                    if (missingPois.length > 0) {
                        console.log(`  ❌ 模板中的 ${missingPois.length} 个 POI 未在 Trip 中找到:`);
                        missingPois.forEach((poi) => {
                            console.log(`     - ID=${poi.id || '(无)'}, UUID=${poi.uuid || '(无)'}, required=${poi.required || false}`);
                        });
                    }
                    else if (templatePois.length > 0) {
                        console.log(`  ✅ 模板中的所有 POI 都在 Trip 中`);
                    }
                    const extraPois = tripPois.filter((item) => {
                        var _a, _b;
                        const placeId = (_a = item.Place) === null || _a === void 0 ? void 0 : _a.id;
                        const placeUuid = (_b = item.Place) === null || _b === void 0 ? void 0 : _b.uuid;
                        return !templatePois.some((tp) => (tp.id && tp.id === placeId) ||
                            (tp.uuid && tp.uuid === placeUuid));
                    });
                    if (extraPois.length > 0) {
                        console.log(`  ℹ️  Trip 中有 ${extraPois.length} 个额外的 POI (可能是LLM添加的):`);
                        extraPois.forEach((item) => {
                            const place = item.Place;
                            console.log(`     - ${(place === null || place === void 0 ? void 0 : place.nameCN) || (place === null || place === void 0 ? void 0 : place.nameEN) || '(无名称)'} (ID: ${place === null || place === void 0 ? void 0 : place.id}, UUID: ${place === null || place === void 0 ? void 0 : place.uuid})`);
                        });
                    }
                }
            }
        }
        console.log(`\n📋 Trip Metadata:`);
        console.log(JSON.stringify(tripMetadata, null, 2));
    }
    catch (error) {
        console.error(`\n❌ 错误:`, error.message);
        console.error(error.stack);
    }
    finally {
        await prisma.$disconnect();
    }
}
const tripId = process.argv[2];
if (!tripId) {
    console.error('请提供 Trip ID');
    console.error('用法: npx tsx scripts/check-trip-vs-template.ts <tripId>');
    process.exit(1);
}
checkTripVsTemplate(tripId);
//# sourceMappingURL=check-trip-vs-template.js.map