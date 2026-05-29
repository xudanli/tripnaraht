// src/trips/decision/evaluation/e2e-assertions.ts
/**
 * E2E Assertions
 * 
 * 用于验证 E2E Case 的断言函数
 */

import { DecisionLogEntry } from '../shared/decision-result.types';
import {
  AbuExpected,
  DecisionTraceSummary,
  DrDreExpected,
  NeptuneExpected,
  E2EDiff,
  ExpectedDecisionTraceSummary,
  ReplayTimelineExpected,
  ReplayTraceSignalsExpected,
  ScientificReplayExpected,
  PersonaClosureExpected,
} from './e2e-case.types';
import { diffDecisionTraceSummary } from './replay-trace-contract';
import {
  countAbuPostNeptuneRechecks,
  extractPersonaClosureAuditFromLogs,
} from '../shared/persona-closure-log.util';

/**
 * 断言 Abu 行为
 */
export function assertAbuBehavior(
  logs: DecisionLogEntry[],
  expected: AbuExpected
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];
  
  // 过滤 Abu 在 ABU_GATE 阶段的日志
  const abuLogs = logs.filter(
    l => l.persona === 'ABU' && l.decisionStage === 'ABU_GATE'
  );

  // 必须有一个 Abu 决策
  if (abuLogs.length === 0) {
    diff.push('缺少 Abu 决策日志');
    return { passed: false, diff };
  }

  const lastAbuLog = abuLogs[abuLogs.length - 1];

  // 动作必须匹配
  if (lastAbuLog.action !== expected.action) {
    diff.push(
      `动作不匹配: 预期 ${expected.action}, 实际 ${lastAbuLog.action}`
    );
  }

  // 如果预期 REJECT，必须有 reason codes
  if (expected.action === 'REJECT') {
    if (lastAbuLog.reasonCodes.length === 0) {
      diff.push('REJECT 动作缺少 reason codes');
    }

    // 必须包含预期的 reason codes
    if (expected.reasonCodes) {
      for (const code of expected.reasonCodes) {
        if (!lastAbuLog.reasonCodes.includes(code)) {
          diff.push(`缺少预期的 reason code: ${code}`);
        }
      }
    }

    // 必须检测到预期的违规
    if (expected.violations) {
      const explanation = lastAbuLog.explanation.toLowerCase();
      for (const violation of expected.violations) {
        if (!explanation.includes(violation.toLowerCase())) {
          diff.push(`未检测到预期的违规: ${violation}`);
        }
      }
    }
  }

  return {
    passed: diff.length === 0,
    diff,
  };
}

/**
 * 断言 Dr.Dre 行为
 */
export function assertDrDreBehavior(
  logs: DecisionLogEntry[],
  expected: DrDreExpected
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];

  if (!expected) {
    return { passed: true, diff: [] };
  }

  const drdreLogs = logs.filter(
    l => l.persona === 'DR_DRE' && l.decisionStage === 'PACE_ADJUST'
  );

  if (expected.mustAdjust) {
    if (drdreLogs.length === 0) {
      diff.push('预期需要调整，但未找到 Dr.Dre 调整日志');
      return { passed: false, diff };
    }

    // 检查调整类型
    if (expected.adjustmentTypes) {
      const actualTypes = drdreLogs
        .map(l => l.reasonCodes)
        .flat()
        .join('|');

      for (const type of expected.adjustmentTypes) {
        if (!actualTypes.includes(type)) {
          diff.push(`缺少预期的调整类型: ${type}`);
        }
      }
    }
  } else {
    // 如果预期不需要调整，但找到了调整日志，记录差异（但不一定失败）
    if (drdreLogs.length > 0) {
      diff.push(`预期不需要调整，但找到了 ${drdreLogs.length} 条调整日志`);
    }
  }

  return {
    passed: diff.length === 0,
    diff,
  };
}

/**
 * 断言 Neptune 行为
 */
