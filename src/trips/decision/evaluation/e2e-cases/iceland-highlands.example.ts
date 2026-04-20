// src/trips/decision/evaluation/e2e-cases/iceland-highlands.example.ts
/**
 * 冰岛高地 E2E Case 示例
 * 
 * 这是一个示例 E2E Case，用于测试冰岛高地路线的决策流程
 */

import { E2ECase } from '../e2e-case.types';

export const icelandHighlandsCase: E2ECase = {
  id: 'iceland-highlands-001',
  name: '冰岛高地路线 - 中等强度用户',
  description: '测试中等强度用户在夏季（7月）选择冰岛高地路线的决策流程',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      travelPhilosophy: 'adventure',
      preferredRouteTypes: ['highlands', 'nature', 'hiking'],
    },
    season: 7, // 7月
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地，中等强度，7天行程',
  },
  expected: {
    routeDirectionId: undefined, // 不指定具体路线，让系统选择
    routeDirectionTags: ['highlands', 'nature'],
    abuExpected: {
      action: 'ALLOW', // 预期通过安全检查
      reasonCodes: [],
    },
    drdreExpected: {
      mustAdjust: false, // 中等强度用户，预期不需要调整
    },
    neptuneExpected: {
      mustRepair: false, // 预期不需要空间修复
    },
    finalState: {
      allowed: true,
      planDays: 7,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.42 cand=12 repair=2',
      candidateSearchBudget: {
        maxCandidates: 12,
        repairMaxIters: 2,
        repairTopKPerCandidate: 3,
        maxNewCandidatesPerIter: 12,
        maxPoolSize: 24,
        stopWhenFeasibleCount: 6,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 12,
          repairMaxIters: 2,
          repairTopKPerCandidate: 3,
          maxNewCandidatesPerIter: 12,
          maxPoolSize: 24,
          stopWhenFeasibleCount: 6,
        },
        initialVariantCount: 4,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 5,
            feasibleCountAfterProjection: 5,
            infeasibleCountAfterProjection: 0,
            repairsGenerated: 0,
            repairsAccepted: 0,
            poolSizeAfterDedup: 5,
          },
        ],
        finalCandidateCount: 5,
        finalFeasibleCount: 5,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 1,
        minFinalFeasibleCount: 5,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=12', 'repair=2'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE'],
      forbiddenStages: ['PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE'],
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'summer'],
    priority: 'P1',
    source: 'iceland-highlands',
    description: '冰岛高地路线 E2E 测试用例',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-highlands-core',
  },
};

/**
 * 冰岛高地 - DEM 缺失场景
 */
export const icelandHighlandsDemMissingCase: E2ECase = {
  id: 'iceland-highlands-dem-missing-001',
  name: '冰岛高地路线 - DEM 缺失场景',
  description: '测试当 DEM Evidence 缺失时，Abu 必须 REJECT',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地',
  },
  expected: {
    abuExpected: {
      action: 'REJECT',
      reasonCodes: ['E_DEM_MISSING'], // 必须包含 DEM 缺失错误码
      violations: ['DEM Evidence'],
    },
    finalState: {
      allowed: false,
    },
    traceSummary: {
      // Failure-path trace should remain stable and minimal: no candidate search expected.
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-dem-missing no_optimize',
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        metaDecisionAuditIncludes: ['no_optimize'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE'],
      forbiddenStages: ['PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE'],
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'dem-missing'],
    priority: 'P0',
    source: 'iceland-highlands',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-highlands-core',
    baselineCaseId: 'iceland-highlands-001',
    counterfactualExpectation: {
      expectedOutcomeShift: 'REJECT',
      requiredAdditionalStages: ['PLAN_SCORE'],
    },
  },
};

/**
 * 冰岛高地 - 需要节奏调整场景
 */
