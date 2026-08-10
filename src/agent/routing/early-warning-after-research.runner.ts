/**
 * RESEARCH 后 Early Warning：影子冲突扫描 / 预测失败报告 / 高风险澄清拦截（从 ClaudeOrchestrator 迁出）。
 */

import type { EarlyWarningAfterResearchHost } from './early-warning-after-research.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { ResearchPrePlanSegmentInput } from '../orchestration/graph/nodes/base.node';
import type { GraphRunOutcome } from '../orchestration/graph/orchestration-graph.types';
import type { EarlyWarning } from '../services/shadow-conflict-scanner.service';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import { buildL3PersuasionLine, selectPersuasionMode } from '../utils/narrator-l3-persuasion.util';
import { formatPredictiveFailureReport } from '../utils/repair-causal-explainer.util';
import { calculateEarlyWarningRisk } from '../utils/early-warning-risk-model.util';
import { ConstraintScorer, type RelaxationActionId } from '../cbr/constraint-scorer.util';
import { SignatureBuilder } from '../cbr/signature-builder.util';
import {
  buildDecisionFeedbackCorrelationId,
  computePredictiveFailureStateHash,
  digestSimulatedRepairTracesForCorrelation,
  digestTripPlanRequestLight,
} from '../../decision/kernel/utils/decision-feedback-correlation.util';

export async function runShadowConflictEarlyWarningAfterResearch(
  host: EarlyWarningAfterResearchHost,
  decisionState: DecisionState | undefined,
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
): Promise<void> {
  if (!host.shadowConflictScanner) return;
  try {
    const ew = await host.shadowConflictScanner.scan({
      decisionKernel: host.decisionKernel,
      decisionState,
      state,
      request,
    });
    if (!ew) return;
    const early_warning_id =
      ew.early_warning_id ??
      host.djb2Fingerprint({
        request_id: state.request_id,
        risk_level: ew.risk_level,
        conflict_type: ew.conflict_type,
        evidence_summary: ew.evidence_summary,
        suggested_actions: (ew.suggested_actions ?? [])
          .map((s) => ({
            relaxation_type: s.relaxation_type,
            shadow_confidence: s.shadow_confidence,
            violations_before: s.violations_before,
            violations_after: s.violations_after,
            fixed_conflict_types: (s.fixed_conflict_types ?? []).slice().sort(),
          }))
          .sort((a, b) => a.relaxation_type.localeCompare(b.relaxation_type)),
      });
    const withId: EarlyWarning = { ...ew, early_warning_id };
    state.metadata = { ...(state.metadata ?? {}), early_warning: withId } as OrchestratorState['metadata'];
    state.decision_log.push({
      request_id: state.request_id,
      step: 'RESEARCH',
      actor: 'Orchestrator',
      inputs_summary: 'ShadowConflictScanner (post-RESEARCH)',
      outputs_summary: `EARLY_WARNING: id=${early_warning_id} risk=${ew.risk_level} type=${ew.conflict_type} suggestions=${ew.suggested_actions.length}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'EARLY_WARNING',
        early_warning: withId,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    host.logger.debug(`[Claude Orchestrator] Early warning scan skipped: ${msg}`);
  }
}

export function applyIntakePredictiveFailureReportAfterResearch(
  decisionState: DecisionState | undefined,
  state: OrchestratorState,
): void {
  const intakeSim = (state.metadata as Record<string, unknown>)?.intake_simulation as
    | { simulatedRepairTraces?: import('../services/route-feasibility.types').SimulatedRepairTrace[] }
    | undefined;
  const simTraces = intakeSim?.simulatedRepairTraces ?? [];
  if (simTraces.length === 0) return;
  const audit_text = formatPredictiveFailureReport(simTraces);
  const simDigest = digestSimulatedRepairTracesForCorrelation(simTraces as unknown[]);
  const tripDigest = digestTripPlanRequestLight(state.trip_plan_request ?? {});
  const predictiveStateHash = computePredictiveFailureStateHash({
    dsoVersion: decisionState?.systemState?.version ?? 0,
    simulatedTracesDigest: simDigest,
    tripDigest,
  });
  const predictiveCorrelationId = buildDecisionFeedbackCorrelationId({
    sessionId: state.request_id,
    phase: 'INTAKE',
    kind: 'PREDICTIVE_FAILURE',
    roundIndex: 0,
    stateHash: predictiveStateHash,
  });
  const predictive_failure_report = {
    card_type: 'PREDICTIVE_FAILURE_REPORT' as const,
    correlationId: predictiveCorrelationId,
    audit_text,
    simulated_repair_traces: simTraces,
  };
  const existingEw = (state.metadata as Record<string, unknown>)?.early_warning as EarlyWarning | undefined;
  const mergedEw: EarlyWarning = existingEw
    ? { ...existingEw, predictive_failure_report }
    : {
        early_warning_id: `pred-${state.request_id}`,
        risk_level: 'MEDIUM',
        conflict_type: 'MIXED',
        evidence_summary: 'INTAKE_PREDICTIVE_SIMULATION',
        suggested_actions: [],
        predictive_failure_report,
      };
  state.metadata = { ...(state.metadata ?? {}), early_warning: mergedEw } as OrchestratorState['metadata'];
  state.decision_log.push({
    request_id: state.request_id,
    step: 'RESEARCH',
    actor: 'Orchestrator',
    inputs_summary: 'IntakeCompilerService simulation → PREDICTIVE_FAILURE_REPORT',
    outputs_summary: `PREDICTIVE_FAILURE_REPORT: traces=${simTraces.length}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'PREDICTIVE_FAILURE_REPORT',
      correlation_id: predictiveCorrelationId,
      predictive_failure_report,
    },
  });
}

