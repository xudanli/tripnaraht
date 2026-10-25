/**
 * Build L1 Passive banner for 今日行程 / 执行首页.
 */

import type { ProactiveReminderCardV1 } from './proactive-reminder-card.types';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';
import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import {
  PROACTIVE_L1_PASSIVE_BANNER_SCHEMA,
  type ProactiveL1PassiveBannerV1,
} from './proactive-l1-passive-banner.types';

export const L1_PASSIVE_DEFAULT_TITLE_ZH =
  'Nara 发现一个可能影响行程的变化' as const;

export function buildProactiveL1PassiveBanner(input: {
  tripId: string;
  caseId?: ProactiveDecisionCaseId | null;
  decisionProblemId?: string | null;
  card?: ProactiveReminderCardV1 | null;
  decisionTrace?: ProactiveDecisionTraceV1 | null;
}): ProactiveL1PassiveBannerV1 {
  const summaryZh =
    input.card?.layer1WhatHappenedZh?.trim() ||
    input.decisionTrace?.signal.summaryZh?.trim() ||
    '行程相关条件发生变化，可查看是否需要调整';

  const impactHintZh =
    input.card?.layer2WhatImpactedZh?.trim() ||
    (input.decisionTrace?.impact.affectedLabels.length
      ? `可能影响：${input.decisionTrace.impact.affectedLabels.join('、')}`
      : null);

  return {
    schemaId: PROACTIVE_L1_PASSIVE_BANNER_SCHEMA,
    version: 1,
    tripId: input.tripId,
    caseId: input.caseId ?? input.card?.caseId ?? null,
    decisionProblemId:
      input.decisionProblemId ?? input.card?.decisionProblemId ?? null,
    titleZh: L1_PASSIVE_DEFAULT_TITLE_ZH,
    summaryZh,
    impactHintZh,
    cta: {
      id: 'VIEW_OPTIONS',
      labelZh: '查看方案',
    },
    detailPathHint: `mobile/trips/${input.tripId}/execution/proactive-decision`,
  };
}
