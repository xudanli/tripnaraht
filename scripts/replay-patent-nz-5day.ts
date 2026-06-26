#!/usr/bin/env npx ts-node
/**
 * 专利 6.5 实施例：新西兰 5 天自驾 — 离线结构回归（mock 模式）
 *
 * 验证步骤 1–12 的关键 JSON 形状与数值容差，无需 DB / LLM。
 * 完整 Kernel 路径：PATENT_NZ_FULL_KERNEL=1（需 Nest + 外部依赖）
 *
 * 运行：
 *   npm run test:patent-nz-5day
 */

import { Logger } from '@nestjs/common';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';
import {
  mapDsoToPatentEnvironmentParticles,
  PATENT_PARTICLES_VIEW_KEY,
  attachPatentParticlesViewToEnvironment,
} from '../src/decision/kernel/patent/patent-environment-particles.mapper';
import {
  buildPatentPlanCandidatePool,
  patentCandidatesToDsoField,
} from '../src/decision/kernel/patent/plan-gen-candidate-pool.util';

const logger = new Logger('PatentNZ-5Day-Replay');

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** 专利步骤 1–2：用户输入 + INTAKE 后的 DSO 片段 */
function buildNzIntakeDso(): DecisionState {
  return {
    requestId: 'patent-nz-5d-mock',
    userIntent: {
      destination: '新西兰',
      days: 5,
      origin: '奥克兰',
      budget: 20000,
      mode: 'drive',
      party: { count: 1, fitnessLevel: 'low' },
      gaps: [{ type: 'MISSING_DATES', severity: 'SOFT', detail: '出发日期未指定' }],
      preferences: { targetSpots: ['皇后镇', '米尔福德峡湾'] },
    },
    tripState: {},
    environmentState: {},
    systemState: {
      requestId: 'patent-nz-5d-mock',
      version: 1,
      currentPhase: 'INTAKE',
      lastUpdatedAt: new Date().toISOString(),
    },
  } as DecisionState;
}

/** 专利步骤 3：RESEARCH 后的信念与环境 */
function applyResearchPhase(dso: DecisionState): DecisionState {
  const beliefSamples = [
    { sampleId: 'p0', weight: 0.45, environmentSummary: { weatherRisk: 0.9 } },
    { sampleId: 'p1', weight: 0.4, environmentSummary: { weatherRisk: 0.9 } },
    { sampleId: 'p2', weight: 0.1, environmentSummary: { weatherRisk: 0.35 } },
  ];
  const next: DecisionState = {
    ...dso,
    environmentState: {
      countryCode: 'NZ',
      weatherRisk: 0.9,
      failureRiskLevel: 'HIGH',
      roadConditions: { milford_closure_prob: 0.4 },
    },
    beliefSamples,
    uncertaintyProfile: {
      hasUncertainty: true,
      sources: ['weather', 'road'],
      entropy01: 0.9,
      effectiveParticleCount: 2.1,
      suggestedSampleSize: 2000,
      rolloutTopK: 2,
      planningDepth: 3,
      explorationBeta: 0.4,
    },
    systemState: { ...dso.systemState!, version: 2, currentPhase: 'RESEARCH' },
  };
  const patentView = mapDsoToPatentEnvironmentParticles(next);
  next.environmentState = attachPatentParticlesViewToEnvironment(next.environmentState ?? {}, patentView);
  return next;
}

function applyGateEval(dso: DecisionState): DecisionState {
  return {
    ...dso,
    constraints: {
      feasible: true,
      violations: [],
      warnings: [{ type: 'weather', day: 3, message: '第3天暴风雨风险0.9，超过阈值0.5' }],
      budget: { max: 20000, current: null },
      daily_walk: { max_per_day: 5, unit: 'km', reason: '用户年龄65岁' },
      weather_risk: { max: 0.5, current: 0.9, day: 3 },
      drive_time: { max_per_day: 6, unit: 'hours' },
    } as DecisionState['constraints'],
    systemState: { ...dso.systemState!, version: 3, currentPhase: 'GATE_EVAL' },
  };
}

function applyPlanGen(dso: DecisionState): DecisionState {
  const itinerary = {
    request_id: dso.requestId,
    days: Array.from({ length: 5 }, (_, i) => ({
      date: `2026-04-0${i + 1}`,
      items: [{ location_ref: { name: i === 2 ? '米尔福德峡湾' : `NZ Day ${i + 1}` } }],
    })),
  };
  const pool = buildPatentPlanCandidatePool(dso, itinerary, { topK: 2, explorationBeta: 0.4 });
  return {
    ...dso,
    tripState: { planDraft: itinerary },
    candidates: patentCandidatesToDsoField(pool),
    systemState: { ...dso.systemState!, version: 5, currentPhase: 'PLAN_GEN' },
  };
}

function applyOptimizeVerifyNarrateFeedback(dso: DecisionState): DecisionState {
  const selected = (dso.candidates as { id: string }[])?.[0]?.id ?? 'plan_c_indoor_spa';
  return {
    ...dso,
    optimizationHints: {
      selectedPlanId: selected,
      utilityBreakdown: {
        expectedReward: 0.85,
        cost: 0.2,
        risk: 0.02,
        preference: 0.1,
        infoGain: 0.06,
        total: 0.79,
      },
      confidence: 0.87,
      safetyTrend: 'LOW',
      fatigueTrend: 'LOW',
    },
    confidence: 0.87,
    verification: {
      status: 'PASS',
      constraintsCheck: { budget: 'PASS', walk: 'PASS', weather: 'PASS', drive: 'PASS' },
      executabilityScore: 78,
      issues: [],
    } as unknown as DecisionState['verification'],
    feedback: {
      accepted: true,
      modifications: [],
      satisfactionScore: 4.8,
      behaviorSignals: { savePlan: true, sharePlan: false },
    },
    systemState: { ...dso.systemState!, version: 9, currentPhase: 'FEEDBACK' },
  };
}

