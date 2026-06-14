/**
 * NL 行程创建：远期日期推断校验
 *
 * 当用户明确提到未来月份（如「十一月」）但 LLM 推断出近端日期（如今日起算）时，
 * 清除可疑日期并强制进入显式日期澄清，避免 confirm_inferred_info 锁定错误日期。
 */

const CHINESE_MONTHS: Record<string, number> = {
  一月: 1,
  二月: 2,
  三月: 3,
  四月: 4,
  五月: 5,
  六月: 6,
  七月: 7,
  八月: 8,
  九月: 9,
  十月: 10,
  十一月: 11,
  十二月: 12,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const NEAR_TERM_SIGNALS =
  /最近|这周|本周|下周|明天|后天|马上|近期|soon|this week|next week|tomorrow|in a few days/i;

export interface ExplicitMonthMention {
  month: number;
  year?: number;
}

export interface NlDateSanitizeResult {
  params: Record<string, any>;
  datesRejected: boolean;
  reason?: 'explicit_month_mismatch' | 'near_term_with_future_month';
  explicitMonths?: ExplicitMonthMention[];
}

export function normalizeNlDateOnly(dateStr: string | undefined): string | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
}

export function extractExplicitMonthsFromText(text: string): ExplicitMonthMention[] {
  if (!text?.trim()) return [];
  const found: ExplicitMonthMention[] = [];
  const seen = new Set<string>();

  const push = (month: number, year?: number) => {
    const key = `${year ?? 'any'}-${month}`;
    if (seen.has(key)) return;
    seen.add(key);
    const entry: ExplicitMonthMention = { month };
    if (year !== undefined) entry.year = year;
    found.push(entry);
  };

  // 2026年11月 / 11月2026年
  for (const m of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月/g)) {
    push(Number(m[2]), Number(m[1]));
  }
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{4})\s*年?/g)) {
    push(Number(m[1]), Number(m[2]));
  }

  // 十一月 / 11月
  for (const m of text.matchAll(/([一二三四五六七八九十]{1,3}月|\d{1,2}月)/g)) {
    const token = m[1];
    if (CHINESE_MONTHS[token]) {
      push(CHINESE_MONTHS[token]);
      continue;
    }
    const num = Number(token.replace('月', ''));
    if (num >= 1 && num <= 12) push(num);
  }

  // November / Nov (exclude when followed by a year — handled below)
  for (const m of text.matchAll(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b(?!\s+\d{4})/gi,
  )) {
    const key = m[1].toLowerCase();
    const full = key.length === 3
      ? ({ jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 } as Record<string, number>)[key]
      : ENGLISH_MONTHS[key];
    if (full) push(full);
  }

  // November 2026
  for (const m of text.matchAll(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi,
  )) {
    const month = ENGLISH_MONTHS[m[1].toLowerCase()];
    if (month) push(month, Number(m[2]));
  }

  return found;
}

export function extractExplicitMonthsFromTexts(texts: string[]): ExplicitMonthMention[] {
  const merged: ExplicitMonthMention[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const item of extractExplicitMonthsFromText(text)) {
      const key = `${item.year ?? 'any'}-${item.month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function daysUntilDate(dateStr: string, today = new Date()): number {
  const start = new Date(`${dateStr}T00:00:00`);
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - base.getTime()) / (24 * 60 * 60 * 1000));
}

function inferredDatesConflictWithExplicitMonths(
  startDate: string,
  explicitMonths: ExplicitMonthMention[],
): boolean {
  if (explicitMonths.length === 0) return false;
  const startMonth = Number(startDate.slice(5, 7));
  const startYear = Number(startDate.slice(0, 4));
  return explicitMonths.some((m) => {
    if (m.year !== undefined && m.year !== startYear) return true;
    return m.month !== startMonth;
  });
}

function hasNearTermInferenceSignals(texts: string[]): boolean {
  return texts.some((t) => NEAR_TERM_SIGNALS.test(t));
}

/**
 * 清除与用户文本矛盾的推断日期，并更新 inferredFields。
 */
export function sanitizeNlInferredDates(
  params: Record<string, any>,
  sourceTexts: string[],
): NlDateSanitizeResult {
  const inferred = Array.isArray(params.inferredFields) ? [...params.inferredFields] : [];
  const hasInferredDates = inferred.includes('startDate') || inferred.includes('endDate');
  const startDate = normalizeNlDateOnly(params.startDate);

  if (!hasInferredDates || !startDate) {
    return { params, datesRejected: false };
  }

  const explicitMonths = extractExplicitMonthsFromTexts(sourceTexts);
  const monthConflict = inferredDatesConflictWithExplicitMonths(startDate, explicitMonths);
  const nearTermDays = daysUntilDate(startDate);
  const nearTermWithFutureMonth =
    explicitMonths.length > 0 &&
    nearTermDays >= 0 &&
    nearTermDays <= 21 &&
    !hasNearTermInferenceSignals(sourceTexts) &&
    monthConflict;

  if (!monthConflict && !nearTermWithFutureMonth) {
    return { params, datesRejected: false, explicitMonths };
  }

  const next = { ...params };
  delete next.startDate;
  delete next.endDate;
  next.inferredFields = inferred.filter((f) => f !== 'startDate' && f !== 'endDate');
  next._datesRejected = true;
  next._dateSanitizeReason = monthConflict ? 'explicit_month_mismatch' : 'near_term_with_future_month';

  return {
    params: next,
    datesRejected: true,
    reason: monthConflict ? 'explicit_month_mismatch' : 'near_term_with_future_month',
    explicitMonths,
  };
}
