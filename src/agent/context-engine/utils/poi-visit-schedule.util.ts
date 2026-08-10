/**
 * POI 访问时长 / 时间窗解析：优先证据字段与类目默认，避免生成器写死 120 分钟。
 */

export type VisitTimeSource = 'poi_evidence' | 'opening_hours_evidence' | 'heuristic';
export type VisitDurationSource =
  | 'poi_field'
  | 'window'
  | 'category'
  | 'default';

const DEFAULT_VISIT_MINUTES = 90;
const MIN_VISIT_MINUTES = 30;
const MAX_VISIT_MINUTES = 480;

/** 类目 → 建议停留（分钟）；未命中走 DEFAULT */
const CATEGORY_VISIT_MINUTES: Array<{ re: RegExp; minutes: number }> = [
  { re: /restaurant|dining|cafe|coffee|用餐|餐厅|美食|咖啡/i, minutes: 75 },
  { re: /museum|gallery|博物馆|美术馆/i, minutes: 120 },
  { re: /hot[\s_-]*spring|hotspring|spa|温泉|蓝湖|blue\s*lagoon/i, minutes: 150 },
  { re: /waterfall|foss|瀑布/i, minutes: 60 },
  { re: /viewpoint|scenic|观景|观景台/i, minutes: 45 },
  { re: /hike|hiking|trail|trek|徒步|步道/i, minutes: 180 },
  { re: /glacier|ice\s*cave|冰川|冰洞/i, minutes: 150 },
  { re: /beach|海岸|沙滩/i, minutes: 60 },
  { re: /church|cathedral|教堂/i, minutes: 45 },
  { re: /park|花园|公园/i, minutes: 90 },
  { re: /airport|transit|transfer|机场|转机/i, minutes: 60 },
];

function clampMinutes(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VISIT_MINUTES;
  return Math.min(MAX_VISIT_MINUTES, Math.max(MIN_VISIT_MINUTES, Math.round(n)));
}

function firstPositiveNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** 解析「半天 / 2小时 / 90min」等文案 */
export function parseVisitDurationLabel(raw: string | null | undefined): number | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const str = raw.trim().toLowerCase();
  if (!str) return undefined;
  if (/半天|half\s*day/.test(str)) return 240;
  if (/全天|full\s*day|一天/.test(str)) return 480;

  const hour = str.match(
    /约?\s*(\d+(?:\.\d+)?)\s*(?:-|–|~|至|到)?\s*(\d+(?:\.\d+)?)?\s*(?:小时|hours?|hrs?|h)(?![a-z])/i,
  );
  if (hour) {
    const a = parseFloat(hour[1]!);
    const b = hour[2] ? parseFloat(hour[2]) : a;
    if (Number.isFinite(a)) return clampMinutes(((a + (Number.isFinite(b) ? b : a)) / 2) * 60);
  }

  const min = str.match(/约?\s*(\d+)\s*(?:-|–|~)?\s*(\d+)?\s*(?:分钟|minutes?|mins?|min)(?![a-z])/i);
  if (min) {
    const a = parseFloat(min[1]!);
    const b = min[2] ? parseFloat(min[2]) : a;
    if (Number.isFinite(a)) return clampMinutes((a + (Number.isFinite(b) ? b : a)) / 2);
  }

  return undefined;
}

