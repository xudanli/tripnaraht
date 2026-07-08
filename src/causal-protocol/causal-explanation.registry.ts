/**
 * explanationKey templates — Narrative Projection resolves keys, not raw internal ids.
 */

export const CAUSAL_EXPLANATION_KEYS = {
  ICELAND_WIND_GUST: 'iceland.wind_gust',
  ICELAND_SEGMENT_P90_INCREASE: 'iceland.segment_travel_time_p90_increase',
  ICELAND_APPOINTMENT_MISS_RISK: 'iceland.appointment_miss_probability',
  BOOKING_BUFFER_SHORTFALL: 'schedule.booking_buffer_shortfall',
  TRAVEL_BUFFER_TIGHT: 'transport.travel_buffer_tight',
  PROBLEM_ASSERTION: 'constraint.problem_assertion',
} as const;

export type CausalExplanationKey =
  (typeof CAUSAL_EXPLANATION_KEYS)[keyof typeof CAUSAL_EXPLANATION_KEYS];

/** Resolve user-facing text for P2; v1 returns key as placeholder when template missing. */
export function resolveCausalExplanation(key: CausalExplanationKey, ctx?: Record<string, unknown>): string {
  switch (key) {
    case CAUSAL_EXPLANATION_KEYS.ICELAND_WIND_GUST:
      return `预计出现 ${ctx?.windMps ?? '?'} m/s 阵风，影响路段通行速度`;
    case CAUSAL_EXPLANATION_KEYS.ICELAND_SEGMENT_P90_INCREASE:
      return `该路段 P90 通行时间增加约 ${ctx?.deltaMinutes ?? '?'} 分钟`;
    case CAUSAL_EXPLANATION_KEYS.ICELAND_APPOINTMENT_MISS_RISK:
      return `错过预约的概率约为 ${Math.round(Number(ctx?.missProbability ?? 0) * 100)}%`;
    case CAUSAL_EXPLANATION_KEYS.BOOKING_BUFFER_SHORTFALL:
      return `预约缓冲不足（约 ${ctx?.bufferMinutes ?? '?'} 分钟）`;
    case CAUSAL_EXPLANATION_KEYS.TRAVEL_BUFFER_TIGHT:
      return '抵达后交通缓冲偏紧';
    default:
      return key;
  }
}
