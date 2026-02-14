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
async function checkTemplates() {
    console.log('='.repeat(70));
    console.log('🔍 检查模板36和38的dayPlans数据');
    console.log('='.repeat(70));
    console.log('');
    try {
        const templates = await prisma.routeTemplate.findMany({
            where: {
                id: { in: [36, 38] },
            },
            select: {
                id: true,
                nameCN: true,
                name: true,
                durationDays: true,
                dayPlans: true,
            },
        });
        for (const template of templates) {
            console.log(`📋 模板 ${template.id}: ${template.nameCN || template.name}`);
            console.log(`   天数: ${template.durationDays}`);
            console.log('');
            const dayPlans = template.dayPlans;
            if (!dayPlans || !Array.isArray(dayPlans)) {
                console.log('   ⚠️  dayPlans 为空或不是数组');
                console.log('');
                continue;
            }
            console.log(`   dayPlans 数量: ${dayPlans.length}`);
            console.log('');
            dayPlans.forEach((plan, index) => {
                console.log(`   第${plan.day || index + 1}天:`);
                console.log(`     主题: ${plan.theme || '(无)'}`);
                console.log(`     requiredNodes: ${plan.requiredNodes ? JSON.stringify(plan.requiredNodes) : '(无)'}`);
                console.log(`     pois: ${plan.pois ? (Array.isArray(plan.pois) ? `${plan.pois.length} 个` : '不是数组') : '(无)'}`);
                if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
                    plan.pois.forEach((poi, poiIndex) => {
                        console.log(`       ${poiIndex + 1}. ${JSON.stringify(poi)}`);
                    });
                }
                console.log('');
            });
            console.log('   完整 dayPlans JSON:');
            console.log(JSON.stringify(dayPlans, null, 2));
            console.log('');
            console.log('='.repeat(70));
            console.log('');
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
checkTemplates().catch(console.error);
//# sourceMappingURL=check-template-36-38-pois.js.map