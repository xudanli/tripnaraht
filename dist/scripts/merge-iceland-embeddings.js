#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function mergeIcelandEmbeddings() {
    var _a, _b;
    try {
        console.log('🔄 合并冰岛（IS）的 embedding 数据');
        console.log('='.repeat(60));
        console.log('📊 检查临时列数据...\n');
        const tempStats = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place" p
      LEFT JOIN "City" c ON c.id = p."cityId"
      WHERE (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
        AND p.embedding_new IS NOT NULL
    `;
        const tempCount = Number(((_a = tempStats[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        console.log(`临时列中有 ${tempCount.toLocaleString()} 条冰岛记录\n`);
        if (tempCount === 0) {
            console.log('⚠️  临时列中没有数据，无需合并');
            return;
        }
        console.log('🔍 检查主列维度...\n');
        const mainColumnDim = await prisma.$queryRaw `
      SELECT vector_dims(embedding) as dim
      FROM "Place"
      WHERE embedding IS NOT NULL
      LIMIT 1
    `;
        const currentDim = (_b = mainColumnDim[0]) === null || _b === void 0 ? void 0 : _b.dim;
        console.log(`当前主列维度: ${currentDim || 'NULL'}\n`);
        if (currentDim === 1536) {
            console.log('⚠️  主列是 vector(1536)，需要先清空冰岛数据的主列\n');
            console.log('🧹 清空冰岛数据的主列 embedding...');
            const cleared = await prisma.$executeRaw `
        UPDATE "Place" p
        SET embedding = NULL
        FROM "City" c
        WHERE p."cityId" = c.id
          AND (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
          AND p.embedding IS NOT NULL
      `;
            console.log(`✅ 已清空 ${cleared} 条记录的主列\n`);
        }
        if (currentDim === 1536) {
            console.log('⚠️  警告: 需要修改主列定义为 vector(1024)');
            console.log('   这将影响所有数据，建议先备份数据库\n');
            console.log('   按 Ctrl+C 取消，或等待 10 秒后继续...\n');
            await new Promise(resolve => setTimeout(resolve, 10000));
            console.log('🔄 修改主列定义...');
            await prisma.$executeRaw `DROP INDEX IF EXISTS place_embedding_idx`;
            await prisma.$executeRaw `ALTER TABLE "Place" DROP COLUMN IF EXISTS embedding`;
            await prisma.$executeRaw `ALTER TABLE "Place" ADD COLUMN embedding vector(1024)`;
            console.log('✅ 主列已修改为 vector(1024)\n');
        }
        console.log('📋 将临时列数据复制到主列...');
        const merged = await prisma.$executeRaw `
      UPDATE "Place" p
      SET embedding = p.embedding_new
      FROM "City" c
      WHERE p."cityId" = c.id
        AND (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
        AND p.embedding_new IS NOT NULL
    `;
        console.log(`✅ 已合并 ${merged} 条记录\n`);
        console.log('📊 创建向量索引...');
        await prisma.$executeRaw `
      CREATE INDEX IF NOT EXISTS place_embedding_idx ON "Place" 
      USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100)
    `;
        console.log('✅ 索引已创建\n');
        console.log('🗑️  删除临时列...');
        await prisma.$executeRaw `ALTER TABLE "Place" DROP COLUMN IF EXISTS embedding_new`;
        console.log('✅ 临时列已删除\n');
        console.log('🔍 验证合并结果...\n');
        const finalStats = await prisma.$queryRaw `
      SELECT 
        vector_dims(embedding) as dim,
        COUNT(*) as count
      FROM "Place"
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
        console.log('最终维度分布:');
        if (finalStats.length === 0) {
            console.log('  （无 embedding 数据）');
        }
        else {
            finalStats.forEach(stat => {
                console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
            });
        }
        const icelandStats = await prisma.$queryRaw `
      SELECT 
        vector_dims(p.embedding) as dim,
        COUNT(*) as count
      FROM "Place" p
      LEFT JOIN "City" c ON c.id = p."cityId"
      WHERE (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
        AND p.embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
        console.log('\n冰岛数据维度分布:');
        if (icelandStats.length === 0) {
            console.log('  （无 embedding 数据）');
        }
        else {
            icelandStats.forEach(stat => {
                console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
            });
        }
        console.log('\n✅ 合并完成！');
    }
    catch (error) {
        console.error('\n❌ 合并失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
mergeIcelandEmbeddings().catch(console.error);
//# sourceMappingURL=merge-iceland-embeddings.js.map