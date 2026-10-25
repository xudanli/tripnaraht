/**
 * Decision OS 后 V1：Outcome→Evaluation / Policy Metrics / Replay Compare
 * （不扩展 observability_v1 schema；仅聚合与对比）
 */

import {
  overlayFeedbackOntoObservability,
} from './trip-run-feedback.util';
import {
  resolveTripRunObservabilityFromStored,
  type TripRunObservabilityV1,
} from './trip-run-observability.util';

export type FailurePatternId =
  | 'SAFETY_MISJUDGMENT'
  | 'PREFERENCE_MISMATCH'
  | 'TOOL_FAILURE'
  | 'EXECUTION_TIMEOUT'
  | 'REASONING_ERROR'
  | 'DECISION_ERROR'
  | 'UX_ABANDON'
  | 'BENCHMARK_FAIL'
  | 'UNKNOWN_NEGATIVE';

export type DerivedRunEvaluation = {
  runId: string;
  patternId: FailurePatternId | null;
  trustSignal: string | null;
  failureCategory: string | null;
  failureCode: string | null;
  accepted: boolean | null;
  decisionSelected: string | null;
  currentAgent: string | null;
  suggestedActions: Array<'policy' | 'prompt' | 'model' | 'tool' | 'memory'>;
};

function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

export function loadObservabilityFromRun(run: {
  id: string;
  userQuery?: string | null;
  status?: string | null;
  currentAgent?: string | null;
  metadata?: unknown;
}): TripRunObservabilityV1 | null {
  const meta = asRecord(run.metadata);
  return overlayFeedbackOntoObservability(
    resolveTripRunObservabilityFromStored({
      metadata: meta,
      userQuery: run.userQuery ?? null,
      status: run.status ?? null,
    }),
    meta,
  );
}

/** 从单次 Run 的 outcome + failure 推导失败模式（驱动 Agent 进化的标签） */
export function deriveFailurePattern(
  obs: TripRunObservabilityV1 | null,
  meta?: Record<string, any>,
): FailurePatternId | null {
  if (!obs) return null;

  const trust = obs.outcome?.trustSignal ?? null;
  const event = String(obs.outcome?.latestEvent ?? '').toLowerCase();
  const failure = obs.failure;
  const category = String(failure?.category ?? '').toUpperCase();
  const code = String(failure?.code ?? failure?.type ?? '').toUpperCase();
  const domain = String(failure?.domain ?? '').toUpperCase();

  const negativeTrust =
    trust === 'SEVERE_FAILURE' ||
    trust === 'TRUST_DECLINE' ||
    trust === 'LOW_SATISFACTION';

  const constraints = obs.decisionTrace?.goalExtraction.constraintsDetected ?? [];
  const safetyHint =
    constraints.some((c) => /safety|risk|夜驾|高风险|weather|f.?road|危险/i.test(c)) ||
    /SAFETY|RISK|WEATHER|ROAD/i.test(code) ||
    obs.decisionTrace?.cockpitRows?.some((r) =>
      /safety|risk|guardian/i.test(`${r.stage} ${r.action} ${r.explanation}`),
    );

  if (
    (event === 'delete_day' || trust === 'SEVERE_FAILURE') &&
    (safetyHint || category === 'DECISION_ERROR' || category === 'REASONING_ERROR')
  ) {
    return 'SAFETY_MISJUDGMENT';
  }

  if (obs.benchmark && obs.benchmark.pass === false) {
    return 'BENCHMARK_FAIL';
  }

  if (
    domain === 'TIMEOUT' ||
    /TIMEOUT/i.test(code) ||
    category === 'EXECUTION_ERROR'
  ) {
    if (negativeTrust || failure) return 'EXECUTION_TIMEOUT';
  }

  if (category === 'TOOL_ERROR' || domain === 'TOOL' || domain === 'NETWORK') {
    return 'TOOL_FAILURE';
  }

  if (category === 'REASONING_ERROR' || domain === 'LLM') {
    return 'REASONING_ERROR';
  }

  if (category === 'DECISION_ERROR' || domain === 'BUSINESS_RULE') {
    return 'DECISION_ERROR';
  }

  if (event === 'bypass_ai' || event === 'abandon' || trust === 'TRUST_DECLINE') {
    return 'UX_ABANDON';
  }

  if (
    event === 'edit' ||
    event === 'regenerate' ||
    event === 'reject' ||
    trust === 'PARTIAL_CORRECT' ||
    trust === 'LOW_SATISFACTION' ||
    obs.feedback?.modified === true ||
    obs.feedback?.accepted === false
  ) {
    return 'PREFERENCE_MISMATCH';
  }

  // metadata 侧 outcome_events 兜底
  const events = Array.isArray(meta?.outcome_events) ? meta!.outcome_events : [];
  for (const e of events) {
    const ev = String(asRecord(e).event ?? '').toLowerCase();
    if (ev === 'delete_day') return 'SAFETY_MISJUDGMENT';
    if (ev === 'bypass_ai' || ev === 'abandon') return 'UX_ABANDON';
  }

  return null;
}

