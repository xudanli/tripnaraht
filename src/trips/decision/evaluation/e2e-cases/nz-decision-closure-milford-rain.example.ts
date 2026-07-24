/**
 * 新西兰决策闭环 v1 — Milford / SH94 暴雨 + 游船改期 golden（P0 国家包扩展样板）。
 */
import type { E2ECase } from '../e2e-case.types';
import { NZ_MILFORD_RAIN_DECISION_CLOSURE_LOGS } from './nz-decision-closure-logs.fixture';
import { loadE2eClosureGolden } from './load-e2e-closure-golden.util';

function loadClosureGolden(): Record<string, unknown> {
  return loadE2eClosureGolden('nz-decision-closure-milford-rain.golden.json');
}

export const nzDecisionClosureMilfordRainCase: E2ECase = {
  id: 'nz-decision-closure-milford-rain-001',
  name: '新西兰决策闭环 — Milford SH94 暴雨 golden',
  description:
    'P0：Fiordland 暴雨 + SH94 封闭；CGUS 改期游船；offline decision-closure gate 国家包扩展样板。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'nature-first',
      preferredRouteTypes: ['fiordland', 'scenic-drive'],
    },
    season: 3,
    countryCode: 'NZ',
    userQuery: '3 月南岛 Milford Sound，遇 SH94 暴雨封路，需要可审计判决书',
  },
  expected: {
    abuExpected: { action: 'ALLOW', reasonCodes: ['ABU_GATE_PASS'] },
    finalState: { allowed: true, planDays: 6 },
    scientificExpected: {
      decisionClosure: {
        mustHaveDecisionVerdict: true,
        chosenPlanId: 'repair-milford-cruise-v1',
        minRejectedPlans: 1,
        metaDecisionAuditIncludes: ['mcTotal', 'ragWorld'],
        narrationZhIncludes: ['推荐方案', 'repair-milford-cruise-v1'],
        monteCarloMinTotalSamples: 800,
        worldMaterialization: {
          minAppliedEvents: 1,
          roadIdsIncludes: ['SH94'],
          minWeatherDates: 1,
        },
      },
    },
  },
  metadata: {
    tags: ['new-zealand', 'nz', 'decision-closure', 'milford', 'sh94', 'p0', 'golden'],
    priority: 'P0',
    source: 'nz-decision-closure-milford-rain',
    fixtureKind: 'golden',
    decisionClosureGolden: loadClosureGolden(),
    decisionClosureDecisionLogs: NZ_MILFORD_RAIN_DECISION_CLOSURE_LOGS,
    cgusDsoSnapshotNote: 'Closure gate uses decisionClosureGolden only; NZ country pack extension template.',
    cgusDsoFixtureVersion: 'engine-dso-v1',
    cgusDsoGeneratedAt: '2026-05-30T00:00:00.000Z',
    cgusDsoSourceCaseId: 'nz-decision-closure-milford-rain-001',
  },
};
