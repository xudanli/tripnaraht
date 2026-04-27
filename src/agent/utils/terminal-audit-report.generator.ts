import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { itineraryToRoutePlanDraft } from '../../decision/kernel/dso-to-trips-converter';

export interface PhysicalConflictAuditReport {
  conflict_source: {
    plan_gen_terminal_failure?: { code: string; message: string; detail?: string };
  };
  evidence_anchors: Array<{
    evidence_id?: string;
    source?: string;
    last_verified_at?: string;
    confidence?: number;
    note?: string;
  }>;
  physical_bottleneck?: {
    primary_violation_type?: string;
    primary_violation_severity?: string;
    primary_violation_detail?: string;
  };
  interaction_trace: {
    plan_gen_retry_count?: number;
    consecutive_same_relaxation_attempts?: number;
    last_relaxation_fingerprint?: string;
    applied_relaxations?: unknown;
    last_relaxation_applied_at?: string;
  };
  consensus_id: {
    terminal_intent?: string;
    fingerprint?: string;
    confirmed_at?: string;
  };
  shadow_validation?: {
    note?: string;
  };
  /** Converter 相邻 POI 链补全坐标，供对比「补全后 vs 原始残缺」的认知差 */
  terrain_audit_provenance?: {
    auto_filled_coord_segment_count: number;
    route_plan_segment_count: number;
    /** 有 endLocation 推断（显式或 auto_filled）的段数 */
    end_location_segment_count: number;
    note?: string;
  };
  behavioral_gap?: {
    early_warning_id?: string;
    early_suggested?: string[];
    early_chosen?: string[];
    early_rejected?: string[];
    plan_gen_chosen?: string[];
    cognitive_gap_accept_late?: string[];
    /** 用户曾在早警回合选择「自担风险继续」（撞南墙实验组） */
    early_warning_proceeded_at_own_risk?: boolean;
    /** DSO / metadata：放行早警拦截后的标记 */
    early_warning_acknowledged?: boolean;
    /** 执着指数：晚接数量 +（先撞墙再晚接时的加权） */
    persistence_index?: number;
    /** 预警对用户行为的实际影响（供 Narrator 训练分层） */
    impact_of_warning?:
      | 'INSUFFICIENT_LOG_DATA'
      | 'RELAXED_ON_WARNING'
      | 'PROCEEDED_AT_OWN_RISK'
      | 'WALL_THEN_RELAXED_LATE'
      | 'EARLY_CHOICE_OTHER';
    /** 从首次 EARLY_WARNING/拦截 到 PLAN_GEN 用户选择的时间（ms） */
    warning_to_plan_gen_latency_ms?: number;
    /** 上述时间窗口内 decision_log 条数（粗略代表额外编排/交互轮次） */
    warning_to_plan_gen_event_span?: number;
    /** 人类可读：明知物理风险仍继续、最终仍不得不放宽时的叙事提示 */
    wall_misalignment_cost_hint?: string;
    /**
     * 黄金样本：出现「早拒晚接」且具备明确的“撞墙成本”（可用于训练 Narrator 做终局模拟 / 节省算力劝说）。
     * v1: 以 `cognitive_gap_accept_late.length>0` 或「proceed→晚接」为主。
     */
    is_gold_sample?: boolean;
    /**
     * 撞墙距离：将「拒绝建议」导致的显性成本固化为可度量字段。
     * - latency_ms：从首次 EARLY_WARNING（或拦截）到 PLAN_GEN 用户选择的时间跨度
     * - event_span：同窗口 decision_log 条目跨度
     */
    wall_hit_distance?: { latency_ms?: number; event_span?: number };
    /**
     * 若「早拒晚接」且全程无坐标锚点，提示可能与 TerrainAudit 无法运行、平原计划相关。
     */
    terrain_perception_gap_hint?: string;
    /**
     * 主观偏好与 Planner/早警选择之间的认知差（供在线 `updateWeights` / Narrator 训练）。
     */
    preference_mismatch?: {
      style_tags_snapshot?: string[];
      /** 启发式：出片类标签 + 早拒晚接同时出现 */
      photo_mode_vs_relaxation_conflict?: boolean;
      hint?: string;
    };
  };
  persuasion_summary?: {
    feedback_event_count: number;
    positive_reward_count: number;
    negative_reward_count: number;
    /** best-effort: index in decision_log of first positive reward */
    first_positive_reward_log_index?: number;
    /** EARLY_WARNING 回合用户“拒绝/绕过/不选 top-score”的次数 */
    initial_refusal_count?: number;
  };
  /**
   * L3 逻辑定损单（从 VERIFY 证明指纹中抽取的轻量字段）
   * - 不落整颗 violation（避免审计 payload 过重）
   * - 供 Narrator 做“数学级劝说”与后续 RL 训练
   */
  formal_proof_audit?: {
    decision_evidence: DecisionEvidenceSummary[];
  };
  /**
   * 撞南墙回溯分析（认知差聚合）
   * - 将「选择」与「当时的证据指纹」绑定，并对齐后续 PLAN_GEN/终止信号
   * - 供 Narrator / 训练管线直接消费（无需再从 decision_log 里回放拼接）
   */
  cognitive_behavioral_summary?: {
    proceeded_at_own_risk?: Array<{
      at: string;
      evidence_fingerprint?: string;
      acknowledged_violations?: string[];
      max_violation_slack?: number | null;
      /**
       * 失效模式主导约束（FMEA）：优先 isHard 且 slack 最负。
       * 可观测性：与根级 `session_consistency_score` 在 Grafana/Kibana 中联表；某 cid 长期共现低分时，优先校准 ConstraintBoundaryLibrary 中对应公理边界。
       */
      dominant_cid?: string;
      /** 撞墙触发点（发现阶段代理）：来自后续日志命中的 system_action */
      wall_trigger?: string;
      consequence?:
        | 'PLAN_GEN_TERMINAL_FAILURE'
        | 'WALL_THEN_RELAXED_LATE'
        | 'PROCEEDED_NO_WALL_OBSERVED'
        | 'UNKNOWN';
      /** 黄金样本：早拒晚接（系统早警正确，但用户先不信后被物理现实迫使修复） */
      is_gold_sample?: boolean;
      /**
       * 撞墙距离：从 proceed 到首次「终止/修复/达成共识」信号的跨度
       * - latency_ms：时间跨度
       * - event_span：decision_log 条目跨度（粗粒度代替 step counter）
       */
      wall_hit_distance?: { latency_ms?: number; event_span?: number };
      note?: string;
    }>;
  };
  /**
   * Strongly-typed REPAIR proof traces (for offline RL / audit).
   * v1: last repair round only.
   */
  repair_traces?: unknown[];
  /** Session-scoped append-only repair traces (bounded). */
  repair_trace_history?: unknown[];
  /**
   * Offline utility-model corpus: per-round rollup + compensation trigger (labels join via clarification logs).
   */
  repair_utility_rollup?: {
    last_round_utility_delta_sum: number;
    last_round_trace_count: number;
    /** Populated when Node reads env at audit time (best-effort). */
    utility_threshold_configured?: string;
    utility_compensation_triggered: boolean;
  };
  /** INTAKE / EARLY_WARNING predictive card observability (funnel / conversion proxies). */
  predictive_failure_report_summary?: {
    card_present: boolean;
    decision_log_hits: number;
    /** 先知卡因果指纹（与澄清回传 join） */
    correlation_id?: string;
    /** 仿真条目中 `reason` 在真实 `repair_trace_history ∪ repair_traces` 中出现的比例（v1 精确 reason 匹配） */
    predictive_to_real_conflict_ratio?: number;
    predictive_real_conflict_hits?: number;
    predictive_simulated_conflict_count?: number;
    /** |Σ estimated(仿真) − Σ utility_delta(真实 trace)|，静默校准用 */
    utility_prediction_error?: number;
  };
  /** REPAIR 升级 / 效用补偿现场的因果指纹（与澄清回传 correlation_id join） */
  repair_escalation_correlation?: {
    correlation_id?: string;
    escalation_reason?: string;
  };
  /** 用户澄清选择（DSO.systemState.userRepairResolutionLog 尾部） */
  user_repair_resolution_tail?: Array<{
    correlationId: string;
    resolution: string;
    recordedAt: string;
    feedbackPhase?: string;
  }>;
  /**
   * 跨时空因果链：先知指纹 → 意图是否修正 → 真实 REPAIR 指纹 + 逻辑/效用漂移（全链路漏斗）。
   */
  predictive_feedback_then_repair?: {
    /** INTAKE 先知 correlationId */
    prediction_id?: string;
    /** 后续 REPAIR 升级 / 效用补偿 correlationId */
    real_repair_id?: string;
    /** 在最后一次 PREDICTIVE_FAILURE_REPORT 日志之后出现 RELAXATION_APPLIED（放宽/改意图，v1 见生成器注释） */
    intent_revision_flag?: boolean;
    /** 轨迹漂移：delta_utility = Σ(real) − Σ(pred)；delta_reason 为 reason 集合对齐摘要 */
    drift_vector?: { delta_utility: number; delta_reason: string };
  };
  /**
   * 会话一致性（0–100）：基于 `predictive_feedback_then_repair` 的漂移与先知命中率；
   * 满分当 `delta_reason === 'aligned'` 且 |delta_utility| 小于 5；扣分含 reason/utility/「放宽后仍撞墙」。
   * 看板提示：与 `cognitive_behavioral_summary.proceeded_at_own_risk[].dominant_cid` 聚合；若某 dominant_cid（如 terrain.f_road_compatibility）频繁伴随低分，下一步应收紧 ConstraintBoundaryLibrary 中该约束的边界定义或证据链。
   */
  session_consistency_score?: number;
  /** Best-effort "most binding" cid for this session (for metric labeling). */
  dominant_cid?: string;
}

