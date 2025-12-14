// src/planning-policy/utils/time-utils.ts

import { OpeningHours } from '../interfaces/poi.interface';

/**
 * 星期几（0=周日，1=周一，...，6=周六）
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 将 HH:mm 格式的时间字符串转换为分钟数（从当天 0:00 开始）
 * 
 * @param hhmm 时间字符串，如 "09:00"、"16:30"
 * @returns 分钟数，如 540（9:00）、990（16:30）
 */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 将分钟数转换为 HH:mm 格式
 * 
 * @param min 分钟数
 * @returns 时间字符串
 */
export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * 检查是否为节假日（简化版本，实际可以接入节假日 API 或数据库）
 * 
 * @param dateISO 日期字符串，如 "2026-01-01"
 * @returns 是否为节假日
 */
export function isHoliday(dateISO: string): boolean {
  // 简化实现：检查常见节假日
  // 实际应该接入节假日 API 或数据库
  const date = new Date(dateISO);
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // 常见的固定节假日（可以扩展）
  const fixedHolidays: Array<[number, number]> = [
    [1, 1],   // 元旦
    [12, 25], // 圣诞节
  ];

  return fixedHolidays.some(([m, d]) => m === month && d === day);
}

/**
 * 检查 POI 在指定时间是否开放
 * 
 * 支持：
 * - 多时间段
 * - 节假日特殊时间
 * - 闭馆日期
 * 
 * @param oh 开放时间配置
 * @param dayOfWeek 星期几
 * @param tMin 时间（分钟数，从当天 0:00 开始）
 * @param dateISO 日期字符串（ISO 格式），如 "2026-01-03"，用于节假日判断
 * @returns 是否开放
 */
export function isOpenAt(
  oh: OpeningHours | undefined,
  dayOfWeek: DayOfWeek,
  tMin: number,
  dateISO?: string
): boolean {
  if (!oh) return true; // 没数据先放行（或你可以改成 false）

  // 检查是否在闭馆日期列表中
  if (dateISO && oh.closedDates?.includes(dateISO)) {
    return false;
  }

  const isHolidayToday = dateISO ? isHoliday(dateISO) : false;

  // 遍历所有时间窗口
  for (const window of oh.windows) {
    // 检查是否在时间范围内
    const startMin = hhmmToMin(window.start);
    const endMin = hhmmToMin(window.end);
    const inTimeRange = tMin >= startMin && tMin <= endMin;

    if (!inTimeRange) continue;

    // 检查节假日特殊日期
    if (window.holidayDates && dateISO) {
      if (window.holidayDates.includes(dateISO)) {
        return true; // 在特殊日期列表中，且时间范围匹配
      }
      continue; // 不在特殊日期列表中，跳过此窗口
    }

    // 检查是否仅在节假日生效
    if (window.holidaysOnly !== undefined) {
      if (window.holidaysOnly && !isHolidayToday) {
        continue; // 仅在节假日生效，但今天不是节假日
      }
      if (!window.holidaysOnly && isHolidayToday) {
        continue; // 非节假日生效，但今天是节假日（可能在其他窗口处理）
      }
    }

    // 检查星期几匹配（如果设置了 dayOfWeek）
    if (window.dayOfWeek !== undefined) {
      if (window.dayOfWeek === dayOfWeek) {
        return true; // 星期几匹配，且时间范围匹配
      }
      continue; // 星期几不匹配，跳过此窗口
    }

    // 如果既没有设置 dayOfWeek 也没有设置 holidayDates，默认匹配
    return true;
  }

  return false;
}

/**
 * 获取 POI 的最晚入场时间
 * 
 * 支持按星期几区分的最晚入场时间
 * 
 * @param oh 开放时间配置
 * @param dayOfWeek 星期几
 * @returns 最晚入场时间（分钟数），如果未配置则返回 undefined
 */
