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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const config_1 = require("@nestjs/config");
const indexing_service_1 = require("../src/knowledge-base/services/indexing.service");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_2 = require("@nestjs/config");
const prisma_module_1 = require("../src/prisma/prisma.module");
const places_module_1 = require("../src/places/places.module");
const knowledge_base_module_1 = require("../src/knowledge-base/knowledge-base.module");
let SimpleIndexingModule = class SimpleIndexingModule {
};
SimpleIndexingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_2.ConfigModule.forRoot({
                isGlobal: true,
            }),
            prisma_module_1.PrismaModule,
            places_module_1.PlacesModule,
            knowledge_base_module_1.KnowledgeBaseModule,
        ],
    })
], SimpleIndexingModule);
async function indexKnowledgeBase() {
    var _a;
    console.log('🚀 开始索引冰岛知识库...\n');
    let app;
    try {
        app = await core_1.NestFactory.createApplicationContext(SimpleIndexingModule, {
            logger: ['error', 'warn', 'log'],
        });
        const indexingService = app.get(indexing_service_1.IndexingService);
        const configService = app.get(config_1.ConfigService);
        const kbPath = configService.get('KB_PATH') || './docs/iceland';
        console.log(`📁 知识库路径: ${kbPath}\n`);
        if (!fs.existsSync(kbPath)) {
            console.error(`❌ 知识库路径不存在: ${kbPath}`);
            console.log(`💡 请确认路径是否正确，或设置环境变量 KB_PATH`);
            process.exit(1);
        }
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
        if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('ConfigService')) {
            console.log('\n💡 提示: ConfigService 注入问题，尝试使用环境变量');
        }
        throw error;
    }
    finally {
        if (app) {
            await app.close();
        }
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
//# sourceMappingURL=index-iceland-knowledge-base-direct.js.map