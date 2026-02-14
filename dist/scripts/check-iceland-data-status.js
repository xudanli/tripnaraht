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
async function main() {
    console.log('='.repeat(60));
    console.log('冰岛数据导入情况检查');
    console.log('='.repeat(60));
    console.log('');
    try {
        console.log('🏙️  检查冰岛城市...');
        const icelandCities = await prisma.city.findMany({
            where: { countryCode: 'IS' },
        });
        console.log(`  找到 ${icelandCities.length} 个冰岛城市:`);
        icelandCities.forEach(city => {
            console.log(`    - ID: ${city.id}, 名称: ${city.nameCN || city.name} (${city.nameEN || city.name})`);
        });
        console.log('');
        if (icelandCities.length === 0) {
            console.log('  ⚠️  未找到冰岛城市，需要先创建\n');
            return;
        }
        const icelandCityIds = icelandCities.map(city => city.id);
        console.log('📍 检查冰岛景点...');
        const totalPlaces = await prisma.place.count();
        const icelandPlaces = await prisma.place.count({
            where: { cityId: { in: icelandCityIds } },
        });
        const icelandAttractions = await prisma.place.count({
            where: {
                cityId: { in: icelandCityIds },
                category: 'ATTRACTION',
            },
        });
        console.log(`  数据库总景点数: ${totalPlaces}`);
        console.log(`  冰岛景点总数: ${icelandPlaces}`);
        console.log(`  冰岛景点(ATTRACTION): ${icelandAttractions}`);
        console.log('');
        if (icelandPlaces > 0) {
            console.log('⭐ 检查核心景点...');
            const corePois = await prisma.place.findMany({
                where: {
                    cityId: { in: icelandCityIds },
                    category: 'ATTRACTION',
                },
                select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    metadata: true,
                },
            });
            const coreWithTier = corePois.filter(p => {
                const metadata = p.metadata;
                return metadata === null || metadata === void 0 ? void 0 : metadata.tier;
            });
            console.log(`  找到 ${coreWithTier.length} 个核心景点:`);
            coreWithTier.forEach(poi => {
                const metadata = poi.metadata;
                console.log(`    - ${poi.nameCN || poi.nameEN} (Tier: ${metadata === null || metadata === void 0 ? void 0 : metadata.tier}, Landmark: ${metadata === null || metadata === void 0 ? void 0 : metadata.is_landmark})`);
            });
            console.log('');
        }
        console.log('🛣️  检查冰岛路线...');
        const routes = await prisma.routeDirection.findMany({
            where: { countryCode: 'IS' },
        });
        console.log(`  找到 ${routes.length} 条冰岛路线:`);
        routes.forEach(route => {
            var _a;
            console.log(`    - ${route.nameCN || route.name} (${route.nameEN})`);
            console.log(`      ID: ${route.id}, 状态: ${route.status}`);
            const signaturePois = route.signaturePois;
            if (((_a = signaturePois === null || signaturePois === void 0 ? void 0 : signaturePois.examples) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                console.log(`      关联景点数: ${signaturePois.examples.length}`);
            }
        });
        console.log('');
        console.log('📊 检查景点分类分布...');
        const categories = await prisma.place.groupBy({
            by: ['category'],
            where: { cityId: { in: icelandCityIds } },
            _count: { id: true },
        });
        categories.forEach(cat => {
            console.log(`  ${cat.category}: ${cat._count.id} 个`);
        });
        console.log('');
        console.log('='.repeat(60));
        console.log('✅ 检查完成！');
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('❌ 错误:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=check-iceland-data-status.js.map