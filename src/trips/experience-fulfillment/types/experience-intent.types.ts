/**
 * Experience Intent — 结构化体验意图（PRD §8.1）
 */

import type { ExperienceAtomCode, ExperienceIntentPriority } from './experience-atom.types';

export type NegativePreferenceType =
  | 'HIGH_CROWD'
  | 'HIGH_PHYSICAL_EFFORT'
  | 'LONG_DRIVE'
  | 'COMMERCIALIZED'
  | 'WEATHER_EXPOSURE'
  | 'LATE_NIGHT';

export interface ExperienceIntentAtom {
  atom: ExperienceAtomCode;
  /** 期望强度 0..1 */
  weight: number;
  priority?: ExperienceIntentPriority;
  /** 仅适用于部分参与者（participant id / role slug） */
  participants?: readonly string[];
}

export interface NegativePreference {
  type: NegativePreferenceType;
  weight: number;
}

export interface ExperienceIntentDigest {
  /** Schema revision for forward compatibility */
  revision: 'v1';
  experienceIntents: readonly ExperienceIntentAtom[];
  negativePreferences: readonly NegativePreference[];
  /** 推断置信度 0..1 */
  confidence?: number;
  /** 来源：rule | llm | hybrid */
  source?: 'rule' | 'llm' | 'hybrid';
}

/** 旅行理解卡 — PRD §9.2 结构化摘要 */
export interface TravelUnderstandingCard {
  revision: 'v1';
  travelGoals: readonly string[];
  memberConditions: readonly string[];
  coreConstraints: readonly string[];
  systemAssumptions: readonly string[];
  experienceIntent: ExperienceIntentDigest;
}
