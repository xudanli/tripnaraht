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
async function testWithAuth() {
    var _a, _b;
    console.log('🔐 File Extractor MCP 认证测试\n');
    console.log('='.repeat(60));
    const client = new file_extractor_client_js_1.FileExtractorMcpClient();
    try {
        console.log('\n1️⃣ 尝试连接（可能需要认证）...');
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 5000));
        try {
            await Promise.race([connectPromise, timeoutPromise]);
            console.log('✅ 已连接（可能已有认证信息）');
        }
        catch (error) {
            if (error.message.includes('Unauthorized') || error.message.includes('认证')) {
                console.log('\n⚠️  需要 OAuth 认证');
                console.log('\n请按照以下步骤完成认证:');
                console.log('1. 访问上面显示的认证 URL');
                console.log('2. 完成 OAuth 授权');
                console.log('3. 认证信息会自动保存到 ~/.tripnara-mcp/');
                console.log('\n或者运行: npm run mcp:auth:file-extractor');
                const answer = await question('\n是否已完成认证？(y/n): ');
                if (answer.toLowerCase() !== 'y') {
                    console.log('\n请先完成认证，然后重新运行此脚本');
                    rl.close();
                    process.exit(0);
                }
                console.log('\n2️⃣ 重新连接...');
                await client.connect();
                console.log('✅ 连接成功！');
            }
            else {
                throw error;
            }
        }
        console.log('\n3️⃣ 列出可用工具:');
        const tools = await client.listTools();
        console.log(`✅ 找到 ${((_a = tools.tools) === null || _a === void 0 ? void 0 : _a.length) || 0} 个工具:`);
        (_b = tools.tools) === null || _b === void 0 ? void 0 : _b.forEach((tool, index) => {
            console.log(`   ${index + 1}. ${tool.name}`);
            if (tool.description) {
                console.log(`      描述: ${tool.description}`);
            }
        });
        console.log('\n4️⃣ 测试提取文件元数据:');
        const testUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
        console.log(`   测试 URL: ${testUrl}`);
        try {
            const metadata = await Promise.race([
                client.extractMetadata(testUrl),
                new Promise((_, reject) => setTimeout(() => reject(new Error('提取超时（30秒）')), 30000))
            ]);
            console.log('✅ 元数据提取成功:');
            console.log(JSON.stringify(metadata, null, 2));
        }
        catch (error) {
            console.log(`⚠️  元数据提取失败: ${error.message}`);
            console.log('   （这可能是正常的，取决于 URL 是否可访问）');
        }
        console.log('\n5️⃣ 测试提取文件内容:');
        try {
            const content = await Promise.race([
                client.extractFileContent(testUrl, { page: 1, limit: 10 }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('提取超时（30秒）')), 30000))
            ]);
            console.log('✅ 内容提取成功:');
            console.log(JSON.stringify(content, null, 2));
        }
        catch (error) {
            console.log(`⚠️  内容提取失败: ${error.message}`);
            console.log('   （这可能是正常的，取决于 URL 是否可访问）');
        }
        await client.disconnect();
        console.log('\n✅ 测试完成！');
    }
    catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
        process.exit(1);
    }
    finally {
        rl.close();
    }
}
testWithAuth().catch((error) => {
    console.error('未捕获的错误:', error);
    rl.close();
    process.exit(1);
});
//# sourceMappingURL=test-file-extractor-with-auth.js.map