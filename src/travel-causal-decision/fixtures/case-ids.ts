export const STANDARD_CAUSAL_CASE_IDS = {
  STRONG_WIND_APPOINTMENT: 'case.strong-wind-appointment',
  ROAD_CLOSURE_OVERNIGHT: 'case.road-closure-overnight',
  MEMBER_FATIGUE: 'case.member-fatigue',
} as const;

export type StandardCausalCaseId =
  (typeof STANDARD_CAUSAL_CASE_IDS)[keyof typeof STANDARD_CAUSAL_CASE_IDS];
