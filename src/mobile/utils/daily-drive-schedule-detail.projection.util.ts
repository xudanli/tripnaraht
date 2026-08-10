/**
 * 今日自驾 — SCHEDULE 详情投影（对齐日程详情页）
 */

import type {
  DailyDriveDetailSeverity,
  DailyDriveScheduleBufferRow,
  DailyDriveScheduleDetailDto,
  DailyDriveScheduleImpactRow,
  DailyDriveScheduleKeyNode,
  DailyDriveScheduleTimelineItem,
  DailyDriveDimensionStatus,
} from '../dto/mobile-daily-drive.types';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

export type ScheduleDetailContext = {
  localDate: string;
  timezone: string;
  tripLabelZh: string;
  dayLabelZh: string;
  contextVersion?: number;
  summaryStatus: DailyDriveDimensionStatus;
  summaryDetailZh: string;
};

function mapStatusToDetailSeverity(
  status: DailyDriveDimensionStatus,
): DailyDriveDetailSeverity {
  if (status === 'BLOCKED') return 'BLOCKED';
  if (status === 'ATTENTION') return 'ATTENTION';
  return 'OK';
}
export type ScheduleDetailItemInput = {
  time?: string;
  endTime?: string;
  title: string;
  status?: string;
  impactNote?: string;
  itemType?: string;
  placeCategory?: string;
  bookingStatus?: string | null;
  travelFromPreviousMin?: number | null;
  note?: string | null;
};

export type ScheduleDetailProjectionInput = {
  items?: ScheduleDetailItemInput[];
  /** 当地「现在」分钟数 0–1439；缺省不按 now 算缓冲 */
  nowMinutes?: number;
  daylightAttention?: boolean;
  delayMin?: number;
  delayMax?: number;
  naraSuggestionZh?: string;
};

function parseHHmmToMinutes(value?: string): number | undefined {
  if (!value) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return undefined;
  return h * 60 + min;
}

function formatHHmm(totalMin: number): string {
  const day = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(day / 60);
  const m = day % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatScheduleDurationZh(totalMin: number): string {
  const n = Math.max(0, Math.round(totalMin));
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

function isLodgingItem(item: ScheduleDetailItemInput): boolean {
  const blob = `${item.title} ${item.note ?? ''} ${item.placeCategory ?? ''}`.toLowerCase();
  return (
    item.placeCategory === 'HOTEL' ||
    /住宿|酒店|民宿|旅馆|hotel|lodge|check.?in|入住/.test(blob)
  );
}

function looksLikeHardWindow(item: ScheduleDetailItemInput): boolean {
  const blob = `${item.title} ${item.note ?? ''}`;
  if (/集合|班次|预约|截止|硬时间|出发前|tour\b|pickup|集合点/i.test(blob)) {
    return true;
  }
  if (item.bookingStatus && /confirm|booked|paid|reserved/i.test(item.bookingStatus)) {
    return true;
  }
  return false;
}

function timelineStatusZh(
  status: DailyDriveScheduleTimelineItem['status'],
): string {
  switch (status) {
    case 'done':
      return '已完成';
    case 'current':
      return '进行中';
    case 'hard_window':
      return '硬时间窗';
    case 'delayed':
      return '延误';
    case 'risk':
      return '风险';
    default:
      return '待进行';
  }
}

function mapItemStatus(
  raw?: string,
  hard?: boolean,
): DailyDriveScheduleTimelineItem['status'] {
  if (hard) return 'hard_window';
  if (raw === 'completed') return 'done';
  if (raw === 'inProgress') return 'current';
  if (raw === 'delayed') return 'delayed';
  if (raw === 'risk') return 'risk';
  return 'upcoming';
}

function timeLabel(item: ScheduleDetailItemInput): string {
  const start = item.time;
  const end = item.endTime;
  if (start && end && start !== end) {
    const a = parseHHmmToMinutes(start);
    const b = parseHHmmToMinutes(end);
    if (a != null && b != null && b - a >= 30) {
      return `${start}-${end}`;
    }
  }
  return start ?? '—';
}

function pickHardWindowIndex(items: ScheduleDetailItemInput[]): number {
  const hardIdx = items.findIndex(
    (i) =>
      looksLikeHardWindow(i) &&
      i.status !== 'completed' &&
      i.status !== 'done',
  );
  if (hardIdx >= 0) return hardIdx;
  // 回退：下一个未完成的非住宿项（用于关键节点文案，不一定高亮为硬窗）
  return items.findIndex(
    (i) =>
      !isLodgingItem(i) &&
      i.status !== 'completed' &&
      i.status !== 'done',
  );
}

function computeOverallSlackMin(items: ScheduleDetailItemInput[]): number {
  let slack = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i]!;
    const next = items[i + 1]!;
    const end =
      parseHHmmToMinutes(cur.endTime) ?? parseHHmmToMinutes(cur.time);
    const start = parseHHmmToMinutes(next.time);
    if (end == null || start == null) continue;
    const travel = next.travelFromPreviousMin ?? 0;
    slack += Math.max(0, start - end - travel);
  }
  return Math.round(slack);
}

