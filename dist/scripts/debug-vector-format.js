"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
try {
    require('dotenv').config();
}
catch (e) { }
async function generateEmbedding(text) {
    var _a;
    const apiKey = (_a = process.env.OPENAI_API_KEY) === null || _a === void 0 ? void 0 : _a.replace(/"/g, '');
    const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:9090';
    const agent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
    const client = axios_1.default.create({
        baseURL: 'https://api.openai.com/v1',
        timeout: 60000,
        httpsAgent: agent,
        proxy: false,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });
    const response = await client.post('/embeddings', {
        model: 'text-embedding-3-small',
        input: text
    });
    return response.data.data[0].embedding;
}
async function debugVectorFormat() {
    const prisma = new client_1.PrismaClient();
    try {
        console.log('🔍 调试向量格式问题...\n');
        const query = '冰岛租车保险';
        console.log(`查询: "${query}"\n`);
        console.log('1️⃣ 生成查询 embedding...');
        const queryEmbedding = await generateEmbedding(query);
        console.log(`  ✅ 维度: ${queryEmbedding.length}`);
        console.log(`  📊 前5个值: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]\n`);
        console.log('2️⃣ 获取数据库中的样本向量...');
        const sample = await prisma.$queryRawUnsafe(`SELECT c.chunk_id, kf.filename, c.embedding::text as embedding
       FROM chunks c
       INNER JOIN knowledge_files kf ON c.file_id = kf.id
       WHERE c.embedding IS NOT NULL
       LIMIT 1`);
        if (sample.length === 0) {
            console.log('  ❌ 数据库中没有向量！');
            return;
        }
        console.log(`  ✅ 找到样本: ${sample[0].filename} / ${sample[0].chunk_id}`);
        console.log(`  📊 向量字符串格式: ${sample[0].embedding.substring(0, 100)}...\n`);
        console.log('3️⃣ 测试不同的向量序列化格式...\n');
        const formats = [
            { name: 'JSON.stringify', value: JSON.stringify(queryEmbedding) },
            { name: '[...] 数组字面量', value: `[${queryEmbedding.join(',')}]` },
            { name: '直接传递数组', value: queryEmbedding },
        ];
        for (const format of formats) {
            console.log(`📝 测试格式: ${format.name}`);
            try {
                const results = await prisma.$queryRawUnsafe(`SELECT
             c.chunk_id,
             kf.filename,
             1 - (c.embedding <=> $1::vector) as similarity
           FROM chunks c
           INNER JOIN knowledge_files kf ON c.file_id = kf.id
           WHERE c.embedding IS NOT NULL
           ORDER BY c.embedding <=> $1::vector
           LIMIT 3`, format.value);
                console.log(`  ✅ 成功！找到 ${results.length} 个结果`);
                if (results.length > 0) {
                    results.forEach((r, i) => {
                        console.log(`    ${i + 1}. ${r.filename} / ${r.chunk_id} (相似度: ${r.similarity.toFixed(4)})`);
                    });
                }
            }
            catch (error) {
                console.log(`  ❌ 失败: ${error.message}`);
            }
            console.log('');
        }
        console.log('✅ 调试完成！');
    }
    catch (error) {
        console.error('❌ 调试失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
debugVectorFormat()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=debug-vector-format.js.map