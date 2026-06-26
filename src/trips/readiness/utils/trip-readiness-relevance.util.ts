import { DateTime } from 'luxon';
import { TripStatus, normalizeTripStatus } from '../../dto/trip-status.dto';

/** 临行前窗口：此天数内才展示路况/实时天气等「现在就要查」的提醒 */
export const ACTIONABLE_READINESS_HORIZON_DAYS = 14;

export type TripReadinessPhase = 'planning' | 'pre_departure' | 'in_trip' | 'past';

export interface TripReadinessPhaseInfo {
  phase: TripReadinessPhase;
  daysUntilStart: number;
  actionableFrom: string;
  deferredLiveRiskCount: number;
  phaseHint: { zh: string; en: string };
}

export interface RelevanceFilterableRisk {
  type?: string;
  message?: string;
  summary?: string;
  description?: string;
  sourceType?: string;
  category?: string;
  isGenericTemplate?: boolean;
  severity?: 'high' | 'medium' | 'low' | string;
}

const LIVE_CHECK_PATTERNS: RegExp[] = [
  /出发前.*(查看|查询|检查).*(路况|天气|road|weather)/i,
  /(查看|查询|check).*(road\.is|175\.no|路况)/i,
  /请注意道路状况/i,
  /请出发前查询路况/i,
  /check.*(road|weather).*before departure/i,
  /road closure.*(查询|check)/i,
];

const STRUCTURAL_KEEP_PATTERNS: RegExp[] = [
  /四驱|4x4|4wd/i,
  /f[\s-]?路|f-road|highland road/i,
  /冬季.*关闭|seasonal.*clos|封路/i,
  /越野|off-road/i,
  /偏远|remote/i,
];

function isWeatherCategoryRisk(risk: RelevanceFilterableRisk): boolean {
  if (risk.category === 'weather') return true;
  const t = (risk.type || '').toUpperCase();
  return t === 'WEATHER' || t === 'WEATHER_EXTREME' || t === 'WEA';
}

function riskText(risk: RelevanceFilterableRisk): string {
  return [risk.message, risk.summary, risk.description].filter(Boolean).join(' ');
}

export function getDaysUntilTripStart(startDate: Date): number {
  const start = DateTime.fromJSDate(startDate).startOf('day');
  const today = DateTime.now().startOf('day');
  return Math.ceil(start.diff(today, 'days').days);
}

export function getDaysUntilTripEnd(endDate: Date): number {
  const end = DateTime.fromJSDate(endDate).startOf('day');
  const today = DateTime.now().startOf('day');
  return Math.ceil(end.diff(today, 'days').days);
}

export interface TripReadinessPhaseOptions {
  endDate?: Date;
  status?: string | null;
}

/** 日历上是否处于行程窗口 [startDate, endDate]（含首尾） */
export function isCalendarInTripWindow(startDate: Date, endDate: Date): boolean {
  const daysUntilStart = getDaysUntilTripStart(startDate);
  const daysUntilEnd = getDaysUntilTripEnd(endDate);
  return daysUntilStart <= 0 && daysUntilEnd >= 0;
}

export function getTripReadinessPhase(
  startDate: Date,
  options?: TripReadinessPhaseOptions,
): TripReadinessPhase {
  const status = options?.status ? normalizeTripStatus(options.status) : undefined;
  const endDate = options?.endDate;

  if (status === TripStatus.COMPLETED || status === TripStatus.CANCELLED) {
    return 'past';
  }

  if (status === TripStatus.TRAVELING) {
    return 'in_trip';
  }

  const daysUntilStart = getDaysUntilTripStart(startDate);

  if (endDate && isCalendarInTripWindow(startDate, endDate)) {
    return 'in_trip';
  }

  if (daysUntilStart < 0) {
    if (endDate && getDaysUntilTripEnd(endDate) >= 0) {
      return 'in_trip';
    }
    return 'past';
  }

  if (daysUntilStart === 0) {
    return 'in_trip';
  }

  if (daysUntilStart <= ACTIONABLE_READINESS_HORIZON_DAYS) {
    return 'pre_departure';
  }

  return 'planning';
}

export function getActionableFromDate(startDate: Date): string {
  return DateTime.fromJSDate(startDate)
    .minus({ days: ACTIONABLE_READINESS_HORIZON_DAYS })
    .toISODate()!;
}

