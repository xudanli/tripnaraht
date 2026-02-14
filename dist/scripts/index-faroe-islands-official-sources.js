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
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const dotenv = __importStar(require("dotenv"));
const jsdom_1 = require("jsdom");
dotenv.config();
const prisma = new client_1.PrismaClient();
const OFFICIAL_SOURCES = [
    {
        name: 'Visit Faroe Islands Home',
        url: 'https://visitfaroeislands.com/en',
        category: 'official_tourism',
        description: '法罗群岛官方旅游网站主页',
        priority: 1,
    },
    {
        name: 'Visit Faroe Islands Plan Your Stay',
        url: 'https://visitfaroeislands.com/en/plan-your-stay',
        category: 'official_tourism',
        description: '法罗群岛官方行前准备指南',
        priority: 1,
    },
    {
        name: 'Visit Faroe Islands Brochures',
        url: 'https://visitfaroeislands.com/en/brochures',
        category: 'official_resources',
        description: '法罗群岛官方旅游手册与宣传资料',
        priority: 1,
    },
    {
        name: 'Faroe Islands Government',
        url: 'https://www.government.fo/en/',
        category: 'official_government',
        description: '法罗群岛政府官方网站',
        priority: 1,
    },
];
class EmbeddingService {
    constructor() {
        this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
        this.httpClient = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            proxy: false,
            httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
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
                    console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
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
async function fetchWebContent(url) {
    var _a, _b, _c, _d;
    try {
        console.log(`  🌐 抓取网页: ${url}`);
        const axiosInstance = axios_1.default.create({
            timeout: 30000,
            maxRedirects: 0,
            validateStatus: (status) => status < 500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        let response;
        let finalUrl = url;
        let redirectCount = 0;
        const maxRedirects = 5;
        while (redirectCount < maxRedirects) {
            try {
                response = await axiosInstance.get(finalUrl);
                if (response.status >= 200 && response.status < 300) {
                    break;
                }
                if (response.status >= 300 && response.status < 400) {
                    const location = response.headers.location;
                    if (location) {
                        finalUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
                        redirectCount++;
                        continue;
                    }
                }
                throw new Error(`HTTP ${response.status}`);
            }
            catch (error) {
                if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) >= 300 && ((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) < 400) {
                    const location = error.response.headers.location;
                    if (location) {
                        finalUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
                        redirectCount++;
                        continue;
                    }
                }
                if (redirectCount === 0) {
                    response = await axios_1.default.get(finalUrl, {
                        timeout: 30000,
                        maxRedirects: 5,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                    });
                    break;
                }
                throw error;
            }
        }
        if (!response) {
            throw new Error('Failed to fetch after redirects');
        }
        const dom = new jsdom_1.JSDOM(response.data);
        const document = dom.window.document;
        const title = ((_c = document.querySelector('title')) === null || _c === void 0 ? void 0 : _c.textContent) ||
            ((_d = document.querySelector('h1')) === null || _d === void 0 ? void 0 : _d.textContent) ||
            url;
        const scripts = document.querySelectorAll('script, style, nav, footer, header');
        scripts.forEach(el => el.remove());
        const mainContent = document.querySelector('main') ||
            document.querySelector('article') ||
            document.querySelector('.content') ||
            document.querySelector('.main-content') ||
            document.querySelector('.page-content') ||
            document.body;
        const text = (mainContent === null || mainContent === void 0 ? void 0 : mainContent.textContent) || '';
        const cleanedText = text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();
        const paragraphs = [];
        const headings = [];
        mainContent === null || mainContent === void 0 ? void 0 : mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
            var _a;
            const headingText = (_a = h.textContent) === null || _a === void 0 ? void 0 : _a.trim();
            if (headingText) {
                headings.push(headingText);
            }
        });
        mainContent === null || mainContent === void 0 ? void 0 : mainContent.querySelectorAll('p, li').forEach(el => {
            var _a;
            const text = (_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim();
            if (text && text.length > 20) {
                paragraphs.push(text);
            }
        });
        const structuredContent = {
            title,
            headings,
            paragraphs,
            url,
            fetchedAt: new Date().toISOString(),
        };
        return {
            title,
            content: JSON.stringify(structuredContent, null, 2),
            text: cleanedText.substring(0, 50000),
        };
    }
    catch (error) {
        console.error(`  ❌ 抓取失败: ${error.message}`);
        throw error;
    }
}
function chunkWebContent(source, title, content, text) {
    const chunks = [];
    const baseFilename = source.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const credibilityScore = 0.95;
    try {
        const structured = JSON.parse(content);
        if (structured.title) {
            chunks.push({
                chunkId: `${baseFilename}_overview`,
                type: 'overview',
                content: `标题: ${structured.title}\n来源: ${source.name}\nURL: ${source.url}\n描述: ${source.description}`,
                section: 'overview',
                credibilityScore,
                keywords: [source.name, 'official', 'faroe islands', 'tourism', 'visit faroe islands'],
                metadata: {
                    source: source.name,
                    url: source.url,
                    category: source.category,
                    type: 'official_source',
                },
            });
        }
        if (structured.paragraphs && structured.paragraphs.length > 0) {
            structured.paragraphs.forEach((para, idx) => {
                if (para.trim().length > 50) {
                    chunks.push({
                        chunkId: `${baseFilename}_para_${idx}`,
                        type: 'content',
                        content: para,
                        section: 'content',
                        credibilityScore,
                        keywords: extractKeywords(para),
                        metadata: {
                            source: source.name,
                            url: source.url,
                            category: source.category,
                            paragraphIndex: idx,
                            type: 'official_source',
                        },
                    });
                }
            });
        }
        if (chunks.length === 0 && text) {
            const chunkSize = 5000;
            for (let i = 0; i < text.length; i += chunkSize) {
                const chunkText = text.substring(i, i + chunkSize);
                chunks.push({
                    chunkId: `${baseFilename}_chunk_${Math.floor(i / chunkSize)}`,
                    type: 'content',
                    content: chunkText,
                    section: 'content',
                    credibilityScore,
                    keywords: extractKeywords(chunkText),
                    metadata: {
                        source: source.name,
                        url: source.url,
                        category: source.category,
                        chunkIndex: Math.floor(i / chunkSize),
                        type: 'official_source',
                    },
                });
            }
        }
    }
    catch (error) {
        const chunkSize = 5000;
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunkText = text.substring(i, i + chunkSize);
            chunks.push({
                chunkId: `${baseFilename}_chunk_${Math.floor(i / chunkSize)}`,
                type: 'content',
                content: chunkText,
                section: 'content',
                credibilityScore,
                keywords: extractKeywords(chunkText),
                metadata: {
                    source: source.name,
                    url: source.url,
                    category: source.category,
                    chunkIndex: Math.floor(i / chunkSize),
                    type: 'official_source',
                },
            });
        }
    }
    return chunks;
}
function extractKeywords(text) {
    const keywords = new Set();
    const lowerText = text.toLowerCase();
    const faroeKeywords = [
        'faroe islands', 'faroe', 'torshavn', 'visit faroe islands',
        'visa', 'entry', 'requirements', 'tourism', 'travel', 'visitor', 'tourist',
        'official', 'government', 'denmark', 'autonomous', 'schengen',
        'hiking', 'nature', 'sheep', 'fjord', 'village',
        'passport', 'permit', 'brochure', 'guide',
    ];
    faroeKeywords.forEach(kw => {
        if (lowerText.includes(kw)) {
            keywords.add(kw);
        }
    });
    const words = lowerText.match(/\b[a-z]{3,20}\b/g) || [];
    words.slice(0, 10).forEach(w => keywords.add(w));
    return Array.from(keywords).slice(0, 20);
}
async function indexOfficialSources() {
    try {
        console.log('🚀 开始索引法罗群岛官方旅游信息源...\n');
        let successCount = 0;
        let failCount = 0;
        for (const source of OFFICIAL_SOURCES) {
            try {
                console.log(`\n📝 处理来源: ${source.name}`);
                console.log(`   URL: ${source.url}`);
                console.log(`   类别: ${source.category}`);
                const { title, content, text } = await fetchWebContent(source.url);
                console.log(`  ✅ 抓取成功: ${title.substring(0, 50)}...`);
                const chunks = chunkWebContent(source, title, content, text);
                console.log(`  ✂️  生成 ${chunks.length} 个chunks`);
                if (chunks.length === 0) {
                    console.log(`  ⚠️  未生成chunks，跳过`);
                    continue;
                }
                const filename = `${source.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.json`;
                const filepath = `docs/faroe-islands/official-sources/${filename}`;
                const fileRecord = await prisma.knowledgeFile.upsert({
                    where: {
                        filename,
                    },
                    update: {
                        filepath,
                        category: source.category,
                        updatedAt: new Date(),
                    },
                    create: {
                        filename,
                        filepath,
                        category: source.category,
                        version: '1.0.0',
                        language: 'en',
                        credibilityScore: 0.95,
                        dataSources: ['official_website'],
                        lastUpdated: new Date(),
                    },
                });
                const fileId = fileRecord.id;
                console.log(`  💾 文件记录已保存: ${fileId}`);
                await prisma.chunk.deleteMany({
                    where: { fileId },
                });
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
            ON CONFLICT (chunk_id) DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              type = EXCLUDED.type,
              section = EXCLUDED.section,
              credibility_score = EXCLUDED.credibility_score,
              keywords = EXCLUDED.keywords,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          `, chunk.chunkId, chunk.content, embeddingStr, chunk.type, chunk.section || null, chunk.credibilityScore, keywordsArray, fileId, chunk.metadata ? JSON.stringify(chunk.metadata) : null);
                    if ((i + 1) % 5 === 0) {
                        console.log(`    📊 插入进度: ${i + 1}/${chunks.length}`);
                    }
                }
                console.log(`  ✅ 完成: ${source.name}`);
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                console.error(`  ❌ 处理失败: ${error.message}`);
                failCount++;
            }
        }
        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ 索引完成！`);
        console.log(`   成功: ${successCount} 个来源`);
        console.log(`   失败: ${failCount} 个来源`);
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('❌ 索引失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
indexOfficialSources().catch(console.error);
//# sourceMappingURL=index-faroe-islands-official-sources.js.map