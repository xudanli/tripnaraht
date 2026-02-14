"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function findPlaceByName(name, countryCode) {
    let place = await prisma.place.findFirst({
        where: {
            OR: [
                { nameCN: name },
                { nameEN: name },
            ],
            ...(countryCode ? {
                City: {
                    countryCode: countryCode,
                },
            } : {}),
        },
        select: {
            id: true,
            uuid: true,
            nameCN: true,
            nameEN: true,
            category: true,
        },
    });
    if (!place) {
        place = await prisma.place.findFirst({
            where: {
                OR: [
                    { nameCN: { contains: name, mode: 'insensitive' } },
                    { nameEN: { contains: name, mode: 'insensitive' } },
                ],
                ...(countryCode ? {
                    City: {
                        countryCode: countryCode,
                    },
                } : {}),
            },
            select: {
                id: true,
                uuid: true,
                nameCN: true,
                nameEN: true,
                category: true,
            },
            orderBy: {
                rating: 'desc',
            },
        });
    }
    return place;
}
function extractPoiNames(dayPlan) {
    const names = new Set();
    const uuids = new Set();
    if (dayPlan.highlights && Array.isArray(dayPlan.highlights)) {
        dayPlan.highlights.forEach(name => {
            if (typeof name === 'string' && name.trim()) {
                names.add(name.trim());
            }
        });
    }
    if (dayPlan.activities && Array.isArray(dayPlan.activities)) {
        dayPlan.activities.forEach(name => {
            if (typeof name === 'string' && name.trim()) {
                names.add(name.trim());
            }
        });
    }
    if (dayPlan.overnight && typeof dayPlan.overnight === 'string') {
        names.add(dayPlan.overnight.trim());
    }
    if (dayPlan.title && typeof dayPlan.title === 'string') {
        const titleParts = dayPlan.title.split(/[→→→-]/);
        titleParts.forEach(part => {
            const trimmed = part.trim();
            if (trimmed && trimmed.length > 1) {
                names.add(trimmed);
            }
        });
    }
    if (dayPlan.requiredNodes && Array.isArray(dayPlan.requiredNodes)) {
        dayPlan.requiredNodes.forEach(node => {
            if (typeof node === 'string') {
                if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                    uuids.add(node);
                }
                else {
                    names.add(node.trim());
                }
            }
        });
    }
    return {
        names: Array.from(names),
        uuids: Array.from(uuids),
    };
}
async function fixRouteTemplate(templateId, countryCode) {
    const template = await prisma.routeTemplate.findUnique({
        where: { id: templateId },
        include: {
            routeDirection: {
                select: {
                    id: true,
                    countryCode: true,
                    signaturePois: true,
                },
            },
        },
    });
    if (!template) {
        return { updated: false, poisAdded: 0, poisMatched: 0 };
    }
    const dayPlans = template.dayPlans;
    if (!dayPlans || !Array.isArray(dayPlans)) {
        return { updated: false, poisAdded: 0, poisMatched: 0 };
    }
    let totalPoisAdded = 0;
    let totalPoisMatched = 0;
    const signaturePoiIds = new Set();
    const updatedDayPlans = await Promise.all(dayPlans.map(async (dayPlan, dayIndex) => {
        var _a;
        if (dayPlan.pois && Array.isArray(dayPlan.pois) && dayPlan.pois.length > 0) {
            return dayPlan;
        }
        const { names: poiNames, uuids: poiUuids } = extractPoiNames(dayPlan);
        if (poiNames.length === 0 && poiUuids.length === 0) {
            return dayPlan;
        }
        const pois = [];
        const foundPlaceIds = new Set();
        if (poiUuids.length > 0) {
            const placesByUuid = await prisma.place.findMany({
                where: {
                    uuid: { in: poiUuids },
                    ...(countryCode ? {
                        City: {
                            countryCode: countryCode,
                        },
                    } : {}),
                },
                select: {
                    id: true,
                    uuid: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
                },
            });
            for (const place of placesByUuid) {
                if (!foundPlaceIds.has(place.id)) {
                    pois.push({
                        id: place.id,
                        uuid: place.uuid,
                        nameCN: place.nameCN,
                        nameEN: place.nameEN || undefined,
                        category: place.category,
                        required: true,
                        order: pois.length + 1,
                    });
                    signaturePoiIds.add(place.id);
                    foundPlaceIds.add(place.id);
                    totalPoisMatched++;
                }
            }
        }
        for (let i = 0; i < poiNames.length; i++) {
            const name = poiNames[i];
            const place = await findPlaceByName(name, countryCode);
            if (place && !foundPlaceIds.has(place.id)) {
                pois.push({
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN || undefined,
                    category: place.category,
                    required: ((_a = dayPlan.requiredNodes) === null || _a === void 0 ? void 0 : _a.includes(place.uuid)) || false,
                    order: pois.length + 1,
                });
                signaturePoiIds.add(place.id);
                foundPlaceIds.add(place.id);
                totalPoisMatched++;
            }
        }
        totalPoisAdded += pois.length;
        return {
            ...dayPlan,
            pois: pois.length > 0 ? pois : undefined,
        };
    }));
    if (totalPoisAdded > 0) {
        await prisma.routeTemplate.update({
            where: { id: templateId },
            data: {
                dayPlans: updatedDayPlans,
            },
        });
    }
    if (signaturePoiIds.size > 0) {
        const currentSigPois = template.routeDirection.signaturePois || {};
        const existingExamples = currentSigPois.examples || [];
        const newExamples = Array.from(signaturePoiIds);
        const allExamples = Array.from(new Set([...existingExamples, ...newExamples]));
        await prisma.routeDirection.update({
            where: { id: template.routeDirectionId },
            data: {
                signaturePois: {
                    ...currentSigPois,
                    examples: allExamples,
                },
            },
        });
    }
    return {
        updated: totalPoisAdded > 0,
        poisAdded: totalPoisAdded,
        poisMatched: totalPoisMatched,
    };
}
async function fixAllRouteTemplates() {
    console.log('============================================================');
    console.log('修复路线模板与 POI 的关联');
    console.log('============================================================\n');
    const templates = await prisma.routeTemplate.findMany({
        include: {
            routeDirection: {
                select: {
                    id: true,
                    countryCode: true,
                },
            },
        },
        orderBy: {
            id: 'asc',
        },
    });
    console.log(`📊 找到 ${templates.length} 个路线模板\n`);
    let totalUpdated = 0;
    let totalPoisAdded = 0;
    let totalPoisMatched = 0;
    for (const template of templates) {
        const countryCode = template.routeDirection.countryCode || 'IS';
        console.log(`处理模板: ${template.nameCN || template.name} (ID: ${template.id})`);
        console.log(`  国家: ${countryCode}`);
        const result = await fixRouteTemplate(template.id, countryCode);
        if (result.updated) {
            totalUpdated++;
            totalPoisAdded += result.poisAdded;
            totalPoisMatched += result.poisMatched;
            console.log(`  ✅ 已更新: 添加 ${result.poisAdded} 个 POI (匹配 ${result.poisMatched} 个)`);
        }
        else {
            console.log(`  ⏭️  跳过: 无 POI 可添加`);
        }
        console.log('');
    }
    console.log('\n============================================================');
    console.log('📊 修复统计');
    console.log('============================================================');
    console.log(`总模板数: ${templates.length}`);
    console.log(`已更新模板: ${totalUpdated}`);
    console.log(`总添加 POI: ${totalPoisAdded}`);
    console.log(`总匹配 POI: ${totalPoisMatched}`);
    console.log('============================================================\n');
    await prisma.$disconnect();
}
fixAllRouteTemplates().catch(console.error);
//# sourceMappingURL=fix-route-template-poi-association.js.map