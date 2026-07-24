import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import { detectGoldenCircleDayReplanIntent } from '../../../utils/itinerary-day-replan.util';
import {
  appendSkillsHitToOutputsSummary,
  buildCrudSkillsDecisionMetadata,
} from '../../../utils/itinerary-item-crud-decision-log.util';

export type ItineraryDayReplanApplyResult = {
  applied: boolean;
  deletedCount?: number;
  addedCount?: number;
  answerText?: string;
  itemIds?: string[];
  reason?: string;
  skillsHit?: string[];
};

export type ItineraryDayReplanIntakeHost = {
  tryApplyBoundTripItineraryDayReplan?(
    tripId: string,
    userId: string | undefined,
    message: string,
    dateRange?: { start_date?: string; end_date?: string },
  ): Promise<ItineraryDayReplanApplyResult>;
};

function wasItineraryItemCrudShortCircuited(state: OrchestratorState): boolean {
  const md = state.metadata as Record<string, unknown>;
  return (
    md.lodging_replace_intake === true ||
    md.itinerary_item_delete_intake === true ||
    md.itinerary_item_add_intake === true ||
    md.itinerary_item_update_intake === true
  );
}

export async function applyItineraryDayReplanIfRequested(
  host: ItineraryDayReplanIntakeHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
    dateRange?: { start_date?: string; end_date?: string };
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  if (!intakeMsg || wasItineraryItemCrudShortCircuited(params.state)) return false;
  const routePrimary = (
    (params.state.metadata as Record<string, unknown>)?.route_and_run_intent as
      | { primary?: string }
      | undefined
  )?.primary;
  if (routePrimary === 'ITINERARY_ADJUST') return false;
  if (!detectGoldenCircleDayReplanIntent(intakeMsg)) return false;

  const tripId = params.tripId?.trim();
  if (!tripId || !host.tryApplyBoundTripItineraryDayReplan) return false;

  const replanResult = await host.tryApplyBoundTripItineraryDayReplan(
    tripId,
    params.userId,
    intakeMsg,
    params.dateRange,
  );
  (params.state.metadata as Record<string, unknown>).itinerary_day_replan_short_circuit = replanResult;

  if (!replanResult.answerText && !replanResult.applied) return false;

  (params.state.metadata as Record<string, unknown>).itinerary_day_replan_intake = true;
  params.state.clarification_questions = [];
  params.state.gaps = (params.state.gaps ?? []).filter(
    (g) => (g as { type?: string }).type !== 'MISSING_DESTINATION',
  );
  const prior = params.state.narration;
  params.state.narration = {
    user_friendly_summary: replanResult.answerText ?? '',
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
    step: replanResult.applied ? 'REPAIR' : 'INTAKE',
    actor: 'LocalInsight',
    inputs_summary: `用户整日重排意图: ${intakeMsg}`,
    outputs_summary: appendSkillsHitToOutputsSummary(
      replanResult.answerText ?? '整日重排',
      replanResult.skillsHit,
    ),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: buildCrudSkillsDecisionMetadata(replanResult.skillsHit, {
      system_action: replanResult.applied
        ? 'ITINERARY_DAY_REPLAN_APPLIED'
        : 'ITINERARY_DAY_REPLAN_NOT_APPLIED',
      deleted_count: replanResult.deletedCount,
      added_count: replanResult.addedCount,
      replan_reason: replanResult.reason,
    }),
  });
  return true;
}

export function shouldTerminalAfterItineraryDayReplan(state: OrchestratorState): boolean {
  const sc = (state.metadata as Record<string, unknown>)?.itinerary_day_replan_short_circuit as
    | { applied?: boolean; answerText?: string }
    | undefined;
  return sc?.applied === true || Boolean(sc?.answerText);
}
