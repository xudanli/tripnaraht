#!/usr/bin/env ts-node

/**
 * LLM生成质量测试脚本
 * 
 * 测试以下指标：
 * 1. 问题分组准确率（required/optional）
 * 2. 问题数量符合率（必需问题≤5，可选问题≤3）
 * 3. 选项质量评分（清晰度、具体性）
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  userInput: string;
  description: string;
  expectedRequiredCount?: number;
  expectedOptionalCount?: number;
  expectedHasGroup?: boolean;
}

interface TestResult {
  testCase: TestCase;
  success: boolean;
  error?: string;
  metrics?: {
    totalQuestions: number;
    requiredQuestions: number;
    optionalQuestions: number;
    questionsWithoutGroup: number;
    questionsExceedingLimit: boolean;
    optionQualityScore: number;
    groupAccuracy: number;
  };
  questions?: any[];
  response?: any;
}

// 测试用例
const testCases: TestCase[] = [
  {
    name: '缺失所有关键信息',
    userInput: '我想去旅行',
    description: '用户只提供了旅行意图，缺失目的地、日期、预算等所有关键信息',
    expectedRequiredCount: 3, // 至少应该有目的地、日期、预算
    expectedHasGroup: true,
  },
  {
    name: '缺失日期和预算',
    userInput: '我想去冰岛旅行',
    description: '用户提供了目的地，但缺失日期和预算',
    expectedRequiredCount: 2, // 日期、预算
    expectedHasGroup: true,
  },
  {
    name: '缺失预算',
    userInput: '我想2026年2月去冰岛旅行7天',
    description: '用户提供了目的地和日期，但缺失预算',
    expectedRequiredCount: 1, // 预算
    expectedHasGroup: true,
  },
  {
    name: '信息完整但需要补充偏好',
    userInput: '我想2026年2月去冰岛旅行7天，预算2万',
    description: '用户提供了所有关键信息，应该生成可选问题（偏好、安全等）',
    expectedRequiredCount: 0,
    expectedOptionalCount: 1, // 至少应该有补充偏好信息的问题
    expectedHasGroup: true,
  },
  {
    name: '带娃旅行',
    userInput: '我想带娃去东京旅行5天，预算1.5万',
    description: '用户提供了关键信息，但缺失日期，且有特殊需求（带娃）',
    expectedRequiredCount: 1, // 日期
    expectedHasGroup: true,
  },
  {
    name: '高风险目的地',
    userInput: '我想去格陵兰旅行',
    description: '高风险目的地，应该优先显示安全问题',
    expectedRequiredCount: 3, // 日期、预算、安全相关
    expectedHasGroup: true,
  },
];

// 评估选项质量
function evaluateOptionQuality(question: any): number {
  let score = 0;
  const maxScore = 5;

  if (!question.options || question.options.length === 0) {
    return 0; // 没有选项，无法评估
  }

  // 1. 选项清晰度（1分）
  const hasClearOptions = question.options.every((opt: any) => {
    const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
    return text.length > 0 && text.length < 50; // 选项文本不为空且不太长
  });
  if (hasClearOptions) score += 1;

  // 2. 选项具体性（1分）
  const hasSpecificOptions = question.options.every((opt: any) => {
    const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
    // 避免模糊选项（如"是，我想补充"、"否，信息已完整"）
    const vaguePatterns = ['是', '否', '想', '不想', '需要', '不需要'];
    const isVague = vaguePatterns.some(pattern => text.includes(pattern) && text.length < 10);
    return !isVague;
  });
  if (hasSpecificOptions) score += 1;

  // 3. 选项动作性（1分）
  const hasActionOptions = question.options.some((opt: any) => {
    const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
    // 检查是否包含具体动作（如"补充偏好信息"、"暂不补充"）
    const actionPatterns = ['补充', '添加', '暂不', '跳过', '继续'];
    return actionPatterns.some(pattern => text.includes(pattern));
  });
  if (hasActionOptions) score += 1;

  // 4. 选项语义不重复（1分）
  const optionTexts = question.options.map((opt: any) => {
    const text = typeof opt === 'string' ? opt : opt.label || opt.value || '';
    return text.toLowerCase().trim();
  });
  const uniqueOptions = new Set(optionTexts);
  if (uniqueOptions.size === question.options.length) score += 1;

  // 5. 选项数量合理（1分）
  if (question.options.length >= 2 && question.options.length <= 5) score += 1;

  return score;
}

// 评估问题分组准确率
function evaluateGroupAccuracy(questions: any[]): number {
  if (questions.length === 0) return 1.0;

  let correctGroups = 0;
  for (const q of questions) {
    // 检查是否有group字段
    if (!q.group) {
      continue; // 没有group字段，不计入准确率
    }

    // 根据required字段判断group是否正确
    if (q.required === true && q.group === 'required') {
      correctGroups++;
    } else if (q.required === false && q.group === 'optional') {
      correctGroups++;
    }
  }

  const questionsWithGroup = questions.filter(q => q.group);
  if (questionsWithGroup.length === 0) return 0;

  return correctGroups / questionsWithGroup.length;
}

// 运行单个测试用例
async function runTestCase(testCase: TestCase): Promise<TestResult> {
  try {
    console.log(`\n📋 测试用例: ${testCase.name}`);
    console.log(`   描述: ${testCase.description}`);
    console.log(`   用户输入: "${testCase.userInput}"`);

    const sessionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const response = await axios.post(
      `${BASE_URL}/api/trips/from-natural-language`,
      {
        text: testCase.userInput,
        sessionId: sessionId,
        isNewConversation: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30秒超时
        validateStatus: (status) => status < 500, // 接受所有非服务器错误状态码
      }
    );

    // 处理非200状态码（包括201等成功状态码）
    if (response.status >= 400) {
      const errorData = response.data?.error || response.data;
      const errorMessage = errorData?.message || JSON.stringify(response.data);
      return {
        testCase,
        success: false,
        error: `HTTP ${response.status}: ${errorMessage}`,
      };
    }
    
    // 检查响应数据是否包含错误
    if (response.data && !response.data.success && response.data.error) {
      return {
        testCase,
        success: false,
        error: `API错误: ${response.data.error.message || JSON.stringify(response.data.error)}`,
      };
    }

    const data = response.data.data || response.data;
    const clarificationQuestions = data.clarificationQuestions || [];

    // 计算指标
    const requiredQuestions = clarificationQuestions.filter((q: any) => q.group === 'required');
    const optionalQuestions = clarificationQuestions.filter((q: any) => q.group === 'optional');
    const questionsWithoutGroup = clarificationQuestions.filter((q: any) => !q.group);

    // 检查是否超过限制
    const requiredExceedsLimit = requiredQuestions.length > 5;
    const optionalExceedsLimit = optionalQuestions.length > 3;

    // 计算选项质量平均分
    const optionScores = clarificationQuestions
      .filter((q: any) => q.options && q.options.length > 0)
      .map((q: any) => evaluateOptionQuality(q));
    const avgOptionScore = optionScores.length > 0
      ? optionScores.reduce((a: number, b: number) => a + b, 0) / optionScores.length
      : 0;

    // 计算分组准确率
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

    // 验证结果
    let success = true;
    const errors: string[] = [];

    // 验证问题分组
    if (testCase.expectedHasGroup && questionsWithoutGroup.length > 0) {
      success = false;
      errors.push(`有 ${questionsWithoutGroup.length} 个问题缺少group字段`);
    }

    // 验证必需问题数量
    if (testCase.expectedRequiredCount !== undefined) {
      if (requiredQuestions.length < testCase.expectedRequiredCount) {
        success = false;
        errors.push(`必需问题数量不足：期望至少 ${testCase.expectedRequiredCount} 个，实际 ${requiredQuestions.length} 个`);
      }
    }

    // 验证问题数量限制
    if (requiredExceedsLimit) {
      success = false;
      errors.push(`必需问题数量超过限制：${requiredQuestions.length} > 5`);
    }
    if (optionalExceedsLimit) {
      success = false;
      errors.push(`可选问题数量超过限制：${optionalQuestions.length} > 3`);
    }

    // 验证分组准确率
    if (groupAccuracy < 0.95) {
      success = false;
      errors.push(`分组准确率不足：${(groupAccuracy * 100).toFixed(1)}% < 95%`);
    }

    // 验证选项质量
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
  } catch (error: any) {
    let errorMessage = '未知错误';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `无法连接到服务器 ${BASE_URL}，请确保后端服务正在运行`;
    } else if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${error.response.data?.message || error.response.statusText || '请求失败'}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      testCase,
      success: false,
      error: errorMessage,
    };
  }
}

// 打印测试结果
function printTestResult(result: TestResult) {
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
      result.questions.forEach((q: any, index: number) => {
        console.log(`     ${index + 1}. [${q.group || '无分组'}] ${q.question || q.text || '无问题文本'}`);
        if (q.options && q.options.length > 0) {
          const options = q.options.map((opt: any) => {
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

// 生成测试报告
function generateReport(results: TestResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试报告');
  console.log('='.repeat(80));

  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;

  console.log(`\n总测试数: ${totalTests}`);
  console.log(`通过: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`失败: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);

  // 计算平均指标
  const metricsWithData = results.filter(r => r.metrics);
  if (metricsWithData.length > 0) {
    const avgRequiredQuestions = metricsWithData.reduce((sum, r) => sum + (r.metrics?.requiredQuestions || 0), 0) / metricsWithData.length;
    const avgOptionalQuestions = metricsWithData.reduce((sum, r) => sum + (r.metrics?.optionalQuestions || 0), 0) / metricsWithData.length;
    const avgOptionQuality = metricsWithData.reduce((sum, r) => sum + (r.metrics?.optionQualityScore || 0), 0) / metricsWithData.length;
    const avgGroupAccuracy = metricsWithData.reduce((sum, r) => sum + (r.metrics?.groupAccuracy || 0), 0) / metricsWithData.length;
    const questionsWithoutGroupCount = metricsWithData.reduce((sum, r) => sum + (r.metrics?.questionsWithoutGroup || 0), 0);
    const exceedingLimitCount = metricsWithData.filter(r => r.metrics?.questionsExceedingLimit).length;

    console.log(`\n平均指标:`);
    console.log(`  - 平均必需问题数: ${avgRequiredQuestions.toFixed(1)}`);
    console.log(`  - 平均可选问题数: ${avgOptionalQuestions.toFixed(1)}`);
    console.log(`  - 平均选项质量评分: ${avgOptionQuality.toFixed(2)}/5.0`);
    console.log(`  - 平均分组准确率: ${(avgGroupAccuracy * 100).toFixed(1)}%`);
    console.log(`  - 缺少group字段的问题总数: ${questionsWithoutGroupCount}`);
    console.log(`  - 超过限制的测试用例数: ${exceedingLimitCount}`);

    // 验收标准
    console.log(`\n验收标准:`);
    console.log(`  ✅ 问题分组准确率: ${(avgGroupAccuracy * 100).toFixed(1)}% ${avgGroupAccuracy >= 0.95 ? '✓' : '✗'} (目标: ≥95%)`);
    console.log(`  ✅ 问题数量符合率: ${((totalTests - exceedingLimitCount) / totalTests * 100).toFixed(1)}% ${exceedingLimitCount === 0 ? '✓' : '✗'} (目标: ≥90%)`);
    console.log(`  ✅ 选项质量评分: ${avgOptionQuality.toFixed(2)}/5.0 ${avgOptionQuality >= 4.0 ? '✓' : '✗'} (目标: ≥4.0)`);
  }

  // 失败的测试用例
  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    console.log(`\n失败的测试用例:`);
    failedResults.forEach(r => {
      console.log(`  - ${r.testCase.name}: ${r.error || '未知错误'}`);
    });
  }
}

// 主函数
async function main() {
  console.log('🧪 LLM生成质量测试');
  console.log('='.repeat(80));
  console.log(`API Base URL: ${BASE_URL}`);
  console.log(`测试用例数: ${testCases.length}`);

  const results: TestResult[] = [];

  for (const testCase of testCases) {
    const result = await runTestCase(testCase);
    printTestResult(result);
    results.push(result);

    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  generateReport(results);

  // 退出码
  const allPassed = results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

// 运行测试
main().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