export function latestEntryMin(
  oh: OpeningHours | undefined,
  dayOfWeek: DayOfWeek
): number | undefined {
  if (!oh) return undefined;

  // 优先使用按星期几区分的最晚入场时间
  if (oh.lastEntryByDay?.[dayOfWeek]) {
    return hhmmToMin(oh.lastEntryByDay[dayOfWeek]);
  }

  // 使用通用的最晚入场时间
  if (oh.lastEntry) {
    return hhmmToMin(oh.lastEntry);
  }

  return undefined;
}

/**
 * 计算两点之间的直线距离（米）
 * 使用 Haversine 公式
 * 
 * @param lat1 起点纬度
 * @param lng1 起点经度
 * @param lat2 终点纬度
 * @param lng2 终点经度
 * @returns 距离（米）
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // 地球半径（米）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


/**
 * 从 ISO 日期字符串获取星期几
 * 
 * @param dateISO 日期字符串，如 "2026-01-03"
 * @returns 星期几（0=周日，1=周一，...，6=周六）
 */
export function dayOfWeekFromISO(dateISO: string): DayOfWeek {
  const date = new Date(dateISO);
  return date.getDay() as DayOfWeek;
}

/**
 * 时间窗状态（用于稳健度评估）
 */
export type TimeWindowStatus =
  | { ok: true; waitMin: number; status: 'OPEN' | 'WAIT_NEXT_WINDOW' }
  | {
      ok: false;
      waitMin: 0;
      reason:
        | 'CLOSED_DATE'
        | 'NO_WINDOW_TODAY'
        | 'MISSED_LAST_ENTRY'
        | 'CLOSED_REST_OF_DAY';
    };

/**
 * 检查是否在闭馆日期
 */
function isClosedOnDate(
  oh: OpeningHours | undefined,
  dateISO: string
): boolean {
  if (!oh?.closedDates?.length) return false;
  return oh.closedDates.includes(dateISO);
}

/**
 * 选择"当天生效"的窗口
 * 
 * 规则：
 * - holidayDates 包含 dateISO：该窗口对该日期生效（可覆盖一般窗口）
 * - holidaysOnly=true：仅节假日生效
 * - dayOfWeek 匹配（或不填则认为通用）
 */
function applicableWindows(
  oh: OpeningHours | undefined,
  dateISO: string,
  dayOfWeek: DayOfWeek,
  holiday: boolean
): Array<{ start: string; end: string }> {
  if (!oh?.windows?.length) return [];

  return oh.windows
    .filter((w) => {
      // 检查 holidayDates（优先级最高）
      if (w.holidayDates?.includes(dateISO)) {
        return true; // 特定节假日日期强命中
      }

      // 检查 holidaysOnly
      if (w.holidaysOnly === true) {
        return holiday; // 仅在节假日生效
      }

      // 检查 dayOfWeek 匹配
      const matchDow = w.dayOfWeek === undefined || w.dayOfWeek === dayOfWeek;
      return matchDow;
    })
    .map((w) => ({ start: w.start, end: w.end }));
}

/**
 * 检查是否在时间窗口内（增强版，用于稳健度评估）
 * 
 * 支持：
 * - 多时间段
 * - 节假日特殊时间
 * - 闭馆日期
 * - 最晚入场检查
 * - 等待时间估算
 * 
 * @param args 参数
 * @returns 时间窗状态
 */
