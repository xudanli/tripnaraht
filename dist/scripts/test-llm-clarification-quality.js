#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const testCases = [
    {
        name: '缺失所有关键信息',
        userInput: '我想去旅行',
        description: '用户只提供了旅行意图，缺失目的地、日期、预算等所有关键信息',
        expectedRequiredCount: 3,
        expectedHasGroup: true,
    },
    {
        name: '缺失日期和预算',
        userInput: '我想去冰岛旅行',
        description: '用户提供了目的地，但缺失日期和预算',
        expectedRequiredCount: 2,
        expectedHasGroup: true,
    },
    {
        name: '缺失预算',
        userInput: '我想2026年2月去冰岛旅行7天',
        description: '用户提供了目的地和日期，但缺失预算',
        expectedRequiredCount: 1,
        expectedHasGroup: true,
    },
    {
        name: '信息完整但需要补充偏好',
        userInput: '我想2026年2月去冰岛旅行7天，预算2万',
        description: '用户提供了所有关键信息，应该生成可选问题（偏好、安全等）',
        expectedRequiredCount: 0,
        expectedOptionalCount: 1,
        expectedHasGroup: true,
    },
    {
        name: '带娃旅行',
        userInput: '我想带娃去东京旅行5天，预算1.5万',
        description: '用户提供了关键信息，但缺失日期，且有特殊需求（带娃）',
        expectedRequiredCount: 1,
        expectedHasGroup: true,
    },
    {
        name: '高风险目的地',
        userInput: '我想去格陵兰旅行',
        description: '高风险目的地，应该优先显示安全问题',
        expectedRequiredCount: 3,
        expectedHasGroup: true,
    },
];
function evaluateOptionQuality(question) {
    let score = 0;
    const maxScore = 5;
    if (!question.options || question.options.length === 0) {
        return 0;
    }
    const hasClearOptions = question.options.every((opt) => {
        const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
        return text.length > 0 && text.length < 50;
    });
    if (hasClearOptions)
        score += 1;
    const hasSpecificOptions = question.options.every((opt) => {
        const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
        const vaguePatterns = ['是', '否', '想', '不想', '需要', '不需要'];
        const isVague = vaguePatterns.some(pattern => text.includes(pattern) && text.length < 10);
        return !isVague;
    });
    if (hasSpecificOptions)
        score += 1;
    const hasActionOptions = question.options.some((opt) => {
        const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
        const actionPatterns = ['补充', '添加', '暂不', '跳过', '继续'];
        return actionPatterns.some(pattern => text.includes(pattern));
    });
    if (hasActionOptions)
        score += 1;
    const optionTexts = question.options.map((opt) => {
        const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
        return text.toLowerCase().trim();
    });
    const uniqueOptions = new Set(optionTexts);
    if (uniqueOptions.size === question.options.length)
        score += 1;
    if (question.options.length >= 2 && question.options.length <= 5)
        score += 1;
    return score;
}
function evaluateGroupAccuracy(questions) {
    if (questions.length === 0)
        return 1.0;
    let correctGroups = 0;
    for (const q of questions) {
        if (!q.group) {
            continue;
        }
        if (q.required === true && q.group === 'required') {
            correctGroups++;
        }
        else if (q.required === false && q.group === 'optional') {
            correctGroups++;
        }
    }
    const questionsWithGroup = questions.filter(q => q.group);
    if (questionsWithGroup.length === 0)
        return 0;
    return correctGroups / questionsWithGroup.length;
}
async function runTestCase(testCase) {
    var _a, _b;
    try {
        console.log(`\n📋 测试用例: ${testCase.name}`);
        console.log(`   描述: ${testCase.description}`);
        console.log(`   用户输入: "${testCase.userInput}"`);
        const sessionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const response = await axios_1.default.post(`${BASE_URL}/api/trips/from-natural-language`, {
            text: testCase.userInput,
            sessionId: sessionId,
            isNewConversation: true,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000,
            validateStatus: (status) => status < 500,
        });
        if (response.status >= 400) {
            const errorData = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.error) || response.data;
            const errorMessage = (errorData === null || errorData === void 0 ? void 0 : errorData.message) || JSON.stringify(response.data);
            return {
                testCase,
                success: false,
                error: `HTTP ${response.status}: ${errorMessage}`,
            };
        }
        if (response.data && !response.data.success && response.data.error) {
            return {
                testCase,
                success: false,
                error: `API错误: ${response.data.error.message || JSON.stringify(response.data.error)}`,
            };
        }
        const data = response.data.data || response.data;
        const clarificationQuestions = data.clarificationQuestions || [];
        const requiredQuestions = clarificationQuestions.filter((q) => q.group === 'required');
        const optionalQuestions = clarificationQuestions.filter((q) => q.group === 'optional');
        const questionsWithoutGroup = clarificationQuestions.filter((q) => !q.group);
        const requiredExceedsLimit = requiredQuestions.length > 5;
        const optionalExceedsLimit = optionalQuestions.length > 3;
        const optionScores = clarificationQuestions
            .filter((q) => q.options && q.options.length > 0)
            .map((q) => evaluateOptionQuality(q));
        const avgOptionScore = optionScores.length > 0
            ? optionScores.reduce((a, b) => a + b, 0) / optionScores.length
            : 0;
        const groupAccuracy = evaluateGroupAccuracy(clarificationQuestions);
        const metrics = {
            totalQuestions: clarificationQuestions.length,
            requiredQuestions: requiredQuestions.length,
            optionalQuestions: optionalQuestions.length,
            questionsWithoutGroup: questionsWithoutGroup.length,
            questionsExceedingLimit: requiredExceedsLimit || optionalExceedsLimit,
            optionQualityScore: avgOptionScore,
            groupAccuracy: groupAccuracy,
        };
        let success = true;
        const errors = [];
        if (testCase.expectedHasGroup && questionsWithoutGroup.length > 0) {
            success = false;
            errors.push(`有 ${questionsWithoutGroup.length} 个问题缺少group字段`);
        }
        if (testCase.expectedRequiredCount !== undefined) {
            if (requiredQuestions.length < testCase.expectedRequiredCount) {
                success = false;
                errors.push(`必需问题数量不足：期望至少 ${testCase.expectedRequiredCount} 个，实际 ${requiredQuestions.length} 个`);
            }
        }
        if (requiredExceedsLimit) {
            success = false;
            errors.push(`必需问题数量超过限制：${requiredQuestions.length} > 5`);
        }
        if (optionalExceedsLimit) {
            success = false;
            errors.push(`可选问题数量超过限制：${optionalQuestions.length} > 3`);
        }
        if (groupAccuracy < 0.95) {
            success = false;
            errors.push(`分组准确率不足：${(groupAccuracy * 100).toFixed(1)}% < 95%`);
        }
        if (avgOptionScore < 4.0) {
            success = false;
            errors.push(`选项质量评分不足：${avgOptionScore.toFixed(1)} < 4.0`);
        }
        return {
            testCase,
            success,
            error: errors.length > 0 ? errors.join('; ') : undefined,
            metrics,
            questions: clarificationQuestions,
            response: data,
        };
    }
    catch (error) {
        let errorMessage = '未知错误';
        if (error.code === 'ECONNREFUSED') {
            errorMessage = `无法连接到服务器 ${BASE_URL}，请确保后端服务正在运行`;
        }
        else if (error.response) {
            errorMessage = `HTTP ${error.response.status}: ${((_b = error.response.data) === null || _b === void 0 ? void 0 : _b.message) || error.response.statusText || '请求失败'}`;
        }
        else if (error.message) {
            errorMessage = error.message;
        }
        return {
            testCase,
            success: false,
            error: errorMessage,
        };
    }
}
function printTestResult(result) {
    const status = result.success ? '✅' : '❌';
    console.log(`\n${status} ${result.testCase.name}`);
    if (result.error) {
        console.log(`   错误: ${result.error}`);
    }
    if (result.metrics) {
        console.log(`   指标:`);
        console.log(`     - 总问题数: ${result.metrics.totalQuestions}`);
        console.log(`     - 必需问题: ${result.metrics.requiredQuestions} (限制: ≤5)`);
        console.log(`     - 可选问题: ${result.metrics.optionalQuestions} (限制: ≤3)`);
        console.log(`     - 缺少group字段: ${result.metrics.questionsWithoutGroup}`);
        console.log(`     - 超过限制: ${result.metrics.questionsExceedingLimit ? '是' : '否'}`);
        console.log(`     - 选项质量评分: ${result.metrics.optionQualityScore.toFixed(2)}/5.0`);
        console.log(`     - 分组准确率: ${(result.metrics.groupAccuracy * 100).toFixed(1)}%`);
        if (result.questions && result.questions.length > 0) {
            console.log(`\n   生成的问题:`);
            result.questions.forEach((q, index) => {
                console.log(`     ${index + 1}. [${q.group || '无分组'}] ${q.question || q.text || '无问题文本'}`);
                if (q.options && q.options.length > 0) {
                    const options = q.options.map((opt) => {
                        return typeof opt === 'string' ? opt : opt.label || opt.value || '';
                    });
                    console.log(`        选项: ${options.join(', ')}`);
                }
                if (q.metadata) {
                    console.log(`        元数据: ${JSON.stringify(q.metadata)}`);
                }
            });
        }
    }
}
function generateReport(results) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 测试报告');
    console.log('='.repeat(80));
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    console.log(`\n总测试数: ${totalTests}`);
    console.log(`通过: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log(`失败: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
    const metricsWithData = results.filter(r => r.metrics);
    if (metricsWithData.length > 0) {
        const avgRequiredQuestions = metricsWithData.reduce((sum, r) => { var _a; return sum + (((_a = r.metrics) === null || _a === void 0 ? void 0 : _a.requiredQuestions) || 0); }, 0) / metricsWithData.length;
        const avgOptionalQuestions = metricsWithData.reduce((sum, r) => { var _a; return sum + (((_a = r.metrics) === null || _a === void 0 ? void 0 : _a.optionalQuestions) || 0); }, 0) / metricsWithData.length;
        const avgOptionQuality = metricsWithData.reduce((sum, r) => { var _a; return sum + (((_a = r.metrics) === null || _a === void 0 ? void 0 : _a.optionQualityScore) || 0); }, 0) / metricsWithData.length;
        const avgGroupAccuracy = metricsWithData.reduce((sum, r) => { var _a; return sum + (((_a = r.metrics) === null || _a === void 0 ? void 0 : _a.groupAccuracy) || 0); }, 0) / metricsWithData.length;
        const questionsWithoutGroupCount = metricsWithData.reduce((sum, r) => { var _a; return sum + (((_a = r.metrics) === null || _a === void 0 ? void 0 : _a.questionsWithoutGroup) || 0); }, 0);
        const exceedingLimitCount = metricsWithData.filter(r => { var _a; return (_a = r.metrics) === null || _a === void 0 ? void 0 : _a.questionsExceedingLimit; }).length;
        console.log(`\n平均指标:`);
        console.log(`  - 平均必需问题数: ${avgRequiredQuestions.toFixed(1)}`);
        console.log(`  - 平均可选问题数: ${avgOptionalQuestions.toFixed(1)}`);
        console.log(`  - 平均选项质量评分: ${avgOptionQuality.toFixed(2)}/5.0`);
        console.log(`  - 平均分组准确率: ${(avgGroupAccuracy * 100).toFixed(1)}%`);
        console.log(`  - 缺少group字段的问题总数: ${questionsWithoutGroupCount}`);
        console.log(`  - 超过限制的测试用例数: ${exceedingLimitCount}`);
        console.log(`\n验收标准:`);
        console.log(`  ✅ 问题分组准确率: ${(avgGroupAccuracy * 100).toFixed(1)}% ${avgGroupAccuracy >= 0.95 ? '✓' : '✗'} (目标: ≥95%)`);
        console.log(`  ✅ 问题数量符合率: ${((totalTests - exceedingLimitCount) / totalTests * 100).toFixed(1)}% ${exceedingLimitCount === 0 ? '✓' : '✗'} (目标: ≥90%)`);
        console.log(`  ✅ 选项质量评分: ${avgOptionQuality.toFixed(2)}/5.0 ${avgOptionQuality >= 4.0 ? '✓' : '✗'} (目标: ≥4.0)`);
    }
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
        console.log(`\n失败的测试用例:`);
        failedResults.forEach(r => {
            console.log(`  - ${r.testCase.name}: ${r.error || '未知错误'}`);
        });
    }
}
async function main() {
    console.log('🧪 LLM生成质量测试');
    console.log('='.repeat(80));
    console.log(`API Base URL: ${BASE_URL}`);
    console.log(`测试用例数: ${testCases.length}`);
    const results = [];
    for (const testCase of testCases) {
        const result = await runTestCase(testCase);
        printTestResult(result);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    generateReport(results);
    const allPassed = results.every(r => r.success);
    process.exit(allPassed ? 0 : 1);
}
main().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-llm-clarification-quality.js.map