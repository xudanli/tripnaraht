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
const embeddingService = new SimpleEmbeddingService();
function loadAllMarkdownFiles(dirPath, fileList = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (!['node_modules', '.git', '.claude', '.cursor'].includes(file)) {
                loadAllMarkdownFiles(filePath, fileList);
            }
        }
        else if (file.endsWith('.md')) {
            fileList.push({
                path: filePath,
                filename: file,
            });
        }
    });
    return fileList;
}
function detectCategory(filepath, filename) {
    const lowerPath = filepath.toLowerCase();
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('readme') || lowerName.includes('report') || lowerName.includes('index')) {
        return 'general';
    }
    if (lowerPath.includes('decision') || lowerPath.includes('personas')) {
        return 'decision_support';
    }
    if (lowerPath.includes('risk') || lowerPath.includes('safety') || lowerPath.includes('hazard')) {
        return 'safety';
    }
    if (lowerPath.includes('route') || lowerPath.includes('trail') || lowerPath.includes('trek')) {
        return 'routes';
    }
    if (lowerPath.includes('poi') || lowerPath.includes('attraction') || lowerPath.includes('viewpoint')) {
        return 'pois';
    }
    if (lowerPath.includes('practical') || lowerPath.includes('equipment') || lowerPath.includes('packing') || lowerPath.includes('guide')) {
        return 'practical_guides';
    }
    if (lowerPath.includes('logistics') || lowerPath.includes('transportation') || lowerPath.includes('accommodation')) {
        return 'logistics';
    }
    if (lowerPath.includes('culture') || lowerPath.includes('heritage') || lowerPath.includes('history') || lowerPath.includes('pilgrimage')) {
        return 'culture';
    }
    if (lowerPath.includes('diving') || lowerPath.includes('snorkel')) {
        return 'practical_guides';
    }
    if (lowerPath.includes('mountaineering') || lowerPath.includes('peak') || lowerPath.includes('mountain')) {
        return 'routes';
    }
    if (lowerPath.includes('natural-phenomena') || lowerPath.includes('phenomena') || lowerPath.includes('aurora') || lowerPath.includes('volcano')) {
        return 'general';
    }
    if (lowerPath.includes('polar-expedition') || lowerPath.includes('expedition')) {
        return 'routes';
    }
    return 'general';
}
function extractKeywords(content, filepath) {
    const keywords = new Set();
    const pathParts = filepath.split('/');
    const regionMatch = pathParts.find(p => ['iceland', 'svalbard', 'greenland', 'faroe', 'alps', 'argentina', 'mountaineering'].includes(p.toLowerCase()));
    if (regionMatch) {
        keywords.add(regionMatch.toLowerCase());
    }
    const lines = content.split('\n');
    const titlePattern = /^#+\s+(.+)$/;
    const boldPattern = /\*\*(.+?)\*\*/g;
    const codePattern = /`([^`]+)`/g;
    lines.forEach(line => {
        const titleMatch = line.match(titlePattern);
        if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            title.split(/\s+/).forEach(word => {
                if (word.length > 2)
                    keywords.add(word);
            });
        }
        let boldMatch;
        while ((boldMatch = boldPattern.exec(line)) !== null) {
            const boldText = boldMatch[1].toLowerCase();
            boldText.split(/\s+/).forEach(word => {
                if (word.length > 2)
                    keywords.add(word);
            });
        }
    });
    const commonPatterns = [
        /\b(attraction|景点|viewpoint|view|peak|mountain|glacier|fjord|beach|coast)\b/gi,
        /\b(route|trail|hike|trek|path|way|expedition)\b/gi,
        /\b(risk|danger|hazard|safety|warning|precaution)\b/gi,
        /\b(accommodation|hotel|lodge|camp|住宿)\b/gi,
        /\b(transportation|transport|car|bus|ferry|交通)\b/gi,
        /\b(equipment|gear|packing|装备)\b/gi,
        /\b(diving|snorkel|underwater|marine)\b/gi,
        /\b(pilgrimage|heritage|culture|history)\b/gi,
        /\b(volcano|aurora|phenomena|natural)\b/gi,
    ];
    commonPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
            matches.forEach(m => keywords.add(m.toLowerCase()));
        }
    });
    return Array.from(keywords).slice(0, 20);
}
function chunkMarkdown(content, filename, filepath) {
    const chunks = [];
    const baseFilename = path.basename(filename, '.md');
    const credibilityScore = 0.9;
    const allKeywords = extractKeywords(content, filepath);
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent = [];
    let chunkIndex = 0;
    const maxChunkLength = 2000;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            if (currentContent.length > 0) {
                const sectionContent = currentContent.join('\n').trim();
                if (sectionContent.length > 50) {
                    if (sectionContent.length > maxChunkLength) {
                        const subChunks = splitLongContent(sectionContent, maxChunkLength);
                        subChunks.forEach((subContent, subIndex) => {
                            chunks.push({
                                chunkId: `${baseFilename}_${sanitizeSectionName(currentSection)}_${chunkIndex}_${subIndex}`,
                                content: subContent,
                                type: detectChunkType(currentSection, content),
                                section: currentSection || undefined,
                                credibilityScore,
                                keywords: [...allKeywords, ...extractKeywords(subContent, filepath)],
                                metadata: {
                                    file: filename,
                                    filepath,
                                    section: currentSection,
                                    chunkIndex: chunkIndex * 100 + subIndex,
                                },
                            });
                        });
                        chunkIndex++;
                    }
                    else {
                        chunks.push({
                            chunkId: `${baseFilename}_${sanitizeSectionName(currentSection)}_${chunkIndex}`,
                            content: sectionContent,
                            type: detectChunkType(currentSection, content),
                            section: currentSection || undefined,
                            credibilityScore,
                            keywords: [...allKeywords, ...extractKeywords(sectionContent, filepath)],
                            metadata: {
                                file: filename,
                                filepath,
                                section: currentSection,
                                chunkIndex,
                            },
                        });
                        chunkIndex++;
                    }
                }
                currentContent = [];
            }
            const level = headingMatch[1].length;
            const title = headingMatch[2].trim();
            currentSection = title;
            currentContent.push(line);
        }
        else {
            currentContent.push(line);
        }
    }
    if (currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim();
        if (sectionContent.length > 50) {
            if (sectionContent.length > maxChunkLength) {
                const subChunks = splitLongContent(sectionContent, maxChunkLength);
                subChunks.forEach((subContent, subIndex) => {
                    chunks.push({
                        chunkId: `${baseFilename}_${sanitizeSectionName(currentSection)}_${chunkIndex}_${subIndex}`,
                        content: subContent,
                        type: detectChunkType(currentSection, content),
                        section: currentSection || undefined,
                        credibilityScore,
                        keywords: [...allKeywords, ...extractKeywords(subContent, filepath)],
                        metadata: {
                            file: filename,
                            filepath,
                            section: currentSection,
                            chunkIndex: chunkIndex * 100 + subIndex,
                        },
                    });
                });
            }
            else {
                chunks.push({
                    chunkId: `${baseFilename}_${sanitizeSectionName(currentSection)}_${chunkIndex}`,
                    content: sectionContent,
                    type: detectChunkType(currentSection, content),
                    section: currentSection || undefined,
                    credibilityScore,
                    keywords: [...allKeywords, ...extractKeywords(sectionContent, filepath)],
                    metadata: {
                        file: filename,
                        filepath,
                        section: currentSection,
                        chunkIndex,
                    },
                });
            }
        }
    }
    if (chunks.length === 0) {
        const fullContent = content.trim();
        if (fullContent.length > 50) {
            if (fullContent.length > maxChunkLength) {
                const subChunks = splitLongContent(fullContent, maxChunkLength);
                subChunks.forEach((subContent, subIndex) => {
                    chunks.push({
                        chunkId: `${baseFilename}_full_${subIndex}`,
                        content: subContent,
                        type: 'general',
                        credibilityScore,
                        keywords: allKeywords,
                        metadata: {
                            file: filename,
                            filepath,
                            chunkIndex: subIndex,
                        },
                    });
                });
            }
            else {
                chunks.push({
                    chunkId: `${baseFilename}_full`,
                    content: fullContent,
                    type: 'general',
                    credibilityScore,
                    keywords: allKeywords,
                    metadata: {
                        file: filename,
                        filepath,
                    },
                });
            }
        }
    }
    return chunks;
}
function splitLongContent(content, maxLength) {
    const chunks = [];
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    for (const paragraph of paragraphs) {
        if ((currentChunk + paragraph).length > maxLength && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        }
        else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}
function sanitizeSectionName(section) {
    return section
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 50);
}
function detectChunkType(section, content) {
    const lowerSection = section.toLowerCase();
    const lowerContent = content.toLowerCase();
    if (lowerSection.includes('safety') || lowerSection.includes('risk') || lowerSection.includes('hazard')) {
        return 'safety';
    }
    if (lowerSection.includes('route') || lowerSection.includes('trail') || lowerSection.includes('path')) {
        return 'routes';
    }
    if (lowerSection.includes('equipment') || lowerSection.includes('gear') || lowerSection.includes('packing')) {
        return 'practical_guides';
    }
    if (lowerSection.includes('accommodation') || lowerSection.includes('hotel') || lowerSection.includes('lodging')) {
        return 'logistics';
    }
    if (lowerSection.includes('attraction') || lowerSection.includes('viewpoint') || lowerSection.includes('poi')) {
        return 'pois';
    }
    if (lowerContent.includes('pilgrimage') || lowerContent.includes('heritage') || lowerContent.includes('culture')) {
        return 'culture';
    }
    return 'general';
}
async function indexMarkdownFiles() {
    console.log('🚀 开始索引Markdown文件...\n');
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
        console.error('❌ docs目录不存在');
        process.exit(1);
    }
    console.log('📂 扫描Markdown文件...');
    const files = loadAllMarkdownFiles(docsDir);
    console.log(`✅ 找到 ${files.length} 个Markdown文件\n`);
    const indexedFiles = await prisma.knowledgeFile.findMany({
        where: {
            filename: { endsWith: '.md' },
        },
        select: { filepath: true, filename: true },
    });
    const indexedPaths = new Set(indexedFiles.map(f => f.filepath));
    const filesToIndex = files.filter(f => {
        const relativePath = path.relative(process.cwd(), f.path);
        return !indexedPaths.has(relativePath);
    });
    console.log(`📊 统计:`);
    console.log(`  总文件数: ${files.length}`);
    console.log(`  已索引: ${indexedFiles.length}`);
    console.log(`  待索引: ${filesToIndex.length}\n`);
    if (filesToIndex.length === 0) {
        console.log('✅ 所有Markdown文件已索引');
        await prisma.$disconnect();
        return;
    }
    let successCount = 0;
    let failCount = 0;
    let totalChunks = 0;
    for (let i = 0; i < filesToIndex.length; i++) {
        const fileData = filesToIndex[i];
        const relativePath = path.relative(process.cwd(), fileData.path);
        console.log(`\n[${i + 1}/${filesToIndex.length}] 📝 处理文件: ${fileData.filename}`);
        console.log(`  路径: ${relativePath}`);
        try {
            const content = fs.readFileSync(fileData.path, 'utf-8');
            if (content.trim().length < 50) {
                console.log(`  ⚠️  文件内容过短，跳过`);
                continue;
            }
            const category = detectCategory(relativePath, fileData.filename);
            console.log(`  📂 类别: ${category}`);
            let fileRecord = await prisma.knowledgeFile.findFirst({
                where: { filepath: relativePath },
            });
            if (!fileRecord) {
                const existingByFilename = await prisma.knowledgeFile.findFirst({
                    where: { filename: fileData.filename },
                });
                let finalFilename = fileData.filename;
                if (existingByFilename && existingByFilename.filepath !== relativePath) {
                    const dirParts = relativePath.split('/');
                    const regionMatch = dirParts.find(p => ['iceland', 'svalbard', 'greenland', 'faroe', 'alps', 'argentina', 'mountaineering', 'diving', 'cultural-heritage', 'natural-phenomena', 'polar-expedition'].includes(p.toLowerCase()));
                    if (regionMatch) {
                        finalFilename = `${regionMatch}_${fileData.filename}`;
                    }
                    else {
                        finalFilename = `${path.basename(path.dirname(relativePath))}_${fileData.filename}`;
                    }
                }
                fileRecord = await prisma.knowledgeFile.create({
                    data: {
                        filename: finalFilename,
                        filepath: relativePath,
                        category,
                        version: '1.0.0',
                        language: 'zh-CN',
                        credibilityScore: 0.9,
                        dataSources: ['manual'],
                        lastUpdated: new Date(),
                    },
                });
            }
            else {
                await prisma.knowledgeFile.update({
                    where: { id: fileRecord.id },
                    data: {
                        category,
                        lastUpdated: new Date(),
                    },
                });
            }
            const fileId = fileRecord.id;
            const chunks = chunkMarkdown(content, fileData.filename, relativePath);
            console.log(`  ✂️  生成 ${chunks.length} 个chunks`);
            if (chunks.length === 0) {
                console.log(`  ⚠️  文件没有生成任何chunks，跳过`);
                continue;
            }
            console.log(`  🔢 开始向量化...`);
            const chunkContents = chunks.map(c => c.content);
            const embeddings = await embeddingService.generateEmbeddingsBatch(chunkContents, 10);
            console.log(`  ✅ 向量化完成`);
            console.log(`  💾 保存到数据库...`);
            const batchSize = 50;
            let indexed = 0;
            await prisma.chunk.deleteMany({
                where: { fileId },
            });
            for (let j = 0; j < chunks.length; j += batchSize) {
                const batch = chunks.slice(j, j + batchSize);
                const batchEmbeddings = embeddings.slice(j, j + batchSize);
                const values = batch.map((chunk, idx) => {
                    const embedding = batchEmbeddings[idx];
                    const embeddingStr = `[${embedding.join(',')}]`;
                    return `(
            gen_random_uuid(),
            '${chunk.chunkId.replace(/'/g, "''")}',
            '${chunk.content.replace(/'/g, "''").substring(0, 50000)}',
            '${embeddingStr}'::vector,
            '${chunk.type}',
            ${chunk.section ? `'${chunk.section.replace(/'/g, "''")}'` : 'NULL'},
            ${chunk.credibilityScore},
            ARRAY[${chunk.keywords.map(k => `'${k.replace(/'/g, "''")}'`).join(',')}],
            '${fileId}',
            '${JSON.stringify(chunk.metadata || {}).replace(/'/g, "''")}'::jsonb,
            NOW(),
            NOW()
          )`;
                }).join(',');
                await prisma.$executeRawUnsafe(`
          INSERT INTO chunks (
            id, chunk_id, content, embedding, type, section, credibility_score, keywords, file_id, metadata, created_at, updated_at
          ) VALUES ${values}
        `);
                indexed += batch.length;
                if (indexed % 50 === 0) {
                    console.log(`    💾 已保存 ${indexed}/${chunks.length} chunks`);
                }
            }
            console.log(`  ✅ 文件索引完成: ${chunks.length} 个chunks`);
            successCount++;
            totalChunks += chunks.length;
        }
        catch (error) {
            console.error(`  ❌ 索引失败: ${error.message}`);
            console.error(error.stack);
            failCount++;
        }
    }
    console.log('\n' + '='.repeat(70));
    console.log('📊 索引完成统计');
    console.log('='.repeat(70));
    console.log(`✅ 成功: ${successCount} 个文件`);
    console.log(`❌ 失败: ${failCount} 个文件`);
    console.log(`📦 总Chunks数: ${totalChunks} 个`);
    console.log('='.repeat(70));
    await prisma.$disconnect();
}
indexMarkdownFiles().catch(console.error);
//# sourceMappingURL=index-all-markdown-files.js.map