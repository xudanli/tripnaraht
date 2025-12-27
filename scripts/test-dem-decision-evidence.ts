#!/usr/bin/env ts-node

/**
 * DEM 决策证据服务测试脚本
 * 
 * PART 2: DEM 从"算高度"→"算决策"
 * 
 * 测试内容：
 * 1. DEM 证据生成（每个路段）
 * 2. 强制连续日疲劳检测（rolling window 3天）
 * 3. 走廊质量评分
 * 4. 可解释失败原因
 * 5. 强制检查规则（HARD violation 不能 finalize）
 * 6. 与决策引擎的集成
 * 
 * 用法：
 *   npx ts-node --project tsconfig.backend.json scripts/test-dem-decision-evidence.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TripDecisionEngineService } from '../src/trips/decision/trip-decision-engine.service';
import { DemDecisionEvidenceService } from '../src/trips/decision/services/dem-decision-evidence.service';
import { TripWorldState } from '../src/trips/decision/world-model';
import { RouteDirectionSelectorService } from '../src/route-directions/services/route-direction-selector.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface TestScenario {
  id: string;
  name: string;
  description: string;
  input: {
    destination: string;
    startDate: string;
    durationDays: number;
    preferences: {
      pace: 'relaxed' | 'moderate' | 'intense';
      riskTolerance: 'low' | 'medium' | 'high';
      intents?: Record<string, number>;
    };
    userConstraints?: {
      maxDailyAscentM?: number;
      maxElevationM?: number;
      maxSlopePct?: number;
      rollingAscent3DaysThreshold?: number;
    };
  };
  expected: {
    /** 期望是否有 HARD violation */
    hasHardViolation?: boolean;
    /** 期望是否有 SOFT violation */
    hasSoftViolation?: boolean;
    /** 期望是否检测到连续疲劳 */
    rollingFatigueDetected?: boolean;
    /** 期望的走廊质量评分范围 */
    corridorQualityScore?: { min: number; max: number };
    /** 期望的疲劳指数范围 */
    fatigueIndexRange?: { min: number; max: number };
    /** 期望的累计爬升范围（米） */
    cumulativeAscentRange?: { min: number; max: number };
  };
}

const scenarios: TestScenario[] = [
  {
    id: 'TEST_01',
    name: '西藏高海拔路线 - 测试连续疲劳检测',
    description: '测试在西藏高海拔地区，连续多日爬升是否触发疲劳检测',
    input: {
      destination: 'CN_XIZANG',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8, 摄影: 0.7 },
      },
      userConstraints: {
        maxDailyAscentM: 800,
        maxElevationM: 5500,
        maxSlopePct: 20,
        rollingAscent3DaysThreshold: 2000, // 3天累计爬升超过2000米触发疲劳
      },
    },
    expected: {
      hasHardViolation: false,
      rollingFatigueDetected: true, // 西藏高海拔应该检测到疲劳
      fatigueIndexRange: { min: 30, max: 80 },
    },
  },
  {
    id: 'TEST_02',
    name: '四川中等难度路线 - 测试走廊质量评分',
    description: '测试四川地区路线的走廊质量评分',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-07-15',
      durationDays: 5,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8 },
      },
    },
    expected: {
      hasHardViolation: false,
      corridorQualityScore: { min: 40, max: 90 },
    },
  },
  {
    id: 'TEST_03',
    name: '云南轻松路线 - 测试无违规情况',
    description: '测试在云南轻松路线下，应该没有 HARD violation',
    input: {
      destination: 'CN_YUNNAN',
      startDate: '2024-07-15',
      durationDays: 5,
      preferences: {
        pace: 'relaxed',
        riskTolerance: 'low',
        intents: { 文化: 0.7 },
      },
      userConstraints: {
        maxDailyAscentM: 500,
        maxElevationM: 3000,
        maxSlopePct: 15,
      },
    },
    expected: {
      hasHardViolation: false,
      hasSoftViolation: false,
      rollingFatigueDetected: false,
    },
  },
  {
    id: 'TEST_04',
    name: '极端约束测试 - 测试 HARD violation',
    description: '测试极端约束条件下是否触发 HARD violation',
    input: {
      destination: 'CN_XIZANG',
      startDate: '2024-07-15',
      durationDays: 5,
      preferences: {
        pace: 'intense',
        riskTolerance: 'high',
        intents: { 自然: 0.9 },
      },
      userConstraints: {
        maxDailyAscentM: 200, // 极低阈值
        maxElevationM: 3000, // 极低阈值
        maxSlopePct: 5, // 极低阈值
      },
    },
    expected: {
      hasHardViolation: true, // 应该触发 HARD violation
    },
  },
];

