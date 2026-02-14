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
const exa_client_1 = require("../src/mcp/exa-client");
dotenv.config();
async function testExaAuth() {
    var _a, _b;
    console.log('🔍 调试 Exa MCP 认证\n');
    console.log('============================================================\n');
    const apiKey = process.env.EXA_API_KEY;
    console.log('1️⃣ 检查 API Key...\n');
    if (apiKey) {
        console.log(`✅ EXA_API_KEY 已设置`);
        console.log(`   长度: ${apiKey.length} 字符`);
        console.log(`   前缀: ${apiKey.substring(0, 10)}...`);
        console.log(`   后缀: ...${apiKey.substring(apiKey.length - 10)}`);
        console.log(`   格式检查: ${/^[a-f0-9-]+$/i.test(apiKey) ? '✅ UUID 格式' : '⚠️  非标准格式'}`);
    }
    else {
        console.log('❌ EXA_API_KEY 未设置');
        console.log('   获取 API Key: https://dashboard.exa.ai/api-keys');
        return;
    }
    console.log();
    console.log('2️⃣ 测试 URL 构建...\n');
    const baseUrl = 'https://mcp.exa.ai/mcp';
    const url = new URL(baseUrl);
    url.searchParams.set('exaApiKey', apiKey);
    console.log(`✅ 构建的 URL:`);
    console.log(`   ${url.toString()}`);
    console.log(`   查询参数: ${url.searchParams.toString()}`);
    console.log();
    console.log('3️⃣ 测试连接（使用查询参数）...\n');
    const client = new exa_client_1.ExaMcpClient();
    try {
        await client.connect();
        console.log('✅ 连接成功\n');
        console.log('4️⃣ 测试工具调用...\n');
        try {
            const result = await client.callTool('web_search_exa', {
                query: 'test',
                numResults: 1,
            });
            if (result.content && result.content[0]) {
                const content = result.content[0];
                if (content.type === 'text') {
                    const text = content.text;
                    if (text.includes('401') || text.includes('Unauthorized')) {
                        console.log('❌ 401 错误 - 认证失败');
                        console.log(`   错误信息: ${text.substring(0, 200)}`);
                        console.log('\n💡 可能的原因:');
                        console.log('   1. API Key 无效或已过期');
                        console.log('   2. API Key 格式不正确');
                        console.log('   3. 服务器期望通过 HTTP header 传递 API Key');
                        console.log('   4. 查询参数名不正确（当前使用: exaApiKey）');
                    }
                    else if (text.includes('error')) {
                        console.log('⚠️  返回错误（非认证错误）');
                        console.log(`   错误信息: ${text.substring(0, 200)}`);
                    }
                    else {
                        console.log('✅ 工具调用成功！');
                        console.log(`   结果摘要: ${text.substring(0, 200)}...`);
                    }
                }
            }
        }
        catch (error) {
            console.log('❌ 工具调用失败:', error.message);
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('401')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('Unauthorized'))) {
                console.log('\n💡 认证失败，尝试其他方法...');
            }
        }
        await client.disconnect();
    }
    catch (error) {
        console.log('❌ 连接失败:', error.message);
    }
    console.log('\n5️⃣ 检查 Exa 文档中的认证方式...\n');
    console.log('根据 Exa 文档 (https://docs.exa.ai/reference/exa-mcp):');
    console.log('   - API Key 应通过查询参数传递: ?exaApiKey=YOUR_KEY');
    console.log('   - 或者通过环境变量 EXA_API_KEY（本地 npm 包）');
    console.log('   - 当前实现: ✅ 使用查询参数 exaApiKey');
    console.log('\n如果仍然返回 401，可能的原因:');
    console.log('   1. API Key 本身无效 - 请访问 https://dashboard.exa.ai/api-keys 验证');
    console.log('   2. API Key 已过期或被撤销');
    console.log('   3. API Key 有速率限制或配额已用完');
    console.log('   4. 服务器端配置问题');
}
testExaAuth().catch(console.error);
//# sourceMappingURL=test-exa-auth.js.map