export function suggestedActionsForPattern(
  patternId: FailurePatternId,
): Array<'policy' | 'prompt' | 'model' | 'tool' | 'memory'> {
  switch (patternId) {
    case 'SAFETY_MISJUDGMENT':
      return ['policy', 'prompt', 'model'];
    case 'PREFERENCE_MISMATCH':
      return ['memory', 'prompt', 'policy'];
    case 'TOOL_FAILURE':
      return ['tool', 'policy'];
    case 'EXECUTION_TIMEOUT':
      return ['policy', 'model'];
    case 'REASONING_ERROR':
      return ['prompt', 'model'];
    case 'DECISION_ERROR':
      return ['policy', 'prompt'];
    case 'UX_ABANDON':
      return ['prompt', 'policy'];
    case 'BENCHMARK_FAIL':
      return ['policy', 'prompt', 'model'];
    default:
      return ['policy'];
  }
}

export function deriveRunEvaluation(run: {
  id: string;
  userQuery?: string | null;
  status?: string | null;
  currentAgent?: string | null;
  metadata?: unknown;
}): DerivedRunEvaluation {
  const obs = loadObservabilityFromRun(run);
  const patternId = deriveFailurePattern(obs, asRecord(run.metadata));
  return {
    runId: run.id,
    patternId,
    trustSignal: obs?.outcome?.trustSignal ?? null,
    failureCategory: obs?.failure?.category ?? null,
    failureCode: obs?.failure?.code ?? null,
    accepted: obs?.feedback?.accepted ?? null,
    decisionSelected: obs?.decisionTrace?.finalDecision.selected ?? null,
    currentAgent: run.currentAgent ?? null,
    suggestedActions: patternId ? suggestedActionsForPattern(patternId) : [],
  };
}

export function aggregateFailurePatterns(
  runs: Array<{
    id: string;
    userQuery?: string | null;
    status?: string | null;
    currentAgent?: string | null;
    metadata?: unknown;
  }>,
  opts?: { minCount?: number; patternId?: string },
): {
  totalRunsScanned: number;
  negativeRuns: number;
  patterns: Array<{
    patternId: FailurePatternId;
    count: number;
    share: number;
    trustSignals: Record<string, number>;
    failureCategories: Record<string, number>;
    agents: Record<string, number>;
    sampleRunIds: string[];
    suggestedActions: Array<'policy' | 'prompt' | 'model' | 'tool' | 'memory'>;
  }>;
} {
  const minCount = opts?.minCount ?? 1;
  const filterPattern = opts?.patternId?.toUpperCase();
  const buckets = new Map<
    FailurePatternId,
    {
      count: number;
      trustSignals: Record<string, number>;
      failureCategories: Record<string, number>;
      agents: Record<string, number>;
      sampleRunIds: string[];
    }
  >();

  let negativeRuns = 0;
  for (const run of runs) {
    const ev = deriveRunEvaluation(run);
    if (!ev.patternId) continue;
    if (filterPattern && ev.patternId !== filterPattern) continue;
    negativeRuns += 1;
    const b = buckets.get(ev.patternId) ?? {
      count: 0,
      trustSignals: {},
      failureCategories: {},
      agents: {},
      sampleRunIds: [],
    };
    b.count += 1;
    if (ev.trustSignal) b.trustSignals[ev.trustSignal] = (b.trustSignals[ev.trustSignal] ?? 0) + 1;
    if (ev.failureCategory) {
      b.failureCategories[ev.failureCategory] =
        (b.failureCategories[ev.failureCategory] ?? 0) + 1;
    }
    if (ev.currentAgent) b.agents[ev.currentAgent] = (b.agents[ev.currentAgent] ?? 0) + 1;
    if (b.sampleRunIds.length < 8) b.sampleRunIds.push(ev.runId);
    buckets.set(ev.patternId, b);
  }

  const total = runs.length || 1;
  const patterns = [...buckets.entries()]
    .filter(([, b]) => b.count >= minCount)
    .map(([patternId, b]) => ({
      patternId,
      count: b.count,
      share: Number((b.count / total).toFixed(4)),
      trustSignals: b.trustSignals,
      failureCategories: b.failureCategories,
      agents: b.agents,
      sampleRunIds: b.sampleRunIds,
      suggestedActions: suggestedActionsForPattern(patternId),
    }))
    .sort((a, b) => b.count - a.count);

  return { totalRunsScanned: runs.length, negativeRuns, patterns };
}

