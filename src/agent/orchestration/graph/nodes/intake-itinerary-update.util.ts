import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import { detectItineraryItemUpdateIntent } from '../../../utils/itinerary-item-update.util';
import {
  appendSkillsHitToOutputsSummary,
  buildCrudSkillsDecisionMetadata,
} from '../../../utils/itinerary-item-crud-decision-log.util';

export type ItineraryItemUpdateApplyResult = {
  applied: boolean;
  updatedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
};

export type ItineraryItemUpdateIntakeHost = {
  tryApplyBoundTripItineraryItemUpdate?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<ItineraryItemUpdateApplyResult>;
};

export async function applyItineraryItemUpdateIfRequested(
  host: ItineraryItemUpdateIntakeHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  if (!detectItineraryItemUpdateIntent(intakeMsg)) return false;

  const tripId = params.tripId?.trim();
  if (!tripId || !host.tryApplyBoundTripItineraryItemUpdate) return false;

  const updateResult = await host.tryApplyBoundTripItineraryItemUpdate(
    tripId,
    params.userId,
    intakeMsg,
  );
  (params.state.metadata as Record<string, unknown>).itinerary_item_update_short_circuit =
    updateResult;

  if (!updateResult.answerText && !updateResult.applied) return false;

  (params.state.metadata as Record<string, unknown>).itinerary_item_update_intake = true;
  params.state.clarification_questions = [];
  params.state.gaps = (params.state.gaps ?? []).filter(
    (g) => (g as { type?: string }).type !== 'MISSING_DESTINATION',
  );
  const prior = params.state.narration;
  params.state.narration = {
    user_friendly_summary: updateResult.answerText ?? '',
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
    step: updateResult.applied ? 'REPAIR' : 'INTAKE',
    actor: 'LocalInsight',
    inputs_summary: `用户修改时间意图: ${intakeMsg}`,
    outputs_summary: appendSkillsHitToOutputsSummary(
      updateResult.answerText ?? '修改行程项时间',
      updateResult.skillsHit,
    ),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: buildCrudSkillsDecisionMetadata(updateResult.skillsHit, {
      system_action: updateResult.applied
        ? 'ITINERARY_ITEM_UPDATE_APPLIED'
        : 'ITINERARY_ITEM_UPDATE_NOT_APPLIED',
      updated_item_ids: updateResult.itemIds,
      updated_count: updateResult.updatedCount,
      update_reason: updateResult.reason,
    }),
  });
  return true;
}

export function shouldTerminalAfterItineraryItemUpdate(state: OrchestratorState): boolean {
  const updateSc = (state.metadata as Record<string, unknown>)?.itinerary_item_update_short_circuit as
    | { applied?: boolean; answerText?: string }
    | undefined;
  return updateSc?.applied === true || Boolean(updateSc?.answerText);
}
