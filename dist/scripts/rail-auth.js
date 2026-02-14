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
const rail_client_1 = require("../src/mcp/rail-client");
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
async function authenticateRail() {
    var _a, _b;
    console.log('🚂 Rail MCP 认证助手\n');
    const client = (0, rail_client_1.getRailClient)();
    try {
        console.log('正在连接到 Rail MCP 服务器...\n');
        await client.connect();
        console.log('✅ 认证成功！\n');
    }
    catch (error) {
        if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Unauthorized')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('认证'))) {
            console.log('\n⚠️  需要完成 OAuth 认证流程\n');
            console.log('请按照以下步骤操作：');
            console.log('1. 访问上面显示的认证 URL');
            console.log('2. 完成认证流程');
            console.log('3. 复制回调 URL（包含 code 参数）');
            console.log('4. 粘贴到下方\n');
            const callbackUrl = await question('请输入回调 URL: ');
            if (callbackUrl.trim()) {
                try {
                    console.log('\n正在完成认证...');
                    await client.disconnect();
                    await client.connect();
                    console.log('✅ 认证成功！');
                }
                catch (retryError) {
                    console.error('\n❌ 认证失败:', retryError.message);
                    console.log('\n提示:');
                    console.log('- 确保回调 URL 完整且包含 code 参数');
                    console.log('- 检查网络连接');
                    console.log('- 如果问题持续，请清除认证信息后重试:');
                    console.log('  rm ~/.tripnara-mcp/rail-*.json');
                    process.exit(1);
                }
            }
            else {
                console.log('\n⚠️  未提供回调 URL，跳过认证');
            }
        }
        else {
            console.error('\n❌ 连接失败:', error.message);
            if (error.stack) {
                console.error('\n堆栈跟踪:', error.stack);
            }
            process.exit(1);
        }
    }
    finally {
        await client.disconnect();
        rl.close();
    }
}
const args = process.argv.slice(2);
if (args.includes('--clear')) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const configDir = path.join(os.homedir(), '.tripnara-mcp');
    const files = ['rail-tokens.json', 'rail-client-info.json', 'rail-code-verifier.txt'];
    console.log('🗑️  清除 Rail MCP 认证信息...\n');
    files.forEach((file) => {
        const filePath = path.join(configDir, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`  ✓ 已删除: ${file}`);
        }
    });
    console.log('\n✅ 认证信息已清除');
    console.log('现在可以重新运行认证流程: npm run mcp:auth:rail\n');
    process.exit(0);
}
authenticateRail().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=rail-auth.js.map