#!/usr/bin/env ts-node

/**
 * 测试决策反馈API
 * 
 * 测试以下API端点：
 * - POST /decision/feedback/plan-variant
 * - POST /decision/feedback/conflict
 * - POST /decision/feedback/decision-quality
 * - POST /decision/feedback/batch
 * - GET /decision/feedback/stats
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  response?: any;
}

async function testPlanVariantFeedback(): Promise<TestResult> {
  try {
    const response = await axios.post(
      `${BASE_URL}/decision/feedback/plan-variant`,
      {
        runId: `test_run_${Date.now()}`,
        variantId: `test_variant_${Date.now()}`,
        variantStrategy: 'balanced',
        userChoice: 'selected',
        rating: 5,
        reason: '测试：这个方案最符合我的需求',
      }
    );

    return {
      name: '计划变体反馈',
      success: response.status === 200,
      response: response.data,
    };
  } catch (error: any) {
    return {
      name: '计划变体反馈',
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

async function testConflictFeedback(): Promise<TestResult> {
  try {
    const response = await axios.post(
      `${BASE_URL}/decision/feedback/conflict`,
      {
        runId: `test_run_${Date.now()}`,
        conflictId: `test_conflict_${Date.now()}`,
        conflictType: 'budget vs hotel_quality',
        understood: true,
        explanationClear: true,
        tradeoffOptionsUseful: true,
        selectedTradeoffOption: '增加预算 20%',
      }
    );

    return {
      name: '约束冲突反馈',
      success: response.status === 200,
      response: response.data,
    };
  } catch (error: any) {
    return {
      name: '约束冲突反馈',
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

async function testDecisionQualityFeedback(): Promise<TestResult> {
  try {
    const response = await axios.post(
      `${BASE_URL}/decision/feedback/decision-quality`,
      {
        runId: `test_run_${Date.now()}`,
        overallSatisfaction: 5,
        planQuality: 5,
        conflictExplanationQuality: 4,
        tradeoffOptionsQuality: 4,
        decisionSpeed: 5,
        additionalFeedback: '测试：整体质量很好',
      }
    );

    return {
      name: '决策质量反馈',
      success: response.status === 200,
      response: response.data,
    };
  } catch (error: any) {
    return {
      name: '决策质量反馈',
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

async function testBatchFeedback(): Promise<TestResult> {
  try {
    const runId = `test_run_${Date.now()}`;
    const response = await axios.post(
      `${BASE_URL}/decision/feedback/batch`,
      {
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
      }
    );

    return {
      name: '批量反馈',
      success: response.status === 200,
      response: response.data,
    };
  } catch (error: any) {
    return {
      name: '批量反馈',
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

async function testFeedbackStats(): Promise<TestResult> {
  try {
    const response = await axios.get(
      `${BASE_URL}/decision/feedback/stats`,
      {
        params: {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天前
          endDate: new Date().toISOString(),
        },
      }
    );

    return {
      name: '反馈统计',
      success: response.status === 200,
      response: response.data,
    };
  } catch (error: any) {
    return {
      name: '反馈统计',
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

async function main() {
  console.log('🧪 开始测试决策反馈API...\n');
  console.log(`📍 API Base URL: ${BASE_URL}\n`);

  const results: TestResult[] = [];

  // 测试计划变体反馈
  console.log('1️⃣ 测试计划变体反馈...');
  results.push(await testPlanVariantFeedback());

  // 测试约束冲突反馈
  console.log('2️⃣ 测试约束冲突反馈...');
  results.push(await testConflictFeedback());

  // 测试决策质量反馈
  console.log('3️⃣ 测试决策质量反馈...');
  results.push(await testDecisionQualityFeedback());

  // 测试批量反馈
  console.log('4️⃣ 测试批量反馈...');
  results.push(await testBatchFeedback());

  // 测试反馈统计
  console.log('5️⃣ 测试反馈统计...');
  results.push(await testFeedbackStats());

  // 输出结果
  console.log('\n📊 测试结果汇总：\n');
  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.name}: 成功`);
      successCount++;
    } else {
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
