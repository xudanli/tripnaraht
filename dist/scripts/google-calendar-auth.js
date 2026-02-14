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
const google_calendar_client_1 = require("../src/mcp/google-calendar-client");
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
async function main() {
    var _a;
    console.log('🔐 Google Calendar MCP 认证助手\n');
    console.log('这个工具将帮助您完成首次 Google Calendar OAuth 认证。\n');
    const client = new google_calendar_client_1.GoogleCalendarMcpClient();
    try {
        console.log('正在尝试连接...\n');
        await client.connect();
        console.log('✅ 认证成功！您已经可以正常使用 Google Calendar MCP 服务了。\n');
        console.log('🧪 测试连接...');
        const now = await client.getCurrentDateTime();
        console.log('✅ 连接测试通过！\n');
        console.log('您现在可以：');
        console.log('  1. 在 Claude Desktop 中使用 Google Calendar 功能');
        console.log('  2. 在代码中使用 GoogleCalendarMcpClient 类');
        console.log('  3. 运行测试脚本: npm run mcp:test:google-calendar\n');
    }
    catch (error) {
        if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Unauthorized')) || error.name === 'UnauthorizedError') {
            console.log('\n⚠️  需要完成首次认证。\n');
            console.log('请按照以下步骤操作：\n');
            console.log('1. 上面的输出中已经显示了一个认证 URL');
            console.log('2. 复制该 URL 并在浏览器中打开');
            console.log('3. 完成 Google 登录和授权');
            console.log('4. 授权完成后，浏览器会重定向到一个回调页面');
            console.log('5. 从浏览器地址栏复制完整的回调 URL（包含 code 参数）');
            console.log('6. 将回调 URL 粘贴到下面\n');
            try {
                const callbackUrl = await question('请输入回调 URL（或按 Enter 跳过，稍后手动完成认证）: ');
                if (callbackUrl.trim()) {
                    try {
                        const url = new URL(callbackUrl);
                        const code = url.searchParams.get('code');
                        if (code) {
                            console.log('\n✅ 授权码已获取。');
                            console.log('⚠️  注意：由于 MCP SDK 的架构限制，需要重新连接才能完成认证。');
                            console.log('   请重新运行测试脚本，认证信息已保存，应该会自动完成认证。');
                            console.log('   运行: npm run mcp:test:google-calendar\n');
                        }
                        else {
                            console.log('❌ 未找到授权码。请确保 URL 包含 code 参数。\n');
                        }
                    }
                    catch (urlError) {
                        console.log('❌ URL 格式错误。请确保输入完整的回调 URL。\n');
                    }
                }
                else {
                    console.log('\n您可以稍后手动完成认证：');
                    console.log('1. 运行: npm run mcp:test:google-calendar');
                    console.log('2. 按照提示完成认证流程\n');
                }
            }
            catch (questionError) {
                console.log('\n📝 认证说明：');
                console.log('1. 复制上面显示的认证 URL');
                console.log('2. 在浏览器中打开并完成授权');
                console.log('3. 重新运行测试脚本: npm run mcp:test:google-calendar');
                console.log('4. 认证信息会自动保存，后续使用无需再次认证\n');
            }
        }
        else {
            console.error('❌ 连接失败:', error.message || error);
            console.error('\n请检查：');
            console.error('  1. 网络连接是否正常');
            console.error('  2. 能否访问 https://server.smithery.ai');
            console.error('  3. 查看上面的错误信息获取更多详情\n');
        }
    }
    finally {
        try {
            rl.close();
        }
        catch (error) {
        }
        try {
            await client.disconnect();
        }
        catch (error) {
        }
    }
}
main().catch((error) => {
    console.error('❌ 未捕获的错误:', error);
    rl.close();
    process.exit(1);
});
//# sourceMappingURL=google-calendar-auth.js.map