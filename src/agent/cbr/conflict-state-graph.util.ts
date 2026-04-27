import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import type { PhysicalConflictAuditReport } from '../utils/terminal-audit-report.generator';

export type GraphNodeKind = 'EARLY_WARNING';
export type GraphEdgeKind = 'USER_CHOICE';

export interface ConflictStateGraphNode {
  id: string; // early_warning_id
  kind: GraphNodeKind;
  dominant_cid?: string;
  risk_level?: string;
  conflict_type?: string;
  evidence_summary?: string;
  created_at?: string;
}

export interface ConflictStateGraphEdge {
  id: string;
  kind: GraphEdgeKind;
  from: string; // node id
  to: string; // 节点 ID（目前保持单一；为多节点会话的未来扩展预留架构兼容性）
  at: string;
  questionId?: string;
  chosen_actions?: string[];
  top_scored_value?: string;
  reward?: number;
  /**
   * 边权重：值越高表示“阻力越大 / 后悔程度越高 / 振荡越强”。
   * 由 Harness 用于计算最短说服路径。
   */
  weight: number;
  tags?: string[];
}

export interface ConflictStateGraphJSON {
  session_id?: string;
  nodes: ConflictStateGraphNode[];
  edges: ConflictStateGraphEdge[];
  summary: {
    early_warning_id?: string;
    feedback_event_count: number;
    positive_reward_count: number;
    negative_reward_count: number;
    first_positive_reward_log_index?: number;
    wall_hit_distance_ms?: number;
    /**
     * action-level oscillation: top-scored action rejection counts
     * key = top_scored_value, value = rejected_count
     */
    oscillation_k_action: Record<string, number>;
    /** Optional: Iron Shield `payload.decision_metadata` snapshot for graph ↔ evidence join. */
    decision_metadata?: unknown;
  };
}

