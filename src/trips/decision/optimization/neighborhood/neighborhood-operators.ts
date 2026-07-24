import type { RoutePlanDraft, RouteSegment } from '../../shared/world-model.types';
import type { ConstraintRelaxation } from '../../../../decision/kernel/decision-state.types';

export interface NeighborhoodVariant {
  id: string;
  plan: RoutePlanDraft;
  summary: string;
  relaxations?: ConstraintRelaxation[];
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function withSegments(plan: RoutePlanDraft, segments: RouteSegment[], idSuffix: string): RoutePlanDraft {
  // Keep stable identity fields; only rewrite segments.
  return { ...(plan as any), segments: segments.map((s, i) => ({ ...(s as any), segmentId: `${(s as any).segmentId ?? 'seg'}-${idSuffix}-${i}` })) };
}

function timeToMinutes(t: string): number {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9 * 60;
  return Math.max(0, Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2])));
}

function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.floor(min)));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Neighborhood operators for CGUS candidate generation.
 * They are intentionally "lightweight" until we have full time-window repair and POI graph edits.
 */
export class NeighborhoodOperators {
  /** Reduce density by keeping every k-th segment (pace down). */
  paceDown(plan: RoutePlanDraft, keepEvery = 2): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const k = clampInt(keepEvery, 2, 4);
    const kept = segs.filter((_, idx) => idx % k === 0);
    const next = withSegments(plan, kept.length > 0 ? kept : segs.slice(0, 1), `pacedown${k}`);
    return {
      id: `pace-down-${k}`,
      plan: next,
      summary: `节奏放缓：保留每 ${k} 个段落中的 1 个以增加余量`,
      relaxations: [
        {
          id: `relax-time-soft-pacedown-${k}`,
          constraintType: 'TIME',
          severity: 'SOFT',
          degree: 0.35,
          reason: '通过降低活动密度来提升时间余量与可行性（软约束口径）',
        },
      ],
    };
  }

  /** Increase density by duplicating first m segments (pace up). */
  paceUp(plan: RoutePlanDraft, duplicateCount = 2): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const m = clampInt(duplicateCount, 1, 3);
    const extra = segs.slice(0, Math.min(m, segs.length)).map((s) => ({ ...(s as any) }));
    const next = withSegments(plan, [...segs, ...extra], `paceup${m}`);
    return {
      id: `pace-up-${m}`,
      plan: next,
      summary: '高密度：增加活动密度（显式承担时间余量风险）',
      relaxations: [
        {
          id: `relax-time-slack-soft-paceup-${m}`,
          constraintType: 'TIME_SLACK_SOFT',
          severity: 'SOFT',
          degree: 0.6,
          reason: '更高活动密度带来更小时间余量（显式承担时间风险）',
        },
      ],
    };
  }

  /** Reduce physical effort by dropping the highest-ascent segments. */
  reduceEffort(plan: RoutePlanDraft, dropRatio = 0.25): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    if (segs.length <= 1) {
      return {
        id: 'reduce-effort-keep',
        plan,
        summary: '降强度：行程过短，保持不变',
      };
    }
    const r = Math.max(0.15, Math.min(0.5, dropRatio));
    const dropN = clampInt(segs.length * r, 1, Math.max(1, segs.length - 1));
    const sorted = [...segs].sort((a, b) => (Number(b.ascentM) || 0) - (Number(a.ascentM) || 0));
    const toDrop = new Set(sorted.slice(0, dropN).map((s) => (s as any).segmentId));
    const kept = segs.filter((s) => !toDrop.has((s as any).segmentId));
    const next = withSegments(plan, kept.length > 0 ? kept : segs.slice(0, 1), `loweff${dropN}`);
    return {
      id: `reduce-effort-${dropN}`,
      plan: next,
      summary: '降强度：删除高爬升段落以降低疲劳风险',
      relaxations: [
        {
          id: `relax-fatigue-soft-loweff-${dropN}`,
          constraintType: 'FATIGUE_THRESHOLD',
          severity: 'SOFT',
          degree: 0.35,
          reason: '通过降低体力强度减少疲劳风险（软约束口径）',
        },
      ],
    };
  }

  /** Reduce overall scale (proxy for budget/time) by truncating tail segments. */
  shrinkScale(plan: RoutePlanDraft, keepRatio = 0.8): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const r = Math.max(0.5, Math.min(0.95, keepRatio));
    const keepN = clampInt(segs.length * r, 1, segs.length);
    const next = withSegments(plan, segs.slice(0, keepN), `shrink${keepN}`);
    return {
      id: `shrink-scale-${keepN}`,
      plan: next,
      summary: '规模收缩：减少段落数量以降低预算/时间风险',
      relaxations: [
        {
          id: `relax-budget-soft-shrink-${keepN}`,
          constraintType: 'BUDGET_LIMIT',
          severity: 'SOFT',
          degree: 0.3,
          reason: '通过缩减行程规模降低预算与时间压力（软约束口径）',
        },
      ],
    };
  }

  /**
   * Spread segments across days to reduce single-day peaks (structural operator).
   * This is a lightweight "balancing" heuristic until we have full calendar/time-slot repair.
   */
  spreadAcrossDays(plan: RoutePlanDraft, targetDays?: number): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    if (segs.length <= 1) {
      return { id: 'spread-days-keep', plan, summary: '摊平日结构：行程过短，保持不变' };
    }
    const currentDays = new Set(segs.map((s) => (s as any).dayIndex ?? 0)).size || 1;
    const days = clampInt(targetDays ?? Math.max(2, currentDays), 2, 7);

    // Round-robin redistribute by original order (stable and cheap).
    const redistributed = segs.map((s, i) => ({ ...(s as any), dayIndex: i % days }));
    const next = withSegments(plan, redistributed as any, `spread${days}`);
    return {
      id: `spread-days-${days}`,
      plan: next,
      summary: `摊平日结构：将段落在 ${days} 天内更均匀分布以降低单日峰值`,
      relaxations: [
        {
          id: `relax-fatigue-soft-spread-${days}`,
          constraintType: 'FATIGUE_THRESHOLD',
          severity: 'SOFT',
          degree: 0.25,
          reason: '通过降低单日峰值负荷来降低疲劳风险（软约束口径）',
        },
      ],
    };
  }

  /**
   * Shift a day's schedule later and re-pack sequentially.
   * Helps TIME_WINDOW_VIOLATION when default slots are too early.
   */
  shiftDayStart(plan: RoutePlanDraft, startTime: string, slotDurationMin = 60): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const baseStart = timeToMinutes(startTime);
    const dur = clampInt(slotDurationMin, 30, 180);

    // Group by dayIndex and set start/end sequentially within each day.
    const byDay = new Map<number, RouteSegment[]>();
    for (const s of segs) {
      const d = (s as any).dayIndex ?? 0;
      const list = byDay.get(d) ?? [];
      list.push(s);
      byDay.set(d, list);
    }

    const rewritten: RouteSegment[] = [];
    for (const [day, list] of byDay.entries()) {
      const sorted = [...list].sort((a, b) => String((a as any).segmentId).localeCompare(String((b as any).segmentId)));
      let cursor = baseStart;
      for (const s of sorted) {
        const md = { ...((s as any).metadata ?? {}) };
        md.startTime = minutesToTime(cursor);
        md.endTime = minutesToTime(cursor + dur);
        cursor += dur;
        rewritten.push({ ...(s as any), dayIndex: day, metadata: md });
      }
    }

    const next = withSegments(plan, rewritten, `shift${startTime.replace(':', '')}`);
    return {
      id: `shift-day-start-${startTime}`,
      plan: next,
      summary: `时间推迟：将每日开始时间调整为 ${startTime} 并顺序重排`,
      relaxations: [
        {
          id: `relax-time-soft-shift-${startTime}`,
          constraintType: 'TIME',
          severity: 'SOFT',
          degree: 0.25,
          reason: '通过推迟开场与顺序重排缓解开放时间窗冲突（软约束口径）',
        },
      ],
    };
  }

  /**
   * Align a specific POI (by poiId) to a given opening window.
   * This targets TIME_WINDOW_VIOLATION when ConstraintChecker provides openingWindows.
   */
  alignPoiToTimeWindow(plan: RoutePlanDraft, poiId: string, windowStart: string, windowEnd: string): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const rewritten = segs.map((s) => {
      const md = { ...((s as any).metadata ?? {}) };
      const pid = md.poiId ?? md.poi_id;
      if (String(pid ?? '') === String(poiId)) {
        md.startTime = windowStart;
        md.endTime = windowEnd;
      }
      return { ...(s as any), metadata: md };
    });
    const next = withSegments(plan, rewritten as any, `align${String(poiId).slice(0, 6)}`);
    return {
      id: `align-window-${poiId}`,
      plan: next,
      summary: `窗口对齐：将活动 ${poiId} 对齐到开放时间 ${windowStart}-${windowEnd}`,
      relaxations: [
        {
          id: `relax-time-soft-align-${poiId}`,
          constraintType: 'TIME',
          severity: 'SOFT',
          degree: 0.1,
          reason: '将活动对齐到开放窗口以消除时间窗硬冲突（软约束口径）',
        },
      ],
    };
  }

  /**
   * Connectivity repair: insert enough buffer by shifting subsequent slots so that
   * availableTime >= travelDurationMinFromPrev (from segment metadata).
   */
  ensureConnectivityBuffer(plan: RoutePlanDraft, bufferMin = 10): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const buf = clampInt(bufferMin, 0, 180);

    // group by day
    const byDay = new Map<number, RouteSegment[]>();
    for (const s of segs) {
      const d = (s as any).dayIndex ?? 0;
      const list = byDay.get(d) ?? [];
      list.push(s);
      byDay.set(d, list);
    }

    const rewritten: RouteSegment[] = [];
    for (const [day, list] of byDay.entries()) {
      const ordered = [...list].sort((a, b) => timeToMinutes(((a as any).metadata ?? {}).startTime) - timeToMinutes(((b as any).metadata ?? {}).startTime));
      let prevEnd = 0;
      let first = true;
      for (const s of ordered) {
        const md = { ...((s as any).metadata ?? {}) };
        const start = timeToMinutes(md.startTime);
        const end = timeToMinutes(md.endTime ?? md.startTime) || start + 60;
        const dur = Math.max(30, end - start);
        const travel = Number(md.travelDurationMinFromPrev ?? 0) || 0;
        let newStart = start;
        if (!first) {
          newStart = Math.max(start, prevEnd + travel + buf);
        }
        const newEnd = newStart + dur;
        md.startTime = minutesToTime(newStart);
        md.endTime = minutesToTime(newEnd);
        rewritten.push({ ...(s as any), dayIndex: day, metadata: md });
        prevEnd = newEnd;
        first = false;
      }
    }

    const next = withSegments(plan, rewritten as any, `conn${buf}`);
    return {
      id: `ensure-connectivity-buffer-${buf}`,
      plan: next,
      summary: `连通性修复：插入缓冲并顺延时间（buffer=${buf}min）`,
      relaxations: [
        {
          id: `relax-connectivity-soft-${buf}`,
          constraintType: 'CONNECTIVITY_INSUFFICIENT_TIME',
          severity: 'SOFT',
          degree: 0.2,
          reason: '通过插入缓冲时间降低连通性不足风险（软约束口径）',
        },
      ],
    };
  }

  /** Swap segments between two day indices (topology neighborhood). */
  swapDaySegments(plan: RoutePlanDraft, dayA: number, dayB: number): NeighborhoodVariant {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const rewritten = segs.map((s) => {
      const d = (s as any).dayIndex ?? 0;
      if (d === dayA) return { ...(s as any), dayIndex: dayB };
      if (d === dayB) return { ...(s as any), dayIndex: dayA };
      return s;
    });
    const next = withSegments(plan, rewritten as any, `swap${dayA}${dayB}`);
    return {
      id: `op-swap-day${dayA}`,
      plan: next,
      summary: `日结构交换：第 ${dayA} 天与第 ${dayB} 天活动对调`,
    };
  }

  generateAll(plan: RoutePlanDraft): NeighborhoodVariant[] {
    const variants: NeighborhoodVariant[] = [{ id: 'base', plan, summary: '原始方案（不做松弛）' }];

    // Parameter grid (lightweight): generate a richer pool, then let adapter select diverse Top-N.
    for (const k of [2, 3, 4]) variants.push(this.paceDown(plan, k));
    for (const m of [1, 2, 3]) variants.push(this.paceUp(plan, m));
    for (const r of [0.2, 0.35, 0.5]) variants.push(this.reduceEffort(plan, r));
    for (const keep of [0.65, 0.8, 0.9]) variants.push(this.shrinkScale(plan, keep));
    for (const d of [2, 3]) variants.push(this.spreadAcrossDays(plan, d));
    for (const t of ['10:00', '11:00']) variants.push(this.shiftDayStart(plan, t, 60));
    for (const b of [10, 20]) variants.push(this.ensureConnectivityBuffer(plan, b));

    const days = new Set(segsDayIndices(plan));
    if (days.has(3)) {
      variants.push(this.swapDaySegments(plan, 3, Math.max(1, [...days].filter((d) => d !== 3)[0] ?? 2)));
    }

    return variants;
  }
}

function segsDayIndices(plan: RoutePlanDraft): number[] {
  const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
  return segs.map((s) => (s as any).dayIndex ?? 0);
}

