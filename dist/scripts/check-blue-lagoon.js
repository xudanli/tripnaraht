"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function check() {
    const chunks = await prisma.$queryRawUnsafe(`
    SELECT c.content, c.credibility_score, kf.filename
    FROM chunks c
    LEFT JOIN knowledge_files kf ON c.file_id = kf.id
    WHERE c.content ILIKE '%蓝湖%' OR c.content ILIKE '%blue lagoon%' OR c.keywords::text ILIKE '%蓝湖%'
    LIMIT 5
  `);
    console.log('找到', chunks.length, '个相关chunks');
    chunks.forEach((c) => {
        var _a;
        console.log('文件:', c.filename);
        console.log('内容片段:', (_a = c.content) === null || _a === void 0 ? void 0 : _a.substring(0, 150));
        console.log('---');
    });
    const types = await prisma.$queryRawUnsafe(`
    SELECT type, COUNT(*) as count
    FROM chunks
    GROUP BY type
  `);
    console.log('\nChunk类型分布:');
    types.forEach((t) => console.log(`  ${t.type}: ${Number(t.count)}`));
    console.log('\n测试向量检索...');
    const testChunks = await prisma.$queryRawUnsafe(`
    SELECT 
      content,
      1 - (embedding <=> (SELECT embedding FROM chunks LIMIT 1)) as similarity
    FROM chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> (SELECT embedding FROM chunks LIMIT 1)
    LIMIT 3
  `);
    console.log('找到', testChunks.length, '个chunks');
    testChunks.forEach((c) => {
        console.log(`相似度: ${c.similarity.toFixed(4)}, 内容: ${c.content.substring(0, 80)}...`);
    });
    await prisma.$disconnect();
}
check().catch(console.error);
//# sourceMappingURL=check-blue-lagoon.js.map