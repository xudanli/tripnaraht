#!/usr/bin/env ts-node

/**
 * DEM Regression 场景测试脚本
 * 
 * P1.2: DEM Regression 场景
 * - 不同路线节奏（四川 vs 云南 vs 西藏，相同偏好）
 * - 新手 vs 有经验者的每日行程长度变化
 * - 雨季 vs 旱季自动避开陡坡段
 * 
 * 用法：
 *   npx ts-node --project tsconfig.backend.json scripts/test-dem-regression-scenarios.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TripDecisionEngineService } from '../src/trips/decision/trip-decision-engine.service';
import { TripWorldState } from '../src/trips/decision/world-model';
import { DEMRouteSegmentationService } from '../src/trips/decision/services/dem-route-segmentation.service';
import { DEMDailyEnergyService } from '../src/trips/decision/services/dem-daily-energy.service';
import { DEMRiskScoringService } from '../src/trips/decision/services/dem-risk-scoring.service';
import { DEMEvidenceChainService } from '../src/trips/decision/services/dem-evidence-chain.service';
import { RouteDirectionSelectorService } from '../src/route-directions/services/route-direction-selector.service';
import { PrismaService } from '../src/prisma/prisma.service';

// 辅助函数：解析时间字符串（HH:MM）为分钟数
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

interface RegressionScenario {
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
    experienceLevel?: 'novice' | 'experienced';
    season?: 'dry' | 'rainy';
  };
  expected: {
    /** 期望的每日平均活动时间（分钟） */
    avgActiveMinutes?: { min: number; max: number };
    /** 期望的每日体力消耗比例 */
    avgEnergyRatio?: { min: number; max: number };
    /** 期望的过陡段数量 */
    steepSectionsCount?: { min: number; max: number };
    /** 期望的强制休息点数量 */
    mandatoryRestPointsCount?: { min: number; max: number };
    /** 期望的风险评分范围 */
    riskScore?: { min: number; max: number };
    /** 期望的连续高海拔天数 */
    consecutiveHighAltitudeDays?: { min: number; max: number };
  };
}