export function assertNeptuneBehavior(
  logs: DecisionLogEntry[],
  expected: NeptuneExpected
): { passed: boolean; diff: string[] } {
  const diff: string[] = [];

  if (!expected) {
    return { passed: true, diff: [] };
  }

  const neptuneLogs = logs.filter(
    l => l.persona === 'NEPTUNE' && l.decisionStage === 'SPATIAL_REPAIR'
  );

  if (expected.mustRepair) {
    if (neptuneLogs.length === 0) {
      diff.push('预期需要修复，但未找到 Neptune 修复日志');
      return { passed: false, diff };
    }

    // 检查替换类型
    if (expected.replacementTypes) {
      const actualTypes = neptuneLogs
        .map(l => l.reasonCodes)
        .flat()
        .join('|');

      for (const type of expected.replacementTypes) {
        if (!actualTypes.includes(type)) {
          diff.push(`缺少预期的替换类型: ${type}`);
        }
      }
    }
  } else {
    // 如果预期不需要修复，但找到了修复日志，记录差异（但不一定失败）
    if (neptuneLogs.length > 0) {
      diff.push(`预期不需要修复，但找到了 ${neptuneLogs.length} 条修复日志`);
    }
  }

  return {
    passed: diff.length === 0,
    diff,
  };
}

function analyzeOutcomeDiff(
  expected: {
    abuExpected: AbuExpected;
    drdreExpected?: DrDreExpected;
    neptuneExpected?: NeptuneExpected;
    routeDirectionId?: string;
    finalState: { allowed: boolean; planDays?: number };
  },
  actual: {
    logs: DecisionLogEntry[];
    routeDirectionId?: string;
    finalPlan?: { days: number; allowed: boolean };
  }
): Pick<
  E2EDiff,
  'abuDiff' | 'drdreDiff' | 'neptuneDiff' | 'routeDirectionDiff' | 'finalStateDiff' | 'hasDiff'
> {
  const diff: E2EDiff = {
    hasDiff: false,
  };

  // Abu 差异
  const abuResult = assertAbuBehavior(actual.logs, expected.abuExpected);
  if (!abuResult.passed) {
    diff.abuDiff = abuResult.diff;
    diff.hasDiff = true;
  }

  // Dr.Dre 差异
  if (expected.drdreExpected) {
    const drdreResult = assertDrDreBehavior(actual.logs, expected.drdreExpected);
    if (!drdreResult.passed) {
      diff.drdreDiff = drdreResult.diff;
      diff.hasDiff = true;
    }
  }

  // Neptune 差异
  if (expected.neptuneExpected) {
    const neptuneResult = assertNeptuneBehavior(
      actual.logs,
      expected.neptuneExpected
    );
    if (!neptuneResult.passed) {
      diff.neptuneDiff = neptuneResult.diff;
      diff.hasDiff = true;
    }
  }

  // RouteDirection 差异
  if (expected.routeDirectionId) {
    if (actual.routeDirectionId !== expected.routeDirectionId) {
      diff.routeDirectionDiff = `预期 ${expected.routeDirectionId}, 实际 ${actual.routeDirectionId || '未选择'}`;
      diff.hasDiff = true;
    }
  }

  // 最终状态差异
  if (actual.finalPlan) {
    if (actual.finalPlan.allowed !== expected.finalState.allowed) {
      diff.finalStateDiff = `预期 allowed=${expected.finalState.allowed}, 实际 allowed=${actual.finalPlan.allowed}`;
      diff.hasDiff = true;
    }

    if (
      expected.finalState.planDays &&
      actual.finalPlan.days !== expected.finalState.planDays
    ) {
      diff.finalStateDiff = `${diff.finalStateDiff || ''}; 预期天数=${expected.finalState.planDays}, 实际天数=${actual.finalPlan.days}`;
      diff.hasDiff = true;
    }
  }

  return diff;
}

function analyzeTraceDiff(
  expected: { traceSummary?: ExpectedDecisionTraceSummary },
  actual: { traceSummary?: DecisionTraceSummary },
): Pick<E2EDiff, 'traceDiff' | 'hasDiff'> {
  const diff: Pick<E2EDiff, 'traceDiff' | 'hasDiff'> = { hasDiff: false };
  const traceDiff = diffDecisionTraceSummary(expected.traceSummary, actual.traceSummary);
  if (traceDiff.length > 0) {
    diff.traceDiff = traceDiff;
    diff.hasDiff = true;
  }
  return diff;
}

