"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkRouteTemplatePoiAssociation() {
    console.log('============================================================');
    console.log('检查路线模板与 POI 的关联情况');
    console.log('============================================================\n');
    const templates = await prisma.routeTemplate.findMany({
        include: {
            routeDirection: {
                select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    signaturePois: true,
                },
            },
        },
        orderBy: {
            id: 'asc',
        },
    });
    console.log(`📊 总路线模板数: ${templates.length}\n`);
    let templatesWithPois = 0;
    let templatesWithPoiIds = 0;
    let templatesWithRequiredNodes = 0;
    let totalPois = 0;
    let totalPoisWithId = 0;
    let totalPoisWithUuid = 0;
    let totalRequiredNodes = 0;
    const allRequiredNodeUuids = new Set();
    for (const template of templates) {
        const dayPlans = template.dayPlans;
        if (!dayPlans || !Array.isArray(dayPlans)) {
            continue;
        }
        let hasPois = false;
        let hasPoiIds = false;
        let hasRequiredNodes = false;
        let templatePoiCount = 0;
        let templatePoiWithIdCount = 0;
        let templatePoiWithUuidCount = 0;
        let templateRequiredNodeCount = 0;
        for (const dayPlan of dayPlans) {
            if (dayPlan.pois && Array.isArray(dayPlan.pois) && dayPlan.pois.length > 0) {
                hasPois = true;
                templatePoiCount += dayPlan.pois.length;
                for (const poi of dayPlan.pois) {
                    if (poi.id) {
                        hasPoiIds = true;
                        templatePoiWithIdCount++;
                    }
                    if (poi.uuid) {
                        templatePoiWithUuidCount++;
                    }
                }
            }
            if (dayPlan.requiredNodes && Array.isArray(dayPlan.requiredNodes) && dayPlan.requiredNodes.length > 0) {
                hasRequiredNodes = true;
                templateRequiredNodeCount += dayPlan.requiredNodes.length;
                for (const node of dayPlan.requiredNodes) {
                    if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                        allRequiredNodeUuids.add(node);
                    }
                }
            }
        }
        if (hasPois) {
            templatesWithPois++;
            totalPois += templatePoiCount;
            totalPoisWithId += templatePoiWithIdCount;
            totalPoisWithUuid += templatePoiWithUuidCount;
            if (hasPoiIds) {
                templatesWithPoiIds++;
            }
        }
        if (hasRequiredNodes) {
            templatesWithRequiredNodes++;
            totalRequiredNodes += templateRequiredNodeCount;
        }
    }
    console.log('\n============================================================');
    console.log('🔍 检查 requiredNodes 中的 UUID 是否能匹配到 Place');
    console.log('============================================================\n');
    const uuidArray = Array.from(allRequiredNodeUuids);
    console.log(`收集到的 UUID 总数: ${uuidArray.length}`);
    if (uuidArray.length > 0) {
        const matchedPlaces = await prisma.place.findMany({
            where: {
                uuid: { in: uuidArray },
            },
            select: {
                id: true,
                uuid: true,
                nameCN: true,
                nameEN: true,
                category: true,
            },
        });
        console.log(`匹配到的 Place 数量: ${matchedPlaces.length} / ${uuidArray.length}`);
        console.log(`匹配率: ${((matchedPlaces.length / uuidArray.length) * 100).toFixed(1)}%\n`);
        if (matchedPlaces.length > 0) {
            console.log('匹配到的 Place 示例（前5个）:');
            matchedPlaces.slice(0, 5).forEach(place => {
                console.log(`  - ${place.nameCN} (ID: ${place.id}, UUID: ${place.uuid}, 类别: ${place.category})`);
            });
            console.log('');
        }
        const matchedUuids = new Set(matchedPlaces.map(p => p.uuid));
        const unmatchedUuids = uuidArray.filter(uuid => !matchedUuids.has(uuid));
        if (unmatchedUuids.length > 0) {
            console.log(`未匹配的 UUID (${unmatchedUuids.length} 个):`);
            unmatchedUuids.slice(0, 5).forEach(uuid => {
                console.log(`  - ${uuid}`);
            });
            console.log('');
        }
    }
    const routesWithSignaturePois = templates.filter(t => {
        var _a, _b;
        const sigPois = t.routeDirection.signaturePois;
        return sigPois && (((_a = sigPois.examples) === null || _a === void 0 ? void 0 : _a.length) > 0 || ((_b = sigPois.types) === null || _b === void 0 ? void 0 : _b.length) > 0);
    });
    console.log('\n============================================================');
    console.log('📊 统计结果');
    console.log('============================================================');
    console.log(`总模板数: ${templates.length}`);
    console.log(`包含 pois 字段的模板: ${templatesWithPois}`);
    console.log(`包含 POI ID 的模板: ${templatesWithPoiIds}`);
    console.log(`包含 requiredNodes 的模板: ${templatesWithRequiredNodes}`);
    console.log(`包含 signaturePois 的路线方向: ${routesWithSignaturePois.length}`);
    console.log('');
    console.log(`POI 总数: ${totalPois}`);
    console.log(`有 ID 的 POI: ${totalPoisWithId} (${totalPois > 0 ? ((totalPoisWithId / totalPois) * 100).toFixed(1) : 0}%)`);
    console.log(`有 UUID 的 POI: ${totalPoisWithUuid} (${totalPois > 0 ? ((totalPoisWithUuid / totalPois) * 100).toFixed(1) : 0}%)`);
    console.log(`Required Nodes 总数: ${totalRequiredNodes}`);
    console.log(`Required Nodes UUID 总数: ${uuidArray.length}`);
    console.log(`Required Nodes UUID 匹配到 Place: ${uuidArray.length > 0 ? (await prisma.place.count({ where: { uuid: { in: uuidArray } } })) : 0}`);
    console.log('============================================================\n');
    await prisma.$disconnect();
}
checkRouteTemplatePoiAssociation().catch(console.error);
//# sourceMappingURL=check-route-template-poi-association.js.map