export type PolicyMetricsResult = {
  agents: Array<{
    agent: string;
    runs: number;
    successRate: number;
    acceptRate: number | null;
    severeFailureRate: number;
    avgToolEfficiency: number | null;
    benchmarkPassRate: number | null;
    topPatterns: Array<{ patternId: string; count: number }>;
  }>;
  tools: Array<{
    toolId: string;
    calls: number;
    okRate: number | null;
    changedDecisionRate: number | null;
    avgContributionScore: number | null;
    avgLatencyMs: number | null;
    usefulRate: number | null;
  }>;
  memory: Array<{
    layer: string;
    runsWithLayer: number;
    acceptRateWhenPresent: number | null;
    helpfulRate: number | null;
    wrongRate: number | null;
  }>;
};

export function aggregatePolicyMetrics(
  runs: Array<{
    id: string;
    status?: string | null;
    currentAgent?: string | null;
    userQuery?: string | null;
    metadata?: unknown;
  }>,
): PolicyMetricsResult {
  type AgentBucket = {
    runs: number;
    success: number;
    accept: number;
    acceptKnown: number;
    severe: number;
    toolEff: number[];
    benchPass: number;
    benchKnown: number;
    patterns: Record<string, number>;
  };
  const agents = new Map<string, AgentBucket>();

  type ToolBucket = {
    calls: number;
    ok: number;
    okKnown: number;
    changed: number;
    changedKnown: number;
    contrib: number[];
    latency: number[];
  };
  const tools = new Map<string, ToolBucket>();

  type MemBucket = {
    present: number;
    acceptWhenPresent: number;
    acceptKnown: number;
    helpful: number;
    wrong: number;
  };
  const memory = new Map<string, MemBucket>();

  for (const run of runs) {
    const obs = loadObservabilityFromRun(run);
    const agentName = run.currentAgent || 'UnknownAgent';
    const ab = agents.get(agentName) ?? {
      runs: 0,
      success: 0,
      accept: 0,
      acceptKnown: 0,
      severe: 0,
      toolEff: [],
      benchPass: 0,
      benchKnown: 0,
      patterns: {},
    };
    ab.runs += 1;
    if (String(run.status).toUpperCase() === 'COMPLETED') ab.success += 1;
    if (typeof obs?.feedback?.accepted === 'boolean') {
      ab.acceptKnown += 1;
      if (obs.feedback.accepted) ab.accept += 1;
    }
    if (
      obs?.outcome?.trustSignal === 'SEVERE_FAILURE' ||
      obs?.outcome?.trustSignal === 'TRUST_DECLINE'
    ) {
      ab.severe += 1;
    }
    if (typeof obs?.qualityMetrics?.toolEfficiency === 'number') {
      ab.toolEff.push(obs.qualityMetrics.toolEfficiency);
    }
    if (obs?.benchmark && typeof obs.benchmark.pass === 'boolean') {
      ab.benchKnown += 1;
      if (obs.benchmark.pass) ab.benchPass += 1;
    }
    const pattern = deriveFailurePattern(obs, asRecord(run.metadata));
    if (pattern) ab.patterns[pattern] = (ab.patterns[pattern] ?? 0) + 1;
    agents.set(agentName, ab);

    for (const t of obs?.toolEvaluation ?? []) {
      const tb = tools.get(t.tool) ?? {
        calls: 0,
        ok: 0,
        okKnown: 0,
        changed: 0,
        changedKnown: 0,
        contrib: [],
        latency: [],
      };
      tb.calls += 1;
      if (typeof t.ok === 'boolean') {
        tb.okKnown += 1;
        if (t.ok) tb.ok += 1;
      }
      if (typeof t.changedDecision === 'boolean') {
        tb.changedKnown += 1;
        if (t.changedDecision) tb.changed += 1;
      }
      if (typeof t.contributionScore === 'number') tb.contrib.push(t.contributionScore);
      if (typeof t.latencyMs === 'number') tb.latency.push(t.latencyMs);
      tools.set(t.tool, tb);
    }

    const layers = asRecord(asRecord(run.metadata).memory_summary).layers;
    const layerList = Array.isArray(layers)
      ? layers.map(String)
      : obs?.memoryTrace?.used?.length
        ? ['memory_trace']
        : [];
    for (const layer of layerList.length ? layerList : []) {
      const mb = memory.get(layer) ?? {
        present: 0,
        acceptWhenPresent: 0,
        acceptKnown: 0,
        helpful: 0,
        wrong: 0,
      };
      mb.present += 1;
      if (typeof obs?.feedback?.accepted === 'boolean') {
        mb.acceptKnown += 1;
        if (obs.feedback.accepted) mb.acceptWhenPresent += 1;
      }
      // 启发式：有 memoryTrace.used → helpful；negative outcome + memory used → wrong
      if ((obs?.memoryTrace?.used?.length ?? 0) > 0) {
        if (obs?.feedback?.accepted === true || obs?.outcome?.trustSignal === 'HIGH_TRUST') {
          mb.helpful += 1;
        }
        if (
          obs?.outcome?.trustSignal === 'SEVERE_FAILURE' ||
          obs?.outcome?.trustSignal === 'TRUST_DECLINE' ||
          obs?.feedback?.accepted === false
        ) {
          mb.wrong += 1;
        }
      }
      memory.set(layer, mb);
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)) : null;

  return {
    agents: [...agents.entries()]
      .map(([agent, b]) => ({
        agent,
        runs: b.runs,
        successRate: Number((b.success / Math.max(b.runs, 1)).toFixed(3)),
        acceptRate:
          b.acceptKnown > 0 ? Number((b.accept / b.acceptKnown).toFixed(3)) : null,
        severeFailureRate: Number((b.severe / Math.max(b.runs, 1)).toFixed(3)),
        avgToolEfficiency: avg(b.toolEff),
        benchmarkPassRate:
          b.benchKnown > 0 ? Number((b.benchPass / b.benchKnown).toFixed(3)) : null,
        topPatterns: Object.entries(b.patterns)
          .map(([patternId, count]) => ({ patternId, count }))
          .sort((a, b2) => b2.count - a.count)
          .slice(0, 5),
      }))
      .sort((a, b) => b.runs - a.runs),
    tools: [...tools.entries()]
      .map(([toolId, b]) => {
        const changedDecisionRate =
          b.changedKnown > 0 ? Number((b.changed / b.changedKnown).toFixed(3)) : null;
        const avgContributionScore = avg(b.contrib);
        return {
          toolId,
          calls: b.calls,
          okRate: b.okKnown > 0 ? Number((b.ok / b.okKnown).toFixed(3)) : null,
          changedDecisionRate,
          avgContributionScore,
          avgLatencyMs: avg(b.latency),
          usefulRate:
            changedDecisionRate != null
              ? changedDecisionRate
              : avgContributionScore != null
                ? Number(Math.min(1, avgContributionScore).toFixed(3))
                : null,
        };
      })
      .sort((a, b) => b.calls - a.calls),
    memory: [...memory.entries()]
      .map(([layer, b]) => ({
        layer,
        runsWithLayer: b.present,
        acceptRateWhenPresent:
          b.acceptKnown > 0 ? Number((b.acceptWhenPresent / b.acceptKnown).toFixed(3)) : null,
        helpfulRate: Number((b.helpful / Math.max(b.present, 1)).toFixed(3)),
        wrongRate: Number((b.wrong / Math.max(b.present, 1)).toFixed(3)),
      }))
      .sort((a, b) => b.runsWithLayer - a.runsWithLayer),
  };
}

