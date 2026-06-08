/**
 * 绑定 Trip 的「今天 / 明天」时间锚：与 status 解耦，按墙钟与行程日期窗口判定阶段。
 *
 * - PRE_TRIP（today < start）：相对词锚定在 startDate（规划期语义）
 * - ON_TRIP（start ≤ today ≤ end）：相对词锚定在墙钟 today（即使用户未点「开始」）
 * - POST_TRIP（today > end）：相对词锚定在 endDate（事后改稿少见，避免漂到行程外）
 */

export type TripTemporalPhase = 'PRE_TRIP' | 'ON_TRIP' | 'POST_TRIP';

export type TripTemporalAnchorSource = 'wall_clock' | 'trip_start' | 'trip_end';

export interface TripTemporalAnchorInput {
  startDateYmd?: string;
  endDateYmd?: string;
  now?: Date;
}

export interface TripTemporalAnchor {
  phase: TripTemporalPhase;
  /** 解析「今天 / 明天 / 后天」时的基准日（YMD） */
  anchorYmd: string;
  /** 墙钟 UTC 日期（YMD） */
  todayYmd: string;
  /** 行程内第几天（1-based）；PRE_TRIP 固定为 1 */
  currentDayNumber: number;
  anchorSource: TripTemporalAnchorSource;
}

export function normalizeTripDateYmd(raw: string | undefined | null): string | undefined {
  const ymd = String(raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : undefined;
}

export function addUtcDaysToYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function tripDayNumberFromStart(startYmd: string, targetYmd: string): number | undefined {
  const startMs = Date.parse(`${startYmd}T12:00:00.000Z`);
  const targetMs = Date.parse(`${targetYmd}T12:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(targetMs)) return undefined;
  const n = Math.floor((targetMs - startMs) / 86_400_000) + 1;
  return n >= 1 ? n : undefined;
}

export function resolveTripTemporalAnchor(
  input: TripTemporalAnchorInput,
): TripTemporalAnchor | null {
  const now = input.now ?? new Date();
  const todayYmd = now.toISOString().slice(0, 10);
  const start = normalizeTripDateYmd(input.startDateYmd);
  const end = normalizeTripDateYmd(input.endDateYmd) ?? start;

  if (!start) {
    return {
      phase: 'ON_TRIP',
      anchorYmd: todayYmd,
      todayYmd,
      currentDayNumber: 1,
      anchorSource: 'wall_clock',
    };
  }

  let phase: TripTemporalPhase;
  if (todayYmd < start) {
    phase = 'PRE_TRIP';
  } else if (end && todayYmd > end) {
    phase = 'POST_TRIP';
  } else {
    phase = 'ON_TRIP';
  }

  let anchorYmd: string;
  let anchorSource: TripTemporalAnchorSource;
  if (phase === 'PRE_TRIP') {
    anchorYmd = start;
    anchorSource = 'trip_start';
  } else if (phase === 'POST_TRIP') {
    anchorYmd = end ?? todayYmd;
    anchorSource = 'trip_end';
  } else {
    anchorYmd = todayYmd;
    anchorSource = 'wall_clock';
  }

  let currentDayNumber = 1;
  if (phase === 'ON_TRIP') {
    currentDayNumber = tripDayNumberFromStart(start, todayYmd) ?? 1;
  } else if (phase === 'POST_TRIP' && end) {
    currentDayNumber = tripDayNumberFromStart(start, end) ?? 1;
  }

  return {
    phase,
    anchorYmd,
    todayYmd,
    currentDayNumber,
    anchorSource,
  };
}

/** 在 anchor 基础上解析相对日偏移（今天=0，明天=1…） */
export function resolveRelativeDayYmdFromAnchor(
  anchorYmd: string,
  relativeOffsetDays: number,
): string {
  return addUtcDaysToYmd(anchorYmd, relativeOffsetDays);
}
