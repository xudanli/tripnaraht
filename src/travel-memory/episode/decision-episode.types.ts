/**
 * Decision Episode — Situation → Decision → Choice → Outcome → Regret。
 * 比「用户喜欢冰川徒步」更有价值：保留「什么情况下」。
 */

export const DECISION_EPISODE_SCHEMA = 'tripnara.decision_episode@v1' as const;

export type DecisionEpisodeUserAction =
  | 'ACCEPT'
  | 'OVERRIDE'
  | 'REJECT_ALL'
  | 'NO_ACTION';

export type DecisionEpisodeV1 = {
  schemaId: typeof DECISION_EPISODE_SCHEMA;
  version: 1;
  episodeId: string;
  context: {
    tripId: string;
    day?: number | null;
    weatherRisk?: string | null;
    scheduleSlackMinutes?: number | null;
    decisionType?: string | null;
    worldStateNote?: string | null;
  };
  decision: {
    type: string;
    alternatives: string[];
    recommended?: string | null;
  };
  userAction: {
    type: DecisionEpisodeUserAction;
    selected?: string | null;
    reason?: string | null;
  };
  outcome?: {
    status?: string | null;
    completed?: boolean | null;
    fatigue?: string | null;
    scheduleDelayMinutes?: number | null;
    safetyIncident?: boolean | null;
  } | null;
  reflection?: {
    decisionRegret?: number | string | null;
    recommendationProblematic?: string | null;
    rootCause?: string | null;
  } | null;
  /** CGUS / TravelEvent 关联 */
  sourceRefs?: {
    cgusDecisionId?: string | null;
    travelEventIds?: string[];
  };
  /** Episode ≠ Preference；默认不可直接写入偏好 */
  mayPromoteToPreference: false;
};
