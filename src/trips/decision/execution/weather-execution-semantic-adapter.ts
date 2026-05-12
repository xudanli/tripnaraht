/**
 * 统一「天气 / 执行语义」视图，避免 ConstraintChecker 与引擎管道各读一套字段。
 *
 * 优先：executionState、violation、结构化 hazards（含 severity）
 * 兼容：旧版 condition（rain/storm）与 critical alerts
 */

import type {
  ExecutionQualitySummary,
  ExecutionState,
  TravelHazard,
} from '../hazard/travel-hazard.types';

/** 与 mergeWeatherDecisionEvidenceIntoSignals 写入的每日快照对齐（ExternalSignalsState.weatherByDate） */
export interface WeatherExecutionSignal {
  executionState?: ExecutionState;
  violation?: 'HARD' | 'SOFT' | 'NONE';
  hazardKinds?: string[];
  hazards?: TravelHazard[];
  executionQuality?: ExecutionQualitySummary;
  crosswindRisk?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  suggestedAction?: 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED';
  explanation?: string;
  windSpeedMs?: number;
  windDirectionDeg?: number;
  visibilityKm?: number;
  precipitationMm?: number;
  weatherSource?: string;
  resolvedLat?: number;
  resolvedLng?: number;
  recommendedExtraDriveMinutes?: number;
  accumulatedGlobalSlackMinutes?: number;
  updatedAt?: string;
  /** `'weather_decision_evidence'` | 自定义来源标识 */
  source?: string;
  /** @deprecated 仅向后兼容旧 publisher */
  condition?: string;
}

const SEVERITY_RANK: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  EXTREME: 4,
};

function hasStructuredHazardAtLeast(
  hazards: TravelHazard[] | undefined,
  min: keyof typeof SEVERITY_RANK,
): boolean {
  if (!hazards?.length) {
    return false;
  }
  const floor = SEVERITY_RANK[min];
  return hazards.some(h => (SEVERITY_RANK[h.severity] ?? 0) >= floor);
}

export interface WeatherExecutionDayStressResult {
  adverse: boolean;
  /** 人类可读 / 可记录的原因标签 */
  reasons: string[];
}

/**
 * 当日是否构成「户外敏感活动」语境下的不利天气（与旧 condition+alerts 意图对齐，单一真相源）。
 */
export function weatherExecutionDayStress(input: {
  signal: WeatherExecutionSignal | Record<string, unknown> | undefined | null;
  /** 全局严重告警（沿用旧 checker 行为） */
  hasCriticalAlerts: boolean;
  /** 结构化 hazard 至少达到该严重度才单独视为不利（默认同 MEDIUM，避免仅 LOW 侧风误报） */
  minHazardSeverity?: keyof typeof SEVERITY_RANK;
}): WeatherExecutionDayStressResult {
  const { signal, hasCriticalAlerts } = input;
  const minSev = input.minHazardSeverity ?? 'MEDIUM';
  const reasons: string[] = [];

  if (hasCriticalAlerts) {
    reasons.push('critical_alerts');
    return { adverse: true, reasons };
  }

  if (!signal || typeof signal !== 'object') {
    return { adverse: false, reasons: [] };
  }

  const viol = signal.violation as string | undefined;
  if (viol && viol !== 'NONE') {
    reasons.push(`violation:${viol}`);
    return { adverse: true, reasons };
  }

  const es = signal.executionState as ExecutionState | undefined;
  if (es && es !== 'EXECUTABLE') {
    reasons.push(`executionState:${es}`);
    return { adverse: true, reasons };
  }

  const hazards = signal.hazards as TravelHazard[] | undefined;
  if (hasStructuredHazardAtLeast(hazards, minSev)) {
    reasons.push(`hazards>=${minSev}`);
    return { adverse: true, reasons };
  }

  const cond = signal.condition as string | undefined;
  if (cond === 'rain' || cond === 'storm') {
    reasons.push(`legacy_condition:${cond}`);
    return { adverse: true, reasons };
  }

  return { adverse: false, reasons: [] };
}
