/**
 * 冰岛决策闭环 v1 — F208 封路 + storm CGUS 判决书 golden（P0）。
 * @see docs/iceland-decision-closure-v1.md
 */
import type { E2ECase } from '../e2e-case.types';
import { ICELAND_F208_DECISION_CLOSURE_LOGS } from './iceland-decision-closure-logs.fixture';
import { loadE2eClosureGolden } from './load-e2e-closure-golden.util';

function loadClosureGolden(): Record<string, unknown> {
  return loadE2eClosureGolden('iceland-decision-closure-storm-f208.golden.json');
}

export const icelandDecisionClosureStormF208Case: E2ECase = {
  id: 'iceland-decision-closure-storm-f208-001',
  name: '冰岛决策闭环 — F208 封路 + 判决书 golden',
  description:
    'P0：frozen optimizationHints 断言判决书、MC 采样、RAG 路政物化；不依赖全链路 agent 启动。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'LOW',
      travelPhilosophy: 'nature-first',
      preferredRouteTypes: ['f-road', 'south-coast'],
    },
    season: 1,
    countryCode: 'IS',
    userQuery: '1 月冰岛 F208 高地段封路，南岸暴风，需要可审计的优化判决书',
  },
  expected: {
    abuExpected: { action: 'ALLOW', reasonCodes: ['ABU_GATE_PASS'] },
    finalState: { allowed: true, planDays: 5 },
    scientificExpected: {
      decisionClosure: {
        mustHaveDecisionVerdict: true,
        chosenPlanId: 'repair-spatial-poi-v2',
        minRejectedPlans: 1,
        metaDecisionAuditIncludes: ['mcTotal', 'ragWorld'],
        narrationZhIncludes: ['推荐方案', 'repair-spatial-poi-v2'],
        monteCarloMinTotalSamples: 1000,
        worldMaterialization: {
          minAppliedEvents: 1,
          roadIdsIncludes: ['F208'],
          minWeatherDates: 1,
        },
      },
    },
  },
  metadata: {
    tags: ['iceland', 'decision-closure', 'f208', 'p0', 'golden'],
    priority: 'P0',
    source: 'iceland-decision-closure-storm-f208',
    fixtureKind: 'golden',
    decisionClosureGolden: loadClosureGolden(),
    decisionClosureDecisionLogs: ICELAND_F208_DECISION_CLOSURE_LOGS,
    cgusDsoSnapshotNote: 'Closure gate uses decisionClosureGolden only; cgusDsoSnapshot optional for replay suite.',
    cgusDsoFixtureVersion: 'engine-dso-v1',
    cgusDsoGeneratedAt: '2026-05-22T00:00:00.000Z',
    cgusDsoSourceCaseId: 'iceland-decision-closure-storm-f208-001',
  },
};
