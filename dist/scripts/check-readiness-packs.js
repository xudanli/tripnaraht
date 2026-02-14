#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
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
    magenta: '\x1b[35m',
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
function logSection(title) {
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}
async function checkDatabasePacks() {
    logSection('检查数据库中的 Pack 数据');
    try {
        const allPacks = await prisma.readinessPack.findMany({
            orderBy: { updatedAt: 'desc' },
        });
        logInfo(`数据库中共有 ${allPacks.length} 个 Pack`);
        const activePacks = allPacks.filter(p => p.isActive);
        const inactivePacks = allPacks.filter(p => !p.isActive);
        console.log(`\n📊 统计信息:`);
        console.log(`  激活的 Pack: ${activePacks.length}`);
        console.log(`  停用的 Pack: ${inactivePacks.length}`);
        const byCountry = {};
        allPacks.forEach(pack => {
            byCountry[pack.countryCode] = (byCountry[pack.countryCode] || 0) + 1;
        });
        console.log(`\n🌍 按国家代码分布:`);
        Object.entries(byCountry)
            .sort((a, b) => b[1] - a[1])
            .forEach(([country, count]) => {
            console.log(`  ${country}: ${count} 个`);
        });
        console.log(`\n📋 Pack 列表:`);
        allPacks.forEach((pack, index) => {
            var _a, _b, _c;
            const status = pack.isActive ? '✓' : '✗';
            const packData = pack.packData;
            const rulesCount = ((_a = packData === null || packData === void 0 ? void 0 : packData.rules) === null || _a === void 0 ? void 0 : _a.length) || 0;
            const checklistsCount = ((_b = packData === null || packData === void 0 ? void 0 : packData.checklists) === null || _b === void 0 ? void 0 : _b.length) || 0;
            const hazardsCount = ((_c = packData === null || packData === void 0 ? void 0 : packData.hazards) === null || _c === void 0 ? void 0 : _c.length) || 0;
            console.log(`\n  ${index + 1}. [${status}] ${pack.packId}`);
            console.log(`     目的地: ${pack.destinationId}`);
            console.log(`     国家: ${pack.countryCode}`);
            console.log(`     版本: ${pack.version}`);
            console.log(`     规则数: ${rulesCount}`);
            console.log(`     清单数: ${checklistsCount}`);
            console.log(`     风险数: ${hazardsCount}`);
            console.log(`     更新于: ${pack.updatedAt.toISOString()}`);
            const issues = [];
            if (!(packData === null || packData === void 0 ? void 0 : packData.packId))
                issues.push('缺少 packId');
            if (!(packData === null || packData === void 0 ? void 0 : packData.destinationId))
                issues.push('缺少 destinationId');
            if (!(packData === null || packData === void 0 ? void 0 : packData.rules) || packData.rules.length === 0)
                issues.push('缺少规则');
            if (!(packData === null || packData === void 0 ? void 0 : packData.displayName))
                issues.push('缺少 displayName');
            if (issues.length > 0) {
                logWarning(`     问题: ${issues.join(', ')}`);
            }
        });
        return { allPacks, activePacks, inactivePacks };
    }
    catch (error) {
        logError(`检查数据库 Pack 失败: ${error.message}`);
        console.error(error);
        return null;
    }
}
function checkJsonPacks() {
    logSection('检查 JSON 文件中的 Pack 数据');
    const packsDirectory = (0, path_1.join)(__dirname, '../src/trips/readiness/data/packs');
    if (!(0, fs_1.existsSync)(packsDirectory)) {
        logError(`Pack 目录不存在: ${packsDirectory}`);
        return null;
    }
    try {
        const files = (0, fs_1.readdirSync)(packsDirectory).filter(f => f.endsWith('.json'));
        logInfo(`找到 ${files.length} 个 JSON 文件`);
        const packs = [];
        files.forEach(filename => {
            var _a, _b, _c;
            try {
                const filePath = (0, path_1.join)(packsDirectory, filename);
                const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
                const pack = JSON.parse(content);
                const issues = [];
                if (!pack.packId)
                    issues.push('缺少 packId');
                if (!pack.destinationId)
                    issues.push('缺少 destinationId');
                if (!pack.rules || pack.rules.length === 0)
                    issues.push('缺少规则');
                if (!pack.displayName)
                    issues.push('缺少 displayName');
                if (!pack.version)
                    issues.push('缺少 version');
                if (!pack.lastReviewedAt)
                    issues.push('缺少 lastReviewedAt');
                packs.push({
                    filename,
                    packId: pack.packId || 'N/A',
                    destinationId: pack.destinationId || 'N/A',
                    rulesCount: ((_a = pack.rules) === null || _a === void 0 ? void 0 : _a.length) || 0,
                    checklistsCount: ((_b = pack.checklists) === null || _b === void 0 ? void 0 : _b.length) || 0,
                    hazardsCount: ((_c = pack.hazards) === null || _c === void 0 ? void 0 : _c.length) || 0,
                    issues,
                });
            }
            catch (error) {
                logError(`解析文件 ${filename} 失败: ${error.message}`);
            }
        });
        console.log(`\n📋 JSON 文件列表:`);
        packs.forEach((pack, index) => {
            const status = pack.issues.length === 0 ? '✓' : '✗';
            console.log(`\n  ${index + 1}. [${status}] ${pack.filename}`);
            console.log(`     Pack ID: ${pack.packId}`);
            console.log(`     目的地: ${pack.destinationId}`);
            console.log(`     规则数: ${pack.rulesCount}`);
            console.log(`     清单数: ${pack.checklistsCount}`);
            console.log(`     风险数: ${pack.hazardsCount}`);
            if (pack.issues.length > 0) {
                logWarning(`     问题: ${pack.issues.join(', ')}`);
            }
        });
        const validPacks = packs.filter(p => p.issues.length === 0);
        const invalidPacks = packs.filter(p => p.issues.length > 0);
        console.log(`\n📊 统计信息:`);
        console.log(`  有效 Pack: ${validPacks.length}`);
        console.log(`  无效 Pack: ${invalidPacks.length}`);
        console.log(`  总规则数: ${packs.reduce((sum, p) => sum + p.rulesCount, 0)}`);
        console.log(`  总清单数: ${packs.reduce((sum, p) => sum + p.checklistsCount, 0)}`);
        console.log(`  总风险数: ${packs.reduce((sum, p) => sum + p.hazardsCount, 0)}`);
        return packs;
    }
    catch (error) {
        logError(`检查 JSON Pack 失败: ${error.message}`);
        console.error(error);
        return null;
    }
}
async function compareDatabaseAndJson(dbPacks, jsonPacks) {
    logSection('对比数据库和 JSON 文件');
    if (!dbPacks || !jsonPacks) {
        logWarning('无法对比：缺少数据');
        return;
    }
    const dbPackIds = new Set(dbPacks.allPacks.map((p) => p.packId));
    const jsonPackIds = new Set(jsonPacks.map((p) => p.packId));
    const onlyInDb = Array.from(dbPackIds).filter(id => !jsonPackIds.has(id));
    if (onlyInDb.length > 0) {
        logWarning(`仅在数据库中的 Pack (${onlyInDb.length} 个):`);
        onlyInDb.forEach(id => console.log(`  - ${id}`));
    }
    const onlyInJson = Array.from(jsonPackIds).filter(id => !dbPackIds.has(id));
    if (onlyInJson.length > 0) {
        logWarning(`仅在 JSON 文件中的 Pack (${onlyInJson.length} 个):`);
        onlyInJson.forEach(id => console.log(`  - ${id}`));
    }
    const inBoth = Array.from(dbPackIds).filter(id => jsonPackIds.has(id));
    if (inBoth.length > 0) {
        logSuccess(`数据库和 JSON 文件都有的 Pack (${inBoth.length} 个):`);
        inBoth.forEach(id => console.log(`  ✓ ${id}`));
    }
}
async function checkRulesStructure() {
    logSection('检查规则结构');
    try {
        const packs = await prisma.readinessPack.findMany({
            where: { isActive: true },
            take: 5,
        });
        const ruleStats = {
            totalRules: 0,
            byCategory: {},
            bySeverity: {},
            withConditions: 0,
            withEvidence: 0,
        };
        packs.forEach(pack => {
            const packData = pack.packData;
            const rules = (packData === null || packData === void 0 ? void 0 : packData.rules) || [];
            rules.forEach((rule) => {
                ruleStats.totalRules++;
                const category = rule.category || 'unknown';
                ruleStats.byCategory[category] = (ruleStats.byCategory[category] || 0) + 1;
                const severity = rule.severity || 'unknown';
                ruleStats.bySeverity[severity] = (ruleStats.bySeverity[severity] || 0) + 1;
                if (rule.when) {
                    ruleStats.withConditions++;
                }
                if (rule.evidence) {
                    ruleStats.withEvidence++;
                }
            });
        });
        console.log(`\n📊 规则统计 (前 ${packs.length} 个 Pack):`);
        console.log(`  总规则数: ${ruleStats.totalRules}`);
        console.log(`  有条件的规则: ${ruleStats.withConditions}`);
        console.log(`  有证据的规则: ${ruleStats.withEvidence}`);
        console.log(`\n📂 按类别分布:`);
        Object.entries(ruleStats.byCategory)
            .sort((a, b) => b[1] - a[1])
            .forEach(([category, count]) => {
            console.log(`  ${category}: ${count}`);
        });
        console.log(`\n⚡ 按严重程度分布:`);
        Object.entries(ruleStats.bySeverity)
            .sort((a, b) => b[1] - a[1])
            .forEach(([severity, count]) => {
            console.log(`  ${severity}: ${count}`);
        });
    }
    catch (error) {
        logError(`检查规则结构失败: ${error.message}`);
        console.error(error);
    }
}
async function main() {
    console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║          Readiness Pack 数据检查工具                          ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
    try {
        const dbPacks = await checkDatabasePacks();
        const jsonPacks = checkJsonPacks();
        await compareDatabaseAndJson(dbPacks, jsonPacks);
        await checkRulesStructure();
        logSection('检查完成');
        logSuccess('数据检查完成！');
    }
    catch (error) {
        logError(`检查失败: ${error.message}`);
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
//# sourceMappingURL=check-readiness-packs.js.map