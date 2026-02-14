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
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
class SimpleEmbeddingService {
    constructor() {
        this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
        this.httpClient = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            proxy: false,
            httpsAgent: new https_1.default.Agent({
                keepAlive: true,
                family: 4,
            }),
        });
    }
    async generateEmbedding(text) {
        try {
            const response = await this.httpClient.post('/api/v1/embeddings', {
                texts: [text],
                model: 'bge-m3',
                return_sparse: false,
            });
            if (response.data && response.data.embeddings && response.data.embeddings.length > 0) {
                return response.data.embeddings[0].dense || response.data.embeddings[0];
            }
            throw new Error('Python AI Service 返回格式错误');
        }
        catch (error) {
            console.error('Embedding 生成失败:', error.message);
            throw error;
        }
    }
    async generateEmbeddingsBatch(texts, batchSize = 10) {
        const results = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            try {
                const response = await this.httpClient.post('/api/v1/embeddings', {
                    texts: batch,
                    model: 'bge-m3',
                    return_sparse: false,
                });
                if (response.data && response.data.embeddings) {
                    const embeddings = response.data.embeddings.map((e) => e.dense || e);
                    results.push(...embeddings);
                    if (results.length % 10 === 0) {
                        console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
                    }
                }
                else {
                    throw new Error('批量embedding返回格式错误');
                }
            }
            catch (error) {
                console.error(`  ⚠️  批次 ${i}-${i + batch.length} 向量化失败:`, error.message);
                batch.forEach(() => {
                    const zeroVector = new Array(1024).fill(0);
                    results.push(zeroVector);
                });
            }
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        return results;
    }
}
function loadAllFiles(kbPath) {
    const files = [];
    const walkDir = (dirPath) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                walkDir(fullPath);
            }
            else if (entry.name.endsWith('.json')) {
                try {
                    const fileContent = fs.readFileSync(fullPath, 'utf-8');
                    const content = JSON.parse(fileContent);
                    files.push({
                        filename: entry.name,
                        filepath: fullPath,
                        content,
                        metadata: content.metadata || {
                            version: '1.0.0',
                            credibility_score: 0.8,
                            language: 'zh-CN',
                            data_sources: [],
                            last_updated: new Date().toISOString(),
                        },
                    });
                    console.log(`✅ 已加载: ${entry.name}`);
                }
                catch (error) {
                    console.error(`❌ 加载失败 ${entry.name}:`, error.message);
                }
            }
        }
    };
    walkDir(kbPath);
    return files;
}
function detectCategory(filename) {
    if (filename.includes('persona') || filename.includes('traveler')) {
        return 'decision_support';
    }
    if (filename.includes('equipment') || filename.includes('packing') || filename.includes('practical')) {
        return 'practical_guides';
    }
    if (filename.includes('rules') || filename.includes('laws') || filename.includes('compliance')) {
        return 'compliance_rules';
    }
    if (filename.includes('risk') || filename.includes('weather') || filename.includes('terrain') || filename.includes('accessibility') || filename.includes('safety')) {
        return 'safety';
    }
    if (filename.includes('route')) {
        return 'routes';
    }
    if (filename.includes('poi') || filename.includes('attraction') || filename.includes('service') || filename.includes('museums') || filename.includes('activities')) {
        return 'pois';
    }
    if (filename.includes('climate') || filename.includes('geography') || filename.includes('seasonal')) {
        return 'geography_seasonal';
    }
    if (filename.includes('logistics') || filename.includes('accommodation') || filename.includes('dining') || filename.includes('transportation')) {
        return 'logistics';
    }
    if (filename.includes('culture') || filename.includes('history')) {
        return 'culture';
    }
    return 'general';
}
function extractKeywords(item) {
    const keywords = [];
    if (typeof item === 'string') {
        return [item];
    }
    if (!item || typeof item !== 'object') {
        return keywords;
    }
    ['name', 'name_cn', 'name_en', 'name_es', 'title', 'route_name', 'route_name_en', 'poi_id', 'activity_id'].forEach(field => {
        if (item[field] && typeof item[field] === 'string') {
            keywords.push(item[field]);
        }
    });
    ['tags', 'categories', 'sub_categories', 'category', 'type'].forEach(field => {
        if (Array.isArray(item[field])) {
            keywords.push(...item[field].filter((t) => typeof t === 'string'));
        }
    });
    ['region', 'location', 'area', 'country'].forEach(field => {
        if (item[field] && typeof item[field] === 'string') {
            keywords.push(item[field]);
        }
    });
    keywords.push('阿根廷', 'Argentina', '乌斯怀亚', 'Ushuaia', '火地岛', 'Tierra del Fuego');
    return [...new Set(keywords)];
}
function extractNestedText(obj, depth = 0, maxDepth = 3) {
    if (depth > maxDepth || !obj)
        return '';
    const parts = [];
    if (Array.isArray(obj)) {
        obj.forEach(item => {
            if (typeof item === 'string') {
                parts.push(item);
            }
            else if (typeof item === 'object') {
                const text = extractNestedText(item, depth + 1, maxDepth);
                if (text)
                    parts.push(text);
            }
        });
    }
    else {
        const priorityFields = ['name', 'name_cn', 'name_en', 'name_es', 'title', 'description', 'overview',
            'summary', 'content', 'details', 'intro', 'long_description', 'short_description', 'zh', 'en', 'es'];
        priorityFields.forEach(field => {
            if (obj[field]) {
                const value = obj[field];
                if (typeof value === 'string') {
                    parts.push(value);
                }
                else if (Array.isArray(value)) {
                    const items = value.filter(v => typeof v === 'string').join('、');
                    if (items)
                        parts.push(items);
                }
            }
        });
        Object.entries(obj).forEach(([key, value]) => {
            if (priorityFields.includes(key) || key === 'metadata')
                return;
            if (typeof value === 'object' && value !== null) {
                const text = extractNestedText(value, depth + 1, maxDepth);
                if (text && text.length > 20) {
                    parts.push(text);
                }
            }
        });
    }
    return parts.join('\n');
}
function autoChunk(fileData) {
    var _a;
    const chunks = [];
    const credibility = ((_a = fileData.metadata) === null || _a === void 0 ? void 0 : _a.credibility_score) || 0.8;
    if (fileData.filename.includes('pois') || fileData.filename.includes('poi')) {
        const pois = fileData.content.pois || fileData.content.attractions || [];
        pois.forEach((item, index) => {
            const parts = [];
            parts.push(`POI名称: ${item.name || item.nameCN || `POI${index}`}`);
            if (item.nameEN)
                parts.push(`英文名: ${item.nameEN}`);
            if (item.description)
                parts.push(`描述: ${item.description}`);
            if (item.coordinates)
                parts.push(`坐标: ${item.coordinates[0]}, ${item.coordinates[1]}`);
            if (item.address)
                parts.push(`地址: ${item.address}`);
            if (item.category)
                parts.push(`类别: ${item.category}`);
            if (item.highlights)
                parts.push(`亮点: ${Array.isArray(item.highlights) ? item.highlights.join('、') : item.highlights}`);
            chunks.push({
                chunkId: `${fileData.filename}_${item.poi_id || item.id || index}`,
                content: parts.join('\n'),
                type: 'poi',
                credibilityScore: credibility,
                keywords: extractKeywords(item),
                section: item.location || item.region,
                metadata: { file: fileData.filename, poiId: item.poi_id || item.id },
            });
        });
        return chunks.length > 0 ? chunks : createDefaultChunks(fileData, credibility);
    }
    if (fileData.filename.includes('route')) {
        const route = fileData.content.route || fileData.content;
        const parts = [];
        if (route.route_name)
            parts.push(`路线名称: ${route.route_name}`);
        if (route.route_name_en)
            parts.push(`英文名: ${route.route_name_en}`);
        if (route.description)
            parts.push(`描述: ${route.description}`);
        if (route.overview)
            parts.push(`概述: ${route.overview}`);
        if (route.total_distance_km)
            parts.push(`总距离: ${route.total_distance_km}公里`);
        if (route.duration_days)
            parts.push(`建议天数: ${route.duration_days}天`);
        if (route.difficulty_level)
            parts.push(`难度: ${route.difficulty_level}`);
        if (route.risk_level)
            parts.push(`风险等级: ${route.risk_level}`);
        if (route.best_seasons)
            parts.push(`最佳季节: ${Array.isArray(route.best_seasons) ? route.best_seasons.join('、') : route.best_seasons}`);
        const nestedText = extractNestedText(route, 0, 2);
        if (nestedText && nestedText.length > 50) {
            parts.push(nestedText);
        }
        const keywords = extractKeywords(route);
        keywords.push('路线', '阿根廷路线', '乌斯怀亚路线');
        chunks.push({
            chunkId: `${fileData.filename}_route`,
            content: parts.length > 0 ? parts.join('\n') : extractNestedText(route),
            type: 'route',
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            metadata: { file: fileData.filename, routeId: route.route_id },
        });
        return chunks;
    }
    if (fileData.filename.includes('risk') || fileData.filename.includes('safety')) {
        const content = fileData.content;
        const topKeys = Object.keys(content).filter(k => k !== 'metadata');
        topKeys.forEach(key => {
            const sectionData = content[key];
            if (Array.isArray(sectionData)) {
                sectionData.forEach((risk, idx) => {
                    const parts = [];
                    if (risk.risk_id)
                        parts.push(`风险ID: ${risk.risk_id}`);
                    if (risk.name)
                        parts.push(`风险名称: ${risk.name}`);
                    if (risk.description)
                        parts.push(`描述: ${risk.description}`);
                    if (risk.severity)
                        parts.push(`严重程度: ${risk.severity}`);
                    const text = extractNestedText(risk);
                    if (text && text.length > 50) {
                        parts.push(text);
                    }
                    const keywords = extractKeywords(risk);
                    keywords.push('风险', '安全', '阿根廷风险');
                    chunks.push({
                        chunkId: `${fileData.filename}_${risk.risk_id || key}_${idx}`,
                        content: parts.join('\n'),
                        type: 'risk',
                        credibilityScore: credibility,
                        keywords: [...new Set(keywords)],
                        section: key,
                        metadata: { file: fileData.filename, riskId: risk.risk_id },
                    });
                });
            }
            else if (sectionData && typeof sectionData === 'object') {
                const text = extractNestedText(sectionData);
                if (text && text.length > 50) {
                    const keywords = extractKeywords(sectionData);
                    keywords.push('风险', '安全', '阿根廷风险');
                    chunks.push({
                        chunkId: `${fileData.filename}_${key}`,
                        content: `[${key}]\n${text}`,
                        type: 'risk',
                        credibilityScore: credibility,
                        keywords: [...new Set(keywords)],
                        section: key,
                        metadata: { file: fileData.filename },
                    });
                }
            }
        });
        if (chunks.length > 0)
            return chunks;
    }
    if (fileData.filename.includes('activities') || fileData.filename.includes('activity')) {
        const content = fileData.content;
        const topKeys = Object.keys(content).filter(k => k !== 'metadata');
        topKeys.forEach(key => {
            const sectionData = content[key];
            if (Array.isArray(sectionData)) {
                sectionData.forEach((activity, idx) => {
                    const parts = [];
                    if (activity.activity_id)
                        parts.push(`活动ID: ${activity.activity_id}`);
                    if (activity.name)
                        parts.push(`活动名称: ${activity.name}`);
                    if (activity.name_en)
                        parts.push(`英文名: ${activity.name_en}`);
                    if (activity.description)
                        parts.push(`描述: ${activity.description}`);
                    if (activity.difficulty)
                        parts.push(`难度: ${activity.difficulty}`);
                    const text = extractNestedText(activity);
                    if (text && text.length > 50) {
                        parts.push(text);
                    }
                    chunks.push({
                        chunkId: `${fileData.filename}_${activity.activity_id || key}_${idx}`,
                        content: parts.join('\n'),
                        type: 'activity',
                        credibilityScore: credibility,
                        keywords: extractKeywords(activity),
                        section: key,
                        metadata: { file: fileData.filename, activityId: activity.activity_id },
                    });
                });
            }
        });
        if (chunks.length > 0)
            return chunks;
    }
    if (fileData.filename.includes('logistics') || fileData.filename.includes('accommodation') ||
        fileData.filename.includes('dining') || fileData.filename.includes('transportation')) {
        const content = fileData.content;
        const topKeys = Object.keys(content).filter(k => k !== 'metadata');
        topKeys.forEach(key => {
            const sectionData = content[key];
            if (sectionData && typeof sectionData === 'object') {
                const text = extractNestedText(sectionData);
                if (text && text.length > 50) {
                    const keywords = extractKeywords(sectionData);
                    keywords.push('物流', '实用信息');
                    chunks.push({
                        chunkId: `${fileData.filename}_${key}`,
                        content: `[${key}]\n${text}`,
                        type: 'logistics',
                        credibilityScore: credibility,
                        keywords: [...new Set(keywords)],
                        section: key,
                        metadata: { file: fileData.filename },
                    });
                }
            }
        });
        if (chunks.length > 0)
            return chunks;
    }
    const content = fileData.content;
    const topKeys = Object.keys(content).filter(k => k !== 'metadata');
    if (topKeys.length > 1 && topKeys.length <= 15) {
        topKeys.forEach(key => {
            const sectionData = content[key];
            if (sectionData && typeof sectionData === 'object') {
                const text = extractNestedText(sectionData);
                if (text && text.length > 50) {
                    const keywords = extractKeywords(sectionData);
                    keywords.push(fileData.filename.replace('.json', ''), key);
                    chunks.push({
                        chunkId: `${fileData.filename}_${key}`,
                        content: `[${key}]\n${text}`,
                        type: 'section',
                        credibilityScore: credibility,
                        keywords: [...new Set(keywords)],
                        section: key,
                        metadata: { file: fileData.filename },
                    });
                }
            }
        });
        if (chunks.length > 0)
            return chunks;
    }
    return createDefaultChunks(fileData, credibility);
}
function createDefaultChunks(fileData, credibility) {
    const text = extractNestedText(fileData.content);
    const keywords = extractKeywords(fileData.content);
    keywords.push(fileData.filename.replace('.json', ''));
    return [{
            chunkId: `${fileData.filename}_full`,
            content: text || JSON.stringify(fileData.content, null, 2).substring(0, 3000),
            type: 'full',
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            metadata: { file: fileData.filename },
        }];
}
async function indexKnowledgeBase() {
    const embeddingService = new SimpleEmbeddingService();
    try {
        console.log('🚀 开始索引阿根廷知识库...\n');
        const kbPath = process.env.KB_PATH || './docs/argentina';
        console.log(`📁 知识库路径: ${kbPath}\n`);
        if (!fs.existsSync(kbPath)) {
            throw new Error(`知识库路径不存在: ${kbPath}`);
        }
        console.log('📚 加载知识库文件...\n');
        const files = loadAllFiles(kbPath);
        console.log(`\n📊 总共加载 ${files.length} 个文件\n`);
        if (files.length === 0) {
            console.log('⚠️  没有找到任何 JSON 文件');
            return;
        }
        let totalChunks = 0;
        let totalIndexed = 0;
        for (const fileData of files) {
            console.log(`\n📝 处理文件: ${fileData.filename}`);
            try {
                const category = detectCategory(fileData.filename);
                const file = await prisma.knowledgeFile.upsert({
                    where: { filename: fileData.filename },
                    update: {
                        filepath: fileData.filepath,
                        category,
                        version: fileData.metadata.version,
                        credibilityScore: fileData.metadata.credibility_score,
                        dataSources: fileData.metadata.data_sources || [],
                        lastUpdated: new Date(fileData.metadata.last_updated),
                    },
                    create: {
                        filename: fileData.filename,
                        filepath: fileData.filepath,
                        category,
                        version: fileData.metadata.version,
                        language: fileData.metadata.language || 'zh-CN',
                        credibilityScore: fileData.metadata.credibility_score,
                        dataSources: fileData.metadata.data_sources || [],
                        lastUpdated: new Date(fileData.metadata.last_updated),
                    },
                });
                const fileId = file.id;
                console.log(`  ✅ 文件记录已保存: ${fileId}`);
                const chunks = autoChunk(fileData);
                console.log(`  ✂️  生成 ${chunks.length} 个chunks`);
                totalChunks += chunks.length;
                if (chunks.length === 0) {
                    console.log(`  ⚠️  跳过：没有生成任何chunks`);
                    continue;
                }
                console.log(`  🔢 开始向量化...`);
                const texts = chunks.map((c) => c.content);
                const embeddings = await embeddingService.generateEmbeddingsBatch(texts);
                console.log(`  ✅ 向量化完成`);
                console.log(`  💾 保存到数据库...`);
                const batchSize = 50;
                for (let i = 0; i < chunks.length; i += batchSize) {
                    const batch = chunks.slice(i, i + batchSize);
                    const batchEmbeddings = embeddings.slice(i, i + batchSize);
                    await prisma.$transaction(batch.map((chunk, idx) => {
                        const embedding = batchEmbeddings[idx];
                        return prisma.$executeRaw `
                INSERT INTO chunks (
                  id, chunk_id, content, embedding, type, credibility_score, 
                  keywords, file_id, section, metadata, created_at, updated_at
                )
                VALUES (
                  gen_random_uuid(),
                  ${chunk.chunkId},
                  ${chunk.content.substring(0, 50000)},
                  ${JSON.stringify(embedding)}::vector,
                  ${chunk.type},
                  ${chunk.credibilityScore},
                  ${chunk.keywords}::text[],
                  ${fileId}::uuid,
                  ${chunk.section || null},
                  ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
                  NOW(),
                  NOW()
                )
                ON CONFLICT (chunk_id) DO UPDATE SET
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding,
                  type = EXCLUDED.type,
                  credibility_score = EXCLUDED.credibility_score,
                  keywords = EXCLUDED.keywords,
                  section = EXCLUDED.section,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW()
              `;
                    }));
                    totalIndexed += batch.length;
                    console.log(`  📊 已索引: ${totalIndexed}/${chunks.length}`);
                }
                console.log(`  ✅ 文件处理完成: ${fileData.filename}`);
            }
            catch (error) {
                console.error(`  ❌ 处理失败: ${fileData.filename}`, error.message);
                if (error.stack) {
                    console.error(error.stack);
                }
            }
        }
        console.log('\n' + '='.repeat(60));
        console.log('📊 索引统计:');
        console.log(`  处理文件数: ${files.length}`);
        console.log(`  生成chunks数: ${totalChunks}`);
        console.log(`  成功索引数: ${totalIndexed}`);
        console.log('='.repeat(60));
        console.log('\n✅ 知识库索引完成！');
    }
    catch (error) {
        console.error('\n❌ 索引失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
indexKnowledgeBase()
    .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ 索引脚本执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=index-argentina-kb-standalone.js.map