export function withinTimeWindowForEvaluation(args: {
  openingHours?: OpeningHours;
  dateISO: string;
  dayOfWeek: DayOfWeek;
  arriveMin: number;
  holiday?: boolean;
}): TimeWindowStatus {
  const { openingHours: oh, dateISO, dayOfWeek, arriveMin } = args;

  if (!oh) {
    return { ok: true, waitMin: 0, status: 'OPEN' };
  }

  // 1) 检查闭馆日期
  if (isClosedOnDate(oh, dateISO)) {
    return { ok: false, waitMin: 0, reason: 'CLOSED_DATE' };
  }

  // 2) 选择当天生效窗口
  const holiday = args.holiday ?? isHoliday(dateISO);
  const wins = applicableWindows(oh, dateISO, dayOfWeek, holiday);

  if (wins.length === 0) {
    return { ok: false, waitMin: 0, reason: 'NO_WINDOW_TODAY' };
  }

  // 3) 判断是否在窗口内 / 找下一段窗口
  const inWin = wins.find(
    (w) =>
      arriveMin >= hhmmToMin(w.start) && arriveMin <= hhmmToMin(w.end)
  );

  if (inWin) {
    // 在窗口内：实际入场时刻 = arriveMin
    const entryMin = arriveMin;
    const lastEntry = latestEntryMin(oh, dayOfWeek);
    if (lastEntry !== undefined && entryMin > lastEntry) {
      return { ok: false, waitMin: 0, reason: 'MISSED_LAST_ENTRY' };
    }
    return { ok: true, waitMin: 0, status: 'OPEN' };
  }

  // 找下一段窗口开始（多时间段）
  const nextStart = wins
    .map((w) => hhmmToMin(w.start))
    .filter((s) => s > arriveMin)
    .sort((a, b) => a - b)[0];

  if (nextStart === undefined) {
    return { ok: false, waitMin: 0, reason: 'CLOSED_REST_OF_DAY' };
  }

  // 等待到下一段窗口开始才能入场：实际入场时刻 = nextStart
  const entryMin = nextStart;
  const lastEntry = latestEntryMin(oh, dayOfWeek);
  if (lastEntry !== undefined && entryMin > lastEntry) {
    return { ok: false, waitMin: 0, reason: 'MISSED_LAST_ENTRY' };
  }

  const waitMin = nextStart - arriveMin;

  // 如果等待时间超过 3 小时，认为不可行
  if (waitMin > 180) {
    return { ok: false, waitMin: 0, reason: 'CLOSED_REST_OF_DAY' };
  }

  return { ok: true, waitMin, status: 'WAIT_NEXT_WINDOW' };
}

/**
 * 入场 deadline 信息（用于计算 entrySlack）
 */
export interface EntryDeadlineInfo {
  /** 实际入场时刻（arrive + wait，分钟数） */
  entryMin: number;
  /** entry 所在窗口 end（分钟数） */
  windowEndMin?: number;
  /** 该日 lastEntry（分钟数） */
  lastEntryMin?: number;
  /** 取 min(lastEntryMin, windowEndMin)；若无 lastEntry 取 windowEndMin */
  deadlineMin?: number;
}

/**
 * 从 entryMin 推导 deadline 信息
 * 
 * 用于计算 entrySlack = deadlineMin - entryMin
 * 
 * @param args 参数
 * @returns 入场 deadline 信息
 */
export function getEntryDeadlineInfoForEvaluation(args: {
  openingHours?: OpeningHours;
  dateISO: string;
  dayOfWeek: DayOfWeek;
  entryMin: number; // ✅ 关键：传入"实际入场时刻"
  holiday?: boolean;
}): EntryDeadlineInfo {
  const { openingHours: oh, dateISO, dayOfWeek, entryMin } = args;

  if (!oh) {
    return { entryMin };
  }

  const holiday = args.holiday ?? isHoliday(dateISO);
  const wins = applicableWindows(oh, dateISO, dayOfWeek, holiday);

  // entryMin 理论上一定落在某个窗口内（因为 tw.ok 才会走到这里），但还是做保护
  const win = wins.find(
    (w) => entryMin >= hhmmToMin(w.start) && entryMin <= hhmmToMin(w.end)
  );
  const windowEndMin = win ? hhmmToMin(win.end) : undefined;

  const lastEntryMin = latestEntryMin(oh, dayOfWeek);

  let deadlineMin: number | undefined;
  if (lastEntryMin !== undefined && windowEndMin !== undefined) {
    deadlineMin = Math.min(lastEntryMin, windowEndMin);
  } else if (lastEntryMin !== undefined) {
    deadlineMin = lastEntryMin;
  } else {
    deadlineMin = windowEndMin;
  }

  return { entryMin, windowEndMin, lastEntryMin, deadlineMin };
}
