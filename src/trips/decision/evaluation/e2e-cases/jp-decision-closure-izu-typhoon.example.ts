/**
 * 日本决策闭环 v1 — 伊豆 Route 134 台风雨 golden（P0 国家包扩展）。
 */
import type { E2ECase } from '../e2e-case.types';
import { JP_IZU_TYPHOON_DECISION_CLOSURE_LOGS } from './jp-decision-closure-logs.fixture';
import { loadE2eClosureGolden } from './load-e2e-closure-golden.util';

function loadClosureGolden(): Record<string, unknown> {
  return loadE2eClosureGolden('jp-decision-closure-izu-typhoon.golden.json');
}

export const jpDecisionClosureIzuTyphoonCase: E2ECase = {
  id: 'jp-decision-closure-izu-typhoon-001',
  name: '日本决策闭环 — 伊豆 Route 134 台风雨 golden',
  description:
    'P0：伊豆半岛台风雨 + Route 134 封路；CGUS inland 改线；offline decision-closure gate 国家包扩展。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'onsen-scenic',
      preferredRouteTypes: ['izu-peninsula', 'coastal-drive'],
    },
    season: 3,
    countryCode: 'JP',
    userQuery: '9 月伊豆半岛自驾，Route 134 因台风雨封路，需要可审计判决书',
  },
  expected: {
    abuExpected: { action: 'ALLOW', reasonCodes: ['ABU_GATE_PASS'] },
    finalState: { allowed: true, planDays: 6 },
    scientificExpected: {
      decisionClosure: {
        mustHaveDecisionVerdict: true,
        chosenPlanId: 'repair-izu-inland-v1',
        minRejectedPlans: 1,
        metaDecisionAuditIncludes: ['mcTotal', 'ragWorld'],
        narrationZhIncludes: ['推荐方案', 'repair-izu-inland-v1'],
        monteCarloMinTotalSamples: 700,
        worldMaterialization: {
          minAppliedEvents: 1,
          roadIdsIncludes: ['ROUTE134'],
          minWeatherDates: 1,
        },
      },
    },
  },
  metadata: {
    tags: ['japan', 'jp', 'decision-closure', 'izu', 'typhoon', 'route134', 'p0', 'golden'],
    priority: 'P0',
    source: 'jp-decision-closure-izu-typhoon',
    fixtureKind: 'golden',
    decisionClosureGolden: loadClosureGolden(),
    decisionClosureDecisionLogs: JP_IZU_TYPHOON_DECISION_CLOSURE_LOGS,
    cgusDsoSnapshotNote: 'Closure gate uses decisionClosureGolden only; JP country pack extension template.',
    cgusDsoFixtureVersion: 'engine-dso-v1',
    cgusDsoGeneratedAt: '2026-05-30T00:00:00.000Z',
    cgusDsoSourceCaseId: 'jp-decision-closure-izu-typhoon-001',
  },
};
