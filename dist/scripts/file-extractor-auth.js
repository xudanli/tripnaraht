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
const file_extractor_client_js_1 = require("../src/mcp/file-extractor-client.js");
const readline = __importStar(require("readline"));
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}
async function authenticate() {
    var _a, _b, _c;
    console.log('🔐 File Extractor MCP 认证助手\n');
    console.log('='.repeat(60));
    const client = new file_extractor_client_js_1.FileExtractorMcpClient();
    try {
        console.log('\n正在连接并启动认证流程...\n');
        try {
            await Promise.race([
                client.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 10000))
            ]);
            console.log('\n✅ 已连接！可能已有有效的认证信息。');
            console.log('认证信息位置: ~/.tripnara-mcp/file-extractor-mcp-*.json');
            console.log('\n验证认证状态...');
            const tools = await client.listTools();
            console.log(`✅ 认证有效！找到 ${((_a = tools.tools) === null || _a === void 0 ? void 0 : _a.length) || 0} 个工具`);
            await client.disconnect();
        }
        catch (error) {
            if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('Unauthorized')) || ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('认证'))) {
                console.log('\n📝 需要完成 OAuth 认证');
                console.log('\n请按照以下步骤:');
                console.log('1. 访问上面显示的认证 URL（如果已显示）');
                console.log('2. 在浏览器中完成 OAuth 授权');
                console.log('3. 授权完成后，认证信息会自动保存');
                console.log('4. 然后重新运行此脚本验证认证状态');
                console.log('\n💡 提示: 如果认证 URL 未显示，请检查网络连接');
            }
            else {
                throw error;
            }
        }
    }
    catch (error) {
        console.error('\n❌ 认证过程出错:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
        console.log('\n💡 如果问题持续，请检查:');
        console.log('   1. 网络连接是否正常');
        console.log('   2. 服务 URL 是否正确');
        console.log('   3. 是否有防火墙阻止连接');
        process.exit(1);
    }
    finally {
        rl.close();
    }
}
authenticate().catch((error) => {
    console.error('未捕获的错误:', error);
    rl.close();
    process.exit(1);
});
//# sourceMappingURL=file-extractor-auth.js.map