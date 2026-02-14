#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/file-extractor-mcp`;
const TEST_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const TEST_DOCX_URL = 'https://file-examples.com/storage/fe68c0b5c5b0c5b5b5b5b5b/2017/10/file_example_DOCX_10.docx';
const results = [];
async function testEndpoint(name, testFn) {
    console.log(`\n🧪 测试: ${name}`);
    try {
        const data = await testFn();
        console.log(`✅ 成功`);
        console.log(`响应数据:`, JSON.stringify(data, null, 2));
        results.push({ name, success: true, data });
    }
    catch (error) {
        console.log(`❌ 失败: ${error.message}`);
        if (error.response) {
            console.log(`状态码: ${error.response.status}`);
            console.log(`错误响应:`, JSON.stringify(error.response.data, null, 2));
            results.push({ name, success: false, error: `${error.message} (${error.response.status})` });
        }
        else if (error.code === 'ECONNREFUSED') {
            console.log(`⚠️  连接被拒绝，请确保服务器运行在 ${BASE_URL}`);
            results.push({ name, success: false, error: '连接被拒绝 - 服务器可能未运行' });
        }
        else {
            console.log(`错误详情:`, error);
            results.push({ name, success: false, error: error.message || String(error) });
        }
    }
}
async function main() {
    console.log('🚀 开始测试 File Extractor MCP API');
    console.log(`Base URL: ${API_BASE}\n`);
    await testEndpoint('健康检查', async () => {
        const response = await axios_1.default.get(`${API_BASE}/health`);
        if (!response.data.success) {
            throw new Error('健康检查返回失败');
        }
        return response.data.data;
    });
    await testEndpoint('列出所有工具', async () => {
        const response = await axios_1.default.get(`${API_BASE}/tools`);
        if (!response.data.success) {
            throw new Error('获取工具列表失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 PDF 元数据', async () => {
        const response = await axios_1.default.post(`${API_BASE}/extract-metadata`, {
            url: TEST_PDF_URL,
        });
        if (!response.data.success) {
            throw new Error('提取元数据失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 PDF 内容（第一页）', async () => {
        const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
            url: TEST_PDF_URL,
            page: 1,
            limit: 10,
        });
        if (!response.data.success) {
            throw new Error('提取内容失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 DOCX 元数据', async () => {
        const response = await axios_1.default.post(`${API_BASE}/extract-metadata`, {
            url: TEST_DOCX_URL,
        });
        if (!response.data.success) {
            throw new Error('提取 DOCX 元数据失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 DOCX 内容', async () => {
        const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
            url: TEST_DOCX_URL,
            limit: 100,
        });
        if (!response.data.success) {
            throw new Error('提取 DOCX 内容失败');
        }
        return response.data.data;
    });
    await testEndpoint('错误处理 - 无效 URL', async () => {
        try {
            const response = await axios_1.default.post(`${API_BASE}/extract-metadata`, {
                url: 'https://invalid-url-that-does-not-exist.com/file.pdf',
            });
            if (!response.data.success) {
                return { error: response.data.error };
            }
            return response.data;
        }
        catch (error) {
            if (error.response) {
                return { error: error.response.data };
            }
            throw error;
        }
    });
    await testEndpoint('错误处理 - 缺少 URL 参数', async () => {
        try {
            const response = await axios_1.default.post(`${API_BASE}/extract-metadata`, {});
            if (!response.data.success) {
                return { error: response.data.error };
            }
            return response.data;
        }
        catch (error) {
            if (error.response) {
                return { error: error.response.data };
            }
            throw error;
        }
    });
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`总测试数: ${results.length}`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log('\n详细结果:');
    results.forEach((result, index) => {
        const icon = result.success ? '✅' : '❌';
        console.log(`${index + 1}. ${icon} ${result.name}`);
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        }
    });
    process.exit(failCount > 0 ? 1 : 0);
}
main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-file-extractor-mcp-api.js.map