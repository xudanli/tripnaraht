/**
 * 原因 vs 结果 — 防止环境问题污染成人的偏好（假因果）。
 *
 * 例：取消冰川 + 当天暴风雪 → 不能学成「用户不喜欢冰川」。
 */

export type CausalFactorKind =
  | 'WEATHER'
  | 'PRICE'
  | 'TIME_SHORTAGE'
  | 'SCHEDULE_SLACK'
  | 'ACTIVITY_DURATION'
  | 'FATIGUE'
  | 'TEAM_DISAGREEMENT'
  | 'ROAD_STATUS'
  | 'BOOKING'
  | 'SAFETY'
  | 'UNKNOWN';

export type CausalFactor = {
  factor: CausalFactorKind;
  weight: number;
  note?: string;
};

export type DecisionOutcomePolarity = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'UNKNOWN';

export type CausalAttributionV1 = {
  schemaId: 'tripnara.causal_attribution@v1';
  version: 1;
  decisionOutcome: {
    result: DecisionOutcomePolarity;
  };
  causalFactors: CausalFactor[];
  /**
   * 归因到「用户偏好」的残余信号。
   * 环境主导时必须压低（如 weather weight 高 → preference confidence 低）。
   */
  userPreferenceSignal: {
    confidence: number;
    /** 环境/情境主导时 true：禁止升偏好 */
    situationalDominant: boolean;
  };
};

/** 环境/情境类因子：高权重时不得学成 preference */
export const SITUATIONAL_CAUSAL_FACTORS: ReadonlySet<CausalFactorKind> = new Set([
  'WEATHER',
  'PRICE',
  'TIME_SHORTAGE',
  'SCHEDULE_SLACK',
  'ROAD_STATUS',
  'BOOKING',
  'SAFETY',
  'TEAM_DISAGREEMENT',
  'FATIGUE',
]);

/**
 * 从 Episode 与可选世界提示估计因果分解（P0 启发式；真 Trip 校准）。
 */
export function estimateCausalAttribution(input: {
  outcomePolarity: DecisionOutcomePolarity;
  weatherRisk?: string | null;
  scheduleDelayMinutes?: number | null;
  fatigue?: string | null;
  safetyIncident?: boolean | null;
  overrideReason?: string | null;
}): CausalAttributionV1 {
  const factors: CausalFactor[] = [];
  const reason = (input.overrideReason ?? '').toLowerCase();

  if (
    input.weatherRisk &&
    /HIGH|STORM|WIND|SNOW|暴风|风|雪/.test(input.weatherRisk)
  ) {
    factors.push({ factor: 'WEATHER', weight: 0.8, note: input.weatherRisk });
  }
  if ((input.scheduleDelayMinutes ?? 0) >= 60) {
    factors.push({
      factor: 'SCHEDULE_SLACK',
      weight: 0.45,
      note: `delay=${input.scheduleDelayMinutes}m`,
    });
  }
  if (input.fatigue === 'HIGH' || /累|疲劳|tired|fatigue/.test(reason)) {
    factors.push({ factor: 'FATIGUE', weight: 0.5 });
  }
  if (input.safetyIncident) {
    factors.push({ factor: 'SAFETY', weight: 0.9 });
  }
  if (/price|贵|便宜|预算/.test(reason)) {
    factors.push({ factor: 'PRICE', weight: 0.55 });
  }
  if (/时长|太长|5h|hours|duration/.test(reason)) {
    factors.push({ factor: 'ACTIVITY_DURATION', weight: 0.55 });
  }
  if (/时间|赶|不够/.test(reason)) {
    factors.push({ factor: 'TIME_SHORTAGE', weight: 0.5 });
  }

  if (factors.length === 0) {
    factors.push({ factor: 'UNKNOWN', weight: 0.3 });
  }

  // 归一化权重
  const sum = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const normalized = factors.map((f) => ({
    ...f,
    weight: Math.round((f.weight / sum) * 1000) / 1000,
  }));

  const situationalWeight = normalized
    .filter((f) => SITUATIONAL_CAUSAL_FACTORS.has(f.factor))
    .reduce((s, f) => s + f.weight, 0);

  const situationalDominant = situationalWeight >= 0.5;
  const preferenceConfidence = situationalDominant
    ? Math.max(0.05, 0.35 * (1 - situationalWeight))
    : Math.min(0.55, 0.4 * (1 - situationalWeight * 0.5));

  return {
    schemaId: 'tripnara.causal_attribution@v1',
    version: 1,
    decisionOutcome: { result: input.outcomePolarity },
    causalFactors: normalized,
    userPreferenceSignal: {
      confidence: Math.round(preferenceConfidence * 100) / 100,
      situationalDominant,
    },
  };
}