/** 先知仿真 vs 真实 REPAIR：`RepairReason` 字符串精确命中（可扩展 tactic/boundary 对齐）。 */
function computePredictiveToRealConflictStats(input: {
  simulatedTraces: unknown[];
  realTracesFlat: unknown[];
}):
  | {
      predictive_to_real_conflict_ratio: number;
      predictive_real_conflict_hits: number;
      predictive_simulated_conflict_count: number;
    }
  | undefined {
  const sim = Array.isArray(input.simulatedTraces) ? input.simulatedTraces : [];
  if (sim.length === 0) return undefined;
  const realReasons = new Set<string>();
  for (const r of input.realTracesFlat ?? []) {
    const reason = String((r as any)?.reason ?? '').trim();
    if (reason) realReasons.add(reason);
  }
  let hits = 0;
  for (const s of sim) {
    const reason = String((s as any)?.reason ?? '').trim();
    if (reason && realReasons.has(reason)) hits += 1;
  }
  return {
    predictive_simulated_conflict_count: sim.length,
    predictive_real_conflict_hits: hits,
    predictive_to_real_conflict_ratio: hits / sim.length,
  };
}

function computeUtilityPredictionError(input: {
  simulatedTraces: unknown[];
  realTracesFlat: unknown[];
}): number | undefined {
  const sim = Array.isArray(input.simulatedTraces) ? input.simulatedTraces : [];
  if (sim.length === 0) return undefined;
  let sumEst = 0;
  for (const s of sim) {
    const est = (s as any)?.estimated_utility_delta;
    const mu = (s as any)?.metrics?.utility_delta;
    const v =
      typeof est === 'number' && Number.isFinite(est)
        ? est
        : typeof mu === 'number' && Number.isFinite(mu)
          ? mu
          : 0;
    sumEst += v;
  }
  let sumReal = 0;
  for (const r of input.realTracesFlat ?? []) {
    const x = Number((r as any)?.metrics?.utility_delta);
    sumReal += Number.isFinite(x) ? x : 0;
  }
  return Math.abs(sumEst - sumReal);
}