export const icelandHighlandsPaceAdjustCase: E2ECase = {
  id: 'iceland-highlands-pace-adjust-001',
  name: '冰岛高地路线 - 需要节奏调整',
  description: '测试高强度用户在连续高爬升场景下，Dr.Dre 必须插入缓冲日',
  input: {
    userProfile: {
      pacePreference: 'FAST',
      altitudeTolerance: 'HIGH',
      riskTolerance: 'HIGH',
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地，高强度，10天行程',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: true, // 预期需要调整
      adjustmentTypes: ['BUFFER_DAY'], // 预期插入缓冲日
    },
    finalState: {
      allowed: true,
      planDays: 10,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.78 cand=24 repair=4',
      candidateSearchBudget: {
        maxCandidates: 24,
        repairMaxIters: 4,
        repairTopKPerCandidate: 4,
        maxNewCandidatesPerIter: 20,
        maxPoolSize: 60,
        stopWhenFeasibleCount: 10,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 24,
          repairMaxIters: 4,
          repairTopKPerCandidate: 4,
          maxNewCandidatesPerIter: 20,
          maxPoolSize: 60,
          stopWhenFeasibleCount: 10,
        },
        initialVariantCount: 8,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 9,
            feasibleCountAfterProjection: 3,
            infeasibleCountAfterProjection: 6,
            repairsGenerated: 8,
            repairsAccepted: 4,
            poolSizeAfterDedup: 11,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 11,
            feasibleCountAfterProjection: 8,
            infeasibleCountAfterProjection: 3,
            repairsGenerated: 6,
            repairsAccepted: 2,
            poolSizeAfterDedup: 12,
          },
        ],
        finalCandidateCount: 12,
        finalFeasibleCount: 8,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 2,
        minFinalFeasibleCount: 8,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=24', 'repair=4'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST'],
      forbiddenStages: ['SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST'],
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'pace-adjust'],
    priority: 'P1',
    source: 'iceland-highlands',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-highlands-core',
    baselineCaseId: 'iceland-highlands-001',
    counterfactualExpectation: {
      expectedOutcomeShift: 'ADD_ADJUST',
      minCandidateBudgetDelta: 12,
      minRepairMaxItersDelta: 2,
      requiredAdditionalStages: ['PACE_ADJUST'],
    },
  },
};

/**
 * 冰岛高地 - 需要空间修复场景
 */
export const icelandHighlandsSpatialRepairCase: E2ECase = {
  id: 'iceland-highlands-spatial-repair-001',
  name: '冰岛高地路线 - 需要空间修复',
  description: '测试当空间约束恶化时，Neptune 必须执行替换/修复，并提升搜索预算',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'LOW',
      travelPhilosophy: 'scenic',
      preferredRouteTypes: ['highlands', 'nature'],
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '我想在7月去冰岛高地，但希望避开封闭路段和高风险空间点位',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: false,
    },
    neptuneExpected: {
      mustRepair: true,
      replacementTypes: ['SEGMENT'],
    },
    finalState: {
      allowed: true,
      planDays: 7,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.66 cand=18 repair=3',
      candidateSearchBudget: {
        maxCandidates: 18,
        repairMaxIters: 3,
        repairTopKPerCandidate: 4,
        maxNewCandidatesPerIter: 16,
        maxPoolSize: 40,
        stopWhenFeasibleCount: 8,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 18,
          repairMaxIters: 3,
          repairTopKPerCandidate: 4,
          maxNewCandidatesPerIter: 16,
          maxPoolSize: 40,
          stopWhenFeasibleCount: 8,
        },
        initialVariantCount: 6,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 7,
            feasibleCountAfterProjection: 2,
            infeasibleCountAfterProjection: 5,
            repairsGenerated: 6,
            repairsAccepted: 3,
            poolSizeAfterDedup: 9,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 9,
            feasibleCountAfterProjection: 6,
            infeasibleCountAfterProjection: 3,
            repairsGenerated: 4,
            repairsAccepted: 2,
            poolSizeAfterDedup: 10,
          },
        ],
        finalCandidateCount: 10,
        finalFeasibleCount: 6,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 2,
        minFinalFeasibleCount: 6,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=18', 'repair=3'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'SPATIAL_REPAIR'],
      forbiddenStages: ['PACE_ADJUST'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'SPATIAL_REPAIR'],
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'spatial-repair'],
    priority: 'P1',
    source: 'iceland-highlands',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-highlands-core',
    baselineCaseId: 'iceland-highlands-001',
    counterfactualExpectation: {
      expectedOutcomeShift: 'ADD_REPAIR',
      minCandidateBudgetDelta: 6,
      minRepairMaxItersDelta: 1,
      requiredAdditionalStages: ['SPATIAL_REPAIR'],
    },
  },
};

/**
 * 冰岛高地 - 复合压力（节奏 + 空间修复）
 */
