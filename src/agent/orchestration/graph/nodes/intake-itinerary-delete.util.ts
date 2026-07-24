import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import { detectItineraryItemDeleteIntent } from '../../../utils/itinerary-item-delete.util';
import {
  appendSkillsHitToOutputsSummary,
  buildCrudSkillsDecisionMetadata,
} from '../../../utils/itinerary-item-crud-decision-log.util';

export type ItineraryItemDeleteApplyResult = {
  applied: boolean;
  deletedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
};

export type ItineraryItemDeleteIntakeHost = {
  tryApplyBoundTripItineraryItemDelete?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<ItineraryItemDeleteApplyResult>;
};

/**
 * 绑定 Trip 删除 POI：写入 state.metadata 并返回是否应在 INTAKE 短路结束（不再进 GATE_EVAL）。
 */
export async function applyItineraryItemDeleteIfRequested(
  host: ItineraryItemDeleteIntakeHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  if (!detectItineraryItemDeleteIntent(intakeMsg)) return false;

  const tripId = params.tripId?.trim();
  if (!tripId || !host.tryApplyBoundTripItineraryItemDelete) return false;

  const deleteResult = await host.tryApplyBoundTripItineraryItemDelete(
    tripId,
    params.userId,
    intakeMsg,
  );
  (params.state.metadata as Record<string, unknown>).itinerary_item_delete_short_circuit =
    deleteResult;

  if (!deleteResult.answerText && !deleteResult.applied) return false;

  (params.state.metadata as Record<string, unknown>).itinerary_item_delete_intake = true;
  params.state.clarification_questions = [];
  params.state.gaps = (params.state.gaps ?? []).filter(
    (g) => (g as { type?: string }).type !== 'MISSING_DESTINATION',
  );
  const prior = params.state.narration;
  params.state.narration = {
    user_friendly_summary: deleteResult.answerText ?? '',
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
    step: deleteResult.applied ? 'REPAIR' : 'INTAKE',
    actor: 'LocalInsight',
    inputs_summary: `用户删除意图: ${intakeMsg}`,
    outputs_summary: appendSkillsHitToOutputsSummary(
      deleteResult.answerText ?? '删除行程项',
      deleteResult.skillsHit,
    ),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: buildCrudSkillsDecisionMetadata(deleteResult.skillsHit, {
      system_action: deleteResult.applied
        ? 'ITINERARY_ITEM_DELETE_APPLIED'
        : 'ITINERARY_ITEM_DELETE_NOT_APPLIED',
      deleted_item_ids: deleteResult.itemIds,
      deleted_count: deleteResult.deletedCount,
      delete_reason: deleteResult.reason,
    }),
  });
  return true;
}

/** INTAKE 节点：是否应因删除短路直接 terminal_done */
export function shouldTerminalAfterItineraryItemDelete(state: OrchestratorState): boolean {
  const deleteSc = (state.metadata as Record<string, unknown>)?.itinerary_item_delete_short_circuit as
    | { applied?: boolean; answerText?: string }
    | undefined;
  return deleteSc?.applied === true || Boolean(deleteSc?.answerText);
}
