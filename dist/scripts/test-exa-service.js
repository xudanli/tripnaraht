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
const dotenv = __importStar(require("dotenv"));
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const exa_service_1 = require("../src/mcp/exa.service");
dotenv.config();
async function testExaService() {
    console.log('🧪 测试 Exa MCP 服务\n');
    console.log('============================================================\n');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const exaService = app.get(exa_service_1.ExaService);
    try {
        console.log('1️⃣ 检查连接状态...\n');
        const status = await exaService.checkConnectionStatus();
        console.log('✅ 连接状态:', status);
        console.log();
        if (!status.hasApiKey) {
            console.log('⚠️  警告: 未设置 EXA_API_KEY 环境变量');
            console.log('   获取 API Key: https://dashboard.exa.ai/api-keys\n');
        }
        console.log('2️⃣ 列出可用工具...\n');
        const tools = await exaService.listTools();
        console.log(`✅ 找到 ${tools.length} 个工具:`);
        tools.forEach((tool, index) => {
            console.log(`   ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
        });
        console.log();
        console.log('3️⃣ 测试 Web 搜索...\n');
        try {
            const searchResult = await exaService.webSearch('latest AI developments', {
                numResults: 3,
            });
            console.log('✅ Web 搜索成功');
            console.log('结果:', JSON.stringify(searchResult, null, 2).substring(0, 500) + '...');
        }
        catch (error) {
            console.log('❌ Web 搜索失败:', error.message);
        }
        console.log();
        console.log('4️⃣ 测试代码上下文搜索...\n');
        try {
            const codeResult = await exaService.getCodeContext('React hooks useState example', {
                numResults: 2,
            });
            console.log('✅ 代码上下文搜索成功');
            console.log('结果:', JSON.stringify(codeResult, null, 2).substring(0, 500) + '...');
        }
        catch (error) {
            console.log('❌ 代码上下文搜索失败:', error.message);
        }
        console.log();
        console.log('5️⃣ 测试公司研究...\n');
        try {
            const companyResult = await exaService.companyResearch('OpenAI', {
                numResults: 3,
            });
            console.log('✅ 公司研究成功');
            console.log('结果:', JSON.stringify(companyResult, null, 2).substring(0, 500) + '...');
        }
        catch (error) {
            console.log('❌ 公司研究失败:', error.message);
        }
        console.log();
        console.log('✅ 测试完成');
    }
    catch (error) {
        console.error('❌ 测试失败:', error);
    }
    finally {
        await app.close();
    }
}
testExaService().catch(console.error);
//# sourceMappingURL=test-exa-service.js.map