export const icelandHighlandsCompoundStressCase: E2ECase = {
  id: 'iceland-highlands-compound-stress-001',
  name: '冰岛高地路线 - 复合压力场景',
  description: '测试当高节奏压力与空间约束同时恶化时，系统需要同时调整节奏并做空间修复',
  input: {
    userProfile: {
      pacePreference: 'FAST',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'LOW',
      travelPhilosophy: 'adventure',
      preferredRouteTypes: ['highlands', 'nature', 'remote'],
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '我想在7月走冰岛高地深线，但天气窗口紧、体能压力大，还要避开高风险路段',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: true,
      adjustmentTypes: ['BUFFER_DAY'],
    },
    neptuneExpected: {
      mustRepair: true,
      replacementTypes: ['SEGMENT'],
    },
    finalState: {
      allowed: true,
      planDays: 10,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.88 cand=30 repair=5',
      candidateSearchBudget: {
        maxCandidates: 30,
        repairMaxIters: 5,
        repairTopKPerCandidate: 5,
        maxNewCandidatesPerIter: 24,
        maxPoolSize: 72,
        stopWhenFeasibleCount: 12,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 30,
          repairMaxIters: 5,
          repairTopKPerCandidate: 5,
          maxNewCandidatesPerIter: 24,
          maxPoolSize: 72,
          stopWhenFeasibleCount: 12,
        },
        initialVariantCount: 10,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 11,
            feasibleCountAfterProjection: 2,
            infeasibleCountAfterProjection: 9,
            repairsGenerated: 10,
            repairsAccepted: 5,
            poolSizeAfterDedup: 13,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 13,
            feasibleCountAfterProjection: 6,
            infeasibleCountAfterProjection: 7,
            repairsGenerated: 8,
            repairsAccepted: 3,
            poolSizeAfterDedup: 15,
          },
          {
            iter: 2,
            poolSizeBeforeProjection: 15,
            feasibleCountAfterProjection: 10,
            infeasibleCountAfterProjection: 5,
            repairsGenerated: 6,
            repairsAccepted: 2,
            poolSizeAfterDedup: 16,
          },
        ],
        finalCandidateCount: 16,
        finalFeasibleCount: 10,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 3,
        minFinalFeasibleCount: 10,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=30', 'repair=5'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST', 'SPATIAL_REPAIR'],
    },
  },
  metadata: {
    tags: ['iceland', 'highlands', 'compound-stress'],
    priority: 'P1',
    source: 'iceland-highlands',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-highlands-core',
    baselineCaseId: 'iceland-highlands-001',
    counterfactualExpectation: {
      expectedOutcomeShift: 'ADD_ADJUST_AND_REPAIR',
      minCandidateBudgetDelta: 18,
      minRepairMaxItersDelta: 3,
      requiredAdditionalStages: ['PACE_ADJUST', 'SPATIAL_REPAIR'],
    },
  },
};

/**
 * 冰岛环岛/沿海 - 保守基线场景
 */
export const icelandRingRoadCase: E2ECase = {
  id: 'iceland-ring-road-001',
  name: '冰岛环岛路线 - 保守基线',
  description: '测试较低风险偏好的沿海/环岛基线方案，默认无需节奏调整或空间修复',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'comfort',
      preferredRouteTypes: ['ring-road', 'coastal', 'scenic'],
    },
    season: 8,
    countryCode: 'IS',
    userQuery: '我想在8月环岛自驾，偏保守舒适，不走高风险高地路段',
  },
  expected: {
    routeDirectionId: undefined,
    routeDirectionTags: ['ring-road', 'coastal'],
    abuExpected: {
      action: 'ALLOW',
      reasonCodes: [],
    },
    drdreExpected: {
      mustAdjust: false,
    },
    neptuneExpected: {
      mustRepair: false,
    },
    finalState: {
      allowed: true,
      planDays: 8,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.28 cand=8 repair=1',
      candidateSearchBudget: {
        maxCandidates: 8,
        repairMaxIters: 1,
        repairTopKPerCandidate: 2,
        maxNewCandidatesPerIter: 8,
        maxPoolSize: 16,
        stopWhenFeasibleCount: 5,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 8,
          repairMaxIters: 1,
          repairTopKPerCandidate: 2,
          maxNewCandidatesPerIter: 8,
          maxPoolSize: 16,
          stopWhenFeasibleCount: 5,
        },
        initialVariantCount: 3,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 4,
            feasibleCountAfterProjection: 4,
            infeasibleCountAfterProjection: 0,
            repairsGenerated: 0,
            repairsAccepted: 0,
            poolSizeAfterDedup: 4,
          },
        ],
        finalCandidateCount: 4,
        finalFeasibleCount: 4,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 1,
        minFinalFeasibleCount: 4,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=8', 'repair=1'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE'],
      forbiddenStages: ['PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE'],
    },
  },
  metadata: {
    tags: ['iceland', 'ring-road', 'coastal'],
    priority: 'P1',
    source: 'iceland-ring-road',
    description: '冰岛沿海/环岛基线 E2E 测试用例',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-ring-road-core',
  },
};

/**
 * 冰岛环岛/沿海 - 体能/节奏压力上升
 */