export async function runEarlyWarningClarificationInterceptAfterResearch(
  host: EarlyWarningAfterResearchHost,
  input: ResearchPrePlanSegmentInput,
  decisionState: DecisionState | undefined,
): Promise<GraphRunOutcome | null> {
  const { request, context, state, prePlan } = input;
  const ewMeta = (state.metadata as Record<string, unknown>)?.early_warning as EarlyWarning | undefined;
  if (!ewMeta || (ewMeta.risk_level !== 'HIGH' && ewMeta.risk_level !== 'CRITICAL')) {
    return null;
  }
  const clarAnswers = (request as RouteAndRunRequestDto & { clarification_answers?: Array<{ questionId?: string }> })
    .clarification_answers;
  const answeredEarlyWarning = clarAnswers?.some((a) => a?.questionId === 'early_warning_relaxations');
  const earlyWarningAcknowledged =
    (state.metadata as Record<string, unknown>)?.early_warning_acknowledged === true ||
    decisionState?.systemState?.earlyWarningAcknowledged === true;
  if (answeredEarlyWarning || earlyWarningAcknowledged) {
    return null;
  }
  const ab = (() => {
    const fp = host.djb2Fingerprint({ request_id: state.request_id, exp: 'ew_l3_prompt_v1' });
    const hex = fp.includes(':') ? fp.split(':')[1] : fp;
    const n = parseInt(hex.slice(-8), 16);
    const bucket = Number.isFinite(n) ? n % 100 : 0;
    return { fingerprint: fp, bucket, treatment: bucket < 50 };
  })();
  const supported = new Set(['upgrade_vehicle_to_4wd', 'increase_days_by_1', 'drop_one_must_include_poi']);
  const dedup = new Map<string, (typeof ewMeta.suggested_actions)[number]>();
  for (const s of ewMeta.suggested_actions ?? []) {
    if (s?.relaxation_type && supported.has(s.relaxation_type) && !dedup.has(s.relaxation_type)) {
      dedup.set(s.relaxation_type, s);
    }
  }
  const list = [...dedup.values()];
  if (list.length === 0) return null;
  const anyHigh = list.some((s) => s.shadow_confidence === 'high_probability_fixed');
  host.logger.warn(
    `[Claude Orchestrator] EARLY_WARNING intercept: risk=${ewMeta.risk_level} type=${ewMeta.conflict_type} options=${list.length}`,
  );
  const risk = calculateEarlyWarningRisk(
    {
      risk_level: ewMeta.risk_level,
      conflict_type: ewMeta.conflict_type,
      suggested_actions: list,
    },
    { request_id: state.request_id },
  );
  const failure_risk_score = risk.score;
  const failure_prob_hint = (() => {
    if (!ab.treatment) return undefined;
    if (failure_risk_score >= 0.8) {
      return `【高危逻辑拦截】若保持现状继续，预计撞墙风险很高（score=${failure_risk_score.toFixed(2)}）。建议立即选择一项修复以恢复物理可行域。`;
    }
    if (failure_risk_score >= 0.4) {
      return `【运行风险提示】该配置存在较高后续回溯成本（score=${failure_risk_score.toFixed(2)}）。建议优先修复，避免反复试错。`;
    }
    return `【提示】已检测到潜在风险（score=${failure_risk_score.toFixed(2)}），建议先修复再继续。`;
  })();
  const l3Line = (() => {
    if (!ab.treatment) return undefined;
    const cid =
      ewMeta.conflict_type === 'REACHABILITY'
        ? CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY
        : ewMeta.conflict_type === 'SCOPE'
          ? CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY
          : CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY;
    const mode = selectPersuasionMode(cid);
    const out = buildL3PersuasionLine({
      mode,
      proof: {
        cid,
        unit: 'bool',
        slack: -1,
        evidence: ewMeta.evidence_summary
          ? { source: 'SHADOW_GATE', refIds: [String(ewMeta.early_warning_id ?? 'early_warning')] }
          : { source: 'SHADOW_GATE' },
      },
    });
    return out?.line;
  })();
  const questionHeader = ab.treatment
    ? `[SYSTEM_ACTION]: EARLY_WARNING(L3) 风险=${ewMeta.risk_level}（${ewMeta.conflict_type}）。`
    : `[SYSTEM_ACTION]: EARLY_WARNING 风险=${ewMeta.risk_level}（${ewMeta.conflict_type}）。`;
  const questionBody = `${ewMeta.evidence_summary} 请在 POI 选择与排程前确认一项或多项“物理可行域”放宽（影子推演置信度已标注）。`;
  const question = `${questionHeader}${failure_prob_hint ? `\n${failure_prob_hint}\n` : ''}${l3Line ? `\n${l3Line}\n` : ''}${questionBody}`;
  const topPrecedent = Array.isArray((ewMeta as any).historical_precedents)
    ? ((ewMeta as any).historical_precedents[0] as any)
    : undefined;
  const oscillation_k = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
  const dominant_cid =
    String((decisionState as DecisionState & { constraints?: { violations?: Array<{ type?: string }> } })?.constraints?.violations?.[0]?.type ?? '').trim() ||
    (ewMeta.conflict_type === 'REACHABILITY' ? 'REACHABILITY_HARD' : ewMeta.conflict_type === 'SCOPE' ? 'SCOPE' : 'MIXED');
  const is_hard = ewMeta.conflict_type === 'REACHABILITY' || ewMeta.risk_level === 'CRITICAL';
  const scored = list
    .map((s) => {
      const id = s.relaxation_type as RelaxationActionId;
      const persuasion = host.localCaseStore?.getPersuasionRate({
        signature: SignatureBuilder.buildConversionSignature({
          conflict_type: ewMeta.conflict_type,
          primary_violation_type: dominant_cid,
          region_id: (state.trip_plan_request as any)?.region_id,
          start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
        }),
        action: id,
      });
      const breakdown = ConstraintScorer.calculateScore(id, {
        dominant_cid,
        is_hard,
        oscillation_k,
        precedent: topPrecedent,
        preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
        persuasion,
        delta: 1.5,
      });
      return { s, breakdown };
    })
    .sort((a, b) => b.breakdown.score - a.breakdown.score);
  state.clarification_questions = [
    {
      id: 'early_warning_relaxations',
      question,
      type: anyHigh ? 'single_choice' : 'multi_choice',
      required: true,
      options: [
        ...scored.map(({ s, breakdown }) => ({
          value: s.relaxation_type,
          label: `${s.relaxation_type}｜${s.impact_description}（${
            s.shadow_confidence === 'high_probability_fixed' ? 'high_probability_fixed' : 'needs_more_changes'
          }）`,
          metadata: {
            score: breakdown.score,
            weights: breakdown.weights,
            dominant_cid: breakdown.dominant_cid,
            precedent_n: breakdown.precedent_n,
            terms: breakdown.terms,
          },
        })),
        {
          value: 'proceed_at_own_risk',
          label: '[实验性] 保持现状继续规划（可能导致失败）',
          metadata: {
            score: ConstraintScorer.calculateScore('proceed_at_own_risk', {
              dominant_cid,
              is_hard,
              oscillation_k,
              precedent: topPrecedent,
              preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
            }).score,
            dominant_cid,
            precedent_n: typeof topPrecedent?.sample_count === 'number' ? topPrecedent.sample_count : 0,
          },
        },
      ] as any,
      hint: '提交后下一回合将合并写入 TripPlanRequest；再次规划时可行域已被物理修复。也可选择「自担风险继续」跳过拦截（撞南墙模式，仍可能进入 PLAN_GEN 熔断）。',
    },
  ];
  state.decision_log.push({
    request_id: state.request_id,
    step: 'RESEARCH',
    actor: 'Orchestrator',
    inputs_summary: 'EARLY_WARNING intercept → clarification',
    outputs_summary: `PREVENTIVE_RELAXATION_REQUIRED: risk=${ewMeta.risk_level}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'EARLY_WARNING_INTERCEPT',
      early_warning: ewMeta,
      options_snapshot: (state.clarification_questions?.[0] as { options?: unknown })?.options ?? [],
      ew_prompt_ab: ab,
      failure_risk_score,
      failure_risk_reason: risk.reason,
      failure_risk_confidence: risk.confidence,
      ...(l3Line ? { ew_l3_line: l3Line } : {}),
      ...(failure_prob_hint ? { failure_prob_hint } : {}),
    },
  });
  state.metadata = {
    ...(state.metadata ?? {}),
    last_updated_at: new Date().toISOString(),
    total_duration_ms: Date.now() - prePlan.startTime,
  } as OrchestratorState['metadata'];
  host.maybeSnapshot(state, 'CHECKPOINT');
  return prePlan.prePlanTerminal(
    'terminal_clarification',
    host.buildClarificationResult(state, prePlan.startTime, decisionState, context),
  );
}
