/**
 * Verify V2：级联封路 / 孤岛检测（Closure Propagation）
 *
 * **只读阶段（v0）**：消费 `research_data.safetravel_alerts[].affected_route_segment_refs`，
 * 与行程项 `metadata.route_segment_ref` 对齐后写入 `metadata.closure_shadow`（不删项、不改时间窗）。
 * 每轮重算前会清空旧 `closure_shadow`，避免陈旧标记。
 *
 * 图传播 / TERMINAL_MISS 仍由 {@link propagateClosureIslandSkeleton} 占位；`critical_segment_refs_by_day`
 * 仅收录「当日触及的 ref 在聚合后仍为 CRITICAL」的锚点，供后续 OSRM 绕行接入。
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { SafetravelRouteAlertEvidence } from './safetravel-verify-evidence.util';

/** smart_update / verify 下游建议的修复粒度 */
export type ClosurePropagationSuggestedMode = 'REPLAN_REMAINING' | 'TEMPORARY_STAY';

/** 写入 `itinerary.metadata.verify_shadow` 的键（与 trip-plan 弱类型 Record 对齐） */
export const VERIFY_SHADOW_CLOSURE_PROPAGATION_V0 = 'closure_propagation_v0' as const;

export interface ClosureCutPoint {
  /** 行程内 day 索引（0 = 首日） */
  dayIndex: number;
  route_segment_ref: string;
  /** 与 itinerary.verify SafeTravel 对齐（同 ref 多 alert 时取最高严重度） */
  severity: 'CRITICAL' | 'ERROR' | 'WARNING';
}

export interface TerminalMissRisk {
  item_id: string;
  day?: string;
  reason: string;
}

export interface ClosurePropagationResult {
  cutPoints: ClosureCutPoint[];
  /** 传播阶段占位：当前恒为空 */
  unreachable_item_ids: string[];
  unreachable_day_indices: number[];
  terminal_miss_risks: TerminalMissRisk[];
  default_suggested_mode: ClosurePropagationSuggestedMode;
}

export interface ClosurePropagationInput {
  itinerary: Itinerary;
  /** 各日触及 CRITICAL 聚合封路的 segment ref（供后续图算法） */
  critical_segment_refs_by_day: ReadonlyMap<number, ReadonlySet<string>>;
  /** 只读阶段：SafeTravel 对齐得到的阻断锚点 */
  cut_points?: readonly ClosureCutPoint[];
}

function severityRank(s: 'CRITICAL' | 'ERROR' | 'WARNING'): number {
  return s === 'CRITICAL' ? 3 : s === 'ERROR' ? 2 : 1;
}

function mergeSeverity(
  a: 'CRITICAL' | 'ERROR' | 'WARNING',
  b: 'CRITICAL' | 'ERROR' | 'WARNING',
): 'CRITICAL' | 'ERROR' | 'WARNING' {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/** 与 `itinerary-verify.verifySafetravelRouteAlerts` 对齐 */
export function severityFromSafetravelAlert(a: SafetravelRouteAlertEvidence): 'CRITICAL' | 'ERROR' | 'WARNING' {
  const s = (a.severity ?? 'critical').toString().trim().toLowerCase();
  if (s === 'critical') return 'CRITICAL';
  if (s === 'high' || s === 'error') return 'ERROR';
  return 'WARNING';
}

export function normalizeSafetravelAlerts(
  researchData: Record<string, unknown> | undefined,
): SafetravelRouteAlertEvidence[] {
  if (!researchData) return [];
  const raw = researchData.safetravel_alerts;
  const nested = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { alerts?: unknown }).alerts : undefined;
  const candidate: unknown[] = Array.isArray(raw) ? raw : Array.isArray(nested) ? nested : [];
  return candidate.filter(Boolean) as SafetravelRouteAlertEvidence[];
}

/** 同一 ref 多条 alert → 最高严重度 + id 列表 */
export function aggregateAlertsByAffectedRef(
  alerts: SafetravelRouteAlertEvidence[],
): Map<string, { severity: 'CRITICAL' | 'ERROR' | 'WARNING'; ids: string[] }> {
  const m = new Map<string, { severity: 'CRITICAL' | 'ERROR' | 'WARNING'; ids: string[] }>();
  for (const a of alerts) {
    const refs = a?.affected_route_segment_refs;
    if (!Array.isArray(refs)) continue;
    const sev = severityFromSafetravelAlert(a);
    const id = a.id != null ? String(a.id) : '';
    for (const r of refs) {
      if (typeof r !== 'string' || r.length === 0) continue;
      const prev = m.get(r);
      if (!prev) {
        m.set(r, { severity: sev, ids: id ? [id] : [] });
        continue;
      }
      const mergedSev = mergeSeverity(prev.severity, sev);
      const ids = [...prev.ids];
      if (id && !ids.includes(id)) ids.push(id);
      m.set(r, { severity: mergedSev, ids });
    }
  }
  return m;
}

