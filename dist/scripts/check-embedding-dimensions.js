#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function checkDimensions() {
    var _a, _b, _c, _d, _e;
    const prisma = new client_1.PrismaClient();
    try {
        console.log('🔍 检查数据库中的 embedding 维度分布...\n');
        console.log('📊 Place 表维度分布:');
        console.log('='.repeat(50));
        const placeStats = await prisma.$queryRaw `
      SELECT 
        vector_dims(embedding) as dim,
        COUNT(*) as count
      FROM "Place"
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
        if (placeStats.length === 0) {
            console.log('  （无 embedding 数据）');
        }
        else {
            let total = 0;
            placeStats.forEach(stat => {
                const count = Number(stat.count);
                total += count;
                console.log(`  ${stat.dim}维: ${count.toLocaleString()} 条记录`);
            });
            console.log('='.repeat(50));
            console.log(`  总计: ${total.toLocaleString()} 条记录\n`);
            const needsMigration = placeStats.some(stat => stat.dim === 1536);
            if (needsMigration) {
                const openaiCount = ((_a = placeStats.find(stat => stat.dim === 1536)) === null || _a === void 0 ? void 0 : _a.count) || BigInt(0);
                console.log(`⚠️  发现 ${Number(openaiCount).toLocaleString()} 条 1536 维记录（OpenAI）`);
                console.log(`   建议使用 BGE-M3 (1024维) 重新生成\n`);
            }
            else {
                console.log('✅ 所有 Place embedding 都是 1024 维（BGE-M3）\n');
            }
        }
        const totalPlaces = await prisma.place.count();
        const placesWithEmbeddingResult = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE embedding IS NOT NULL
    `;
        const placesWithEmbedding = Number(((_b = placesWithEmbeddingResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
        console.log('📈 Place 表统计:');
        console.log(`  总记录数: ${totalPlaces.toLocaleString()}`);
        console.log(`  有 embedding: ${placesWithEmbedding.toLocaleString()}`);
        console.log(`  无 embedding: ${(totalPlaces - placesWithEmbedding).toLocaleString()}\n`);
        console.log('📊 Chunk 表维度分布:');
        console.log('='.repeat(50));
        const chunkStats = await prisma.$queryRaw `
      SELECT 
        vector_dims(embedding) as dim,
        COUNT(*) as count
      FROM chunks
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
        if (chunkStats.length === 0) {
            console.log('  （无 embedding 数据）');
        }
        else {
            let total = 0;
            chunkStats.forEach(stat => {
                const count = Number(stat.count);
                total += count;
                console.log(`  ${stat.dim}维: ${count.toLocaleString()} 条记录`);
            });
            console.log('='.repeat(50));
            console.log(`  总计: ${total.toLocaleString()} 条记录\n`);
            const needsMigration = chunkStats.some(stat => stat.dim === 1536);
            if (needsMigration) {
                const openaiCount = ((_c = chunkStats.find(stat => stat.dim === 1536)) === null || _c === void 0 ? void 0 : _c.count) || BigInt(0);
                console.log(`⚠️  发现 ${Number(openaiCount).toLocaleString()} 条 1536 维记录（OpenAI）`);
                console.log(`   建议使用 BGE-M3 (1024维) 重新生成\n`);
                console.log('💡 迁移命令:');
                console.log('   npm run script:migrate-chunk-embeddings -- --dry-run  # 预览');
                console.log('   npm run script:migrate-chunk-embeddings  # 全量迁移\n');
            }
            else {
                console.log('✅ 所有 Chunk embedding 都是 1024 维（BGE-M3）\n');
            }
        }
        const totalChunksResult = await prisma.$queryRaw `
      SELECT COUNT(*) as count FROM chunks
    `;
        const chunksWithEmbeddingResult = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM chunks
      WHERE embedding IS NOT NULL
    `;
        const totalChunks = Number(((_d = totalChunksResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0);
        const chunksWithEmbedding = Number(((_e = chunksWithEmbeddingResult[0]) === null || _e === void 0 ? void 0 : _e.count) || 0);
        console.log('📈 Chunk 表统计:');
        console.log(`  总记录数: ${totalChunks.toLocaleString()}`);
        console.log(`  有 embedding: ${chunksWithEmbedding.toLocaleString()}`);
        console.log(`  无 embedding: ${(totalChunks - chunksWithEmbedding).toLocaleString()}`);
    }
    catch (error) {
        console.error('❌ 检查失败:', error.message);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkDimensions().catch(console.error);
//# sourceMappingURL=check-embedding-dimensions.js.map