function resolveSelfCheckInZh(hotel?: ScheduleDetailItemInput): string {
  if (!hotel) return '待确认';
  const blob = `${hotel.note ?? ''} ${hotel.title}`;
  if (/自助|self.?check.?in|钥匙盒|密码锁/i.test(blob)) return '有';
  if (/前台|接待|check.?in.?desk/i.test(blob)) return '无';
  return '待确认';
}

function buildNaraSuggestion(opts: {
  overallBufferMin: number;
  delayMax: number;
  hardTitle?: string;
  override?: string;
}): string {
  if (opts.override?.trim()) return opts.override.trim();
  const squeeze = Math.max(10, opts.delayMax - opts.overallBufferMin + 5);
  if (opts.overallBufferMin < opts.delayMax) {
    return `建议将其中一个拍照点压缩 ${squeeze} 分钟，并准时离开停车场。`;
  }
  if (opts.overallBufferMin < 45) {
    return opts.hardTitle
      ? `建议保留当前缓冲，准时前往「${opts.hardTitle}」。`
      : '建议保留当前缓冲，准时离开停车场。';
  }
  return '今日节奏宽松，可按计划推进；留意硬时间窗前留足停车与步行时间。';
}

function heroTitle(
  severity: DailyDriveDetailSeverity,
  executableOk: boolean,
): string {
  if (severity === 'BLOCKED' || !executableOk) return '建议先调整今日节奏';
  if (severity === 'ATTENTION' || severity === 'CAUTION') {
    return '今天仍可推进，但需压缩停留';
  }
  return '今天仍可按计划推进';
}

/**
 * 投影日程详情（截图：时间线 / 缓冲 / 影响 / NARA / 关键节点）。
 */
