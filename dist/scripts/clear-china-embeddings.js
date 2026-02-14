#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
async function clearChinaEmbeddings() {
    var _a, _b;
    try {
        console.log('🧹 清理中国（CN）的 embedding 向量');
        console.log('='.repeat(60));
        if (isDryRun) {
            console.log('⚠️  DRY RUN 模式：只预览，不实际删除\n');
        }
        console.log('📊 统计中国（CN）的 Place 记录...\n');
        const chinaPlaces = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place" p
      LEFT JOIN "City" c ON c.id = p."cityId"
      WHERE (c."countryCode" = 'CN' OR p.metadata->>'countryCode' = 'CN')
        AND p.embedding IS NOT NULL
    `;
        const totalCount = Number(((_a = chinaPlaces[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        console.log(`找到 ${totalCount.toLocaleString()} 条中国 Place 记录有 embedding\n`);
        if (totalCount === 0) {
            console.log('✅ 没有需要清理的记录');
            return;
        }
        console.log('📋 清理范围:');
        console.log('  - 国家代码: CN（中国）');
        console.log('  - 操作: 将 embedding 设为 NULL');
        console.log(`  - 影响记录数: ${totalCount.toLocaleString()} 条\n`);
        if (!isDryRun) {
            console.log('⚠️  警告: 这将清空所有中国 Place 的 embedding');
            console.log('   按 Ctrl+C 取消，或等待 5 秒后继续...\n');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        if (isDryRun) {
            console.log('✅ Dry-run 完成，未实际删除数据\n');
        }
        else {
            console.log('🚀 开始清理...\n');
            const result = await prisma.$executeRawUnsafe(`
        UPDATE "Place" p
        SET embedding = NULL
        FROM "City" c
        WHERE p."cityId" = c.id
          AND (c."countryCode" = 'CN' OR p.metadata->>'countryCode' = 'CN')
          AND p.embedding IS NOT NULL
      `);
            console.log(`✅ 清理完成！已清空 ${result} 条记录的 embedding\n`);
        }
        console.log('🔍 验证清理结果...\n');
        const remainingChinaEmbeddings = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Place" p
      LEFT JOIN "City" c ON c.id = p."cityId"
      WHERE (c."countryCode" = 'CN' OR p.metadata->>'countryCode' = 'CN')
        AND p.embedding IS NOT NULL
    `;
        const remainingCount = Number(((_b = remainingChinaEmbeddings[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
        if (remainingCount === 0) {
            console.log('✅ 验证通过：所有中国 Place 的 embedding 已清空\n');
        }
        else {
            console.log(`⚠️  仍有 ${remainingCount.toLocaleString()} 条记录未清理\n`);
        }
        const dimensionStats = await prisma.$queryRaw `
      SELECT 
        vector_dims(embedding) as dim,
        COUNT(*) as count
      FROM "Place"
      WHERE embedding IS NOT NULL
      GROUP BY dim
      ORDER BY dim
    `;
        console.log('📊 清理后的 embedding 维度分布:');
        if (dimensionStats.length === 0) {
            console.log('  （无 embedding 数据）');
        }
        else {
            dimensionStats.forEach(stat => {
                console.log(`  - ${stat.dim}维: ${Number(stat.count).toLocaleString()} 条记录`);
            });
        }
    }
    catch (error) {
        console.error('\n❌ 清理失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
clearChinaEmbeddings().catch(console.error);
//# sourceMappingURL=clear-china-embeddings.js.map