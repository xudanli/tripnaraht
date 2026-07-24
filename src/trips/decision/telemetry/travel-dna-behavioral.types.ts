/**
 * Travel DNA — 行为反推偏好标签（非心理测评）
 *
 * 从用户真实决策中推断，不依赖 MBTI 或问卷。
 */

/** 行为偏好标签（可扩展） */
export type TravelDnaBehavioralTag =
  | 'ANTI_TOURIST'
  | 'PHOTO_EXPLORER'
  | 'ADVENTURE_LOVER'
  | 'COMFORT_SEEKER'
  | 'BUDGET_CONSCIOUS'
  | 'PRIVACY_PREFERRED'
  | 'FLEXIBLE_PLANNER'
  | 'RISK_AVERSE'
  | 'LOCAL_CULTURE'
  | 'SELF_DRIVE';

export interface TravelDnaBehavioralTagScore {
  tag: TravelDnaBehavioralTag;
  score: number;
  evidenceCount: number;
  lastSeenAt: string;
}

/** 写入 UserTravelProfile.extended_profile.travel_dna_behavioral */
export interface TravelDnaBehavioralProfile {
  version: 1;
  tags: TravelDnaBehavioralTagScore[];
  confidence: number;
  sampleCount: number;
  lastInferredAt: string;
  source: 'decision_telemetry';
}
