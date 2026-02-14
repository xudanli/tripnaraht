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
const google_maps_client_1 = require("../src/mcp/google-maps-client");
const readline = __importStar(require("readline"));
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function question(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}
async function main() {
    var _a, _b, _c, _d, _e;
    console.log('🔐 Google Maps MCP 认证助手\n');
    console.log('此脚本将帮助您完成 Google Maps MCP 服务的 OAuth 认证。\n');
    const args = process.argv.slice(2);
    if (args.includes('--clear') || args.includes('-c')) {
        console.log('🧹 清理旧的认证信息...\n');
        const client = (0, google_maps_client_1.getGoogleMapsClient)();
        client.clearAuth();
        console.log('\n✅ 认证信息已清理，可以开始新的认证流程。\n');
    }
    const client = (0, google_maps_client_1.getGoogleMapsClient)();
    try {
        console.log('正在连接到 Google Maps MCP 服务器...\n');
        await client.connect();
        console.log('\n✅ 认证成功！Google Maps MCP 客户端已连接。');
        console.log('认证信息已保存，后续使用无需重复认证。\n');
        console.log('测试列出可用工具...');
        const tools = await client.listTools();
        console.log(`✅ 找到 ${((_a = tools.tools) === null || _a === void 0 ? void 0 : _a.length) || 0} 个可用工具\n`);
        if (tools.tools && tools.tools.length > 0) {
            console.log('可用工具列表:');
            tools.tools.forEach((tool, index) => {
                console.log(`  ${index + 1}. ${tool.name}`);
                if (tool.description) {
                    console.log(`     ${tool.description}`);
                }
            });
        }
    }
    catch (error) {
        if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('Unauthorized')) ||
            ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('认证')) ||
            ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('Session not found')) ||
            ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('expired'))) {
            console.error('\n❌ 认证失败或会话已过期。');
            console.error('\n请按照以下步骤完成认证:');
            console.error('1. 复制上面显示的认证 URL');
            console.error('2. 在浏览器中打开该 URL');
            console.error('3. 完成 Google OAuth 授权');
            console.error('4. 授权完成后，重新运行此脚本\n');
            console.error('💡 提示: 如果持续失败，可以尝试清理旧的认证信息:');
            console.error('   npm run mcp:auth:google-maps -- --clear\n');
        }
        else {
            console.error('\n❌ 错误:', error.message);
            if (error.stack) {
                console.error('堆栈:', error.stack);
            }
        }
        process.exit(1);
    }
    finally {
        try {
            await client.disconnect();
        }
        catch (e) {
        }
        rl.close();
    }
}
main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=google-maps-auth.js.map