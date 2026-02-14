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
    var _a, _b;
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const confirm = args.includes('--confirm');
    console.log('='.repeat(60));
    console.log('删除冰岛路线模板');
    console.log('='.repeat(60));
    console.log(`模式: ${dryRun ? '🔍 预览模式（不会实际删除）' : confirm ? '✅ 确认删除模式' : '⚠️  需要 --confirm 参数才能删除'}`);
    console.log('');
    try {
        const routes = await prisma.routeDirection.findMany({
            where: {
                countryCode: 'IS',
            },
            include: {
                RouteTemplate: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (routes.length === 0) {
            console.log('✓ 没有找到冰岛的路线记录');
            return;
        }
        console.log(`找到 ${routes.length} 条路线记录：\n`);
        for (const route of routes) {
            const templateCount = ((_a = route.RouteTemplate) === null || _a === void 0 ? void 0 : _a.length) || 0;
            console.log(`  - ID: ${route.id}`);
            console.log(`    名称: ${route.nameCN} (${route.nameEN || route.name})`);
            console.log(`    路线ID: ${route.name}`);
            console.log(`    关联模板数: ${templateCount}`);
            console.log(`    创建时间: ${route.createdAt}`);
            console.log('');
        }
        const totalTemplates = routes.reduce((sum, route) => {
            var _a;
            return sum + (((_a = route.RouteTemplate) === null || _a === void 0 ? void 0 : _a.length) || 0);
        }, 0);
        console.log(`总计: ${routes.length} 条路线，${totalTemplates} 个模板\n`);
        if (dryRun) {
            console.log('🔍 [DRY RUN] 预览模式，不会实际删除数据');
            return;
        }
        if (!confirm) {
            console.log('⚠️  警告：需要添加 --confirm 参数才能执行删除操作');
            console.log('   使用方法: tsx scripts/delete-iceland-routes.ts --confirm');
            return;
        }
        console.log('🗑️  开始删除...\n');
        let deletedRoutes = 0;
        let deletedTemplates = 0;
        for (const route of routes) {
            const templateCount = ((_b = route.RouteTemplate) === null || _b === void 0 ? void 0 : _b.length) || 0;
            await prisma.routeDirection.delete({
                where: { id: route.id },
            });
            deletedRoutes++;
            deletedTemplates += templateCount;
            console.log(`  ✓ 已删除: ${route.nameCN} (ID: ${route.id}, 模板: ${templateCount})`);
        }
        console.log('');
        console.log('='.repeat(60));
        console.log('✅ 删除完成！');
        console.log(`   删除路线: ${deletedRoutes} 条`);
        console.log(`   删除模板: ${deletedTemplates} 个（级联删除）`);
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
//# sourceMappingURL=delete-iceland-routes.js.map