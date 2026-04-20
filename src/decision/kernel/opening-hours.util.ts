/**
 * Google Places 风格 opening_hours 的到达时刻判定（决策内核侧，与 common/utils 字符串解析互补）。
 * @see https://developers.google.com/maps/documentation/places/web-service/details#PlaceOpeningHours
 */

export type GooglePeriodPoint = { day: number; time: string };

export type GoogleOpeningPeriod = {
  open?: GooglePeriodPoint;
  close?: GooglePeriodPoint;
};

export type GoogleOpeningHoursLike = {
  periods?: GoogleOpeningPeriod[];
  weekday_text?: string[];
  open_now?: boolean;
  is_open_now?: boolean;
};

export type OpeningHoursEvidenceKind = 'PERIODS' | 'IS_OPEN_NOW_ONLY' | 'WEEKDAY_TEXT_ONLY' | 'NONE';

export type IsOpenAtResult = {
  open: boolean;
  /** 无法做远期结构化判断，仅能用弱证据推测 */
  degraded: boolean;
  evidence: OpeningHoursEvidenceKind;
};

const MINUTES_PER_WEEK = 7 * 24 * 60;

function parseGoogleTimeToMinutes(hhmm: string | undefined): number | undefined {
  if (hhmm == null) return undefined;
  const digits = String(hhmm).replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 4) return undefined;
  const padded = digits.padStart(4, '0');
  const h = Number(padded.slice(0, 2));
  const m = Number(padded.slice(2, 4));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 24 || m > 59) return undefined;
  if (h === 24 && m !== 0) return undefined;
  return h * 60 + m;
}

/** Google：0 = Sunday … 6 = Saturday（与 Date#getUTCDay() 一致） */
export function arrivalToWeekMinutesUtc(arrival: Date): number {
  const day = arrival.getUTCDay();
  return day * 24 * 60 + arrival.getUTCHours() * 60 + arrival.getUTCMinutes();
}

function periodToIntervalMinutes(open: GooglePeriodPoint, close: GooglePeriodPoint | undefined): [number, number] | undefined {
  const oDay = open.day;
  const oMin = parseGoogleTimeToMinutes(open.time);
  if (oDay == null || !Number.isFinite(oDay) || oMin === undefined) return undefined;

  const openAbs = oDay * 24 * 60 + oMin;

  if (!close) {
    /** 无 close：保守视为从 open 起连续 24h（弱语义；优先应有 close） */
    return [openAbs, openAbs + 24 * 60];
  }

  const cDay = close.day;
  const cMin = parseGoogleTimeToMinutes(close.time);
  if (cDay == null || !Number.isFinite(cDay) || cMin === undefined) return undefined;

  /** 同日 0000–0000：常见于「全天」单段 */
  if (cDay === oDay && close.time === '0000' && open.time === '0000') {
    return [openAbs, openAbs + 24 * 60];
  }
  /** Google：同日 close.time=0000 且 open 非 0 时常表示「打烊到当天午夜」 */
  if (cDay === oDay && close.time === '0000' && open.time !== '0000') {
    const closeAbs = oDay * 24 * 60 + 24 * 60;
    return closeAbs > openAbs ? [openAbs, closeAbs] : undefined;
  }

  let closeAbs = cDay * 24 * 60 + cMin;
  /** 闭店在下一周或次日：close 在周分钟轴上不大于 open */
  while (closeAbs <= openAbs) {
    closeAbs += MINUTES_PER_WEEK;
  }
  if (closeAbs - openAbs > 14 * 24 * 60) {
    closeAbs = openAbs + 7 * 24 * 60;
  }
  return [openAbs, closeAbs];
}

function instantInInterval(t: number, openAbs: number, closeAbs: number): boolean {
  for (const shift of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
    const tt = t + shift;
    if (tt >= openAbs && tt < closeAbs) return true;
  }
  return false;
}

/**
 * 是否仅在 `is_open_now` / `weekday_text` 等弱证据下工作（无 periods）。
 */
export function classifyOpeningHoursEvidence(oh: GoogleOpeningHoursLike | undefined | null): OpeningHoursEvidenceKind {
  if (!oh || typeof oh !== 'object') return 'NONE';
  if (Array.isArray(oh.periods) && oh.periods.length > 0) return 'PERIODS';
  if (oh.weekday_text && oh.weekday_text.length > 0) return 'WEEKDAY_TEXT_ONLY';
  if (typeof oh.is_open_now === 'boolean' || typeof oh.open_now === 'boolean') return 'IS_OPEN_NOW_ONLY';
  return 'NONE';
}

/**
 * 基于 Google Places `periods` 判断到达时刻是否处于营业区间内（UTC 与 periods 对齐）。
 * 无 periods 时：不抛错；若仅有 is_open_now，则 degraded=true，open 取该布尔值（远期置信度低）。
 */
export function isOpenAt(oh: GoogleOpeningHoursLike | undefined | null, arrival: Date): IsOpenAtResult {
  const evidence = classifyOpeningHoursEvidence(oh);
  if (!oh || typeof oh !== 'object') {
    return { open: true, degraded: true, evidence: 'NONE' };
  }

  if (evidence === 'PERIODS' && Array.isArray(oh.periods)) {
    const t = arrivalToWeekMinutesUtc(arrival);
    for (const p of oh.periods) {
      if (!p?.open) continue;
      const iv = periodToIntervalMinutes(p.open, p.close);
      if (!iv) continue;
      const [a, b] = iv;
      if (instantInInterval(t, a, b)) {
        return { open: true, degraded: false, evidence: 'PERIODS' };
      }
    }
    return { open: false, degraded: false, evidence: 'PERIODS' };
  }

  if (evidence === 'IS_OPEN_NOW_ONLY') {
    const v = typeof oh.is_open_now === 'boolean' ? oh.is_open_now : oh.open_now;
    return {
      open: !!v,
      degraded: true,
      evidence: 'IS_OPEN_NOW_ONLY',
    };
  }

  if (evidence === 'WEEKDAY_TEXT_ONLY') {
    /** 不做自然语言解析：无法对 arrival 做强判断，标记降级并放行（由上层发 CONFIDENCE_DEGRADED） */
    return { open: true, degraded: true, evidence: 'WEEKDAY_TEXT_ONLY' };
  }

  return { open: true, degraded: true, evidence: 'NONE' };
}