function analyzeScientificDiff(
  expected: { scientificExpected?: ScientificReplayExpected },
  actual: { traceSummary?: DecisionTraceSummary },
): Pick<E2EDiff, 'scientificDiff' | 'hasDiff'> {
  const scientificDiff: string[] = [];
  const optimization = expected.scientificExpected?.optimization;
  const trace = actual.traceSummary;
  const audit = trace?.candidateSearchAudit;

  if (optimization) {
    const hasTrace = !!trace?.metaDecisionAudit;
    if (optimization.mustEmitTrace !== undefined && hasTrace !== optimization.mustEmitTrace) {
      scientificDiff.push(
        `optimization trace emission mismatch: expected=${optimization.mustEmitTrace} actual=${hasTrace}`,
      );
    }
    if (
      optimization.minCandidateSearchIterations !== undefined &&
      ((audit?.iterations?.length ?? 0) < optimization.minCandidateSearchIterations)
    ) {
      scientificDiff.push(
        `candidate search iterations below expectation: expected>=${optimization.minCandidateSearchIterations} actual=${audit?.iterations?.length ?? 0}`,
      );
    }
    if (
      optimization.minFinalFeasibleCount !== undefined &&
      ((audit?.finalFeasibleCount ?? 0) < optimization.minFinalFeasibleCount)
    ) {
      scientificDiff.push(
        `final feasible count below expectation: expected>=${optimization.minFinalFeasibleCount} actual=${audit?.finalFeasibleCount ?? 0}`,
      );
    }
    if (
      optimization.allowedStopReasons &&
      optimization.allowedStopReasons.length > 0 &&
      audit?.stopReason &&
      !optimization.allowedStopReasons.includes(audit.stopReason)
    ) {
      scientificDiff.push(
        `candidate search stopReason mismatch: expected one of ${optimization.allowedStopReasons.join(',')} actual=${audit.stopReason}`,
      );
    }
    if (optimization.metaDecisionAuditIncludes) {
      for (const needle of optimization.metaDecisionAuditIncludes) {
        if (!(trace?.metaDecisionAudit ?? '').includes(needle)) {
          scientificDiff.push(`metaDecisionAudit missing expected token: ${needle}`);
        }
      }
    }
  }

  return {
    scientificDiff: scientificDiff.length > 0 ? scientificDiff : undefined,
    hasDiff: scientificDiff.length > 0,
  };
}

function analyzeTimelineDiff(
  expected: { timelineExpected?: ReplayTimelineExpected },
  actual: { logs: DecisionLogEntry[] },
): Pick<E2EDiff, 'timelineDiff' | 'hasDiff'> {
  const timeline = expected.timelineExpected;
  if (!timeline) return { hasDiff: false };
  const stageSequence = actual.logs.map((log) => log.decisionStage);
  const timelineDiff: string[] = [];

  for (const stage of timeline.requiredStages ?? []) {
    if (!stageSequence.includes(stage)) {
      timelineDiff.push(`missing required stage: ${stage}`);
    }
  }
  for (const stage of timeline.forbiddenStages ?? []) {
    if (stageSequence.includes(stage)) {
      timelineDiff.push(`unexpected forbidden stage: ${stage}`);
    }
  }
  if (timeline.orderedStages && timeline.orderedStages.length > 1) {
    let cursor = -1;
    for (const stage of timeline.orderedStages) {
      const nextIdx = stageSequence.indexOf(stage, cursor + 1);
      if (nextIdx === -1) {
        timelineDiff.push(`ordered stage missing or out of order: ${stage}`);
        break;
      }
      cursor = nextIdx;
    }
  }

  return {
    timelineDiff: timelineDiff.length > 0 ? timelineDiff : undefined,
    hasDiff: timelineDiff.length > 0,
  };
}

function analyzeTraceSignalsDiff(
  expected: { traceSignals?: ReplayTraceSignalsExpected },
  actual: { logs: DecisionLogEntry[] },
): Pick<E2EDiff, 'traceSignalsDiff' | 'hasDiff'> {
  const signals = expected.traceSignals;
  if (!signals) {
    return { hasDiff: false };
  }
  const hasAnyExpected = (
    ['stability_mode_active', 'frustration_circuit_triggered', 'narrative_track'] as const
  ).some((k) => signals[k] !== undefined);
  if (!hasAnyExpected) {
    return { hasDiff: false };
  }

  const planScore = actual.logs.find(
    (l) =>
      l.decisionStage === 'PLAN_SCORE' &&
      (l.persona === 'EXPECTED_UTILITY' ||
        (!!l.metadata &&
          typeof l.metadata === 'object' &&
          typeof (l.metadata as Record<string, unknown>).schemaVersion === 'string')),
  );

  if (!planScore?.metadata || typeof planScore.metadata !== 'object') {
    return {
      traceSignalsDiff: ['traceSignals: expected PLAN_SCORE log with metadata but none matched'],
      hasDiff: true,
    };
  }

  const meta = planScore.metadata as Record<string, unknown>;
  const traceSignalsDiff: string[] = [];
  for (const key of ['stability_mode_active', 'frustration_circuit_triggered', 'narrative_track'] as const) {
    if (signals[key] === undefined) continue;
    const exp = signals[key];
    const act = meta[key];
    if (act !== exp) {
      traceSignalsDiff.push(
        `traceSignals.${key}: expected ${JSON.stringify(exp)}, actual ${JSON.stringify(act)}`,
      );
    }
  }

  return {
    traceSignalsDiff: traceSignalsDiff.length > 0 ? traceSignalsDiff : undefined,
    hasDiff: traceSignalsDiff.length > 0,
  };
}

