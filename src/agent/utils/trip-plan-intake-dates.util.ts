/**
 * INTAKE：从用户 NL 解析行程日期/天数，并与绑定 Trip 权威窗口对齐。
 * 修复「6月5日」被误读为「5天」；有 trip_id 时以库内起止日期为准。
 */

export interface IntakeNlDateParse {
  start_date?: string;
  date_range?: { start_date: string; end_date: string };
  /** 行程时长（N 天），非日历「M 月 D 日」 */
  duration_days?: number;
  /** 用户明确改天数，如「改成 7 天」 */
  explicit_days_override?: number;
  /** 用户明确改日期窗口 */
  explicit_date_override: boolean;
}

const MAX_TRIP_DAYS = 366;

/** 用户明确要求改行程天数（才允许 NL 覆盖绑定 Trip 的 days） */
export function detectExplicitTripDaysOverride(text: string): number | undefined {
  const s = String(text ?? '');
  const patterns: RegExp[] = [
    /改(?:成|为|到|至)\s*(\d{1,2})\s*(?:天|日|晚)/,
    /(?:调整|更改|修改|换成)\s*(?:为|成|到)?\s*(\d{1,2})\s*(?:天|日|晚)(?:的)?(?:行程|计划|游)?/,
    /(\d{1,2})\s*(?:天|日|晚)(?:的)?(?:行程|计划|环岛|游)/,
    /行程\s*(?:改|调整|延长|缩短)?\s*(?:为|成|到)?\s*(\d{1,2})\s*(?:天|日|晚)/,
  ];
  for (const pattern of patterns) {
    const m = s.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 30) return n;
    }
  }
  const zhMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const zh = s.match(/改(?:成|为|到|至)\s*([一二两三四五六七八九十]{1,2})\s*(?:天|日|晚)/);
  if (zh) {
    const raw = zh[1];
    if (raw.length === 1 && zhMap[raw]) return zhMap[raw];
    if (raw.startsWith('十') && raw.length === 2 && zhMap[raw[1]]) return 10 + zhMap[raw[1]];
    if (raw === '十') return 10;
  }
  return undefined;
}