/**
 * 「临行提醒」：依赖实时路况/天气、对用户此刻无行动价值。
 * 规划期（如 6 个月后）应隐藏，避免信息过载。
 */
export function isActionableLiveRisk(risk: RelevanceFilterableRisk): boolean {
  if (risk.sourceType === 'weather_forecast') {
    return true;
  }

  if (risk.isGenericTemplate) {
    return true;
  }

  if (isWeatherCategoryRisk(risk)) {
    if (STRUCTURAL_KEEP_PATTERNS.some((pattern) => pattern.test(riskText(risk)))) {
      return false;
    }
    return true;
  }

  const text = riskText(risk);

  if (LIVE_CHECK_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (STRUCTURAL_KEEP_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (risk.type === 'driving_conditions') {
    return /路况|road\.is|175\.no|道路状况|road condition/i.test(text);
  }

  if (risk.type === 'road_closure' || risk.type === 'winter_road_condition') {
    return true;
  }

  if (risk.type === 'winter_driving') {
    return true;
  }

  if (/冬季行驶|日照时间短|建议早出发|冬季前往自然景点/.test(text)) {
    return true;
  }

  return false;
}

export interface SegmentHazardLike {
  type: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export function filterSegmentHazardsForTripPhase<T extends SegmentHazardLike>(
  hazards: T[],
  startDate: Date,
): T[] {
  if (getTripReadinessPhase(startDate) !== 'planning') {
    return hazards;
  }
  return hazards.filter((hazard) => !isActionableLiveRisk(hazard));
}

export function buildCoveragePhaseMeta(
  startDate: Date,
  options?: TripReadinessPhaseOptions,
): {
  readinessPhase: TripReadinessPhase;
  daysUntilStart: number;
  phaseHint: { zh: string; en: string };
} {
  const daysUntilStart = getDaysUntilTripStart(startDate);
  const phase = getTripReadinessPhase(startDate, options);
  return {
    readinessPhase: phase,
    daysUntilStart,
    phaseHint: {
      zh:
        phase === 'planning'
          ? `行程尚早（${daysUntilStart} 天后出发）。路段路况与冬季驾驶提醒将在出发前 ${ACTIONABLE_READINESS_HORIZON_DAYS} 天内显示。`
          : phase === 'in_trip'
            ? '行中展示「今日就绪」，整趟行前准备度已归档至准备度页。'
            : '',
      en:
        phase === 'planning'
          ? `Trip starts in ${daysUntilStart} days. Segment road and winter driving alerts appear within ${ACTIONABLE_READINESS_HORIZON_DAYS} days of departure.`
          : phase === 'in_trip'
            ? 'In-trip shows today execution readiness; full pre-departure checklist lives under Readiness.'
            : '',
    },
  };
}

export function filterRisksForTripPhase<T extends RelevanceFilterableRisk>(
  risks: T[],
  startDate: Date,
): { risks: T[]; phaseInfo: TripReadinessPhaseInfo } {
  const daysUntilStart = getDaysUntilTripStart(startDate);
  const phase = getTripReadinessPhase(startDate);
  const actionableFrom = getActionableFromDate(startDate);

  if (phase !== 'planning') {
    return {
      risks,
      phaseInfo: {
        phase,
        daysUntilStart,
        actionableFrom,
        deferredLiveRiskCount: 0,
        phaseHint: { zh: '', en: '' },
      },
    };
  }

  const filtered = risks.filter((risk) => !isActionableLiveRisk(risk));
  const deferredLiveRiskCount = risks.length - filtered.length;

  return {
    risks: filtered,
    phaseInfo: {
      phase,
      daysUntilStart,
      actionableFrom,
      deferredLiveRiskCount,
      phaseHint: {
        zh: `行程尚早（${daysUntilStart} 天后出发）。实时路况与逐日天气将在出发前 ${ACTIONABLE_READINESS_HORIZON_DAYS} 天内显示，避免无效提醒。`,
        en: `Trip starts in ${daysUntilStart} days. Live road and weather alerts appear within ${ACTIONABLE_READINESS_HORIZON_DAYS} days of departure.`,
      },
    },
  };
}
