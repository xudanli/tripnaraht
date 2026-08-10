/**
 * 今日自驾 — DAYLIGHT 日照详情投影（对齐截图）
 */

import type {
  DailyDriveDaylightBand,
  DailyDriveDaylightDetailDto,
  DailyDriveDaylightItineraryLink,
  DailyDriveDaylightTimelineMarker,
  DailyDriveDetailSeverity,
  DailyDriveDimensionStatus,
  DailyDriveItineraryDaylightStatus,
} from '../dto/mobile-daily-drive.types';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

export type DaylightDetailContext = {
  localDate: string;
  timezone: string;
  tripLabelZh: string;
  dayLabelZh: string;
  contextVersion?: number;
  summaryStatus: DailyDriveDimensionStatus;
  summaryDetailZh: string;
};

export type DaylightDetailItemInput = {
  time?: string;
  endTime?: string;
  title: string;
  status?: string;
  placeCategory?: string;
  note?: string | null;
};

export type DaylightDetailProjectionInput = {
  sunriseLabel?: string;
  sunsetLabel?: string;
  dawnLabel?: string;
  duskLabel?: string;
  sunriseMinutes?: number;
  sunsetMinutes?: number;
  dawnMinutes?: number;
  duskMinutes?: number;
  itineraryItems?: DaylightDetailItemInput[];
  /** 当地现在（分钟） */
  nowMinutes?: number;
  /** 覆盖自动计算的夜间驾驶分钟 */
  nightDriveMinutes?: number;
};

