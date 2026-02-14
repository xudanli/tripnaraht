#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${BASE_URL}/api/browserbase-mcp`;
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}
const results = [];
async function testEndpoint(name, method, endpoint, data) {
    var _a, _b, _c;
    try {
        log(`\n🧪 测试: ${name}`, 'cyan');
        log(`   ${method} ${endpoint}`, 'blue');
        const config = {
            method,
            url: `${API_PREFIX}${endpoint}`,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (data) {
            config.data = data;
            log(`   请求体: ${JSON.stringify(data, null, 2)}`, 'blue');
        }
        const response = await (0, axios_1.default)(config);
        if (response.data.success) {
            log(`   ✅ 成功`, 'green');
            if (response.data.data) {
                log(`   响应: ${JSON.stringify(response.data.data, null, 2).substring(0, 200)}...`, 'green');
            }
            return { name, success: true, data: response.data.data };
        }
        else {
            log(`   ❌ 失败: ${((_a = response.data.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error'}`, 'red');
            return { name, success: false, error: (_b = response.data.error) === null || _b === void 0 ? void 0 : _b.message };
        }
    }
    catch (error) {
        const errorMessage = error.message || error.toString() || 'Unknown error';
        log(`   ❌ 错误: ${errorMessage}`, 'red');
        if ((_c = error.response) === null || _c === void 0 ? void 0 : _c.data) {
            log(`   响应: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
        }
        if (error.stack) {
            log(`   堆栈: ${error.stack.substring(0, 200)}...`, 'red');
        }
        return { name, success: false, error: errorMessage };
    }
}
async function main() {
    var _a;
    log('🚀 开始测试 Browserbase MCP API', 'cyan');
    log(`📍 Base URL: ${BASE_URL}`, 'blue');
    results.push(await testEndpoint('健康检查', 'GET', '/health'));
    results.push(await testEndpoint('列出工具', 'GET', '/tools'));
    const createSessionResult = await testEndpoint('创建会话', 'POST', '/session/create', {
        url: 'https://example.com',
        viewport: {
            width: 1920,
            height: 1080,
        },
    });
    let sessionId;
    if (createSessionResult.success && ((_a = createSessionResult.data) === null || _a === void 0 ? void 0 : _a.sessionId)) {
        sessionId = createSessionResult.data.sessionId;
        log(`\n📝 获取到会话 ID: ${sessionId}`, 'yellow');
        results.push(await testEndpoint('导航到 URL', 'POST', '/navigate', {
            sessionId,
            url: 'https://example.com',
            waitUntil: 'load',
        }));
        results.push(await testEndpoint('截图', 'POST', '/screenshot', {
            sessionId,
            fullPage: false,
            quality: 90,
        }));
        results.push(await testEndpoint('执行 JavaScript', 'POST', '/evaluate', {
            sessionId,
            script: 'document.title',
        }));
    }
    else {
        log('\n⚠️  无法创建会话，跳过后续测试', 'yellow');
    }
    results.push(await testEndpoint('无效参数测试', 'POST', '/navigate', {
        sessionId: 'invalid-session',
    }));
    log('\n' + '='.repeat(60), 'cyan');
    log('📊 测试结果汇总', 'cyan');
    log('='.repeat(60), 'cyan');
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    results.forEach(result => {
        if (result.success) {
            log(`✅ ${result.name}`, 'green');
        }
        else {
            log(`❌ ${result.name}: ${result.error}`, 'red');
        }
    });
    log('\n' + '='.repeat(60), 'cyan');
    log(`总计: ${results.length} 个测试`, 'cyan');
    log(`成功: ${successCount}`, 'green');
    log(`失败: ${failCount}`, failCount > 0 ? 'red' : 'green');
    log('='.repeat(60), 'cyan');
    process.exit(failCount > 0 ? 1 : 0);
}
main().catch(error => {
    log(`\n❌ 测试脚本执行失败: ${error.message}`, 'red');
    if (error.stack) {
        log(error.stack, 'red');
    }
    process.exit(1);
});
//# sourceMappingURL=test-browserbase-mcp-api.js.map