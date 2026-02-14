#!/usr/bin/env tsx
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
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const API_BASE_URL = process.env.API_BASE_URL || process.argv[2] || 'http://localhost:3000';
const TEST_USER_ID = process.env.TEST_USER_ID || process.argv[3] || `test-user-${Date.now()}`;
function httpRequest(method, url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };
        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedBody = JSON.parse(body);
                    resolve({
                        statusCode: res.statusCode || 200,
                        body: parsedBody,
                    });
                }
                catch (e) {
                    resolve({
                        statusCode: res.statusCode || 200,
                        body: body,
                    });
                }
            });
        });
        req.on('error', (error) => {
            const errorMsg = error.message || error.code || '未知错误';
            if (error.code === 'ECONNREFUSED') {
                reject(new Error(`连接被拒绝: 请确保服务器运行在 ${url}`));
            }
            else if (error.code === 'ENOTFOUND') {
                reject(new Error(`无法解析主机名: ${urlObj.hostname}`));
            }
            else {
                reject(new Error(`连接失败: ${errorMsg}`));
            }
        });
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('请求超时（60秒）'));
        });
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}
async function runTest(name, testFn) {
    const startTime = Date.now();
    try {
        const result = await testFn();
        const duration = Date.now() - startTime;
        return {
            name,
            success: true,
            data: result,
            duration,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        return {
            name,
            success: false,
            error: error.message || String(error),
            duration,
        };
    }
}
async function testCreateAnonymousSession() {
    const response = await httpRequest('POST', `${API_BASE_URL}/api/agent/planning-assistant/sessions`, {});
    if (response.statusCode !== 201) {
        throw new Error(`期望状态码 201，实际: ${response.statusCode}`);
    }
    if (!response.body.sessionId) {
        throw new Error('响应中缺少 sessionId');
    }
    return response.body;
}
async function testCreateUserSession() {
    const response = await httpRequest('POST', `${API_BASE_URL}/api/agent/planning-assistant/sessions`, { userId: TEST_USER_ID });
    if (response.statusCode !== 201) {
        throw new Error(`期望状态码 201，实际: ${response.statusCode}`);
    }
    if (!response.body.sessionId) {
        throw new Error('响应中缺少 sessionId');
    }
    return response.body;
}
async function testChat(sessionId) {
    const response = await httpRequest('POST', `${API_BASE_URL}/api/agent/planning-assistant/chat`, {
        sessionId,
        userId: TEST_USER_ID,
        message: '我想去冰岛旅行，有什么推荐吗？',
        language: 'zh',
    });
    if (response.statusCode !== 200) {
        throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
    }
    if (!response.body.message && !response.body.messageCN) {
        throw new Error('响应中缺少 message 或 messageCN');
    }
    if (!response.body.phase) {
        throw new Error('响应中缺少 phase');
    }
    return response.body;
}
async function testGetSessionState(sessionId) {
    const response = await httpRequest('GET', `${API_BASE_URL}/api/agent/planning-assistant/sessions/${sessionId}`);
    if (response.statusCode !== 200) {
        throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
    }
    if (!response.body.sessionId) {
        throw new Error('响应中缺少 sessionId');
    }
    if (!response.body.phase) {
        throw new Error('响应中缺少 phase');
    }
    return response.body;
}
async function testQuickRecommend() {
    const params = new URLSearchParams({
        budget: '20000',
        travelersCount: '2',
        duration_days: '7',
        travel_style: 'adventure',
        language: 'zh',
    });
    const response = await httpRequest('GET', `${API_BASE_URL}/api/agent/planning-assistant/quick-recommend?${params.toString()}`);
    if (response.statusCode !== 200) {
        throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
    }
    if (!response.body.sessionId) {
        throw new Error('响应中缺少 sessionId');
    }
    return response.body;
}
async function testGetUserPreferences() {
    const response = await httpRequest('GET', `${API_BASE_URL}/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences`);
    if (response.statusCode !== 200) {
        throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
    }
    return response.body;
}
async function testClearUserPreferences() {
    const response = await httpRequest('POST', `${API_BASE_URL}/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences/clear`, {});
    if (response.statusCode !== 200) {
        throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
    }
    if (response.body.success !== true) {
        throw new Error('清除偏好失败');
    }
    return response.body;
}
async function main() {
    console.log('🚀 开始测试规划助手智能体接口...');
    console.log(`📍 API地址: ${API_BASE_URL}`);
    console.log(`👤 测试用户ID: ${TEST_USER_ID}`);
    console.log('');
    const results = [];
    let sessionId = null;
    console.log('📋 测试1: 创建匿名会话');
    const test1 = await runTest('创建匿名会话', testCreateAnonymousSession);
    results.push(test1);
    if (test1.success) {
        console.log(`  ✅ 成功 - 会话ID: ${test1.data.sessionId}`);
        sessionId = test1.data.sessionId;
    }
    else {
        console.log(`  ❌ 失败: ${test1.error}`);
    }
    console.log('');
    console.log('📋 测试2: 创建用户会话');
    const test2 = await runTest('创建用户会话', testCreateUserSession);
    results.push(test2);
    if (test2.success) {
        console.log(`  ✅ 成功 - 会话ID: ${test2.data.sessionId}`);
        if (!sessionId) {
            sessionId = test2.data.sessionId;
        }
    }
    else {
        console.log(`  ❌ 失败: ${test2.error}`);
    }
    console.log('');
    if (sessionId) {
        console.log('📋 测试3: 发送消息进行对话');
        const test3 = await runTest('发送消息进行对话', () => testChat(sessionId));
        results.push(test3);
        if (test3.success) {
            console.log(`  ✅ 成功`);
            console.log(`  - 阶段: ${test3.data.phase}`);
            console.log(`  - 回复: ${test3.data.messageCN || test3.data.message}`);
            if (test3.data.recommendations && test3.data.recommendations.length > 0) {
                console.log(`  - 推荐数量: ${test3.data.recommendations.length}`);
            }
            if (test3.data.planCandidates && test3.data.planCandidates.length > 0) {
                console.log(`  - 方案数量: ${test3.data.planCandidates.length}`);
            }
        }
        else {
            console.log(`  ❌ 失败: ${test3.error}`);
        }
        console.log('');
    }
    else {
        console.log('⚠️  跳过测试3（没有可用的会话ID）');
        console.log('');
    }
    if (sessionId) {
        console.log('📋 测试4: 获取会话状态');
        const test4 = await runTest('获取会话状态', () => testGetSessionState(sessionId));
        results.push(test4);
        if (test4.success) {
            console.log(`  ✅ 成功`);
            console.log(`  - 会话ID: ${test4.data.sessionId}`);
            console.log(`  - 阶段: ${test4.data.phase}`);
            console.log(`  - 消息数: ${test4.data.messageCount || 0}`);
            if (test4.data.recommendations) {
                console.log(`  - 推荐数量: ${test4.data.recommendations.length || 0}`);
            }
        }
        else {
            console.log(`  ❌ 失败: ${test4.error}`);
        }
        console.log('');
    }
    else {
        console.log('⚠️  跳过测试4（没有可用的会话ID）');
        console.log('');
    }
    console.log('📋 测试5: 快速推荐（无需会话）');
    const test5 = await runTest('快速推荐', testQuickRecommend);
    results.push(test5);
    if (test5.success) {
        console.log(`  ✅ 成功`);
        console.log(`  - 会话ID: ${test5.data.sessionId}`);
        if (test5.data.recommendations && test5.data.recommendations.length > 0) {
            console.log(`  - 推荐数量: ${test5.data.recommendations.length}`);
            test5.data.recommendations.slice(0, 3).forEach((rec, idx) => {
                console.log(`    ${idx + 1}. ${rec.nameCN || rec.name} (${rec.countryCode})`);
            });
        }
    }
    else {
        console.log(`  ❌ 失败: ${test5.error}`);
    }
    console.log('');
    console.log('📋 测试6: 获取用户偏好摘要');
    const test6 = await runTest('获取用户偏好摘要', testGetUserPreferences);
    results.push(test6);
    if (test6.success) {
        console.log(`  ✅ 成功`);
        if (test6.data.topPreferences && test6.data.topPreferences.length > 0) {
            console.log(`  - 偏好数量: ${test6.data.topPreferences.length}`);
            test6.data.topPreferences.slice(0, 5).forEach((pref, idx) => {
                console.log(`    ${idx + 1}. ${pref.category}: ${pref.value} (置信度: ${pref.confidence})`);
            });
        }
        else {
            console.log(`  - 暂无偏好数据（这是正常的，如果用户还没有使用过规划助手）`);
        }
    }
    else {
        console.log(`  ❌ 失败: ${test6.error}`);
    }
    console.log('');
    console.log('📋 测试7: 清除用户偏好');
    const test7 = await runTest('清除用户偏好', testClearUserPreferences);
    results.push(test7);
    if (test7.success) {
        console.log(`  ✅ 成功`);
    }
    else {
        console.log(`  ❌ 失败: ${test7.error}`);
    }
    console.log('');
    console.log('='.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(60));
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${index + 1}. ${status} ${result.name}${duration}`);
        if (!result.success && result.error) {
            console.log(`   错误: ${result.error}`);
        }
    });
    console.log('');
    console.log(`总计: ${results.length} 个测试`);
    console.log(`通过: ${passed} 个 ✅`);
    console.log(`失败: ${failed} 个 ❌`);
    console.log(`总耗时: ${totalDuration}ms`);
    console.log('');
    if (failed > 0) {
        process.exit(1);
    }
}
main().catch((error) => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-planning-assistant-api.js.map