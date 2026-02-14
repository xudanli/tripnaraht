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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function diagnoseDatabase() {
    var _a, _b, _c, _d, _e;
    console.log('\n' + '='.repeat(60));
    console.log('📊 RAG知识库诊断');
    console.log('='.repeat(60));
    const docIndexCount = 0;
    const docIndexFiles = [];
    const knowledgeFilesCount = await prisma.knowledgeFile.count();
    const knowledgeFiles = await prisma.knowledgeFile.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { chunks: true } } }
    });
    const chunksCount = await prisma.chunk.count();
    const chunksWithEmbedding = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`);
    console.log('\n📋 表状态统计:');
    console.log(`  DocumentIndex表 (旧系统): ${docIndexCount} 条记录`);
    console.log(`  KnowledgeFile表 (新系统): ${knowledgeFilesCount} 条记录`);
    console.log(`  Chunks表: ${chunksCount} 条记录`);
    console.log(`  已向量化chunks: ${((_a = chunksWithEmbedding[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
    const docsWithoutFileId = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM document_index WHERE source IS NULL OR source = ''`);
    console.log(`\n⚠️  问题诊断:`);
    console.log(`  缺少source的DocumentIndex记录: ${((_b = docsWithoutFileId[0]) === null || _b === void 0 ? void 0 : _b.count) || 0}`);
    if (docIndexFiles.length > 0) {
        console.log(`\n📄 DocumentIndex表样本 (前20个):`);
        docIndexFiles.forEach((d, i) => {
            const hasSource = d.source ? '✅' : '⚠️';
            console.log(`  ${hasSource} ${i + 1}. ${d.title} [${d.collection}]`);
            console.log(`     来源: ${d.source || '无'}`);
        });
    }
    if (knowledgeFiles.length > 0) {
        console.log(`\n📁 KnowledgeFile表样本 (前20个):`);
        knowledgeFiles.forEach((f, i) => {
            const status = f._count.chunks > 0 ? '✅' : '⚠️';
            console.log(`  ${status} ${i + 1}. ${f.filename} [${f.category}] - ${f._count.chunks} chunks`);
        });
    }
    if (knowledgeFilesCount > 0) {
        const filesWithoutChunks = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count 
      FROM knowledge_files kf
      LEFT JOIN chunks c ON c.file_id = kf.id
      WHERE c.id IS NULL
      `);
        console.log(`\n⚠️  无chunks的文件数: ${((_c = filesWithoutChunks[0]) === null || _c === void 0 ? void 0 : _c.count) || 0}`);
    }
    return {
        docIndexCount,
        knowledgeFilesCount,
        chunksCount,
        chunksWithEmbedding: ((_d = chunksWithEmbedding[0]) === null || _d === void 0 ? void 0 : _d.count) || 0,
        docsWithoutFileId: ((_e = docsWithoutFileId[0]) === null || _e === void 0 ? void 0 : _e.count) || 0,
    };
}
async function checkFileSystem() {
    console.log('\n' + '='.repeat(60));
    console.log('📂 文件系统检查');
    console.log('='.repeat(60));
    const docsPath = './docs';
    if (!fs.existsSync(docsPath)) {
        console.log(`\n❌ docs目录不存在: ${docsPath}`);
        return { totalFiles: 0, files: [] };
    }
    const files = [];
    function walkDir(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                walkDir(fullPath);
            }
            else if (entry.name.endsWith('.json')) {
                files.push({
                    path: fullPath,
                    filename: entry.name,
                });
            }
        }
    }
    walkDir(docsPath);
    console.log(`\n找到 ${files.length} 个JSON文件`);
    console.log(`\n文件列表 (前20个):`);
    files.slice(0, 20).forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.filename} (${f.path})`);
    });
    return { totalFiles: files.length, files };
}
async function generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📝 生成诊断报告');
    console.log('='.repeat(60));
    const dbStats = await diagnoseDatabase();
    const fsStats = await checkFileSystem();
    const report = {
        timestamp: new Date().toISOString(),
        database: {
            documentIndex: {
                total: Number(dbStats.docIndexCount),
                withoutSource: Number(dbStats.docsWithoutFileId),
            },
            knowledgeFiles: {
                total: Number(dbStats.knowledgeFilesCount),
            },
            chunks: {
                total: Number(dbStats.chunksCount),
                withEmbedding: Number(dbStats.chunksWithEmbedding),
            },
        },
        fileSystem: {
            totalFiles: fsStats.totalFiles,
        },
        issues: [],
        recommendations: [],
    };
    if (dbStats.knowledgeFilesCount === 0 && fsStats.totalFiles > 0) {
        report.issues.push('KnowledgeFile表为空，但文件系统中有文件');
        report.recommendations.push('需要运行导入脚本将文件导入到KnowledgeFile表');
    }
    if (dbStats.chunksCount === 0 && dbStats.knowledgeFilesCount > 0) {
        report.issues.push('KnowledgeFile表有文件，但Chunks表为空');
        report.recommendations.push('需要运行索引脚本生成chunks和向量');
    }
    if (dbStats.docsWithoutFileId > 0) {
        report.issues.push(`${dbStats.docsWithoutFileId}个DocumentIndex记录缺少source字段`);
        report.recommendations.push('需要建立DocumentIndex和KnowledgeFile之间的关联');
    }
    if (dbStats.knowledgeFilesCount > 0 && dbStats.chunksCount === 0) {
        report.issues.push('文件已导入但未生成chunks');
        report.recommendations.push('运行索引脚本: npx tsx scripts/index-all-docs-kb.ts');
    }
    console.log('\n📊 诊断报告:');
    console.log(JSON.stringify(report, null, 2));
    const reportPath = './rag-diagnosis-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ 报告已保存到: ${reportPath}`);
    return report;
}
async function main() {
    try {
        await generateReport();
        console.log('\n' + '='.repeat(60));
        console.log('✅ 诊断完成');
        console.log('='.repeat(60));
        console.log('\n💡 下一步操作建议:');
        console.log('1. 如果KnowledgeFile表为空，运行: npx tsx scripts/index-all-docs-kb.ts');
        console.log('2. 如果Chunks表为空，运行: npx tsx scripts/index-all-docs-kb.ts');
        console.log('3. 查看详细报告: cat rag-diagnosis-report.json');
        console.log('');
    }
    catch (error) {
        console.error('\n❌ 诊断失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=rag-diagnosis-and-fix.js.map