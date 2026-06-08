/**
 * 冰岛决策闭环 — 环岛稳定场景（无路政物化，判决书 + MC 基线）。
 */
import type { E2ECase } from '../e2e-case.types';
import { loadE2eClosureGolden } from './load-e2e-closure-golden.util';

function loadClosureGolden(): Record<string, unknown> {
  return loadE2eClosureGolden('iceland-decision-closure-ring-stable.golden.json');
}

export const icelandDecisionClosureRingStableCase: E2ECase = {
  id: 'iceland-decision-closure-ring-stable-001',
  name: '冰岛决策闭环 — 环岛稳定 golden',
  description: 'P0：低熵场景；appliedEvents=0；判决书仍须含 chosen + rejected。',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'comfort',
      preferredRouteTypes: ['ring-road'],
    },
    season: 8,
    countryCode: 'IS',
    userQuery: '8月冰岛环岛，稳定舒适',
  },
  expected: {
    abuExpected: { action: 'ALLOW', reasonCodes: [] },
    finalState: { allowed: true, planDays: 8 },
    scientificExpected: {
      decisionClosure: {
        mustHaveDecisionVerdict: true,
        chosenPlanId: 'base',
        minRejectedPlans: 1,
        metaDecisionAuditIncludes: ['mcTotal=500'],
        narrationZhIncludes: ['base'],
        monteCarloMinTotalSamples: 500,
        worldMaterialization: {
          minAppliedEvents: 0,
        },
      },
    },
  },
  metadata: {
    tags: ['iceland', 'decision-closure', 'ring-road', 'p0', 'golden'],
    priority: 'P0',
    source: 'iceland-decision-closure-ring-stable',
    fixtureKind: 'golden',
    decisionClosureGolden: loadClosureGolden(),
    cgusDsoFixtureVersion: 'engine-dso-v1',
    cgusDsoGeneratedAt: '2026-05-22T00:00:00.000Z',
    cgusDsoSourceCaseId: 'iceland-decision-closure-ring-stable-001',
  },
};
