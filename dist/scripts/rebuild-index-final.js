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
const https_proxy_agent_1 = require("https-proxy-agent");
require('dotenv').config();
const prisma = new client_1.PrismaClient();
const KB_PATH = './docs/iceland';
function createOpenAIClient() {
    const proxyUrl = process.env.HTTPS_PROXY || '';
    const agent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
    return axios_1.default.create({
        baseURL: 'https://api.openai.com/v1',
        timeout: 60000,
        httpsAgent: agent,
        proxy: false,
    });
}
async function generateEmbedding(text) {
    var _a;
    const client = createOpenAIClient();
    const apiKey = (_a = process.env.OPENAI_API_KEY) === null || _a === void 0 ? void 0 : _a.replace(/"/g, '');
    const response = await client.post('/embeddings', {
        model: 'text-embedding-3-small',
        input: text,
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
    });
    return response.data.data[0].embedding;
}
async function rebuildIndex() {
    console.log('🚀 开始重建索引\n');
    console.log('🧹 清空现有索引...');
    await prisma.$executeRaw `DELETE FROM chunks`;
    await prisma.$executeRaw `DELETE FROM knowledge_files`;
    console.log('  ✅ 已清空\n');
    console.log('📂 扫描知识库文件...');
    const files = [];
    function walkDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walkDir(fullPath);
            }
            else if (entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }
    walkDir(KB_PATH);
    console.log(`  ✅ 找到 ${files.length} 个JSON文件\n`);
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < files.length; i++) {
        const filepath = files[i];
        const filename = path.basename(filepath);
        const category = path.basename(path.dirname(filepath));
        console.log(`\n[${i + 1}/${files.length}] 📝 ${filename}`);
        try {
            const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            const textContent = JSON.stringify(content, null, 2);
            const truncatedText = textContent.substring(0, 8000);
            const fileId = await prisma.$queryRaw `
        INSERT INTO knowledge_files (
          id, filename, filepath, category, version, language,
          credibility_score, data_sources, last_updated, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${filename},
          ${filepath},
          ${category},
          '1.0.0',
          'zh-CN',
          0.9,
          ARRAY['manual'],
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING id
      `.then(rows => rows[0].id);
            console.log(`  💾 文件记录已保存: ${fileId}`);
            console.log(`  🔢 生成向量 (${truncatedText.length} 字符)...`);
            const startTime = Date.now();
            const embedding = await generateEmbedding(truncatedText);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`  ✅ 向量生成成功 (${duration}秒, ${embedding.length}维)`);
            const chunkId = `${filename}_full`;
            const contentTruncated = textContent.substring(0, 10000);
            await prisma.$executeRaw `
        INSERT INTO chunks (
          id, chunk_id, content, embedding, type, credibility_score,
          keywords, file_id, metadata, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${chunkId},
          ${contentTruncated},
          ${JSON.stringify(embedding)}::vector(1536),
          'full',
          0.9,
          ARRAY[]::text[],
          ${fileId}::uuid,
          '{}'::jsonb,
          NOW(),
          NOW()
        )
      `;
            console.log(`  💾 分块已保存`);
            successCount++;
            await new Promise(r => setTimeout(r, 500));
        }
        catch (error) {
            console.error(`  ❌ 失败: ${error.message}`);
            failCount++;
        }
    }
    console.log('\n\n✅ 索引完成！');
    console.log(`  - 成功: ${successCount}/${files.length}`);
    console.log(`  - 失败: ${failCount}/${files.length}`);
}
rebuildIndex()
    .then(() => {
    console.log('\n🎉 重建成功！');
    process.exit(0);
})
    .catch((e) => {
    console.error('\n❌ 重建失败:', e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=rebuild-index-final.js.map