/** 用户明确要求改起止日期（才允许 NL 覆盖绑定 Trip 的 date_range） */
export function detectExplicitTripDateOverride(text: string): boolean {
  const s = String(text ?? '');
  if (/改(?:成|为|到|至).*(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*[日号])/u.test(s)) {
    return true;
  }
  if (/(?:调整|更改|修改|换)(?:一下)?\s*(?:行程)?\s*日期/u.test(s)) return true;
  if (/(?:行程|计划)\s*(?:改|调整|换)\s*(?:到|为|成)/u.test(s) && /\d{1,2}\s*月/u.test(s)) {
    return true;
  }
  return false;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysYmd(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysInclusive(start: string, end: string): number {
  const sd = new Date(`${start}T12:00:00.000Z`);
  const ed = new Date(`${end}T12:00:00.000Z`);
  const diff = Math.ceil(Math.abs(ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 && diff <= MAX_TRIP_DAYS ? diff : 0;
}

/** 从 NL 抽取「时长 N 天」，排除「6月5日」类日历表达 */
export function extractTripDurationDaysFromNl(text: string): number | undefined {
  const s = String(text ?? '');

  const durationPatterns: RegExp[] = [
    /(\d{1,2})\s*天/,
    /(?<![\d月])(\d{1,2})\s*日(?!\s*[到至\-~])/,
    /(\d{1,2})\s*晚/,
    /(\d{1,2})\s*days?/i,
    /(\d{1,2})\s*nights?/i,
  ];
  for (const pattern of durationPatterns) {
    const m = s.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 30) return n;
    }
  }

  const zhDayPatterns: Array<{ pattern: RegExp; value: number }> = [
    { pattern: /(?<![\d月])一日|(?<![\d月])一天/u, value: 1 },
    { pattern: /两日|两天|二日|二天/u, value: 2 },
    { pattern: /三日|三天/u, value: 3 },
    { pattern: /四日|四天/u, value: 4 },
    { pattern: /(?<![\d月])五日|(?<![\d月])五天/u, value: 5 },
    { pattern: /六日|六天/u, value: 6 },
    { pattern: /七日|七天/u, value: 7 },
  ];
  const matched = zhDayPatterns.find((x) => x.pattern.test(s));
  if (matched) return matched.value;

  return undefined;
}

function parseChineseCalendarWindow(
  text: string,
  refYear: number,
): { start_date: string; end_date: string } | undefined {
  const s = String(text ?? '');

  const isoRange = s.match(
    /(\d{4})-(\d{2})-(\d{2})\s*(?:到|至|-|~)\s*(\d{4})-(\d{2})-(\d{2})/,
  );
  if (isoRange) {
    return {
      start_date: `${isoRange[1]}-${isoRange[2]}-${isoRange[3]}`,
      end_date: `${isoRange[4]}-${isoRange[5]}-${isoRange[6]}`,
    };
  }

  const y = refYear;
  const cnRange = s.match(/(\d{1,2})\s*月\s*(\d{1,2})[日号]?\s*(?:到|至|-|~|～)\s*(\d{1,2})\s*月\s*(\d{1,2})[日号]?/);
  if (cnRange) {
    return {
      start_date: ymd(y, parseInt(cnRange[1], 10), parseInt(cnRange[2], 10)),
      end_date: ymd(y, parseInt(cnRange[3], 10), parseInt(cnRange[4], 10)),
    };
  }

  const sameMonthSpan = s.match(
    /(\d{1,2})\s*月\s*(\d{1,2})(?:日|号)?\s*[\u2013\u2014\-~～]\s*(\d{1,2})(?:日|号)?/,
  );
  if (sameMonthSpan) {
    const mo = parseInt(sameMonthSpan[1], 10);
    return {
      start_date: ymd(y, mo, parseInt(sameMonthSpan[2], 10)),
      end_date: ymd(y, mo, parseInt(sameMonthSpan[3], 10)),
    };
  }

  const sameMonthTo = s.match(/(\d{1,2})\s*月\s*(\d{1,2})[日号]?\s*(?:到|至)\s*(\d{1,2})[日号]?/);
  if (sameMonthTo) {
    const mo = parseInt(sameMonthTo[1], 10);
    return {
      start_date: ymd(y, mo, parseInt(sameMonthTo[2], 10)),
      end_date: ymd(y, mo, parseInt(sameMonthTo[3], 10)),
    };
  }

  const cnYearRange = s.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:到|至|-|~)\s*(\d{4})年(\d{1,2})月(\d{1,2})日/,
  );
  if (cnYearRange) {
    return {
      start_date: ymd(
        parseInt(cnYearRange[1], 10),
        parseInt(cnYearRange[2], 10),
        parseInt(cnYearRange[3], 10),
      ),
      end_date: ymd(
        parseInt(cnYearRange[4], 10),
        parseInt(cnYearRange[5], 10),
        parseInt(cnYearRange[6], 10),
      ),
    };
  }

  return undefined;
}

/** 单个日历锚点（如 6月5日），不等同于行程时长 */
export function parseChineseCalendarAnchor(text: string, refYear: number): string | undefined {
  const s = String(text ?? '');
  const withYear = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (withYear) {
    return ymd(parseInt(withYear[1], 10), parseInt(withYear[2], 10), parseInt(withYear[3], 10));
  }
  const single = s.match(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*[日号](?:[^\d]|$)/);
  if (single) {
    return ymd(refYear, parseInt(single[1], 10), parseInt(single[2], 10));
  }
  return undefined;
}