function safeParseTime(t: unknown): number | undefined {
  const ms = Date.parse(String(t ?? ''));
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * 构建一个轻量级中间表示（IR），统一 Memory/Context/Harness。
 * - 节点：early_warning_id
 * - 边：CLARIFICATION_FEEDBACK 事件（reward / top_reject / proceed）
 * - 权重：结合 reward（阻力）、wall-hit（后悔程度）和动作振荡
 */
export function buildConflictStateGraph(input: {
  session_id?: string;
  decision_log: DecisionLogEntry[];
  audit_report: PhysicalConflictAuditReport;
  /** Optional: same shape as API `result.payload.decision_metadata` */
  decision_metadata?: unknown;
}): ConflictStateGraphJSON {
  const log = input.decision_log ?? [];
  const ar = input.audit_report;

  const ewId = ar.behavioral_gap?.early_warning_id;
  const nodeId = ewId ?? 'early_warning:unknown';

  const ewEntry =
    log
      .slice()
      .reverse()
      .find((e) => e?.metadata?.system_action === 'EARLY_WARNING') ??
    log
      .slice()
      .reverse()
      .find((e) => e?.metadata?.system_action === 'EARLY_WARNING_INTERCEPT');
  const ew = (ewEntry?.metadata as any)?.early_warning ?? undefined;

  const nodes: ConflictStateGraphNode[] = [
    {
      id: nodeId,
      kind: 'EARLY_WARNING',
      dominant_cid: ar.physical_bottleneck?.primary_violation_type,
      risk_level: ew?.risk_level,
      conflict_type: ew?.conflict_type,
      evidence_summary: ew?.evidence_summary,
      created_at: ewEntry?.timestamp,
    },
  ];

  // Action-level oscillation: count rejections of top_scored_value per action.
  const oscillation: Record<string, number> = {};
  const feedback = log
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => e?.metadata?.system_action === 'CLARIFICATION_FEEDBACK');
  for (const { e } of feedback) {
    const top = String((e.metadata as any)?.top_scored_value ?? '');
    const reward = Number((e.metadata as any)?.reward ?? 0);
    if (!top) continue;
    if (reward <= 0) oscillation[top] = (oscillation[top] ?? 0) + 1;
  }

  const wallMs = ar.behavioral_gap?.wall_hit_distance?.latency_ms;
  const wallNorm = typeof wallMs === 'number' && Number.isFinite(wallMs) ? Math.min(3, wallMs / 180_000) : 0;

  const edges: ConflictStateGraphEdge[] = feedback.map(({ e, idx }) => {
    const md = (e.metadata ?? {}) as any;
    const reward = Number(md.reward ?? 0);
    const top = String(md.top_scored_value ?? '');
    const chosen = Array.isArray(md.chosen_actions) ? md.chosen_actions.map(String) : undefined;
    const proceed = chosen?.includes('proceed_at_own_risk') ?? false;

    const baseResistance = reward > 0 ? 0.2 : reward < 0 ? 1.2 : 0.8;
    const osc = top ? oscillation[top] ?? 0 : 0;
    const oscPenalty = osc >= 2 ? 1.5 : osc === 1 ? 0.6 : 0;
    const proceedPenalty = proceed ? 0.8 : 0;
    const weight = baseResistance + wallNorm + oscPenalty + proceedPenalty;

    const tags: string[] = [];
    if (reward > 0) tags.push('CONVERTED');
    if (reward < 0) tags.push('NEGATIVE_REWARD');
    if (proceed) tags.push('PROCEED_AT_OWN_RISK');
    if (osc >= 2) tags.push('OSCILLATION_ESCALATED');

    return {
      id: `edge:${idx}:${String(md.questionId ?? 'unknown')}`,
      kind: 'USER_CHOICE',
      from: nodeId,
      to: nodeId,
      at: e.timestamp,
      questionId: md.questionId,
      chosen_actions: chosen,
      top_scored_value: top || undefined,
      reward,
      weight,
      ...(tags.length ? { tags } : {}),
    };
  });

  const ps = ar.persuasion_summary;
  const summary = {
    early_warning_id: ewId,
    feedback_event_count: ps?.feedback_event_count ?? feedback.length,
    positive_reward_count: ps?.positive_reward_count ?? feedback.filter(({ e }) => Number((e.metadata as any)?.reward ?? 0) > 0).length,
    negative_reward_count: ps?.negative_reward_count ?? feedback.filter(({ e }) => Number((e.metadata as any)?.reward ?? 0) < 0).length,
    ...(typeof ps?.first_positive_reward_log_index === 'number' ? { first_positive_reward_log_index: ps.first_positive_reward_log_index } : {}),
    ...(typeof wallMs === 'number' ? { wall_hit_distance_ms: wallMs } : {}),
    oscillation_k_action: oscillation,
    ...(input.decision_metadata !== undefined && input.decision_metadata !== null
      ? { decision_metadata: input.decision_metadata }
      : {}),
  };

  return {
    session_id: input.session_id,
    nodes,
    edges,
    summary,
  };
}

export function evaluateGraphEfficiency(graph: ConflictStateGraphJSON): {
  persuasion_efficiency_score: number; // higher is better
  shortest_positive_path_weight?: number;
  has_conversion: boolean;
  notes: string[];
} {
  // 单节点 v1 版本：“路径”仅取正 reward 中的最小边权重。
  const notes: string[] = [];
  const positives = graph.edges.filter((e) => (e.reward ?? 0) > 0);
  const has = positives.length > 0;
  if (!has) {
    notes.push('No positive conversion observed (reward>0).');
  }
  const minW = has ? Math.min(...positives.map((e) => e.weight)) : undefined;
  const wall = typeof graph.summary.wall_hit_distance_ms === 'number' ? graph.summary.wall_hit_distance_ms : 0;
  const wallPenalty = wall > 0 ? Math.min(2, wall / 180_000) : 0;
  const oscPenalty =
    Object.values(graph.summary.oscillation_k_action ?? {}).some((k) => k >= 2) ? 1 : 0;

  // 评分：从 10 分开始，减去罚分，加上奖励转换分。
  const base = 10;
  const conversionBonus = has ? 2 : 0;
  const pathPenalty = typeof minW === 'number' ? Math.min(3, minW) : 3;
  const score = Math.max(0, base + conversionBonus - wallPenalty - oscPenalty - pathPenalty);

  return {
    persuasion_efficiency_score: score,
    ...(typeof minW === 'number' ? { shortest_positive_path_weight: minW } : {}),
    has_conversion: has,
    notes,
  };
}

