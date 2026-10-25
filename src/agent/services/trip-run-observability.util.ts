/**
 * TripRun Decision Audit Observability — 把 route_and_run 响应投影为可审计的决策记录。
 * Schema: tripnara.trip_run_observability@v1
 *
 * P0: decisionTrace / evidenceTrace / stepTimeline / failure
 * P1 stubs: memoryTrace / toolEvaluation / feedback / behavior
 * P2 stubs: qualityMetrics / benchmark
 */

import { classifyEvidenceBucket, type EvidenceFreshnessV1 } from '../harness/hardening/evidence.contract';
import { buildToolInvocationSummary } from './trip-run-tool-invocation.util';

export const TRIP_RUN_OBSERVABILITY_SCHEMA_ID = 'tripnara.trip_run_observability@v1' as const;

export type FailureCategoryV1 =
  | 'INPUT_ERROR'
  | 'CONTEXT_ERROR'
  | 'MEMORY_ERROR'
  | 'TOOL_ERROR'
  | 'REASONING_ERROR'
  | 'DECISION_ERROR'
  | 'EXECUTION_ERROR'
  | 'UX_ERROR'
  | 'UNKNOWN';

export type TripRunDecisionTraceV1 = {
  goalExtraction: {
    userGoal: string | null;
    taskType: string | null;
    constraintsDetected: string[];
    confidence: number | null;
  };
  reasoningState: {
    currentState: string | null;
    missingInformation: string[];
    deliveryStatus: string | null;
  };
  optionsGenerated: Array<{
    option: string;
    score: number | null;
    pros: string[];
    cons: string[];
  }>;
  finalDecision: {
    selected: string | null;
    reason: string | null;
    modeFinal: string | null;
  };
  /** Decision Cockpit / agent_run_trace 窄切片 */
  cockpitRows: Array<{
    stage: string;
    action: string;
    explanation: string;
    reasonCodes: string[];
  }>;
};

export type TripRunEvidenceItemV1 = {
  claim: string;
  source: string | null;
  type: EvidenceFreshnessV1;
  timestamp: string | null;
  confidence: number | null;
  key?: string;
};

export type TripRunEvidenceTraceV1 = {
  bucket: { verified: number; stale: number; assumed: number; unavailable: number };
  items: TripRunEvidenceItemV1[];
  sufficiency: {
    strengthAllowed: string | null;
    conclusionStrength: string | null;
  } | null;
};