const scenarios: RegressionScenario[] = [
  // 场景1: 四川 vs 云南 vs 西藏，相同偏好（moderate pace）
  {
    id: 'SCENARIO_01',
    name: '四川 vs 云南 vs 西藏 - 相同偏好（中等节奏）',
    description: '测试相同偏好下，不同地区的路线节奏差异',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8, 摄影: 0.7 },
      },
    },
    expected: {
      avgActiveMinutes: { min: 300, max: 360 },
      avgEnergyRatio: { min: 0.5, max: 0.8 },
    },
  },
  {
    id: 'SCENARIO_02',
    name: '云南 - 相同偏好（中等节奏）',
    description: '测试云南地区在相同偏好下的路线节奏',
    input: {
      destination: 'CN_YUNNAN',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8, 摄影: 0.7 },
      },
    },
    expected: {
      avgActiveMinutes: { min: 300, max: 360 },
      avgEnergyRatio: { min: 0.5, max: 0.8 },
    },
  },
  {
    id: 'SCENARIO_03',
    name: '西藏 - 相同偏好（中等节奏）',
    description: '测试西藏地区在相同偏好下的路线节奏（应该更保守）',
    input: {
      destination: 'CN_XIZANG',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8, 摄影: 0.7 },
      },
    },
    expected: {
      avgActiveMinutes: { min: 240, max: 330 }, // 西藏应该更保守
      avgEnergyRatio: { min: 0.4, max: 0.7 }, // 体力消耗应该更低
      consecutiveHighAltitudeDays: { min: 3, max: 7 },
    },
  },

  // 场景2: 新手 vs 有经验者
  {
    id: 'SCENARIO_04',
    name: '新手 - 四川（轻松节奏）',
    description: '测试新手在四川的每日行程长度（应该更短）',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'relaxed',
        riskTolerance: 'low',
        intents: { 自然: 0.8 },
      },
      experienceLevel: 'novice',
    },
    expected: {
      avgActiveMinutes: { min: 200, max: 280 }, // 新手应该更短
      avgEnergyRatio: { min: 0.3, max: 0.6 }, // 体力消耗应该更低
      mandatoryRestPointsCount: { min: 2, max: 5 }, // 应该有更多休息点
    },
  },
  {
    id: 'SCENARIO_05',
    name: '有经验者 - 四川（挑战节奏）',
    description: '测试有经验者在四川的每日行程长度（应该更长）',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'intense',
        riskTolerance: 'high',
        intents: { 自然: 0.8, 挑战: 0.9 },
      },
      experienceLevel: 'experienced',
    },
    expected: {
      avgActiveMinutes: { min: 360, max: 450 }, // 有经验者应该更长
      avgEnergyRatio: { min: 0.7, max: 1.0 }, // 体力消耗可以更高
      mandatoryRestPointsCount: { min: 0, max: 2 }, // 休息点可以更少
    },
  },

  // 场景3: 雨季 vs 旱季
  {
    id: 'SCENARIO_06',
    name: '雨季 - 四川（自动避开陡坡段）',
    description: '测试雨季时自动避开陡坡段',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-07-15', // 雨季
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8 },
      },
      season: 'rainy',
    },
    expected: {
      steepSectionsCount: { min: 0, max: 2 }, // 雨季应该避开陡坡段
      avgEnergyRatio: { min: 0.4, max: 0.7 }, // 体力消耗应该更低
    },
  },
  {
    id: 'SCENARIO_07',
    name: '旱季 - 四川（可以包含陡坡段）',
    description: '测试旱季时可以包含更多陡坡段',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-10-15', // 旱季
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8, 挑战: 0.7 },
      },
      season: 'dry',
    },
    expected: {
      steepSectionsCount: { min: 1, max: 5 }, // 旱季可以包含更多陡坡段
      avgEnergyRatio: { min: 0.5, max: 0.9 }, // 体力消耗可以更高
    },
  },

  // 场景4: 高海拔连续天数
  {
    id: 'SCENARIO_08',
    name: '西藏 - 连续高海拔天数',
    description: '测试西藏连续高海拔天数的处理',
    input: {
      destination: 'CN_XIZANG',
      startDate: '2024-07-15',
      durationDays: 10,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 文化: 0.8, 自然: 0.7 },
      },
    },
    expected: {
      consecutiveHighAltitudeDays: { min: 5, max: 10 },
      mandatoryRestPointsCount: { min: 3, max: 8 }, // 应该有更多休息点
      riskScore: { min: 50, max: 90 }, // 风险评分应该较高
    },
  },

  // 场景5: 连续上升
  {
    id: 'SCENARIO_09',
    name: '四川 - 连续上升场景',
    description: '测试连续上升>1200m的处理',
    input: {
      destination: 'CN_SICHUAN',
      startDate: '2024-07-15',
      durationDays: 7,
      preferences: {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { 自然: 0.8, 徒步: 0.9 },
      },
    },
    expected: {
      mandatoryRestPointsCount: { min: 1, max: 4 }, // 应该有休息点
      riskScore: { min: 30, max: 70 },
    },
  },
];

interface TestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  issues: string[];
  metrics: {
    avgActiveMinutes?: number;
    avgEnergyRatio?: number;
    steepSectionsCount?: number;
    mandatoryRestPointsCount?: number;
    riskScore?: number;
    consecutiveHighAltitudeDays?: number;
  };
}

