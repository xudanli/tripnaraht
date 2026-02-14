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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
try {
    require('dotenv').config();
}
catch (e) { }
const prisma = new client_1.PrismaClient();
async function generateEmbedding(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const proxyUrl = process.env.HTTPS_PROXY;
    let client;
    if (proxyUrl) {
        const agent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        client = axios_1.default.create({
            baseURL: baseUrl,
            timeout: 60000,
            httpsAgent: agent,
            httpAgent: agent,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
    }
    else {
        client = axios_1.default.create({
            baseURL: baseUrl,
            timeout: 60000,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
    }
    const response = await client.post('/embeddings', {
        model: 'text-embedding-3-small',
        input: text,
    });
    return response.data.data[0].embedding;
}
function extractKeywords(query) {
    const cleaned = query
        .toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
        .trim();
    const words = cleaned
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .filter((w) => !isStopWord(w));
    return words;
}
function isStopWord(word) {
    const stopWords = new Set([
        '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
        '怎么', '哪些', '什么', '时候', '需要',
    ]);
    return stopWords.has(word.toLowerCase());
}
async function findGroundTruthChunks() {
    var _a;
    try {
        console.log('🔍 查找 Ground Truth Chunk UUIDs...\n');
        const testsetPath = path.resolve(process.cwd(), 'e2e-cases', 'rag-eval-testset.json');
        console.log(`📖 读取测试集: ${testsetPath}\n`);
        let testset;
        try {
            const testsetContent = await fs.readFile(testsetPath, 'utf-8');
            testset = JSON.parse(testsetContent);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                console.log('⚠️  测试集文件不存在，创建默认文件...\n');
                testset = {
                    version: 1,
                    name: 'iceland-kb-smoke',
                    description: 'Seed testset for Chunk retrieval evaluation',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    testCases: [
                        {
                            id: 'is-car-insurance-001',
                            query: '冰岛租车保险怎么选？有哪些必买的险种？',
                            groundTruthChunkIds: [],
                            tags: ['iceland', 'car-rental', 'insurance'],
                        },
                        {
                            id: 'is-f-road-001',
                            query: '冰岛F路什么时候开放？需要什么车型？',
                            groundTruthChunkIds: [],
                            tags: ['iceland', 'f-road'],
                        },
                    ],
                };
            }
            else {
                throw error;
            }
        }
        console.log(`找到 ${testset.testCases.length} 个测试用例\n`);
        const totalChunks = await prisma.chunk.count();
        const chunksWithEmbedding = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`);
        console.log(`📊 数据库状态:`);
        console.log(`  - 总分块数: ${totalChunks}`);
        console.log(`  - 有向量的分块: ${Number(((_a = chunksWithEmbedding[0]) === null || _a === void 0 ? void 0 : _a.count) || 0)}\n`);
        if (totalChunks === 0) {
            console.log('⚠️  数据库中没有 chunks，请先索引知识库文件\n');
            return;
        }
        const allChunks = await prisma.chunk.findMany({
            select: {
                id: true,
                chunkId: true,
                content: true,
                type: true,
                keywords: true,
                file: {
                    select: {
                        filename: true,
                        category: true,
                    },
                },
            },
        });
        console.log(`📚 加载了 ${allChunks.length} 个 chunks 用于匹配\n`);
        const updatedTestCases = [];
        for (const testCase of testset.testCases) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📝 测试用例: ${testCase.id}`);
            console.log(`查询: "${testCase.query}"`);
            console.log(`${'='.repeat(80)}\n`);
            const queryKeywords = extractKeywords(testCase.query);
            console.log(`提取的关键词: ${queryKeywords.join(', ')}\n`);
            const relevantChunks = allChunks.filter((chunk) => {
                const contentLower = chunk.content.toLowerCase();
                const keywordsLower = chunk.keywords.map((k) => k.toLowerCase());
                const queryLower = testCase.query.toLowerCase();
                const hasKeywords = queryKeywords.some((kw) => contentLower.includes(kw.toLowerCase()) ||
                    keywordsLower.some((k) => k.includes(kw.toLowerCase())));
                const hasQueryPhrase = queryLower.split(/\s+/).some((word) => {
                    if (word.length < 2)
                        return false;
                    return contentLower.includes(word);
                });
                return hasKeywords || hasQueryPhrase;
            });
            const scoredChunks = relevantChunks.map((chunk) => {
                const contentLower = chunk.content.toLowerCase();
                const keywordsLower = chunk.keywords.map((k) => k.toLowerCase());
                let score = 0;
                queryKeywords.forEach((kw) => {
                    if (contentLower.includes(kw.toLowerCase()))
                        score += 2;
                    if (keywordsLower.some((k) => k.includes(kw.toLowerCase())))
                        score += 3;
                });
                if (testCase.query.includes('保险') && contentLower.includes('保险'))
                    score += 5;
                if (testCase.query.includes('F路') && (contentLower.includes('f路') || contentLower.includes('f-road')))
                    score += 5;
                if (testCase.query.includes('租车') && contentLower.includes('租车'))
                    score += 5;
                if (testCase.query.includes('车型') && contentLower.includes('车型'))
                    score += 3;
                if (testCase.query.includes('开放') && contentLower.includes('开放'))
                    score += 3;
                return { chunk, score };
            });
            scoredChunks.sort((a, b) => b.score - a.score);
            console.log(`找到 ${scoredChunks.length} 个可能相关的 chunks（显示 Top-5）:\n`);
            const topCandidates = scoredChunks.slice(0, 5);
            topCandidates.forEach(({ chunk, score }, index) => {
                console.log(`${index + 1}. [分数: ${score}] ${chunk.chunkId}`);
                console.log(`   ID: ${chunk.id}`);
                console.log(`   文件: ${chunk.file.filename} (${chunk.file.category})`);
                console.log(`   类型: ${chunk.type}`);
                console.log(`   关键词: ${chunk.keywords.slice(0, 5).join(', ')}`);
                console.log(`   内容预览: ${chunk.content.substring(0, 150)}...`);
                console.log('');
            });
            const selectedChunkIds = topCandidates
                .filter(({ score }) => score >= 5)
                .map(({ chunk }) => chunk.id);
            if (selectedChunkIds.length > 0) {
                console.log(`✅ 自动选择 ${selectedChunkIds.length} 个 chunks 作为 Ground Truth:`);
                selectedChunkIds.forEach((id) => console.log(`   - ${id}`));
                console.log('');
            }
            else if (topCandidates.length > 0) {
                const topId = topCandidates[0].chunk.id;
                selectedChunkIds.push(topId);
                console.log(`⚠️  未找到高分chunks，选择Top-1作为候选: ${topId}`);
                console.log(`   请手动检查并更新测试集文件\n`);
            }
            else {
                console.log(`⚠️  未找到相关 chunks，请手动检查\n`);
            }
            updatedTestCases.push({
                ...testCase,
                groundTruthChunkIds: selectedChunkIds.length > 0 ? selectedChunkIds : testCase.groundTruthChunkIds,
            });
        }
        const updatedTestset = {
            ...testset,
            updatedAt: new Date().toISOString(),
            testCases: updatedTestCases,
        };
        try {
            const backupPath = testsetPath + '.backup';
            await fs.copyFile(testsetPath, backupPath);
            console.log(`\n💾 已备份原文件到: ${backupPath}`);
        }
        catch (error) {
        }
        const dir = path.dirname(testsetPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(testsetPath, JSON.stringify(updatedTestset, null, 2), 'utf-8');
        console.log(`✅ 已更新测试集文件: ${testsetPath}`);
        console.log(`\n📊 更新摘要:`);
        updatedTestCases.forEach((tc) => {
            console.log(`   ${tc.id}: ${tc.groundTruthChunkIds.length} 个 Ground Truth chunks`);
            if (tc.groundTruthChunkIds.length > 0) {
                tc.groundTruthChunkIds.forEach((id) => console.log(`      - ${id}`));
            }
        });
    }
    catch (error) {
        console.error(`❌ 错误: ${error.message}`, error.stack);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
findGroundTruthChunks();
//# sourceMappingURL=find-ground-truth-chunks.js.map