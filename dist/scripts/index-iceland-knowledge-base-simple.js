"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../src/prisma/prisma.module");
const places_module_1 = require("../src/places/places.module");
const knowledge_base_module_1 = require("../src/knowledge-base/knowledge-base.module");
const indexing_service_1 = require("../src/knowledge-base/services/indexing.service");
const common_1 = require("@nestjs/common");
let IndexingAppModule = class IndexingAppModule {
};
IndexingAppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            prisma_module_1.PrismaModule,
            places_module_1.PlacesModule,
            knowledge_base_module_1.KnowledgeBaseModule,
        ],
    })
], IndexingAppModule);
async function indexKnowledgeBase() {
    console.log('🚀 开始索引冰岛知识库...\n');
    const app = await core_1.NestFactory.createApplicationContext(IndexingAppModule);
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
//# sourceMappingURL=index-iceland-knowledge-base-simple.js.map