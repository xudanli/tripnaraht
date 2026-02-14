"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const llm_service_1 = require("../src/llm/services/llm.service");
const llm_request_dto_1 = require("../src/llm/dto/llm-request.dto");
const prisma = new client_1.PrismaClient();
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LIMIT = 1000;
async function translateName(nameCN, llmService) {
    if (!nameCN || nameCN.trim().length === 0) {
        throw new Error('nameCN 不能为空');
    }
    const prompt = `请将以下中文地名翻译成英文。只返回英文翻译，不要包含任何解释或其他内容。

中文名称：${nameCN}

英文翻译：`;
    try {
        const response = await llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
        const translated = response
            .trim()
            .replace(/^["']|["']$/g, '')
            .replace(/\n/g, ' ')
            .trim();
        if (!translated || translated.length === 0) {
            throw new Error('翻译结果为空');
        }
        return translated;
    }
    catch (error) {
        throw new Error(`翻译失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
    }
}
async function translateBatch(places, llmService, batchSize = 50, delayMs = 200) {
    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];
    console.log(`\n开始批量翻译，共 ${places.length} 个 Place`);
    console.log(`批量大小: ${batchSize}, 延迟: ${delayMs}ms\n`);
    for (let i = 0; i < places.length; i += batchSize) {
        const batch = places.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(places.length / batchSize);
        console.log(`处理批次 ${batchNum}/${totalBatches} (${batch.length} 个 Place)...`);
        for (const place of batch) {
            try {
                if (place.nameEN && place.nameEN.trim().length > 0) {
                    console.log(`  Place ${place.id} (${place.nameCN}) 已有 nameEN，跳过`);
                    skipped++;
                    continue;
                }
                const translated = await translateName(place.nameCN, llmService);
                console.log(`  Place ${place.id}: "${place.nameCN}" -> "${translated}"`);
                if (process.argv.includes('--dry-run')) {
                    console.log(`  [DRY-RUN] 将更新 nameEN = "${translated}"`);
                }
                else {
                    await prisma.place.update({
                        where: { id: place.id },
                        data: { nameEN: translated },
                    });
                }
                success++;
            }
            catch (error) {
                console.log(`  ✗ Place ${place.id} (${place.nameCN}): 失败 - ${error.message}`);
                failed++;
                errors.push({
                    placeId: place.id,
                    name: place.nameCN,
                    error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                });
            }
            if (i + batchSize < places.length || place !== batch[batch.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        if (i + batchSize < places.length) {
            console.log(`  等待 ${delayMs}ms...\n`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return {
        total: places.length,
        success,
        failed,
        skipped,
        errors,
    };
}
async function main() {
    var _a;
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    const batchSize = batchSizeArg
        ? parseInt(batchSizeArg.split('=')[1], 10)
        : DEFAULT_BATCH_SIZE;
    const limit = limitArg
        ? parseInt(limitArg.split('=')[1], 10)
        : DEFAULT_LIMIT;
    console.log('=== 冰岛 POI 名称翻译脚本 ===\n');
    console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
    console.log(`批次大小: ${batchSize}`);
    console.log(`处理限制: ${limit}\n`);
    let app;
    let llmService = null;
    try {
        console.log('测试数据库连接...');
        try {
            await prisma.$connect();
            const testCount = await prisma.$queryRaw `
        SELECT COUNT(*) as count FROM "Place" LIMIT 1
      `;
            console.log('✓ 数据库连接正常\n');
        }
        catch (error) {
            console.error('❌ 数据库连接失败:', error.message);
            throw error;
        }
        console.log('初始化 NestJS 应用...');
        console.log('（这可能需要几秒钟，请耐心等待）\n');
        console.log('  正在创建应用上下文...');
        const initPromise = core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
            logger: ['error', 'warn'],
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('应用初始化超时（60秒）')), 60000));
        app = await Promise.race([initPromise, timeoutPromise]);
        console.log('  正在获取 LlmService...');
        llmService = app.get(llm_service_1.LlmService);
        if (!llmService) {
            throw new Error('LlmService 未找到');
        }
        console.log('  LlmService 获取成功');
        console.log('✓ NestJS 应用初始化完成\n');
        console.log('查询需要翻译的冰岛 Place...');
        const totalCount = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (p."nameEN" IS NULL OR p."nameEN" = '')
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
    `;
        console.log(`  需要翻译的 Place 总数: ${((_a = totalCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        const icelandPlaces = await prisma.$queryRaw `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN"
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (p."nameEN" IS NULL OR p."nameEN" = '')
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
      ORDER BY p.id
      LIMIT ${limit}
    `;
        console.log(`✓ 找到 ${icelandPlaces.length} 个需要翻译的 Place\n`);
        if (icelandPlaces.length === 0) {
            console.log('所有 Place 都已具备 nameEN，无需翻译。');
            return;
        }
        console.log('统计信息:');
        const nameCNLengths = icelandPlaces.map(p => p.nameCN.length);
        const avgLength = nameCNLengths.reduce((a, b) => a + b, 0) / nameCNLengths.length;
        console.log(`  - 平均名称长度: ${avgLength.toFixed(1)} 字符`);
        console.log(`  - 最长名称: ${Math.max(...nameCNLengths)} 字符`);
        console.log(`  - 最短名称: ${Math.min(...nameCNLengths)} 字符\n`);
        const delayMs = parseInt(process.env.DELAY_MS || '200', 10);
        const results = await translateBatch(icelandPlaces, llmService, batchSize, delayMs);
        console.log('\n=== 翻译完成 ===');
        console.log(`总计: ${results.total}`);
        console.log(`成功: ${results.success} (${(results.success / results.total * 100).toFixed(1)}%)`);
        console.log(`失败: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`);
        console.log(`跳过: ${results.skipped} (${(results.skipped / results.total * 100).toFixed(1)}%)`);
        if (results.errors.length > 0) {
            console.log('\n失败详情（前 10 个）:');
            results.errors.slice(0, 10).forEach(err => {
                console.log(`  - Place ${err.placeId} (${err.name}): ${err.error}`);
            });
            if (results.errors.length > 10) {
                console.log(`  ... 还有 ${results.errors.length - 10} 个错误`);
            }
        }
    }
    catch (error) {
        console.error('\n❌ 脚本执行失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
    finally {
        if (app) {
            await app.close();
        }
        await prisma.$disconnect();
    }
}
if (require.main === module) {
    main().catch(error => {
        console.error('未处理的错误:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=translate-iceland-poi-names.js.map