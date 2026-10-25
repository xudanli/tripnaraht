/**
 * PD-7.1 — Project synthesis + reminder card → Change Draft (read-only preview).
 */

import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveReminderCardV1 } from '../surface/proactive-reminder-card.types';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import {
  PROACTIVE_CHANGE_DRAFT_SCHEMA,
  type ProactiveChangeDraftV1,
} from './proactive-change-draft.types';

export function projectProactiveChangeDraft(input: {
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1;
  card: ProactiveReminderCardV1;
  intervention?: ProactiveInterventionDecisionV1 | null;
  decisionProblemId?: string;
  createdAt?: string;
}): ProactiveChangeDraftV1 {
  const now = input.createdAt ?? new Date().toISOString();
  const draftId = `pd_draft_${input.impact.signalEventId}_${input.synthesis.recommended.optionId}`;

  const before =
    input.impact.affectedItemLabels?.length
      ? input.impact.affectedItemLabels.map((l) => `原计划：${l}`)
      : input.impact.affectedItems.map((id) => `原计划项：${id}`);

  const after = [
    input.synthesis.recommended.titleZh,
    input.synthesis.recommended.summaryZh,
    ...input.synthesis.recommended.benefitsZh.map((b) => `✓ ${b}`),
  ];

  const changeDraftCard = {
    kind: 'change_draft' as const,
    title_zh: input.card.titleZh,
    draft_id: draftId,
    before_summary_zh: before,
    after_summary_zh: after,
    schedule_change_bullets_zh: [
      input.card.layer1WhatHappenedZh,
      input.card.layer2WhatImpactedZh,
      input.card.layer3SuggestionZh,
    ],
    draft_schedule_zh: after,
    apply_gate: {
      can_apply: false,
      apply_path: 'rfc001/decision-finalize',
      deny_reason: 'awaiting_confirm',
      flawed_draft_forbidden: true,
    },
    apply_snapshot: {
      proactiveDecisionV1: true,
      caseId: input.synthesis.caseId,
      optionId: input.synthesis.recommended.optionId,
      signalEventId: input.impact.signalEventId,
      decisionProblemId:
        input.decisionProblemId ?? input.card.decisionProblemId,
      applyAuthority: 'RFC001_FINALIZE',
    },
    applied: false,
  };

  return {
    schemaId: PROACTIVE_CHANGE_DRAFT_SCHEMA,
    version: 1,
    draftId,
    tripId: input.impact.tripId,
    caseId: input.synthesis.caseId,
    decisionProblemId:
      input.decisionProblemId ?? input.card.decisionProblemId,
    interventionCandidateId:
      input.intervention?.candidate.candidateId ??
      input.card.interventionCandidateId,
    recommendedOptionId: input.synthesis.recommended.optionId,
    status: 'OPEN',
    previewOnly: true,
    changeDraftCard,
    whyZh: input.card.whyPreviewZh,
    applyAuthority: 'RFC001_FINALIZE',
    applyAllowed: false,
    verifyOk: input.synthesis.hardGate.passed,
    createdAt: now,
    updatedAt: now,
  };
}