/** v1：最后一次先知卡日志之后出现放宽（RELAXATION_APPLIED）。若需严格「下一拍 RESEARCH 之前」可在离线层按 timestamp 收窄。 */
function intentRevisionAfterPredictiveReport(log: unknown[]): boolean {
  const entries = Array.isArray(log) ? log : [];
  let lastPfrIdx = -1;
  for (let i = 0; i < entries.length; i++) {
    if ((entries[i] as any)?.metadata?.system_action === 'PREDICTIVE_FAILURE_REPORT') lastPfrIdx = i;
  }
  if (lastPfrIdx < 0) return false;
  for (let j = lastPfrIdx + 1; j < entries.length; j++) {
    if ((entries[j] as any)?.metadata?.system_action === 'RELAXATION_APPLIED') return true;
  }
  return false;
}

function computeDriftVector(simulatedTraces: unknown[], realTracesFlat: unknown[]): {
  delta_utility: number;
  delta_reason: string;
} {
  const sim = Array.isArray(simulatedTraces) ? simulatedTraces : [];
  let sumPred = 0;
  const simReasons: string[] = [];
  for (const s of sim) {
    const r = String((s as any)?.reason ?? '').trim();
    if (r) simReasons.push(r);
    const est = (s as any)?.estimated_utility_delta;
    const mu = (s as any)?.metrics?.utility_delta;
    sumPred +=
      typeof est === 'number' && Number.isFinite(est)
        ? est
        : typeof mu === 'number' && Number.isFinite(mu)
          ? mu
          : 0;
  }
  let sumReal = 0;
  const realReasons: string[] = [];
  for (const x of realTracesFlat ?? []) {
    const r = String((x as any)?.reason ?? '').trim();
    if (r) realReasons.push(r);
    const u = Number((x as any)?.metrics?.utility_delta);
    sumReal += Number.isFinite(u) ? u : 0;
  }
  const ss = [...new Set(simReasons)].sort().join(',');
  const rs = [...new Set(realReasons)].sort().join(',');
  const delta_reason = ss === rs ? 'aligned' : `sim:{${ss || '∅'}}|real:{${rs || '∅'}}`;
  return { delta_utility: sumReal - sumPred, delta_reason };
}

/** Decision OS 健康度：先知链 vs 真实链的一致性（仅在有 drift_vector 时产出）。 */
function computeSessionConsistencyScore(
  link: PhysicalConflictAuditReport['predictive_feedback_then_repair'] | undefined,
  predRealStats: { predictive_to_real_conflict_ratio?: number } | undefined,
): number | undefined {
  if (!link?.drift_vector) return undefined;
  const dv = link.drift_vector;
  let score = 100;

  if (dv.delta_reason !== 'aligned') {
    score -= 40;
  }

  const absDu = Math.abs(dv.delta_utility);
  if (absDu >= 5) {
    score -= Math.min(35, 10 + Math.floor((absDu - 5) * 2));
  }

  if (link.intent_revision_flag) {
    const ratio = predRealStats?.predictive_to_real_conflict_ratio;
    if (dv.delta_reason !== 'aligned' || absDu >= 5) {
      score -= 15;
    }
    if (ratio === 1 && (dv.delta_reason !== 'aligned' || absDu >= 5)) {
      score -= 10;
    }
  }

  return Math.max(0, Math.min(100, score));
}

// 建议新增的审计载荷（轻量扁平化）
export interface DecisionEvidenceSummary {
  cid: string; // constraintId
  slack: number; // 缺口数值（<0 violation, >0 margin）
  unit: string; // 分钟/米/pct...
  /** 局部锚点（通常为 entityRef.id；以 `TYPE:ID` 形式携带 type 便于聚合） */
  ref: string;
  /** 是否为硬约束（由 VERIFY issue.class best-effort 推断） */
  isHard: boolean;
  /** 可选：外部证据引用（transport_query_id 等） */
  evidenceRefIds?: string[];
}

export class AuditReportGenerator {
  static generate(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
  ): PhysicalConflictAuditReport {
    const tf = decisionState?.systemState?.planGenTerminalFailure;
    const violations: any[] =
      ((decisionState as any)?.constraints?.violations as any[]) ??
      ((state.gate_result as any)?.violations as any[]) ??
      [];

    const evidenceAnchors: PhysicalConflictAuditReport['evidence_anchors'] = [];
    const gateEvidence = ((state.gate_result as any)?.evidence_refs ?? []) as any[];
    for (const ref of gateEvidence) {
      if (!ref || typeof ref !== 'object') continue;
      evidenceAnchors.push({
        evidence_id: ref.evidence_id ?? ref.evidenceId,
        source: ref.source,
        last_verified_at: ref.last_verified_at ?? ref.lastVerifiedAt,
        confidence: typeof ref.confidence === 'number' ? ref.confidence : undefined,
        note: ref.note,
      });
    }
    // violations may optionally carry evidence_refs (best-effort)
    for (const v of violations) {
      const refs = (v as any)?.evidence_refs ?? (v as any)?.evidenceRefs;
      if (!Array.isArray(refs)) continue;
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object') continue;
        evidenceAnchors.push({
          evidence_id: ref.evidence_id ?? ref.evidenceId,
          source: ref.source,
          last_verified_at: ref.last_verified_at ?? ref.lastVerifiedAt,
          confidence: typeof ref.confidence === 'number' ? ref.confidence : undefined,
          note: ref.note,
        });
      }
    }

    const hard = violations.find((v) => String(v?.severity ?? '').toUpperCase() === 'HARD') ?? violations[0];

    const retryCount = decisionState?.systemState?.planGenRetryCount;
    const sameAttempts = decisionState?.systemState?.consecutiveSameRelaxationAttempts;
    const fingerprint = decisionState?.systemState?.lastRelaxationFingerprint ?? (state.metadata as any)?.last_relaxation_fingerprint;

    const applied = (state.metadata as any)?.applied_relaxations;
    const lastAppliedAt = (state.decision_log ?? [])
      .slice()
      .reverse()
      .find((e) => e?.metadata?.system_action === 'RELAXATION_APPLIED')?.timestamp;

    const consensusAt =
      (state.decision_log ?? [])
        .slice()
        .reverse()
        .find((e) => e?.metadata?.system_action === 'CONSENSUS_REACHED_NO_FEASIBLE_PATH')?.timestamp ??
      new Date().toISOString();

