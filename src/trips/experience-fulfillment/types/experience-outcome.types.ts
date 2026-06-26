/**
 * Experience Outcome Graph — PRD §14（行中/行后兑现记录）
 */

import type { ExperienceAtomCode } from './experience-atom.types';

/** PRD §14.3 体验标签匹配反馈选项 */
export type ExperienceTagMatchOption =
  | 'REMOTE_WORLD_EDGE'
  | 'EPIC_BUT_CROWDED'
  | 'GOOD_BUT_ORDINARY'
  | 'ENVIRONMENT_PRESSURE'
  | 'NOT_AS_EXPECTED';

export const EXPERIENCE_TAG_MATCH_OPTIONS: ReadonlyArray<{
  value: ExperienceTagMatchOption;
  labelZh: string;
  mapsToAtom?: ExperienceAtomCode;
}> = [
  { value: 'REMOTE_WORLD_EDGE', labelZh: '世界尽头', mapsToAtom: 'REMOTE_WORLD_EDGE' },
  { value: 'EPIC_BUT_CROWDED', labelZh: '壮阔但热闹' },
  { value: 'GOOD_BUT_ORDINARY', labelZh: '好看但普通' },
  { value: 'ENVIRONMENT_PRESSURE', labelZh: '环境压迫', mapsToAtom: 'WILD_COAST_SOLITUDE' },
  { value: 'NOT_AS_EXPECTED', labelZh: '没有预期中特别' },
];

export interface ExperienceOutcomeRecord {
  id: string;
  tripId: string;
  memberId: string;
  recordedAt: string;
  activityName?: string;
  triggerType: string;
  experienceTagMatch?: ExperienceTagMatchOption;
  expectationConfirmation?: number;
  emotionalValueScore?: number;
  /** 与规划期预期 atom 是否对齐 */
  matchedExpectedAtom?: ExperienceAtomCode;
  fulfillmentAligned: boolean;
  freeText?: string;
}

export interface ExperienceFulfillmentReview {
  plannedIntents: string[];
  outcomeCount: number;
  alignedCount: number;
  alignmentRate: number;
  topMatchedTags: Array<{ tag: ExperienceTagMatchOption; count: number }>;
  summaryZh: string;
}
