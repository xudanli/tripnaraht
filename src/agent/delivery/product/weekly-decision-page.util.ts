/**
 * Weekly Decision Page — 每周只收敛一页决策，不堆报告。
 * New Capability = NO 是有价值的正常结论。
 */

import type { V1JourneyId } from './v1-journey-contract.util';
import type { WeeklyBacklogItemV1 } from './weekly-release-review.util';

export const WEEKLY_DECISION_PAGE_SCHEMA =
  'nara.weekly_decision_page@v1' as const;

export type LayerVerdict = 'PASS' | 'WATCH' | 'FAIL';

export type WeeklyDecisionPageV1 = {
  schemaId: typeof WEEKLY_DECISION_PAGE_SCHEMA;
  version: 1;
  weekId: string;
  safety: LayerVerdict;
  reliability: LayerVerdict;
  taskSuccess: LayerVerdict;
  taskSuccessWatchJourney?: V1JourneyId;
  experience: LayerVerdict;
  experienceWatchTopicZh?: string;
  p0Count: number;
  p1Count: number;
  topDataGapZh: string | null;
  topFrictionZh: string | null;
  rcDecisionZh: string;
  /** 默认 NO；强迫归入 Bug/Data/UX/Existing Gap */
  newCapability: 'NO' | 'PROPOSAL_ONLY';
  newCapabilityNoteZh: string;
  /** 本周可以没有任何新研发任务 */
  noNewRdTasksIsNormal: true;
  zeroNewRdTasksThisWeek: boolean;
  reasonsZh: string[];
};

export function buildWeeklyDecisionPage(input: {
  weekId: string;
  safety: LayerVerdict;
  reliability: LayerVerdict;
  taskSuccess: LayerVerdict;
  taskSuccessWatchJourney?: V1JourneyId;
  experience: LayerVerdict;
  experienceWatchTopicZh?: string;
  backlog: WeeklyBacklogItemV1[];
  rcDecisionZh: string;
  newCapability?: 'NO' | 'PROPOSAL_ONLY';
  newCapabilityNoteZh?: string;
}): WeeklyDecisionPageV1 {
  const p0Count = input.backlog.filter((b) => b.kind === 'P0_INCIDENT').length;
  const p1Count = input.backlog.filter((b) => b.kind === 'P1_TASK_FAILURE')
    .length;
  const topDataGapZh =
    input.backlog.find((b) => b.kind === 'TOP_DATA_GAP')?.summaryZh ?? null;
  const topFrictionZh =
    input.backlog.find((b) => b.kind === 'TOP_EXPERIENCE_FRICTION')
      ?.summaryZh ?? null;

  const newCapability = input.newCapability ?? 'NO';
  const zeroNewRdTasksThisWeek =
    p0Count === 0 &&
    p1Count === 0 &&
    !topDataGapZh &&
    !topFrictionZh &&
    newCapability === 'NO' &&
    input.safety === 'PASS' &&
    input.reliability === 'PASS';

  const reasonsZh: string[] = [];
  if (zeroNewRdTasksThisWeek) {
    reasonsZh.push(
      '本周无新研发任务是正常结果：系统稳定，继续跑真实 Trip',
    );
  }
  if (newCapability === 'NO') {
    reasonsZh.push(
      'New Capability = NO：问题先归入 Bug / Data / UX / Existing Capability Gap',
    );
  }

  return {
    schemaId: WEEKLY_DECISION_PAGE_SCHEMA,
    version: 1,
    weekId: input.weekId,
    safety: input.safety,
    reliability: input.reliability,
    taskSuccess: input.taskSuccess,
    taskSuccessWatchJourney: input.taskSuccessWatchJourney,
    experience: input.experience,
    experienceWatchTopicZh: input.experienceWatchTopicZh,
    p0Count,
    p1Count,
    topDataGapZh,
    topFrictionZh,
    rcDecisionZh: input.rcDecisionZh,
    newCapability,
    newCapabilityNoteZh:
      input.newCapabilityNoteZh ??
      (newCapability === 'NO' ? '不立项新能力' : '仅提案，待人工审查'),
    noNewRdTasksIsNormal: true,
    zeroNewRdTasksThisWeek,
    reasonsZh,
  };
}
