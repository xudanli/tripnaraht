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
const api_1 = require("@smithery/api");
const mcp_1 = require("@smithery/api/mcp");
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function testDirect() {
    const apiKey = process.env.SMITHERY_API_KEY;
    if (!apiKey) {
        console.error('❌ 未设置 SMITHERY_API_KEY');
        process.exit(1);
    }
    console.log('🧪 直接测试 Smithery API\n');
    const smithery = new api_1.Smithery({
        apiKey: apiKey,
    });
    console.log('方法 1: 使用 createConnection（不指定 namespace）...');
    try {
        const { transport, connectionId } = await (0, mcp_1.createConnection)({
            mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
        });
        console.log('✅ 成功！connectionId:', connectionId);
        return;
    }
    catch (error) {
        console.error('❌ 失败:', error.message);
        if (error.status) {
            console.error('   状态码:', error.status);
        }
    }
    console.log('\n方法 2: 先创建 connection，再获取 transport...');
    try {
        const conn = await smithery.experimental.connect.connections.create('tripnara', {
            mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
        });
        console.log('✅ Connection 创建成功！');
        console.log('  - Connection ID:', conn.connectionId);
        console.log('  - Status:', conn.status);
        if (conn.status && 'state' in conn.status && conn.status.state === 'auth_required') {
            const authStatus = conn.status;
            console.log('\n🔐 需要 OAuth 认证:');
            console.log('  URL:', authStatus.authorizationUrl || 'N/A');
        }
    }
    catch (error) {
        console.error('❌ 失败:', error.message);
        if (error.status) {
            console.error('   状态码:', error.status);
            console.error('   错误详情:', JSON.stringify(error.error || {}, null, 2));
        }
        if (error.status === 404) {
            console.error('\n💡 可能的原因:');
            console.error('  1. API Key 无效或已过期');
            console.error('  2. Namespace "tripnara" 不存在');
            console.error('  3. API Key 没有访问 Connect API 的权限');
            console.error('\n建议:');
            console.error('  1. 访问 https://smithery.ai/account/api-keys 检查 API Key');
            console.error('  2. 尝试创建新的 API Key');
            console.error('  3. 联系 Smithery 支持: support@smithery.ai');
        }
    }
}
testDirect().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-smithery-api-direct.js.map