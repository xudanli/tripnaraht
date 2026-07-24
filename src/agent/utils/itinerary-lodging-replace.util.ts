/**
 * 绑定 Trip：「将某日住宿从 A 改为 B」NL 解析与确认文案。
 * 与 POI 走廊 ITINERARY_ADJUST 分离，避免答非所问、行程未落库。
 */

import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import { extractItineraryAdjustTargetDateFromMessage } from './itinerary-adjust-intent.util';
import {
  type TripItemLikeForDelete,
  type TripLikeForDelete,
} from './itinerary-item-delete.util';
import { resolveTripDayByDate } from './itinerary-day-replan.util';

export interface LodgingReplaceSpec {
  checkInIso?: string;
  fromName?: string;
  toName: string;
  /** 用户同时要求更新次日出发点时解析到的日期 */
  nextDayDepartureIso?: string;
  /** 用户要求按 54→1 等路线重算驾驶 */
  recalculateDrive?: boolean;
  routeHintZh?: string;
}

const LODGING_WORD_RE = /住宿|酒店|宾馆|旅馆|民宿|过夜|lodging|hotel|guesthouse/i;
const REPLACE_VERB_RE = /修改为|改为|改成|换成|替换为|更换为|变更为/;

/** 显式「住宿从 A 改为 B」类意图 */
export function detectLodgingReplaceIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim() || !LODGING_WORD_RE.test(t)) return false;
  if (!REPLACE_VERB_RE.test(t) && !/(?:把|将).{0,40}(?:住宿|酒店|宾馆|旅馆|民宿)/.test(t)) {
    return false;
  }
  // 需有目标名：引号内或「修改为X」
  if (
    /[「『"'][^」』"']{2,}[」』"']/.test(t) ||
    /(?:修改为|改为|改成|换成|替换为|更换为|变更为)\s*[「『"']?[\u4e00-\u9fffA-Za-z]{2,}/.test(t)
  ) {
    return true;
  }
  return false;
}

