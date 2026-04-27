import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import type { PhysicalConflictAuditReport } from '../utils/terminal-audit-report.generator';
import { resolvePersuasionTierAtLogIndex, type PersuasionTier } from '../utils/persuasion-tier.util';
import { mergeWallHitDistanceMs } from '../utils/wall-hit-distance.util';

export type NarratorDatasetLabel = 'POSITIVE_CHOSEN_TOP' | 'NEGATIVE_WALL_HIT' | 'FINAL_CONSENSUS_GOLD';

export interface NarratorDatasetRow {
  prompt: string;
  chosen: string;
  rejected: string;
  metadata: {
    request_id?: string;
    label: NarratorDatasetLabel;
    questionId?: string;
    reward?: number;
    early_warning_id?: string;
    dominant_cid?: string;
    precedent_n?: number;
    percentage?: number;
    cost_saved_ms?: number;
    wall_hit_distance_ms?: number;
    /**
     * Snapshot of `route_and_run` payload.decision_metadata (Iron Shield evidence_cards, etc.)
     * for DPO / critic training and audit.
     */
    decision_metadata?: Record<string, unknown>;
    /** 1=fact / 2=impact / 3=authority — DPO 关键控制参数 */
    persuasion_tier?: PersuasionTier;
    /** Preview→commit drift severity (for “dynamic correction” training). */
    drift_severity?: 'minor' | 'moderate' | 'critical';
  };
}

function extractDriftSeverityFromDecisionLog(log: DecisionLogEntry[]): 'minor' | 'moderate' | 'critical' | undefined {
  const xs = Array.isArray(log) ? log : [];
  for (let i = xs.length - 1; i >= 0; i--) {
    const md = (xs[i] as any)?.metadata;
    if (!md || typeof md !== 'object') continue;
    if (String(md.system_action ?? '') !== 'ACTION_PREVIEW_STALE') continue;
    const origAfter = Number(md?.original_shadow_delta?.resources?.budget?.after);
    const curAfter = Number(md?.recomputed_shadow_delta?.resources?.budget?.after);
    if (!Number.isFinite(origAfter) || !Number.isFinite(curAfter)) return 'critical';
    const diff = Math.abs(curAfter - origAfter);
    const denom = Math.max(1, Math.abs(origAfter));
    const rel = diff / denom;
    if (rel < 0.05) return 'minor';
    if (rel < 0.2) return 'moderate';
    return 'critical';
  }
  return undefined;
}

function pickTopOptionFromSnapshot(options_snapshot: any[] | undefined): any | undefined {
  if (!Array.isArray(options_snapshot)) return undefined;
  const scored = options_snapshot
    .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
    .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number));
  return scored[0];
}

function formatContext(input: {
  evidence_summary?: string;
  precedentN?: number;
  percentage?: number;
  costSavedMs?: number;
  topOptionLabel?: string;
  dominantCid?: string;
  regionId?: string;
  month?: number;
}): string {
  const parts: string[] = [];
  if (input.evidence_summary) parts.push(`Evidence: ${input.evidence_summary}`);
  if (input.regionId || input.month) parts.push(`Context: region=${input.regionId ?? 'n/a'}, month=${input.month ?? 'n/a'}`);
  if (typeof input.precedentN === 'number' && input.precedentN > 0) {
    parts.push(`Precedent: N=${input.precedentN}${typeof input.percentage === 'number' ? `, ${input.percentage}% accept` : ''}`);
  }
  if (typeof input.costSavedMs === 'number') parts.push(`CostSaved: ${input.costSavedMs}ms`);
  if (input.dominantCid) parts.push(`dominant_cid=${input.dominantCid}`);
  if (input.topOptionLabel) parts.push(`TopOption: ${input.topOptionLabel}`);
  return parts.join('\n');
}

