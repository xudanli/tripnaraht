#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const prisma = new client_1.PrismaClient();
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
function extractLocalizedFields(value) {
    if (!value) {
        return { default: undefined, en: undefined, cn: undefined };
    }
    if (typeof value === 'string') {
        return { default: value, en: value, cn: undefined };
    }
    return {
        default: value.en,
        en: value.en,
        cn: value.zh,
    };
}
async function savePack(pack) {
    try {
        const existing = await prisma.readinessPack.findUnique({
            where: { packId: pack.packId },
        });
        const displayNameFields = extractLocalizedFields(pack.displayName);
        const regionFields = extractLocalizedFields(pack.geo.region);
        const cityFields = extractLocalizedFields(pack.geo.city);
        const packData = {
            packId: pack.packId,
            destinationId: pack.destinationId,
            displayName: displayNameFields.default || '',
            displayNameEN: displayNameFields.en,
            displayNameCN: displayNameFields.cn,
            version: pack.version,
            lastReviewedAt: new Date(pack.lastReviewedAt),
            countryCode: pack.geo.countryCode,
            region: regionFields.default,
            regionEN: regionFields.en,
            regionCN: regionFields.cn,
            city: cityFields.default,
            cityEN: cityFields.en,
            cityCN: cityFields.cn,
            latitude: pack.geo.lat,
            longitude: pack.geo.lng,
            packData: pack,
            isActive: true,
            updatedAt: new Date(),
        };
        if (existing) {
            await prisma.readinessPack.update({
                where: { packId: pack.packId },
                data: packData,
            });
            logSuccess(`已更新 Pack: ${pack.packId}`);
        }
        else {
            await prisma.readinessPack.create({
                data: {
                    ...packData,
                    id: packData.packId || (0, crypto_1.randomUUID)(),
                },
            });
            logSuccess(`已创建 Pack: ${pack.packId}`);
        }
        return true;
    }
    catch (error) {
        logError(`保存 Pack 失败 ${pack.packId}: ${error.message}`);
        console.error(error);
        return false;
    }
}
async function importPackFromFile(filePath) {
    try {
        if (!(0, fs_1.existsSync)(filePath)) {
            logError(`文件不存在: ${filePath}`);
            return false;
        }
        logInfo(`读取文件: ${filePath}`);
        const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
        const pack = JSON.parse(content);
        if (!pack.packId || !pack.destinationId || !pack.rules) {
            throw new Error('Invalid pack format: missing required fields');
        }
        return await savePack(pack);
    }
    catch (error) {
        logError(`从文件导入 Pack 失败 ${filePath}: ${error.message}`);
        console.error(error);
        return false;
    }
}
async function main() {
    var _a;
    console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       斯瓦尔巴准备度 Pack 导入工具                            ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
    const packFilePath = (0, path_1.join)(__dirname, '../src/trips/readiness/data/packs/pack.sj.svalbard.json');
    try {
        logInfo(`开始导入 Pack 文件: ${packFilePath}`);
        const result = await importPackFromFile(packFilePath);
        if (result) {
            logSuccess('导入完成！');
            const packContent = (0, fs_1.readFileSync)(packFilePath, 'utf-8');
            const pack = JSON.parse(packContent);
            console.log(`\n${colors.cyan}Pack 信息:${colors.reset}`);
            console.log(`  Pack ID: ${pack.packId}`);
            console.log(`  目的地: ${pack.destinationId}`);
            console.log(`  版本: ${pack.version}`);
            const displayName = typeof pack.displayName === 'string'
                ? pack.displayName
                : `${pack.displayName.en} / ${pack.displayName.zh || ''}`;
            console.log(`  显示名称: ${displayName}`);
            console.log(`  规则数: ${pack.rules.length}`);
            console.log(`  清单数: ${pack.checklists.length}`);
            console.log(`  风险数: ${((_a = pack.hazards) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        }
        else {
            logError('导入失败！');
            process.exit(1);
        }
    }
    catch (error) {
        logError(`导入过程中发生错误: ${error.message}`);
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
//# sourceMappingURL=import-svalbard-readiness-pack.js.map