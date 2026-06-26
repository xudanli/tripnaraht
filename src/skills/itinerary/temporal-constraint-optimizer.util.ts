/**
 * Temporal Constraint Optimizer — deterministic schedule audit & reschedule.
 * Companion prompt: prompts/skills/时间约束与动线优化.md
 */

import { DateTime } from 'luxon';
import type { Itinerary, ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';

export const DEFAULT_SLEEP_LOCK_START_MIN = 23 * 60; // 23:00
export const DEFAULT_SLEEP_LOCK_END_MIN = 8 * 60; // 08:00
export const DEFAULT_DAY_START_MIN = 8 * 60; // 08:00
export const DEFAULT_DAY_END_MIN = 22 * 60; // 22:00
export const DEFAULT_TRANSFER_BUFFER_MIN = 30;

export const LUNCH_WINDOW = { startMin: 11 * 60 + 30, endMin: 13 * 60 + 30, durationMin: 75 };
export const DINNER_WINDOW = { startMin: 18 * 60, endMin: 20 * 60, durationMin: 90 };

export type TemporalAuditIssueType =
  | 'SLEEP_LOCK_VIOLATION'
  | 'MISSING_MEAL_ANCHOR'
  | 'INSUFFICIENT_TRANSFER_BUFFER'
  | 'OPENING_HOURS_CONFLICT'
  | 'DAY_OVERBOOKED'
  | 'LOW_STAMINA_OVERRUN';

export interface TemporalAuditIssue {
  type: TemporalAuditIssueType;
  severity: 'ERROR' | 'WARNING';
  item_id?: string;
  day?: string;
  message: string;
}

export interface PartyProfile {
  has_elderly?: boolean;
  has_children?: boolean;
  low_stamina?: boolean;
}

export interface PoiConstraint {
  place_id?: string;
  name?: string;
  opening_start_min?: number;
  opening_end_min?: number;
}

export interface EnvironmentContext {
  timezone?: string;
  /** Override sleep lock, e.g. polar night destinations */
  sleep_lock_start_min?: number;
  sleep_lock_end_min?: number;
  daylight_by_date?: Record<string, { sunrise_min?: number; sunset_min?: number }>;
}

export interface TemporalOptimizerInput {
  itinerary: Itinerary;
  poi_constraints?: PoiConstraint[];
  party_profile?: PartyProfile;
  environment_context?: EnvironmentContext;
  /** Adjacent leg travel minutes keyed by `${prevId}->${nextId}` */
  travel_minutes_by_leg?: Record<string, number>;
}

export interface TemporalOptimizerChangelogEntry {
  action: 'RESCHEDULED' | 'REMOVED' | 'INSERTED_MEAL' | 'INSERTED_REST' | 'MOVED_TO_OVERFLOW';
  item_id: string;
  day?: string;
  detail: string;
}

export interface TemporalOptimizerResult {
  itinerary: Itinerary;
  changelog: TemporalOptimizerChangelogEntry[];
  overflow_queue: ItineraryItem[];
  issues: TemporalAuditIssue[];
  /** ReAct: too many core POIs dropped — suggest extending trip */
  needs_regeneration?: {
    reason: string;
    suggested_extra_days?: number;
  };
}

const NIGHT_OVERRIDE_PATTERNS = [
  /\[极光\/星空\]/i,
  /\[午夜航班\]/i,
  /\[跨年\/夜市\]/i,
  /aurora/i,
  /northern.?light/i,
  /midnight.?flight/i,
  /stargaz/i,
  /night.?market/i,
  /极光/,
  /星空/,
  /午夜航班/,
  /跨年/,
  /夜市/,
];

function cloneItinerary(it: Itinerary): Itinerary {
  return {
    ...it,
    days: it.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({
        ...item,
        location_ref: { ...item.location_ref },
        metadata: item.metadata ? { ...item.metadata } : undefined,
        evidence_refs: [...(item.evidence_refs ?? [])],
      })),
    })),
    metadata: it.metadata ? { ...it.metadata } : undefined,
  };
}

function parseHmToMinutes(hm: string): number | undefined {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return undefined;
  return h * 60 + mm;
}

