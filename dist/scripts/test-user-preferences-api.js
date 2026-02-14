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
const TEST_TOKEN = process.env.TEST_TOKEN || process.argv[4] || '';
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
            reject(new Error(`连接失败: ${error.message}`));
        });
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('请求超时（30秒）'));
        });
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}
async function runTest(name, method, endpoint, data, requireAuth = false) {
    var _a, _b;
    const startTime = Date.now();
    try {
        console.log(`\n📋 测试: ${name}`);
        console.log(`   方法: ${method} ${endpoint}`);
        const headers = {};
        if (TEST_TOKEN) {
            headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
        }
        else if (requireAuth) {
            console.log(`   ⚠️  警告: 此接口需要认证，但未提供TOKEN`);
            console.log(`   💡 提示: 设置环境变量 TEST_TOKEN 或作为参数传入`);
        }
        if (data) {
            console.log(`   请求体: ${JSON.stringify(data, null, 2)}`);
        }
        const url = `${API_BASE_URL}${endpoint}`;
        const { statusCode, body } = await httpRequest(method, url, data, headers);
        const duration = Date.now() - startTime;
        const isError = statusCode >= 400 || (body && body.success === false);
        if (isError) {
            const errorMsg = ((_a = body === null || body === void 0 ? void 0 : body.error) === null || _a === void 0 ? void 0 : _a.message) || (body === null || body === void 0 ? void 0 : body.message) || '请求失败';
            const errorCode = ((_b = body === null || body === void 0 ? void 0 : body.error) === null || _b === void 0 ? void 0 : _b.code) || (body === null || body === void 0 ? void 0 : body.statusCode) || statusCode;
            console.log(`   ❌ 失败: HTTP ${statusCode}`);
            console.log(`   错误码: ${errorCode}`);
            console.log(`   错误信息: ${errorMsg}`);
            console.log(`   完整响应: ${JSON.stringify(body, null, 2)}`);
            return {
                name,
                success: false,
                error: `HTTP ${statusCode} - ${errorCode}: ${errorMsg}`,
                duration,
            };
        }
        console.log(`   ✅ 成功: HTTP ${statusCode} (${duration}ms)`);
        console.log(`   响应: ${JSON.stringify(body, null, 2)}`);
        return {
            name,
            success: true,
            data: body,
            duration,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error.message || error.toString();
        console.log(`   ❌ 异常: ${errorMsg}`);
        if (error.code === 'ECONNREFUSED') {
            console.log(`   💡 提示: 服务器连接被拒绝，请确认服务器是否在运行`);
        }
        return {
            name,
            success: false,
            error: errorMsg,
            duration,
        };
    }
}
async function runTests() {
    console.log('🚀 开始测试用户偏好接口...\n');
    console.log(`API Base URL: ${API_BASE_URL}`);
    console.log(`Test User ID: ${TEST_USER_ID}`);
    console.log(`Token: ${TEST_TOKEN ? '已设置' : '未设置（部分接口可能需要）'}`);
    console.log('='.repeat(60));
    const results = [];
    results.push(await runTest('获取用户偏好画像', 'GET', '/api/users/profile', undefined, true));
    const updateData = {
        preferences: {
            preferredAttractionTypes: ['ATTRACTION', 'NATURE', 'CULTURE'],
            dietaryRestrictions: ['VEGETARIAN'],
            preferOffbeatAttractions: true,
            travelPreferences: {
                pace: 'MODERATE',
                budget: 'MEDIUM',
                accommodation: 'COMFORTABLE',
            },
            nationality: 'CN',
            residencyCountry: 'CN',
            tags: ['solo', 'adventure'],
            other: {
                accessibility: true,
                petFriendly: false,
            },
        },
    };
    results.push(await runTest('更新用户偏好画像', 'PUT', '/api/users/profile', updateData, true));
    results.push(await runTest('验证更新后的用户偏好画像', 'GET', '/api/users/profile', undefined, true));
    results.push(await runTest('获取用户偏好摘要（规划助手）', 'GET', `/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences`, undefined, false));
    const partialUpdateData = {
        preferences: {
            travelPreferences: {
                pace: 'FAST',
                budget: 'HIGH',
            },
            tags: ['couple', 'luxury'],
        },
    };
    results.push(await runTest('部分更新用户偏好（只更新部分字段）', 'PUT', '/api/users/profile', partialUpdateData, true));
    results.push(await runTest('推断用户偏好（决策风格）', 'GET', `/api/v1/decision-replay/style/${TEST_USER_ID}/preferences`, undefined, true));
    results.push(await runTest('清除用户偏好（规划助手）', 'POST', `/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences/clear`, undefined, false));
    results.push(await runTest('验证清除后的用户偏好摘要', 'GET', `/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences`, undefined, false));
    results.push(await runTest('测试空偏好更新', 'PUT', '/api/users/profile', { preferences: {} }, true));
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    console.log(`\n总计: ${results.length} 个测试`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log(`⏱️  总耗时: ${totalDuration}ms`);
    if (failCount > 0) {
        console.log('\n失败的测试:');
        results
            .filter(r => !r.success)
            .forEach(r => {
            console.log(`  ❌ ${r.name}`);
            console.log(`     错误: ${r.error}`);
        });
    }
    console.log('\n详细的测试结果:');
    results.forEach((r, index) => {
        const icon = r.success ? '✅' : '❌';
        const duration = r.duration ? ` (${r.duration}ms)` : '';
        console.log(`  ${index + 1}. ${icon} ${r.name}${duration}`);
    });
    process.exit(failCount > 0 ? 1 : 0);
}
runTests().catch((error) => {
    console.error('\n❌ 测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-user-preferences-api.js.map