function buildChosenText(args: {
  precedentN?: number;
  percentage?: number;
  costSavedMs?: number;
  topActionLabel?: string;
  highOscillation?: boolean;
  physicalNarration?: string;
}): string {
  if (args.physicalNarration && String(args.physicalNarration).trim()) {
    return String(args.physicalNarration).trim();
  }
  const N = args.precedentN ?? 0;
  const pct = args.percentage;
  const cost = args.costSavedMs;
  const action = args.topActionLabel ?? '该修复动作';

  const strong = args.highOscillation
    ? '已检测到多次重复尝试，物理规则不可逾越。'
    : '';

  if (N > 3 && typeof pct === 'number' && typeof cost === 'number') {
    return `根据以往 ${N} 次类似冲突的判例，${pct}% 的用户最终都不得不选择${action}。为了避免多余的 ${cost} 毫秒等待，建议您现在采纳。${strong}`.trim();
  }
  if (N >= 1) {
    return `近期有类似案例显示，在相似冲突下往往需要通过${action}来消解。${strong}`.trim();
  }
  return `基于物理约束与证据，建议优先选择${action}以恢复可行域。${strong}`.trim();
}

export function extractNarratorDatasetFromRun(input: {
  request_id?: string;
  audit_report: PhysicalConflictAuditReport;
  decision_log: DecisionLogEntry[];
  /** Optional: full `payload.decision_metadata` from route_and_run (evidence_cards, …). */
  decision_metadata?: Record<string, unknown> | null;
  /** Filter: drop precedent samples with shown_count < 3 (low confidence). */
  min_shown_count?: number;
}): NarratorDatasetRow[] {
  const minShown = input.min_shown_count ?? 3;
  const ar = input.audit_report;
  const log = input.decision_log ?? [];
  const out: NarratorDatasetRow[] = [];
  const drift_severity = extractDriftSeverityFromDecisionLog(log);

  const feedbackEvents = log.filter((e) => e?.metadata?.system_action === 'CLARIFICATION_FEEDBACK');
  if ((ar.persuasion_summary?.feedback_event_count ?? 0) <= 0 && feedbackEvents.length === 0) return out;

  const ewMeta = (log.slice().reverse().find((e) => e?.metadata?.system_action === 'EARLY_WARNING')?.metadata?.early_warning ??
    (log.slice().reverse().find((e) => e?.metadata?.system_action === 'EARLY_WARNING_INTERCEPT')?.metadata?.early_warning) ??
    undefined) as any;
  const evidence_summary = String(ewMeta?.evidence_summary ?? '');

  const wallMs = ar.behavioral_gap?.wall_hit_distance?.latency_ms;
  const highOsc = (ar.interaction_trace?.consecutive_same_relaxation_attempts ?? 0) >= 2;

  for (const f of feedbackEvents) {
    const md = (f.metadata ?? {}) as any;
    const questionId = String(md.questionId ?? '');
    const reward = typeof md.reward === 'number' ? md.reward : Number(md.reward ?? 0);
    const options_snapshot = md.options_snapshot as any[] | undefined;
    const top = pickTopOptionFromSnapshot(options_snapshot);

    // (compat placeholder) shown_count not used in current extractor.
   // 我们当前的快照不携带 shown_count；依赖 precedent_n 并通过 persuasion_summary 保持严格的 minShown 过滤。
   // 若后续有此需求，可在渲染时将 shown_count 嵌入到选项元数据中。

    const precedent_n = (top as any)?.metadata?.precedent_n ?? (top as any)?.metadata?.precedentN;
    const N = typeof precedent_n === 'number' ? precedent_n : parseInt(String(precedent_n ?? '0'), 10) || 0;

  // 过滤：低置信度的先例样本（shown_count < 3）——若 shown_count 缺失，则基于 N 尽力而为
    if (N > 0 && N < minShown) continue;

    const topLabel = String((top as any)?.label ?? '');
    const dominant_cid = String((top as any)?.metadata?.dominant_cid ?? md.dominant_cid ?? '');

    // Physical narration v1: allow the run to directly provide a rendered hint as the chosen response.
    // This is how we inject "Iron Shield" strong spatial anchoring into DPO pairs.
    const physicalNarration =
      (md.narrator_hint_rendered as string | undefined) ??
      (md.physical_narration as string | undefined) ??
      ((top as any)?.metadata?.narrator_hint_rendered as string | undefined) ??
      undefined;

    const percentage =
      N > 3 && typeof ewMeta?.historical_precedents?.[0]?.stats?.historical_late_accept_rate === 'number'
        ? Math.round(ewMeta.historical_precedents[0].stats.historical_late_accept_rate * 100)
        : undefined;
    const wallHitMerged = mergeWallHitDistanceMs(md, wallMs);
    const costSavedMs = typeof wallHitMerged === 'number' ? Math.round(wallHitMerged) : typeof wallMs === 'number' ? Math.round(wallMs) : undefined;

    const eventIdx = log.indexOf(f as any);
    const forcedTier = Number(md.persuasion_tier);
    const persuasion_tier: PersuasionTier =
      forcedTier === 1 || forcedTier === 2 || forcedTier === 3
        ? (forcedTier as PersuasionTier)
        : resolvePersuasionTierAtLogIndex(log, eventIdx >= 0 ? eventIdx : 0);

    const prompt = formatContext({
      evidence_summary: evidence_summary || undefined,
      precedentN: N || undefined,
      percentage,
      costSavedMs,
      topOptionLabel: topLabel || undefined,
      dominantCid: dominant_cid || undefined,
      regionId: (md.options_snapshot?.[0] as any)?.metadata?.region_id,
      month: (md.options_snapshot?.[0] as any)?.metadata?.month,
    });

    const chosen = buildChosenText({
      precedentN: N || undefined,
      percentage,
      costSavedMs,
      topActionLabel: topLabel ? `「${topLabel}」` : undefined,
      highOscillation: highOsc,
      physicalNarration,
    });
    const rejected = physicalNarration
      ? '当前风力较大/能见度较差，请注意安全。'
      : '如果您坚持也可以继续尝试，但这会增加试错成本，且可能仍会失败。';

    const label: NarratorDatasetLabel =
      reward > 0 ? 'POSITIVE_CHOSEN_TOP' : typeof wallMs === 'number' ? 'NEGATIVE_WALL_HIT' : 'NEGATIVE_WALL_HIT';

    const decisionMeta =
      (md.decision_metadata as Record<string, unknown> | undefined) ??
      (input.decision_metadata && typeof input.decision_metadata === 'object'
        ? input.decision_metadata
        : undefined);

    out.push({
      prompt,
      chosen,
      rejected,
      metadata: {
        request_id: input.request_id,
        label,
        questionId,
        reward,
        early_warning_id: md.early_warning_id ?? ar.behavioral_gap?.early_warning_id,
        dominant_cid: dominant_cid || undefined,
        precedent_n: N || undefined,
        ...(typeof percentage === 'number' ? { percentage } : {}),
        ...(typeof costSavedMs === 'number' ? { cost_saved_ms: costSavedMs } : {}),
        ...(typeof wallHitMerged === 'number' ? { wall_hit_distance_ms: wallHitMerged } : typeof wallMs === 'number' ? { wall_hit_distance_ms: wallMs } : {}),
        persuasion_tier,
        ...(drift_severity ? { drift_severity } : {}),
        ...(decisionMeta ? { decision_metadata: decisionMeta } : {}),
      },
    });
  }

  // 最终共识黄金样本（最后通牒模板）
  if (ar.behavioral_gap?.is_gold_sample) {
    const N = ar.behavioral_gap?.early_suggested?.length ? 5 : 0; // 若存在先例，则为真实的 N 值
    out.push({
      prompt: `FINAL_CONSENSUS\n${formatContext({
        evidence_summary: evidence_summary || undefined,
        precedentN: N || undefined,
        costSavedMs: typeof wallMs === 'number' ? Math.round(wallMs) : undefined,
      })}`,
      chosen: `终局提示：在不放宽约束的前提下当前冲突不可逾越。建议直接选择系统推荐的最小割路径（路径 A）以恢复物理可行域。`,
      rejected: `若仍坚持原约束，系统将只能进入无解终止并输出审计报告。`,
      metadata: {
        request_id: input.request_id,
        label: 'FINAL_CONSENSUS_GOLD',
        early_warning_id: ar.behavioral_gap?.early_warning_id,
        ...(typeof wallMs === 'number' ? { wall_hit_distance_ms: wallMs } : {}),
        persuasion_tier: resolvePersuasionTierAtLogIndex(log, Math.max(0, log.length - 1)),
        ...(drift_severity ? { drift_severity } : {}),
        ...(input.decision_metadata && typeof input.decision_metadata === 'object'
          ? { decision_metadata: input.decision_metadata }
          : {}),
      },
    });
  }

  return out;
}