export function parseItemWindowMinutes(
  dayDate: string,
  item: Pick<ItineraryItem, 'start_window' | 'end_window'>,
  timezone = 'UTC',
): { startMin?: number; endMin?: number } {
  const base = DateTime.fromISO(dayDate, { zone: timezone }).startOf('day');

  const toMin = (raw: string | undefined): number | undefined => {
    if (!raw?.trim()) return undefined;
    const s = raw.trim();
    if (s.includes('T')) {
      const dt = DateTime.fromISO(s, { zone: timezone });
      if (!dt.isValid) return undefined;
      return Math.round(dt.diff(base, 'minutes').minutes);
    }
    return parseHmToMinutes(s);
  };

  let startMin = toMin(item.start_window);
  let endMin = toMin(item.end_window);
  // ISO UTC 在本地可能跨日（如 UTC 17:00 → 上海次日 01:00），归一化到当日分钟
  if (startMin != null && startMin >= 24 * 60) startMin = startMin % (24 * 60);
  if (endMin != null && endMin >= 24 * 60) endMin = endMin % (24 * 60);
  if (startMin != null && endMin != null && endMin < startMin) {
    endMin += 24 * 60;
  }
  return { startMin, endMin };
}

export function formatMinutesAsHm(min: number): string {
  const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isInSleepLock(
  minute: number,
  sleepStart = DEFAULT_SLEEP_LOCK_START_MIN,
  sleepEnd = DEFAULT_SLEEP_LOCK_END_MIN,
): boolean {
  const m = ((minute % (24 * 60)) + 24 * 60) % (24 * 60);
  return m >= sleepStart || m < sleepEnd;
}

export function hasNightActivityOverride(item: ItineraryItem): boolean {
  const meta = item.metadata as Record<string, unknown> | undefined;
  const tags = Array.isArray(meta?.tags) ? meta.tags.map(String) : [];
  const parts = [
    item.notes ?? '',
    item.location_ref?.name ?? '',
    ...tags,
    String(meta?.category ?? ''),
    String(meta?.placeholder_reason ?? ''),
  ].join(' ');
  return NIGHT_OVERRIDE_PATTERNS.some((re) => re.test(parts));
}

function isMealItemType(type: ItineraryItem['type'] | string): boolean {
  const t = String(type);
  return t === 'MEAL' || t === 'MEAL_ANCHOR' || t === 'MEAL_FLOATING';
}

function isCoreActivityItemType(type: ItineraryItem['type'] | string): boolean {
  const t = String(type);
  return t === 'POI' || t === 'ACTIVITY';
}

function itemDurationMin(item: ItineraryItem, startMin: number, endMin?: number): number {
  if (endMin != null && endMin > startMin) return endMin - startMin;
  const meta = item.metadata?.duration_minutes;
  if (typeof meta === 'number' && meta > 0) return meta;
  if (item.type === 'MEAL') return 75;
  if (item.type === 'REST') return 45;
  return 90;
}

function itemPriority(item: ItineraryItem): number {
  if (item.type === 'MEAL') return 100;
  if (hasNightActivityOverride(item)) return 95;
  if (item.metadata?.slot_source === 'research_schedule') return 80;
  if (item.type === 'REST' && item.location_ref?.name === '待安排') return 10;
  if (item.type === 'POI') return 60;
  return 40;
}

function poiConstraintForItem(
  item: ItineraryItem,
  constraints: PoiConstraint[],
): PoiConstraint | undefined {
  const pid = item.location_ref?.place_id;
  const name = item.location_ref?.name;
  return constraints.find(
    (c) =>
      (pid && c.place_id && String(c.place_id) === String(pid)) ||
      (name && c.name && c.name === name),
  );
}

function isLowStaminaParty(profile?: PartyProfile): boolean {
  if (!profile) return false;
  return Boolean(profile.low_stamina || profile.has_elderly || profile.has_children);
}

function applyWindowToItem(item: ItineraryItem, startMin: number, durationMin: number): void {
  const endMin = startMin + durationMin;
  item.start_window = formatMinutesAsHm(startMin);
  item.end_window = formatMinutesAsHm(endMin);
  item.metadata = { ...(item.metadata ?? {}), duration_minutes: durationMin, time_source: 'temporal_optimizer' };
}

function hasMealInWindow(items: ItineraryItem[], window: typeof LUNCH_WINDOW, dayDate: string, tz: string): boolean {
  return items.some((it) => {
    if (!isMealItemType(it.type)) return false;
    const { startMin } = parseItemWindowMinutes(dayDate, it, tz);
    return startMin != null && startMin >= window.startMin && startMin <= window.endMin;
  });
}

function buildMealItem(dayDate: string, meal: 'lunch' | 'dinner', requestId: string, dayIndex: number): ItineraryItem {
  const window = meal === 'lunch' ? LUNCH_WINDOW : DINNER_WINDOW;
  return {
    id: `${requestId}_day${dayIndex + 1}_${meal}_anchor`,
    type: 'MEAL',
    start_window: formatMinutesAsHm(window.startMin),
    end_window: formatMinutesAsHm(window.startMin + window.durationMin),
    location_ref: { name: meal === 'lunch' ? '午餐' : '晚餐' },
    evidence_refs: [],
    verified: false,
    verification_status: 'ASSUMPTION',
    metadata: { duration_minutes: window.durationMin, time_source: 'temporal_optimizer', placeholder_reason: 'meal_anchor_inserted' },
  };
}

function auditDay(
  day: ItineraryDay,
  ctx: {
    tz: string;
    sleepStart: number;
    sleepEnd: number;
    poiConstraints: PoiConstraint[];
    travelByLeg: Record<string, number>;
    lowStamina: boolean;
  },
): TemporalAuditIssue[] {
  const issues: TemporalAuditIssue[] = [];
  const items = day.items ?? [];

  if (!hasMealInWindow(items, LUNCH_WINDOW, day.date, ctx.tz)) {
    issues.push({
      type: 'MISSING_MEAL_ANCHOR',
      severity: 'WARNING',
      day: day.date,
      message: `${day.date} 缺少午餐锚点 (11:30-13:30)`,
    });
  }
  if (!hasMealInWindow(items, DINNER_WINDOW, day.date, ctx.tz)) {
    issues.push({
      type: 'MISSING_MEAL_ANCHOR',
      severity: 'WARNING',
      day: day.date,
      message: `${day.date} 缺少晚餐锚点 (18:00-20:00)`,
    });
  }

  let coreActivityMin = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const { startMin, endMin } = parseItemWindowMinutes(day.date, item, ctx.tz);
    if (startMin == null) continue;

    const duration = itemDurationMin(item, startMin, endMin);
    const effectiveEnd = endMin ?? startMin + duration;

    if (!hasNightActivityOverride(item) && (isInSleepLock(startMin, ctx.sleepStart, ctx.sleepEnd) || isInSleepLock(effectiveEnd, ctx.sleepStart, ctx.sleepEnd))) {
      issues.push({
        type: 'SLEEP_LOCK_VIOLATION',
        severity: 'ERROR',
        item_id: item.id,
        day: day.date,
        message: `「${item.location_ref?.name ?? item.id}」落在睡眠锁定期 (23:00-08:00)`,
      });
    }

    const poi = poiConstraintForItem(item, ctx.poiConstraints);
    if (poi?.opening_start_min != null && startMin < poi.opening_start_min) {
      issues.push({
        type: 'OPENING_HOURS_CONFLICT',
        severity: 'ERROR',
        item_id: item.id,
        day: day.date,
        message: `「${item.location_ref?.name ?? item.id}」早于营业时间`,
      });
    }
    if (poi?.opening_end_min != null && effectiveEnd > poi.opening_end_min) {
      issues.push({
        type: 'OPENING_HOURS_CONFLICT',
        severity: 'ERROR',
        item_id: item.id,
        day: day.date,
        message: `「${item.location_ref?.name ?? item.id}」晚于营业时间`,
      });
    }

    if (i > 0) {
      const prev = items[i - 1]!;
      const prevWin = parseItemWindowMinutes(day.date, prev, ctx.tz);
      if (prevWin.startMin != null) {
        const prevEnd = prevWin.endMin ?? prevWin.startMin + itemDurationMin(prev, prevWin.startMin, prevWin.endMin);
        const legKey = `${prev.id}->${item.id}`;
        const travel = ctx.travelByLeg[legKey] ?? 0;
        const requiredGap = DEFAULT_TRANSFER_BUFFER_MIN + travel;
        if (startMin - prevEnd < requiredGap) {
          issues.push({
            type: 'INSUFFICIENT_TRANSFER_BUFFER',
            severity: 'WARNING',
            item_id: item.id,
            day: day.date,
            message: `「${item.location_ref?.name ?? item.id}」与前项间隔不足 ${requiredGap} 分钟`,
          });
        }
      }
    }

    if (isCoreActivityItemType(item.type)) {
      coreActivityMin += duration;
    }
  }

  if (ctx.lowStamina && coreActivityMin > 6 * 60) {
    issues.push({
      type: 'LOW_STAMINA_OVERRUN',
      severity: 'WARNING',
      day: day.date,
      message: `${day.date} 核心活动时间 ${coreActivityMin} 分钟超过低体力人群上限 6 小时`,
    });
  }

  return issues;
}

