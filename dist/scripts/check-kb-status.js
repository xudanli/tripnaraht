"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function checkStatus() {
    var _a, _b;
    const prisma = new client_1.PrismaClient();
    try {
        console.log('📊 检查知识库索引状态...\n');
        const fileCount = await prisma.knowledgeFile.count();
        const chunkCount = await prisma.chunk.count();
        const chunksWithEmbedding = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`);
        console.log('📈 索引统计:');
        console.log(`  - 文件总数: ${fileCount}`);
        console.log(`  - 分块总数: ${chunkCount}`);
        console.log(`  - 有向量的分块: ${Number(((_a = chunksWithEmbedding[0]) === null || _a === void 0 ? void 0 : _a.count) || 0)}`);
        console.log('\n📁 最近索引的文件:');
        const recentFiles = await prisma.knowledgeFile.findMany({
            take: 5,
            orderBy: { lastUpdated: 'desc' },
            select: {
                filename: true,
                category: true,
                lastUpdated: true,
                credibilityScore: true,
                _count: {
                    select: { chunks: true }
                }
            }
        });
        recentFiles.forEach((file) => {
            console.log(`  - ${file.filename}`);
            console.log(`    类别: ${file.category}`);
            console.log(`    分块数: ${file._count.chunks}`);
            console.log(`    更新时间: ${file.lastUpdated.toISOString()}`);
            console.log(`    可信度: ${file.credibilityScore}`);
            console.log('');
        });
        console.log('💡 建议:');
        if (fileCount === 0) {
            console.log('  ⚠️  数据库中没有任何文件，需要执行索引！');
            console.log('  运行: npx tsx scripts/index-iceland-kb-standalone.ts');
        }
        else if (fileCount < 23) {
            console.log(`  ⚠️  数据库中只有 ${fileCount} 个文件，但知识库有 23 个 JSON 文件`);
            console.log('  建议重新索引: npx tsx scripts/index-iceland-kb-standalone.ts');
        }
        else if (chunkCount === 0) {
            console.log('  ⚠️  有文件记录但没有分块，需要重新索引！');
            console.log('  运行: npx tsx scripts/index-iceland-kb-standalone.ts');
        }
        else if (Number(((_b = chunksWithEmbedding[0]) === null || _b === void 0 ? void 0 : _b.count) || 0) === 0) {
            console.log('  ⚠️  有分块但没有向量，需要重新索引！');
            console.log('  运行: npx tsx scripts/index-iceland-kb-standalone.ts');
        }
        else {
            console.log('  ✅ 索引看起来正常！');
            console.log('  可以测试检索: curl -X POST http://localhost:3000/rag/chunks/retrieve \\');
            console.log('    -H "Content-Type: application/json" \\');
            console.log('    -d \'{"query": "冰岛租车保险", "limit": 5}\'');
        }
    }
    catch (error) {
        console.error('❌ 检查失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
checkStatus()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=check-kb-status.js.map