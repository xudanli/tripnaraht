/**
 * 与 `iceland-storm-icecave-failure` 配对的「天气转好」合成变体：
 * 第 4 天起风速回落、南岸可通行，研究轨从稳健收窄回到体验优先（双向策略弹性基线）。
 */
import type { E2ECase } from '../e2e-case.types';

export const icelandStormRecoveryExperienceFirstCase: E2ECase = {
  id: 'iceland-storm-recovery-experience-first-001',
  name: '冰岛南岸 — 天气转好后的体验优先（合成）',
  description:
    '同一行程骨架下，环境窗口恢复：风速约 5 m/s、Route 1 南岸开放；挫败感回落，关闭 stability 收窄轨，回到 EXPERIENCE_FIRST。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      travelPhilosophy: 'nature-first',
      preferredRouteTypes: ['south-coast', 'scenic', 'self-drive'],
    },
    season: 1,
    countryCode: 'IS',
    userQuery:
      '冰岛南岸 5 日；前 3 天暴风雪已打乱计划，第 4 天起风速约 5m/s、公路重新开放，希望把杰古沙龙与南岸摄影点排满',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
      reasonCodes: ['ABU_GATE_PASS'],
    },
    drdreExpected: {
      mustAdjust: false,
    },
    neptuneExpected: {
      mustRepair: false,
    },
    finalState: {
      allowed: true,
      planDays: 5,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget recovery-wind-5ms entropy=0.32 cand=10 repair=2',
      candidateSearchBudget: {
        maxCandidates: 10,
        repairMaxIters: 2,
        repairTopKPerCandidate: 3,
        maxNewCandidatesPerIter: 10,
        maxPoolSize: 24,
        stopWhenFeasibleCount: 5,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 10,
          repairMaxIters: 2,
          repairTopKPerCandidate: 3,
          maxNewCandidatesPerIter: 10,
          maxPoolSize: 24,
          stopWhenFeasibleCount: 5,
        },
        initialVariantCount: 4,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 5,
            feasibleCountAfterProjection: 4,
            infeasibleCountAfterProjection: 1,
            repairsGenerated: 1,
            repairsAccepted: 1,
            poolSizeAfterDedup: 5,
          },
        ],
        finalCandidateCount: 5,
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
        metaDecisionAuditIncludes: ['recovery-wind-5ms', 'cand=10'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE'],
      forbiddenStages: ['PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE'],
    },
    traceSignals: {
      stability_mode_active: false,
      frustration_circuit_triggered: false,
      narrative_track: 'EXPERIENCE_FIRST',
    },
  },
  metadata: {
    tags: ['iceland', 'south-coast', 'recovery', 'experience-first', 'synthetic'],
    priority: 'P1',
    source: 'iceland-storm-recovery-experience-first',
    description:
      '极端动态后的策略回弹：TD-05 traceSignals 与 storm baseline 对照（非 counterfactual 矩阵项，故不设 baselineCaseId）',
    fixtureKind: 'synthetic',
  },
};