function rescheduleDay(
  day: ItineraryDay,
  ctx: {
    tz: string;
    sleepStart: number;
    sleepEnd: number;
    travelByLeg: Record<string, number>;
    lowStamina: boolean;
    requestId: string;
    dayIndex: number;
  },
): { day: ItineraryDay; changelog: TemporalOptimizerChangelogEntry[]; overflow: ItineraryItem[] } {
  const changelog: TemporalOptimizerChangelogEntry[] = [];
  const overflow: ItineraryItem[] = [];
  const items = [...(day.items ?? [])].sort((a, b) => {
    const aw = parseItemWindowMinutes(day.date, a, ctx.tz).startMin ?? 24 * 60;
    const bw = parseItemWindowMinutes(day.date, b, ctx.tz).startMin ?? 24 * 60;
    return aw - bw;
  });

  if (!hasMealInWindow(items, LUNCH_WINDOW, day.date, ctx.tz)) {
    const lunch = buildMealItem(day.date, 'lunch', ctx.requestId, ctx.dayIndex);
    items.push(lunch);
    changelog.push({ action: 'INSERTED_MEAL', item_id: lunch.id, day: day.date, detail: '插入午餐锚点 11:30-13:00' });
  }
  if (!hasMealInWindow(items, DINNER_WINDOW, day.date, ctx.tz)) {
    const dinner = buildMealItem(day.date, 'dinner', ctx.requestId, ctx.dayIndex);
    items.push(dinner);
    changelog.push({ action: 'INSERTED_MEAL', item_id: dinner.id, day: day.date, detail: '插入晚餐锚点 18:00-19:30' });
  }

  items.sort((a, b) => {
    const aw = parseItemWindowMinutes(day.date, a, ctx.tz).startMin ?? 24 * 60;
    const bw = parseItemWindowMinutes(day.date, b, ctx.tz).startMin ?? 24 * 60;
    return aw - bw;
  });

  let cursor = DEFAULT_DAY_START_MIN;
  const kept: ItineraryItem[] = [];
  let afternoonRestInserted = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    // 夜间豁免活动：保留原始时间窗，不参与日间 cursor 重排
    if (hasNightActivityOverride(item)) {
      kept.push(item);
      continue;
    }

    const duration = itemDurationMin(
      item,
      parseItemWindowMinutes(day.date, item, ctx.tz).startMin ?? cursor,
      parseItemWindowMinutes(day.date, item, ctx.tz).endMin,
    );

    if (item.type === 'MEAL') {
      const isLunch = item.id.includes('lunch') || item.location_ref?.name === '午餐';
      const anchor = isLunch ? LUNCH_WINDOW.startMin : DINNER_WINDOW.startMin;
      cursor = Math.max(cursor, anchor);
    }

    if (i > 0) {
      const prev = kept[kept.length - 1];
      if (prev) {
        const legKey = `${prev.id}->${item.id}`;
        cursor += (ctx.travelByLeg[legKey] ?? 0) + DEFAULT_TRANSFER_BUFFER_MIN;
      }
    }

    while (isInSleepLock(cursor, ctx.sleepStart, ctx.sleepEnd)) {
      cursor = ctx.sleepEnd;
    }
    if (cursor + duration > DEFAULT_DAY_END_MIN) {
        if (itemPriority(item) < 70) {
          overflow.push(item);
          changelog.push({
            action: 'MOVED_TO_OVERFLOW',
            item_id: item.id,
            day: day.date,
            detail: `当日时间耗尽，移入备选池：${item.location_ref?.name ?? item.id}`,
          });
          continue;
        }
        changelog.push({
          action: 'REMOVED',
          item_id: item.id,
          day: day.date,
          detail: `无法在 22:00 前安排，已移除：${item.location_ref?.name ?? item.id}`,
        });
        continue;
    }

    const oldStart = parseItemWindowMinutes(day.date, item, ctx.tz).startMin;
    applyWindowToItem(item, cursor, duration);
    if (oldStart != null && oldStart !== cursor) {
      changelog.push({
        action: 'RESCHEDULED',
        item_id: item.id,
        day: day.date,
        detail: `${item.location_ref?.name ?? item.id}: ${formatMinutesAsHm(oldStart)} → ${formatMinutesAsHm(cursor)}`,
      });
    }

    kept.push(item);
    cursor += duration;

    if (
      ctx.lowStamina &&
      !afternoonRestInserted &&
      cursor >= 14 * 60 &&
      cursor < 17 * 60 &&
      item.type !== 'MEAL' &&
      item.type !== 'REST'
    ) {
      const rest: ItineraryItem = {
        id: `${ctx.requestId}_day${ctx.dayIndex + 1}_tea_break`,
        type: 'REST',
        start_window: formatMinutesAsHm(cursor),
        end_window: formatMinutesAsHm(cursor + 50),
        location_ref: { name: 'Tea Break / 休息' },
        evidence_refs: [],
        verified: false,
        verification_status: 'ASSUMPTION',
        metadata: { duration_minutes: 50, time_source: 'temporal_optimizer', placeholder_reason: 'low_stamina_afternoon_rest' },
      };
      kept.push(rest);
      changelog.push({ action: 'INSERTED_REST', item_id: rest.id, day: day.date, detail: '低体力人群：插入下午 50 分钟休息' });
      cursor += 50;
      afternoonRestInserted = true;
    }
  }

  if (ctx.lowStamina && !afternoonRestInserted && kept.some((i) => isCoreActivityItemType(i.type))) {
    const rest: ItineraryItem = {
      id: `${ctx.requestId}_day${ctx.dayIndex + 1}_tea_break`,
      type: 'REST',
      start_window: formatMinutesAsHm(14 * 60 + 30),
      end_window: formatMinutesAsHm(14 * 60 + 80),
      location_ref: { name: 'Tea Break / 休息' },
      evidence_refs: [],
      verified: false,
      verification_status: 'ASSUMPTION',
      metadata: { duration_minutes: 50, time_source: 'temporal_optimizer', placeholder_reason: 'low_stamina_afternoon_rest' },
    };
    kept.push(rest);
    changelog.push({ action: 'INSERTED_REST', item_id: rest.id, day: day.date, detail: '低体力人群：插入下午 50 分钟休息' });
  }

  return { day: { ...day, items: kept }, changelog, overflow };
}

