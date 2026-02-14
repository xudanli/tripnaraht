#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
const node_dns_1 = __importDefault(require("node:dns"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
node_dns_1.default.setDefaultResultOrder('ipv4first');
class SimpleEmbeddingService {
    constructor() {
        this.provider = process.env.EMBEDDING_PROVIDER || 'openai';
        this.openaiApiKey = process.env.OPENAI_API_KEY || '';
        this.openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        if (!this.openaiApiKey) {
            console.warn('⚠️ OPENAI_API_KEY 未配置，embedding 生成将失败');
        }
        const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
            process.env.ALL_PROXY || process.env.all_proxy;
        let httpsAgent;
        if (proxyUrl) {
            console.log(`  使用代理: ${proxyUrl}`);
            httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        }
        else {
            httpsAgent = new https_1.default.Agent({
                keepAlive: true,
                timeout: 60000,
                family: 4,
            });
        }
        this.httpClient = axios_1.default.create({
            baseURL: this.openaiBaseUrl,
            timeout: 60000,
            proxy: false,
            httpsAgent,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    async generateEmbedding(text) {
        var _a, _b, _c, _d, _e;
        if (!text || text.trim().length === 0) {
            throw new Error('文本不能为空');
        }
        try {
            const response = await this.httpClient.post('/embeddings', {
                model: 'text-embedding-3-small',
                input: text,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                },
            });
            if ((_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.embedding) {
                return response.data.data[0].embedding;
            }
            throw new Error('OpenAI API 返回格式错误');
        }
        catch (error) {
            if (error.response) {
                throw new Error(`OpenAI API 错误 (${error.response.status}): ${((_e = (_d = error.response.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || '未知错误'}`);
            }
            throw error;
        }
    }
    getEmbeddingDimension() {
        return 1536;
    }
}
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    for (const arg of args) {
        if (arg.startsWith('--country=')) {
            options.country = arg.split('=')[1].toUpperCase();
        }
        else if (arg.startsWith('--city=')) {
            options.city = arg.split('=')[1];
        }
        else if (arg === '--force') {
            options.force = true;
        }
        else if (arg.startsWith('--batch=')) {
            options.batch = parseInt(arg.split('=')[1], 10);
        }
        else if (arg.startsWith('--delay=')) {
            options.delay = parseInt(arg.split('=')[1], 10);
        }
        else if (arg === '--dry-run') {
            options.dryRun = true;
        }
        else if (arg.startsWith('--limit=')) {
            options.limit = parseInt(arg.split('=')[1], 10);
        }
        else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }
    return options;
}
function printHelp() {
    console.log(`
通用 Place Embedding 生成脚本

用法：
  tsx scripts/generate-place-embeddings.ts [选项]

选项：
  --country=CODE    指定国家代码（如 IS, JP, CN, US）
  --city=NAME       指定城市名称（支持中文或英文）
  --force           强制重新生成（覆盖已有 embedding）
  --batch=N         批量大小（默认 10）
  --delay=MS        批次间延迟毫秒数（默认 100）
  --limit=N         最大处理数量
  --dry-run         只显示统计信息，不执行生成
  --help, -h        显示帮助信息

示例：
  # 处理所有地点
  tsx scripts/generate-place-embeddings.ts

  # 处理冰岛的地点
  tsx scripts/generate-place-embeddings.ts --country=IS

  # 处理日本东京的地点
  tsx scripts/generate-place-embeddings.ts --country=JP --city=Tokyo

  # 强制重新生成，限制处理 100 个
  tsx scripts/generate-place-embeddings.ts --country=IS --force --limit=100

  # 预览模式，只显示统计
  tsx scripts/generate-place-embeddings.ts --country=IS --dry-run
`);
}
function buildSearchText(place) {
    const parts = [];
    if (place.nameCN)
        parts.push(place.nameCN);
    if (place.nameEN)
        parts.push(place.nameEN);
    if (place.address)
        parts.push(place.address);
    if (place.description)
        parts.push(place.description);
    const metadata = place.metadata;
    if (metadata === null || metadata === void 0 ? void 0 : metadata.description)
        parts.push(metadata.description);
    if (metadata === null || metadata === void 0 ? void 0 : metadata.tags) {
        if (Array.isArray(metadata.tags)) {
            parts.push(metadata.tags.join(' '));
        }
    }
    if (metadata === null || metadata === void 0 ? void 0 : metadata.reviews) {
        const reviews = Array.isArray(metadata.reviews) ? metadata.reviews.slice(0, 3) : [];
        reviews.forEach((review) => {
            if (review.text) {
                parts.push(review.text.substring(0, 100));
            }
        });
    }
    if (metadata === null || metadata === void 0 ? void 0 : metadata.regionKey) {
        parts.push(metadata.regionKey);
    }
    if (metadata === null || metadata === void 0 ? void 0 : metadata.canonicalType) {
        parts.push(metadata.canonicalType);
    }
    return parts.join(' ');
}
async function generatePlaceEmbedding(placeId, place, embeddingService) {
    try {
        const searchText = buildSearchText(place);
        if (!searchText || searchText.trim().length === 0) {
            return {
                success: false,
                error: '没有可用的文本内容',
            };
        }
        const embedding = await embeddingService.generateEmbedding(searchText);
        const isZeroVector = embedding.every(v => v === 0);
        if (isZeroVector) {
            return {
                success: false,
                error: 'embedding 生成失败（零向量）',
            };
        }
        const embeddingStr = `[${embedding.join(',')}]`;
        await prisma.$executeRawUnsafe(`UPDATE "Place" SET embedding = $1::vector WHERE id = $2`, embeddingStr, placeId);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        };
    }
}
async function generateEmbeddingsBatch(places, embeddingService, options) {
    const { batchSize, delayMs, force } = options;
    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];
    console.log(`\n开始批量生成 embedding，共 ${places.length} 个 Place`);
    console.log(`批量大小: ${batchSize}, 延迟: ${delayMs}ms, 强制模式: ${force ? '是' : '否'}\n`);
    for (let i = 0; i < places.length; i += batchSize) {
        const batch = places.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(places.length / batchSize);
        console.log(`处理批次 ${batchNum}/${totalBatches} (${batch.length} 个 Place)...`);
        await Promise.all(batch.map(async (place) => {
            var _a, _b;
            if (!force) {
                const existingPlace = await prisma.$queryRawUnsafe(`SELECT embedding::text as embedding_text FROM "Place" WHERE id = $1`, place.id);
                const embeddingStr = (_a = existingPlace[0]) === null || _a === void 0 ? void 0 : _a.embedding_text;
                if (embeddingStr) {
                    const embeddingArray = (_b = embeddingStr.match(/\[(.*?)\]/)) === null || _b === void 0 ? void 0 : _b[1];
                    if (embeddingArray) {
                        const values = embeddingArray.split(',').map((v) => parseFloat(v.trim()));
                        const isZeroVector = values.every((v) => v === 0 || isNaN(v));
                        if (!isZeroVector) {
                            console.log(`  ⏭️  Place ${place.id} (${place.nameCN}) 已有有效 embedding，跳过`);
                            skipped++;
                            return;
                        }
                    }
                }
            }
            const result = await generatePlaceEmbedding(place.id, place, embeddingService);
            if (result.success) {
                console.log(`  ✓ Place ${place.id} (${place.nameCN}): 成功`);
                success++;
            }
            else {
                console.log(`  ✗ Place ${place.id} (${place.nameCN}): 失败 - ${result.error}`);
                failed++;
                errors.push({
                    placeId: place.id,
                    name: place.nameCN,
                    error: result.error || '未知错误',
                });
            }
        }));
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
function buildWhereClause(options, includeEmbeddingCheck) {
    const conditions = [];
    if (options.country) {
        conditions.push(client_1.Prisma.sql `c."countryCode" = ${options.country}`);
    }
    if (options.city) {
        conditions.push(client_1.Prisma.sql `(c."nameCN" ILIKE ${`%${options.city}%`} OR c."nameEN" ILIKE ${`%${options.city}%`})`);
    }
    if (includeEmbeddingCheck && !options.force) {
        conditions.push(client_1.Prisma.sql `(
      p.embedding IS NULL 
      OR p.embedding::text LIKE '[0,0,0%'
      OR array_length(string_to_array(trim(both '[]' from p.embedding::text), ','), 1) IS NULL
    )`);
    }
    if (conditions.length === 0) {
        return client_1.Prisma.sql `WHERE 1=1`;
    }
    return client_1.Prisma.sql `WHERE ${client_1.Prisma.join(conditions, ' AND ')}`;
}
async function main() {
    var _a;
    const options = parseArgs();
    let title = '通用 Place Embedding 生成脚本';
    if (options.country) {
        title = `${options.country} Place Embedding 生成脚本`;
    }
    if (options.city) {
        title += ` (${options.city})`;
    }
    console.log(`=== ${title} ===\n`);
    console.log('运行选项:');
    console.log(`  国家: ${options.country || '全部'}`);
    console.log(`  城市: ${options.city || '全部'}`);
    console.log(`  强制模式: ${options.force ? '是' : '否'}`);
    console.log(`  批量大小: ${options.batch || 10}`);
    console.log(`  延迟: ${options.delay || 100}ms`);
    console.log(`  最大数量: ${options.limit || '无限制'}`);
    console.log(`  预览模式: ${options.dryRun ? '是' : '否'}\n`);
    let embeddingService = null;
    try {
        console.log('初始化 Embedding 服务...');
        embeddingService = new SimpleEmbeddingService();
        console.log('✓ Embedding 服务初始化完成\n');
        console.log('查询 Place 统计信息...');
        const totalWhereClause = buildWhereClause(options, false);
        const totalCount = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      ${totalWhereClause}
    `;
        console.log(`  符合条件的 Place 总数: ${((_a = totalCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        const whereClause = buildWhereClause(options, true);
        let limitClause = client_1.Prisma.sql ``;
        if (options.limit) {
            limitClause = client_1.Prisma.sql `LIMIT ${options.limit}`;
        }
        const places = await prisma.$queryRaw `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.address,
        p.description,
        p.metadata,
        c."nameCN" as "cityName",
        c."countryCode"
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      ${whereClause}
      ORDER BY p.id
      ${limitClause}
    `;
        console.log(`  需要处理的 Place 数量: ${places.length}\n`);
        if (places.length === 0) {
            console.log('✓ 所有 Place 都已具备 embedding，无需处理。');
            return;
        }
        console.log('数据统计:');
        const withNameEN = places.filter(p => p.nameEN).length;
        const withAddress = places.filter(p => p.address).length;
        const withDescription = places.filter(p => p.description).length;
        const withMetadata = places.filter(p => p.metadata).length;
        const byCountry = places.reduce((acc, p) => {
            const code = p.countryCode || 'Unknown';
            acc[code] = (acc[code] || 0) + 1;
            return acc;
        }, {});
        console.log(`  - 有英文名称: ${withNameEN} (${(withNameEN / places.length * 100).toFixed(1)}%)`);
        console.log(`  - 有地址: ${withAddress} (${(withAddress / places.length * 100).toFixed(1)}%)`);
        console.log(`  - 有描述: ${withDescription} (${(withDescription / places.length * 100).toFixed(1)}%)`);
        console.log(`  - 有元数据: ${withMetadata} (${(withMetadata / places.length * 100).toFixed(1)}%)`);
        console.log('\n  按国家分布:');
        Object.entries(byCountry)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([code, count]) => {
            console.log(`    ${code}: ${count} (${(count / places.length * 100).toFixed(1)}%)`);
        });
        if (options.dryRun) {
            console.log('\n✓ 预览模式，不执行生成操作。');
            return;
        }
        const batchSize = options.batch || parseInt(process.env.BATCH_SIZE || '10', 10);
        const delayMs = options.delay || parseInt(process.env.DELAY_MS || '100', 10);
        const results = await generateEmbeddingsBatch(places, embeddingService, { batchSize, delayMs, force: options.force || false });
        console.log('\n=== 处理完成 ===');
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
//# sourceMappingURL=generate-place-embeddings.js.map