#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const fs_1 = require("fs");
const path_1 = require("path");
const COUNTRY_MAP = {
    IS: { name: 'Iceland', nameCN: '冰岛' },
    NO: { name: 'Norway', nameCN: '挪威' },
    CN: { name: 'China', nameCN: '中国' },
};
async function generateAndSaveSkeletonPack(countryCode) {
    var _a, _b, _c, _d;
    console.log(`\n📦 通过 MCP Server 生成 Skeleton Pack: ${countryCode}\n`);
    const countryInfo = COUNTRY_MAP[countryCode.toUpperCase()];
    if (!countryInfo) {
        console.error(`❌ 未知的国家代码: ${countryCode}`);
        console.error(`支持的国家：${Object.keys(COUNTRY_MAP).join(', ')}`);
        process.exit(1);
    }
    const transport = new stdio_js_1.StdioClientTransport({
        command: 'npx',
        args: ['tsx', 'src/mcp/mcp-skills-server.ts'],
        env: process.env,
    });
    const client = new index_js_1.Client({
        name: 'skeleton-pack-generator',
        version: '1.0.0',
    }, {
        capabilities: {},
    });
    try {
        console.log('步骤 1: 连接到 MCP Skills Server...');
        await client.connect(transport);
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('✅ 已连接\n');
        console.log(`步骤 2: 生成 ${countryInfo.nameCN} 的 Skeleton Pack...`);
        const skeletonResult = await client.callTool({
            name: 'tripnara.countryPack.newSkeleton',
            arguments: {
                countryCode: countryCode.toUpperCase(),
                countryName: countryInfo.name,
                countryNameCN: countryInfo.nameCN,
                packType: 'readiness',
            },
        });
        const resultData = JSON.parse(skeletonResult.content[0].text);
        const skeleton = resultData.skeleton;
        if (!skeleton) {
            throw new Error('生成失败：返回结果为空');
        }
        console.log(`✅ Skeleton Pack 生成成功`);
        console.log(`   Pack ID: ${skeleton.packId}`);
        console.log(`   规则数量: ${((_a = skeleton.rules) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        if (skeleton.rules) {
            console.log(`   规则类别: ${skeleton.rules.map((r) => r.category).join(', ')}`);
        }
        if (skeleton.checklists) {
            console.log(`   清单数量: ${skeleton.checklists.length}`);
        }
        console.log('');
        console.log('步骤 3: 获取改进建议...');
        const suggestResult = await client.callTool({
            name: 'tripnara.countryPack.suggestImprovements',
            arguments: {
                countryCode: countryCode.toUpperCase(),
                packType: 'readiness',
                currentPackSnapshot: skeleton,
            },
        });
        const suggestData = JSON.parse(suggestResult.content[0].text);
        console.log(`\n📊 改进建议:`);
        console.log(`   缺失字段: ${((_b = suggestData.missingFields) === null || _b === void 0 ? void 0 : _b.length) || 0}`);
        console.log(`   质量缺口: ${((_c = suggestData.qualityGaps) === null || _c === void 0 ? void 0 : _c.length) || 0}`);
        console.log(`   待办事项: ${((_d = suggestData.priorityTodo) === null || _d === void 0 ? void 0 : _d.length) || 0}`);
        if (suggestData.qualityGaps && suggestData.qualityGaps.length > 0) {
            console.log(`\n   质量缺口详情:`);
            suggestData.qualityGaps.forEach((gap, idx) => {
                console.log(`     ${idx + 1}. [${gap.category}] ${gap.issue}`);
                console.log(`        当前: ${gap.current}, 建议: ${gap.recommended} (影响: ${gap.impact})`);
            });
        }
        if (suggestData.priorityTodo && suggestData.priorityTodo.length > 0) {
            console.log(`\n   优先级待办:`);
            suggestData.priorityTodo.forEach((todo, idx) => {
                console.log(`     ${idx + 1}. [${todo.priority}] ${todo.task}`);
                console.log(`        工作量: ${todo.estimatedEffort}, 影响: ${todo.impact}`);
            });
        }
        console.log('');
        const outputDir = (0, path_1.join)(__dirname, '../src/trips/readiness/data/packs');
        const fileName = `${skeleton.packId}.json`;
        const filePath = (0, path_1.join)(outputDir, fileName);
        console.log('步骤 4: 保存 Pack 到文件...');
        (0, fs_1.mkdirSync)(outputDir, { recursive: true });
        (0, fs_1.writeFileSync)(filePath, JSON.stringify(skeleton, null, 2), 'utf-8');
        console.log(`✅ Pack 已保存到文件: ${filePath}\n`);
        await client.close();
        console.log('✅ 完成！');
        console.log(`\n📝 下一步：`);
        console.log(`   1. 查看生成的 Pack 文件: ${filePath}`);
        console.log(`   2. 如需导入数据库，运行:`);
        console.log(`      npx tsx scripts/check-and-import-readiness-packs.ts import ${filePath}`);
        console.log('');
    }
    catch (error) {
        console.error('\n❌ 生成失败:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
        try {
            await client.close();
        }
        catch (e) {
        }
        process.exit(1);
    }
}
async function main() {
    const countryCode = process.argv[2];
    if (!countryCode) {
        console.error('用法: npx tsx scripts/generate-and-save-skeleton-pack.ts <countryCode>');
        console.error('示例: npx tsx scripts/generate-and-save-skeleton-pack.ts IS');
        process.exit(1);
    }
    await generateAndSaveSkeletonPack(countryCode);
}
main().catch(console.error);
//# sourceMappingURL=generate-and-save-skeleton-pack.js.map