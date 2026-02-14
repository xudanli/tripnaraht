"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function addIndexes() {
    console.log('🚀 开始添加 Place 表索引...\n');
    const indexes = [
        {
            name: 'place_namecn_idx',
            sql: 'CREATE INDEX IF NOT EXISTS place_namecn_idx ON "Place" (LOWER("nameCN"))',
            description: 'nameCN 文本搜索索引',
        },
        {
            name: 'place_nameen_idx',
            sql: 'CREATE INDEX IF NOT EXISTS place_nameen_idx ON "Place" (LOWER("nameEN"))',
            description: 'nameEN 文本搜索索引',
        },
        {
            name: 'place_address_idx',
            sql: 'CREATE INDEX IF NOT EXISTS place_address_idx ON "Place" (LOWER(address))',
            description: 'address 文本搜索索引',
        },
        {
            name: 'place_category_cityid_idx',
            sql: 'CREATE INDEX IF NOT EXISTS place_category_cityid_idx ON "Place" (category, "cityId")',
            description: 'category + cityId 复合索引',
        },
        {
            name: 'place_category_createdat_idx',
            sql: 'CREATE INDEX IF NOT EXISTS place_category_createdat_idx ON "Place" (category, "createdAt" DESC)',
            description: 'category + createdAt 复合索引（用于排序）',
        },
    ];
    try {
        for (const index of indexes) {
            console.log(`📝 创建索引: ${index.name} (${index.description})...`);
            await prisma.$executeRawUnsafe(index.sql);
            console.log(`✅ ${index.name} 创建成功\n`);
        }
        console.log('🎉 所有索引创建完成！');
    }
    catch (error) {
        console.error('❌ 创建索引失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
addIndexes()
    .then(() => {
    console.log('\n✨ 脚本执行完成');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n💥 脚本执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=add-place-indexes.js.map