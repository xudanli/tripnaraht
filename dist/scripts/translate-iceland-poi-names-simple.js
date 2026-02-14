"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const prisma = new client_1.PrismaClient();
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LIMIT = 1000;
function getLlmConfig() {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (deepseekKey) {
        return {
            provider: 'deepseek',
            apiKey: deepseekKey,
            baseUrl: 'https://api.deepseek.com/v1',
        };
    }
    if (openaiKey) {
        return {
            provider: 'openai',
            apiKey: openaiKey,
            baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        };
    }
    if (anthropicKey) {
        return {
            provider: 'anthropic',
            apiKey: anthropicKey,
            baseUrl: 'https://api.anthropic.com/v1',
        };
    }
    throw new Error('未找到任何 LLM API Key（需要 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 ANTHROPIC_API_KEY）');
}
async function translateName(nameCN, config) {
    var _a, _b, _c;
    if (!nameCN || nameCN.trim().length === 0) {
        throw new Error('nameCN 不能为空');
    }
    const prompt = `请将以下中文地名翻译成英文。只返回英文翻译，不要包含任何解释或其他内容。

中文名称：${nameCN}

英文翻译：`;
    try {
        let response;
        if (config.provider === 'deepseek' || config.provider === 'openai') {
            const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
            const httpsAgent = proxyUrl
                ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
                : new https_1.default.Agent({ keepAlive: true, family: 4 });
            const apiResponse = await axios_1.default.post(`${config.baseUrl}/chat/completions`, {
                model: config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 100,
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                httpsAgent,
                timeout: 30000,
            });
            response = ((_b = (_a = apiResponse.data.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
        }
        else if (config.provider === 'anthropic') {
            const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
            const httpsAgent = proxyUrl
                ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
                : new https_1.default.Agent({ keepAlive: true, family: 4 });
            const apiResponse = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-3-haiku-20240307',
                max_tokens: 100,
                messages: [{ role: 'user', content: prompt }],
            }, {
                headers: {
                    'x-api-key': config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json',
                },
                httpsAgent,
                timeout: 30000,
            });
            response = ((_c = apiResponse.data.content[0]) === null || _c === void 0 ? void 0 : _c.text) || '';
        }
        else {
            throw new Error(`不支持的 LLM provider: ${config.provider}`);
        }
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
async function translateBatch(places, config, batchSize = 50, delayMs = 200, isDryRun = false) {
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
                const translated = await translateName(place.nameCN, config);
                console.log(`  Place ${place.id}: "${place.nameCN}" -> "${translated}"`);
                if (isDryRun) {
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
    console.log('=== 冰岛 POI 名称翻译脚本（简化版）===\n');
    console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
    console.log(`批次大小: ${batchSize}`);
    console.log(`处理限制: ${limit}\n`);
    try {
        console.log('检查 LLM 配置...');
        const llmConfig = getLlmConfig();
        console.log(`✓ 使用 ${llmConfig.provider} API\n`);
        console.log('测试数据库连接...');
        await prisma.$connect();
        console.log('✓ 数据库连接正常\n');
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
        const delayMs = parseInt(process.env.DELAY_MS || '200', 10);
        const results = await translateBatch(icelandPlaces, llmConfig, batchSize, delayMs, isDryRun);
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
        await prisma.$disconnect();
    }
}
if (require.main === module) {
    main().catch(error => {
        console.error('未处理的错误:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=translate-iceland-poi-names-simple.js.map