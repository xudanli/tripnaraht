import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import { detectItineraryItemAddIntent } from '../../../utils/itinerary-item-add.util';
import {
  appendSkillsHitToOutputsSummary,
  buildCrudSkillsDecisionMetadata,
} from '../../../utils/itinerary-item-crud-decision-log.util';

export type ItineraryItemAddApplyResult = {
  applied: boolean;
  addedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
};

export type ItineraryItemAddIntakeHost = {
  tryApplyBoundTripItineraryItemAdd?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<ItineraryItemAddApplyResult>;
};

export async function applyItineraryItemAddIfRequested(
  host: ItineraryItemAddIntakeHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  if (!detectItineraryItemAddIntent(intakeMsg)) return false;

  const tripId = params.tripId?.trim();
  if (!tripId || !host.tryApplyBoundTripItineraryItemAdd) return false;

  const addResult = await host.tryApplyBoundTripItineraryItemAdd(
    tripId,
    params.userId,
    intakeMsg,
  );
  (params.state.metadata as Record<string, unknown>).itinerary_item_add_short_circuit = addResult;

  if (!addResult.answerText && !addResult.applied) return false;

  (params.state.metadata as Record<string, unknown>).itinerary_item_add_intake = true;
  params.state.clarification_questions = [];
  params.state.gaps = (params.state.gaps ?? []).filter(
    (g) => (g as { type?: string }).type !== 'MISSING_DESTINATION',
  );
  const prior = params.state.narration;
  params.state.narration = {
    user_friendly_summary: addResult.answerText ?? '',
    day_by_day_narrative: prior?.day_by_day_narrative ?? [],
    highlights: prior?.highlights ?? [],
    tips: prior?.tips ?? [],
    day_by_day_text_zh: prior?.day_by_day_text_zh,
    warnings: prior?.warnings,
    research_ui_hints: prior?.research_ui_hints,
    voice_tone_modifier: prior?.voice_tone_modifier,
    visual_hint: prior?.visual_hint,
    audio_prosody: prior?.audio_prosody,
  };
  params.state.decision_log.push({
    request_id: params.state.request_id,
    step: addResult.applied ? 'REPAIR' : 'INTAKE',
    actor: 'LocalInsight',
    inputs_summary: `用户新增意图: ${intakeMsg}`,
    outputs_summary: appendSkillsHitToOutputsSummary(
      addResult.answerText ?? '新增行程项',
      addResult.skillsHit,
    ),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: buildCrudSkillsDecisionMetadata(addResult.skillsHit, {
      system_action: addResult.applied
        ? 'ITINERARY_ITEM_ADD_APPLIED'
        : 'ITINERARY_ITEM_ADD_NOT_APPLIED',
      added_item_ids: addResult.itemIds,
      added_count: addResult.addedCount,
      add_reason: addResult.reason,
    }),
  });
  return true;
}

export function shouldTerminalAfterItineraryItemAdd(state: OrchestratorState): boolean {
  const addSc = (state.metadata as Record<string, unknown>)?.itinerary_item_add_short_circuit as
    | { applied?: boolean; answerText?: string }
    | undefined;
  return addSc?.applied === true || Boolean(addSc?.answerText);
}