async function runScenario(
  scenario: RegressionScenario,
  decisionEngine: TripDecisionEngineService,
  segmentationService: DEMRouteSegmentationService,
  energyService: DEMDailyEnergyService,
  riskService: DEMRiskScoringService,
  evidenceService: DEMEvidenceChainService,
  routeSelector: RouteDirectionSelectorService,
  prisma: PrismaService
): Promise<TestResult> {
  const issues: string[] = [];
  const metrics: TestResult['metrics'] = {};

  try {
    // 1. 创建测试用的world state
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
        travelModeDefault: 'driving',
      },
      candidatesByDate: {},
      signals: {
        alerts: [],
        lastUpdatedAt: new Date().toISOString(),
      },
      policies: {},
    };

    // 2. 生成计划
    const { plan, log } = await decisionEngine.generatePlan(state);

    // 3. 计算指标
    let totalActiveMinutes = 0;
    let totalEnergyCost = 0;
    let maxEnergyBudget = 0;
    let daysWithActivities = 0;

    for (const day of plan.days) {
      const dayActiveMinutes = day.timeSlots.reduce((sum, slot) => {
        // 估算活动时间（从time和endTime计算，或使用默认值）
        if (slot.time && slot.endTime) {
          const start = parseTime(slot.time);
          const end = parseTime(slot.endTime);
          return sum + (end - start);
        }
        // 如果没有endTime，使用默认值60分钟
        return sum + 60;
      }, 0);

      if (dayActiveMinutes > 0) {
        totalActiveMinutes += dayActiveMinutes;
        daysWithActivities++;

        // 如果有体力预算信息，从evidenceChain中提取
        if (log.evidenceChain?.dailyEvidences) {
          const dayEvidence = log.evidenceChain.dailyEvidences.find(
            d => d.day === day.day
          );
          if (dayEvidence?.energyEvidence) {
            totalEnergyCost += dayEvidence.energyEvidence.totalEnergyCost;
            maxEnergyBudget += dayEvidence.energyEvidence.maxEnergyBudget;
          }
        }
      }
    }

    metrics.avgActiveMinutes = daysWithActivities > 0
      ? totalActiveMinutes / daysWithActivities
      : 0;

    metrics.avgEnergyRatio = maxEnergyBudget > 0
      ? totalEnergyCost / maxEnergyBudget
      : 0;

    // 4. 从拆段结果中提取指标
    const routeSegmentation = (state as any).routeSegmentation;
    if (routeSegmentation) {
      metrics.steepSectionsCount = routeSegmentation.steepSections?.length || 0;
      metrics.mandatoryRestPointsCount = routeSegmentation.mandatoryRestPoints?.length || 0;
    }

    // 5. 计算风险评分
    if (riskService) {
      const planRiskScore = await riskService.calculatePlanRiskScore(
        plan,
        routeSegmentation
      );
      metrics.riskScore = planRiskScore.totalRiskScore;
      metrics.consecutiveHighAltitudeDays = planRiskScore.consecutiveHighAltitudeDays;
    }

    // 6. 验证期望值
    const expected = scenario.expected;

    if (expected.avgActiveMinutes) {
      if (metrics.avgActiveMinutes < expected.avgActiveMinutes.min ||
          metrics.avgActiveMinutes > expected.avgActiveMinutes.max) {
        issues.push(
          `平均活动时间不匹配: ${metrics.avgActiveMinutes.toFixed(0)}分钟 ` +
          `(期望: ${expected.avgActiveMinutes.min}-${expected.avgActiveMinutes.max}分钟)`
        );
      }
    }

    if (expected.avgEnergyRatio) {
      if (metrics.avgEnergyRatio < expected.avgEnergyRatio.min ||
          metrics.avgEnergyRatio > expected.avgEnergyRatio.max) {
        issues.push(
          `平均体力消耗比例不匹配: ${(metrics.avgEnergyRatio * 100).toFixed(1)}% ` +
          `(期望: ${(expected.avgEnergyRatio.min * 100).toFixed(0)}-${(expected.avgEnergyRatio.max * 100).toFixed(0)}%)`
        );
      }
    }

    if (expected.steepSectionsCount !== undefined) {
      if (metrics.steepSectionsCount < expected.steepSectionsCount.min ||
          metrics.steepSectionsCount > expected.steepSectionsCount.max) {
        issues.push(
          `过陡段数量不匹配: ${metrics.steepSectionsCount} ` +
          `(期望: ${expected.steepSectionsCount.min}-${expected.steepSectionsCount.max})`
        );
      }
    }

    if (expected.mandatoryRestPointsCount !== undefined) {
      if (metrics.mandatoryRestPointsCount < expected.mandatoryRestPointsCount.min ||
          metrics.mandatoryRestPointsCount > expected.mandatoryRestPointsCount.max) {
        issues.push(
          `强制休息点数量不匹配: ${metrics.mandatoryRestPointsCount} ` +
          `(期望: ${expected.mandatoryRestPointsCount.min}-${expected.mandatoryRestPointsCount.max})`
        );
      }
    }

    if (expected.riskScore) {
      if (metrics.riskScore === undefined ||
          metrics.riskScore < expected.riskScore.min ||
          metrics.riskScore > expected.riskScore.max) {
        issues.push(
          `风险评分不匹配: ${metrics.riskScore?.toFixed(1) || 'N/A'} ` +
          `(期望: ${expected.riskScore.min}-${expected.riskScore.max})`
        );
      }
    }

    if (expected.consecutiveHighAltitudeDays) {
      if (metrics.consecutiveHighAltitudeDays === undefined ||
          metrics.consecutiveHighAltitudeDays < expected.consecutiveHighAltitudeDays.min ||
          metrics.consecutiveHighAltitudeDays > expected.consecutiveHighAltitudeDays.max) {
        issues.push(
          `连续高海拔天数不匹配: ${metrics.consecutiveHighAltitudeDays || 'N/A'} ` +
          `(期望: ${expected.consecutiveHighAltitudeDays.min}-${expected.consecutiveHighAltitudeDays.max})`
        );
      }
    }

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: issues.length === 0,
      issues,
      metrics,
    };
  } catch (error: any) {
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: false,
      issues: [`测试执行失败: ${error.message}`],
      metrics,
    };
  }
}

