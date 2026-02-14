"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
try {
    require('dotenv').config();
}
catch (e) { }
const prisma = new client_1.PrismaClient();
function createOpenAIClient(useProxy = true) {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
    const config = {
        baseURL: baseUrl,
        timeout: 600000,
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
    };
    if (useProxy) {
        const proxyMatch = proxyUrl.match(/^https?:\/\/([^:]+):(\d+)/);
        if (proxyMatch) {
            config.proxy = {
                host: proxyMatch[1],
                port: parseInt(proxyMatch[2]),
                protocol: proxyUrl.startsWith('https') ? 'https' : 'http',
            };
        }
        else {
            config.proxy = {
                host: '127.0.0.1',
                port: 9090,
                protocol: 'http',
            };
        }
    }
    else {
        config.proxy = false;
    }
    return axios_1.default.create(config);
}
async function generateEmbedding(client, text, retries = 3, useProxy = true) {
    var _a, _b, _c, _d;
    const truncatedText = text.substring(0, 8000);
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const startTime = Date.now();
            const response = await client.post('/embeddings', {
                model: 'text-embedding-3-small',
                input: truncatedText,
            });
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            if (!response.data) {
                console.log(`    ⚠️  响应无数据:`, JSON.stringify(response).substring(0, 200));
                throw new Error('Response has no data');
            }
            if (!response.data.data || !Array.isArray(response.data.data)) {
                console.log(`    ⚠️  响应格式错误:`, JSON.stringify(response.data).substring(0, 300));
                throw new Error('Invalid response structure');
            }
            if (response.data.data.length === 0) {
                console.log(`    ⚠️  响应数组为空`);
                throw new Error('Empty embedding array');
            }
            const embedding = (_a = response.data.data[0]) === null || _a === void 0 ? void 0 : _a.embedding;
            if (!embedding || !Array.isArray(embedding)) {
                console.log(`    ⚠️  embedding 格式错误:`, typeof embedding);
                throw new Error('Invalid embedding format');
            }
            console.log(`    ⏱️  耗时: ${duration}秒，向量维度: ${embedding.length}`);
            return embedding;
        }
        catch (error) {
            const errorCode = error.code || '';
            const errorMsg = error.message || String(error);
            const isTimeout = errorCode === 'ECONNABORTED' ||
                errorMsg.includes('timeout') ||
                errorMsg.includes('exceeded');
            if (isTimeout && attempt < retries) {
                const waitTime = attempt * 30;
                console.log(`    ⚠️  超时 (尝试 ${attempt}/${retries})，等待 ${waitTime} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                continue;
            }
            const isNetworkError = errorCode === 'ECONNRESET' ||
                errorCode === 'ECONNREFUSED' ||
                errorCode === 'ETIMEDOUT' ||
                errorMsg.includes('socket');
            if (isNetworkError && useProxy && attempt >= 2) {
                console.log(`    🔄 代理连接失败，尝试直接连接...`);
                const directClient = createOpenAIClient(false);
                try {
                    const response = await directClient.post('/embeddings', {
                        model: 'text-embedding-3-small',
                        input: truncatedText,
                    });
                    if ((_d = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.embedding) {
                        console.log(`    ✅ 直接连接成功`);
                        return response.data.data[0].embedding;
                    }
                }
                catch (directError) {
                    if (attempt < retries) {
                        console.log(`    ⚠️  直接连接也失败，继续重试...`);
                        continue;
                    }
                }
            }
            throw error;
        }
    }
    throw new Error('All retry attempts failed');
}
async function updateEmbeddings() {
    console.log('🔢 开始更新 chunks embedding...\n');
    const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
    console.log('📡 使用代理:', proxyUrl);
    console.log('⏱️  超时设置: 10 分钟\n');
    const client = createOpenAIClient();
    const chunks = await prisma.$queryRaw `
    SELECT id, chunk_id, content 
    FROM chunks 
    WHERE embedding IS NULL 
       OR embedding = (SELECT array_fill(0::real, ARRAY[1536]))::vector
    ORDER BY created_at ASC
  `;
    console.log(`📊 找到 ${chunks.length} 个 chunks 需要处理\n`);
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[${i + 1}/${chunks.length}] 处理: ${chunk.chunk_id.substring(0, 50)}...`);
        try {
            const useProxy = !!process.env.HTTP_PROXY;
            const embedding = await generateEmbedding(client, chunk.content, 3, useProxy);
            await prisma.$executeRaw `
        UPDATE chunks 
        SET embedding = ${JSON.stringify(embedding)}::vector,
            updated_at = NOW()
        WHERE id = ${chunk.id}::uuid
      `;
            console.log(`  ✅ 成功 (${successCount + 1}/${chunks.length})`);
            successCount++;
            if ((i + 1) % 3 === 0 && i + 1 < chunks.length) {
                console.log(`  ⏸️  休息 3 秒...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        catch (error) {
            const errorMsg = error.message || String(error);
            const errorCode = error.code || '';
            console.log(`  ❌ 失败: ${errorMsg.substring(0, 100)}${errorCode ? ` (${errorCode})` : ''}`);
            failCount++;
            if (errorMsg.includes('rate') || errorMsg.includes('429') || errorMsg.includes('quota')) {
                console.log(`  ⏸️  遇到限流，休息 60 秒...`);
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
            else if (errorMsg.includes('timeout') || errorCode === 'ECONNABORTED') {
                console.log(`  ⏸️  超时，休息 30 秒...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
            else if (errorCode === 'ECONNRESET' || errorCode === 'ECONNREFUSED') {
                console.log(`  ⏸️  连接问题，休息 10 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
            else {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    console.log('\n📊 更新统计:');
    console.log(`  - 成功: ${successCount}`);
    console.log(`  - 失败: ${failCount}`);
    console.log(`  - 总计: ${chunks.length}`);
}
updateEmbeddings()
    .then(() => {
    console.log('\n✅ 向量更新完成');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n💥 向量更新失败:', error);
    process.exit(1);
})
    .finally(() => {
    prisma.$disconnect();
});
//# sourceMappingURL=update-embeddings.js.map