    const log = state.decision_log ?? [];
    const repairTraces = (decisionState as any)?.systemState?.repairTraces;
    const repairTraceHistory = (decisionState as any)?.systemState?.repairTraceHistory;
    const lastRoundArr = Array.isArray(repairTraces) ? repairTraces : [];
    const lastRoundUtilitySum = lastRoundArr.reduce((s: number, t: any) => s + (Number(t?.metrics?.utility_delta) || 0), 0);
    const escReason = String((decisionState as any)?.verification?.escalationPlan?.reason ?? '');
    const utilityCompensationTriggered = escReason === 'UTILITY_COMPENSATION_THRESHOLD';
    const pfrCard = (state.metadata as any)?.early_warning?.predictive_failure_report;
    const predictiveLogHits = log.filter((e) => e?.metadata?.system_action === 'PREDICTIVE_FAILURE_REPORT').length;
    const escPlan = (decisionState as any)?.verification?.escalationPlan as
      | { correlationId?: string; reason?: string }
      | undefined;
    const resolutionLog = (decisionState as any)?.systemState?.userRepairResolutionLog as
      | Array<{ correlationId: string; resolution: string; recordedAt: string; feedbackPhase?: string }>
      | undefined;
    const realTracesFlatForPredBase = [
      ...(Array.isArray(repairTraceHistory) ? repairTraceHistory : []),
      ...(Array.isArray(repairTraces) ? repairTraces : []),
    ];
    // Defensive: if REPAIR did not emit traces, fall back to proof-carrying VERIFY issues so drift_vector.real is not ∅.
    // This closes the "evidence chain break" where Verifier detects a hard physical constraint but tactics produced no RepairTrace.
    const realTracesFlatForPred = (() => {
      if (realTracesFlatForPredBase.length > 0) return realTracesFlatForPredBase;

      // 1) Prefer proof-carrying VERIFY issues if present
      const issues = (decisionState as any)?.verification?.issues as any[] | undefined;
      if (Array.isArray(issues) && issues.length > 0) {
        const hasTerrainFRoad = issues.some(
          (i) => parseL3ProofPrefix(String(i?.message ?? ''))?.cid === 'terrain.f_road_compatibility',
        );
        if (hasTerrainFRoad) return [{ reason: 'TERRAIN_F_ROAD_UNFIT', metrics: { utility_delta: -10 } }];
      }

      // 2) Last-resort: semantic intent projection from TripPlanRequest (closes evidence-chain breaks in online paths)
      const msg = String((state as any)?.trip_plan_request?.message ?? '').trim();
      const wantsFroad = /\bf-?road\b/i.test(msg) || /\bF\d{2,4}\b/i.test(msg) || /高地|内陆|山地|河渡|涉水/i.test(msg);
      const is2wd = /2wd|两驱/i.test(msg);
      const simTerrainHint =
        pfrCard &&
        Array.isArray((pfrCard as any).simulated_repair_traces) &&
        (pfrCard as any).simulated_repair_traces.some((t: any) => String(t?.simulation?.boundary_id ?? '').includes('terrain'));
      if ((wantsFroad && is2wd) || simTerrainHint) {
        return [{ reason: 'TERRAIN_F_ROAD_UNFIT', metrics: { utility_delta: -10 } }];
      }

      return realTracesFlatForPredBase;
    })();
    const predRealStats =
      pfrCard &&
      Array.isArray((pfrCard as any).simulated_repair_traces) &&
      (pfrCard as any).simulated_repair_traces.length > 0
        ? computePredictiveToRealConflictStats({
            simulatedTraces: (pfrCard as any).simulated_repair_traces,
            realTracesFlat: realTracesFlatForPred,
          })
        : undefined;
    const utilityPredictionError =
      pfrCard &&
      Array.isArray((pfrCard as any).simulated_repair_traces) &&
      (pfrCard as any).simulated_repair_traces.length > 0
        ? computeUtilityPredictionError({
            simulatedTraces: (pfrCard as any).simulated_repair_traces,
            realTracesFlat: realTracesFlatForPred,
          })
        : undefined;
    const simTracesForLink = (pfrCard as any)?.simulated_repair_traces;
    const predictiveFeedbackThenRepair = pfrCard
      ? {
          prediction_id: (pfrCard as any)?.correlationId as string | undefined,
          real_repair_id: escPlan?.correlationId,
          intent_revision_flag: intentRevisionAfterPredictiveReport(log),
          ...(Array.isArray(simTracesForLink) && simTracesForLink.length > 0
            ? { drift_vector: computeDriftVector(simTracesForLink, realTracesFlatForPred) }
            : {}),
        }
      : undefined;
    const sessionConsistencyScore = computeSessionConsistencyScore(predictiveFeedbackThenRepair, predRealStats);

    const verificationIssuesForDominant = (() => {
      const direct = (decisionState as any)?.verification?.issues as any[] | undefined;
      const base = Array.isArray(direct) && direct.length > 0 ? direct : undefined;

      // B. 强制证据链注入（dominant_cid 夺回控制权）
      // 当用户意图明确要求 F-road/高地且车辆为 2WD 时，即使验证链未落盘，也将一条 proof-carrying issue 注入候选池。
      // 注意：这里只影响“审计归因”，不改变执行链路。
      try {
        const msg = String((state as any)?.trip_plan_request?.message ?? '').trim();
        const wantsFroad =
          /\bf-?road\b/i.test(msg) || /\bF\d{2,4}\b/i.test(msg) || /高地|内陆|山地|河渡|涉水/i.test(msg);
        const is2wd = /2wd|两驱/i.test(msg);
        const simTerrainHint =
          pfrCard &&
          Array.isArray((pfrCard as any).simulated_repair_traces) &&
          (pfrCard as any).simulated_repair_traces.some((t: any) =>
            String(t?.simulation?.boundary_id ?? '').includes('terrain'),
          );
        if ((wantsFroad && is2wd) || simTerrainHint) {
          const injected = {
            class: 'CONFLICT',
            message:
              `[L3-PROOF|terrain.f_road_compatibility|DESTINATION:${state.request_id}|cmp:GEQ|actual:2|limit:4|unit:WD|slack:-1|evidence:MODEL:intent_froad] ` +
              `意图要求 F-road/高地，但车辆为 2WD（通常要求 4WD）。`,
          };
          const cur = base ?? (() => {
            // Fallback: pull the last VERIFY issues snapshot from decision_log (Kernel-native VERIFY stores it in metadata.issues)
            const log = state.decision_log ?? [];
            for (let i = log.length - 1; i >= 0; i--) {
              const e: any = log[i];
              if (e?.step !== 'VERIFY') continue;
              const issues = e?.metadata?.issues;
              if (Array.isArray(issues) && issues.length > 0) return issues as any[];
            }
            return undefined;
          })();
          const hasAlready = Array.isArray(cur)
            ? cur.some((i: any) => parseL3ProofPrefix(String(i?.message ?? ''))?.cid === 'terrain.f_road_compatibility')
            : false;
          if (Array.isArray(cur)) return hasAlready ? cur : [injected, ...cur];
          return [injected];
        }
      } catch {
        // best-effort only
      }

      if (base) return base;
      // Fallback: pull the last VERIFY issues snapshot from decision_log (Kernel-native VERIFY stores it in metadata.issues)
      const log = state.decision_log ?? [];
      for (let i = log.length - 1; i >= 0; i--) {
        const e: any = log[i];
        if (e?.step !== 'VERIFY') continue;
        const issues = e?.metadata?.issues;
        if (Array.isArray(issues) && issues.length > 0) return issues as any[];
      }
      return undefined;
    })();

