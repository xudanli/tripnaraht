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
function httpRequest(method, url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        const requestHeaders = {
            'Content-Type': 'application/json',
            ...headers,
        };
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: requestHeaders,
        };
        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedBody = body ? JSON.parse(body) : {};
                    resolve({
                        statusCode: res.statusCode || 200,
                        body: parsedBody,
                    });
                }
                catch (error) {
                    resolve({
                        statusCode: res.statusCode || 200,
                        body: { raw: body },
                    });
                }
            });
        });
        req.on('error', (error) => {
            reject(error);
        });
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}
function printResult(result) {
    const icon = result.success ? '✅' : '❌';
    console.log(`\n${icon} ${result.name}`);
    if (result.duration) {
        console.log(`   耗时: ${result.duration}ms`);
    }
    if (result.statusCode) {
        console.log(`   状态码: ${result.statusCode}`);
    }
    if (result.error) {
        console.log(`   错误: ${result.error}`);
    }
    if (result.data && result.success) {
        if (result.data.sessionId) {
            console.log(`   会话ID: ${result.data.sessionId}`);
        }
        if (result.data.recommendations) {
            console.log(`   推荐数量: ${result.data.recommendations.length}`);
            if (result.data.recommendations.length > 0) {
                const firstRec = result.data.recommendations[0];
                console.log(`   第一个推荐: ${firstRec.nameCN || firstRec.name} (${firstRec.countryCode})`);
                console.log(`   匹配分数: ${firstRec.matchScore}`);
            }
        }
        if (result.data.plans) {
            console.log(`   方案数量: ${result.data.plans.length}`);
        }
        if (result.data.routing) {
            console.log(`   路由目标: ${result.data.routing.target}`);
        }
    }
}
async function runTests() {
    var _a, _b;
    console.log('🚀 开始测试规划助手智能体 V2 接口...');
    console.log(`📍 API地址: ${API_BASE_URL}\n`);
    const results = [];
    let sessionId = null;
    try {
        const startTime = Date.now();
        const response = await httpRequest('POST', `${API_BASE_URL}/api/agent/planning-assistant/v2/sessions`, {});
        const duration = Date.now() - startTime;
        if (response.statusCode === 201 || response.statusCode === 200) {
            if (!response.body.sessionId) {
                throw new Error('响应中缺少 sessionId');
            }
            sessionId = response.body.sessionId;
            results.push({
                name: '测试1: 创建会话',
                success: true,
                data: response.body,
                duration,
                statusCode: response.statusCode,
            });
        }
        else {
            throw new Error(`期望状态码 201 或 200，实际: ${response.statusCode}`);
        }
    }
    catch (error) {
        results.push({
            name: '测试1: 创建会话',
            success: false,
            error: error.message,
        });
    }
    if (!sessionId) {
        console.log('\n❌ 无法继续测试：会话创建失败');
        results.forEach(printResult);
        process.exit(1);
    }
    try {
        const startTime = Date.now();
        const response = await httpRequest('POST', `${API_BASE_URL}/api/agent/planning-assistant/v2/chat`, {
            sessionId,
            message: '冰岛',
            language: 'zh',
        });
        const duration = Date.now() - startTime;
        if (response.statusCode !== 200) {
            throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
        }
        if (!response.body.message && !response.body.messageCN) {
            throw new Error('响应中缺少 message 或 messageCN');
        }
        if (!response.body.phase) {
            throw new Error('响应中缺少 phase');
        }
        if (((_a = response.body.routing) === null || _a === void 0 ? void 0 : _a.target) === 'recommendations') {
            if (!response.body.recommendations) {
                throw new Error('路由到推荐接口但响应中缺少 recommendations 字段');
            }
            if (!Array.isArray(response.body.recommendations)) {
                throw new Error('recommendations 字段不是数组');
            }
            if (response.body.recommendations.length === 0) {
                throw new Error('recommendations 数组为空');
            }
            const firstRec = response.body.recommendations[0];
            if (!firstRec.name && !firstRec.nameCN) {
                throw new Error('推荐项缺少 name 或 nameCN');
            }
            if (!firstRec.countryCode) {
                throw new Error('推荐项缺少 countryCode');
            }
            console.log(`\n   ✅ 推荐数据验证通过:`);
            console.log(`      - 推荐数量: ${response.body.recommendations.length}`);
            console.log(`      - 第一个推荐: ${firstRec.nameCN || firstRec.name}`);
            console.log(`      - 国家代码: ${firstRec.countryCode}`);
            if (firstRec.matchScore !== undefined) {
                console.log(`      - 匹配分数: ${firstRec.matchScore}`);
            }
        }
        else {
            console.log(`\n   ⚠️  未路由到推荐接口 (target: ${((_b = response.body.routing) === null || _b === void 0 ? void 0 : _b.target) || 'chat'})`);
        }
        results.push({
            name: '测试2: 智能对话（验证推荐数据）',
            success: true,
            data: response.body,
            duration,
            statusCode: response.statusCode,
        });
    }
    catch (error) {
        results.push({
            name: '测试2: 智能对话（验证推荐数据）',
            success: false,
            error: error.message,
        });
    }
    try {
        const startTime = Date.now();
        const response = await httpRequest('GET', `${API_BASE_URL}/api/agent/planning-assistant/v2/sessions/${sessionId}`);
        const duration = Date.now() - startTime;
        if (response.statusCode !== 200) {
            throw new Error(`期望状态码 200，实际: ${response.statusCode}`);
        }
        if (!response.body.sessionId) {
            throw new Error('响应中缺少 sessionId');
        }
        if (!response.body.phase) {
            throw new Error('响应中缺少 phase');
        }
        if (response.body.recommendations && response.body.recommendations.length > 0) {
            console.log(`\n   ✅ 会话状态包含推荐数据: ${response.body.recommendations.length} 个推荐`);
        }
        results.push({
            name: '测试3: 获取会话状态',
            success: true,
            data: response.body,
            duration,
            statusCode: response.statusCode,
        });
    }
    catch (error) {
        results.push({
            name: '测试3: 获取会话状态',
            success: false,
            error: error.message,
        });
    }
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(60));
    results.forEach(printResult);
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    console.log(`\n📈 总计: ${successCount}/${totalCount} 通过`);
    if (successCount === totalCount) {
        console.log('\n🎉 所有测试通过！');
        process.exit(0);
    }
    else {
        console.log('\n⚠️  部分测试失败，请检查上述错误信息');
        process.exit(1);
    }
}
runTests().catch((error) => {
    console.error('\n❌ 测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-planning-assistant-v2-api.js.map