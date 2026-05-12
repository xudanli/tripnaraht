/**
 * Narrative Gate（Gen1）：根据 inventory 快照元数据约束叙事强度，不引入 Consistency Group / 一级 Snapshot。
 * @see docs/decision/ADR-WORLD-RUNTIME-V1-NAMING.md
 */

import type { InventorySnapshotsMetaPayload, LightweightInventorySensorId } from './lightweight-live-inventory.registry';

export type NarrativeSafetyMode = 'safe' | 'tentative' | 'refresh_required';

export type NarrativeConsistencyRisk = 'low' | 'medium' | 'high';

export type NarrativeSafetyPayload = {
  mode: NarrativeSafetyMode;
  reasons: string[];
  /** 已超过 stale_after 的 sensor（含 hard / soft） */
  stale_domains: LightweightInventorySensorId[];
  /** 本请求内各快照 captured_at 的最大时间差（毫秒）；单快照则无 */
  temporal_skew_ms?: number;
  consistency_risk: NarrativeConsistencyRisk;
};

/** flight / hotel 过期即 refresh_required；其余域过期为 tentative */
const HARD_INVENTORY_DOMAINS = new Set<LightweightInventorySensorId>(['flight', 'hotel']);

function readTemporalSkewThresholdMs(): number {
  const raw = process.env.NARRATIVE_GATE_TEMPORAL_SKEW_MS;
  if (raw == null || raw === '') return 15 * 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000;
}

/**
 * 输入轻量路径组装的 `inventory_snapshots_meta`；无快照时视为 safe（无 live inventory 约束）。
 */
export function evaluateNarrativeSafety(
  meta: InventorySnapshotsMetaPayload | undefined,
  opts?: { nowMs?: number; temporalSkewThresholdMs?: number },
): NarrativeSafetyPayload {
  const now = opts?.nowMs ?? Date.now();
  const skewThreshold = opts?.temporalSkewThresholdMs ?? readTemporalSkewThresholdMs();

  if (!meta?.sensors?.length) {
    return {
      mode: 'safe',
      reasons: [],
      stale_domains: [],
      consistency_risk: 'low',
    };
  }

  const staleDomains: LightweightInventorySensorId[] = [];
  for (const s of meta.sensors) {
    const staleAfter = Date.parse(s.stale_after_iso);
    if (!Number.isFinite(staleAfter)) continue;
    if (now > staleAfter) {
      staleDomains.push(s.sensor_id);
    }
  }

  const hardStale = staleDomains.filter((id) => HARD_INVENTORY_DOMAINS.has(id));
  if (hardStale.length > 0) {
    const caps = meta.sensors.map((s) => Date.parse(s.captured_at_iso)).filter(Number.isFinite) as number[];
    let temporal_skew_ms: number | undefined;
    if (caps.length >= 2) {
      temporal_skew_ms = Math.max(...caps) - Math.min(...caps);
    }
    return {
      mode: 'refresh_required',
      reasons: [`hard_inventory_stale:${hardStale.join(',')}`],
      stale_domains: staleDomains,
      ...(temporal_skew_ms !== undefined ? { temporal_skew_ms } : {}),
      consistency_risk: 'high',
    };
  }

  const caps = meta.sensors.map((s) => Date.parse(s.captured_at_iso)).filter(Number.isFinite) as number[];
  let temporal_skew_ms: number | undefined;
  if (caps.length >= 2) {
    temporal_skew_ms = Math.max(...caps) - Math.min(...caps);
    if (temporal_skew_ms > skewThreshold) {
      return {
        mode: 'tentative',
        reasons: ['temporal_skew_across_snapshots'],
        stale_domains: staleDomains,
        temporal_skew_ms,
        consistency_risk: 'medium',
      };
    }
  }

  if (staleDomains.length > 0) {
    return {
      mode: 'tentative',
      reasons: [`inventory_stale:${staleDomains.join(',')}`],
      stale_domains: staleDomains,
      ...(temporal_skew_ms !== undefined ? { temporal_skew_ms } : {}),
      consistency_risk: 'medium',
    };
  }

  return {
    mode: 'safe',
    reasons: [],
    stale_domains: [],
    ...(temporal_skew_ms !== undefined ? { temporal_skew_ms } : {}),
    consistency_risk: 'low',
  };
}

/**
 * 注入轻量咨询主 prompt：按 mode 约束 LLM 措辞（Runtime → Narrative）。
 */
export function buildNarrativeSafetyPromptLines(safety: NarrativeSafetyPayload): string[] {
  if (safety.mode === 'safe') {
    return [];
  }

  const header = '【叙事门控 · Narrative Gate】系统已根据实时库存快照元数据判定本轮输出强度；你必须遵守下列约束（优先级高于一般顾问口吻）：';

  if (safety.mode === 'refresh_required') {
    return [
      header,
      '**等级：refresh_required（航班/住宿类快照已超过建议新鲜度窗口）**。',
      '你必须明确告知：上文摘录的航班或住宿报价/可订性**可能已不可用**，用户需在预订前**重新检索或刷新**。',
      '**禁止**使用暗示库存仍可用、仍可按摘录执行的措辞，包括但不限于：「仍可订」「已锁定」「保证有位」「舱位/房源仍在」「已协调完成」「一切就绪」。',
      '可概括摘录曾显示的信息作为**历史参考**，并引导用户以预订页或新一轮检索为准。',
    ];
  }

  return [
    header,
    '**等级：tentative（跨域快照时间差较大，和/或非核心域快照已超过建议窗口）**。',
    '正文必须体现**不确定性**：价格、舱位、房源与路况可能已变化；勿做确定性承诺。',
    '**禁止**「已协调完成」「组合已锁定」「无需再确认」等表述。',
    '若引用上文 MCP/Amadeus 摘录，须提示「仅供参考，以实时预订页为准」。',
  ];
}