interface TestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  issues: string[];
  metrics: {
    segmentEvidencesCount: number;
    hasHardViolation: boolean;
    hasSoftViolation: boolean;
    rollingFatigueDetected?: boolean;
    corridorQualityScore?: number;
    avgFatigueIndex?: number;
    maxCumulativeAscent?: number;
    canProceed: boolean;
  };
  evidenceDetails?: {
    segmentEvidences: any[];
    rollingFatigue?: any;
    corridorQuality?: any;
    explainableFailure?: any;
  };
}

async function runScenario(
  scenario: TestScenario,
  decisionEngine: TripDecisionEngineService,
  demEvidenceService: DemDecisionEvidenceService,
  routeSelector: RouteDirectionSelectorService,
  prisma: PrismaService,
): Promise<TestResult> {
  const issues: string[] = [];
  const metrics: TestResult['metrics'] = {
    segmentEvidencesCount: 0,
    hasHardViolation: false,
    hasSoftViolation: false,
    canProceed: false,
  };

  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`测试场景: ${scenario.name}`);
    console.log(`描述: ${scenario.description}`);
    console.log(`${'='.repeat(80)}\n`);

    // 1. 创建测试用的 world state
    const state: TripWorldState = {
      context: {
        destination: scenario.input.destination,
        startDate: scenario.input.startDate,
        durationDays: scenario.input.durationDays,
        preferences: {
          pace: scenario.input.preferences.pace,
          riskTolerance: scenario.input.preferences.riskTolerance,
          intents: scenario.input.preferences.intents || {},
        },
        budget: {
          amount: 10000,
          currency: 'CNY',
        },
        travelModeDefault: 'drive',
      },
      candidatesByDate: {},
      signals: {
        alerts: [],
        lastUpdatedAt: new Date().toISOString(),
      },
      policies: {},
    };

    // 2. 生成计划
    console.log('📋 生成旅行计划...');
    const { plan, log } = await decisionEngine.generatePlan(state);

    if (!plan || plan.days.length === 0) {
      issues.push('计划生成失败：没有生成任何天数');
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: false,
        issues,
        metrics,
      };
    }

    console.log(`✅ 计划生成成功：${plan.days.length} 天`);

    // 3. 获取路线方向和分段结果
    // 从 state 中获取 routeDirectionRecommendations（决策引擎会将其存储在这里）
    const routeDirectionRecommendations = (state as any).routeDirectionRecommendations as any[];
    const selectedRouteDirection = routeDirectionRecommendations?.[0];
    const routeSegmentation = (state as any).routeSegmentation;

    // 4. 生成 DEM 证据
    console.log('🔍 生成 DEM 决策证据...');
    const demEvidenceResult = await demEvidenceService.generateEvidencePipeline(
      plan,
      selectedRouteDirection?.routeDirection,
      routeSegmentation,
    );

    // 5. 验证结果
    metrics.segmentEvidencesCount = demEvidenceResult.segmentEvidences.length;
    metrics.hasHardViolation = demEvidenceResult.hasHardViolation;
    metrics.hasSoftViolation = demEvidenceResult.hasSoftViolation;
    metrics.canProceed = demEvidenceResult.canProceed;
    metrics.rollingFatigueDetected = demEvidenceResult.rollingFatigue?.detected;
    metrics.corridorQualityScore = demEvidenceResult.corridorQuality?.totalScore;

    // 计算平均疲劳指数和最大累计爬升
    if (demEvidenceResult.segmentEvidences.length > 0) {
      const totalFatigue = demEvidenceResult.segmentEvidences.reduce(
        (sum, e) => sum + e.fatigueIndex,
        0,
      );
      metrics.avgFatigueIndex = totalFatigue / demEvidenceResult.segmentEvidences.length;

      const maxAscent = Math.max(
        ...demEvidenceResult.segmentEvidences.map((e) => e.cumulativeAscent),
      );
      metrics.maxCumulativeAscent = maxAscent;
    }

    // 6. 验证期望值
    if (scenario.expected.hasHardViolation !== undefined) {
      if (metrics.hasHardViolation !== scenario.expected.hasHardViolation) {
        issues.push(
          `HARD violation 期望: ${scenario.expected.hasHardViolation}, 实际: ${metrics.hasHardViolation}`,
        );
      }
    }

    if (scenario.expected.hasSoftViolation !== undefined) {
      if (metrics.hasSoftViolation !== scenario.expected.hasSoftViolation) {
        issues.push(
          `SOFT violation 期望: ${scenario.expected.hasSoftViolation}, 实际: ${metrics.hasSoftViolation}`,
        );
      }
    }

    if (scenario.expected.rollingFatigueDetected !== undefined) {
      if (metrics.rollingFatigueDetected !== scenario.expected.rollingFatigueDetected) {
        issues.push(
          `连续疲劳检测 期望: ${scenario.expected.rollingFatigueDetected}, 实际: ${metrics.rollingFatigueDetected}`,
        );
      }
    }

    if (scenario.expected.corridorQualityScore && metrics.corridorQualityScore !== undefined) {
      const { min, max } = scenario.expected.corridorQualityScore;
      if (metrics.corridorQualityScore < min || metrics.corridorQualityScore > max) {
        issues.push(
          `走廊质量评分 期望范围: [${min}, ${max}], 实际: ${metrics.corridorQualityScore}`,
        );
      }
    }

    if (scenario.expected.fatigueIndexRange && metrics.avgFatigueIndex !== undefined) {
      const { min, max } = scenario.expected.fatigueIndexRange;
      if (metrics.avgFatigueIndex < min || metrics.avgFatigueIndex > max) {
        issues.push(
          `平均疲劳指数 期望范围: [${min}, ${max}], 实际: ${metrics.avgFatigueIndex.toFixed(2)}`,
        );
      }
    }

    if (scenario.expected.cumulativeAscentRange && metrics.maxCumulativeAscent !== undefined) {
      const { min, max } = scenario.expected.cumulativeAscentRange;
      if (metrics.maxCumulativeAscent < min || metrics.maxCumulativeAscent > max) {
        issues.push(
          `最大累计爬升 期望范围: [${min}, ${max}], 实际: ${metrics.maxCumulativeAscent}`,
        );
      }
    }

    // 7. 打印详细结果
    console.log('\n📊 DEM 证据结果:');
    console.log(`  - 路段证据数量: ${metrics.segmentEvidencesCount}`);
    console.log(`  - HARD violation: ${metrics.hasHardViolation ? '❌ 是' : '✅ 否'}`);
    console.log(`  - SOFT violation: ${metrics.hasSoftViolation ? '⚠️ 是' : '✅ 否'}`);
    console.log(`  - 可以继续: ${metrics.canProceed ? '✅ 是' : '❌ 否'}`);

    if (demEvidenceResult.rollingFatigue) {
      console.log('\n🔄 连续疲劳检测:');
      console.log(`  - 检测到疲劳: ${demEvidenceResult.rollingFatigue.detected ? '✅ 是' : '❌ 否'}`);
      if (demEvidenceResult.rollingFatigue.detected) {
        console.log(`  - 开始日期: 第 ${demEvidenceResult.rollingFatigue.startDay} 天`);
        console.log(`  - 结束日期: 第 ${demEvidenceResult.rollingFatigue.endDay} 天`);
        console.log(`  - 3天滚动累计爬升: ${demEvidenceResult.rollingFatigue.rollingAscent3Days.toFixed(0)} 米`);
        console.log(`  - 用户阈值: ${demEvidenceResult.rollingFatigue.userThreshold} 米`);
        console.log(`  - 建议操作: ${demEvidenceResult.rollingFatigue.suggestedAction}`);
        console.log(`  - 解释: ${demEvidenceResult.rollingFatigue.explanation}`);
      }
    }

    if (demEvidenceResult.corridorQuality) {
      console.log('\n🏔️ 走廊质量评分:');
      console.log(`  - 总评分: ${demEvidenceResult.corridorQuality.totalScore.toFixed(2)}`);
      console.log(`  - 观景暴露度: ${demEvidenceResult.corridorQuality.viewExposureScore.toFixed(2)}`);
      console.log(`  - 海拔变化: ${demEvidenceResult.corridorQuality.elevationVariance.toFixed(2)}`);
      console.log(`  - 坡度惩罚: ${demEvidenceResult.corridorQuality.slopePenalty.toFixed(2)}`);
      console.log(`  - 解释: ${demEvidenceResult.corridorQuality.explanation}`);
    }

    if (demEvidenceResult.explainableFailure) {
      console.log('\n❌ 可解释失败原因:');
      console.log(`  - 原因: ${demEvidenceResult.explainableFailure.reason}`);
      console.log(`  - 受影响天数: ${demEvidenceResult.explainableFailure.affectedDays.join(', ')}`);
      console.log(`  - 用户影响: ${demEvidenceResult.explainableFailure.userImpact}`);
    }

    // 打印前3个路段证据的详细信息
    if (demEvidenceResult.segmentEvidences.length > 0) {
      console.log('\n📋 路段证据详情（前3个）:');
      demEvidenceResult.segmentEvidences.slice(0, 3).forEach((evidence, idx) => {
        console.log(`\n  路段 ${idx + 1} (${evidence.segmentId}):`);
        console.log(`    - 累计爬升: ${evidence.cumulativeAscent.toFixed(0)} 米`);
        console.log(`    - 最大坡度: ${evidence.maxSlopePct.toFixed(1)}%`);
        console.log(`    - 3天滚动累计爬升: ${evidence.rollingAscent3Days.toFixed(0)} 米`);
        console.log(`    - 疲劳指数: ${evidence.fatigueIndex.toFixed(2)}`);
        console.log(`    - 违规类型: ${evidence.violation}`);
        console.log(`    - 解释: ${evidence.explanation}`);
      });
    }

    // 8. 验证强制检查规则
    console.log('\n🔒 强制检查规则验证:');
    const validationResult = demEvidenceService.validatePlanHasEvidence(
      plan,
      demEvidenceResult.segmentEvidences,
    );
    console.log(`  - 计划是否有效: ${validationResult.valid ? '✅ 是' : '❌ 否'}`);
    if (!validationResult.valid) {
      console.log(`  - 原因: ${validationResult.reason}`);
      issues.push(`强制检查失败: ${validationResult.reason}`);
    }

    const passed = issues.length === 0;

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed,
      issues,
      metrics,
      evidenceDetails: {
        segmentEvidences: demEvidenceResult.segmentEvidences,
        rollingFatigue: demEvidenceResult.rollingFatigue,
        corridorQuality: demEvidenceResult.corridorQuality,
        explainableFailure: demEvidenceResult.explainableFailure,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`❌ 测试场景失败: ${errorMessage}`);
    if (errorStack) {
      console.error(errorStack);
    }
    issues.push(`测试执行失败: ${errorMessage}`);
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: false,
      issues,
      metrics,
    };
  }
}

async function main() {
  console.log('🚀 开始 DEM 决策证据服务测试\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const decisionEngine = app.get(TripDecisionEngineService);
  const demEvidenceService = app.get(DemDecisionEvidenceService);
  const routeSelector = app.get(RouteDirectionSelectorService);
  const prisma = app.get(PrismaService);

  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(
      scenario,
      decisionEngine,
      demEvidenceService,
      routeSelector,
      prisma,
    );
    results.push(result);
  }

  // 打印总结
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试总结');
  console.log('='.repeat(80) + '\n');

  let passedCount = 0;
  let failedCount = 0;

  for (const result of results) {
    const status = result.passed ? '✅ 通过' : '❌ 失败';
    console.log(`${status} - ${result.scenarioName} (${result.scenarioId})`);
    if (!result.passed && result.issues.length > 0) {
      result.issues.forEach((issue) => {
        console.log(`   ⚠️  ${issue}`);
      });
    }
    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`总计: ${results.length} 个场景`);
  console.log(`✅ 通过: ${passedCount}`);
  console.log(`❌ 失败: ${failedCount}`);
  console.log('='.repeat(80) + '\n');

  await app.close();

  // 如果有失败的测试，退出码为1
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});

