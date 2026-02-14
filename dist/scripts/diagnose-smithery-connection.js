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
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function diagnose() {
    var _a, _b, _c;
    const apiKey = process.env.SMITHERY_API_KEY;
    if (!apiKey) {
        console.error('❌ 未设置 SMITHERY_API_KEY');
        process.exit(1);
    }
    console.log('🔍 诊断 Smithery Connect API 连接问题\n');
    console.log(`API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`);
    console.log(`API Key 长度: ${apiKey.length}\n`);
    try {
        const smithery = new api_1.Smithery({
            apiKey: apiKey,
        });
        console.log('✅ Smithery 客户端创建成功\n');
        console.log('📋 检查 API 结构...');
        console.log('  - smithery.experimental:', typeof smithery.experimental);
        console.log('  - smithery.experimental.connect:', typeof ((_a = smithery.experimental) === null || _a === void 0 ? void 0 : _a.connect));
        console.log('  - smithery.experimental.connect.connections:', typeof ((_c = (_b = smithery.experimental) === null || _b === void 0 ? void 0 : _b.connect) === null || _c === void 0 ? void 0 : _c.connections));
        console.log('');
        console.log('🧪 尝试创建 connection（namespace: tripnara）...');
        try {
            const conn = await smithery.experimental.connect.connections.set('test-airbnb', {
                namespace: 'tripnara',
                mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
                name: 'Airbnb Test',
            });
            console.log('✅ Connection 创建成功！');
            console.log('  - Connection ID:', conn.connectionId);
            console.log('  - Status:', conn.status);
            console.log('  - Name:', conn.name);
            if (conn.status && 'state' in conn.status && conn.status.state === 'auth_required') {
                console.log('\n🔐 需要 OAuth 认证:');
                const authStatus = conn.status;
                console.log('  - Authorization URL:', authStatus.authorizationUrl || 'N/A');
            }
        }
        catch (error) {
            console.error('❌ Connection 创建失败:');
            console.error('  - 错误类型:', error.constructor.name);
            console.error('  - 状态码:', error.status);
            console.error('  - 错误消息:', error.message);
            console.error('  - 错误详情:', JSON.stringify(error.error || {}, null, 2));
            if (error.status === 404) {
                console.error('\n💡 可能的原因:');
                console.error('  1. API Key 无效或已过期');
                console.error('  2. API Key 没有访问 Connect API 的权限');
                console.error('  3. 需要先创建 namespace');
                console.error('\n建议:');
                console.error('  1. 检查 API Key 是否正确');
                console.error('  2. 访问 https://smithery.ai/account/api-keys 确认 API Key 状态');
                console.error('  3. 尝试创建新的 API Key');
            }
        }
    }
    catch (error) {
        console.error('❌ 诊断失败:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
    }
}
diagnose().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=diagnose-smithery-connection.js.map