async function main() {
  console.log('🚀 开始 DEM Regression 场景测试\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const decisionEngine = app.get(TripDecisionEngineService);
  const segmentationService = app.get(DEMRouteSegmentationService);
  const energyService = app.get(DEMDailyEnergyService);
  const riskService = app.get(DEMRiskScoringService);
  const evidenceService = app.get(DEMEvidenceChainService);
  const routeSelector = app.get(RouteDirectionSelectorService);
  const prisma = app.get(PrismaService);

  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    console.log(`\n📋 测试场景: ${scenario.name}`);
    console.log(`   描述: ${scenario.description}`);
    
    const result = await runScenario(
      scenario,
      decisionEngine,
      segmentationService,
      energyService,
      riskService,
      evidenceService,
      routeSelector,
      prisma
    );

    results.push(result);

    if (result.passed) {
      console.log(`   ✅ 通过`);
    } else {
      console.log(`   ❌ 失败`);
      result.issues.forEach(issue => {
        console.log(`      - ${issue}`);
      });
    }

    // 输出指标
    console.log(`   指标:`);
    if (result.metrics.avgActiveMinutes !== undefined) {
      console.log(`      - 平均活动时间: ${result.metrics.avgActiveMinutes.toFixed(0)}分钟`);
    }
    if (result.metrics.avgEnergyRatio !== undefined) {
      console.log(`      - 平均体力消耗比例: ${(result.metrics.avgEnergyRatio * 100).toFixed(1)}%`);
    }
    if (result.metrics.steepSectionsCount !== undefined) {
      console.log(`      - 过陡段数量: ${result.metrics.steepSectionsCount}`);
    }
    if (result.metrics.mandatoryRestPointsCount !== undefined) {
      console.log(`      - 强制休息点数量: ${result.metrics.mandatoryRestPointsCount}`);
    }
    if (result.metrics.riskScore !== undefined) {
      console.log(`      - 风险评分: ${result.metrics.riskScore.toFixed(1)}`);
    }
    if (result.metrics.consecutiveHighAltitudeDays !== undefined) {
      console.log(`      - 连续高海拔天数: ${result.metrics.consecutiveHighAltitudeDays}`);
    }
  }

  // 汇总结果
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const passRate = (passed / results.length) * 100;

  console.log(`\n总用例数: ${results.length}`);
  console.log(`通过: ${passed} ✅`);
  console.log(`失败: ${failed} ❌`);
  console.log(`通过率: ${passRate.toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('失败的用例:');
    results.filter(r => !r.passed).forEach(result => {
      console.log(`\n  ❌ ${result.scenarioName} (${result.scenarioId})`);
      result.issues.forEach(issue => {
        console.log(`     - ${issue}`);
      });
    });
  }

  await app.close();

  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  });
}

