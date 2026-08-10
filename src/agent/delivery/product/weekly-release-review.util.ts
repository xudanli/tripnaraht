/**
 * Weekly Nara Release Review — 只看四层，只产出四类 Backlog。
 * 会上禁止讨论「要不要再加一个 Agent 能力」，除非真实 Case 证明缺口。
 */

import type { V1JourneyId } from './v1-journey-contract.util';

export const WEEKLY_RELEASE_REVIEW_SCHEMA =
  'nara.weekly_release_review@v1' as const;

export type WeeklyBacklogKind =
  | 'P0_INCIDENT'
  | 'P1_TASK_FAILURE'
  | 'TOP_DATA_GAP'
  | 'TOP_EXPERIENCE_FRICTION';

export type WeeklyLayerNotesV1 = {
  safetyZh: string[];
  reliabilityZh: string[];
  /** 哪条 Journey 最差 */
  worstJourneyId?: V1JourneyId;
  taskSuccessZh: string[];
  experienceZh: string[];
};

export type WeeklyBacklogItemV1 = {
  kind: WeeklyBacklogKind;
  tripId: string;
  evidenceRef: string;
  summaryZh: string;
};

export type WeeklyReleaseReviewV1 = {
  schemaId: typeof WEEKLY_RELEASE_REVIEW_SCHEMA;
  version: 1;
  weekId: string;
  layers: WeeklyLayerNotesV1;
  backlog: WeeklyBacklogItemV1[];
  /** 禁止默认讨论新 Agent 能力 */
  agentCapabilityDiscussionForbiddenUnlessProvenGap: true;
  reasonsZh: string[];
};

export function conductWeeklyNaraReleaseReview(input: {
  weekId: string;
  layers: WeeklyLayerNotesV1;
  backlog: WeeklyBacklogItemV1[];
  proposedAgentCapabilityDiscussion?: string;
}): WeeklyReleaseReviewV1 {
  const allowed = new Set<WeeklyBacklogKind>([
    'P0_INCIDENT',
    'P1_TASK_FAILURE',
    'TOP_DATA_GAP',
    'TOP_EXPERIENCE_FRICTION',
  ]);
  for (const b of input.backlog) {
    if (!allowed.has(b.kind)) {
      throw new Error(
        `[WeeklyReview] backlog_kind_forbidden:${b.kind}:only_P0_P1_DataGap_ExperienceFriction`,
      );
    }
    if (!b.tripId.trim() || !b.evidenceRef.trim()) {
      throw new Error('[WeeklyReview] backlog_requires_trip_and_evidence');
    }
  }

  const reasonsZh: string[] = [
    'Weekly Review 仅看 Safety / Reliability / Task Success / Experience',
    '只产出 P0 Incident / P1 Task Failure / Top Data Gap / Top Experience Friction',
  ];
  if (input.proposedAgentCapabilityDiscussion?.trim()) {
    reasonsZh.push(
      `拒绝议程「${input.proposedAgentCapabilityDiscussion}」：除非真实 Case 证明缺能力，否则不讨论新 Agent 能力`,
    );
  }

  return {
    schemaId: WEEKLY_RELEASE_REVIEW_SCHEMA,
    version: 1,
    weekId: input.weekId,
    layers: input.layers,
    backlog: input.backlog,
    agentCapabilityDiscussionForbiddenUnlessProvenGap: true,
    reasonsZh,
  };
}
