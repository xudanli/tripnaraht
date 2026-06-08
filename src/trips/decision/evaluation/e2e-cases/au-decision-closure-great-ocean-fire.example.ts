/**
 * 澳大利亚决策闭环 v1 — Great Ocean Road B100 山火封路 golden（P0 国家包扩展）。
 */
import type { E2ECase } from '../e2e-case.types';
import { AU_GOR_FIRE_DECISION_CLOSURE_LOGS } from './au-decision-closure-logs.fixture';
import { loadE2eClosureGolden } from './load-e2e-closure-golden.util';

function loadClosureGolden(): Record<string, unknown> {
  return loadE2eClosureGolden('au-decision-closure-great-ocean-fire.golden.json');
}

export const auDecisionClosureGreatOceanFireCase: E2ECase = {
  id: 'au-decision-closure-great-ocean-fire-001',
  name: '澳大利亚决策闭环 — Great Ocean Road B100 山火 golden',
  description:
    'P0：Victoria 山火烟雾 + B100 封路；CGUS inland 改线；offline decision-closure gate 国家包扩展。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'coastal-scenic',
      preferredRouteTypes: ['great-ocean-road', 'coastal-drive'],
    },
    season: 1,
    countryCode: 'AU',
    userQuery: '1 月大洋路自驾，B100 因山火封路，需要可审计判决书',
  },
  expected: {
    abuExpected: { action: 'ALLOW', reasonCodes: ['ABU_GATE_PASS'] },
    finalState: { allowed: true, planDays: 5 },
    scientificExpected: {
      decisionClosure: {
        mustHaveDecisionVerdict: true,
        chosenPlanId: 'repair-gor-inland-v1',
        minRejectedPlans: 1,
        metaDecisionAuditIncludes: ['mcTotal', 'ragWorld'],
        narrationZhIncludes: ['推荐方案', 'repair-gor-inland-v1'],
        monteCarloMinTotalSamples: 600,
        worldMaterialization: {
          minAppliedEvents: 1,
          roadIdsIncludes: ['B100'],
          minWeatherDates: 1,
        },
      },
    },
  },
  metadata: {
    tags: ['australia', 'au', 'decision-closure', 'great-ocean-road', 'b100', 'p0', 'golden'],
    priority: 'P0',
    source: 'au-decision-closure-great-ocean-fire',
    fixtureKind: 'golden',
    decisionClosureGolden: loadClosureGolden(),
    decisionClosureDecisionLogs: AU_GOR_FIRE_DECISION_CLOSURE_LOGS,
    cgusDsoSnapshotNote: 'Closure gate uses decisionClosureGolden only; AU country pack extension template.',
    cgusDsoFixtureVersion: 'engine-dso-v1',
    cgusDsoGeneratedAt: '2026-05-30T00:00:00.000Z',
    cgusDsoSourceCaseId: 'au-decision-closure-great-ocean-fire-001',
  },
};