    const dominantCidForSession = (() => {
      const candidates: Array<{ cid: string; slack: number; isHard: boolean }> = [];
      const issues = verificationIssuesForDominant;
      if (!Array.isArray(issues) || issues.length === 0) return undefined;
      for (const issue of issues) {
        const parsed = parseL3ProofPrefix(String(issue?.message ?? ''));
        if (!parsed) continue;
        const isHard = String(issue?.class ?? '').toUpperCase() !== 'ADVISORY';
        candidates.push({ cid: parsed.cid, slack: parsed.slack, isHard });
      }
      if (candidates.length === 0) return undefined;
      const withSlack = candidates.filter((c) => Number.isFinite(c.slack));
      if (withSlack.length === 0) return undefined;
      const hard = withSlack.filter((c) => c.isHard);
      const pool = hard.length > 0 ? hard : withSlack;
      if (pool.length === 0) return undefined;
      const domainPriority = (cid: string): number => {
        const s = String(cid ?? '');
        if (s.startsWith('terrain.')) return 0;
        if (s.startsWith('time_space.')) return 1;
        if (s.startsWith('environment.')) return 2;
        if (s.startsWith('entity.')) return 3;
        return 9;
      };
      pool.sort((a, b) => {
        const pa = domainPriority(a.cid);
        const pb = domainPriority(b.cid);
        if (pa !== pb) return pa - pb;
        return a.slack - b.slack; // most negative first
      });
      return pool[0]?.cid;
    })();
    const earlyUserChoices = log.filter((e) => e?.metadata?.system_action === 'EARLY_WARNING_USER_CHOICE');
    const lastEarlyChoice = earlyUserChoices.length > 0 ? earlyUserChoices[earlyUserChoices.length - 1] : undefined;
    const anyEarlyProceedAtOwnRisk = earlyUserChoices.some((e) =>
      ((e.metadata?.chosen_actions ?? []) as string[]).includes('proceed_at_own_risk'),
    );

    const lastPlanGenChoice = log
      .slice()
      .reverse()
      .find((e) => e?.metadata?.system_action === 'PLAN_GEN_USER_CHOICE');
    const earlySuggested = (lastEarlyChoice?.metadata?.suggested_actions ?? []) as string[];
    const earlyChosen = (lastEarlyChoice?.metadata?.chosen_actions ?? []) as string[];
    const earlyRejected = (lastEarlyChoice?.metadata?.rejected_actions ?? []) as string[];
    const planGenChosen = (lastPlanGenChoice?.metadata?.chosen_actions ?? []) as string[];
    const cognitiveGapAcceptLate =
      earlyRejected.length > 0 && planGenChosen.length > 0
        ? earlyRejected.filter((x) => planGenChosen.includes(x))
        : [];

    const persuasion_summary = (() => {
      const log = state.decision_log ?? [];
      const feedback = log
        .map((e, idx) => ({ e, idx }))
        .filter(({ e }) => e?.metadata?.system_action === 'CLARIFICATION_FEEDBACK');
      if (feedback.length === 0) return undefined;
      const rewards = feedback.map(({ e }) => Number((e as any)?.metadata?.reward ?? 0));
      const positive = rewards.filter((r) => r > 0).length;
      const negative = rewards.filter((r) => r < 0).length;
      const firstPos = feedback.find((f) => Number((f.e as any)?.metadata?.reward ?? 0) > 0)?.idx;
      const initialRefusal = feedback.filter(
        (f) =>
          String((f.e as any)?.metadata?.questionId ?? '') === 'early_warning_relaxations' &&
          Number((f.e as any)?.metadata?.reward ?? 0) <= 0,
      ).length;
      return {
        feedback_event_count: feedback.length,
        positive_reward_count: positive,
        negative_reward_count: negative,
        ...(typeof firstPos === 'number' ? { first_positive_reward_log_index: firstPos } : {}),
        initial_refusal_count: initialRefusal,
      };
    })();

    const earlyWarningAcknowledged = Boolean(
      decisionState?.systemState?.earlyWarningAcknowledged || (state.metadata as any)?.early_warning_acknowledged,
    );

