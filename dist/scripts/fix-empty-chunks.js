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
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
class EmbeddingService {
    constructor() {
        this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
        this.httpClient = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            proxy: false,
            httpsAgent: new https_1.default.Agent({ keepAlive: true, family: 4 }),
        });
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
const embeddingService = new EmbeddingService();
function generateChunks(content, filename) {
    const chunks = [];
    const baseFilename = filename.replace('.json', '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const text = JSON.stringify(content, null, 2);
    if (text.length < 10000) {
        chunks.push({
            chunkId: `${baseFilename}_full`,
            content: text,
            type: 'full',
            credibilityScore: 0.9,
            keywords: ['general'],
            metadata: { source: filename },
        });
    }
    else {
        const chunkSize = 5000;
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunkText = text.substring(i, i + chunkSize);
            chunks.push({
                chunkId: `${baseFilename}_chunk_${Math.floor(i / chunkSize)}`,
                content: chunkText,
                type: 'content',
                section: `part_${Math.floor(i / chunkSize)}`,
                credibilityScore: 0.9,
                keywords: ['general'],
                metadata: { source: filename, chunkIndex: Math.floor(i / chunkSize) },
            });
        }
    }
    return chunks;
}
async function fixEmptyChunks() {
    try {
        console.log('🔧 开始修复chunks数为0的文件...\n');
        const filesWithoutChunks = await prisma.knowledgeFile.findMany({
            where: {
                chunks: {
                    none: {},
                },
                NOT: {
                    filepath: { contains: 'official-sources' },
                },
            },
        });
        console.log(`📊 找到 ${filesWithoutChunks.length} 个chunks数为0的文件\n`);
        let successCount = 0;
        let failCount = 0;
        for (const file of filesWithoutChunks) {
            try {
                console.log(`📝 处理: ${file.filepath}`);
                if (!fs.existsSync(file.filepath)) {
                    console.log(`  ⚠️  文件不存在，跳过`);
                    continue;
                }
                const content = JSON.parse(fs.readFileSync(file.filepath, 'utf-8'));
                const chunks = generateChunks(content, file.filename);
                console.log(`  ✂️  生成 ${chunks.length} 个chunks`);
                if (chunks.length === 0) {
                    console.log(`  ⚠️  未生成chunks，跳过`);
                    continue;
                }
                console.log(`  🔢 开始向量化...`);
                const texts = chunks.map(c => c.content);
                const embeddings = await embeddingService.generateEmbeddingsBatch(texts, 10);
                console.log(`  ✅ 向量化完成`);
                console.log(`  💾 保存chunks到数据库...`);
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const embedding = embeddings[i];
                    const embeddingStr = `[${embedding.join(',')}]`;
                    const keywordsArray = `{${chunk.keywords.map(k => `"${k.replace(/"/g, '\\"')}"`).join(',')}}`;
                    await prisma.$executeRawUnsafe(`
            INSERT INTO chunks (
              id, chunk_id, content, embedding, type, section, credibility_score, keywords, file_id, metadata, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3::vector(1024),
              $4,
              $5,
              $6,
              $7::text[],
              $8::uuid,
              $9::jsonb,
              NOW(),
              NOW()
            )
          `, chunk.chunkId, chunk.content, embeddingStr, chunk.type, chunk.section || null, chunk.credibilityScore, keywordsArray, file.id, chunk.metadata ? JSON.stringify(chunk.metadata) : null);
                }
                console.log(`  ✅ 完成: ${file.filename}`);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            catch (error) {
                console.error(`  ❌ 处理失败: ${error.message}`);
                failCount++;
            }
        }
        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ 修复完成！`);
        console.log(`   成功: ${successCount} 个文件`);
        console.log(`   失败: ${failCount} 个文件`);
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('❌ 修复失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
fixEmptyChunks().catch(console.error);
//# sourceMappingURL=fix-empty-chunks.js.map