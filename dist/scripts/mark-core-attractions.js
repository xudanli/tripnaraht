"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function markCoreAttractions() {
    const prisma = new client_1.PrismaClient();
    try {
        const coreAttractions = [
            'Þingvellir National Park',
            'Skógafoss',
            'Reynisfjara Black Sand Beach',
            'Geysir',
            'Gullfoss',
            'Kirkjufell',
            'Jökulsárlón Glacier Lagoon',
            'Diamond Beach'
        ];
        console.log('🎯 标记核心必看景点...');
        console.log('='.repeat(80));
        let updated = 0;
        for (const nameEN of coreAttractions) {
            const place = await prisma.place.findFirst({
                where: {
                    nameEN: nameEN,
                    category: 'ATTRACTION'
                }
            });
            if (!place) {
                console.log(`  ⚠️  未找到: ${nameEN}`);
                continue;
            }
            const metadata = place.metadata || {};
            const updatedMetadata = {
                ...metadata,
                tier: 'Tier 1',
                isCoreAttraction: true,
                mustSee: true,
                priority: 'high'
            };
            await prisma.place.update({
                where: { id: place.id },
                data: {
                    metadata: updatedMetadata
                }
            });
            console.log(`  ✅ 已标记: ${place.nameCN} (${nameEN})`);
            updated++;
        }
        console.log('');
        console.log(`✅ 完成！共标记 ${updated} 个核心景点`);
        console.log('');
        console.log('🔍 验证核心景点...');
        console.log('='.repeat(80));
        const verifyResult = await prisma.place.findMany({
            where: {
                category: 'ATTRACTION',
                metadata: {
                    path: ['isCoreAttraction'],
                    equals: true
                }
            },
            select: {
                id: true,
                nameCN: true,
                nameEN: true,
                metadata: true
            },
            orderBy: {
                nameCN: 'asc'
            }
        });
        console.log(`核心景点列表 (${verifyResult.length} 个):`);
        verifyResult.forEach((place, idx) => {
            const meta = place.metadata;
            console.log(`  ${idx + 1}. ${place.nameCN} (${place.nameEN})`);
            console.log(`     Tier: ${meta.tier}, Priority: ${meta.priority}`);
        });
    }
    catch (error) {
        console.error('❌ 错误:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
markCoreAttractions();
//# sourceMappingURL=mark-core-attractions.js.map