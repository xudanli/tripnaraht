"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function checkStatus() {
    const prisma = new client_1.PrismaClient();
    try {
        console.log('📊 检查知识库索引状态...\n');
        const fileCount = await prisma.knowledgeFile.count();
        console.log(`📁 已索引文件数: ${fileCount}\n`);
        if (fileCount === 0) {
            console.log('⚠️  还没有文件被索引');
            return;
        }
        const chunkStats = await prisma.$queryRawUnsafe(`SELECT
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM chunks`);
        const stats = chunkStats[0];
        console.log('📦 分块统计:');
        console.log(`  - 总分块数: ${Number(stats.total)}`);
        console.log(`  - 有向量: ${Number(stats.with_embedding)}`);
        console.log(`  - 无向量: ${Number(stats.without_embedding)}\n`);
        const filesByCategory = await prisma.$queryRawUnsafe(`SELECT
        kf.category,
        COUNT(DISTINCT kf.id) as file_count,
        COUNT(c.id) as chunk_count
      FROM knowledge_files kf
      LEFT JOIN chunks c ON kf.id = c.file_id
      GROUP BY kf.category
      ORDER BY kf.category`);
        console.log('📂 按分类统计:');
        filesByCategory.forEach((item) => {
            console.log(`  - ${item.category}: ${Number(item.file_count)} 文件, ${Number(item.chunk_count)} 分块`);
        });
        console.log('\n');
        const recentFiles = await prisma.knowledgeFile.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                filename: true,
                category: true,
                createdAt: true,
                _count: {
                    select: { chunks: true },
                },
            },
        });
        console.log('📝 最近索引的文件（最新 10 个）:');
        recentFiles.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file.filename} (${file.category}) - ${file._count.chunks} 分块`);
        });
        console.log('\n✅ 检查完成！');
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
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error('执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=check-kb-index-status.js.map