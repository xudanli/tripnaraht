/** M10 Group Pulse — 成员状态与干预类型 */

export type PhysicalLevel = 'energetic' | 'normal' | 'fatigued' | 'exhausted';
export type EmotionalLevel = 'joyful' | 'stable' | 'low' | 'irritable';
export type SpendingLevel = 'surplus' | 'normal' | 'tight' | 'overspent';
export type SocialLevel = 'harmonious' | 'normal' | 'subtle' | 'tense';
export type DecisionFatigueLevel = 'fresh' | 'normal' | 'fatigued' | 'depleted';
export type ThermometerLevel = 'green' | 'yellow' | 'orange' | 'red';

export interface MoodCheckInput {
  score: number;
  source?: string;
}

export interface MicroFeedbackInput {
  score: number;
  context?: string;
  activityId?: string;
}

export interface MotionSignalInput {
  steps: number;
  avgSpeed?: number;
  restMinutes?: number;
}

export interface MemberStateVector {
  tripId: string;
  userId: string;
  dayNumber: number;
  physicalLevel: PhysicalLevel;
  emotionalLevel: EmotionalLevel;
  spendingLevel: SpendingLevel;
  socialLevel: SocialLevel;
  decisionFatigue: DecisionFatigueLevel;
  confidenceScore: number;
  signals: Record<string, unknown>;
  computedAt: string;
}

export interface TeamThermometerMemberCard {
  userId: string;
  displayName: string;
  level: ThermometerLevel;
}

export interface TeamThermometerSnapshot {
  tripId: string;
  dayNumber: number;
  level: ThermometerLevel;
  score: number;
  factors: Array<{ key: string; message: string; weight: number }>;
  memberCards: TeamThermometerMemberCard[];
  visible: boolean;
  computedAt: string;
}

export interface InterventionAction {
  id: string;
  label: string;
  actionType: string;
}

export interface InterventionCard {
  id: string;
  tripId: string;
  dayNumber: number;
  level: 1 | 2 | 3;
  ruleId: string;
  framing: 'positive';
  messageZh: string;
  actions: InterventionAction[];
  status: 'pending' | 'acknowledged' | 'dismissed';
  splitSessionId?: string | null;
  privateChannelAvailable?: boolean;
  createdAt: string;
}

export interface AckInterventionInput {
  action: 'acknowledge' | 'dismiss';
}
