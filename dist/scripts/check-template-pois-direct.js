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
async function checkTemplatePois() {
    console.log('='.repeat(70));
    console.log('🔍 直接检查数据库中的模板POI数据');
    console.log('='.repeat(70));
    console.log('');
    try {
        const templates = await prisma.routeTemplate.findMany({
            select: {
                id: true,
                nameCN: true,
                name: true,
                durationDays: true,
                dayPlans: true,
            },
            orderBy: {
                id: 'asc',
            },
        });
        console.log(`📋 找到 ${templates.length} 个路线模板`);
        console.log('');
        let templatesWithPois = 0;
        let totalPois = 0;
        for (const template of templates) {
            const dayPlans = template.dayPlans;
            if (!dayPlans || !Array.isArray(dayPlans)) {
                continue;
            }
            let templatePoiCount = 0;
            let hasPois = false;
            for (const plan of dayPlans) {
                if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
                    hasPois = true;
                    templatePoiCount += plan.pois.length;
                }
            }
            if (hasPois) {
                templatesWithPois++;
                totalPois += templatePoiCount;
                console.log(`✅ 模板 ${template.id}: ${template.nameCN || template.name}`);
                console.log(`   天数: ${template.durationDays}`);
                console.log(`   POI总数: ${templatePoiCount}`);
                dayPlans.forEach((plan, index) => {
                    const pois = plan.pois || [];
                    if (pois.length > 0) {
                        console.log(`   第${plan.day || index + 1}天 (${plan.theme || '无主题'}): ${pois.length} 个POI`);
                        pois.forEach((poi, poiIndex) => {
                            console.log(`     ${poiIndex + 1}. ${poi.nameCN || poi.nameEN || 'N/A'} (ID: ${poi.id || 'N/A'}, Required: ${poi.required || false})`);
                        });
                    }
                });
                console.log('');
            }
        }
        console.log('='.repeat(70));
        console.log('📊 统计信息');
        console.log('='.repeat(70));
        console.log(`总模板数: ${templates.length}`);
        console.log(`包含POI的模板数: ${templatesWithPois}`);
        console.log(`总POI数: ${totalPois}`);
        console.log('');
        const templatesWithoutPois = templates.filter(template => {
            const dayPlans = template.dayPlans;
            if (!dayPlans || !Array.isArray(dayPlans)) {
                return true;
            }
            return !dayPlans.some((plan) => plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0);
        });
        if (templatesWithoutPois.length > 0) {
            console.log(`⚠️  没有POI数据的模板 (${templatesWithoutPois.length} 个):`);
            templatesWithoutPois.forEach(template => {
                console.log(`   - ${template.id}: ${template.nameCN || template.name}`);
            });
            console.log('');
        }
        if (totalPois > 0) {
            console.log('='.repeat(70));
            console.log('🔍 检查POI在数据库中的存在性');
            console.log('='.repeat(70));
            console.log('');
            const allPoiIds = new Set();
            const allPoiUuids = new Set();
            for (const template of templates) {
                const dayPlans = template.dayPlans;
                if (!dayPlans || !Array.isArray(dayPlans)) {
                    continue;
                }
                for (const plan of dayPlans) {
                    const pois = plan.pois || [];
                    for (const poi of pois) {
                        if (poi.id) {
                            allPoiIds.add(poi.id);
                        }
                        if (poi.uuid) {
                            allPoiUuids.add(poi.uuid);
                        }
                    }
                }
            }
            console.log(`收集到的POI标识符: ${allPoiIds.size} 个ID, ${allPoiUuids.size} 个UUID`);
            console.log('');
            if (allPoiIds.size > 0 || allPoiUuids.size > 0) {
                const places = await prisma.place.findMany({
                    where: {
                        OR: [
                            ...(allPoiIds.size > 0 ? [{ id: { in: Array.from(allPoiIds) } }] : []),
                            ...(allPoiUuids.size > 0 ? [{ uuid: { in: Array.from(allPoiUuids) } }] : []),
                        ],
                    },
                    select: {
                        id: true,
                        uuid: true,
                        nameCN: true,
                    },
                });
                const foundIds = new Set(places.map(p => p.id));
                const foundUuids = new Set(places.map(p => p.uuid));
                const missingIds = Array.from(allPoiIds).filter(id => !foundIds.has(id));
                const missingUuids = Array.from(allPoiUuids).filter(uuid => !foundUuids.has(uuid));
                console.log(`✅ 在数据库中找到: ${places.length} 个POI`);
                console.log(`❌ 在数据库中缺失: ${missingIds.length} 个ID, ${missingUuids.length} 个UUID`);
                if (missingIds.length > 0) {
                    console.log(`   缺失的ID: ${missingIds.join(', ')}`);
                }
                if (missingUuids.length > 0) {
                    console.log(`   缺失的UUID: ${missingUuids.slice(0, 10).join(', ')}${missingUuids.length > 10 ? '...' : ''}`);
                }
                console.log('');
            }
        }
    }
    catch (error) {
        console.error('❌ 检查失败:', error.message);
        console.error(error);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkTemplatePois().catch(console.error);
//# sourceMappingURL=check-template-pois-direct.js.map