export const icelandRingRoadPaceAdjustCase: E2ECase = {
  id: 'iceland-ring-road-pace-adjust-001',
  name: '冰岛环岛路线 - 节奏压力升高',
  description: '测试在沿海基线下，当用户节奏更激进且行程更紧时需要节奏调整',
  input: {
    userProfile: {
      pacePreference: 'FAST',
      altitudeTolerance: 'LOW',
      riskTolerance: 'MEDIUM',
      travelPhilosophy: 'comfort',
      preferredRouteTypes: ['ring-road', 'coastal'],
    },
    season: 8,
    countryCode: 'IS',
    userQuery: '我想8月快速环岛，但每天车程和活动都压得更紧',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: true,
      adjustmentTypes: ['BUFFER_DAY'],
    },
    neptuneExpected: {
      mustRepair: false,
    },
    finalState: {
      allowed: true,
      planDays: 9,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.51 cand=14 repair=2',
      candidateSearchBudget: {
        maxCandidates: 14,
        repairMaxIters: 2,
        repairTopKPerCandidate: 3,
        maxNewCandidatesPerIter: 12,
        maxPoolSize: 28,
        stopWhenFeasibleCount: 7,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 14,
          repairMaxIters: 2,
          repairTopKPerCandidate: 3,
          maxNewCandidatesPerIter: 12,
          maxPoolSize: 28,
          stopWhenFeasibleCount: 7,
        },
        initialVariantCount: 5,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 6,
            feasibleCountAfterProjection: 3,
            infeasibleCountAfterProjection: 3,
            repairsGenerated: 4,
            repairsAccepted: 2,
            poolSizeAfterDedup: 7,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 7,
            feasibleCountAfterProjection: 6,
            infeasibleCountAfterProjection: 1,
            repairsGenerated: 2,
            repairsAccepted: 1,
            poolSizeAfterDedup: 8,
          },
        ],
        finalCandidateCount: 8,
        finalFeasibleCount: 6,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 2,
        minFinalFeasibleCount: 6,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=14', 'repair=2'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST'],
      forbiddenStages: ['SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST'],
    },
  },
  metadata: {
    tags: ['iceland', 'ring-road', 'pace-adjust'],
    priority: 'P1',
    source: 'iceland-ring-road',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-ring-road-core',
    baselineCaseId: 'iceland-ring-road-001',
    counterfactualExpectation: {
      expectedOutcomeShift: 'ADD_ADJUST',
      minCandidateBudgetDelta: 6,
      minRepairMaxItersDelta: 1,
      requiredAdditionalStages: ['PACE_ADJUST'],
    },
  },
};

/**
 * 冰岛环岛/沿海 - 空间/天气窗口恶化
 */
export const icelandRingRoadSpatialRepairCase: E2ECase = {
  id: 'iceland-ring-road-spatial-repair-001',
  name: '冰岛环岛路线 - 空间约束恶化',
  description: '测试在沿海基线下，当道路/天气窗口恶化时需要空间修复但仍保持允许',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'comfort',
      preferredRouteTypes: ['ring-road', 'coastal'],
    },
    season: 8,
    countryCode: 'IS',
    userQuery: '我想8月沿海环岛，但需要避开受天气和施工影响的海岸段',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: false,
    },
    neptuneExpected: {
      mustRepair: true,
      replacementTypes: ['SEGMENT'],
    },
    finalState: {
      allowed: true,
      planDays: 8,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget entropy=0.49 cand=12 repair=2',
      candidateSearchBudget: {
        maxCandidates: 12,
        repairMaxIters: 2,
        repairTopKPerCandidate: 3,
        maxNewCandidatesPerIter: 10,
        maxPoolSize: 24,
        stopWhenFeasibleCount: 6,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 12,
          repairMaxIters: 2,
          repairTopKPerCandidate: 3,
          maxNewCandidatesPerIter: 10,
          maxPoolSize: 24,
          stopWhenFeasibleCount: 6,
        },
        initialVariantCount: 4,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 5,
            feasibleCountAfterProjection: 2,
            infeasibleCountAfterProjection: 3,
            repairsGenerated: 3,
            repairsAccepted: 2,
            poolSizeAfterDedup: 6,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 6,
            feasibleCountAfterProjection: 5,
            infeasibleCountAfterProjection: 1,
            repairsGenerated: 2,
            repairsAccepted: 1,
            poolSizeAfterDedup: 7,
          },
        ],
        finalCandidateCount: 7,
        finalFeasibleCount: 5,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 2,
        minFinalFeasibleCount: 5,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=12', 'repair=2'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'SPATIAL_REPAIR'],
      forbiddenStages: ['PACE_ADJUST'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'SPATIAL_REPAIR'],
    },
  },
  metadata: {
    tags: ['iceland', 'ring-road', 'spatial-repair'],
    priority: 'P1',
    source: 'iceland-ring-road',
    fixtureKind: 'synthetic',
    counterfactualGroup: 'iceland-ring-road-core',
    baselineCaseId: 'iceland-ring-road-001',
    counterfactualExpectation: {
      expectedOutcomeShift: 'ADD_REPAIR',
      minCandidateBudgetDelta: 4,
      minRepairMaxItersDelta: 1,
      requiredAdditionalStages: ['SPATIAL_REPAIR'],
    },
  },
};