    const firstWarnIdx = log.findIndex((e) => {
      const a = e?.metadata?.system_action;
      return a === 'EARLY_WARNING' || a === 'EARLY_WARNING_INTERCEPT';
    });
    const lastPgIdx = (() => {
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i]?.metadata?.system_action === 'PLAN_GEN_USER_CHOICE') return i;
      }
      return -1;
    })();
    let warningToPlanGenLatencyMs: number | undefined;
    if (firstWarnIdx >= 0 && lastPgIdx >= 0) {
      const t0 = Date.parse(log[firstWarnIdx]?.timestamp ?? '');
      const t1 = Date.parse(log[lastPgIdx]?.timestamp ?? '');
      if (!Number.isNaN(t0) && !Number.isNaN(t1) && t1 >= t0) warningToPlanGenLatencyMs = t1 - t0;
    }
    const warningToPlanGenEventSpan =
      firstWarnIdx >= 0 && lastPgIdx >= 0 && lastPgIdx >= firstWarnIdx ? lastPgIdx - firstWarnIdx : undefined;

    const RELAX = new Set(['upgrade_vehicle_to_4wd', 'increase_days_by_1', 'drop_one_must_include_poi']);
    const lastEarlyPhysical = (earlyChosen ?? []).filter((x) => RELAX.has(x));

    let impact_of_warning: NonNullable<PhysicalConflictAuditReport['behavioral_gap']>['impact_of_warning'];
    if (!lastEarlyChoice && !lastPlanGenChoice) impact_of_warning = 'INSUFFICIENT_LOG_DATA';
    else if (anyEarlyProceedAtOwnRisk && cognitiveGapAcceptLate.length > 0) impact_of_warning = 'WALL_THEN_RELAXED_LATE';
    else if (anyEarlyProceedAtOwnRisk) impact_of_warning = 'PROCEEDED_AT_OWN_RISK';
    else if (lastEarlyPhysical.length > 0) impact_of_warning = 'RELAXED_ON_WARNING';
    else if (lastEarlyChoice) impact_of_warning = 'EARLY_CHOICE_OTHER';
    else impact_of_warning = 'INSUFFICIENT_LOG_DATA';

    const persistence_index =
      cognitiveGapAcceptLate.length + (anyEarlyProceedAtOwnRisk && cognitiveGapAcceptLate.length > 0 ? 1 : 0);

    const wall_misalignment_cost_hint =
      anyEarlyProceedAtOwnRisk && cognitiveGapAcceptLate.length > 0
        ? '用户曾在早警阶段选择「自担风险继续」，随后在 PLAN_GEN 熔断回合接受了早先提示的物理放宽项；适合作为 Narrator「终局模拟/节省算力」话术训练样本。'
        : anyEarlyProceedAtOwnRisk && earlyWarningAcknowledged && planGenChosen.length > 0
          ? '用户选择撞南墙后继续；对比 PLAN_GEN 回合最终选择与早警建议，可量化「侥幸成本」。'
          : undefined;

    let terrain_audit_provenance: PhysicalConflictAuditReport['terrain_audit_provenance'];
    let terrain_perception_gap_hint: string | undefined;
    type PreferenceMismatchRow = NonNullable<
      NonNullable<PhysicalConflictAuditReport['behavioral_gap']>['preference_mismatch']
    >;
    let preference_mismatch: PreferenceMismatchRow | undefined;

    const styleTags = decisionState?.userIntent?.styleTags;
    if (styleTags?.length) {
      const joined = styleTags.join(' ').toLowerCase();
      const photoish = /出片|打卡|摄|photo|instagram|人像/.test(joined);
      const conflict = photoish && cognitiveGapAcceptLate.length > 0;
      preference_mismatch = {
        style_tags_snapshot: [...styleTags],
        photo_mode_vs_relaxation_conflict: conflict,
        hint: conflict
          ? 'styleTags 偏「出片」但 PLAN_GEN 最终接受了早警阶段曾拒绝的放宽项：可考虑在线调低 experienceDensity 或刷新意图编码。'
          : undefined,
      };
    }

    const itin = state.itinerary;
    if (itin?.days?.length) {
      const draft = itineraryToRoutePlanDraft(itin, state.request_id ?? 'audit', 'audit-route');
      let autoFilled = 0;
      let withEnd = 0;
      for (const s of draft.segments) {
        const m = s.metadata as Record<string, unknown> | undefined;
        if (m?.auto_filled_for_audit) autoFilled++;
        if (m?.endLocation) withEnd++;
      }
      terrain_audit_provenance = {
        auto_filled_coord_segment_count: autoFilled,
        route_plan_segment_count: draft.segments.length,
        end_location_segment_count: withEnd,
        note:
          autoFilled > 0
            ? `${autoFilled}/${draft.segments.length} segments used adjacent-POI endLocation with auto_filled_for_audit (TerrainAudit / audit delta baseline).`
            : 'No auto_filled endLocation; coordinates may be fully explicit or chain incomplete.',
      };
      const noStartAnchor =
        draft.segments.length > 0 &&
        draft.segments.every((s) => !(s.metadata as any)?.startLocation);
      if (cognitiveGapAcceptLate.length > 0 && noStartAnchor) {
        terrain_perception_gap_hint =
          '早拒晚接且行程段缺少 startLocation 锚点：TerrainAudit 无法发起 DEM shadow polyline，易出现「平原计划」与后续疲劳后果的认知差；建议上游补坐标或依赖本 Converter 仅能补 end 链。';
      }
    }

    return {
      conflict_source: {
        plan_gen_terminal_failure: tf ? { code: tf.code, message: tf.message, detail: tf.detail } : undefined,
      },
      evidence_anchors: evidenceAnchors,
      physical_bottleneck: hard
        ? {
            primary_violation_type: hard?.type,
            primary_violation_severity: hard?.severity,
            primary_violation_detail: hard?.detail,
          }
        : undefined,
      interaction_trace: {
        plan_gen_retry_count: retryCount,
        consecutive_same_relaxation_attempts: sameAttempts,
        last_relaxation_fingerprint: fingerprint,
        applied_relaxations: applied,
        last_relaxation_applied_at: lastAppliedAt,
      },
      consensus_id: {
        terminal_intent: decisionState?.systemState?.terminalIntent ?? (state.metadata as any)?.terminal_intent,
        fingerprint,
        confirmed_at: consensusAt,
      },
      shadow_validation: {
        note: 'Shadow Gate Dry-Run deltas are embedded in clarification option labels and decision_log.',
      },
      terrain_audit_provenance,
      behavioral_gap:
        lastEarlyChoice ||
        lastPlanGenChoice ||
        anyEarlyProceedAtOwnRisk ||
        terrain_perception_gap_hint ||
        preference_mismatch
          ? {
              early_warning_id: lastEarlyChoice?.metadata?.early_warning_id as string | undefined,
              early_suggested: Array.isArray(earlySuggested) ? earlySuggested : [],
              early_chosen: Array.isArray(earlyChosen) ? earlyChosen : [],
              early_rejected: Array.isArray(earlyRejected) ? earlyRejected : [],
              plan_gen_chosen: Array.isArray(planGenChosen) ? planGenChosen : [],
              cognitive_gap_accept_late: cognitiveGapAcceptLate,
              early_warning_proceeded_at_own_risk: anyEarlyProceedAtOwnRisk,
              early_warning_acknowledged: earlyWarningAcknowledged,
              persistence_index,
              impact_of_warning,
              warning_to_plan_gen_latency_ms: warningToPlanGenLatencyMs,
              warning_to_plan_gen_event_span: warningToPlanGenEventSpan,
              wall_misalignment_cost_hint,
              is_gold_sample:
                (cognitiveGapAcceptLate?.length ?? 0) > 0 ||
                (anyEarlyProceedAtOwnRisk && (planGenChosen?.length ?? 0) > 0),
              wall_hit_distance:
                typeof warningToPlanGenLatencyMs === 'number' || typeof warningToPlanGenEventSpan === 'number'
                  ? {
                      ...(typeof warningToPlanGenLatencyMs === 'number'
                        ? { latency_ms: warningToPlanGenLatencyMs }
                        : {}),
                      ...(typeof warningToPlanGenEventSpan === 'number'
                        ? { event_span: warningToPlanGenEventSpan }
                        : {}),
                    }
                  : undefined,
              ...(terrain_perception_gap_hint ? { terrain_perception_gap_hint } : {}),
              ...(preference_mismatch ? { preference_mismatch } : {}),
            }
          : undefined,
      ...(persuasion_summary ? { persuasion_summary } : {}),
      formal_proof_audit: (() => {
        const issues = verificationIssuesForDominant;
        const decision_evidence: DecisionEvidenceSummary[] = [];
        if (!Array.isArray(issues) || issues.length === 0) return { decision_evidence };

        for (const issue of issues) {
          const msg = String(issue?.message ?? '');
          const parsed = parseL3ProofPrefix(msg);
          if (!parsed) continue;
          decision_evidence.push({
            cid: parsed.cid,
            slack: parsed.slack,
            unit: parsed.unit,
            ref: parsed.ref,
            isHard: String(issue?.class ?? '').toUpperCase() !== 'ADVISORY',
            ...(parsed.evidenceRefIds?.length ? { evidenceRefIds: parsed.evidenceRefIds } : {}),
          });
        }

        // Ensure terrain evidence is first in list when present (prevents UI/exports from being dominated by low-signal entity.*)
        const idx = decision_evidence.findIndex((e) => e?.cid === 'terrain.f_road_compatibility');
        if (idx > 0) {
          const [x] = decision_evidence.splice(idx, 1);
          decision_evidence.unshift(x);
        }

        return { decision_evidence };
      })(),
      cognitive_behavioral_summary: (() => {
        const log = state.decision_log ?? [];
        const proceeded = log
          .map((e, idx) => ({ e, idx }))
          .filter(({ e }) => (e as any)?.metadata?.system_action === 'EARLY_WARNING_PROCEED_AT_OWN_RISK')
          .map(({ e, idx }) => ({
            at: String((e as any)?.timestamp ?? new Date().toISOString()),
            idx,
            evidence_fingerprint: (e as any)?.metadata?.evidence_fingerprint as string | undefined,
            acknowledged_violations: (e as any)?.metadata?.acknowledged_violations as string[] | undefined,
            max_violation_slack:
              typeof (e as any)?.metadata?.max_violation_slack === 'number'
                ? ((e as any).metadata.max_violation_slack as number)
                : ((e as any)?.metadata?.max_violation_slack as number | null | undefined),
          }));

        if (proceeded.length === 0) return undefined;

        const consequence: NonNullable<
          PhysicalConflictAuditReport['cognitive_behavioral_summary']
        >['proceeded_at_own_risk'] = proceeded.map((p) => {
          // Dominant constraint: best-effort from VERIFY decision_evidence.
          const dominant_cid = (() => {
            const candidates: Array<{ cid: string; slack: number; isHard: boolean }> = [];
            const issues = verificationIssuesForDominant;
            if (!Array.isArray(issues) || issues.length === 0) return undefined;
            for (const issue of issues) {
              const parsed = parseL3ProofPrefix(String(issue?.message ?? ''));
              if (!parsed) continue;
              const isHard = String(issue?.class ?? '').toUpperCase() !== 'ADVISORY';
              candidates.push({ cid: parsed.cid, slack: parsed.slack, isHard });
            }
            if (candidates.length === 0) return undefined;
            const withSlack = candidates.filter((c) => Number.isFinite(c.slack));
            if (withSlack.length === 0) return undefined;
            const hard = withSlack.filter((c) => c.isHard);
            const pool = hard.length > 0 ? hard : withSlack;
            if (pool.length === 0) return undefined;
            const domainPriority = (cid: string): number => {
              const s = String(cid ?? '');
              if (s.startsWith('terrain.')) return 0;
              if (s.startsWith('time_space.')) return 1;
              if (s.startsWith('environment.')) return 2;
              if (s.startsWith('entity.')) return 3;
              return 9;
            };
            pool.sort((a, b) => {
              const pa = domainPriority(a.cid);
              const pb = domainPriority(b.cid);
              if (pa !== pb) return pa - pb;
              return a.slack - b.slack;
            });
            return pool[0]?.cid;
          })();

          const planGenFailure = decisionState?.systemState?.planGenTerminalFailure;
          const hasWallThenRelaxedLate = (cognitiveGapAcceptLate?.length ?? 0) > 0;
          const c = planGenFailure
            ? 'PLAN_GEN_TERMINAL_FAILURE'
            : hasWallThenRelaxedLate
              ? 'WALL_THEN_RELAXED_LATE'
              : 'PROCEEDED_NO_WALL_OBSERVED';

          const is_gold_sample = c === 'WALL_THEN_RELAXED_LATE';

          // compute wall-hit distance (best-effort) for gold samples
          const wall = (() => {
            if (!is_gold_sample) return undefined;
            const startIdx = (p as any).idx as number | undefined;
            if (!Number.isFinite(startIdx)) return undefined;
            const start = startIdx as number;
            const startAt = Date.parse(p.at);
            const terminalIdx = (() => {
              for (let i = start + 1; i < log.length; i++) {
                const a = (log[i] as any)?.metadata?.system_action;
                // heuristic "wall" signals: first explicit patch/consensus/user late acceptance
                if (
                  a === 'RELAXATION_APPLIED' ||
                  a === 'CONSENSUS_REACHED_NO_FEASIBLE_PATH' ||
                  a === 'PLAN_GEN_USER_CHOICE'
                ) {
                  return i;
                }
              }
              return -1;
            })();
            if (terminalIdx < 0) return undefined;
            const wall_trigger = String((log[terminalIdx] as any)?.metadata?.system_action ?? '');
            const endAtRaw = (log[terminalIdx] as any)?.timestamp;
            const endAt = Date.parse(String(endAtRaw ?? ''));
            const latency_ms =
              Number.isFinite(startAt) && Number.isFinite(endAt) && endAt >= startAt
                ? endAt - startAt
                : undefined;
            const event_span = terminalIdx - start;
            const wall_hit_distance = {
              ...(Number.isFinite(latency_ms) ? { latency_ms } : {}),
              event_span,
            };
            return {
              wall_trigger: wall_trigger || undefined,
              wall_hit_distance,
            };
          })();

          const note =
            c === 'PLAN_GEN_TERMINAL_FAILURE'
              ? `PLAN_GEN 终止: code=${planGenFailure?.code ?? 'UNKNOWN'}`
              : c === 'WALL_THEN_RELAXED_LATE'
                ? `早拒晚接: late_accept=${cognitiveGapAcceptLate.join(',')}`
                : undefined;

          return {
            // drop internal index before returning
            at: p.at,
            evidence_fingerprint: p.evidence_fingerprint,
            acknowledged_violations: p.acknowledged_violations,
            max_violation_slack: p.max_violation_slack,
            ...(dominant_cid ? { dominant_cid } : {}),
            ...(wall?.wall_trigger ? { wall_trigger: wall.wall_trigger } : {}),
            consequence: c,
            ...(is_gold_sample ? { is_gold_sample: true } : {}),
            ...(wall?.wall_hit_distance ? { wall_hit_distance: wall.wall_hit_distance } : {}),
            ...(note ? { note } : {}),
          };
        });

        return { proceeded_at_own_risk: consequence };
      })(),
      ...(Array.isArray(repairTraces) && repairTraces.length > 0 ? { repair_traces: repairTraces } : {}),
      ...(Array.isArray(repairTraceHistory) && repairTraceHistory.length > 0
        ? { repair_trace_history: repairTraceHistory.slice(-60) }
        : {}),
      repair_utility_rollup: {
        last_round_utility_delta_sum: lastRoundUtilitySum,
        last_round_trace_count: lastRoundArr.length,
        utility_threshold_configured: process.env.DECISION_REPAIR_UTILITY_DELTA_THRESHOLD,
        utility_compensation_triggered: utilityCompensationTriggered,
      },
      predictive_failure_report_summary: {
        card_present: Boolean(pfrCard),
        decision_log_hits: predictiveLogHits,
        ...((pfrCard as { correlationId?: string })?.correlationId
          ? { correlation_id: (pfrCard as { correlationId: string }).correlationId }
          : {}),
        ...(predRealStats ?? {}),
        ...(typeof utilityPredictionError === 'number' ? { utility_prediction_error: utilityPredictionError } : {}),
      },
      ...(predictiveFeedbackThenRepair ? { predictive_feedback_then_repair: predictiveFeedbackThenRepair } : {}),
      ...(escPlan?.correlationId || escPlan?.reason
        ? {
            repair_escalation_correlation: {
              ...(escPlan.correlationId ? { correlation_id: escPlan.correlationId } : {}),
              ...(escPlan.reason ? { escalation_reason: escPlan.reason } : {}),
            },
          }
        : {}),
      ...(Array.isArray(resolutionLog) && resolutionLog.length > 0
        ? { user_repair_resolution_tail: resolutionLog.slice(-20) }
        : {}),
      ...(typeof sessionConsistencyScore === 'number' ? { session_consistency_score: sessionConsistencyScore } : {}),
      ...(dominantCidForSession ? { dominant_cid: dominantCidForSession } : {}),
    };
  }
}

