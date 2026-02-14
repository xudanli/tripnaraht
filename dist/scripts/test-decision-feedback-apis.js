#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
async function testPlanVariantFeedback() {
    var _a, _b;
    try {
        const response = await axios_1.default.post(`${BASE_URL}/decision/feedback/plan-variant`, {
            runId: `test_run_${Date.now()}`,
            variantId: `test_variant_${Date.now()}`,
            variantStrategy: 'balanced',
            userChoice: 'selected',
            rating: 5,
            reason: '测试：这个方案最符合我的需求',
        });
        return {
            name: '计划变体反馈',
            success: response.status === 200,
            response: response.data,
        };
    }
    catch (error) {
        return {
            name: '计划变体反馈',
            success: false,
            error: ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || error.message,
        };
    }
}
async function testConflictFeedback() {
    var _a, _b;
    try {
        const response = await axios_1.default.post(`${BASE_URL}/decision/feedback/conflict`, {
            runId: `test_run_${Date.now()}`,
            conflictId: `test_conflict_${Date.now()}`,
            conflictType: 'budget vs hotel_quality',
            understood: true,
            explanationClear: true,
            tradeoffOptionsUseful: true,
            selectedTradeoffOption: '增加预算 20%',
        });
        return {
            name: '约束冲突反馈',
            success: response.status === 200,
            response: response.data,
        };
    }
    catch (error) {
        return {
            name: '约束冲突反馈',
            success: false,
            error: ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || error.message,
        };
    }
}
async function testDecisionQualityFeedback() {
    var _a, _b;
    try {
        const response = await axios_1.default.post(`${BASE_URL}/decision/feedback/decision-quality`, {
            runId: `test_run_${Date.now()}`,
            overallSatisfaction: 5,
            planQuality: 5,
            conflictExplanationQuality: 4,
            tradeoffOptionsQuality: 4,
            decisionSpeed: 5,
            additionalFeedback: '测试：整体质量很好',
        });
        return {
            name: '决策质量反馈',
            success: response.status === 200,
            response: response.data,
        };
    }
    catch (error) {
        return {
            name: '决策质量反馈',
            success: false,
            error: ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || error.message,
        };
    }
}
async function testBatchFeedback() {
    var _a, _b;
    try {
        const runId = `test_run_${Date.now()}`;
        const response = await axios_1.default.post(`${BASE_URL}/decision/feedback/batch`, {
            planVariantFeedbacks: [
                {
                    runId,
                    variantId: `test_variant_1_${Date.now()}`,
                    variantStrategy: 'conservative',
                    userChoice: 'selected',
                    rating: 4,
                },
                {
                    runId,
                    variantId: `test_variant_2_${Date.now()}`,
                    variantStrategy: 'aggressive',
                    userChoice: 'rejected',
                    rating: 2,
                    reason: '测试：太激进了',
                },
            ],
            conflictFeedbacks: [
                {
                    runId,
                    conflictId: `test_conflict_${Date.now()}`,
                    conflictType: 'budget vs hotel_quality',
                    understood: true,
                    explanationClear: true,
                    tradeoffOptionsUseful: true,
                },
            ],
            decisionQualityFeedbacks: [
                {
                    runId,
                    overallSatisfaction: 4,
                    planQuality: 4,
                    conflictExplanationQuality: 4,
                    tradeoffOptionsQuality: 4,
                    decisionSpeed: 5,
                },
            ],
        });
        return {
            name: '批量反馈',
            success: response.status === 200,
            response: response.data,
        };
    }
    catch (error) {
        return {
            name: '批量反馈',
            success: false,
            error: ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || error.message,
        };
    }
}
async function testFeedbackStats() {
    var _a, _b;
    try {
        const response = await axios_1.default.get(`${BASE_URL}/decision/feedback/stats`, {
            params: {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                endDate: new Date().toISOString(),
            },
        });
        return {
            name: '反馈统计',
            success: response.status === 200,
            response: response.data,
        };
    }
    catch (error) {
        return {
            name: '反馈统计',
            success: false,
            error: ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || error.message,
        };
    }
}
async function main() {
    console.log('🧪 开始测试决策反馈API...\n');
    console.log(`📍 API Base URL: ${BASE_URL}\n`);
    const results = [];
    console.log('1️⃣ 测试计划变体反馈...');
    results.push(await testPlanVariantFeedback());
    console.log('2️⃣ 测试约束冲突反馈...');
    results.push(await testConflictFeedback());
    console.log('3️⃣ 测试决策质量反馈...');
    results.push(await testDecisionQualityFeedback());
    console.log('4️⃣ 测试批量反馈...');
    results.push(await testBatchFeedback());
    console.log('5️⃣ 测试反馈统计...');
    results.push(await testFeedbackStats());
    console.log('\n📊 测试结果汇总：\n');
    let successCount = 0;
    let failCount = 0;
    for (const result of results) {
        if (result.success) {
            console.log(`✅ ${result.name}: 成功`);
            successCount++;
        }
        else {
            console.log(`❌ ${result.name}: 失败`);
            console.log(`   错误: ${result.error}`);
            failCount++;
        }
    }
    console.log(`\n📈 总计: ${successCount} 成功, ${failCount} 失败`);
    if (failCount > 0) {
        process.exit(1);
    }
}
main().catch((error) => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-decision-feedback-apis.js.map