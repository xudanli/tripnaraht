#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '200', 10);
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const httpClient = axios_1.default.create({
    baseURL: PYTHON_AI_SERVICE_URL,
    timeout: 30000,
    proxy: false,
    httpsAgent: new https_1.default.Agent({
        keepAlive: true,
        family: 4,
    }),
});
function isAbnormalVector(embedding) {
    if (!embedding || embedding.length === 0)
        return true;
    const uniqueValues = new Set(embedding.map(v => v.toFixed(4)));
    if (uniqueValues.size < 10) {
        return true;
    }
    const min = Math.min(...embedding);
    const max = Math.max(...embedding);
    const range = max - min;
    if (range < 0.01) {
        return true;
    }
    return false;
}
async function generateBGE3Embedding(text) {
    const response = await httpClient.post('/api/v1/embeddings', {
        texts: [text],
        model: 'bge-m3',
        return_sparse: false,
    });
    return response.data.embeddings[0].dense || response.data.embeddings[0];
}
async function regenerateChunkEmbedding(chunkId, content) {
    try {
        if (!content || content.trim().length === 0) {
            return { success: false, error: '内容为空' };
        }
        const embedding = await generateBGE3Embedding(content);
        if (embedding.length !== 1024) {
            return { success: false, error: `向量维度错误: ${embedding.length} (期望1024)` };
        }
        const isZeroVector = embedding.every(v => v === 0);
        if (isZeroVector) {
            return { success: false, error: 'embedding 生成失败（零向量）' };
        }
        if (isAbnormalVector(embedding)) {
            return { success: false, error: 'embedding 生成失败（异常向量）' };
        }
        if (isDryRun) {
            return { success: true, embedding };
        }
        const embeddingStr = `[${embedding.join(',')}]`;
        await prisma.$executeRawUnsafe(`UPDATE chunks SET embedding = $1::vector(1024) WHERE id = $2::uuid`, embeddingStr, chunkId);
        return { success: true, embedding };
    }
    catch (error) {
        return {
            success: false,
            error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        };
    }
}
async function regenerateAllEmbeddings() {
    try {
        console.log('🚀 重新生成所有chunks的向量');
        console.log('='.repeat(80));
        console.log(`📍 Python AI Service: ${PYTHON_AI_SERVICE_URL}`);
        console.log(`📦 批次大小: ${BATCH_SIZE}`);
        console.log(`⏱️  延迟: ${DELAY_MS}ms`);
        if (isDryRun) {
            console.log('⚠️  DRY RUN 模式：只预览，不实际更新数据库\n');
        }
        if (limit) {
            console.log(`📌 限制处理数量: ${limit} 条\n`);
        }
        console.log('\n📊 查找需要重新生成向量的chunks...\n');
        const chunks = await prisma.$queryRawUnsafe(`
      SELECT 
        c.id,
        c.chunk_id,
        c.content,
        kf.filename,
        c.embedding::text as embedding_text
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
        AND c.content IS NOT NULL
        AND LENGTH(c.content) > 10
      ORDER BY c.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
      `);
        console.log(`✅ 找到 ${chunks.length} 个chunks需要处理\n`);
        if (chunks.length === 0) {
            console.log('✅ 没有需要处理的chunks');
            return;
        }
        let abnormalCount = 0;
        chunks.forEach(chunk => {
            if (chunk.embedding_text) {
                try {
                    const embedding = JSON.parse(chunk.embedding_text);
                    if (isAbnormalVector(embedding)) {
                        abnormalCount++;
                    }
                }
                catch {
                    abnormalCount++;
                }
            }
        });
        console.log(`📊 统计:`);
        console.log(`   总chunks: ${chunks.length}`);
        console.log(`   异常向量: ${abnormalCount} (${((abnormalCount / chunks.length) * 100).toFixed(1)}%)`);
        console.log(`   正常向量: ${chunks.length - abnormalCount} (${(((chunks.length - abnormalCount) / chunks.length) * 100).toFixed(1)}%)\n`);
        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;
        console.log('🔄 开始重新生成向量...\n');
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            console.log(`\n📦 处理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length})`);
            for (const chunk of batch) {
                try {
                    let needsRegeneration = true;
                    if (chunk.embedding_text) {
                        try {
                            const currentEmbedding = JSON.parse(chunk.embedding_text);
                            if (!isAbnormalVector(currentEmbedding)) {
                                needsRegeneration = false;
                                skipCount++;
                                console.log(`   ⏭️  跳过: ${chunk.filename} (${chunk.chunk_id}) - 向量正常`);
                                continue;
                            }
                        }
                        catch {
                        }
                    }
                    const result = await regenerateChunkEmbedding(chunk.id, chunk.content);
                    if (result.success) {
                        successCount++;
                        const uniqueValues = new Set(result.embedding.map(v => v.toFixed(4)));
                        console.log(`   ✅ ${chunk.filename} (${chunk.chunk_id}) - 唯一值: ${uniqueValues.size}`);
                    }
                    else {
                        failCount++;
                        console.log(`   ❌ ${chunk.filename} (${chunk.chunk_id}) - ${result.error}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
                catch (error) {
                    failCount++;
                    console.log(`   ❌ ${chunk.filename} (${chunk.chunk_id}) - ${error.message}`);
                }
            }
            if (i + BATCH_SIZE < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS * 2));
            }
        }
        console.log('\n' + '='.repeat(80));
        console.log('📊 处理完成统计');
        console.log('='.repeat(80));
        console.log(`✅ 成功: ${successCount} 个`);
        console.log(`❌ 失败: ${failCount} 个`);
        console.log(`⏭️  跳过: ${skipCount} 个 (向量已正常)`);
        console.log(`📦 总计: ${chunks.length} 个`);
        console.log('='.repeat(80));
    }
    catch (error) {
        console.error('\n❌ 处理失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
    finally {
        await prisma.$disconnect();
    }
}
regenerateAllEmbeddings().catch(console.error);
//# sourceMappingURL=regenerate-all-embeddings.js.map