export function toJsonl(rows: NarratorDatasetRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
}

function formatWallHitDistanceV1(input: {
  wall_hit_distance_ms?: number;
  wall_hit_event_span?: number;
}): string | undefined {
  const ms = input.wall_hit_distance_ms;
  if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
    return `${Math.round(ms / 1000)}s`;
  }
  const span = input.wall_hit_event_span;
  if (typeof span === 'number' && Number.isFinite(span) && span > 0) {
    return `${Math.round(span)} rounds`;
  }
  return undefined;
}

export type RegretSeverityV1 = 'Minor' | 'Moderate' | 'Critical';

function getDelaySeverityV1(ms: number | undefined): RegretSeverityV1 | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return undefined;
  if (ms < 60_000) return 'Minor';
  if (ms <= 300_000) return 'Moderate';
  return 'Critical';
}

/**
 * 面向主流微调流水线的 JSONL V1 契约。
 * - wall_hit_distance 为人可读格式："180s" / "5 rounds"
 * - RegretSeverity（离散桶）用于帮助模型学习“数值 → 语气强度”的阶梯映射
 * - 字段仅包含：prompt / chosen / rejected / metadata
 */
export function toJsonlV1(rows: NarratorDatasetRow[]): string {
  const v1 = rows.map((r) => {
    const wall_hit_distance_raw = formatWallHitDistanceV1({
      wall_hit_distance_ms: r.metadata.wall_hit_distance_ms,
      wall_hit_event_span: undefined,
    });
    const regretSeverity = getDelaySeverityV1(r.metadata.wall_hit_distance_ms);
    const wall_hit_distance =
      wall_hit_distance_raw && regretSeverity ? `${wall_hit_distance_raw} (${regretSeverity})` : wall_hit_distance_raw;
    const prompt =
      regretSeverity && !r.prompt.includes('RegretSeverity:')
        ? `${r.prompt}\nRegretSeverity: ${regretSeverity}`
        : r.prompt;
    return {
      prompt,
      chosen: r.chosen,
      rejected: r.rejected,
      metadata: {
        label: r.metadata.label,
        ...(wall_hit_distance ? { wall_hit_distance } : {}),
        ...(regretSeverity ? { regret_severity: regretSeverity } : {}),
        ...(typeof r.metadata.reward === 'number' ? { reward: r.metadata.reward } : {}),
        ...(r.metadata.early_warning_id ? { early_warning_id: r.metadata.early_warning_id } : {}),
        ...(r.metadata.dominant_cid ? { dominant_cid: r.metadata.dominant_cid } : {}),
        ...(typeof r.metadata.precedent_n === 'number' ? { precedent_n: r.metadata.precedent_n } : {}),
        ...(r.metadata.persuasion_tier != null ? { persuasion_tier: r.metadata.persuasion_tier } : {}),
        ...(r.metadata.decision_metadata != null ? { decision_metadata: r.metadata.decision_metadata } : {}),
      },
    };
  });
  return v1.map((x) => JSON.stringify(x)).join('\n') + (v1.length ? '\n' : '');
}

