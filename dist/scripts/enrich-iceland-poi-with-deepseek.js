#!/usr/bin/env tsx
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
const node_dns_1 = __importDefault(require("node:dns"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
node_dns_1.default.setDefaultResultOrder('ipv4first');
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        input: 'data/iceland_poi.json.geojson',
        output: 'data/iceland_poi_enriched.json.geojson',
        batchSize: 5,
        delay: 2000,
        dryRun: false,
        skipExisting: true,
        noProxy: false,
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--input' && args[i + 1]) {
            options.input = args[i + 1];
            i++;
        }
        else if (arg === '--output' && args[i + 1]) {
            options.output = args[i + 1];
            i++;
        }
        else if (arg === '--batch' && args[i + 1]) {
            options.batchSize = parseInt(args[i + 1], 10);
            i++;
        }
        else if (arg === '--delay' && args[i + 1]) {
            options.delay = parseInt(args[i + 1], 10);
            i++;
        }
        else if (arg === '--limit' && args[i + 1]) {
            options.limit = parseInt(args[i + 1], 10);
            i++;
        }
        else if (arg === '--dry-run') {
            options.dryRun = true;
        }
        else if (arg === '--no-skip-existing') {
            options.skipExisting = false;
        }
        else if (arg === '--no-proxy') {
            options.noProxy = true;
        }
    }
    return options;
}
function createDeepSeekClient(noProxy = false) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY 环境变量未配置');
    }
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    const proxyUrl = noProxy ? null : (process.env.HTTPS_PROXY || process.env.https_proxy ||
        process.env.ALL_PROXY || process.env.all_proxy);
    let httpsAgent;
    if (proxyUrl && !noProxy) {
        try {
            console.log(`  使用代理: ${proxyUrl}`);
            httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        }
        catch (error) {
            console.warn(`  ⚠️  代理配置失败，使用直接连接: ${error instanceof Error ? error.message : String(error)}`);
            httpsAgent = new https_1.default.Agent({
                keepAlive: true,
                timeout: 60000,
                family: 4,
            });
        }
    }
    else {
        if (noProxy) {
            console.log(`  直接连接（已禁用代理）`);
        }
        httpsAgent = new https_1.default.Agent({
            keepAlive: true,
            timeout: 60000,
            family: 4,
        });
    }
    return axios_1.default.create({
        baseURL,
        timeout: 60000,
        proxy: false,
        httpsAgent,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
    });
}
function hasCompleteData(feature) {
    const props = feature.properties;
    const hasValidName = !!((props.nafnFitju && props.nafnFitju.trim() !== '' && !props.nafnFitju.startsWith('未命名地点')) ||
        (props.nameCN && props.nameCN.trim() !== '' && !props.nameCN.startsWith('未命名地点')) ||
        (props.nameEN && props.nameEN.trim() !== '' && !props.nameEN.startsWith('未命名地点')));
    if (!hasValidName) {
        return false;
    }
    if (props.description && props.description.trim() !== '') {
        return true;
    }
    if (props.enrichedMetadata && Object.keys(props.enrichedMetadata).length > 0) {
        return true;
    }
    if ((props.nameCN && !props.nameCN.startsWith('未命名地点')) ||
        (props.nameEN && !props.nameEN.startsWith('未命名地点'))) {
        return true;
    }
    return props.nafnFitju &&
        props.nafnFitju.trim() !== '' &&
        !props.nafnFitju.startsWith('未命名地点');
}
function buildPrompt(feature) {
    const [lng, lat] = feature.geometry.coordinates;
    const existingName = feature.properties.nafnFitju;
    const type = feature.properties.gerdGosgig || 'unknown';
    const fid = feature.properties.fid;
    return `你是一个冰岛地理和旅游专家。请根据以下坐标信息，提供完整的地点信息。

坐标：经度 ${lng.toFixed(6)}, 纬度 ${lat.toFixed(6)}
${existingName ? `现有名称（冰岛语）：${existingName}` : ''}
${type !== 'unknown' ? `类型：${type}` : ''}
${fid ? `ID：${fid}` : ''}

请以 JSON 格式返回以下信息：
{
  "nameCN": "中文名称（如果已知，否则根据坐标推断）",
  "nameEN": "英文名称（如果已知，否则根据坐标推断）",
  "nameIS": "冰岛语名称（如果已知，否则根据坐标推断）",
  "description": "地点描述（100-200字，包括地理位置、特征、历史背景等）",
  "category": "类别（volcano/lava_field/geothermal/crater/other）",
  "tags": ["标签1", "标签2"],
  "address": "详细地址（如果有）",
  "metadata": {
    "elevation": "海拔（如果有）",
    "accessibility": "可达性说明",
    "bestSeason": "最佳访问季节",
    "safetyNotes": "安全提示（如果有）"
  }
}

要求：
1. 如果现有名称不为空，优先使用现有名称
2. 描述要准确、详细，基于冰岛的地理特征
3. 类别要准确
4. 只返回 JSON，不要其他文本`;
}
async function enrichWithDeepSeek(feature, client) {
    var _a, _b, _c, _d, _e;
    const prompt = buildPrompt(feature);
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    try {
        const response = await client.post('/chat/completions', {
            model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个专业的冰岛地理和旅游信息专家。始终以有效的 JSON 格式返回结果，不要包含任何其他文本。',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.3,
            max_tokens: 1000,
            response_format: { type: 'json_object' },
        });
        const content = (_c = (_b = (_a = response.data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
        if (!content) {
            throw new Error('DeepSeek API 返回空内容');
        }
        let result;
        try {
            result = JSON.parse(content);
        }
        catch (parseError) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            }
            else {
                throw new Error(`无法解析 JSON 响应: ${content.substring(0, 100)}`);
            }
        }
        return result;
    }
    catch (error) {
        if (error.response) {
            throw new Error(`DeepSeek API 错误 (${error.response.status}): ${((_e = (_d = error.response.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || '未知错误'}`);
        }
        throw error;
    }
}
function enrichFeature(feature, enrichment) {
    const enriched = { ...feature };
    const props = { ...enriched.properties };
    if (enrichment.nameIS && !props.nafnFitju) {
        props.nafnFitju = enrichment.nameIS;
    }
    if (enrichment.nameCN) {
        props.nameCN = enrichment.nameCN;
    }
    if (enrichment.nameEN) {
        props.nameEN = enrichment.nameEN;
    }
    if (enrichment.description) {
        props.description = enrichment.description;
    }
    if (enrichment.category) {
        props.category = enrichment.category;
    }
    if (enrichment.tags && enrichment.tags.length > 0) {
        props.tags = enrichment.tags;
    }
    if (enrichment.address) {
        props.address = enrichment.address;
    }
    if (enrichment.metadata) {
        props.enrichedMetadata = {
            ...props.enrichedMetadata,
            ...enrichment.metadata,
            enrichedAt: new Date().toISOString(),
            enrichedBy: 'deepseek',
        };
    }
    enriched.properties = props;
    return enriched;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function enrichGeoJSON(geojson, options) {
    var _a, _b;
    const stats = {
        total: geojson.features.length,
        processed: 0,
        enriched: 0,
        skipped: 0,
        errors: 0,
        results: [],
    };
    const enrichedFeatures = [];
    let client = createDeepSeekClient(options.noProxy);
    let proxyFailed = false;
    let firstProxyError = true;
    const featuresToProcess = options.limit
        ? geojson.features.slice(0, options.limit)
        : geojson.features;
    console.log(`\n准备处理 ${featuresToProcess.length} 个 features...`);
    for (let i = 0; i < featuresToProcess.length; i += options.batchSize) {
        const batch = featuresToProcess.slice(i, i + options.batchSize);
        const batchNum = Math.floor(i / options.batchSize) + 1;
        const totalBatches = Math.ceil(featuresToProcess.length / options.batchSize);
        console.log(`\n处理批次 ${batchNum}/${totalBatches} (${batch.length} 条)`);
        for (const feature of batch) {
            try {
                if (options.skipExisting && hasCompleteData(feature)) {
                    enrichedFeatures.push(feature);
                    stats.skipped++;
                    stats.processed++;
                    stats.results.push({
                        fid: feature.properties.fid,
                        status: 'skipped',
                    });
                    if (stats.skipped % 10 === 0) {
                        console.log(`  ⏭️  已跳过 ${stats.skipped} 条（已有完整数据）`);
                    }
                    continue;
                }
                if (options.dryRun) {
                    console.log(`  [预览] 将处理 fid=${feature.properties.fid}`);
                    enrichedFeatures.push(feature);
                    stats.enriched++;
                    stats.processed++;
                    stats.results.push({
                        fid: feature.properties.fid,
                        status: 'enriched',
                    });
                    continue;
                }
                let enrichment;
                try {
                    enrichment = await enrichWithDeepSeek(feature, client);
                }
                catch (error) {
                    const isProxyError = error.code === 'ECONNREFUSED' ||
                        ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('ECONNREFUSED')) ||
                        ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('127.0.0.1:9090'));
                    if (isProxyError && !proxyFailed && !options.noProxy && firstProxyError) {
                        console.warn(`\n  ⚠️  检测到代理连接失败，切换到直接连接...`);
                        proxyFailed = true;
                        firstProxyError = false;
                        client = createDeepSeekClient(true);
                        try {
                            enrichment = await enrichWithDeepSeek(feature, client);
                        }
                        catch (retryError) {
                            throw retryError;
                        }
                    }
                    else {
                        throw error;
                    }
                }
                const enriched = enrichFeature(feature, enrichment);
                enrichedFeatures.push(enriched);
                stats.enriched++;
                stats.processed++;
                stats.results.push({
                    fid: feature.properties.fid,
                    status: 'enriched',
                });
                console.log(`  ✅ 已填充: ${enriched.properties.nameCN || enriched.properties.nafnFitju || 'N/A'}`);
            }
            catch (error) {
                console.error(`  ❌ 处理失败 (fid: ${feature.properties.fid}):`, error.message);
                enrichedFeatures.push(feature);
                stats.errors++;
                stats.processed++;
                stats.results.push({
                    fid: feature.properties.fid,
                    status: 'error',
                    error: error.message,
                });
            }
        }
        if (i + options.batchSize < featuresToProcess.length && !options.dryRun) {
            console.log(`  等待 ${options.delay}ms 后继续...`);
            await sleep(options.delay);
        }
    }
    const enriched = {
        ...geojson,
        features: enrichedFeatures,
    };
    return { enriched, stats };
}
async function main() {
    const options = parseArgs();
    console.log('='.repeat(60));
    console.log('冰岛 POI 数据 DeepSeek 填充脚本');
    console.log('='.repeat(60));
    console.log(`输入文件: ${options.input}`);
    console.log(`输出文件: ${options.output}`);
    console.log(`模式: ${options.dryRun ? '🔍 预览模式（不会调用 API）' : '✅ 填充模式'}`);
    console.log(`批次大小: ${options.batchSize}`);
    console.log(`批次延迟: ${options.delay}ms`);
    console.log(`跳过已有数据: ${options.skipExisting ? '是' : '否'}`);
    console.log(`禁用代理: ${options.noProxy ? '是' : '否'}`);
    if (options.limit) {
        console.log(`处理限制: ${options.limit} 条`);
    }
    console.log('');
    if (!options.dryRun && !process.env.DEEPSEEK_API_KEY) {
        console.error('❌ DEEPSEEK_API_KEY 环境变量未配置');
        process.exit(1);
    }
    try {
        const inputPath = path.resolve(process.cwd(), options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(`❌ 文件不存在: ${inputPath}`);
            process.exit(1);
        }
        console.log('📖 读取 GeoJSON 文件...');
        const fileContent = fs.readFileSync(inputPath, 'utf-8');
        const geojson = JSON.parse(fileContent);
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
            console.error('❌ 无效的 GeoJSON 格式：必须是 FeatureCollection');
            process.exit(1);
        }
        console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);
        const { enriched, stats } = await enrichGeoJSON(geojson, options);
        console.log('\n' + '='.repeat(60));
        console.log('填充结果统计');
        console.log('='.repeat(60));
        console.log(`总计: ${stats.total}`);
        console.log(`✅ 已填充: ${stats.enriched}`);
        console.log(`⏭️  跳过: ${stats.skipped}`);
        console.log(`❌ 错误: ${stats.errors}`);
        if (stats.errors > 0) {
            console.log('\n错误详情（前10条）:');
            stats.results
                .filter(r => r.status === 'error')
                .slice(0, 10)
                .forEach(r => {
                console.log(`  - fid ${r.fid}: ${r.error}`);
            });
        }
        if (!options.dryRun) {
            const outputPath = path.resolve(process.cwd(), options.output);
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            console.log(`\n💾 保存填充后的数据到: ${outputPath}`);
            fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2), 'utf-8');
            console.log('✅ 保存成功！');
        }
        else {
            console.log('\n🔍 预览模式：未保存文件');
        }
        console.log('\n✅ 处理完成！');
    }
    catch (error) {
        console.error('\n❌ 处理失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=enrich-iceland-poi-with-deepseek.js.map