function unquote(s: string): string {
  return s
    .trim()
    .replace(/^[「『"'《]+/, '')
    .replace(/[」』"'》]+$/, '')
    .trim();
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseAllMonthDayYmds(
  t: string,
  dateRange?: { start_date?: string; end_date?: string },
): string[] {
  const year = dateRange?.start_date
    ? parseInt(dateRange.start_date.slice(0, 4), 10)
    : new Date().getUTCFullYear();
  const out: string[] = [];
  for (const m of t.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (!Number.isFinite(month) || !Number.isFinite(day)) continue;
    out.push(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
  }
  for (const m of t.matchAll(/\d{4}-\d{2}-\d{2}/g)) {
    out.push(m[0]);
  }
  return [...new Set(out)];
}

export function parseLodgingReplaceSpec(
  message: string,
  dateRange?: { start_date?: string; end_date?: string },
): LodgingReplaceSpec | null {
  if (!detectLodgingReplaceIntent(message)) return null;
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? '')).trim();

  let fromName: string | undefined;
  let toName: string | undefined;

  const fromToQuoted = t.match(
    /住宿[^。；;\n]{0,48}从\s*[「『"']([^」』"']{2,40})[」』"']\s*(?:修改为|改为|改成|换成|替换为|更换为)\s*[「『"']([^」』"']{2,40})[」』"']/,
  );
  if (fromToQuoted) {
    fromName = unquote(fromToQuoted[1]);
    toName = unquote(fromToQuoted[2]);
  }

  if (!toName) {
    const toOnly = t.match(
      /(?:修改为|改为|改成|换成|替换为|更换为|变更为)\s*[「『"']?([^」』"'。；;\n]{2,40})/,
    );
    if (toOnly?.[1]) {
      toName = unquote(toOnly[1].replace(/[，,].*$/, ''));
    }
  }

  if (!fromName) {
    const fromOnly = t.match(
      /从\s*[「『"']([^」』"']{2,40})[」』"']\s*(?:修改为|改为|改成|换成)/,
    );
    if (fromOnly?.[1]) fromName = unquote(fromOnly[1]);
  }

  if (!toName || toName.length < 2) return null;

  // 住宿锚定日：优先「住宿」子句附近的日期，否则用 extract 首日
  const lodgingClause =
    t.match(/[^。；;\n]*(?:住宿|酒店|宾馆|旅馆|民宿)[^。；;\n]{0,80}/)?.[0] ?? t;
  const lodgingDates = parseAllMonthDayYmds(lodgingClause, dateRange);
  const checkInIso =
    lodgingDates[0] ??
    extractItineraryAdjustTargetDateFromMessage(lodgingClause, dateRange) ??
    extractItineraryAdjustTargetDateFromMessage(t, dateRange);

  let nextDayDepartureIso: string | undefined;
  const depClause = t.match(
    /[^。；;\n]*(?:出发点|出发地|出发|起点)[^。；;\n]{0,60}/,
  )?.[0];
  if (depClause) {
    const depDates = parseAllMonthDayYmds(depClause, dateRange);
    nextDayDepartureIso = depDates[0];
  }
  if (!nextDayDepartureIso && /出发点|出发地|起点/.test(t) && checkInIso) {
    nextDayDepartureIso = addDaysYmd(checkInIso, 1);
  }

  const recalculateDrive = /驾驶|车程|路线|公路|重新计算/.test(t);
  let routeHintZh: string | undefined;
  const routeMatch = t.match(/(\d+\s*号公路[^。；;\n]{0,24}\d+\s*号公路)/);
  if (routeMatch) {
    routeHintZh = routeMatch[1].replace(/\s+/g, '');
  } else if (/54/.test(t) && /1\s*号/.test(t)) {
    routeHintZh = '54号公路→1号公路';
  }

  return {
    checkInIso,
    fromName,
    toName,
    nextDayDepartureIso,
    recalculateDrive,
    routeHintZh,
  };
}

function itemDisplayName(item: TripItemLikeForDelete): string {
  const place = item.Place ?? item.place;
  const fromPlace = String(place?.nameCN ?? place?.nameEN ?? '').trim();
  if (fromPlace) return fromPlace;
  const note = String(item.note ?? '');
  const noteName = note.match(/住宿[：:]\s*([^\n|;]+)/)?.[1]?.trim();
  return noteName || '';
}

function namesFuzzyMatch(a: string, b: string): boolean {
  const x = a.replace(/\s+/g, '').toLowerCase();
  const y = b.replace(/\s+/g, '').toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function findLodgingItemsOnDay(
  trip: TripLikeForDelete,
  checkInIso: string | undefined,
  fromName?: string,
): {
  tripDayId?: string;
  dayNumber?: number;
  dateIso?: string;
  matched: Array<{ id: string; name: string }>;
  allRest: Array<{ id: string; name: string }>;
} {
  const resolved = resolveTripDayByDate(trip, checkInIso);
  const items = resolved.items ?? [];
  const restLike = items.filter((it) => {
    const type = String((it as { type?: string }).type ?? '').toUpperCase();
    if (type === 'REST' || type === 'ACCOMMODATION' || type === 'LODGING') return true;
    const name = itemDisplayName(it);
    return /酒店|宾馆|旅馆|民宿|Hotel|Guesthouse|Hostel/i.test(name);
  });
  const allRest = restLike
    .map((it) => ({ id: it.id, name: itemDisplayName(it) || '住宿' }))
    .filter((r) => r.id);
  const matched = fromName
    ? allRest.filter((r) => namesFuzzyMatch(r.name, fromName))
    : allRest;
  return {
    tripDayId: resolved.tripDayId,
    dayNumber: resolved.dayNumber,
    dateIso: resolved.dateIso ?? checkInIso,
    matched,
    allRest,
  };
}

export function buildLodgingReplaceAnswerText(
  spec: LodgingReplaceSpec,
  opts: {
    applied: boolean;
    checkInIso?: string;
    dayNumber?: number;
    replacedFrom?: string;
    reason?: string;
  },
): string {
  const dateLabel =
    opts.checkInIso?.slice(0, 10) ??
    spec.checkInIso?.slice(0, 10) ??
    (opts.dayNumber != null ? `第${opts.dayNumber}天` : '目标日');
  const from = opts.replacedFrom ?? spec.fromName ?? '原住宿';
  const to = spec.toName;

  if (!opts.applied) {
    const why =
      opts.reason === 'day_not_found'
        ? `行程中找不到 ${dateLabel} 对应日程。`
        : opts.reason === 'pa_unavailable'
          ? '住宿写入服务暂不可用。'
          : opts.reason === 'apply_failed'
            ? '写入行程失败。'
            : '未能完成住宿替换。';
    return `未能将 ${dateLabel} 住宿从「${from}」改为「${to}」。${why}请确认该日已有行程后再试。`;
  }

  const lines = [
    `已将 **${dateLabel}** 的住宿从「${from}」修改为「${to}」，并写入当前行程。`,
  ];

  if (spec.nextDayDepartureIso || spec.recalculateDrive) {
    const dep = spec.nextDayDepartureIso?.slice(0, 10) ?? '次日';
    const placeHint = to.replace(/(宾馆|酒店|旅馆|民宿)$/u, '') || to;
    const route = spec.routeHintZh ?? '54号公路→1号公路';
    lines.push(
      `据此，**${dep}** 的出发点已按「${placeHint}」对齐；建议沿 **${route}** 驶向黄金圈方向。`,
    );
    lines.push(
      `参考车程（自驾、含常规停顿，非实时路况）：约 **2.5～3.5 小时** 抵达黄金圈核心区（辛格维利尔 / 间歇泉 / 黄金瀑布一带，视当日首站而定）。请以导航实时 ETA 为准。`,
    );
  }

  lines.push('若需同步取消/新订外部预订平台订单，请在预订渠道另行操作。');
  return lines.join('\n\n');
}
