"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
function getVectorDimension(embeddingStr) {
    const values = embeddingStr.replace(/[\[\]]/g, '').split(',');
    return values.length;
}
async function regenerateEmbedding(docId, title, content) {
    try {
        console.log(`🔄 重新生成文档 embedding: ${title.substring(0, 50)}...`);
        const textToEmbed = `${title}\n\n${content}`;
        const response = await axios_1.default.post(`${API_BASE_URL}/api/rag/documents/${docId}`, {
            content: content,
        }, {
            headers: { 'Content-Type': 'application/json' },
        });
        if (response.data.success) {
            console.log(`✅ 文档 embedding 已更新`);
        }
        else {
            throw new Error('更新失败');
        }
    }
    catch (error) {
        console.error(`❌ 更新失败: ${error.message}`);
        throw error;
    }
}
async function updateDocumentViaAPI(docId, title, content) {
    var _a, _b;
    try {
        const response = await axios_1.default.put(`${API_BASE_URL}/api/rag/documents/${docId}`, {
            title: title,
            content: content,
        }, {
            headers: { 'Content-Type': 'application/json' },
        });
        if (response.data.success) {
            console.log(`✅ 文档 embedding 已更新`);
        }
        else {
            throw new Error(((_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) || '更新失败');
        }
    }
    catch (error) {
        if (error.response) {
            throw new Error(`API 错误: ${((_b = error.response.data.error) === null || _b === void 0 ? void 0 : _b.message) || error.response.statusText}`);
        }
        throw error;
    }
}
async function updateEmbeddingDirectly(docId, title, content) {
    try {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            throw new Error('OPENAI_API_KEY 未设置');
        }
        const textToEmbed = `${title}\n\n${content}`;
        const https = require('https');
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
        const axiosConfig = {
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json',
            },
        };
        if (proxyUrl) {
            axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
            axiosConfig.proxy = false;
        }
        const response = await axios_1.default.post('https://api.openai.com/v1/embeddings', {
            model: 'text-embedding-3-small',
            input: textToEmbed,
        }, axiosConfig);
        const embedding = response.data.data[0].embedding;
        const embeddingStr = `[${embedding.join(',')}]`;
        await prisma.$executeRaw `
      UPDATE document_index
      SET embedding = ${embeddingStr}::vector,
          updated_at = NOW()
      WHERE id = ${docId}::uuid
    `;
        console.log(`✅ 文档 ${docId.substring(0, 8)}... embedding 已更新为 1536 维`);
    }
    catch (error) {
        console.error(`❌ 更新失败: ${error.message}`);
        throw error;
    }
}
async function migrateEmbeddings() {
    try {
        console.log('🔍 检查需要迁移的文档...\n');
        const docs1024 = await prisma.$queryRaw `
      SELECT 
        id,
        title,
        content,
        embedding::text as embedding_text
      FROM document_index
      WHERE embedding IS NOT NULL
      AND array_length(string_to_array(embedding::text, ','), 1) = 1024
      ORDER BY created_at
    `;
        console.log(`找到 ${docs1024.length} 个需要迁移的文档（1024维）\n`);
        if (docs1024.length === 0) {
            console.log('✅ 没有需要迁移的文档');
            return;
        }
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < docs1024.length; i++) {
            const doc = docs1024[i];
            console.log(`\n[${i + 1}/${docs1024.length}] 处理: ${doc.title.substring(0, 50)}...`);
            try {
                await updateEmbeddingDirectly(doc.id, doc.title, doc.content);
                successCount++;
                if (i < docs1024.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            catch (error) {
                console.error(`  失败: ${error.message}`);
                failCount++;
                try {
                    console.log(`  尝试使用 API 方式更新...`);
                    await updateDocumentViaAPI(doc.id, doc.title, doc.content);
                    successCount++;
                    failCount--;
                }
                catch (apiError) {
                    console.error(`  API 方式也失败: ${apiError.message}`);
                }
            }
        }
        console.log(`\n✅ 迁移完成:`);
        console.log(`   成功: ${successCount} 个`);
        console.log(`   失败: ${failCount} 个`);
        console.log(`\n🔍 验证迁移结果...`);
        const result = await prisma.$queryRaw `
      SELECT 
        array_length(string_to_array(embedding::text, ','), 1) as dimension,
        COUNT(*) as count
      FROM document_index
      WHERE embedding IS NOT NULL
      GROUP BY dimension
      ORDER BY dimension
    `;
        console.log('\n向量维度分布:');
        result.forEach(r => {
            console.log(`  ${r.dimension}维: ${Number(r.count)} 个文档`);
        });
    }
    catch (error) {
        console.error('❌ 迁移失败:', error.message);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
migrateEmbeddings();
//# sourceMappingURL=migrate-rag-embeddings-to-1536.js.map