function categoryBlob(poi: any): string {
  const parts = [
    poi?.category,
    poi?.categories,
    poi?.type,
    poi?.subCategory,
    poi?.sub_category,
    poi?.tags,
    poi?.name,
    poi?.nameCN,
    poi?.nameEN,
    poi?.metadata?.category,
    poi?.metadata?.subCategory,
  ];
  return parts
    .flatMap((x) => (Array.isArray(x) ? x : [x]))
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

export function resolveCategoryVisitMinutes(poi: any): number | undefined {
  const blob = categoryBlob(poi);
  if (!blob) return undefined;
  for (const row of CATEGORY_VISIT_MINUTES) {
    if (row.re.test(blob)) return row.minutes;
  }
  return undefined;
}

function minutesBetweenHhmm(start: string, end: string): number | undefined {
  const parse = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = parse(start);
  const b = parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return undefined;
  return clampMinutes(b - a);
}

/**
 * 解析访问时长（分钟）。
 * 优先级：显式字段 → 已定时间窗差 → 类目默认 → 90 分钟兜底。
 */
export function resolvePoiVisitDurationMinutes(
  poi: any,
  opts?: { startTime?: string; endTime?: string },
): { minutes: number; source: VisitDurationSource } {
  const meta = poi?.metadata && typeof poi.metadata === 'object' ? poi.metadata : {};
  const fromField = firstPositiveNumber(
    poi?.duration_minutes,
    poi?.durationMinutes,
    poi?.visit_duration_minutes,
    poi?.visitDurationMinutes,
    poi?.estimated_duration_min,
    poi?.estimatedDurationMin,
    poi?.avgVisitDuration,
    meta.duration_minutes,
    meta.estimated_duration_min,
    meta.visit_duration_minutes,
  );
  if (fromField != null) {
    return { minutes: clampMinutes(fromField), source: 'poi_field' };
  }

  const fromLabel = parseVisitDurationLabel(
    poi?.visitDuration ?? poi?.visit_duration ?? meta.visitDuration ?? meta.visit_duration,
  );
  if (fromLabel != null) {
    return { minutes: fromLabel, source: 'poi_field' };
  }

  if (opts?.startTime && opts?.endTime) {
    const fromWindow = minutesBetweenHhmm(opts.startTime, opts.endTime);
    if (fromWindow != null) {
      return { minutes: fromWindow, source: 'window' };
    }
  }

  const fromCategory = resolveCategoryVisitMinutes(poi);
  if (fromCategory != null) {
    return { minutes: fromCategory, source: 'category' };
  }

  return { minutes: DEFAULT_VISIT_MINUTES, source: 'default' };
}

export function normalizeHhMm(s: string): string {
  const m = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(s ?? '').trim();
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

export function tryNormalizeHhmmPair(open: string, close: string): [string, string] | null {
  const a = normalizeHhMm(open);
  const b = normalizeHhMm(close);
  if (/^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b)) return [a, b];
  return null;
}

export function parseHhmmRangeFromString(s: string): [string, string] | null {
  const m = String(s ?? '').match(/(\d{1,2}:\d{2})\s*[-–~至到]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  return tryNormalizeHhmmPair(m[1]!, m[2]!);
}

function parseToMinutes(t: string): number {
  const [h, mi] = t.split(':').map((x) => Number(x));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(mi) ? mi : 0);
}

function formatMinutesAsHhmm(total: number): string {
  const clipped = Math.min(Math.max(total, 0), 22 * 60);
  const h = Math.floor(clipped / 60);
  const mi = clipped % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** 开放时间内裁剪访问结束：默认不超过 durationMinutes，且不晚于 22:00 / close */
export function clipVisitEnd(open: string, close: string, durationMinutes = DEFAULT_VISIT_MINUTES): string {
  let startM = parseToMinutes(open);
  let closeM = parseToMinutes(close);
  const dur = clampMinutes(durationMinutes);
  if (!Number.isFinite(startM)) startM = 9 * 60;
  if (!Number.isFinite(closeM)) closeM = startM + dur;
  if (closeM <= startM) closeM = startM + dur;
  let endM = startM + dur;
  endM = Math.min(endM, closeM, 22 * 60);
  if (endM <= startM) endM = Math.min(startM + MIN_VISIT_MINUTES, 22 * 60);
  return formatMinutesAsHhmm(endM);
}

export function tryHhmmFromPoi(poi: any): [string, string] | null {
  const tw = poi?.time_window ?? poi?.visit_window;
  if (tw && typeof tw === 'object') {
    const a = tw.start ?? tw.start_time ?? tw.begin;
    const b = tw.end ?? tw.end_time;
    if (typeof a === 'string' && typeof b === 'string') {
      const p = tryNormalizeHhmmPair(a.trim(), b.trim());
      if (p) return p;
    }
  }
  if (typeof poi?.start_window === 'string' && typeof poi?.end_window === 'string') {
    return tryNormalizeHhmmPair(poi.start_window.trim(), poi.end_window.trim());
  }
  if (typeof poi?.visit_start === 'string' && typeof poi?.visit_end === 'string') {
    return tryNormalizeHhmmPair(poi.visit_start.trim(), poi.visit_end.trim());
  }
  return null;
}

export function buildOpeningHoursByPoiId(
  research_data?: Record<string, any>,
): Map<string, { open: string; close: string }> {
  const map = new Map<string, { open: string; close: string }>();
  if (!research_data) return map;
  const raw = research_data.opening_hours_evidence;
  const rows: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.opening_hours)
      ? raw.opening_hours
      : [];
  for (const r of rows) {
    if (!r || r.missing) continue;
    const id = String(r.poi_id ?? r.place_id ?? '').trim();
    if (!id) continue;
    let open = typeof r.open_time === 'string' ? r.open_time.trim() : '';
    let close = typeof r.close_time === 'string' ? r.close_time.trim() : '';
    if ((!open || !close) && typeof r.opening_hours === 'string') {
      const pair = parseHhmmRangeFromString(r.opening_hours);
      if (pair) {
        open = pair[0];
        close = pair[1];
      }
    }
    const no = tryNormalizeHhmmPair(open, close);
    if (no) map.set(id, { open: no[0], close: no[1] });
  }
  return map;
}

const TRANSIT_BUFFER_MINUTES = 15;
const DAY_START_MINUTES = 9 * 60;

/**
 * 解析单槽时间窗；启发式路径按「当日累计起点 + 时长」铺排，避免固定 2h 步进。
 */
export function resolvePoiVisitWindow(args: {
  poi: any;
  slotIndex: number;
  poiId: string;
  openingHoursByPoi: Map<string, { open: string; close: string }>;
  /** 当日已占用到的分钟（含缓冲），启发式路径使用 */
  dayCursorMinutes?: number;
}): {
  startTime: string;
  endTime: string;
  timeSource: VisitTimeSource;
  durationMinutes: number;
  durationSource: VisitDurationSource;
  nextDayCursorMinutes: number;
} {
  const { poi, slotIndex, poiId, openingHoursByPoi } = args;
  const cursor =
    typeof args.dayCursorMinutes === 'number' && Number.isFinite(args.dayCursorMinutes)
      ? args.dayCursorMinutes
      : DAY_START_MINUTES + slotIndex * DEFAULT_VISIT_MINUTES;

  const fromPoi = tryHhmmFromPoi(poi);
  if (fromPoi) {
    const dur = resolvePoiVisitDurationMinutes(poi, {
      startTime: fromPoi[0],
      endTime: fromPoi[1],
    });
    const endTime = clipVisitEnd(fromPoi[0], fromPoi[1], dur.minutes);
    const actual = minutesBetweenHhmm(fromPoi[0], endTime) ?? dur.minutes;
    return {
      startTime: fromPoi[0],
      endTime,
      timeSource: 'poi_evidence',
      durationMinutes: actual,
      durationSource: dur.source === 'window' ? 'window' : dur.source,
      nextDayCursorMinutes: parseToMinutes(endTime) + TRANSIT_BUFFER_MINUTES,
    };
  }

  const oh = openingHoursByPoi.get(String(poiId));
  if (oh?.open && oh?.close) {
    const dur = resolvePoiVisitDurationMinutes(poi);
    const startCandidate = Math.max(parseToMinutes(oh.open), cursor);
    const startTime = formatMinutesAsHhmm(Math.min(startCandidate, 20 * 60));
    const endTime = clipVisitEnd(startTime, oh.close, dur.minutes);
    const actual = minutesBetweenHhmm(startTime, endTime) ?? dur.minutes;
    return {
      startTime,
      endTime,
      timeSource: 'opening_hours_evidence',
      durationMinutes: actual,
      durationSource: dur.source,
      nextDayCursorMinutes: parseToMinutes(endTime) + TRANSIT_BUFFER_MINUTES,
    };
  }

  const dur = resolvePoiVisitDurationMinutes(poi);
  const startM = Math.min(Math.max(cursor, 8 * 60), 20 * 60);
  const endM = Math.min(startM + dur.minutes, 22 * 60);
  const startTime = formatMinutesAsHhmm(startM);
  const endTime = formatMinutesAsHhmm(endM);
  return {
    startTime,
    endTime,
    timeSource: 'heuristic',
    durationMinutes: minutesBetweenHhmm(startTime, endTime) ?? dur.minutes,
    durationSource: dur.source,
    nextDayCursorMinutes: endM + TRANSIT_BUFFER_MINUTES,
  };
}