export function projectScheduleDetailRich(
  ctx: ScheduleDetailContext,
  input: ScheduleDetailProjectionInput,
): DailyDriveScheduleDetailDto {
  const items = (input.items ?? []).slice(0, 16);
  const delayMin = Math.max(0, input.delayMin ?? 0);
  const delayMax = Math.max(delayMin, input.delayMax ?? delayMin);
  const hardIdx = pickHardWindowIndex(items);
  const hardItem = hardIdx >= 0 ? items[hardIdx] : undefined;
  const hotel = items.find(isLodgingItem);

  const timeline: DailyDriveScheduleTimelineItem[] = items.map((i, idx) => {
    const explicitHard = looksLikeHardWindow(i) && i.status !== 'completed';
    const isHardWindow = explicitHard && idx === hardIdx;
    // 回退硬窗（下一未完成项）只用于 keyNodes/hero，时间线保持原状态
    const status = mapItemStatus(i.status, isHardWindow);
    return {
      timeZh: timeLabel(i),
      titleZh: i.title,
      status,
      statusZh: timelineStatusZh(status),
      isHardWindow: isHardWindow || undefined,
    };
  });

  const overallSlack = computeOverallSlackMin(items);
  const overallBufferMin = Math.max(0, overallSlack - Math.round((delayMin + delayMax) / 2));
  // 若无间隙数据，用启发式：延误带反推 + 默认 35
  const overallDisplay =
    overallSlack > 0
      ? overallBufferMin > 0
        ? overallBufferMin
        : Math.max(10, 35 - Math.round((delayMin + delayMax) / 2))
      : Math.max(15, 35 - Math.round((delayMin + delayMax) / 4));

  const nextUpcoming = items.find(
    (i) =>
      i.status === 'upcoming' ||
      i.status === 'inProgress' ||
      i.status === 'delayed' ||
      i.status === 'risk',
  );
  const now = input.nowMinutes;
  let toNextMin: number | undefined;
  let toCheckInMin: number | undefined;
  if (now != null) {
    const nextStart = parseHHmmToMinutes(nextUpcoming?.time);
    if (nextStart != null) toNextMin = Math.max(0, nextStart - now);
    const hotelStart = parseHHmmToMinutes(hotel?.time);
    if (hotelStart != null) toCheckInMin = Math.max(0, hotelStart - now);
  }
  if (toNextMin == null && nextUpcoming?.time && hardItem?.time) {
    const a = parseHHmmToMinutes(nextUpcoming.time);
    const b = parseHHmmToMinutes(hardItem.time);
    if (a != null && b != null && b > a) toNextMin = Math.max(10, Math.round((b - a) * 0.35));
  }
  if (toNextMin == null) toNextMin = Math.min(overallDisplay, 20);
  if (toCheckInMin == null) {
    const hotelStart = parseHHmmToMinutes(hotel?.time);
    const hardStart = parseHHmmToMinutes(hardItem?.time);
    if (hotelStart != null && hardStart != null && hotelStart > hardStart) {
      toCheckInMin = hotelStart - hardStart + overallDisplay;
    } else {
      toCheckInMin = Math.max(toNextMin + 40, 100);
    }
  }

  const buffers: DailyDriveScheduleBufferRow[] = [
    {
      id: 'OVERALL',
      labelZh: '整体缓冲',
      valueZh: formatScheduleDurationZh(overallDisplay),
      tone: overallDisplay >= 30 ? 'OK' : overallDisplay >= 15 ? 'ATTENTION' : 'ATTENTION',
    },
    {
      id: 'TO_NEXT',
      labelZh: '到下一个活动',
      valueZh: formatScheduleDurationZh(toNextMin),
      tone: 'NEUTRAL',
    },
    {
      id: 'TO_CHECKIN',
      labelZh: '到酒店入住',
      valueZh: formatScheduleDurationZh(toCheckInMin),
      tone: 'NEUTRAL',
    },
  ];

  const delayLo = delayMax > 0 ? delayMin || Math.max(10, Math.round(delayMax * 0.5)) : 0;
  const delayHi = delayMax > 0 ? delayMax : 0;
  const hasDelay = delayHi > 0;
  const daylightAttention = !!input.daylightAttention;
  const executableOk = overallDisplay >= (delayLo || 0);

  const impacts: DailyDriveScheduleImpactRow[] = [
    {
      id: 'DRIVE_DELAY',
      titleZh: '预计驾驶延误',
      detailZh: hasDelay ? `${delayLo}-${delayHi} 分钟` : '暂无显著延误',
      status: hasDelay ? 'ATTENTION' : 'OK',
      statusZh: hasDelay ? `${delayLo}-${delayHi} 分钟` : '正常',
    },
    {
      id: 'DAYLIGHT',
      titleZh: '日照减少',
      detailZh: daylightAttention ? '日落偏早，夜间驾驶风险上升' : '日照条件可接受',
      status: daylightAttention ? 'ATTENTION' : 'OK',
      statusZh: daylightAttention ? '注意' : 'OK',
    },
    {
      id: 'EXECUTABLE',
      titleZh: '仍可按计划执行',
      detailZh: executableOk ? '缓冲足以吸收当前延误' : '缓冲偏紧，建议压缩停留',
      status: executableOk ? 'OK' : 'ATTENTION',
      statusZh: executableOk ? 'OK' : '紧张',
    },
  ];

  // 到达窗：硬窗前一站或硬窗本身前推
  const anchorBeforeHard =
    hardIdx > 0 ? items[hardIdx - 1] : nextUpcoming ?? hardItem;
  const anchorMin =
    parseHHmmToMinutes(anchorBeforeHard?.endTime) ??
    parseHHmmToMinutes(anchorBeforeHard?.time) ??
    parseHHmmToMinutes(hardItem?.time);
  let arrivalWindowZh: string | undefined;
  if (anchorMin != null) {
    const pad = hasDelay ? Math.max(10, Math.round(delayHi / 2)) : 10;
    const center = hasDelay ? anchorMin + Math.round((delayLo + delayHi) / 2) : anchorMin;
    arrivalWindowZh = `${formatHHmm(center - pad)}-${formatHHmm(center + pad)}`;
  }

  const hardTime = hardItem?.time ?? '—';
  const hardTitle = hardItem?.title ?? '硬时间窗';
  const hardLabelZh = hardItem
    ? `${hardTime} ${hardTitle}`
    : '暂无';
  const checkInTime = hotel?.time ?? '待确认';
  const selfCheckInZh = resolveSelfCheckInZh(hotel);

  const keyNodes: DailyDriveScheduleKeyNode[] = [
    {
      id: 'NEXT_HARD_WINDOW',
      labelZh: '下一个硬时间窗',
      valueZh: hardLabelZh,
      tone: hardItem ? 'ATTENTION' : 'NEUTRAL',
    },
    {
      id: 'HOTEL_CHECKIN',
      labelZh: '酒店入住时间',
      valueZh: checkInTime,
      tone: 'NEUTRAL',
    },
    {
      id: 'SELF_CHECKIN',
      labelZh: '是否有自助入住',
      valueZh: selfCheckInZh,
      tone: selfCheckInZh === '有' ? 'OK' : 'NEUTRAL',
    },
  ];

  let severity: DailyDriveDetailSeverity = mapStatusToDetailSeverity(
    ctx.summaryStatus as DailyDriveDimensionStatus,
  );
  if (!executableOk || (hasDelay && overallDisplay < delayHi)) {
    severity = severity === 'BLOCKED' ? 'BLOCKED' : 'ATTENTION';
  }

  const naraSuggestionZh = buildNaraSuggestion({
    overallBufferMin: overallDisplay,
    delayMax: delayHi || 20,
    hardTitle: hardItem?.title,
    override: input.naraSuggestionZh,
  });

  const titleZh = heroTitle(severity, executableOk);
  const detailZh = arrivalWindowZh
    ? `当前预计到达 ${arrivalWindowZh}`
    : ctx.summaryDetailZh || '今日日程';
  const metaZh = hardItem
    ? `下一个硬时间窗：${hardTime} ${/集合/.test(hardTitle) ? hardTitle.replace(/^.*?(集合)/, '集合') : hardTitle}`
    : undefined;

  // 简化 meta：与截图「18:10 集合」一致
  const metaShort = hardItem
    ? `下一个硬时间窗：${hardTime}${/集合/.test(hardTitle) ? ' 集合' : ` ${hardTitle}`}`
    : undefined;

  return {
    schemaId: DAILY_DRIVE_DIMENSION_SCHEMA_IDS.SCHEDULE,
    localDate: ctx.localDate,
    timezone: ctx.timezone,
    contextVersion: ctx.contextVersion,
    context: {
      tripLabelZh: ctx.tripLabelZh,
      dayLabelZh: ctx.dayLabelZh,
    },
    hero: {
      titleZh,
      detailZh,
      metaZh: metaShort ?? metaZh,
      severity,
      iconHint: 'calendar',
    },
    primaryAction: { labelZh: '调整今日行程', action: 'ADJUST_TODAY' },
    arrivalWindowZh,
    timeline: timeline.length
      ? timeline
      : [{ timeZh: '—', titleZh: '暂无今日行程项', status: 'upcoming', statusZh: '待进行' }],
    buffers,
    impacts,
    naraSuggestionZh,
    keyNodes,
  };
}
