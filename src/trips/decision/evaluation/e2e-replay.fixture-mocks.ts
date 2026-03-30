/**
 * 按 E2ECase.expected 构造与 `analyzeDiff` 一致的 TripDecisionEngine / DecisionLogStorage mock，
 * 使「真实 fixture JSON + 确定性引擎行为」下回放可通过（TD-05）。
 */
import type { E2ECase } from './e2e-case.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';

export function buildDecisionLogsForFixture(testCase: E2ECase): DecisionLogEntry[] {
  const ts = new Date().toISOString();
  const abu = testCase.expected.abuExpected;
  const logs: DecisionLogEntry[] = [
    {
      persona: 'ABU',
      action: abu.action,
      explanation:
        abu.action === 'REJECT'
          ? 'DEM Evidence missing for segment (highlands)'
          : '通过安全检查',
      reasonCodes: abu.reasonCodes ?? [],
      evidenceRefs: ['fixture:abu-gate'],
      timestamp: ts,
      decisionSource: 'PHYSICAL',
      decisionStage: 'ABU_GATE',
    },
  ];

  const dr = testCase.expected.drdreExpected;
  if (dr?.mustAdjust) {
    logs.push({
      persona: 'DR_DRE',
      action: 'ADJUST',
      explanation: 'pace / buffer adjustment',
      reasonCodes: dr.adjustmentTypes ?? ['BUFFER_DAY'],
      evidenceRefs: ['fixture:dr-dre'],
      timestamp: ts,
      decisionSource: 'HUMAN',
      decisionStage: 'PACE_ADJUST',
    });
  }

  const ne = testCase.expected.neptuneExpected;
  if (ne?.mustRepair) {
    logs.push({
      persona: 'NEPTUNE',
      action: 'REPLACE',
      explanation: 'spatial repair applied',
      reasonCodes: ne.replacementTypes ?? ['SEGMENT'],
      evidenceRefs: ['fixture:neptune'],
      timestamp: ts,
      decisionSource: 'PHYSICAL',
      decisionStage: 'SPATIAL_REPAIR',
    });
  }

  return logs;
}

export function buildGeneratePlanResultForFixture(testCase: E2ECase) {
  const planDays = testCase.expected.finalState.planDays ?? 7;
  const allowed = testCase.expected.finalState.allowed;
  const lastStrategyAction = allowed ? 'ACCEPT' : 'REJECT';

  return {
    plan: {
      days: Array(planDays).fill({}),
    },
    log: {
      tripId: `e2e-${testCase.id}`,
      inputDigest: { tripId: `e2e-${testCase.id}` },
      routeDirection: {
        selected: {
          uuid: 'fixture-route-uuid',
        },
      },
      finalStatus: allowed ? 'ALLOWED' : 'REJECTED',
      strategyLogs: [{ action: lastStrategyAction }],
    },
  };
}
