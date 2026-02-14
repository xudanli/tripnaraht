"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function cleanupInvalidRequiredNodes() {
    console.log('============================================================');
    console.log('清理路线模板中无效的 requiredNodes UUID');
    console.log('============================================================\n');
    const templates = await prisma.routeTemplate.findMany({
        select: {
            id: true,
            nameCN: true,
            name: true,
            dayPlans: true,
        },
    });
    let totalCleaned = 0;
    let templatesUpdated = 0;
    for (const template of templates) {
        const dayPlans = template.dayPlans;
        if (!dayPlans || !Array.isArray(dayPlans)) {
            continue;
        }
        let hasChanges = false;
        const updatedDayPlans = dayPlans.map((dayPlan) => {
            if (!dayPlan.requiredNodes || !Array.isArray(dayPlan.requiredNodes)) {
                return dayPlan;
            }
            const validNodes = [];
            const invalidUuids = [];
            for (const node of dayPlan.requiredNodes) {
                if (typeof node === 'string') {
                    if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                        validNodes.push(node);
                    }
                    else {
                        validNodes.push(node);
                    }
                }
                else {
                    validNodes.push(String(node));
                }
            }
            if (validNodes.length !== dayPlan.requiredNodes.length) {
                hasChanges = true;
                totalCleaned += dayPlan.requiredNodes.length - validNodes.length;
            }
            return {
                ...dayPlan,
                requiredNodes: validNodes.length > 0 ? validNodes : undefined,
            };
        });
        if (hasChanges) {
            await prisma.routeTemplate.update({
                where: { id: template.id },
                data: {
                    dayPlans: updatedDayPlans,
                },
            });
            templatesUpdated++;
            console.log(`✅ 已清理模板: ${template.nameCN || template.name} (ID: ${template.id})`);
        }
    }
    console.log('\n============================================================');
    console.log('📊 清理统计');
    console.log('============================================================');
    console.log(`总模板数: ${templates.length}`);
    console.log(`已更新模板: ${templatesUpdated}`);
    console.log(`总清理节点: ${totalCleaned}`);
    console.log('============================================================\n');
    await prisma.$disconnect();
}
cleanupInvalidRequiredNodes().catch(console.error);
//# sourceMappingURL=cleanup-invalid-required-nodes.js.map