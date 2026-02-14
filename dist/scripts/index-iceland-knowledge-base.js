"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const indexing_service_1 = require("../src/knowledge-base/services/indexing.service");
async function indexKnowledgeBase() {
    console.log('🚀 开始索引冰岛知识库...\n');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const indexingService = app.get(indexing_service_1.IndexingService);
    try {
        const configService = app.get('ConfigService');
        const kbPath = (configService === null || configService === void 0 ? void 0 : configService.get('KB_PATH')) || './docs/iceland';
        console.log(`📁 知识库路径: ${kbPath}\n`);
        await indexingService.indexAllKnowledgeBase();
        console.log('\n✅ 知识库索引完成！');
        console.log('\n📊 下一步：');
        console.log('   - 可以通过 API 测试检索功能');
        console.log('   - POST /rag/chunks/retrieve');
        console.log('   - 查看 Prisma Studio: npx prisma studio');
    }
    catch (error) {
        console.error('\n❌ 索引失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
    finally {
        await app.close();
    }
}
indexKnowledgeBase()
    .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n💥 索引脚本执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=index-iceland-knowledge-base.js.map