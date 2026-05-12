/**
 * 按 E2ECase.expected 构造与 `analyzeDiff` 一致的 TripDecisionEngine / DecisionLogStorage mock，
 * 使「真实 fixture JSON + 确定性引擎行为」下回放可通过（TD-05）。
 */
import type { E2ECase } from './e2e-case.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';

function normalizeCandidateSearchTrace(input: {
  candidateSearchBudget?: any;
  candidateSearchAudit?: any;
}): { candidateSearchBudget?: any; candidateSearchAudit?: any } {
  const budget = (input.candidateSearchBudget ?? input.candidateSearchAudit?.budget) as any;
  const audit = input.candidateSearchAudit as any;

  if (!audit) {
    return { candidateSearchBudget: input.candidateSearchBudget, candidateSearchAudit: input.candidateSearchAudit };
  }

  const normalizedBudget = budget ? { ...budget } : undefined;
  const iterations = Array.isArray(audit.iterations) ? audit.iterations : [];

  let finalCandidateCount = audit.finalCandidateCount;
  let finalFeasibleCount = audit.finalFeasibleCount;

  if (iterations.length > 0) {
    const last = iterations[iterations.length - 1] ?? {};
    const maxCandidates = typeof normalizedBudget?.maxCandidates === 'number' ? normalizedBudget.maxCandidates : undefined;
    const poolAfterDedup = typeof last.poolSizeAfterDedup === 'number' ? last.poolSizeAfterDedup : undefined;
    const feasibleAfterProjection =
      typeof last.feasibleCountAfterProjection === 'number' ? last.feasibleCountAfterProjection : undefined;

    const derivedFinalCandidateCount =
      typeof poolAfterDedup === 'number'
        ? typeof maxCandidates === 'number'
          ? Math.min(maxCandidates, poolAfterDedup)
          : poolAfterDedup
        : undefined;
    const derivedFinalFeasibleCount =
      typeof feasibleAfterProjection === 'number' && typeof derivedFinalCandidateCount === 'number'
        ? Math.min(derivedFinalCandidateCount, feasibleAfterProjection)
        : feasibleAfterProjection;

    if (typeof derivedFinalCandidateCount === 'number') finalCandidateCount = derivedFinalCandidateCount;
    if (typeof derivedFinalFeasibleCount === 'number') finalFeasibleCount = derivedFinalFeasibleCount;
  }

  const normalizedAudit = {
    ...audit,
    budget: normalizedBudget ?? audit.budget,
    iterations,
    finalCandidateCount: typeof finalCandidateCount === 'number' ? finalCandidateCount : 0,
    finalFeasibleCount: typeof finalFeasibleCount === 'number' ? finalFeasibleCount : 0,
  };

  return {
    candidateSearchBudget: normalizedAudit.budget ?? input.candidateSearchBudget,
    candidateSearchAudit: normalizedAudit,
  };
}

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
      reasonCodes:
        abu.reasonCodes ?? (abu.action === 'ALLOW' ? ['ABU_GATE_PASS'] : []),
      evidenceRefs: ['fixture:abu-gate'],
      timestamp: ts,
      decisionSource: 'PHYSICAL',
      decisionStage: 'ABU_GATE',
    },
  ];

  const trace = testCase.expected.traceSummary;
  if (trace) {
    const normalized = normalizeCandidateSearchTrace({
      candidateSearchBudget: trace.candidateSearchBudget,
      candidateSearchAudit: trace.candidateSearchAudit,
    });
    logs.push({
      persona: 'EXPECTED_UTILITY',
      action: 'EVALUATE',
      explanation: 'fixture trace summary audit',
      reasonCodes: ['EXPECTED_UTILITY_EVAL'],
      evidenceRefs: ['fixture:plan-score'],
      timestamp: ts,
      decisionSource: 'UTILITY',
      decisionStage: 'PLAN_SCORE',
      metadata: {
        schemaVersion: trace.schemaVersion ?? 'trace/v1',
        metaDecisionAudit: trace.metaDecisionAudit,
        candidateSearchBudget: normalized.candidateSearchBudget,
        candidateSearchAudit: normalized.candidateSearchAudit,
      },
    });
  }

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
