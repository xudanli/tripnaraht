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
async function migrateRequiredNodesToPois() {
    console.log('='.repeat(70));
    console.log('🔄 将 requiredNodes 迁移到 pois 格式');
    console.log('='.repeat(70));
    console.log('');
    try {
        const templates = await prisma.routeTemplate.findMany({
            select: {
                id: true,
                nameCN: true,
                name: true,
                dayPlans: true,
            },
        });
        console.log(`📋 找到 ${templates.length} 个模板`);
        console.log('');
        let migratedCount = 0;
        let totalPoisAdded = 0;
        for (const template of templates) {
            const dayPlans = template.dayPlans;
            if (!dayPlans || !Array.isArray(dayPlans)) {
                continue;
            }
            let hasChanges = false;
            const updatedDayPlans = dayPlans.map((plan, index) => {
                if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
                    return plan;
                }
                if (!plan.requiredNodes || !Array.isArray(plan.requiredNodes) || plan.requiredNodes.length === 0) {
                    return plan;
                }
                const pois = plan.requiredNodes.map((node, poiIndex) => {
                    const isUuid = node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
                    if (isUuid) {
                        return {
                            uuid: node,
                            required: true,
                            order: poiIndex + 1,
                        };
                    }
                    else {
                        const id = parseInt(node, 10);
                        if (!isNaN(id)) {
                            return {
                                id: id,
                                required: true,
                                order: poiIndex + 1,
                            };
                        }
                        else {
                            return {
                                nameCN: node,
                                required: true,
                                order: poiIndex + 1,
                            };
                        }
                    }
                });
                hasChanges = true;
                totalPoisAdded += pois.length;
                return {
                    ...plan,
                    pois: pois,
                };
            });
            if (hasChanges) {
                await prisma.routeTemplate.update({
                    where: { id: template.id },
                    data: {
                        dayPlans: updatedDayPlans,
                        updatedAt: new Date(),
                    },
                });
                migratedCount++;
                console.log(`✅ 已迁移模板 ${template.id}: ${template.nameCN || template.name}`);
                updatedDayPlans.forEach((plan, index) => {
                    const pois = plan.pois || [];
                    if (pois.length > 0) {
                        console.log(`   第${plan.day || index + 1}天: ${pois.length} 个POI`);
                        pois.forEach((poi, poiIndex) => {
                            const identifier = poi.id ? `ID: ${poi.id}` : poi.uuid ? `UUID: ${poi.uuid}` : `名称: ${poi.nameCN}`;
                            console.log(`     ${poiIndex + 1}. ${identifier} (Required: ${poi.required})`);
                        });
                    }
                });
                console.log('');
            }
        }
        console.log('='.repeat(70));
        console.log('📊 迁移统计');
        console.log('='.repeat(70));
        console.log(`总模板数: ${templates.length}`);
        console.log(`已迁移模板数: ${migratedCount}`);
        console.log(`总添加POI数: ${totalPoisAdded}`);
        console.log('='.repeat(70));
        console.log('');
        console.log('🔍 验证迁移结果...');
        const verifyTemplates = await prisma.routeTemplate.findMany({
            where: {
                id: { in: [36, 38] },
            },
            select: {
                id: true,
                nameCN: true,
                dayPlans: true,
            },
        });
        for (const template of verifyTemplates) {
            const dayPlans = template.dayPlans;
            if (!dayPlans || !Array.isArray(dayPlans)) {
                continue;
            }
            let totalPois = 0;
            dayPlans.forEach((plan) => {
                const pois = plan.pois || [];
                totalPois += pois.length;
            });
            console.log(`模板 ${template.id}: ${totalPois} 个POI`);
        }
    }
    catch (error) {
        console.error('❌ 迁移失败:', error.message);
        console.error(error);
    }
    finally {
        await prisma.$disconnect();
    }
}
migrateRequiredNodesToPois().catch(console.error);
//# sourceMappingURL=migrate-requirednodes-to-pois.js.map