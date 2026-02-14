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
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
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
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('请求超时（10秒）'));
        });
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}
async function pollTaskStatus(taskId, maxAttempts = 60, intervalMs = 2000) {
    console.log(`\n⏳ 开始轮询任务状态 (taskId: ${taskId})...`);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await httpRequest('GET', `${API_BASE_URL}/api/planning-workbench/tasks/${taskId}/status`);
            if (response.statusCode !== 200) {
                throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }
            const taskProgress = response.body.data;
            const status = taskProgress.status;
            const progress = taskProgress.progress || 0;
            const currentStage = taskProgress.currentStage || '未知';
            console.log(`  [${attempt}/${maxAttempts}] 状态: ${status}, 进度: ${progress}%, 阶段: ${currentStage}`);
            if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
                return { status, progress: taskProgress };
            }
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }
        catch (error) {
            console.error(`  轮询失败 (尝试 ${attempt}/${maxAttempts}): ${error.message}`);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
            else {
                throw error;
            }
        }
    }
    throw new Error(`轮询超时：${maxAttempts} 次尝试后仍未完成`);
}
async function runTests() {
    var _a, _b, _c, _d, _e;
    const results = [];
    console.log('🚀 开始测试规划工作台异步 API（不依赖 embedding）...\n');
    console.log(`📍 API地址: ${API_BASE_URL}\n`);
    console.log('📋 测试1: 异步执行规划工作台（generate）');
    let taskId = null;
    try {
        const startTime = Date.now();
        const requestBody = {
            context: {
                destination: {
                    country: '冰岛',
                },
                days: 3,
                travelMode: 'self_drive',
                constraints: {
                    budget: {
                        total: 30000,
                        currency: 'CNY',
                    },
                    fitness: {
                        level: 'medium',
                    },
                },
            },
            userAction: 'generate',
        };
        const response = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/execute-async`, requestBody);
        const duration = Date.now() - startTime;
        if (response.statusCode === 202) {
            taskId = (_a = response.body.data) === null || _a === void 0 ? void 0 : _a.taskId;
            if (taskId) {
                console.log(`  ✅ 异步任务已创建: taskId=${taskId}`);
                console.log(`  ⏱️  响应时间: ${duration}ms`);
                results.push({
                    name: '异步执行（创建任务）',
                    success: true,
                    data: { taskId, statusUrl: (_b = response.body.data) === null || _b === void 0 ? void 0 : _b.statusUrl },
                    duration,
                });
            }
            else {
                throw new Error('响应中缺少 taskId');
            }
        }
        else {
            throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
        }
    }
    catch (error) {
        console.error(`  ❌ 测试失败: ${error.message}`);
        results.push({
            name: '异步执行（创建任务）',
            success: false,
            error: error.message,
        });
        return;
    }
    console.log('\n📊 测试2: 轮询任务状态');
    try {
        const startTime = Date.now();
        const taskProgress = await pollTaskStatus(taskId, 60, 2000);
        const duration = Date.now() - startTime;
        console.log(`\n  ✅ 任务完成: 状态=${taskProgress.status}`);
        console.log(`  ⏱️  总耗时: ${duration}ms`);
        if (taskProgress.status === 'COMPLETED') {
            const result = taskProgress.progress.result;
            if ((_d = (_c = result === null || result === void 0 ? void 0 : result.planState) === null || _c === void 0 ? void 0 : _c.skeletonOptions) === null || _d === void 0 ? void 0 : _d.options) {
                const optionCount = result.planState.skeletonOptions.options.length;
                console.log(`  📋 生成了 ${optionCount} 个骨架方案`);
            }
            if (result === null || result === void 0 ? void 0 : result.segments) {
                console.log(`  🗺️  生成了 ${result.segments.length} 个路线段`);
            }
        }
        else if (taskProgress.status === 'FAILED') {
            console.error(`  ❌ 任务失败: ${taskProgress.progress.error || '未知错误'}`);
        }
        results.push({
            name: '轮询任务状态',
            success: taskProgress.status === 'COMPLETED',
            data: taskProgress.progress,
            duration,
        });
    }
    catch (error) {
        console.error(`  ❌ 测试失败: ${error.message}`);
        results.push({
            name: '轮询任务状态',
            success: false,
            error: error.message,
        });
    }
    console.log('\n🔍 测试3: 直接查询任务状态');
    try {
        const startTime = Date.now();
        const response = await httpRequest('GET', `${API_BASE_URL}/api/planning-workbench/tasks/${taskId}/status`);
        const duration = Date.now() - startTime;
        if (response.statusCode === 200) {
            const taskProgress = response.body.data;
            console.log(`  ✅ 查询成功: 状态=${taskProgress.status}, 进度=${taskProgress.progress}%`);
            results.push({
                name: '直接查询任务状态',
                success: true,
                data: taskProgress,
                duration,
            });
        }
        else {
            throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
        }
    }
    catch (error) {
        console.error(`  ❌ 测试失败: ${error.message}`);
        results.push({
            name: '直接查询任务状态',
            success: false,
            error: error.message,
        });
    }
    console.log('\n🚫 测试4: 取消任务（仅当任务为 PENDING 或 RUNNING 时）');
    try {
        const statusResponse = await httpRequest('GET', `${API_BASE_URL}/api/planning-workbench/tasks/${taskId}/status`);
        if (statusResponse.statusCode === 200) {
            const currentStatus = (_e = statusResponse.body.data) === null || _e === void 0 ? void 0 : _e.status;
            if (currentStatus === 'PENDING' || currentStatus === 'RUNNING') {
                const startTime = Date.now();
                const cancelResponse = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/tasks/${taskId}/cancel-planning`);
                const duration = Date.now() - startTime;
                if (cancelResponse.statusCode === 200) {
                    console.log(`  ✅ 任务已取消`);
                    results.push({
                        name: '取消任务',
                        success: true,
                        data: cancelResponse.body.data,
                        duration,
                    });
                }
                else {
                    throw new Error(`HTTP ${cancelResponse.statusCode}: ${JSON.stringify(cancelResponse.body)}`);
                }
            }
            else {
                console.log(`  ⏭️  跳过：任务状态为 ${currentStatus}，无法取消`);
                results.push({
                    name: '取消任务',
                    success: true,
                    data: { skipped: true, reason: `任务状态为 ${currentStatus}` },
                });
            }
        }
        else {
            throw new Error(`无法获取任务状态: HTTP ${statusResponse.statusCode}`);
        }
    }
    catch (error) {
        console.error(`  ❌ 测试失败: ${error.message}`);
        results.push({
            name: '取消任务',
            success: false,
            error: error.message,
        });
    }
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    results.forEach((result, index) => {
        const icon = result.success ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${icon} ${index + 1}. ${result.name}${duration}`);
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        }
    });
    console.log(`\n总计: ${successCount}/${totalCount} 通过`);
    if (successCount === totalCount) {
        console.log('\n🎉 所有测试通过！');
        process.exit(0);
    }
    else {
        console.log('\n⚠️  部分测试失败');
        process.exit(1);
    }
}
runTests().catch((error) => {
    console.error('\n💥 测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-planning-workbench-async.js.map