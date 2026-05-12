import type { WorldState } from './world-state.types';
import type { WorldEvent } from './world-event.types';
import type { ImpactAnalysisResult } from './impact-analysis.types';
import type { ExtractedPlanSlot } from './plan-slot-extraction';
import { expandAffectedWithDownstream } from './downstream-slots';
import { PLAN_SLOT_ORDER } from './plan-slot-extraction';

function uniqAffected(slots: Array<{ day: number; slot: string }>): Array<{ day: number; slot: string }> {
  const seen = new Set<string>();
  const out: Array<{ day: number; slot: string }> = [];
  for (const s of slots) {
    const k = `${s.day}:${s.slot}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function hasWeatherRisk(tags?: string[]): boolean {
  if (!tags?.length) return false;
  const t = tags.join(',').toLowerCase();
  return t.includes('weather') || t.includes('outdoor') || t.includes('rain');
}

/**
 * 根据事件与当前计划 / 世界状态，输出受影响槽位与严重度（启发式，可换 ML）。
 */
export function analyzeWorldEventImpact(
  event: WorldEvent,
  ctx: {
    planSlots: ExtractedPlanSlot[];
    totalDays: number;
    worldState?: WorldState;
  },
): ImpactAnalysisResult {
  const { planSlots, totalDays, worldState } = ctx;
  const affected: Array<{ day: number; slot: string }> = [];
  const constraintsBroken: string[] = [];

  switch (event.type) {
    case 'POI_CLOSED': {
      const pid = Number(event.payload.placeId);
      if (Number.isFinite(pid)) {
        for (const s of planSlots) {
          if (s.placeId === pid) affected.push({ day: s.day, slot: s.slot });
        }
        constraintsBroken.push('poi_availability');
      }
      break;
    }
    case 'CROWD_SPIKE': {
      const pid = Number(event.payload.placeId);
      if (Number.isFinite(pid)) {
        for (const s of planSlots) {
          if (s.placeId === pid) affected.push({ day: s.day, slot: s.slot });
        }
        constraintsBroken.push('crowd_budget');
      }
      break;
    }
    case 'WEATHER_CHANGE': {
      const condition = String(event.payload.condition ?? '');
      const targetDays = Array.isArray(event.payload.days)
        ? (event.payload.days as number[])
        : event.payload.day != null
          ? [Number(event.payload.day)]
          : [];
      const rainLike = condition === 'rain' || condition === 'storm';
      if (rainLike) {
        if (targetDays.length > 0) {
          for (const s of planSlots) {
            if (targetDays.includes(s.day) && hasWeatherRisk(s.riskTags)) {
              affected.push({ day: s.day, slot: s.slot });
            }
          }
        } else {
          for (const s of planSlots) {
            if (hasWeatherRisk(s.riskTags)) affected.push({ day: s.day, slot: s.slot });
          }
        }
        constraintsBroken.push('weather_exposure');
      }
      break;
    }
    case 'TRANSPORT_DELAY': {
      const fromSlot = String(event.payload.fromSlot ?? 'afternoon');
      const day = event.payload.day != null ? Number(event.payload.day) : undefined;
      if (day != null && Number.isFinite(day)) {
        const idx = PLAN_SLOT_ORDER.indexOf(fromSlot as (typeof PLAN_SLOT_ORDER)[number]);
        const start = idx >= 0 ? idx : 2;
        for (let i = start; i < PLAN_SLOT_ORDER.length; i++) {
          affected.push({ day, slot: PLAN_SLOT_ORDER[i] });
        }
      } else {
        const maxDay = planSlots.length ? Math.max(...planSlots.map((x) => x.day)) : totalDays;
        for (let d = 1; d <= maxDay; d++) {
          affected.push({ day: d, slot: fromSlot });
        }
      }
      constraintsBroken.push('transport_time_budget');
      break;
    }
    case 'USER_INTERRUPT': {
      const fromDay = event.payload.fromDay != null ? Number(event.payload.fromDay) : 1;
      const fromSlot = String(event.payload.fromSlot ?? 'afternoon');
      const idx = PLAN_SLOT_ORDER.indexOf(fromSlot as (typeof PLAN_SLOT_ORDER)[number]);
      const start = idx >= 0 ? idx : 2;
      for (let d = fromDay; d <= totalDays; d++) {
        const siStart = d === fromDay ? start : 0;
        for (let si = siStart; si < PLAN_SLOT_ORDER.length; si++) {
          affected.push({ day: d, slot: PLAN_SLOT_ORDER[si] });
        }
      }
      constraintsBroken.push('user_pace');
      break;
    }
    default:
      break;
  }

  const u = uniqAffected(affected);
  const downstream = expandAffectedWithDownstream(u, totalDays);

  let impactType: ImpactAnalysisResult['impactType'] = 'low';
  if (u.length >= 4 || event.type === 'POI_CLOSED' || event.type === 'USER_INTERRUPT') impactType = 'high';
  else if (u.length >= 2 || event.type === 'TRANSPORT_DELAY') impactType = 'medium';

  const reason =
    event.type === 'POI_CLOSED'
      ? `POI ${event.payload.placeId} 不可用`
      : event.type === 'WEATHER_CHANGE'
        ? `天气变化：${String(event.payload.condition ?? '')}`
        : event.type === 'TRANSPORT_DELAY'
          ? `交通延误：${String(event.payload.lineId ?? '')}`
          : event.type === 'CROWD_SPIKE'
            ? `拥挤激增 place ${event.payload.placeId}`
            : event.type === 'USER_INTERRUPT'
              ? '用户中断 / 节奏调整'
              : '世界事件';

  if (worldState?.poiStatus && event.type === 'POI_CLOSED') {
    const pid = Number(event.payload.placeId);
    if (Number.isFinite(pid) && worldState.poiStatus[pid] === 'closed' && u.length === 0) {
      impactType = 'medium';
    }
  }

  return {
    affectedSlots: u,
    downstreamSlots: downstream,
    impactType,
    reason,
    constraintsBroken: constraintsBroken.length ? constraintsBroken : undefined,
  };
}