/**
 * Audit and reschedule an itinerary to enforce human temporal常识.
 */
export function optimizeTemporalConstraints(input: TemporalOptimizerInput): TemporalOptimizerResult {
  const env = input.environment_context ?? {};
  const tz = env.timezone ?? 'UTC';
  const sleepStart = env.sleep_lock_start_min ?? DEFAULT_SLEEP_LOCK_START_MIN;
  const sleepEnd = env.sleep_lock_end_min ?? DEFAULT_SLEEP_LOCK_END_MIN;
  const lowStamina = isLowStaminaParty(input.party_profile);
  const poiConstraints = input.poi_constraints ?? [];
  const travelByLeg = input.travel_minutes_by_leg ?? {};

  const working = cloneItinerary(input.itinerary);
  const allIssues: TemporalAuditIssue[] = [];
  const allChangelog: TemporalOptimizerChangelogEntry[] = [];
  const overflowQueue: ItineraryItem[] = [];
  let removedCoreCount = 0;

  working.days = working.days.map((day, dayIndex) => {
    allIssues.push(
      ...auditDay(day, { tz, sleepStart, sleepEnd, poiConstraints, travelByLeg, lowStamina }),
    );
    const { day: optimized, changelog, overflow } = rescheduleDay(day, {
      tz,
      sleepStart,
      sleepEnd,
      travelByLeg,
      lowStamina,
      requestId: working.request_id,
      dayIndex,
    });
    allChangelog.push(...changelog);
    overflowQueue.push(...overflow);
    removedCoreCount += changelog.filter((c) => c.action === 'MOVED_TO_OVERFLOW' || c.action === 'REMOVED').length;
    return optimized;
  });

  let needs_regeneration: TemporalOptimizerResult['needs_regeneration'];
  const totalItems = input.itinerary.days.reduce((n, d) => n + (d.items?.length ?? 0), 0);
  if (removedCoreCount >= 2 && removedCoreCount / Math.max(totalItems, 1) >= 0.3) {
    needs_regeneration = {
      reason: `重排后 ${removedCoreCount} 个核心景点无法纳入当日时间轴，建议延长行程`,
      suggested_extra_days: 1,
    };
  }

  return {
    itinerary: working,
    changelog: allChangelog,
    overflow_queue: overflowQueue,
    issues: allIssues,
    needs_regeneration,
  };
}
