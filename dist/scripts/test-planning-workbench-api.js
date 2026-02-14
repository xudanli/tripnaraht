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
async function runTests() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6;
    const results = [];
    console.log('🚀 开始测试规划工作台 API...\n');
    console.log('📋 测试1: 生成行程骨架方案');
    try {
        const startTime = Date.now();
        const response = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/execute`, {
            context: {
                destination: {
                    country: '冰岛',
                },
                days: 5,
                travelMode: 'self_drive',
                constraints: {
                    budget: {
                        total: 50000,
                        currency: 'CNY',
                    },
                    fitness: {
                        level: 'medium',
                    },
                },
            },
            userAction: 'generate',
        });
        const duration = Date.now() - startTime;
        const success = response.statusCode === 200 && response.body.success;
        if (success) {
            const planState = (_a = response.body.data) === null || _a === void 0 ? void 0 : _a.planState;
            const segments = ((_b = planState === null || planState === void 0 ? void 0 : planState.itinerary) === null || _b === void 0 ? void 0 : _b.segments) || [];
            const hasDemData = segments.some((seg) => seg.distanceKm > 0 || seg.ascentM > 0 || seg.slopePct > 0);
            const hasGeoFeatures = segments.some((seg) => { var _a, _b; return ((_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.geoFeatures) || ((_b = seg.metadata) === null || _b === void 0 ? void 0 : _b.hazards); });
            const hasDecisionTrace = !!((_c = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _c === void 0 ? void 0 : _c.exclusionLog) ||
                !!((_d = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _d === void 0 ? void 0 : _d.decisionTrace);
            results.push({
                name: '生成方案（generate）',
                success: true,
                data: {
                    planId: planState === null || planState === void 0 ? void 0 : planState.plan_id,
                    segmentsCount: segments.length,
                    hasDemData,
                    hasGeoFeatures,
                    hasDecisionTrace,
                    skeletonOptionsCount: ((_h = (_g = (_f = (_e = response.body.data) === null || _e === void 0 ? void 0 : _e.uiOutput) === null || _f === void 0 ? void 0 : _f.skeletonOptions) === null || _g === void 0 ? void 0 : _g.options) === null || _h === void 0 ? void 0 : _h.length) || 0,
                },
                duration,
            });
            console.log(`✅ 成功 (${duration}ms)`);
            console.log(`   - Plan ID: ${planState === null || planState === void 0 ? void 0 : planState.plan_id}`);
            console.log(`   - Segments: ${segments.length}`);
            console.log(`   - DEM数据填充: ${hasDemData ? '✅' : '❌'}`);
            console.log(`   - 地理特征填充: ${hasGeoFeatures ? '✅' : '❌'}`);
            console.log(`   - 决策追溯链: ${hasDecisionTrace ? '✅' : '❌'}`);
            console.log(`   - 骨架方案数: ${((_m = (_l = (_k = (_j = response.body.data) === null || _j === void 0 ? void 0 : _j.uiOutput) === null || _k === void 0 ? void 0 : _k.skeletonOptions) === null || _l === void 0 ? void 0 : _l.options) === null || _m === void 0 ? void 0 : _m.length) || 0}`);
            global.testPlanId = planState === null || planState === void 0 ? void 0 : planState.plan_id;
            global.testSkeletonOptions = (_p = (_o = response.body.data) === null || _o === void 0 ? void 0 : _o.uiOutput) === null || _p === void 0 ? void 0 : _p.skeletonOptions;
        }
        else {
            throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
        }
    }
    catch (error) {
        results.push({
            name: '生成方案（generate）',
            success: false,
            error: error.message,
        });
        console.log(`❌ 失败: ${error.message}`);
    }
    console.log('');
    console.log('📊 测试2: 对比多个方案');
    try {
        const skeletonOptions = global.testSkeletonOptions;
        if (!skeletonOptions || !skeletonOptions.options || skeletonOptions.options.length < 2) {
            throw new Error('需要至少2个方案才能对比');
        }
        const startTime = Date.now();
        const response = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/execute`, {
            context: {
                destination: {
                    country: '冰岛',
                },
                days: 5,
            },
            userAction: 'compare',
            skeletonOptions,
        });
        const duration = Date.now() - startTime;
        const success = response.statusCode === 200 && response.body.success;
        if (success) {
            const comparison = (_r = (_q = response.body.data) === null || _q === void 0 ? void 0 : _q.uiOutput) === null || _r === void 0 ? void 0 : _r.comparison;
            const hasComparison = !!comparison && comparison.options && comparison.options.length > 0;
            results.push({
                name: '对比方案（compare）',
                success: true,
                data: {
                    hasComparison,
                    comparisonOptionsCount: ((_s = comparison === null || comparison === void 0 ? void 0 : comparison.options) === null || _s === void 0 ? void 0 : _s.length) || 0,
                    hasRecommendation: !!(comparison === null || comparison === void 0 ? void 0 : comparison.recommendation),
                },
                duration,
            });
            console.log(`✅ 成功 (${duration}ms)`);
            console.log(`   - 对比结果: ${hasComparison ? '✅' : '❌'}`);
            console.log(`   - 对比方案数: ${((_t = comparison === null || comparison === void 0 ? void 0 : comparison.options) === null || _t === void 0 ? void 0 : _t.length) || 0}`);
            console.log(`   - 推荐方案: ${((_u = comparison === null || comparison === void 0 ? void 0 : comparison.recommendation) === null || _u === void 0 ? void 0 : _u.optionId) || '无'}`);
            if ((_v = comparison === null || comparison === void 0 ? void 0 : comparison.recommendation) === null || _v === void 0 ? void 0 : _v.optionId) {
                global.testSelectedOptionId = comparison.recommendation.optionId;
            }
        }
        else {
            throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
        }
    }
    catch (error) {
        results.push({
            name: '对比方案（compare）',
            success: false,
            error: error.message,
        });
        console.log(`❌ 失败: ${error.message}`);
    }
    console.log('');
    console.log('💾 测试3: 提交方案');
    try {
        const planId = global.testPlanId;
        const selectedOptionId = global.testSelectedOptionId || 'balanced_1';
        const skeletonOptions = global.testSkeletonOptions;
        if (!planId) {
            throw new Error('需要先生成方案');
        }
        const startTime = Date.now();
        const response = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/execute`, {
            context: {
                destination: {
                    country: '冰岛',
                },
                days: 5,
            },
            userAction: 'commit',
            selectedOptionId,
            skeletonOptions,
            tripId: `test_trip_${Date.now()}`,
        });
        const duration = Date.now() - startTime;
        const success = response.statusCode === 200 && response.body.success;
        if (success) {
            const planState = (_w = response.body.data) === null || _w === void 0 ? void 0 : _w.planState;
            const segments = ((_x = planState === null || planState === void 0 ? void 0 : planState.itinerary) === null || _x === void 0 ? void 0 : _x.segments) || [];
            const hasDemData = segments.some((seg) => seg.distanceKm > 0 || seg.ascentM > 0 || seg.slopePct > 0);
            results.push({
                name: '提交方案（commit）',
                success: true,
                data: {
                    planId: planState === null || planState === void 0 ? void 0 : planState.plan_id,
                    planVersion: planState === null || planState === void 0 ? void 0 : planState.plan_version,
                    status: planState === null || planState === void 0 ? void 0 : planState.status,
                    segmentsCount: segments.length,
                    hasDemData,
                    committedAt: (_y = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _y === void 0 ? void 0 : _y.committedAt,
                },
                duration,
            });
            console.log(`✅ 成功 (${duration}ms)`);
            console.log(`   - Plan ID: ${planState === null || planState === void 0 ? void 0 : planState.plan_id}`);
            console.log(`   - Plan Version: ${planState === null || planState === void 0 ? void 0 : planState.plan_version}`);
            console.log(`   - Status: ${planState === null || planState === void 0 ? void 0 : planState.status}`);
            console.log(`   - DEM数据填充: ${hasDemData ? '✅' : '❌'}`);
            console.log(`   - 提交时间: ${((_z = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _z === void 0 ? void 0 : _z.committedAt) || '无'}`);
        }
        else {
            throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
        }
    }
    catch (error) {
        results.push({
            name: '提交方案（commit）',
            success: false,
            error: error.message,
        });
        console.log(`❌ 失败: ${error.message}`);
    }
    console.log('');
    console.log('📄 测试4: 获取方案详情');
    try {
        const planId = global.testPlanId;
        if (!planId) {
            throw new Error('需要先生成方案');
        }
        const startTime = Date.now();
        const response = await httpRequest('GET', `${API_BASE_URL}/api/planning-workbench/plans/${planId}`);
        const duration = Date.now() - startTime;
        const success = response.statusCode === 200 && response.body.success;
        if (success) {
            const planState = (_0 = response.body.data) === null || _0 === void 0 ? void 0 : _0.planState;
            const hasExclusionLog = !!((_1 = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _1 === void 0 ? void 0 : _1.exclusionLog);
            const hasDecisionTrace = !!((_2 = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _2 === void 0 ? void 0 : _2.decisionTrace);
            results.push({
                name: '获取方案详情',
                success: true,
                data: {
                    planId: planState === null || planState === void 0 ? void 0 : planState.plan_id,
                    hasExclusionLog,
                    hasDecisionTrace,
                    exclusionLogCount: ((_4 = (_3 = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _3 === void 0 ? void 0 : _3.exclusionLog) === null || _4 === void 0 ? void 0 : _4.length) || 0,
                },
                duration,
            });
            console.log(`✅ 成功 (${duration}ms)`);
            console.log(`   - Plan ID: ${planState === null || planState === void 0 ? void 0 : planState.plan_id}`);
            console.log(`   - 排除日志: ${hasExclusionLog ? '✅' : '❌'}`);
            console.log(`   - 决策追溯: ${hasDecisionTrace ? '✅' : '❌'}`);
            console.log(`   - 排除项数: ${((_6 = (_5 = planState === null || planState === void 0 ? void 0 : planState.metadata) === null || _5 === void 0 ? void 0 : _5.exclusionLog) === null || _6 === void 0 ? void 0 : _6.length) || 0}`);
        }
        else {
            throw new Error(`请求失败: ${response.statusCode}, ${JSON.stringify(response.body)}`);
        }
    }
    catch (error) {
        results.push({
            name: '获取方案详情',
            success: false,
            error: error.message,
        });
        console.log(`❌ 失败: ${error.message}`);
    }
    console.log('');
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const successRate = ((successCount / totalCount) * 100).toFixed(1);
    results.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        const duration = result.duration ? ` (${result.duration}ms)` : '';
        console.log(`${icon} ${result.name}${duration}`);
        if (!result.success && result.error) {
            console.log(`   错误: ${result.error}`);
        }
        if (result.data) {
            Object.entries(result.data).forEach(([key, value]) => {
                console.log(`   ${key}: ${value}`);
            });
        }
    });
    console.log('='.repeat(60));
    console.log(`总计: ${successCount}/${totalCount} 通过 (${successRate}%)`);
    if (successCount === totalCount) {
        console.log('🎉 所有测试通过！');
        process.exit(0);
    }
    else {
        console.log('⚠️  部分测试失败');
        process.exit(1);
    }
}
runTests().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-planning-workbench-api.js.map