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
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const prisma = new client_1.PrismaClient();
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_LIMIT = 100;
function getExpertPrompt() {
    const promptPath = path.resolve(__dirname, '../prompts/agents/Iceland POI.md');
    return fs.readFileSync(promptPath, 'utf-8');
}
function getLlmConfig() {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
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
    throw new Error('未找到任何 LLM API Key');
}
async function translatePOI(place, config, expertPrompt) {
    var _a, _b, _c, _d, _e;
    const originalName = place.nameCN || place.nameEN || 'Unknown';
    const category = place.category;
    const metadataType = ((_a = place.metadata) === null || _a === void 0 ? void 0 : _a.type) || '';
    const inputData = {
        nameOriginal: originalName,
        nameEN: place.nameEN || '',
        nameCN: place.nameCN || '',
        category: category,
        metadata_type: metadataType,
        countryCode: 'IS',
        source: ((_b = place.metadata) === null || _b === void 0 ? void 0 : _b.source) || 'unknown',
    };
    const fullPrompt = `${expertPrompt}

================
当前 POI 数据
================
${JSON.stringify(inputData, null, 2)}

请按照上述规范，为这个 POI 生成标准化的英文名和中文名。
必须严格按照输出格式返回 JSON，不要包含任何其他解释。`;
    try {
        let response;
        if (config.provider === 'deepseek' || config.provider === 'openai') {
            const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
            const httpsAgent = proxyUrl
                ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
                : new https_1.default.Agent({ keepAlive: true, family: 4 });
            const apiResponse = await axios_1.default.post(`${config.baseUrl}/chat/completions`, {
                model: config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o',
                messages: [
                    { role: 'system', content: 'You are a professional Iceland POI translation expert. Always respond with valid JSON only.' },
                    { role: 'user', content: fullPrompt }
                ],
                temperature: 0.3,
                max_tokens: 1000,
                response_format: { type: 'json_object' },
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                httpsAgent,
                timeout: 60000,
            });
            response = ((_d = (_c = apiResponse.data.choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || '';
        }
        else if (config.provider === 'anthropic') {
            const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
            const httpsAgent = proxyUrl
                ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
                : new https_1.default.Agent({ keepAlive: true, family: 4 });
            const apiResponse = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                messages: [
                    { role: 'user', content: fullPrompt }
                ],
            }, {
                headers: {
                    'x-api-key': config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json',
                },
                httpsAgent,
                timeout: 60000,
            });
            response = ((_e = apiResponse.data.content[0]) === null || _e === void 0 ? void 0 : _e.text) || '';
        }
        else {
            throw new Error(`不支持的 LLM provider: ${config.provider}`);
        }
        let result;
        try {
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
            result = JSON.parse(jsonStr);
        }
        catch (parseError) {
            throw new Error(`JSON 解析失败: ${parseError}. 响应: ${response.substring(0, 200)}`);
        }
        if (!result.nameEN || !result.nameCN) {
            throw new Error(`翻译结果缺少必需字段: nameEN=${result.nameEN}, nameCN=${result.nameCN}`);
        }
        result.id = place.id.toString();
        return result;
    }
    catch (error) {
        throw new Error(`翻译失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
    }
}
async function translateBatch(places, config, expertPrompt, batchSize = 20, delayMs = 500, isDryRun = false) {
    let success = 0;
    let failed = 0;
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
                const originalName = place.nameCN || place.nameEN || 'Unknown';
                console.log(`  Place ${place.id}: "${originalName}"`);
                const translation = await translatePOI(place, config, expertPrompt);
                console.log(`    -> nameEN: "${translation.nameEN}"`);
                console.log(`    -> nameCN: "${translation.nameCN}"`);
                console.log(`    -> method: ${translation.translation_method}, confidence: ${translation.translation_confidence}`);
                if (isDryRun) {
                    console.log(`  [DRY-RUN] 将更新数据`);
                }
                else {
                    const updateData = {
                        nameEN: translation.nameEN,
                        nameCN: translation.nameCN,
                        updatedAt: new Date(),
                    };
                    const currentMetadata = place.metadata || {};
                    const newMetadata = {
                        ...currentMetadata,
                        translation: {
                            method: translation.translation_method,
                            confidence: translation.translation_confidence,
                            explanation: translation.explanation,
                            aliasesEN: translation.aliasesEN || [],
                            aliasesCN: translation.aliasesCN || [],
                            audit: translation.audit || {},
                            translatedAt: new Date().toISOString(),
                        },
                    };
                    updateData.metadata = newMetadata;
                    await prisma.place.update({
                        where: { id: place.id },
                        data: updateData,
                    });
                }
                success++;
            }
            catch (error) {
                console.log(`  ✗ Place ${place.id}: 失败 - ${error.message}`);
                failed++;
                errors.push({
                    placeId: place.id,
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
    console.log('=== 冰岛 POI 专业翻译脚本 ===\n');
    console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
    console.log(`批次大小: ${batchSize}`);
    console.log(`处理限制: ${limit}\n`);
    try {
        console.log('加载专家角色提示词...');
        const expertPrompt = getExpertPrompt();
        console.log('✓ 提示词加载完成\n');
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
    `;
        console.log(`  冰岛 Place 总数: ${((_a = totalCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        const icelandPlaces = await prisma.$queryRaw `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (
          (p."nameCN" IS NOT NULL AND p."nameCN" != '' AND (p."nameEN" IS NULL OR p."nameEN" = ''))
          OR (p."nameEN" IS NOT NULL AND p."nameEN" != '' AND (p."nameCN" IS NULL OR p."nameCN" = ''))
          OR (p."nameCN" IS NOT NULL AND p."nameCN" != '' AND p."nameEN" IS NOT NULL AND p."nameEN" != '')
        )
      ORDER BY 
        CASE 
          WHEN p."nameCN" IS NOT NULL AND p."nameCN" != '' AND (p."nameEN" IS NULL OR p."nameEN" = '') THEN 1
          WHEN p."nameEN" IS NOT NULL AND p."nameEN" != '' AND (p."nameCN" IS NULL OR p."nameCN" = '') THEN 2
          ELSE 3
        END,
        p.id
      LIMIT ${limit}
    `;
        console.log(`✓ 找到 ${icelandPlaces.length} 个需要翻译的 Place\n`);
        if (icelandPlaces.length === 0) {
            console.log('没有需要翻译的 Place。');
            return;
        }
        const delayMs = parseInt(process.env.DELAY_MS || '500', 10);
        const results = await translateBatch(icelandPlaces, llmConfig, expertPrompt, batchSize, delayMs, isDryRun);
        console.log('\n=== 翻译完成 ===');
        console.log(`总计: ${results.total}`);
        console.log(`成功: ${results.success} (${(results.success / results.total * 100).toFixed(1)}%)`);
        console.log(`失败: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`);
        if (results.errors.length > 0) {
            console.log('\n失败详情（前 10 个）:');
            results.errors.slice(0, 10).forEach(err => {
                console.log(`  - Place ${err.placeId}: ${err.error}`);
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
//# sourceMappingURL=translate-iceland-poi-expert.js.map