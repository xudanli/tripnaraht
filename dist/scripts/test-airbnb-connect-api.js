#!/usr/bin/env node
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
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const airbnb_client_connect_api_1 = require("../src/mcp/airbnb-client-connect-api");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
if (!process.env.SMITHERY_API_KEY) {
    console.error('❌ 错误: 未设置 SMITHERY_API_KEY 环境变量');
    console.error('\n请设置环境变量:');
    console.error('  export SMITHERY_API_KEY="your-api-key-here"');
    console.error('\n或创建 .env 文件:');
    console.error('  SMITHERY_API_KEY=your-api-key-here');
    console.error('\n获取 API Key: https://smithery.ai/account/api-keys\n');
    process.exit(1);
}
async function testAirbnbConnectAPI() {
    var _a, _b, _c, _d;
    const configDir = path.join(os.homedir(), '.tripnara-mcp');
    const connectionIdFile = path.join(configDir, 'airbnb-connection-id.txt');
    let savedConnectionId;
    if (fs.existsSync(connectionIdFile)) {
        savedConnectionId = fs.readFileSync(connectionIdFile, 'utf-8').trim();
        console.log(`📋 加载保存的 connectionId: ${savedConnectionId}\n`);
    }
    const client = new airbnb_client_connect_api_1.AirbnbMcpClientConnectAPI(undefined, savedConnectionId);
    try {
        console.log('🔌 正在连接到 Airbnb MCP 服务器（使用 Connect API）...\n');
        await client.connect();
        console.log('✅ 连接成功！\n');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        const connectionId = client.getConnectionId();
        if (connectionId) {
            fs.writeFileSync(connectionIdFile, connectionId);
            console.log(`💾 已保存 connectionId: ${connectionId}\n`);
        }
        console.log('🛠️  测试 1: 列出所有可用工具');
        try {
            const tools = await client.listTools();
            console.log(`找到 ${((_a = tools.tools) === null || _a === void 0 ? void 0 : _a.length) || 0} 个工具:`);
            if (tools.tools) {
                tools.tools.forEach((tool) => {
                    console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
                });
            }
            console.log('✅ 测试 1 通过\n');
        }
        catch (error) {
            console.error('❌ 测试 1 失败:', error);
        }
        const tools = await client.listTools();
        if ((tools === null || tools === void 0 ? void 0 : tools.tools) && tools.tools.length > 0) {
            const firstTool = tools.tools[0];
            console.log(`🧪 测试 2: 调用工具 "${firstTool.name}"`);
            try {
                const result = await client.callTool(firstTool.name, {});
                console.log('结果:', JSON.stringify(result, null, 2));
                console.log('✅ 测试 2 通过\n');
            }
            catch (error) {
                if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('required')) || ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('参数'))) {
                    console.log(`⚠️  工具需要参数，跳过测试: ${error.message}`);
                }
                else {
                    console.error('❌ 测试 2 失败:', error);
                }
            }
        }
        console.log('🎉 所有测试完成！');
        console.log('\n💡 提示: connectionId 已保存，下次可以直接使用');
    }
    catch (error) {
        if ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('OAuth authorization required')) {
            console.error('\n🔐 ============================================');
            console.error('需要完成 OAuth 认证');
            console.error('============================================');
            console.error('\n请访问以下 URL 完成 Airbnb 认证:');
            console.error(`\n${error.message.split('Visit: ')[1] || '查看上面的错误信息'}\n`);
            console.error('认证完成后，使用保存的 connectionId 重新运行此脚本。');
            console.error('============================================\n');
            const connectionId = client.getConnectionId();
            if (connectionId) {
                if (!fs.existsSync(configDir)) {
                    fs.mkdirSync(configDir, { recursive: true });
                }
                fs.writeFileSync(connectionIdFile, connectionId);
                console.log(`💾 已保存 connectionId: ${connectionId}`);
                console.log('   认证完成后，重新运行此脚本即可自动连接\n');
            }
        }
        else {
            console.error('❌ 测试失败:', error);
            if (error instanceof Error) {
                console.error('错误信息:', error.message);
                console.error('堆栈:', error.stack);
            }
        }
        process.exit(1);
    }
    finally {
        try {
            await client.disconnect();
        }
        catch (error) {
        }
    }
}
testAirbnbConnectAPI().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-airbnb-connect-api.js.map