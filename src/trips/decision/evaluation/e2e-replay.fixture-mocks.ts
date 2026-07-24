/**
 * 按 E2ECase.expected 构造与 `analyzeDiff` 一致的 TripDecisionEngine / DecisionLogStorage mock，
 * 使「真实 fixture JSON + 确定性引擎行为」下回放可通过（TD-05）。
 */
import type { E2ECase } from './e2e-case.types';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { PersonaClosureAudit } from '../shared/persona-closure.types';
import { applyResearchTraceSignalsToResearchData } from '../../../agent/memory/emotional-resonance/research-member-stability.util';
import { mapResearchTraceSignalsToLogMetadata } from '../shared/research-trace-signals-log-metadata.util';

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
  const pcEarly = testCase.expected.personaClosureExpected;
  const initialAbuAction =
    pcEarly && abu.action === 'REJECT' ? 'ALLOW' : abu.action;
  const logs: DecisionLogEntry[] = [
    {
      persona: 'ABU',
      action: initialAbuAction,
      explanation:
        initialAbuAction === 'REJECT'
          ? 'DEM Evidence missing for segment (highlands)'
          : '通过安全检查',
      reasonCodes:
        abu.reasonCodes ??
        (initialAbuAction === 'ALLOW' ? ['ABU_GATE_PASS'] : []),
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
    const sig = testCase.expected.traceSignals;
    const researchDataForTrace: Record<string, unknown> = {};
    if (sig) {
      applyResearchTraceSignalsToResearchData(researchDataForTrace, {
        user_emotional_account: {
          accumulated_goodwill: 0.2,
          current_tolerance_bonus: 0.5,
          frustration_score: sig.frustration_circuit_triggered ? 0.88 : 0.12,
        },
        mental_offset_hints: sig.frustration_circuit_triggered
          ? {
              suture_aggressive_allowed: false,
              tolerance_bonus: 0.5,
              frustration_circuit_active: true,
            }
          : {
              suture_aggressive_allowed: true,
              tolerance_bonus: 0.5,
            },
      });
    }
    const experienceFlowOverlay = mapResearchTraceSignalsToLogMetadata(researchDataForTrace);
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
        ...(sig?.stability_mode_active !== undefined ? { stability_mode_active: sig.stability_mode_active } : {}),
        ...(sig?.frustration_circuit_triggered !== undefined
          ? { frustration_circuit_triggered: sig.frustration_circuit_triggered }
          : {}),
        ...(sig?.narrative_track !== undefined ? { narrative_track: sig.narrative_track } : {}),
        ...(experienceFlowOverlay.experience_flow
          ? { experience_flow: experienceFlowOverlay.experience_flow }
          : {}),
        ...(trace.observationHarness !== undefined
          ? { observationHarness: trace.observationHarness }
          : {}),
        ...(trace.dilemmaElicitationHint !== undefined
          ? { dilemmaElicitationHint: trace.dilemmaElicitationHint }
          : {}),
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

  const pc = testCase.expected.personaClosureExpected;
  if (pc) {
    const recheckCount = Math.max(pc.minAbuRechecks ?? 1, 1);
    const stopReason =
      pc.allowedStopReasons?.[0] ??
      (testCase.expected.finalState.allowed ? 'ABU_RECHECK_PASS' : 'NEPTUNE_SHRINK_EXHAUSTED');

    for (let i = 0; i < recheckCount; i += 1) {
      const recheckAllow = testCase.expected.finalState.allowed || i < recheckCount - 1;
      logs.push({
        persona: 'ABU',
        action: recheckAllow ? 'ALLOW' : 'REJECT',
        explanation: recheckAllow
          ? 'post-Neptune Abu recheck passed'
          : 'post-Neptune Abu recheck rejected patch',
        reasonCodes: recheckAllow ? ['ABU_GATE_PASS', 'PERSONA_CLOSURE_RECHECK'] : ['ABU_GATE_REJECT'],
        evidenceRefs: [`fixture:abu-recheck-${i}`],
        timestamp: ts,
        decisionSource: 'PHYSICAL',
        decisionStage: 'ABU_GATE',
        metadata: {
          persona_closure: { iter: i, phase: 'post_neptune_recheck' },
        },
      });
    }

    const audit: PersonaClosureAudit = {
      iters: Array.from({ length: recheckCount }, (_, i) => ({
        iter: i,
        neptuneAction: 'REPLACE' as const,
        planFingerprintBefore: `fixture-before-${testCase.id}`,
        planFingerprintAfter: `fixture-after-${testCase.id}-${i}`,
        abuRecheck: testCase.expected.finalState.allowed ? 'ALLOW' : 'REJECT',
        newHardViolations: testCase.expected.finalState.allowed ? [] : ['FROAD_2WD_COMPLIANCE'],
        stopReason,
      })),
      stopReason,
      totalAbuRechecks: recheckCount,
    };

    if (pc.mustEmitAudit !== false) {
      logs.push({
        persona: 'ABU',
        action: testCase.expected.finalState.allowed ? 'ALLOW' : 'REJECT',
        explanation: `persona closure stop=${stopReason}`,
        reasonCodes: ['PERSONA_CLOSURE', stopReason],
        evidenceRefs: ['fixture:persona-closure-audit'],
        timestamp: ts,
        decisionSource: 'PHYSICAL',
        decisionStage: 'FINALIZE',
        metadata: { personaClosureAudit: audit },
      });
    }
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