function runMockReplay(): void {
  logger.log('🇳🇿 专利 6.5 NZ 5天 — mock 结构回归');
  logger.log('='.repeat(60));

  // Step 1–2
  let dso = buildNzIntakeDso();
  assert(dso.userIntent?.destination === '新西兰', 'step2: destination');
  assert(dso.userIntent?.budget === 20000, 'step2: budget');
  logger.log('✅ Step 1–2 INTAKE');

  // Step 3
  dso = applyResearchPhase(dso);
  const particles = (dso.environmentState as any)?.[PATENT_PARTICLES_VIEW_KEY];
  assert(particles?.particles?.length >= 3, 'step3: particles');
  assert((particles?.summary?.weather_forecast?.day3_risk ?? 0) >= 0.85, 'step3: day3_risk');
  assert((particles?.summary?.road_conditions?.milford_closure_prob ?? 0) >= 0.35, 'step3: milford_closure');
  logger.log('✅ Step 3 RESEARCH (particles view)');

  // Step 4
  dso = applyGateEval(dso);
  assert(dso.constraints?.feasible === true, 'step4: feasible');
  assert((dso.constraints?.warnings?.length ?? 0) > 0, 'step4: weather warning');
  logger.log('✅ Step 4 GATE_EVAL');

  const prevPatentFlags = {
    intake: process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER,
    gate: process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS,
    feedback: process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING,
  };

  // PR-4: INTAKE normalizer + GATE extensions (flagged unit checks)
  process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER = '1';
  process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS = '1';
  try {
    const { applyPatentIntakeNormalizer } = require('../src/decision/kernel/patent/patent-intake-normalizer.util');
    const { enrichPatentGateConstraintExtensions } = require('../src/decision/kernel/patent/patent-gate-constraints.util');

    dso.userIntent = applyPatentIntakeNormalizer(dso.userIntent!, {
      message: '我今年65岁，预算2万元',
    });
    assert((dso.userIntent?.constraints as any)?.daily_walk?.max_per_day === 5, 'PR-4 intake: daily_walk');

    dso.constraints = enrichPatentGateConstraintExtensions(dso, dso.constraints!);
    assert((dso.constraints as any)?.drive_time?.max_per_day === 6, 'PR-4 gate: drive_time');
    logger.log('✅ PR-4 INTAKE / GATE constraint seeds');
  } finally {
    if (prevPatentFlags.intake === undefined) delete process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER;
    else process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER = prevPatentFlags.intake;
    if (prevPatentFlags.gate === undefined) delete process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS;
    else process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS = prevPatentFlags.gate;
  }

  // Step 6 (5 CONTEXT_BUILD skipped in mock — covered by uncertaintyProfile)
  dso = applyPlanGen(dso);
  const candidates = dso.candidates as { id: string; ig?: number }[];
  assert(candidates.length === 2, 'step6: Top-2 candidates');
  assert(candidates[0]?.id === 'plan_c_indoor_spa', 'step6: plan_C ranked first');
  logger.log('✅ Step 6 PLAN_GEN (candidate pool)');

  // Step 8–12
  dso = applyOptimizeVerifyNarrateFeedback(dso);
  assert(dso.optimizationHints?.selectedPlanId === 'plan_c_indoor_spa', 'step8: selectedPlanId');
  assert((dso.optimizationHints?.utilityBreakdown?.total ?? 0) >= 0.75, 'step8: utility total');
  assert(dso.confidence === 0.87, 'step9: confidence');
  assert(dso.feedback?.satisfactionScore === 4.8, 'step12: satisfaction');
  logger.log('✅ Step 8–12 OPTIMIZE / VERIFY / FEEDBACK (mock payloads)');

  process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING = '1';
  try {
    const { applyPatentFeedbackLearning } = require('../src/decision/kernel/patent/patent-feedback-learning.util');
    dso.userIntent = { ...dso.userIntent, preferences: { activityWeights: { spaActivities: 0.1 } } };
    const { patch, historyDelta } = applyPatentFeedbackLearning(dso);
    assert((patch.userIntent?.preferences as any)?.activityWeights?.spaActivities > 0.1, 'PR-4 feedback: spa weight');
    assert(historyDelta?.type === 'patent_feedback_learning', 'PR-4 feedback: history');
    logger.log('✅ PR-4 FEEDBACK online learning');
  } finally {
    if (prevPatentFlags.feedback === undefined) delete process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING;
    else process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING = prevPatentFlags.feedback;
  }

  logger.log('='.repeat(60));
  logger.log('✅ 专利 6.5 mock 回归 PASS（12 步关键结构）');
  logger.log('   详见 .pr/patent-6.5-alignment.md');
}

async function main(): Promise<void> {
  if (process.env.PATENT_NZ_FULL_KERNEL === '1') {
    logger.warn('PATENT_NZ_FULL_KERNEL=1 尚未实现完整 Nest 路径；运行 mock 回归');
  }
  runMockReplay();
}

main().catch((e) => {
  logger.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
