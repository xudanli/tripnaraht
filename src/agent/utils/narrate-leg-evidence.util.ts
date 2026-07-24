/**
 * NARRATE 路段证据下沉：坡度 / 步行 / 交通 / 避坑细节 → tips + 结构化 leg cards。
 */

import type { Itinerary, ItineraryItem, OrchestratorState } from '../interfaces/trip-plan.interface';
import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';

export const LEG_EVIDENCE_SCHEMA = 'tripnara.leg_evidence@v1' as const;

export interface LegEvidenceCard {
  schema: typeof LEG_EVIDENCE_SCHEMA;
  leg_id: string;
  day_index: number;
  day_date: string;
  from_label: string;
  to_label: string;
  /** 估算或证据化交通分钟数 */
  eta_minutes?: number;
  distance_meters?: number;
  transport_mode?: 'walk' | 'drive' | 'transit' | 'mixed';
  /** 用户可读一行摘要 */
  summary_zh: string;
  /** 避坑 / 细节要点 */
  pitfall_tips_zh?: string[];
  severity?: 'info' | 'warn';
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function itemCoords(item: ItineraryItem): { lat: number; lng: number } | undefined {
  const c = item.location_ref?.coordinates;
  if (c && typeof c.lat === 'number' && typeof c.lng === 'number') return c;
  const end = item.metadata?.endLocation;
  if (end && typeof end.lat === 'number' && typeof end.lng === 'number') return end;
  return undefined;
}

function itemLabel(item: ItineraryItem): string {
  return item.location_ref?.name?.trim() || String(item.type ?? '活动');
}

function inferTransportMode(from: ItineraryItem, to: ItineraryItem, distanceM: number): LegEvidenceCard['transport_mode'] {
  if (from.type === 'DRIVE' || to.type === 'DRIVE') return 'drive';
  if (from.type === 'TRANSIT' || to.type === 'TRANSIT') return 'transit';
  if (from.type === 'WALK' || to.type === 'WALK' || distanceM < 2500) return 'walk';
  return 'mixed';
}

function readSlopePct(item: ItineraryItem): number | undefined {
  const meta = item.metadata as Record<string, unknown> | undefined;
  const slope = meta?.max_slope_pct ?? meta?.slope_pct ?? meta?.maxSlopePct;
  return typeof slope === 'number' && Number.isFinite(slope) ? slope : undefined;
}

function readEtaMinutes(from: ItineraryItem, to: ItineraryItem): number | undefined {
  const meta = (to.metadata ?? from.metadata) as Record<string, unknown> | undefined;
  const eta =
    meta?.route_eta_minutes ??
    meta?.eta_minutes ??
    meta?.transport_minutes ??
    meta?.duration_minutes;
  return typeof eta === 'number' && eta > 0 ? Math.round(eta) : undefined;
}

function buildPitfallTips(input: {
  distanceM: number;
  mode: LegEvidenceCard['transport_mode'];
  slopePct?: number;
  hasElderly: boolean;
  toItem: ItineraryItem;
}): string[] {
  const tips: string[] = [];
  const { distanceM, mode, slopePct, hasElderly, toItem } = input;

  if (mode === 'walk' && hasElderly && distanceM > 800) {
    tips.push(`带长辈出行：此段约 ${Math.round(distanceM)}m，坡度或体力消耗较大，建议打车或缩短步行`);
  } else if (mode === 'walk' && distanceM > 1500) {
    tips.push(`步行约 ${Math.round(distanceM / 100) / 10}km，预留 ${Math.max(15, Math.round(distanceM / 80))} 分钟以上`);
  }

  if (typeof slopePct === 'number' && slopePct >= 8) {
    tips.push(`路段最大坡度约 ${slopePct.toFixed(1)}%，不建议推车或低体能步行`);
  }

  const hours = toItem.metadata?.opening_hours;
  if (typeof hours === 'string' && hours.trim()) {
    tips.push(`目的地开放参考：${hours.trim()}（建议出发前再确认当日特殊闭馆）`);
  }

  if (toItem.notes?.trim()) {
    const note = toItem.notes.trim();
    if (/门|入口|排队|预约|ticket|gate/i.test(note)) {
      tips.push(note.length > 120 ? `${note.slice(0, 117)}…` : note);
    }
  }

  return tips.slice(0, 3);
}

export function buildLegEvidenceCards(
  itinerary: Itinerary,
  ctx?: {
    hasElderly?: boolean;
    explainLogs?: string[];
  },
): LegEvidenceCard[] {
  const cards: LegEvidenceCard[] = [];
  const hasElderly = ctx?.hasElderly === true;

  for (let dayIdx = 0; dayIdx < (itinerary.days?.length ?? 0); dayIdx++) {
    const day = itinerary.days[dayIdx];
    const items = day.items ?? [];
    for (let i = 0; i < items.length - 1; i++) {
      const from = items[i];
      const to = items[i + 1];
      if (from.type === 'REST' || to.type === 'REST') continue;

      const a = itemCoords(from);
      const b = itemCoords(to);
      const distanceM =
        from.metadata?.distance_meters ??
        (a && b ? Math.round(haversineMeters(a, b)) : undefined);
      const mode = inferTransportMode(from, to, distanceM ?? 0);
      const eta = readEtaMinutes(from, to);
      const slopePct = readSlopePct(to) ?? readSlopePct(from);
      const pitfall_tips_zh = buildPitfallTips({
        distanceM: distanceM ?? 0,
        mode,
        slopePct,
        hasElderly,
        toItem: to,
      });

      if (!distanceM && !eta && pitfall_tips_zh.length === 0) continue;

      const modeLabel =
        mode === 'drive' ? '驾车' : mode === 'transit' ? '公共交通' : mode === 'walk' ? '步行' : '接驳';
      const distPart = distanceM ? `${Math.round(distanceM / 100) / 10}km` : '';
      const etaPart = eta ? `约 ${eta} 分钟` : '';
      const summary_zh = [modeLabel, distPart, etaPart].filter(Boolean).join(' · ') || `${itemLabel(from)} → ${itemLabel(to)}`;

      cards.push({
        schema: LEG_EVIDENCE_SCHEMA,
        leg_id: `leg_d${dayIdx + 1}_${from.id}_${to.id}`,
        day_index: dayIdx + 1,
        day_date: day.date,
        from_label: itemLabel(from),
        to_label: itemLabel(to),
        ...(eta != null ? { eta_minutes: eta } : {}),
        ...(distanceM != null ? { distance_meters: distanceM } : {}),
        ...(mode ? { transport_mode: mode } : {}),
        summary_zh,
        ...(pitfall_tips_zh.length ? { pitfall_tips_zh } : {}),
        severity: pitfall_tips_zh.some((t) => /不建议|较大|坡度/.test(t)) ? 'warn' : 'info',
      });
    }
  }

  const explainLogs = ctx?.explainLogs ?? [];
  for (const log of explainLogs.slice(0, 4)) {
    if (typeof log !== 'string' || !/坡|步行|排队|入口|换乘|缓冲/.test(log)) continue;
    cards.push({
      schema: LEG_EVIDENCE_SCHEMA,
      leg_id: `leg_explain_${cards.length}`,
      day_index: 0,
      day_date: '',
      from_label: '行程校验',
      to_label: '系统提示',
      summary_zh: log.slice(0, 200),
      severity: /不可|拒绝|WARN|警告/.test(log) ? 'warn' : 'info',
    });
  }

  return cards.slice(0, 24);
}

export function mergeLegEvidenceIntoNarration(
  narration: NarrationLike,
  itinerary: Itinerary,
  state?: OrchestratorState,
  _dso?: DecisionState,
): NarrationLike {
  const party = (state?.trip_plan_request as { party?: { has_elderly?: boolean } } | undefined)?.party;
  const explainLogs = (itinerary.metadata as Record<string, unknown> | undefined)?.explain_logs as
    | string[]
    | undefined;

  const leg_evidence_cards = buildLegEvidenceCards(itinerary, {
    hasElderly: party?.has_elderly === true,
    explainLogs: Array.isArray(explainLogs) ? explainLogs : undefined,
  });

  if (!leg_evidence_cards.length) return narration;

  let tips = [...(narration.tips ?? [])];
  for (const card of leg_evidence_cards) {
    if (card.severity !== 'warn') continue;
    const line = `[路段提示] ${card.from_label} → ${card.to_label}：${card.pitfall_tips_zh?.[0] ?? card.summary_zh}`;
    if (!tips.some((t) => t.includes(card.from_label) && t.includes(card.to_label))) {
      tips.unshift(line.slice(0, 500));
    }
  }

  if (tips.length > 12) tips = tips.slice(0, 12);

  return {
    ...narration,
    tips,
    leg_evidence_cards,
  };
}
