/**
 * 冰岛南岸暴风雪 + 蓝冰洞取消 — 纯合成 E2E（TD-05 回放矩阵 + cgusDsoSnapshot）。
 * 叙事 6.1 断言见 iceland-storm-icecave-failure.6-1-narrative.spec.ts
 */
import fs from 'fs';
import path from 'path';
import type { E2ECase, ReplayTraceSignalsExpected } from '../e2e-case.types';

const snapshotPath = path.join(__dirname, 'iceland-storm-icecave-failure.json');

function loadStormFixtureSnapshot(): Record<string, unknown> {
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function traceSignalsFromStormJson(): ReplayTraceSignalsExpected {
  const snap = loadStormFixtureSnapshot();
  const exp = snap.expected as { trace_signals?: Record<string, unknown> } | undefined;
  const ts = exp?.trace_signals;
  if (!ts) {
    return {
      stability_mode_active: true,
      frustration_circuit_triggered: true,
      narrative_track: 'EMPATHY_RECOVERY',
    };
  }
  return {
    stability_mode_active: ts.stability_mode_active as boolean | undefined,
    frustration_circuit_triggered: ts.frustration_circuit_triggered as boolean | undefined,
    narrative_track: ts.narrative_track as string | undefined,
  };
}

export const icelandStormIcecaveFailureCase: E2ECase = {
  id: 'iceland-storm-icecave-failure-001',
  name: '冰岛南岸暴风雪 — 蓝冰洞不可用（合成）',
  description:
    '极端负面场景：RED_ALERT、1 号公路南岸封闭、蓝冰洞 UNAVAILABLE；心理账户高挫败感 + 研究稳健模式；预期仍 ALLOW 且 POI 级空间修复 + 节奏缓冲。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'LOW',
      travelPhilosophy: 'nature-first',
      preferredRouteTypes: ['south-coast', 'ice-cave', 'self-drive'],
    },
    season: 1,
    countryCode: 'IS',
    userQuery: '1 月冰岛南岸自驾，已订蓝冰洞团，遇暴风雪封路和洞体关闭',
  },
  expected: {
    abuExpected: {
      action: 'ALLOW',
      reasonCodes: ['ABU_GATE_PASS'],
    },
    drdreExpected: {
      mustAdjust: true,
      adjustmentTypes: ['BUFFER_DAY'],
    },
    neptuneExpected: {
      mustRepair: true,
      replacementTypes: ['POI'],
    },
    finalState: {
      allowed: true,
      planDays: 5,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'fixture-meta-budget storm-south entropy=0.91 cand=28 repair=4',
      candidateSearchBudget: {
        maxCandidates: 28,
        repairMaxIters: 4,
        repairTopKPerCandidate: 4,
        maxNewCandidatesPerIter: 20,
        maxPoolSize: 56,
        stopWhenFeasibleCount: 8,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 28,
          repairMaxIters: 4,
          repairTopKPerCandidate: 4,
          maxNewCandidatesPerIter: 20,
          maxPoolSize: 56,
          stopWhenFeasibleCount: 8,
        },
        initialVariantCount: 8,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 10,
            feasibleCountAfterProjection: 2,
            infeasibleCountAfterProjection: 8,
            repairsGenerated: 8,
            repairsAccepted: 4,
            poolSizeAfterDedup: 12,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 12,
            feasibleCountAfterProjection: 6,
            infeasibleCountAfterProjection: 6,
            repairsGenerated: 5,
            repairsAccepted: 3,
            poolSizeAfterDedup: 14,
          },
        ],
        finalCandidateCount: 14,
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
        metaDecisionAuditIncludes: ['cand=28', 'repair=4', 'storm-south'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'PACE_ADJUST', 'SPATIAL_REPAIR'],
    },
    traceSignals: traceSignalsFromStormJson(),
  },
  metadata: {
    tags: ['iceland', 'south-coast', 'blizzard', 'blue-ice-cave', '6.1-narrative', 'synthetic'],
    priority: 'P0',
    source: 'iceland-storm-icecave-failure',
    description: '极端动态 + 高挫败：回放决策链与 DSO 快照基线',
    fixtureKind: 'synthetic',
    cgusDsoSnapshot: loadStormFixtureSnapshot(),
    cgusDsoSnapshotNote: 'Synthetic JSON beside this module; wind/road/POI + emotional account for offline CGUS / narrator contract tests.',
    cgusDsoFixtureVersion: 'engine-dso-v1',
    cgusDsoGeneratedAt: '2026-05-14T00:00:00.000Z',
    cgusDsoSourceCaseId: 'iceland-storm-icecave-failure-001',
  },
};
