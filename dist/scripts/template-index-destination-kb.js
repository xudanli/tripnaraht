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
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DESTINATION_NAME = 'your-destination';
const KB_PATH = path.join(process.cwd(), 'docs', DESTINATION_NAME);
try {
    require('dotenv').config();
}
catch (e) {
}
function createOpenAIHttp(baseUrl) {
    const axios = require('axios');
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    return axios.create({
        baseURL: baseUrl,
        httpsAgent,
        proxy: false,
        timeout: 300000,
    });
}
class SimpleEmbeddingService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('OPENAI_API_KEY 未配置');
        }
        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        this.openaiHttp = createOpenAIHttp(baseUrl);
    }
    async generateEmbedding(text) {
        try {
            const response = await this.openaiHttp.post('/embeddings', {
                model: 'text-embedding-3-small',
                input: text,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0].embedding;
            }
            throw new Error('OpenAI API 返回格式错误');
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
            for (let j = 0; j < batch.length; j++) {
                const text = batch[j];
                const textIndex = i + j;
                try {
                    const embedding = await this.generateEmbedding(text);
                    results.push(embedding);
                    if (results.length % 5 === 0) {
                        console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
                    }
                }
                catch (error) {
                    console.error(`  ⚠️  文本 ${textIndex} 向量化失败:`, error.message);
                    const zeroVector = new Array(1536).fill(0);
                    results.push(zeroVector);
                }
                if (j < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        return results;
    }
}
function loadAllFiles(kbPath) {
    const files = [];
    const walkDir = (dirPath) => {
        if (!fs.existsSync(dirPath)) {
            console.warn(`⚠️  目录不存在: ${dirPath}`);
            return;
        }
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
                        filepath: path.relative(process.cwd(), fullPath),
                        content,
                        metadata: content.metadata || {
                            version: '1.0.0',
                            credibility_score: 0.8,
                            language: 'zh-CN',
                            data_sources: [],
                            last_updated: new Date().toISOString(),
                        },
                    });
                }
                catch (error) {
                    console.error(`❌ 解析文件失败: ${fullPath}`, error.message);
                }
            }
        }
    };
    walkDir(kbPath);
    return files;
}
function detectCategory(filename) {
    const nameLower = filename.toLowerCase();
    if (nameLower.includes('poi') || nameLower.includes('attraction') || nameLower.includes('accommodation')) {
        return 'pois';
    }
    if (nameLower.includes('route')) {
        return 'routes';
    }
    if (nameLower.includes('practical') || nameLower.includes('guide')) {
        return 'practical_guides';
    }
    if (nameLower.includes('risk') || nameLower.includes('safety')) {
        return 'safety';
    }
    return 'pois';
}
function extractKeywords(item) {
    const keywords = [];
    if (item.name)
        keywords.push(item.name);
    if (item.nameCN)
        keywords.push(item.nameCN);
    if (item.nameEN)
        keywords.push(item.nameEN);
    if (item.category)
        keywords.push(item.category);
    if (item.highlights && Array.isArray(item.highlights)) {
        keywords.push(...item.highlights);
    }
    if (item.location)
        keywords.push(item.location);
    if (item.region)
        keywords.push(item.region);
    return [...new Set(keywords)];
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
            if (item.opening_hours)
                parts.push(`开放时间: ${item.opening_hours}`);
            if (item.ticket_price)
                parts.push(`门票价格: ${item.ticket_price}`);
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
        if (chunks.length > 0)
            return chunks;
    }
    const contentStr = JSON.stringify(fileData.content, null, 2);
    chunks.push({
        chunkId: `${fileData.filename}_full`,
        content: contentStr,
        type: 'full',
        credibilityScore: credibility,
        keywords: [fileData.filename],
        metadata: { file: fileData.filename },
    });
    return chunks;
}
async function indexKnowledgeBase() {
    const prisma = new client_1.PrismaClient();
    const embeddingService = new SimpleEmbeddingService();
    try {
        console.log('='.repeat(80));
        console.log(`🚀 开始索引 ${DESTINATION_NAME} 知识库...`);
        console.log('='.repeat(80));
        console.log(`📁 知识库路径: ${KB_PATH}\n`);
        if (!fs.existsSync(KB_PATH)) {
            console.error(`❌ 知识库目录不存在: ${KB_PATH}`);
            console.log(`💡 请先创建目录并添加文档文件`);
            return;
        }
        console.log('📂 加载文件...');
        const files = loadAllFiles(KB_PATH);
        console.log(`✅ 找到 ${files.length} 个文件\n`);
        if (files.length === 0) {
            console.log('⚠️  没有找到任何文件，请检查目录路径');
            return;
        }
        let totalChunks = 0;
        let successCount = 0;
        let failCount = 0;
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
                await prisma.chunk.deleteMany({
                    where: { fileId },
                });
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
                }
                console.log(`  ✅ 保存完成`);
                successCount++;
            }
            catch (error) {
                console.error(`  ❌ 处理失败:`, error.message);
                failCount++;
            }
        }
        console.log('\n' + '='.repeat(80));
        console.log('📊 索引完成');
        console.log('='.repeat(80));
        console.log(`✅ 成功: ${successCount} 个文件`);
        console.log(`❌ 失败: ${failCount} 个文件`);
        console.log(`📦 总chunks: ${totalChunks}`);
        console.log('');
        if (successCount > 0) {
            console.log('💡 下一步：');
            console.log('   1. 运行质量检查: npx tsx scripts/check-poi-documents.ts');
            console.log('   2. 运行质量修复: npx tsx scripts/fix-poi-documents-quality.ts --execute');
        }
    }
    catch (error) {
        console.error('❌ 索引失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
indexKnowledgeBase()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error('执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=template-index-destination-kb.js.map