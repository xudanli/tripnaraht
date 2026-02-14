#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/agent/planning-assistant/v2`;
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};
function printSuccess(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}
function printError(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
}
function printInfo(message) {
    console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}
function printWarning(message) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}
function printSection(title) {
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}
const testCases = [
    {
        name: 'Airbnb 房源详情查询',
        message: '这个房源怎么样？房源 ID 是 1573970428683000922',
        expectedService: 'airbnb',
        expectedTool: 'airbnb.listingDetails',
    },
    {
        name: '天气预报查询',
        message: '冰岛下周的天气怎么样？',
        expectedService: 'weather',
        expectedTool: 'weather.getWeatherByDatetimeRange',
    },
    {
        name: 'Web 搜索',
        message: '搜索冰岛旅游攻略',
        expectedService: 'exa',
        expectedTool: 'exa.webSearch',
    },
    {
        name: 'Exa 高级搜索',
        message: '深度搜索冰岛旅游信息',
        expectedService: 'exa',
        expectedTool: 'exa.webSearchAdvanced',
    },
    {
        name: 'Exa 深度搜索',
        message: '深度研究冰岛',
        expectedService: 'exa',
        expectedTool: 'exa.deepSearch',
    },
    {
        name: 'Google Calendar 创建事件',
        message: '创建一个日历事件：明天下午3点开会',
        expectedService: 'google-calendar',
        expectedTool: 'google-calendar.createEvent',
        skip: true,
    },
    {
        name: 'Google Calendar 快速添加',
        message: '快速添加到日历：2月15日参观博物馆',
        expectedService: 'google-calendar',
        expectedTool: 'google-calendar.quickAdd',
        skip: true,
    },
    {
        name: 'Google Calendar 查找空闲时间',
        message: '查找下周的空闲时间',
        expectedService: 'google-calendar',
        expectedTool: 'google-calendar.findFreeSlots',
        skip: true,
    },
];
async function checkServerHealth() {
    try {
        const response = await axios_1.default.get(`${BASE_URL}/health`, { timeout: 5000 });
        return response.status === 200;
    }
    catch (error) {
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
    try {
        const response = await axios_1.default.post(`${API_BASE}/sessions`, {}, { timeout: 10000 });
        return response.data.sessionId;
    }
    catch (error) {
        throw new Error(`创建会话失败: ${error.message}`);
    }
}
async function testChat(sessionId, message) {
    try {
        const response = await axios_1.default.post(`${API_BASE}/chat`, {
            sessionId,
            message,
            language: 'zh',
        }, { timeout: 30000 });
        return response.data;
    }
    catch (error) {
        throw new Error(`聊天请求失败: ${error.message}`);
    }
}
async function runTest(testCase, sessionId) {
    printInfo(`测试: ${testCase.name}`);
    printInfo(`消息: "${testCase.message}"`);
    try {
        const startTime = Date.now();
        const response = await testChat(sessionId, testCase.message);
        const duration = Date.now() - startTime;
        const routing = response.routing;
        if (!routing) {
            printWarning('响应中没有路由信息，可能使用了默认路由');
            printInfo(`响应内容: ${JSON.stringify(response).substring(0, 200)}...`);
            if (response.messageCN || response.replyCN) {
                printSuccess(`响应: ${response.messageCN || response.replyCN}`);
                return true;
            }
            return false;
        }
        const params = routing.params || {};
        const toolName = params.toolName;
        if (testCase.expectedTool && toolName !== testCase.expectedTool) {
            printWarning(`工具选择不匹配: 期望 ${testCase.expectedTool}, 实际 ${toolName || 'none'}`);
        }
        else if (testCase.expectedTool) {
            printSuccess(`工具选择正确: ${toolName}`);
        }
        if (testCase.expectedService && routing.target !== testCase.expectedService) {
            printWarning(`服务路由不匹配: 期望 ${testCase.expectedService}, 实际 ${routing.target}`);
        }
        else if (testCase.expectedService) {
            printSuccess(`服务路由正确: ${routing.target}`);
        }
        if (response.messageCN || response.replyCN) {
            printSuccess(`响应: ${response.messageCN || response.replyCN}`);
        }
        printInfo(`耗时: ${duration}ms`);
        printSuccess(`测试通过: ${testCase.name}\n`);
        return true;
    }
    catch (error) {
        printError(`测试失败: ${error.message}`);
        console.error(error);
        return false;
    }
}
async function main() {
    printSection('MCP 工具融合架构测试');
    printInfo('检查服务器健康状态...');
    const serverRunning = await checkServerHealth();
    if (!serverRunning) {
        printWarning('服务器健康检查失败，但将继续尝试...');
        printInfo('如果测试失败，请确保服务器正在运行:');
        printInfo('  npm run dev');
        printInfo('  或');
        printInfo('  npm run backend:dev');
    }
    else {
        printSuccess('服务器连接正常');
    }
    printInfo('创建测试会话...');
    let sessionId;
    try {
        sessionId = await createSession();
        printSuccess(`会话已创建: ${sessionId}`);
    }
    catch (error) {
        printError(`创建会话失败: ${error.message}`);
        process.exit(1);
    }
    const results = [];
    for (const testCase of testCases) {
        if (testCase.skip) {
            printWarning(`跳过测试: ${testCase.name} (需要认证)`);
            continue;
        }
        const passed = await runTest(testCase, sessionId);
        results.push({ testCase, passed });
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    printSection('测试总结');
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const skippedCount = testCases.filter(tc => tc.skip).length;
    printInfo(`总测试数: ${totalCount}`);
    printSuccess(`通过: ${passedCount}`);
    printError(`失败: ${totalCount - passedCount}`);
    printWarning(`跳过: ${skippedCount}`);
    if (passedCount === totalCount) {
        printSuccess('\n🎉 所有测试通过！');
        process.exit(0);
    }
    else {
        printError('\n⚠️  部分测试失败');
        process.exit(1);
    }
}
main().catch(error => {
    printError(`测试脚本执行失败: ${error.message}`);
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=test-mcp-tools-fusion.js.map