function parseHHmm(value?: string): number | undefined {
  if (!value) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatHHmm(totalMin: number): string {
  const day = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(day / 60);
  const m = day % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDaylightDurationZh(totalMin: number): string {
  const n = Math.max(0, Math.round(totalMin));
  if (n <= 0) return '无明显夜间驾驶';
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

function isLodging(item: DaylightDetailItemInput): boolean {
  const blob = `${item.title} ${item.note ?? ''} ${item.placeCategory ?? ''}`;
  return (
    item.placeCategory === 'HOTEL' ||
    /住宿|酒店|民宿|旅馆|hotel|lodge|check.?in|入住/i.test(blob)
  );
}

function shortTitle(title: string): string {
  const t = title.trim();
  if (t.length <= 16) return t;
  const before = t.split(/[（(]/)[0]?.trim();
  if (before && before.length >= 2 && before.length <= 16) return before;
  return `${t.slice(0, 14)}…`;
}

function classifyItem(
  itemMin: number | undefined,
  sunsetMin: number,
  duskMin: number,
): { status: DailyDriveItineraryDaylightStatus; statusZh: string } {
  if (itemMin == null) return { status: 'OK', statusZh: '正常' };
  if (itemMin <= sunsetMin - 90) return { status: 'AMPLE', statusZh: '日照充足' };
  if (itemMin <= sunsetMin) return { status: 'OK', statusZh: '正常' };
  if (itemMin <= duskMin + 30) return { status: 'AFTER_SUNSET', statusZh: '日落后抵达' };
  return { status: 'NIGHT', statusZh: '夜间到达' };
}

function mapSeverity(status: DailyDriveDimensionStatus): DailyDriveDetailSeverity {
  if (status === 'BLOCKED') return 'BLOCKED';
  if (status === 'ATTENTION') return 'ATTENTION';
  return 'OK';
}

function heroTitle(nightMin: number, dayMinutes: number): string {
  if (nightMin >= 45 || dayMinutes < 8 * 60) return '日照时间有限';
  if (nightMin >= 20) return '日照可用，需留意日落后路段';
  return '日照充足，可按计划推进';
}

/**
 * 投影日照详情（截图：窗口时间线 / 行程关系 / 夜间暴露 / 建议 / 稳健方案）。
 */
export function projectDaylightDetailRich(
  ctx: DaylightDetailContext,
  input: DaylightDetailProjectionInput,
): DailyDriveDaylightDetailDto {
  const sunriseLabel = input.sunriseLabel ?? '—';
  const sunsetLabel = input.sunsetLabel ?? '—';
  const sunriseMin = input.sunriseMinutes ?? parseHHmm(sunriseLabel) ?? 9 * 60 + 30;
  const sunsetMin = input.sunsetMinutes ?? parseHHmm(sunsetLabel) ?? 17 * 60 + 46;
  const dawnMinRaw =
    input.dawnMinutes ??
    parseHHmm(input.dawnLabel) ??
    Math.max(0, sunriseMin - 90);
  const duskMinRaw =
    input.duskMinutes ??
    parseHHmm(input.duskLabel) ??
    Math.min(24 * 60 - 1, sunsetMin + 40);
  // 极昼/长日照时 civil≈sunrise/sunset，拉开色带避免零宽度
  const dawnMin =
    dawnMinRaw >= sunriseMin - 5 ? Math.max(0, sunriseMin - 60) : dawnMinRaw;
  const duskMin =
    duskMinRaw <= sunsetMin + 5
      ? Math.min(24 * 60 - 1, sunsetMin + 45)
      : duskMinRaw;
  const dawnLabel = formatHHmm(dawnMin);
  const duskLabel = formatHHmm(duskMin);
  const dayMinutes = Math.max(0, sunsetMin - sunriseMin);

  const items = (input.itineraryItems ?? []).slice(0, 12);
  const firstTimed = items.find((i) => parseHHmm(i.time) != null);
  const lastTimed = [...items].reverse().find((i) => parseHHmm(i.time) != null);
  const hotel = items.find(isLodging) ?? lastTimed;

  const firstStart = parseHHmm(firstTimed?.time);
  const suggestedDepartMin =
    firstStart != null ? Math.max(0, firstStart - 60) : Math.max(0, sunriseMin - 60);
  const suggestedDepartZh = formatHHmm(suggestedDepartMin);

  const arrivalMin =
    parseHHmm(hotel?.endTime) ??
    parseHHmm(hotel?.time) ??
    parseHHmm(lastTimed?.endTime) ??
    parseHHmm(lastTimed?.time) ??
    sunsetMin + 40;
  const estimatedArrivalZh = formatHHmm(arrivalMin);

  // 夜间驾驶：到达相对日落的超出 + 日落后行程项跨度粗估
  let nightDriveMin = input.nightDriveMinutes;
  if (nightDriveMin == null) {
    nightDriveMin = Math.max(0, arrivalMin - sunsetMin);
    // 若有多个日落后项，用末项 - 日落
    const afterSunset = items
      .map((i) => parseHHmm(i.time))
      .filter((m): m is number => m != null && m > sunsetMin);
    if (afterSunset.length >= 2) {
      nightDriveMin = Math.max(
        nightDriveMin,
        Math.max(...afterSunset) - sunsetMin,
      );
    }
  }

  const attention = nightDriveMin >= 45 || dayMinutes < 8 * 60;
  let severity: DailyDriveDetailSeverity = attention
    ? 'ATTENTION'
    : mapSeverity(ctx.summaryStatus);
  if (nightDriveMin >= 90) severity = 'CAUTION';

  const nightLabelZh =
    nightDriveMin > 0
      ? `计划中约有 ${formatDaylightDurationZh(nightDriveMin)}夜间驾驶`
      : '当日无明显夜间驾驶';

  // 夜间主路段：最后一个日落后活动 → 酒店/末项
  const afterItems = items.filter((i) => {
    const t = parseHHmm(i.time);
    return t != null && t > sunsetMin;
  });
  const nightFrom =
    afterItems.length >= 2
      ? shortTitle(afterItems[0]!.title)
      : afterItems[0]
        ? shortTitle(afterItems[0].title)
        : lastTimed && parseHHmm(lastTimed.time)! > sunsetMin
          ? shortTitle(lastTimed.title)
          : '日落后路段';
  const nightTo = hotel ? shortTitle(hotel.title) : '今日终点';
  const nightSegmentZh =
    nightDriveMin > 0 ? `${nightFrom} → ${nightTo}` : `日落 ${sunsetLabel} 后暂无夜间驾驶`;

  const itineraryLinks: DailyDriveDaylightItineraryLink[] = items.map((i) => {
    const t = parseHHmm(i.time);
    const { status, statusZh } = classifyItem(t, sunsetMin, duskMin);
    return {
      timeZh: i.time ?? '—',
      titleZh: i.title,
      noteZh: statusZh,
      daylightStatus: status,
      daylightStatusZh: statusZh,
    };
  });

  const markers: DailyDriveDaylightTimelineMarker[] = [
    { timeZh: dawnLabel, labelZh: '黎明', kind: 'dawn' },
    { timeZh: suggestedDepartZh, labelZh: '建议出发', kind: 'suggested_depart' },
    { timeZh: sunriseLabel, labelZh: '日出', kind: 'sunrise' },
    { timeZh: sunsetLabel, labelZh: '日落', kind: 'sunset' },
    { timeZh: estimatedArrivalZh, labelZh: '预计到达', kind: 'arrival' },
    {
      timeZh: formatHHmm(Math.max(duskMin, 22 * 60)),
      labelZh: '夜晚',
      kind: 'night',
    },
  ];
  if (input.nowMinutes != null && Number.isFinite(input.nowMinutes)) {
    markers.push({
      timeZh: formatHHmm(input.nowMinutes),
      labelZh: '现在',
      kind: 'now',
    });
  }
  markers.sort(
    (a, b) => (parseHHmm(a.timeZh) ?? 0) - (parseHHmm(b.timeZh) ?? 0),
  );

  const daylightBands: DailyDriveDaylightBand[] = [
    {
      id: 'DAWN',
      labelZh: '黎明',
      startZh: dawnLabel,
      endZh: sunriseLabel,
    },
    {
      id: 'DAY',
      labelZh: '白天',
      startZh: sunriseLabel,
      endZh: sunsetLabel,
    },
    {
      id: 'DUSK',
      labelZh: '黄昏',
      startZh: sunsetLabel,
      endZh: duskLabel,
    },
    {
      id: 'NIGHT',
      labelZh: '夜晚',
      startZh: duskLabel,
      endZh: formatHHmm(Math.max(duskMin, 22 * 60) + 120),
    },
  ];

  const suggestionsZh: string[] = [];
  if (nightDriveMin >= 20) {
    suggestionsZh.push(`建议提前出发，争取在 ${suggestedDepartZh} 前离开`);
    suggestionsZh.push('减少一个停留点，争取日落前抵达关键节点');
    suggestionsZh.push('压缩拍照停留，优先保证关键行程在日落前完成');
  } else {
    suggestionsZh.push('优先在日照充足时段完成长距离驾驶');
    suggestionsZh.push('当日日照条件总体可接受，可按计划推进');
  }

  const robustActionZh = `建议 ${suggestedDepartZh} 前离开`;
  const robustDetailZh =
    nightDriveMin >= 20
      ? '提前出发并略微压缩停留，可减少夜间驾驶暴露。'
      : '可按当前日程执行，保留 30 分钟缓冲。';

  const titleZh = heroTitle(nightDriveMin, dayMinutes);
  const detailZh = `日出 ${sunriseLabel} · 日落 ${sunsetLabel}`;
  const metaZh = nightLabelZh;

  return {
    schemaId: DAILY_DRIVE_DIMENSION_SCHEMA_IDS.DAYLIGHT,
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
      metaZh,
      severity,
      iconHint: 'sun.max',
    },
    primaryAction: {
      labelZh: robustActionZh,
      action: 'ADJUST_TODAY',
    },
    sunriseLabelZh: sunriseLabel,
    sunsetLabelZh: sunsetLabel,
    dawnLabelZh: dawnLabel,
    duskLabelZh: duskLabel,
    suggestedDepartBeforeZh: suggestedDepartZh,
    estimatedArrivalZh,
    nightDriveMinutes: nightDriveMin,
    timelineMarkers: markers,
    daylightBands,
    itineraryLinks: itineraryLinks.length
      ? itineraryLinks
      : [
          {
            timeZh: '—',
            titleZh: '暂无今日行程项',
            daylightStatus: 'OK',
            daylightStatusZh: '正常',
          },
        ],
    nightExposure: {
      durationZh:
        nightDriveMin > 0
          ? formatDaylightDurationZh(nightDriveMin)
          : '无明显夜间驾驶',
      durationMin: nightDriveMin,
      segmentZh: nightSegmentZh,
      severity: nightDriveMin >= 45 ? 'ATTENTION' : nightDriveMin >= 20 ? 'CAUTION' : 'OK',
      severityZh: nightDriveMin >= 45 ? '注意' : nightDriveMin >= 20 ? '留意' : 'OK',
    },
    suggestionsZh,
    robustPlan: {
      detailZh: robustDetailZh,
      actionZh: robustActionZh,
    },
  };
}
