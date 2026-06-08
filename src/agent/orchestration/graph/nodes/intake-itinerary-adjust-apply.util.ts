import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import {
  detectItineraryAdjustDraftApplyIntent,
} from '../../../utils/itinerary-adjust-draft-apply.util';
import type { PendingItineraryAdjustDraft } from '../../../utils/itinerary-adjust-pending-draft.util';
import {
  appendSkillsHitToOutputsSummary,
  buildCrudSkillsDecisionMetadata,
} from '../../../utils/itinerary-item-crud-decision-log.util';

export type ItineraryAdjustDraftApplyResult = {
  applied: boolean;
  deletedCount?: number;
  addedCount?: number;
  answerText?: string;
  targetDateIso?: string;
  reason?: string;
  skillsHit?: string[];
};

export type ItineraryAdjustDraftApplyHost = {
  tryApplyBoundTripItineraryAdjustDraft?(
    tripId: string,
    userId: string | undefined,
    request: Pick<RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>,
  ): Promise<ItineraryAdjustDraftApplyResult>;
};

export async function applyItineraryAdjustDraftIfRequested(
  host: ItineraryAdjustDraftApplyHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
    request: Pick<RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>;
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  const tripId = params.tripId?.trim();
  if (!tripId) return false;
  if (
    !detectItineraryAdjustDraftApplyIntent(intakeMsg, {
      apply_itinerary_adjust_draft: params.request.options?.apply_itinerary_adjust_draft,
    })
  ) {
    return false;
  }
  if (!host.tryApplyBoundTripItineraryAdjustDraft) return false;

  const result = await host.tryApplyBoundTripItineraryAdjustDraft(
    tripId,
    params.userId,
    params.request,
  );
  (params.state.metadata as Record<string, unknown>).itinerary_adjust_draft_apply_short_circuit =
    result;

  if (!result.answerText && !result.applied) return false;

  (params.state.metadata as Record<string, unknown>).itinerary_adjust_draft_apply_intake = true;
  if (result.applied) {
    (params.state.metadata as Record<string, unknown>).itinerary_adjust_auto_apply = {
      applied: true,
      executionMode: 'ADVICE_ONLY',
      reason: 'user_confirmed_draft_apply',
      targetDateIso: result.targetDateIso,
      deletedCount: result.deletedCount,
      addedCount: result.addedCount,
      skillsHit: result.skillsHit,
    };
    const pending = (params.state.metadata as Record<string, unknown>)
      .pending_itinerary_adjust_draft as PendingItineraryAdjustDraft | undefined;
    if (pending?.itinerary_adjust_result) {
      (params.state.metadata as Record<string, unknown>).itinerary_adjust_result = {
        ...pending.itinerary_adjust_result,
        applied: true,
        status_label_zh: '已更新行程',
      };
    }
  }

  params.state.clarification_questions = [];
  params.state.narration = {
    user_friendly_summary: result.answerText ?? '',
    day_by_day_narrative: [],
    highlights: [],
    tips: [],
  };
  params.state.decision_log.push({
    request_id: params.state.request_id,
    step: result.applied ? 'REPAIR' : 'INTAKE',
    actor: 'Planner',
    inputs_summary: `用户确认应用 ITINERARY_ADJUST 草案 trip=${tripId}`,
    outputs_summary: appendSkillsHitToOutputsSummary(
      result.answerText ?? '应用草案',
      result.skillsHit,
    ),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: buildCrudSkillsDecisionMetadata(result.skillsHit, {
      system_action: result.applied
        ? 'ITINERARY_ADJUST_DRAFT_APPLIED'
        : 'ITINERARY_ADJUST_DRAFT_APPLY_FAILED',
      target_date_iso: result.targetDateIso,
      apply_reason: result.reason,
      deleted_count: result.deletedCount,
      added_count: result.addedCount,
    }),
  });
  return true;
}

export function shouldTerminalAfterItineraryAdjustDraftApply(state: OrchestratorState): boolean {
  const sc = (state.metadata as Record<string, unknown>)?.itinerary_adjust_draft_apply_short_circuit as
    | { applied?: boolean; answerText?: string }
    | undefined;
  return sc?.applied === true || Boolean(sc?.answerText);
}