/** 对比两次决策审计投影（Replay Compare） */
export function compareDecisionObservability(
  before: TripRunObservabilityV1 | null,
  after: TripRunObservabilityV1 | null,
): {
  decisionSelected: { before: string | null; after: string | null; changed: boolean };
  completeness: { before: string | null; after: string | null };
  safetyDelta: {
    constraintsBefore: string[];
    constraintsAfter: string[];
    added: string[];
    removed: string[];
    scoreDelta: number | null;
  };
  preferenceDelta: {
    acceptedBefore: boolean | null;
    acceptedAfter: boolean | null;
    scoreDelta: number | null;
  };
  evidenceDelta: {
    coverageBefore: number | null;
    coverageAfter: number | null;
    delta: number | null;
  };
  toolDiff: { added: string[]; removed: string[]; beforeCount: number; afterCount: number };
  qualityDelta: {
    taskSuccessBefore: boolean | null;
    taskSuccessAfter: boolean | null;
    toolEfficiencyDelta: number | null;
  };
} {
  const selBefore = before?.decisionTrace?.finalDecision.selected ?? null;
  const selAfter = after?.decisionTrace?.finalDecision.selected ?? null;
  const cBefore = before?.decisionTrace?.goalExtraction.constraintsDetected ?? [];
  const cAfter = after?.decisionTrace?.goalExtraction.constraintsDetected ?? [];
  const added = cAfter.filter((c) => !cBefore.includes(c));
  const removed = cBefore.filter((c) => !cAfter.includes(c));

  const toolsBefore = new Set((before?.toolEvaluation ?? []).map((t) => t.tool));
  const toolsAfter = new Set((after?.toolEvaluation ?? []).map((t) => t.tool));

  const covB = before?.qualityMetrics?.evidenceCoverage ?? null;
  const covA = after?.qualityMetrics?.evidenceCoverage ?? null;
  const effB = before?.qualityMetrics?.toolEfficiency ?? null;
  const effA = after?.qualityMetrics?.toolEfficiency ?? null;

  // Safety score 启发式：更多安全约束被保留 / 更少删除日类 severe → 正向
  const safetyBefore = cBefore.filter((c) => /safety|risk|夜驾|高风险|weather/i.test(c)).length;
  const safetyAfter = cAfter.filter((c) => /safety|risk|夜驾|高风险|weather/i.test(c)).length;
  const safetyScoreDelta =
    safetyBefore + safetyAfter > 0
      ? Number((((safetyAfter - safetyBefore) / Math.max(safetyBefore, safetyAfter, 1)) * 100).toFixed(1))
      : covB != null && covA != null
        ? Number((((covA - covB) * 100)).toFixed(1))
        : null;

  const prefBefore = before?.feedback?.accepted;
  const prefAfter = after?.feedback?.accepted;
  let preferenceScoreDelta: number | null = null;
  if (typeof prefBefore === 'boolean' && typeof prefAfter === 'boolean') {
    preferenceScoreDelta = (prefAfter ? 1 : 0) - (prefBefore ? 1 : 0);
    preferenceScoreDelta = Number((preferenceScoreDelta * 100).toFixed(1));
  }

  return {
    decisionSelected: {
      before: selBefore,
      after: selAfter,
      changed: selBefore !== selAfter,
    },
    completeness: {
      before: before?.decisionCompleteness ?? null,
      after: after?.decisionCompleteness ?? null,
    },
    safetyDelta: {
      constraintsBefore: cBefore,
      constraintsAfter: cAfter,
      added,
      removed,
      scoreDelta: safetyScoreDelta,
    },
    preferenceDelta: {
      acceptedBefore: typeof prefBefore === 'boolean' ? prefBefore : null,
      acceptedAfter: typeof prefAfter === 'boolean' ? prefAfter : null,
      scoreDelta: preferenceScoreDelta,
    },
    evidenceDelta: {
      coverageBefore: covB,
      coverageAfter: covA,
      delta:
        covB != null && covA != null ? Number(((covA - covB) * 100).toFixed(1)) : null,
    },
    toolDiff: {
      added: [...toolsAfter].filter((t) => !toolsBefore.has(t)),
      removed: [...toolsBefore].filter((t) => !toolsAfter.has(t)),
      beforeCount: toolsBefore.size,
      afterCount: toolsAfter.size,
    },
    qualityDelta: {
      taskSuccessBefore: before?.qualityMetrics?.taskSuccess ?? null,
      taskSuccessAfter: after?.qualityMetrics?.taskSuccess ?? null,
      toolEfficiencyDelta:
        effB != null && effA != null ? Number(((effA - effB) * 100).toFixed(1)) : null,
    },
  };
}