/** 幂等：移除上一轮 verify 写入的 closure_shadow */
export function clearClosureShadowMetadata(itinerary: Itinerary): void {
  for (const d of itinerary.days ?? []) {
    for (const it of d.items ?? []) {
      if (it.metadata && 'closure_shadow' in it.metadata) {
        const { closure_shadow: _removed, ...rest } = it.metadata;
        it.metadata = Object.keys(rest).length > 0 ? rest : undefined;
      }
    }
  }
}

/**
 * 占位：后续接路段图 / 可达性服务后实现 BFS 传播与 TERMINAL 检测。
 */
export function propagateClosureIslandSkeleton(input: ClosurePropagationInput): ClosurePropagationResult {
  const cutPoints = input.cut_points?.length ? [...input.cut_points] : [];
  return {
    cutPoints,
    unreachable_item_ids: [],
    unreachable_day_indices: [],
    terminal_miss_risks: [],
    default_suggested_mode: 'TEMPORARY_STAY',
  };
}

/**
 * SafeTravel → cutPoints + item 级 `closure_shadow` + 行程级 `verify_shadow` 快照。
 */
export function applySafetravelClosureShadowReadOnlyPhase(
  itinerary: Itinerary,
  researchData: Record<string, unknown> | undefined,
): ClosurePropagationResult {
  clearClosureShadowMetadata(itinerary);

  const alerts = normalizeSafetravelAlerts(researchData);
  if (alerts.length === 0) {
    const empty = propagateClosureIslandSkeleton({
      itinerary,
      critical_segment_refs_by_day: new Map(),
      cut_points: [],
    });
    if (itinerary.metadata) {
      const vs = { ...(itinerary.metadata.verify_shadow ?? {}) };
      delete vs[VERIFY_SHADOW_CLOSURE_PROPAGATION_V0];
      itinerary.metadata.verify_shadow = Object.keys(vs).length > 0 ? vs : undefined;
    }
    return empty;
  }

  const byRef = aggregateAlertsByAffectedRef(alerts);
  if (byRef.size === 0) {
    const empty = propagateClosureIslandSkeleton({
      itinerary,
      critical_segment_refs_by_day: new Map(),
      cut_points: [],
    });
    if (itinerary.metadata) {
      const vs = { ...(itinerary.metadata.verify_shadow ?? {}) };
      delete vs[VERIFY_SHADOW_CLOSURE_PROPAGATION_V0];
      itinerary.metadata.verify_shadow = Object.keys(vs).length > 0 ? vs : undefined;
    }
    return empty;
  }

  const cutKeySeen = new Set<string>();
  const cutPoints: ClosureCutPoint[] = [];
  const criticalByDay = new Map<number, Set<string>>();

  itinerary.days?.forEach((day, dayIndex) => {
    for (const item of day.items ?? []) {
      const seg = item.metadata?.route_segment_ref;
      if (!seg || !byRef.has(seg)) continue;

      const agg = byRef.get(seg)!;
      item.metadata = {
        ...(item.metadata ?? {}),
        closure_shadow: {
          cut_point: true,
          route_segment_ref: seg,
          alert_severity: agg.severity,
          alert_ids: agg.ids.length ? agg.ids : undefined,
        },
      };

      const k = `${dayIndex}:${seg}`;
      if (!cutKeySeen.has(k)) {
        cutKeySeen.add(k);
        cutPoints.push({ dayIndex, route_segment_ref: seg, severity: agg.severity });
      }

      if (agg.severity === 'CRITICAL') {
        let set = criticalByDay.get(dayIndex);
        if (!set) {
          set = new Set();
          criticalByDay.set(dayIndex, set);
        }
        set.add(seg);
      }
    }
  });

  const result = propagateClosureIslandSkeleton({
    itinerary,
    critical_segment_refs_by_day: criticalByDay,
    cut_points: cutPoints,
  });

  const baseMeta = itinerary.metadata ?? { total_days: itinerary.days?.length ?? 0 };
  itinerary.metadata = {
    ...baseMeta,
    total_days: baseMeta.total_days ?? itinerary.days?.length ?? 0,
    verify_shadow: {
      ...(baseMeta.verify_shadow ?? {}),
      [VERIFY_SHADOW_CLOSURE_PROPAGATION_V0]: result as unknown as Record<string, unknown>,
    },
  };

  return result;
}