function analyzePersonaClosureDiff(
  expected: { personaClosureExpected?: PersonaClosureExpected },
  actual: { logs: DecisionLogEntry[] },
): Pick<E2EDiff, 'personaClosureDiff' | 'hasDiff'> {
  const pc = expected.personaClosureExpected;
  if (!pc) return { hasDiff: false };

  const personaClosureDiff: string[] = [];
  const rechecks = countAbuPostNeptuneRechecks(actual.logs);
  const audit = extractPersonaClosureAuditFromLogs(actual.logs);
  const stopReason = audit?.stopReason;

  if (pc.minAbuRechecks !== undefined && rechecks < pc.minAbuRechecks) {
    personaClosureDiff.push(
      `persona closure: minAbuRechecks ${pc.minAbuRechecks} but actual ${rechecks}`,
    );
  }
  if (pc.maxAbuRechecks !== undefined && rechecks > pc.maxAbuRechecks) {
    personaClosureDiff.push(
      `persona closure: maxAbuRechecks ${pc.maxAbuRechecks} but actual ${rechecks}`,
    );
  }
  if (pc.mustEmitAudit && !audit) {
    personaClosureDiff.push('persona closure: missing personaClosureAudit on FINALIZE log');
  }
  if (pc.allowedStopReasons?.length && stopReason && !pc.allowedStopReasons.includes(stopReason)) {
    personaClosureDiff.push(
      `persona closure stopReason: expected one of ${pc.allowedStopReasons.join(',')} actual=${stopReason}`,
    );
  }
  if (pc.forbiddenStopReasons?.length && stopReason && pc.forbiddenStopReasons.includes(stopReason)) {
    personaClosureDiff.push(`persona closure stopReason forbidden: ${stopReason}`);
  }

  return {
    personaClosureDiff: personaClosureDiff.length > 0 ? personaClosureDiff : undefined,
    hasDiff: personaClosureDiff.length > 0,
  };
}

/**
 * 分析差异
 */
export function analyzeDiff(
  expected: {
    abuExpected: AbuExpected;
    drdreExpected?: DrDreExpected;
    neptuneExpected?: NeptuneExpected;
    routeDirectionId?: string;
    finalState: { allowed: boolean; planDays?: number };
    traceSummary?: ExpectedDecisionTraceSummary;
    scientificExpected?: ScientificReplayExpected;
    timelineExpected?: ReplayTimelineExpected;
    traceSignals?: ReplayTraceSignalsExpected;
    personaClosureExpected?: PersonaClosureExpected;
  },
  actual: {
    logs: DecisionLogEntry[];
    routeDirectionId?: string;
    finalPlan?: { days: number; allowed: boolean };
    traceSummary?: DecisionTraceSummary;
  },
): E2EDiff {
  const outcome = analyzeOutcomeDiff(expected, actual);
  const trace = analyzeTraceDiff(expected, actual);
  const scientific = analyzeScientificDiff(expected, actual);
  const timeline = analyzeTimelineDiff(expected, actual);
  const traceSignals = analyzeTraceSignalsDiff(expected, actual);
  const personaClosure = analyzePersonaClosureDiff(expected, actual);

  return {
    ...outcome,
    traceDiff: trace.traceDiff,
    scientificDiff: scientific.scientificDiff,
    timelineDiff: timeline.timelineDiff,
    traceSignalsDiff: traceSignals.traceSignalsDiff,
    personaClosureDiff: personaClosure.personaClosureDiff,
    hasDiff:
      outcome.hasDiff ||
      trace.hasDiff ||
      scientific.hasDiff ||
      timeline.hasDiff ||
      traceSignals.hasDiff ||
      personaClosure.hasDiff,
  };
}
