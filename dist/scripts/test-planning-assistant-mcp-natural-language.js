#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/agent/planning-assistant/v2`;
const USER_ID = `test_user_${Date.now()}`;
const results = [];
let sessionId = '';
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
function printHeader(text) {
    log('\n' + '━'.repeat(80), 'blue');
    log(`  ${text}`, 'blue');
    log('━'.repeat(80), 'blue');
}
function printTest(name) {
    log(`\n📋 测试: ${name}`, 'cyan');
}
function printSuccess(message) {
    log(`✅ ${message}`, 'green');
}
function printFailure(message) {
    log(`❌ ${message}`, 'red');
}
function printInfo(message) {
    log(`ℹ️  ${message}`, 'yellow');
}
async function checkServer() {
    try {
        await axios_1.default.get(`${BASE_URL}/health`, { timeout: 2000 });
        return true;
    }
    catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return false;
        }
        try {
            await axios_1.default.get(`${BASE_URL}/`, { timeout: 2000 });
            return true;
        }
        catch {
            return false;
        }
    }
}
async function createSession() {
    printHeader('创建会话');
    printInfo('检查服务器连接...');
    const serverRunning = await checkServer();
    if (!serverRunning) {
        printFailure('健康检查失败，但将继续尝试创建会话...');
        printInfo('如果创建会话失败，请确保服务器正在运行:');
        printInfo('  npm run dev');
        printInfo('  或');
        printInfo('  npm run backend:dev');
    }
    else {
        printSuccess('服务器连接正常');
    }
    try {
        const response = await axios_1.default.post(`${API_BASE}/sessions`, {
            userId: USER_ID,
        }, { timeout: 10000 });
        const sessionId = response.data.sessionId;
        if (!sessionId) {
            throw new Error('会话ID为空');
        }
        printSuccess(`会话创建成功: ${sessionId}`);
        return sessionId;
    }
    catch (error) {
        if (error.code === 'ECONNREFUSED') {
            printFailure('无法连接到服务器，请确保服务器正在运行');
            printInfo('启动服务器: npm run dev');
        }
        else {
            printFailure(`创建会话失败: ${error.message}`);
            if (error.response) {
                console.error('响应:', JSON.stringify(error.response.data, null, 2));
            }
        }
        throw error;
    }
}
async function testEndpoint(name, message, expectedTarget, expectedField) {
    var _a, _b, _c, _d, _e;
    printTest(name);
    printInfo(`输入: "${message}"`);
    printInfo(`期望路由: ${expectedTarget}`);
    if (expectedField) {
        printInfo(`期望字段: ${expectedField}`);
    }
    try {
        const response = await axios_1.default.post(`${API_BASE}/chat`, {
            sessionId,
            userId: USER_ID,
            message,
            language: 'zh',
        });
        const data = response.data;
        const actualTarget = ((_a = data.routing) === null || _a === void 0 ? void 0 : _a.target) || 'chat';
        if (actualTarget !== expectedTarget) {
            const error = `路由目标不匹配: 期望 '${expectedTarget}', 实际 '${actualTarget}'`;
            printFailure(error);
            console.error('响应:', JSON.stringify(data, null, 2));
            return {
                name,
                passed: false,
                error,
                response: data,
            };
        }
        if (expectedField) {
            const fieldValue = expectedField.split('.').reduce((obj, key) => obj === null || obj === void 0 ? void 0 : obj[key], data);
            if (!fieldValue) {
                const error = `响应中缺少字段: ${expectedField}`;
                printFailure(error);
                console.error('响应:', JSON.stringify(data, null, 2));
                return {
                    name,
                    passed: false,
                    error,
                    response: data,
                };
            }
            if (Array.isArray(fieldValue)) {
                printInfo(`返回数据数量: ${fieldValue.length}`);
            }
        }
        if (!data.messageCN && !data.message) {
            const error = '响应中缺少 messageCN 或 message 字段';
            printFailure(error);
            return {
                name,
                passed: false,
                error,
                response: data,
            };
        }
        printSuccess('测试通过');
        printInfo(`路由目标: ${actualTarget}`);
        printInfo(`响应消息: ${data.messageCN || data.message}`);
        return {
            name,
            passed: true,
            response: data,
        };
    }
    catch (error) {
        const errorMessage = ((_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.message) || error.message;
        printFailure(`请求失败: ${errorMessage}`);
        if ((_d = error.response) === null || _d === void 0 ? void 0 : _d.data) {
            console.error('错误响应:', JSON.stringify(error.response.data, null, 2));
        }
        return {
            name,
            passed: false,
            error: errorMessage,
            response: (_e = error.response) === null || _e === void 0 ? void 0 : _e.data,
        };
    }
}
async function main() {
    log('\n╔══════════════════════════════════════════════════════════════════════════════╗', 'blue');
    log('║  Planning Assistant V2 - MCP 服务自然语言调用测试                            ║', 'blue');
    log('╚══════════════════════════════════════════════════════════════════════════════╝', 'blue');
    printInfo(`API 基础 URL: ${API_BASE}`);
    printInfo(`用户 ID: ${USER_ID}`);
    try {
        sessionId = await createSession();
    }
    catch (error) {
        log('\n❌ 无法创建会话，测试终止', 'red');
        process.exit(1);
    }
    log('\n开始测试 MCP 服务自然语言调用...', 'yellow');
    results.push(await testEndpoint('酒店搜索 (Hotel Direct API)', '推荐冰岛的酒店', 'hotel', 'hotels'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('Airbnb 搜索 (Airbnb MCP)', '推荐 Airbnb 房源', 'airbnb', 'airbnbListings'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('住宿搜索 (Hotel + Airbnb)', '推荐住宿', 'accommodation', 'hotels'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('餐厅搜索 (Restaurant Direct API)', '推荐餐厅', 'restaurant', 'restaurants'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('天气查询 (Weather Direct API)', '冰岛天气怎么样', 'weather', 'weather'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('Web 搜索 (Exa MCP)', '搜索冰岛旅游攻略', 'search', 'searchResults'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('航班搜索 (Amadeus MCP)', '搜索从北京到上海的航班', 'flight', 'flights'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('铁路查询 (Rail MCP)', '查询从巴黎到伦敦的火车', 'rail', 'railRoutes'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('翻译服务 (Translation Direct API)', '翻译一下 Hello World', 'translate', 'translation'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('货币转换 (Currency Direct API)', '100美元换人民币', 'currency', 'currencyConversion'));
    await new Promise(resolve => setTimeout(resolve, 500));
    results.push(await testEndpoint('图片搜索 (Image Direct API)', '找一些冰岛的图片', 'image', 'images'));
    printHeader('测试结果汇总');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    log(`总测试数: ${total}`);
    log(`通过: ${passed}`, 'green');
    log(`失败: ${failed}`, 'red');
    if (failed > 0) {
        log('\n失败的测试:', 'red');
        results.filter(r => !r.passed).forEach(result => {
            log(`  - ${result.name}: ${result.error}`, 'red');
        });
    }
    if (passed > 0) {
        log('\n通过的测试:', 'green');
        results.filter(r => r.passed).forEach(result => {
            log(`  ✅ ${result.name}`, 'green');
        });
    }
    if (failed === 0) {
        log('\n🎉 所有测试通过！', 'green');
        process.exit(0);
    }
    else {
        log(`\n⚠️  有 ${failed} 个测试失败`, 'red');
        process.exit(1);
    }
}
main().catch(error => {
    log(`\n❌ 测试执行失败: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=test-planning-assistant-mcp-natural-language.js.map