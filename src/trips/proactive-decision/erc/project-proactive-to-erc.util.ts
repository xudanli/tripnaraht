/**
 * PD-8 — ERC projection from Proactive Decision (read-only surface).
 * ERC does not rewrite Impact; it consumes PD outputs with shared IDs.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveChangeDraftV1 } from '../execution/proactive-change-draft.types';
import type { InterventionSurfaceLevelV1 } from '../../../agent/decision-intelligence/intervention-intelligence/intervention-candidate.util';

export const PROACTIVE_ERC_PROJECTION_SCHEMA =
  'nara.proactive_erc_projection@v1' as const;

export type ProactiveErcInterventionType =
  | 'SAFETY_INTERVENTION'
  | 'DYNAMIC_REPLAN';

export type ProactiveErcProjectionItemV1 = {
  schemaId: typeof PROACTIVE_ERC_PROJECTION_SCHEMA;
  version: 1;
  /** Dedup against env-radar / legacy ERC items */
  dedupKey: string;
  tripId: string;
  decisionProblemId: string | null;
  caseId: ProactiveDecisionCaseId;
  signalEventId: string;
  titleZh: string;
  descriptionZh: string;
  interventionType: ProactiveErcInterventionType;
  recommendedOptionId: string | null;
  changeDraftId: string | null;
  surfaceLevel: InterventionSurfaceLevelV1 | null;
  interventionGate: 'NOTIFY_CARD' | 'SILENT_LEARNING' | null;
  /** Confirm/Apply write remains closed until canary sign-off */
  writeChainEnabled: false;
  source: 'PROACTIVE_DECISION_V1';
};

/**
 * Stable dedup key shared by PD main chain and ERC queue.
 * Same risk must not double-notify.
 */
export function buildProactiveErcDedupKey(input: {
  tripId: string;
  signalEventId: string;
  caseId: ProactiveDecisionCaseId | null;
}): string {
  return `pd_v1:${input.tripId}:${input.signalEventId}:${input.caseId ?? 'none'}`;
}

export function mapCaseToErcInterventionType(
  caseId: ProactiveDecisionCaseId,
): ProactiveErcInterventionType {
  if (caseId === 'CASE_REROUTE') return 'SAFETY_INTERVENTION';
  return 'DYNAMIC_REPLAN';
}

export function projectProactiveToErcItem(input: {
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  changeDraft: ProactiveChangeDraftV1 | null;
  decisionProblemId?: string | null;
}): ProactiveErcProjectionItemV1 | null {
  if (!input.impact.caseId || !input.impact.decisionRequired) {
    return null;
  }

  const dedupKey = buildProactiveErcDedupKey({
    tripId: input.impact.tripId,
    signalEventId: input.impact.signalEventId,
    caseId: input.impact.caseId,
  });

  const titleZh =
    input.intervention?.card?.titleZh ??
    input.synthesis?.surfaceL3.suggestionZh ??
    '行程可能需要主动调整';

  const descriptionZh =
    input.intervention?.card?.layer2WhatImpactedZh ??
    input.impact.rationaleZh ??
    '世界变化可能影响当前计划';

  return {
    schemaId: PROACTIVE_ERC_PROJECTION_SCHEMA,
    version: 1,
    dedupKey,
    tripId: input.impact.tripId,
    decisionProblemId:
      input.decisionProblemId ??
      input.changeDraft?.decisionProblemId ??
      null,
    caseId: input.impact.caseId,
    signalEventId: input.impact.signalEventId,
    titleZh,
    descriptionZh,
    interventionType: mapCaseToErcInterventionType(input.impact.caseId),
    recommendedOptionId: input.synthesis?.recommended.optionId ?? null,
    changeDraftId: input.changeDraft?.draftId ?? null,
    surfaceLevel: input.intervention?.candidate.surfaceLevel ?? null,
    interventionGate: input.intervention?.gate ?? null,
    writeChainEnabled: false,
    source: 'PROACTIVE_DECISION_V1',
  };
}

/**
 * Merge PD projections into an existing ERC id/dedup set — drop duplicates.
 */
export function dedupeProactiveErcProjections(input: {
  projections: ProactiveErcProjectionItemV1[];
  existingDedupKeys: Iterable<string>;
}): {
  accepted: ProactiveErcProjectionItemV1[];
  suppressed: ProactiveErcProjectionItemV1[];
} {
  const seen = new Set(input.existingDedupKeys);
  const accepted: ProactiveErcProjectionItemV1[] = [];
  const suppressed: ProactiveErcProjectionItemV1[] = [];

  for (const item of input.projections) {
    if (seen.has(item.dedupKey)) {
      suppressed.push(item);
      continue;
    }
    seen.add(item.dedupKey);
    accepted.push(item);
  }

  return { accepted, suppressed };
}
