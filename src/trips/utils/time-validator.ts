import { DateTime } from 'luxon';

/** Google/OSM 等字段可能是 string | string[] | number | 嵌套对象；解析前统一成可判定的文本 */
function normalizeOpeningHoursText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length ? t : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = normalizeOpeningHoursText(item);
      if (s) return s;
    }
    return undefined;
  }
  return undefined;
}

/**
 * 目的地时区感知的营业时间校验函数
 * 逻辑：判定“目的地当地时间”的 Slot 窗口是否完全被“当地营业时间”覆盖
 */
export function isOpeningHoursCoveringWindow(args: {
  openingHours: any; // 支持 String 或多级 Object
  localDate: string; // YYYY-MM-DD
  tz: string; // 目的地时区，如 Asia/Tokyo
  window: { start: string; end: string }; // 墙钟窗口，如 { start: '20:00', end: '22:00' }
}): {
  effectiveHours?: string;
  isCovered: boolean;
  dataQuality: 'HIGH' | 'LOW';
  reason?: 'CLOSED' | 'UNKNOWN' | 'NOT_COVERED';
} {
  const { openingHours, localDate, tz, window } = args;

  if (!openingHours) {
    return { isCovered: true, dataQuality: 'LOW', reason: 'UNKNOWN' };
  }

  // 1) 构造目的地当地的 DateTime 参考点（处理星期几）
  const dt = DateTime.fromISO(localDate, { zone: tz });
  const weekDayMap: Record<number, string> = {
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
    7: 'sun',
  };
  const currentDay = weekDayMap[dt.weekday];
  const isWeekend = dt.weekday >= 6;

  // 2) 提取当天有效的营业规则
  let rawCandidate: unknown;
  let quality: 'HIGH' | 'LOW' = 'LOW';

  if (typeof openingHours === 'string') {
    rawCandidate = openingHours;
    quality = 'LOW';
  } else if (typeof openingHours === 'object' && openingHours !== null) {
    const o = openingHours as Record<string, unknown>;
    // 优先级：具体周几 > (weekend/weekday) > string 字段
    const dayVal = o[currentDay];
    if (normalizeOpeningHoursText(dayVal)) {
      rawCandidate = dayVal;
      quality = 'HIGH';
    } else {
      rawCandidate = isWeekend ? o.weekend : o.weekday;
      rawCandidate = rawCandidate ?? o.string;
      quality = 'LOW';
    }
  }

  const rawHours = normalizeOpeningHoursText(rawCandidate);

  if (!rawHours || rawHours.toLowerCase() === 'closed') {
    return { effectiveHours: 'Closed', isCovered: false, dataQuality: quality, reason: 'CLOSED' };
  }

  // 3) 解析营业时间窗口与目标窗口 (支持 09:00-18:00 格式)
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const parseInterval = (rangeStr: string) => {
    const parts = rangeStr.split('-').map((s) => s.trim());
    return parts.length === 2 ? { s: toMin(parts[0]), e: toMin(parts[1]) } : null;
  };

  const target = { s: toMin(window.start), e: toMin(window.end) };
  const effective = parseInterval(rawHours);

  if (!effective) {
    // 无法解析则宽松处理（避免误杀；同时标记 LOW）
    return { effectiveHours: rawHours, isCovered: true, dataQuality: 'LOW', reason: 'UNKNOWN' };
  }

  // 4) 执行覆盖判定（处理跨零点）
  const effectiveEnd = effective.e < effective.s ? effective.e + 1440 : effective.e;
  const targetEnd = target.e < target.s ? target.e + 1440 : target.e;

  const isCovered = target.s >= effective.s && targetEnd <= effectiveEnd;

  return {
    effectiveHours: rawHours,
    isCovered,
    dataQuality: quality,
    reason: isCovered ? undefined : 'NOT_COVERED',
  };
}

