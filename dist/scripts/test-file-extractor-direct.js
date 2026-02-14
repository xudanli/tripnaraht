#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/file-extractor-direct`;
const TEST_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const TEST_DOCX_URL = 'https://www.learningcontainer.com/wp-content/uploads/2019/09/sample-docx-file.docx';
const TEST_XLSX_URL = 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-xlsx-file.xlsx';
const TEST_CSV_URL = 'https://raw.githubusercontent.com/datasets/covid-19/main/data/countries-aggregated.csv';
const results = [];
async function testEndpoint(name, testFn) {
    console.log(`\n🧪 测试: ${name}`);
    try {
        const data = await testFn();
        console.log(`✅ 成功`);
        if (data && typeof data === 'object') {
            console.log(`响应数据:`, JSON.stringify(data, null, 2).substring(0, 500));
        }
        else {
            console.log(`响应数据:`, String(data).substring(0, 200));
        }
        results.push({ name, success: true, data });
    }
    catch (error) {
        console.log(`❌ 失败: ${error.message}`);
        if (error.response) {
            console.log(`状态码: ${error.response.status}`);
            console.log(`错误响应:`, JSON.stringify(error.response.data, null, 2).substring(0, 300));
            results.push({ name, success: false, error: `${error.message} (${error.response.status})` });
        }
        else if (error.code === 'ECONNREFUSED') {
            console.log(`⚠️  连接被拒绝，请确保服务器运行在 ${BASE_URL}`);
            results.push({ name, success: false, error: '连接被拒绝 - 服务器可能未运行' });
        }
        else {
            results.push({ name, success: false, error: error.message || String(error) });
        }
    }
}
async function main() {
    console.log('🚀 开始测试 File Extractor Direct API');
    console.log(`Base URL: ${API_BASE}`);
    console.log('✨ 无需认证，直接使用！\n');
    await testEndpoint('健康检查', async () => {
        const response = await axios_1.default.get(`${API_BASE}/health`);
        if (!response.data.success) {
            throw new Error('健康检查返回失败');
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
    await testEndpoint('提取 PDF 内容', async () => {
        const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
            url: TEST_PDF_URL,
            page: 1,
            limit: 100,
        });
        if (!response.data.success) {
            throw new Error('提取内容失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 DOCX 元数据', async () => {
        var _a, _b, _c, _d;
        const response = await axios_1.default.post(`${API_BASE}/extract-metadata`, {
            url: TEST_DOCX_URL,
        });
        if (!response.data.success) {
            if (((_b = (_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('403')) || ((_d = (_c = response.data.error) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.includes('404'))) {
                console.log('   ⚠️  测试 URL 不可访问（这是正常的，不是代码问题）');
            }
            throw new Error('提取 DOCX 元数据失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 DOCX 内容', async () => {
        var _a, _b, _c, _d;
        const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
            url: TEST_DOCX_URL,
            limit: 200,
        });
        if (!response.data.success) {
            if (((_b = (_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('403')) || ((_d = (_c = response.data.error) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.includes('404'))) {
                console.log('   ⚠️  测试 URL 不可访问（这是正常的，不是代码问题）');
            }
            throw new Error('提取 DOCX 内容失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 XLSX 元数据', async () => {
        var _a, _b, _c, _d;
        const response = await axios_1.default.post(`${API_BASE}/extract-metadata`, {
            url: TEST_XLSX_URL,
        });
        if (!response.data.success) {
            if (((_b = (_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('403')) || ((_d = (_c = response.data.error) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.includes('404'))) {
                console.log('   ⚠️  测试 URL 不可访问（这是正常的，不是代码问题）');
            }
            throw new Error('提取 XLSX 元数据失败');
        }
        return response.data.data;
    });
    await testEndpoint('提取 XLSX 内容', async () => {
        var _a, _b, _c, _d;
        const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
            url: TEST_XLSX_URL,
            sheet: 'Sheet1',
            limit: 10,
        });
        if (!response.data.success) {
            if (((_b = (_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('403')) || ((_d = (_c = response.data.error) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.includes('404'))) {
                console.log('   ⚠️  测试 URL 不可访问（这是正常的，不是代码问题）');
            }
            throw new Error('提取 XLSX 内容失败');
        }
        return response.data.data;
    });
    await testEndpoint('搜索 Excel 内容', async () => {
        var _a, _b, _c, _d;
        const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
            url: TEST_XLSX_URL,
            search: 'test',
            caseSensitive: false,
        });
        if (!response.data.success) {
            if (((_b = (_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('403')) || ((_d = (_c = response.data.error) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.includes('404'))) {
                console.log('   ⚠️  测试 URL 不可访问（这是正常的，不是代码问题）');
            }
            throw new Error('搜索失败');
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
    await testEndpoint('错误处理 - 不支持的文件格式', async () => {
        try {
            const response = await axios_1.default.post(`${API_BASE}/extract-content`, {
                url: 'https://example.com/file.unknown',
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
//# sourceMappingURL=test-file-extractor-direct.js.map