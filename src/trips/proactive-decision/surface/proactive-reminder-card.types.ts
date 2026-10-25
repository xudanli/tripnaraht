/**
 * PD-6 — Three-layer proactive reminder card (UX freeze).
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';

export const PROACTIVE_REMINDER_CARD_SCHEMA =
  'nara.proactive_reminder_card@v1' as const;

export type ProactiveReminderCtaId =
  | 'VIEW_OPTIONS'
  | 'DEFER'
  | 'WHY';

export type ProactiveReminderCardV1 = {
  schemaId: typeof PROACTIVE_REMINDER_CARD_SCHEMA;
  version: 1;
  tripId: string;
  caseId: ProactiveDecisionCaseId;
  decisionProblemId?: string;
  interventionCandidateId?: string;
  /** Card title */
  titleZh: string;
  /** L1 — 发生了什么 */
  layer1WhatHappenedZh: string;
  /** L2 — 影响什么 */
  layer2WhatImpactedZh: string;
  /** L3 — Nara 建议 */
  layer3SuggestionZh: string;
  layer3BenefitsZh: string[];
  recommendedOptionId: ProactiveOptionId;
  ctas: Array<{ id: ProactiveReminderCtaId; labelZh: string }>;
  whyPreviewZh: string;
};