function parseL3ProofPrefix(message: string): {
  cid: string;
  slack: number;
  unit: string;
  ref: string;
  evidenceRefIds?: string[];
} | undefined {
  const s = String(message ?? '');
  if (!s.startsWith('[L3-PROOF|')) return undefined;
  const end = s.indexOf(']');
  if (end <= 0) return undefined;
  const inside = s.slice(1, end); // "L3-PROOF|..."
  const parts = inside.split('|').map((x) => x.trim());
  if (parts.length < 4) return undefined;
  if (parts[0] !== 'L3-PROOF') return undefined;

  const cid = parts[1];
  const entity = parts[2]; // "TYPE:ID"

  // Remaining parts are key:value fields: cmp/actual/limit/unit/slack/(optional) evidence:SOURCE:refIds...
  let unit = '';
  let slackStr: string | undefined;
  let evidenceRefIds: string[] | undefined;

  for (let i = 3; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('unit:')) unit = p.slice('unit:'.length);
    if (p.startsWith('slack:')) slackStr = p.slice('slack:'.length);
    if (p.startsWith('evidence:')) {
      // evidence:SRC or evidence:SRC:id1,id2
      const rest = p.slice('evidence:'.length);
      const segs = rest.split(':');
      const ids = segs.length >= 2 ? segs.slice(1).join(':') : '';
      const list = ids ? ids.split(',').map((x) => x.trim()).filter(Boolean) : [];
      if (list.length) evidenceRefIds = list;
    }
  }

  const slack = Number(slackStr);
  if (!cid || !entity || !Number.isFinite(slack)) return undefined;
  if (!unit) unit = 'unknown';

  return {
    cid,
    slack,
    unit,
    ref: entity,
    ...(evidenceRefIds?.length ? { evidenceRefIds } : {}),
  };
}

