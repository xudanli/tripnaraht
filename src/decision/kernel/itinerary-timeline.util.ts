import type { ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';

export type ParsedWindow = {
  start?: Date;
  end?: Date;
  durationMin?: number;
};

function isIsoLike(s: string): boolean {
  return /\d{4}-\d{2}-\d{2}T/.test(s);
}

function parseHm(hm: string): { h: number; m: number } | undefined {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return undefined;
  return { h, m: mm };
}

export function parseItemWindow(dayDate: string, item: Pick<ItineraryItem, 'start_window' | 'end_window' | 'metadata'>): ParsedWindow {
  const durationMin = typeof item.metadata?.duration_minutes === 'number' ? item.metadata.duration_minutes : undefined;

  const parse = (raw: string | undefined): Date | undefined => {
    if (!raw) return undefined;
    const s = raw.trim();
    if (!s) return undefined;
    if (isIsoLike(s)) {
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d : undefined;
    }
    const hm = parseHm(s);
    if (!hm) return undefined;
    const d = new Date(`${dayDate}T00:00:00.000Z`);
    if (!Number.isFinite(d.getTime())) return undefined;
    d.setUTCHours(hm.h, hm.m, 0, 0);
    return d;
  };

  return {
    start: parse(item.start_window),
    end: parse(item.end_window),
    durationMin,
  };
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function clampMinDuration(type: ItineraryItem['type'] | string | undefined): number {
  const base = String(process.env.DECISION_REPAIR_MIN_DURATION_MIN ?? '');
  const globalMin = base ? Math.max(0, Number(base)) : 30;
  const poiMin = Math.max(globalMin, Math.max(0, Number(process.env.DECISION_REPAIR_MIN_POI_DURATION_MIN ?? 45)));
  const restMin = Math.max(0, Number(process.env.DECISION_REPAIR_MIN_REST_DURATION_MIN ?? 15));
  if (String(type).toUpperCase() === 'POI') return poiMin;
  if (String(type).toUpperCase() === 'MEAL') return Math.max(globalMin, 30);
  if (String(type).toUpperCase() === 'REST') return restMin;
  return globalMin;
}

export type TimelineFeasibilityEscalation =
  | 'DELETE_NODE'
  | 'CHANGE_TRANSPORT'
  | 'SPLIT_DAY'
  /** 日落前无法完成户外段：优先尝试室内外重排 */
  | 'REORDER_OUTDOOR';

export interface TimelineFeasibility {
  status: 'SOLVED' | 'COMPRESSED' | 'LIMIT_REACHED';
  bottleneckNodeId?: string;
  suggestedEscalation?: TimelineFeasibilityEscalation;
  /** 最近一次不可行时，到达时间晚于 end_window 的分钟数（向上取整） */
  conflictOverMin?: number;
  /** LIMIT 时区分「硬时间窗」与「日落可视窗口」 */
  violation?: 'PHYSICAL_WINDOW' | 'SUNSET';
}

/** 注入 solveDayTimeline 的环境光约束（通常来自 DSO.environmentState.daylightByDate） */
export type SolveDayTimelineEnvironment = {
  /** key = day.date；值为日落时刻的 Date 或可解析 ISO 字符串 */
  sunsetByDate?: Record<string, Date | string>;
  /** 官方日落后仍可视的缓冲（默认 30，单位分钟） */
  twilightBufferMin?: number;
};

function parseEnvInstant(v: Date | string | undefined): Date | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : undefined;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : undefined;
}

function sunsetFromEnvironment(dayDate: string, env?: SolveDayTimelineEnvironment): Date | undefined {
  if (!env?.sunsetByDate) return undefined;
  const raw = env.sunsetByDate[dayDate] ?? env.sunsetByDate[String(dayDate).slice(0, 10)];
  return parseEnvInstant(raw);
}

/** 户外自然景观/弱光不可行类节点（无「营业时间」但有可视窗口） */
export function isOutdoorVisibilityConstrainedItem(item: Pick<ItineraryItem, 'type' | 'metadata'>): boolean {
  const meta = item.metadata as Record<string, unknown> | undefined;
  const cat = String(meta?.category ?? meta?.poi_category ?? '').toLowerCase();
  const tags = meta?.tags;
  const tagArr = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : [];
  if (tagArr.some((t) => t.includes('outdoor') || t.includes('nature') || t.includes('scenic'))) return true;
  if (/(nature|scenic|waterfall|beach|glacier|fjord|geyser|volcano|landscape|viewpoint|trail|hiking)/i.test(cat)) return true;
  return false;
}

function effectiveHardEndForItem(
  dayDate: string,
  item: ItineraryItem,
  naturalEnd: Date | undefined,
  env?: SolveDayTimelineEnvironment,
): { hardEnd?: Date; cappedBySunset: boolean } {
  const sunset = sunsetFromEnvironment(dayDate, env);
  const buf = env?.twilightBufferMin ?? 30;
  if (!isOutdoorVisibilityConstrainedItem(item) || !sunset) {
    return { hardEnd: naturalEnd, cappedBySunset: false };
  }
  const visEnd = addMinutes(sunset, buf);
  if (!naturalEnd) return { hardEnd: visEnd, cappedBySunset: true };
  return naturalEnd.getTime() <= visEnd.getTime()
    ? { hardEnd: naturalEnd, cappedBySunset: false }
    : { hardEnd: visEnd, cappedBySunset: true };
}

/**
 * Deterministic timeline solver (L2-ready):
 * - propagates arrival times using adjacent ETA
 * - soft-compresses duration when arrival would exceed next end_window
 *
 * Returns a patched copy of the day items (does not mutate input).
 */
export function solveDayTimeline(params: {
  day: ItineraryDay;
  /** Adjacent ETAs in minutes: eta[i] = ETA(item[i] -> item[i+1]) */
  adjacentEtaMin: number[];
  /** 日落/民用暮光：裁剪户外节点的有效结束时刻 */
  environment?: SolveDayTimelineEnvironment;
  /** VERIFY 等场景：仅判定可行性，不写 explain_logs（仍返回 patch day 供试算） */
  dryRun?: boolean;
}): {
  ok: boolean;
  day?: ItineraryDay;
  notes?: string[];
  feasibility: TimelineFeasibility;
  /** 人话解释，供 itinerary.metadata.explain_logs 聚合 */
  explainLogs: string[];
} {
  const { day, adjacentEtaMin, environment: env, dryRun = false } = params;
  const items = day.items ?? [];
  if (!Array.isArray(items) || items.length < 2) return { ok: false, feasibility: { status: 'SOLVED' }, explainLogs: [] };
  if (adjacentEtaMin.length !== items.length - 1) return { ok: false, feasibility: { status: 'SOLVED' }, explainLogs: [] };

  const nextItems: ItineraryItem[] = items.map((it) => ({
    ...it,
    metadata: { ...(it.metadata ?? {}) },
    location_ref: { ...(it.location_ref ?? { name: '' }) },
    evidence_refs: Array.isArray(it.evidence_refs) ? [...it.evidence_refs] : [],
  }));

  const notes: string[] = [];
  const explainLogs: string[] = [];
  let feasibility: TimelineFeasibility = { status: 'SOLVED' };

  const mergeFeasibility = (patch: TimelineFeasibility) => {
    if (feasibility.status === 'LIMIT_REACHED') return;
    if (patch.status === 'LIMIT_REACHED') {
      feasibility = { ...patch };
      return;
    }
    if (patch.status === 'COMPRESSED') {
      feasibility = { ...feasibility, status: 'COMPRESSED' };
    }
  };

  // Initialize cursor time from first start_window; else fall back to day start (08:00Z).
  const w0 = parseItemWindow(day.date, nextItems[0]!);
  let cursor = w0.start ?? new Date(`${day.date}T08:00:00.000Z`);
  if (!Number.isFinite(cursor.getTime())) return { ok: false, feasibility: { status: 'SOLVED' }, explainLogs: [] };

  for (let i = 0; i < nextItems.length - 1; i++) {
    const a = nextItems[i]!;
    const b = nextItems[i + 1]!;
    const wa = parseItemWindow(day.date, a);
    const wb = parseItemWindow(day.date, b);
    const { hardEnd: bHardEnd, cappedBySunset } = effectiveHardEndForItem(String(day.date), b as ItineraryItem, wb.end, env);

    let aDur = wa.durationMin ?? 60;
    const aStart = wa.start ?? cursor;
    let aEnd = wa.end ?? addMinutes(aStart, aDur);
    a.start_window = aStart.toISOString();
    a.end_window = aEnd.toISOString();
    const aMeta = a.metadata ?? {};
    a.metadata = { ...aMeta, duration_minutes: typeof aMeta.duration_minutes === 'number' ? aMeta.duration_minutes : aDur };

    const eta = Math.max(0, adjacentEtaMin[i] ?? 0);
    const departA = (): Date => parseItemWindow(day.date, a).end ?? new Date(a.end_window);
    const arrivalAtB = (): Date => addMinutes(departA(), eta);

    let arrivalB = arrivalAtB();

    // Hard B end（含日落裁剪后的有效结束）
    if (bHardEnd && arrivalB.getTime() > bHardEnd.getTime()) {
      const minA = clampMinDuration(a.type);
      const overMin = Math.ceil((arrivalB.getTime() - bHardEnd.getTime()) / 60_000);
      const maxShrinkA = Math.max(0, aDur - minA);
      const shrinkA = Math.min(maxShrinkA, overMin);
      if (shrinkA > 0) {
        aDur -= shrinkA;
        aEnd = addMinutes(aStart, aDur);
        a.end_window = aEnd.toISOString();
        a.metadata = { ...(a.metadata ?? {}), duration_minutes: aDur };
        notes.push(`compressed:${a.id}:${shrinkA}min`);
        if (!dryRun) {
          explainLogs.push(
            `[逻辑] 压缩了节点「${a.id}」的停留时间（减少 ${shrinkA} 分钟），以便在节点「${b.id}」的结束窗口前抵达。`,
          );
        }
        mergeFeasibility({ status: 'COMPRESSED' });
      }
    }

    arrivalB = arrivalAtB();
    if (bHardEnd && arrivalB.getTime() > bHardEnd.getTime()) {
      const over = Math.ceil((arrivalB.getTime() - bHardEnd.getTime()) / 60_000);
      mergeFeasibility({
        status: 'LIMIT_REACHED',
        bottleneckNodeId: b.id,
        conflictOverMin: over,
        suggestedEscalation: cappedBySunset ? 'REORDER_OUTDOOR' : 'DELETE_NODE',
        violation: cappedBySunset ? 'SUNSET' : 'PHYSICAL_WINDOW',
      });
      notes.push(
        cappedBySunset
          ? `limit_reached:sunset:bottleneck=${b.id}:arrival_after_visibility=${over}min`
          : `limit_reached:bottleneck=${b.id}:arrival_after_end=${over}min`,
      );
      if (cappedBySunset && !dryRun) {
        explainLogs.push(
          `[逻辑] 节点「${b.id}」为户外/自然景观，在日落余辉窗口结束前仍无法抵达；请提前该点或把室内活动挪到日落后。`,
        );
      }
    }

    const bStart = wb.start && wb.start.getTime() > arrivalB.getTime() ? wb.start : arrivalB;
    b.start_window = bStart.toISOString();

    let bDur = wb.durationMin ?? (typeof b.metadata?.duration_minutes === 'number' ? b.metadata.duration_minutes : 60);
    const minB = clampMinDuration(b.type);

    if (bHardEnd) {
      const slotMin = Math.floor((bHardEnd.getTime() - bStart.getTime()) / 60_000);
      if (slotMin < minB) {
        mergeFeasibility({
          status: 'LIMIT_REACHED',
          bottleneckNodeId: b.id,
          conflictOverMin: minB - slotMin,
          suggestedEscalation: cappedBySunset ? 'REORDER_OUTDOOR' : 'DELETE_NODE',
          violation: cappedBySunset ? 'SUNSET' : 'PHYSICAL_WINDOW',
        });
        notes.push(
          cappedBySunset
            ? `limit_reached:sunset:bottleneck=${b.id}:slot_lt_min_duration`
            : `limit_reached:bottleneck=${b.id}:slot_lt_min_duration`,
        );
      } else {
        const prevDur = bDur;
        bDur = Math.min(Math.max(bDur, minB), slotMin);
        if (bDur < prevDur) {
          notes.push(`compressed:${b.id}:${prevDur - bDur}min`);
          if (!dryRun) {
            explainLogs.push(
              `[逻辑] 压缩了节点「${b.id}」的计划停留（从 ${prevDur} 分钟调至 ${bDur} 分钟），以适配闭馆/结束窗口前的剩余空档。`,
            );
          }
          mergeFeasibility({ status: 'COMPRESSED' });
        } else if (bDur > prevDur) {
          notes.push(`expanded:${b.id}:${bDur - prevDur}min`);
        }
        b.metadata = { ...(b.metadata ?? {}), duration_minutes: bDur };
      }
      b.end_window = bHardEnd.toISOString();
    } else {
      b.end_window = addMinutes(bStart, bDur).toISOString();
      b.metadata = { ...(b.metadata ?? {}), duration_minutes: bDur };
    }

    cursor = parseItemWindow(day.date, b).end ?? new Date(b.end_window);
  }

  return { ok: true, day: { ...day, items: nextItems }, notes, feasibility, explainLogs };
}