export type TripRunStepV1 = {
  step: number;
  agent: string | null;
  action: string;
  tool: string | null;
  status: string | null;
  durationMs: number | null;
  phase: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type TripRunFailureV1 = {
  category: FailureCategoryV1;
  stage: string | null;
  type: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recoverable: boolean | null;
  domain: string | null;
  code: string | null;
  sourceLayer: string | null;
  messagePreview: string | null;
};

export type TripRunObservabilityV1 = {
  schemaId: typeof TRIP_RUN_OBSERVABILITY_SCHEMA_ID;
  version: 1;
  projectedAt: string;
  /**
   * FULL: Goal+Constraints+Evidence+Options+Decision 齐全
   * PARTIAL: 有 Decision 但缺 Options（TripNARA 核心资产缺失）
   * MINIMAL: 仅有 query/status 级信号
   */
  decisionCompleteness: 'FULL' | 'PARTIAL' | 'MINIMAL' | null;
  decisionTrace: TripRunDecisionTraceV1 | null;
  evidenceTrace: TripRunEvidenceTraceV1 | null;
  steps: TripRunStepV1[];
  failure: TripRunFailureV1 | null;
  /** P1 */
  memoryTrace: {
    used: Array<{
      memoryId: string;
      content: string | null;
      influence: string;
      weight: number;
      confidence: number | null;
    }>;
  } | null;
  toolEvaluation: Array<{
    tool: string;
    called: boolean;
    ok: boolean | null;
    changedDecision: boolean | null;
    contributionScore: number | null;
    latencyMs: number | null;
  }> | null;
  feedback: {
    rating: number | null;
    accepted: boolean | null;
    modified: boolean | null;
    userCorrection: string | null;
  } | null;
  behavior: {
    clickedRecommend: boolean | null;
    regenerated: boolean | null;
    editedRoute: boolean | null;
    abandoned: boolean | null;
  } | null;
  /**
   * M1 Outcome Loop：决策呈现后的真实结果验证（强信号优先于星级评分）
   */
  outcome: {
    latestEvent: string | null;
    trustSignal:
      | 'HIGH_TRUST'
      | 'PARTIAL_CORRECT'
      | 'LOW_SATISFACTION'
      | 'SEVERE_FAILURE'
      | 'TRUST_DECLINE'
      | null;
    verified: boolean;
    eventCount: number;
  } | null;
  /** P2 */
  qualityMetrics: {
    taskSuccess: boolean | null;
    constraintCoverage: number | null;
    hallucinationRisk: number | null;
    evidenceCoverage: number | null;
    recoverySuccess: boolean | null;
    userSatisfaction: number | null;
    /** 工具调用中真正进入证据链 / 改变决策的比例 */
    toolEfficiency: number | null;
  } | null;
  benchmark: {
    taskId: string | null;
    pass: boolean | null;
    score: number | null;
    failedDimension: string[];
  } | null;
};

/** 评估决策链完整度：无 Options 不得标 FULL */
export function computeDecisionCompleteness(
  decisionTrace: TripRunDecisionTraceV1 | null,
  evidenceTrace: TripRunEvidenceTraceV1 | null,
): 'FULL' | 'PARTIAL' | 'MINIMAL' | null {
  if (!decisionTrace) return null;
  const hasGoal = !!decisionTrace.goalExtraction.userGoal || !!decisionTrace.goalExtraction.taskType;
  const hasConstraints = decisionTrace.goalExtraction.constraintsDetected.length > 0;
  const hasEvidence =
    !!evidenceTrace &&
    (evidenceTrace.items.length > 0 ||
      evidenceTrace.bucket.verified +
        evidenceTrace.bucket.stale +
        evidenceTrace.bucket.assumed +
        evidenceTrace.bucket.unavailable >
        0);
  const hasOptions = decisionTrace.optionsGenerated.length > 0;
  const hasDecision = !!decisionTrace.finalDecision.selected || !!decisionTrace.finalDecision.modeFinal;

  if (hasGoal && hasConstraints && hasEvidence && hasOptions && hasDecision) return 'FULL';
  if (hasDecision || hasOptions || hasEvidence || hasConstraints) return 'PARTIAL';
  if (hasGoal) return 'MINIMAL';
  return 'MINIMAL';
}


function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asString(value: unknown, max = 400): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function mapFailureCategory(domain: string | null | undefined): FailureCategoryV1 {
  switch (String(domain ?? '').toUpperCase()) {
    case 'TOOL':
    case 'NETWORK':
      return 'TOOL_ERROR';
    case 'LLM':
      return 'REASONING_ERROR';
    case 'TIMEOUT':
    case 'ORCHESTRATION':
      return 'EXECUTION_ERROR';
    case 'BUSINESS_RULE':
      return 'DECISION_ERROR';
    case 'MEMORY':
      return 'MEMORY_ERROR';
    case 'INPUT':
      return 'INPUT_ERROR';
    case 'CONTEXT':
      return 'CONTEXT_ERROR';
    case 'UX':
      return 'UX_ERROR';
    default:
      return 'UNKNOWN';
  }
}

function mapSeverity(robustness: Record<string, any>): TripRunFailureV1['severity'] {
  const code = String(robustness.failure_code ?? '').toUpperCase();
  if (/FATAL|CRITICAL|OOM|CORRUPT/.test(code)) return 'CRITICAL';
  if (robustness.retryable_hint === false) return 'HIGH';
  if (String(robustness.failure_domain ?? '').toUpperCase() === 'TIMEOUT') return 'HIGH';
  if (robustness.retryable_hint === true) return 'MEDIUM';
  return 'MEDIUM';
}

function freshnessConfidence(type: EvidenceFreshnessV1): number {
  if (type === 'VERIFIED') return 0.95;
  if (type === 'STALE') return 0.55;
  if (type === 'ASSUMED') return 0.4;
  return 0.1;
}

function extractDecisionOptions(source: Record<string, any>): TripRunDecisionTraceV1['optionsGenerated'] {
  const out: TripRunDecisionTraceV1['optionsGenerated'] = [];
  const visit = (node: unknown, depth = 0) => {
    if (depth > 5 || node == null || out.length >= 12) return;
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, any>;
    if (obj.kind === 'decision_options' && Array.isArray(obj.options)) {
      for (const opt of obj.options) {
        if (!opt || typeof opt !== 'object') continue;
        const o = opt as Record<string, any>;
        const label =
          asString(o.labelZh ?? o.label ?? o.title ?? o.id ?? o.option, 120) ?? 'option';
        out.push({
          option: label,
          score: typeof o.score === 'number' ? o.score : null,
          pros: Array.isArray(o.pros) ? o.pros.map(String).slice(0, 5) : [],
          cons: Array.isArray(o.cons) ? o.cons.map(String).slice(0, 5) : [],
        });
      }
      return;
    }
    if (Array.isArray(obj.alternatives)) {
      for (const alt of obj.alternatives) {
        if (!alt || typeof alt !== 'object') continue;
        const a = alt as Record<string, any>;
        out.push({
          option: asString(a.labelZh ?? a.label ?? a.id, 120) ?? 'alt',
          score: typeof a.score === 'number' ? a.score : typeof a.utility === 'number' ? a.utility : null,
          pros: [],
          cons: [],
        });
      }
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  visit(source);
  return out;
}

function buildDecisionTrace(
  root: Record<string, any>,
  obs: Record<string, any>,
  explain: Record<string, any>,
): TripRunDecisionTraceV1 | null {
  const turn = asRecord(obs.agent_turn_trace);
  const turnTask = asRecord(turn.task);
  const runTrace = asRecord(obs.agent_run_trace_v1);
  const cockpit = asRecord(explain.decision_cockpit);
  const nodes = Array.isArray(runTrace.nodes) ? runTrace.nodes : [];
  const lastNode = nodes.length ? asRecord(nodes[nodes.length - 1]) : {};

  const userGoal =
    asString(turnTask.userGoal) ||
    asString(root.userQuery) ||
    asString(root.user_query) ||
    asString(obs.user_message_preview) ||
    null;

  const constraintsDetected = Array.isArray(turnTask.constraintsDetected)
    ? turnTask.constraintsDetected.map(String).slice(0, 12)
    : [];

  const optionsGenerated = extractDecisionOptions({
    conversation_turn_result: root.conversation_turn_result ?? root.result?.conversation_turn_result,
    ui_display: root.ui_display,
    explain,
    observability: obs,
  });

  const cockpitRows = (Array.isArray(cockpit.decision_trace_rows) ? cockpit.decision_trace_rows : [])
    .slice(0, 24)
    .map((r: any) => ({
      stage: String(r.decision_stage ?? ''),
      action: String(r.action ?? ''),
      explanation: String(r.explanation ?? '').slice(0, 240),
      reasonCodes: Array.isArray(r.reason_codes) ? r.reason_codes.map(String).slice(0, 8) : [],
    }));

  const selected =
    asString(cockpit.chosen_plan_id) ||
    asString(obs.mode_final) ||
    asString(runTrace.final_delivery_status) ||
    null;

  const reason =
    asString(cockpit.verdict_narration_zh, 320) ||
    (cockpitRows[0]?.explanation ? cockpitRows[0].explanation : null);

  const hasSignal =
    userGoal ||
    constraintsDetected.length ||
    optionsGenerated.length ||
    cockpitRows.length ||
    selected ||
    nodes.length;

  if (!hasSignal) return null;

  return {
    goalExtraction: {
      userGoal,
      taskType: asString(turn.task_type ?? turnTask.taskType),
      constraintsDetected,
      confidence: null,
    },
    reasoningState: {
      currentState:
        asString(lastNode.step) ||
        asString(obs.orchestration_mode_final) ||
        asString(obs.mode_final) ||
        null,
      missingInformation: Array.isArray(turn.capability_denied)
        ? turn.capability_denied.map(String).slice(0, 8)
        : [],
      deliveryStatus:
        asString(runTrace.final_delivery_status) ||
        asString(root.result?.status) ||
        asString(turn.result_status) ||
        null,
    },
    optionsGenerated,
    finalDecision: {
      selected,
      reason,
      modeFinal: asString(obs.mode_final ?? obs.orchestration_mode_final),
    },
    cockpitRows,
  };
}

function buildEvidenceTrace(
  obs: Record<string, any>,
  explain: Record<string, any>,
): TripRunEvidenceTraceV1 | null {
  const turn = asRecord(obs.agent_turn_trace);
  const items: TripRunEvidenceItemV1[] = [];

  const facts = Array.isArray(turn.evidence_facts) ? turn.evidence_facts : [];
  for (const f of facts) {
    if (!f || typeof f !== 'object') continue;
    const row = f as Record<string, any>;
    const type = String(row.freshness ?? 'ASSUMED').toUpperCase() as EvidenceFreshnessV1;
    const freshness: EvidenceFreshnessV1 = ['VERIFIED', 'STALE', 'ASSUMED', 'UNAVAILABLE'].includes(
      type,
    )
      ? type
      : 'ASSUMED';
    items.push({
      claim: asString(row.valueZh ?? row.claim ?? row.key, 240) ?? 'evidence',
      source: asString(row.source, 80),
      type: freshness,
      timestamp: asString(row.observedAt ?? row.timestamp, 40),
      confidence: freshnessConfidence(freshness),
      key: asString(row.key, 80) ?? undefined,
    });
  }

  // decision cockpit evidence_refs → ASSUMED refs（无正文时仅记引用）
  if (items.length === 0 && Array.isArray(explain.decision_cockpit?.decision_trace_rows)) {
    for (const row of explain.decision_cockpit.decision_trace_rows.slice(0, 12)) {
      const refs = Array.isArray(row?.evidence_refs) ? row.evidence_refs : [];
      for (const ref of refs.slice(0, 4)) {
        items.push({
          claim: asString(row.explanation, 160) ?? String(ref),
          source: String(ref),
          type: 'ASSUMED',
          timestamp: null,
          confidence: 0.4,
          key: String(ref),
        });
      }
    }
  }

  const bucketFromTurn = turn.evidence_bucket;
  const bucket =
    bucketFromTurn && typeof bucketFromTurn === 'object'
      ? {
          verified: Number(bucketFromTurn.verified) || 0,
          stale: Number(bucketFromTurn.stale) || 0,
          assumed: Number(bucketFromTurn.assumed) || 0,
          unavailable: Number(bucketFromTurn.unavailable) || 0,
        }
      : classifyEvidenceBucket(
          items.map((i) => ({
            key: i.key ?? i.claim,
            valueZh: i.claim,
            freshness: i.type,
            source: i.source ?? undefined,
          })),
        );

  if (items.length === 0 && bucket.verified + bucket.stale + bucket.assumed + bucket.unavailable === 0) {
    return null;
  }

  return {
    bucket,
    items: items.slice(0, 24),
    sufficiency: {
      strengthAllowed: null,
      conclusionStrength: asString(turn.conclusion_strength),
    },
  };
}

function buildSteps(obs: Record<string, any>, runTrace: Record<string, any>): TripRunStepV1[] {
  const steps: TripRunStepV1[] = [];
  const timeline = Array.isArray(obs.execution_timeline_preview)
    ? obs.execution_timeline_preview
    : [];

  if (timeline.length) {
    timeline.slice(0, 48).forEach((ev: any, idx: number) => {
      steps.push({
        step: idx + 1,
        agent: asString(ev.actor ?? ev.agent, 60),
        action: asString(ev.operation ?? ev.eventType ?? ev.action, 80) ?? 'event',
        tool: asString(ev.tool ?? ev.toolId, 80),
        status: asString(ev.status, 40),
        durationMs:
          typeof ev.durationMs === 'number'
            ? ev.durationMs
            : typeof ev.duration_ms === 'number'
              ? ev.duration_ms
              : null,
        phase: asString(ev.phase, 40),
        inputTokens: typeof ev.inputTokens === 'number' ? ev.inputTokens : null,
        outputTokens: typeof ev.outputTokens === 'number' ? ev.outputTokens : null,
      });
    });
    return steps;
  }

  const nodes = Array.isArray(runTrace.nodes) ? runTrace.nodes : [];
  nodes.slice(0, 48).forEach((n: any, idx: number) => {
    steps.push({
      step: idx + 1,
      agent: asString(n.system_action, 60),
      action: asString(n.step, 80) ?? `node_${idx + 1}`,
      tool: null,
      status: asString(n.outputs_summary, 40),
      durationMs: typeof n.duration_ms === 'number' ? n.duration_ms : null,
      phase: null,
      inputTokens: null,
      outputTokens: null,
    });
  });
  return steps;
}

function buildFailure(
  robustness: Record<string, any> | null,
  obs: Record<string, any>,
  root: Record<string, any>,
): TripRunFailureV1 | null {
  const r =
    robustness && Object.keys(robustness).length
      ? robustness
      : asRecord(obs.orchestrator_robustness).failure_domain ||
          asRecord(obs.orchestrator_robustness).failure_code
        ? asRecord(obs.orchestrator_robustness)
        : asRecord(root.orchestrator_robustness);

  if (!r.failure_domain && !r.failure_code && !root.error && !obs.error) {
    return null;
  }

  const domain = asString(r.failure_domain);
  const code = asString(r.failure_code);
  return {
    category: mapFailureCategory(domain),
    stage: asString(r.orchestrator_step_at_failure) || asString(obs.mode_final),
    type: code,
    severity: Object.keys(r).length ? mapSeverity(r) : 'MEDIUM',
    recoverable: typeof r.retryable_hint === 'boolean' ? r.retryable_hint : null,
    domain,
    code,
    sourceLayer: asString(r.source_layer),
    messagePreview:
      asString(r.message_preview) ||
      asString(root.error) ||
      asString(obs.error) ||
      null,
  };
}

function buildMemoryTrace(obs: Record<string, any>): TripRunObservabilityV1['memoryTrace'] {
  const mdt = asRecord(obs.memory_decision_trace);
  const influence = Array.isArray(mdt.memoryContribution?.influence)
    ? mdt.memoryContribution.influence
    : Array.isArray(mdt.memoryContribution?.memories)
      ? mdt.memoryContribution.memories
      : [];
  if (!influence.length) return null;

  const contentById = new Map<string, string>();
  const consume = asRecord(obs.travel_memory_consume);
  const hints = Array.isArray(consume.decisionHints)
    ? consume.decisionHints
    : Array.isArray(obs.travel_memory_decision_hints)
      ? obs.travel_memory_decision_hints
      : [];
  for (const h of hints) {
    if (!h || typeof h !== 'object') continue;
    const id = String((h as any).memoryId ?? '');
    if (!id || contentById.has(id)) continue;
    const key = String((h as any).key ?? '');
    let valueStr = '';
    try {
      valueStr = JSON.stringify((h as any).value);
    } catch {
      valueStr = String((h as any).value ?? '');
    }
    const content = asString(key ? `${key}=${valueStr}` : valueStr, 200);
    if (content) contentById.set(id, content);
  }

  // ETC advisoryHints 兜底
  const etc = asRecord(obs.effective_traveler_context);
  const advisory = Array.isArray(etc.advisoryHints) ? etc.advisoryHints : [];
  for (const h of advisory) {
    if (!h || typeof h !== 'object') continue;
    const id = String((h as any).memoryId ?? '');
    if (!id || contentById.has(id)) continue;
    const key = String((h as any).key ?? '');
    let valueStr = '';
    try {
      valueStr = JSON.stringify((h as any).value);
    } catch {
      valueStr = String((h as any).value ?? '');
    }
    const content = asString(key ? `${key}=${valueStr}` : valueStr, 200);
    if (content) contentById.set(id, content);
  }

  return {
    used: influence.slice(0, 20).map((i: any) => {
      const memoryId = String(i.memoryId ?? i.id ?? 'unknown');
      return {
        memoryId,
        content: contentById.get(memoryId) ?? null,
        influence: String(i.influence ?? 'OTHER'),
        weight: typeof i.weight === 'number' ? i.weight : 0,
        confidence: typeof i.confidence === 'number' ? i.confidence : null,
      };
    }),
  };
}

function normalizeToolToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^live_tool[:.]/, '')
    .replace(/^skill[:.]/, '')
    .replace(/^mcp[:.]/, '')
    .replace(/[:/]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function collectDecisionEvidenceRefs(
  root: Record<string, any>,
  obs: Record<string, any>,
  explain: Record<string, any>,
): Set<string> {
  const refs = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) refs.add(normalizeToolToken(v.trim()));
    else if (Array.isArray(v)) v.forEach(add);
  };

  const runTrace = asRecord(obs.agent_run_trace_v1);
  for (const n of Array.isArray(runTrace.nodes) ? runTrace.nodes : []) {
    add(asRecord(n).evidence_refs);
  }

  const cockpit = asRecord(explain.decision_cockpit);
  for (const row of Array.isArray(cockpit.decision_trace_rows) ? cockpit.decision_trace_rows : []) {
    add(asRecord(row).evidence_refs);
  }

  const visit = (node: unknown, depth = 0) => {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, any>;
    if (Array.isArray(obj.evidence_refs)) add(obj.evidence_refs);
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  visit(root.result?.decision_log ?? root.decision_log);
  visit(obs.live_sensor_audit);

  return refs;
}

function toolMatchesEvidence(toolId: string, refs: Set<string>): boolean {
  const token = normalizeToolToken(toolId);
  if (!token) return false;
  if (refs.has(token)) return true;
  for (const r of refs) {
    if (r.includes(token) || token.includes(r)) return true;
  }
  return false;
}

function buildToolEvaluation(
  source: unknown,
  root: Record<string, any>,
  obs: Record<string, any>,
  explain: Record<string, any>,
): TripRunObservabilityV1['toolEvaluation'] {
  const summary = buildToolInvocationSummary(source);
  if (!summary || summary.toolCallsCount === 0) return null;
  const all = [...summary.skills, ...summary.mcp, ...summary.liveTools, ...summary.other];
  const refs = collectDecisionEvidenceRefs(root, obs, explain);
  const hasDecisionSurface = refs.size > 0;

  return all.slice(0, 30).map((t) => {
    const inEvidence = toolMatchesEvidence(t.toolId, refs);
    const changedDecision = hasDecisionSurface
      ? t.ok === true && inEvidence
        ? true
        : t.ok === false
          ? false
          : inEvidence
            ? true
            : false
      : null;

    let contributionScore: number | null = null;
    if (t.ok === false) contributionScore = 0;
    else if (changedDecision === true) contributionScore = 0.85;
    else if (changedDecision === false) contributionScore = 0.15;
    else if (t.ok === true) contributionScore = 0.4;

    return {
      tool: t.toolId,
      called: true,
      ok: t.ok,
      changedDecision,
      contributionScore,
      latencyMs: t.latencyMs,
    };
  });
}

function buildQualityMetrics(args: {
  root: Record<string, any>;
  obs: Record<string, any>;
  evidence: TripRunEvidenceTraceV1 | null;
  failure: TripRunFailureV1 | null;
  runTrace: Record<string, any>;
  decisionTrace: TripRunDecisionTraceV1 | null;
  toolEvaluation: TripRunObservabilityV1['toolEvaluation'];
}): TripRunObservabilityV1['qualityMetrics'] {
  const status = String(args.root.result?.status ?? args.root.status ?? '').toUpperCase();
  const delivery = String(args.runTrace.final_delivery_status ?? '').toUpperCase();
  const taskSuccess =
    args.failure != null
      ? false
      : ['OK', 'COMPLETED', 'SUCCESS'].includes(delivery) ||
          ['COMPLETED', 'OK', 'SUCCESS'].includes(status)
        ? true
        : ['FAILED', 'ERROR', 'BLOCKED'].includes(status) || delivery === 'FAILED'
          ? false
          : null;

  const bag = args.evidence?.bucket;
  const total = bag ? bag.verified + bag.stale + bag.assumed + bag.unavailable : 0;
  const evidenceCoverage =
    total > 0 && bag ? Number(((bag.verified + bag.stale * 0.5) / total).toFixed(3)) : null;

  const hall = asRecord(args.runTrace.hallucination_gate);
  const hallucinationRisk =
    hall.verdict === 'BLOCK' || hall.verdict === 'FAILED'
      ? 0.9
      : hall.verdict === 'WARN'
        ? 0.45
        : hall.verdict
          ? 0.08
          : null;

  const recoveryAttempts =
    typeof args.obs.recovery_retry_attempts === 'number'
      ? args.obs.recovery_retry_attempts
      : Array.isArray(args.obs.recovery_trace)
        ? args.obs.recovery_trace.length
        : null;
  const recoverySuccess =
    recoveryAttempts != null
      ? recoveryAttempts > 0 && taskSuccess === true
        ? true
        : recoveryAttempts > 0 && taskSuccess === false
          ? false
          : null
      : null;

  const constraints = args.decisionTrace?.goalExtraction.constraintsDetected ?? [];
  const missing = args.decisionTrace?.reasoningState.missingInformation ?? [];
  const constraintCoverage =
    constraints.length > 0
      ? Number(
          Math.max(0, Math.min(1, (constraints.length - missing.length) / constraints.length)).toFixed(
            3,
          ),
        )
      : null;

  const tools = args.toolEvaluation ?? [];
  const scored = tools.filter((t) => typeof t.changedDecision === 'boolean');
  const toolEfficiency =
    scored.length > 0
      ? Number(
          (scored.filter((t) => t.changedDecision === true).length / scored.length).toFixed(3),
        )
      : tools.length > 0
        ? Number(
            (
              tools.filter((t) => typeof t.contributionScore === 'number' && (t.contributionScore ?? 0) >= 0.5)
                .length / tools.length
            ).toFixed(3),
          )
        : null;

  if (
    taskSuccess == null &&
    evidenceCoverage == null &&
    hallucinationRisk == null &&
    recoverySuccess == null &&
    constraintCoverage == null &&
    toolEfficiency == null
  ) {
    return null;
  }

  return {
    taskSuccess,
    constraintCoverage,
    hallucinationRisk,
    evidenceCoverage,
    recoverySuccess,
    userSatisfaction: null,
    toolEfficiency,
  };
}

function resolveBenchmark(
  root: Record<string, any>,
  obs: Record<string, any>,
  extras?: {
    benchmark?: TripRunObservabilityV1['benchmark'];
  },
): TripRunObservabilityV1['benchmark'] {
  if (extras?.benchmark && extras.benchmark.taskId) {
    return {
      taskId: extras.benchmark.taskId,
      pass: extras.benchmark.pass ?? null,
      score: extras.benchmark.score ?? null,
      failedDimension: Array.isArray(extras.benchmark.failedDimension)
        ? extras.benchmark.failedDimension.map(String).slice(0, 20)
        : [],
    };
  }

  const fromObs = asRecord(obs.benchmark ?? obs.golden_eval ?? root.benchmark);
  const taskId =
    asString(fromObs.taskId ?? fromObs.task_id ?? fromObs.caseId ?? fromObs.case_id) ||
    asString(root.options?.golden_eval_task_id) ||
    asString(obs.golden_eval_task_id);
  if (!taskId) return null;

  const failedRaw = fromObs.failedDimension ?? fromObs.failed_dimension ?? fromObs.failedDimensions;
  return {
    taskId,
    pass: typeof fromObs.pass === 'boolean' ? fromObs.pass : typeof fromObs.passed === 'boolean' ? fromObs.passed : null,
    score: typeof fromObs.score === 'number' ? fromObs.score : null,
    failedDimension: Array.isArray(failedRaw) ? failedRaw.map(String).slice(0, 20) : [],
  };
}

/** 从 route_and_run 响应 / summaryJson / metadata 投影完整决策审计包 */
export function buildTripRunObservabilityV1(
  source: unknown,
  extras?: {
    robustness?: Record<string, any> | null;
    userQuery?: string | null;
    status?: string | null;
    benchmark?: TripRunObservabilityV1['benchmark'];
  },
): TripRunObservabilityV1 | null {
  if (!source && !extras?.robustness && !extras?.benchmark) return null;
  const root = asRecord(source);
  const obs = asRecord(root.observability ?? root);
  const explain = asRecord(root.explain);
  const runTrace = asRecord(obs.agent_run_trace_v1);

  if (extras?.userQuery && !root.userQuery) {
    root.userQuery = extras.userQuery;
  }
  if (extras?.status && !root.status) {
    root.status = extras.status;
  }

  const decisionTrace = buildDecisionTrace(root, obs, explain);
  const evidenceTrace = buildEvidenceTrace(obs, explain);
  const steps = buildSteps(obs, runTrace);
  const failure = buildFailure(extras?.robustness ?? null, obs, root);
  const memoryTrace = buildMemoryTrace(obs);
  const toolEvaluation = buildToolEvaluation(source, root, obs, explain);
  const qualityMetrics = buildQualityMetrics({
    root,
    obs,
    evidence: evidenceTrace,
    failure,
    runTrace,
    decisionTrace,
    toolEvaluation,
  });
  const benchmark = resolveBenchmark(root, obs, extras);

  const hasAny =
    decisionTrace ||
    evidenceTrace ||
    steps.length ||
    failure ||
    memoryTrace ||
    toolEvaluation ||
    qualityMetrics ||
    benchmark;

  if (!hasAny) return null;

  const decisionCompleteness = computeDecisionCompleteness(decisionTrace, evidenceTrace);

  return {
    schemaId: TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
    version: 1,
    projectedAt: new Date().toISOString(),
    decisionCompleteness,
    decisionTrace,
    evidenceTrace,
    steps,
    failure,
    memoryTrace,
    toolEvaluation,
    feedback: null,
    behavior: null,
    outcome: null,
    qualityMetrics,
    benchmark,
  };
}

/** 写入 TripRun.metadata */
export function buildTripRunObservabilityMetadataPatch(
  source: unknown,
  extras?: {
    robustness?: Record<string, any> | null;
    userQuery?: string | null;
    status?: string | null;
    benchmark?: TripRunObservabilityV1['benchmark'];
  },
): Record<string, unknown> {
  const observability = buildTripRunObservabilityV1(source, extras);
  if (!observability) return {};
  return {
    observability_v1: observability,
    decision_selected: observability.decisionTrace?.finalDecision.selected ?? null,
    decision_completeness: observability.decisionCompleteness,
    evidence_bucket: observability.evidenceTrace?.bucket ?? null,
    failure_category: observability.failure?.category ?? null,
    failure_recoverable: observability.failure?.recoverable ?? null,
    step_count: observability.steps.length,
    tool_efficiency: observability.qualityMetrics?.toolEfficiency ?? null,
    benchmark_task_id: observability.benchmark?.taskId ?? null,
    benchmark_pass: observability.benchmark?.pass ?? null,
  };
}

/** 合并 benchmark 到已有 metadata（eval harness / admin 写入） */
export function mergeBenchmarkIntoMetadata(
  existingMetadata: unknown,
  benchmark: NonNullable<TripRunObservabilityV1['benchmark']>,
): Record<string, any> {
  const meta = asRecord(existingMetadata);
  const prevObs = asRecord(meta.observability_v1);
  const normalized = {
    taskId: String(benchmark.taskId),
    pass: typeof benchmark.pass === 'boolean' ? benchmark.pass : null,
    score: typeof benchmark.score === 'number' ? benchmark.score : null,
    failedDimension: Array.isArray(benchmark.failedDimension)
      ? benchmark.failedDimension.map(String).slice(0, 20)
      : [],
  };
  const observability_v1 = {
    schemaId: TRIP_RUN_OBSERVABILITY_SCHEMA_ID,
    version: 1 as const,
    projectedAt: typeof prevObs.projectedAt === 'string' ? prevObs.projectedAt : new Date().toISOString(),
    decisionCompleteness:
      prevObs.decisionCompleteness ??
      computeDecisionCompleteness(prevObs.decisionTrace ?? null, prevObs.evidenceTrace ?? null),
    decisionTrace: prevObs.decisionTrace ?? null,
    evidenceTrace: prevObs.evidenceTrace ?? null,
    steps: Array.isArray(prevObs.steps) ? prevObs.steps : [],
    failure: prevObs.failure ?? null,
    memoryTrace: prevObs.memoryTrace ?? null,
    toolEvaluation: prevObs.toolEvaluation ?? null,
    feedback: prevObs.feedback ?? null,
    behavior: prevObs.behavior ?? null,
    outcome: prevObs.outcome ?? null,
    qualityMetrics: prevObs.qualityMetrics ?? null,
    benchmark: normalized,
  };
  return {
    ...meta,
    observability_v1,
    benchmark_v1: normalized,
    benchmark_task_id: normalized.taskId,
    benchmark_pass: normalized.pass,
    benchmark_updated_at: new Date().toISOString(),
  };
}

/** Admin：从 metadata / summaryJson 解析已有投影，或即时回填 */
export function resolveTripRunObservabilityFromStored(args: {
  metadata: Record<string, any>;
  summaryJson?: unknown;
  userQuery?: string | null;
  status?: string | null;
}): TripRunObservabilityV1 | null {
  const stored = args.metadata?.observability_v1;
  if (stored && typeof stored === 'object' && stored.schemaId === TRIP_RUN_OBSERVABILITY_SCHEMA_ID) {
    const s = stored as TripRunObservabilityV1;
    if (!s.decisionCompleteness) {
      return {
        ...s,
        decisionCompleteness: computeDecisionCompleteness(s.decisionTrace, s.evidenceTrace),
        outcome: s.outcome ?? null,
      };
    }
    return { ...s, outcome: s.outcome ?? null };
  }

  const fromSummary = buildTripRunObservabilityV1(args.summaryJson, {
    robustness: asRecord(args.metadata.orchestrator_robustness),
    userQuery: args.userQuery,
    status: args.status,
  });
  if (fromSummary) return fromSummary;

  return buildTripRunObservabilityV1(
    {
      observability: {
        ...args.metadata,
        agent_run_trace_v1: args.metadata.agent_run_trace_v1,
        agent_turn_trace: args.metadata.agent_turn_trace,
        execution_timeline_preview: args.metadata.execution_timeline_preview,
        memory_decision_trace: args.metadata.memory_decision_trace,
        mode_final: args.metadata.mode_final,
      },
      explain: args.metadata.explain,
      result: { status: args.status },
      userQuery: args.userQuery,
    },
    {
      robustness: asRecord(args.metadata.orchestrator_robustness),
      userQuery: args.userQuery,
      status: args.status,
    },
  );
}
