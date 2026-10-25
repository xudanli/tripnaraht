/**
 * PD-7 — Proactive Change Draft (Preview → Confirm → Apply).
 * Projects onto conversation change_draft shape; Apply authority = RFC-001 finalize (ADR-012).
 */

import type { ChangeDraftCardV1 } from '../../../agent/delivery/conversation/conversation-turn-result.types';
import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';
import type { ProactiveReminderCtaId } from '../surface/proactive-reminder-card.types';

export const PROACTIVE_CHANGE_DRAFT_SCHEMA =
  'nara.proactive_change_draft@v1' as const;

export type ProactiveChangeDraftStatus =
  | 'OPEN'
  | 'WAIT_CONFIRM'
  | 'CONFIRMED'
  | 'APPLIED'
  | 'DEFERRED'
  | 'CANCELLED';

export type ProactiveChangeDraftV1 = {
  schemaId: typeof PROACTIVE_CHANGE_DRAFT_SCHEMA;
  version: 1;
  draftId: string;
  tripId: string;
  caseId: ProactiveDecisionCaseId;
  decisionProblemId?: string;
  interventionCandidateId?: string;
  recommendedOptionId: ProactiveOptionId;
  status: ProactiveChangeDraftStatus;
  /** Preview-only until Confirm */
  previewOnly: true;
  /** Conversation-compatible card projection */
  changeDraftCard: ChangeDraftCardV1;
  whyZh: string;
  /** Authority write chain (ADR-012) */
  applyAuthority: 'RFC001_FINALIZE';
  /** Confirm 前禁止 Apply */
  applyAllowed: boolean;
  verifyOk: boolean;
  receipt?: ProactiveApplyReceiptV1;
  createdAt: string;
  updatedAt: string;
};

export type ProactiveApplyReceiptV1 = {
  actionId: string;
  appliedAt: string;
  decisionProblemId?: string;
  planVersionId?: string;
  appliedToItinerary: boolean;
  authority: 'RFC001_FINALIZE';
};

export type ProactiveCtaResultV1 =
  | {
      action: 'VIEW_OPTIONS';
      draft: ProactiveChangeDraftV1;
      preview: ChangeDraftCardV1;
    }
  | {
      action: 'DEFER';
      draft: ProactiveChangeDraftV1;
      cooldownHours: number;
    }
  | {
      action: 'WHY';
      whyZh: string;
      draft: ProactiveChangeDraftV1 | null;
    };

export type ProactiveReminderCta = ProactiveReminderCtaId;