export function parseIntakeNlDatesAndDays(
  textForIntake: string,
  opts?: { refYear?: number; tripIdBound?: boolean },
): IntakeNlDateParse {
  const refYear = opts?.refYear ?? new Date().getFullYear();
  const tripIdBound = opts?.tripIdBound === true;
  const explicit_days_override = detectExplicitTripDaysOverride(textForIntake);
  const explicit_date_override = detectExplicitTripDateOverride(textForIntake);

  let start_date: string | undefined;
  let date_range: { start_date: string; end_date: string } | undefined;

  const calWindow = parseChineseCalendarWindow(textForIntake, refYear);
  if (calWindow) {
    date_range = calWindow;
    start_date = calWindow.start_date;
  } else {
    const isoSingle = textForIntake.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoSingle) {
      start_date = isoSingle[0];
    }
  }

  if (!start_date) {
    const now = new Date();
    const relativeDays =
      /后天/.test(textForIntake) ? 2 : /明天/.test(textForIntake) ? 1 : /今天|今日/.test(textForIntake) ? 0 : undefined;
    if (relativeDays !== undefined) {
      const d = new Date(now);
      d.setDate(now.getDate() + relativeDays);
      start_date = d.toISOString().slice(0, 10);
    }
  }

  if (!date_range && !tripIdBound && explicit_date_override) {
    const anchor = parseChineseCalendarAnchor(textForIntake, refYear);
    if (anchor) start_date = anchor;
  } else if (!date_range && !tripIdBound) {
    const anchor = parseChineseCalendarAnchor(textForIntake, refYear);
    if (anchor && !extractTripDurationDaysFromNl(textForIntake)) {
      start_date = anchor;
    }
  }

  let duration_days: number | undefined;
  if (explicit_days_override != null) {
    duration_days = explicit_days_override;
  } else if (!tripIdBound) {
    duration_days = extractTripDurationDaysFromNl(textForIntake);
  }

  if (!duration_days && date_range) {
    const n = daysInclusive(date_range.start_date, date_range.end_date);
    if (n > 0) duration_days = n;
  }

  if (tripIdBound && !explicit_date_override && !explicit_days_override) {
    start_date = undefined;
    date_range = undefined;
    duration_days = undefined;
  }

  return {
    start_date,
    date_range,
    duration_days,
    explicit_days_override,
    explicit_date_override,
  };
}

export interface BoundTripDateAuthorityInput {
  tripStart: string;
  tripEnd: string;
  plan: {
    start_date?: string;
    date_range?: { start_date: string; end_date: string };
    days?: number;
  };
  nlParse: IntakeNlDateParse;
  structuredHasDates: boolean;
}

export interface BoundTripDateAuthorityResult {
  start_date: string;
  end_date: string;
  date_range: { start_date: string; end_date: string };
  days: number;
  authority: 'trip_record' | 'nl_override' | 'structured';
  overwritten_nl_fields: string[];
}

/** 绑定 Trip 起止日期为权威；仅在结构化日期或 NL 显式改期/改天数时保留请求侧 */
export function applyBoundTripDateAuthority(
  input: BoundTripDateAuthorityInput,
): BoundTripDateAuthorityResult {
  const { tripStart, tripEnd, plan, nlParse, structuredHasDates } = input;
  const overwritten: string[] = [];

  const tripDays = daysInclusive(tripStart, tripEnd) || 1;

  if (structuredHasDates && plan.date_range?.start_date && plan.date_range?.end_date) {
    const start = plan.date_range.start_date;
    const end = plan.date_range.end_date;
    const days = plan.days ?? daysInclusive(start, end) ?? tripDays;
    return {
      start_date: start,
      end_date: end,
      date_range: { start_date: start, end_date: end },
      days,
      authority: 'structured',
      overwritten_nl_fields: overwritten,
    };
  }

  if (nlParse.explicit_date_override && plan.date_range?.start_date && plan.date_range?.end_date) {
    const start = plan.date_range.start_date;
    const end = plan.date_range.end_date;
    const days = plan.days ?? daysInclusive(start, end) ?? tripDays;
    return {
      start_date: start,
      end_date: end,
      date_range: { start_date: start, end_date: end },
      days,
      authority: 'nl_override',
      overwritten_nl_fields: overwritten,
    };
  }

  if (nlParse.explicit_days_override != null) {
    const start = plan.start_date ?? tripStart;
    const days = nlParse.explicit_days_override;
    const end = addDaysYmd(start, days - 1);
    if (plan.days !== days) overwritten.push('days');
    if (plan.date_range?.start_date !== start || plan.date_range?.end_date !== end) {
      overwritten.push('date_range');
    }
    return {
      start_date: start,
      end_date: end,
      date_range: { start_date: start, end_date: end },
      days,
      authority: 'nl_override',
      overwritten_nl_fields: overwritten,
    };
  }

  if (plan.start_date && plan.start_date !== tripStart) overwritten.push('start_date');
  if (plan.date_range?.start_date !== tripStart || plan.date_range?.end_date !== tripEnd) {
    overwritten.push('date_range');
  }
  if (plan.days !== tripDays) overwritten.push('days');

  return {
    start_date: tripStart,
    end_date: tripEnd,
    date_range: { start_date: tripStart, end_date: tripEnd },
    days: tripDays,
    authority: 'trip_record',
    overwritten_nl_fields: overwritten,
  };
}
