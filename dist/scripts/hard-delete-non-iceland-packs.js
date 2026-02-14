#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const ICELAND_PACK_IDS = [
    'pack.is.iceland',
    'pack.is.is',
];
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};
function logSuccess(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}
function logError(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
}
function logInfo(message) {
    console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}
function logWarning(message) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}
async function main() {
    console.log(`${colors.red}
╔══════════════════════════════════════════════════════════════╗
║   ⚠️  硬删除非冰岛准备度 Pack 工具（危险操作）                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
    try {
        const allPacks = await prisma.readinessPack.findMany({
            select: {
                id: true,
                packId: true,
                destinationId: true,
                displayName: true,
                countryCode: true,
                isActive: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        console.log(`数据库中共有 ${allPacks.length} 个 Pack\n`);
        const icelandPacks = allPacks.filter(p => ICELAND_PACK_IDS.includes(p.packId));
        const nonIcelandPacks = allPacks.filter(p => !ICELAND_PACK_IDS.includes(p.packId));
        console.log(`${colors.cyan}冰岛 Pack（保留）:${colors.reset}`);
        icelandPacks.forEach((pack, index) => {
            console.log(`  ${index + 1}. ${pack.packId} - ${pack.displayName} (${pack.countryCode})`);
        });
        console.log('');
        console.log(`${colors.red}非冰岛 Pack（将永久删除）:${colors.reset}`);
        nonIcelandPacks.forEach((pack, index) => {
            const status = pack.isActive ? '激活' : '已禁用';
            console.log(`  ${index + 1}. ${pack.packId} - ${pack.displayName} (${pack.countryCode}) [${status}]`);
        });
        console.log('');
        if (nonIcelandPacks.length === 0) {
            logInfo('没有需要删除的 Pack');
            return;
        }
        console.log(`${colors.red}═══════════════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.red}⚠️  严重警告：将永久删除 ${nonIcelandPacks.length} 个非冰岛 Pack！${colors.reset}`);
        console.log(`${colors.red}⚠️  此操作不可恢复！数据将永久丢失！${colors.reset}`);
        console.log(`${colors.red}═══════════════════════════════════════════════════════════════${colors.reset}\n`);
        let deletedCount = 0;
        let errorCount = 0;
        for (const pack of nonIcelandPacks) {
            try {
                await prisma.readinessPack.delete({
                    where: { packId: pack.packId },
                });
                logSuccess(`已永久删除: ${pack.packId}`);
                deletedCount++;
            }
            catch (error) {
                logError(`删除失败: ${pack.packId} - ${error.message}`);
                errorCount++;
            }
        }
        console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
        console.log(`${colors.cyan}删除总结${colors.reset}`);
        console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
        console.log(`成功删除: ${colors.green}${deletedCount}${colors.reset} 个`);
        console.log(`删除失败: ${colors.red}${errorCount}${colors.reset} 个`);
        console.log(`保留（冰岛）: ${colors.blue}${icelandPacks.length}${colors.reset} 个`);
        console.log(`总计: ${allPacks.length} 个\n`);
        const remainingPacks = await prisma.readinessPack.findMany({
            select: { packId: true, countryCode: true, isActive: true },
            orderBy: { createdAt: 'desc' },
        });
        console.log(`${colors.cyan}数据库中剩余的 Pack:${colors.reset}`);
        remainingPacks.forEach((pack, index) => {
            const status = pack.isActive ? '激活' : '已禁用';
            console.log(`  ${index + 1}. ${pack.packId} (${pack.countryCode}) [${status}]`);
        });
        console.log('');
        if (remainingPacks.length === icelandPacks.length) {
            logSuccess('删除完成！现在数据库中只有冰岛的 Pack');
        }
        else {
            logWarning(`数据库中还有 ${remainingPacks.length - icelandPacks.length} 个非冰岛 Pack`);
        }
    }
    catch (error) {
        logError(`操作失败: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
if (require.main === module) {
    main().catch((error) => {
        console.error('未捕获的错误:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=hard-delete-non-iceland-packs.js.map