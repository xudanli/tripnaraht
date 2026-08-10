/**
 * ITINERARY_ADJUST 走廊 AUTO / POI_SLOT_FILL SEMI_AUTO 落库（从 ClaudeOrchestrator 迁出）。
 */

import type { ItineraryAdjustAutoApplyHost } from './itinerary-adjust-auto-apply.host';
import type { OrchestratorState, ItineraryItem } from '../interfaces/trip-plan.interface';
import type { TripUserEdit } from '../../skills/trip/utils/trip-user-edit.util';
import type { RouteAndRunIntentAnalysis } from '../utils/route-and-run-intent-analyzer.util';
import { runPlanMutationCommand } from '../execution/plan-mutation-command.gateway';
import { isDirectPlanMutationBlocked } from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import {
  FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON,
  shouldBlockAutoApplyForFlawedDraft,
} from '../utils/itinerary-adjust-flawed-auto-block.util';
import {
  buildItineraryAdjustAutoApplyLeadMessage,
  classifyItineraryAdjustSubIntent,
  evaluateItineraryAdjustConfidenceGate,
  resolveItineraryAdjustExecutionMode,
} from '../utils/itinerary-adjust-auto-apply.util';
import { extractItineraryAdjustTargetDateFromMessage } from '../utils/itinerary-adjust-intent.util';
import { recordItineraryAdjustFunnel } from '../utils/itinerary-adjust-metrics.util';
import {
  buildCorridorDayApplyEdits,
  parseNumericPlaceId,
  pickTargetDayFromItinerary,
} from '../utils/itinerary-adjust-corridor-apply.util';
import {
  allNewPoiItemsHavePlaceIds,
  buildPoiSlotFillAppendEdits,
  collectResearchPools,
  collectSparseTripDayTargets,
  enrichItineraryWithPlaceIdsFromResearch,
  mergePoiSlotFillOrchestratorItinerary,
} from '../utils/itinerary-adjust-poi-slot-fill.util';
import type { TripLikeForDelete } from '../utils/itinerary-item-delete.util';

export async function maybeAutoApplyItineraryAdjustCorridor(
  host: ItineraryAdjustAutoApplyHost,
  state: OrchestratorState,
): Promise<void> {
  const routeIntent = (state.metadata as Record<string, unknown>)?.route_and_run_intent as
    | RouteAndRunIntentAnalysis
    | undefined;
  if (routeIntent?.primary !== 'ITINERARY_ADJUST') return;
  if (state.clarification_questions?.length) return;
  if (!state.itinerary?.days?.length) return;

  const md = state.metadata as Record<string, unknown>;
  if (md.itinerary_day_replan_intake === true) return;

  // P0-1：FLAWED_DRAFT 禁止 AUTO / SEMI_AUTO 写回
  if (shouldBlockAutoApplyForFlawedDraft(md)) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON,
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    host.logger.warn(
      `[Claude Orchestrator] ITINERARY_ADJUST AUTO blocked: ${FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON} request_id=${state.request_id}`,
    );
    return;
  }

  // Agent Harness P0-1 W1：写链开启时禁止 AUTO 直写（仅 ADVICE_ONLY）
  if (isDirectPlanMutationBlocked()) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'write_chain_blocked',
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    host.logger.warn(
      `[Claude Orchestrator] ITINERARY_ADJUST AUTO blocked: write_chain_blocked request_id=${state.request_id}`,
    );
    return;
  }

  const intakeMsg =
    (typeof md.intake_user_message === 'string' ? md.intake_user_message : '') ||
    state.trip_plan_request?.message ||
    '';
  const subIntent = classifyItineraryAdjustSubIntent(intakeMsg);
  md.itinerary_adjust_sub_intent = subIntent;

  if (subIntent === 'poi_slot_fill') {
    await maybeAutoApplyPoiSlotFill(host, state, md, intakeMsg, subIntent);
    return;
  }

  const confidence = evaluateItineraryAdjustConfidenceGate(md);
  md.itinerary_adjust_confidence_gate = confidence;

  const executionMode = resolveItineraryAdjustExecutionMode({
    subIntent,
    highConfidence: confidence.highConfidence,
  });
  md.itinerary_adjust_execution_mode = executionMode;

  const targetDateIso =
    (typeof md.itinerary_adjust_target_date_iso === 'string'
      ? md.itinerary_adjust_target_date_iso
      : undefined) ??
    extractItineraryAdjustTargetDateFromMessage(
      intakeMsg,
      state.trip_plan_request?.date_range,
    );

  const dayNumber =
    typeof md.itinerary_adjust_neighbor_anchors === 'object' &&
    md.itinerary_adjust_neighbor_anchors != null &&
    'targetDayNumber' in (md.itinerary_adjust_neighbor_anchors as object)
      ? Number((md.itinerary_adjust_neighbor_anchors as { targetDayNumber?: number }).targetDayNumber)
      : undefined;

  if (executionMode !== 'AUTO' || !targetDateIso) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: executionMode !== 'AUTO' ? 'execution_mode_advice_only' : 'missing_target_date',
      subIntent,
      confidence,
      executionMode,
    };
    recordItineraryAdjustFunnel(host.promMetrics, {
      stage: 'draft_created',
      outcome: 'success',
      sub_intent: subIntent,
      execution_mode: executionMode,
      reason:
        executionMode !== 'AUTO' ? 'execution_mode_advice_only' : 'missing_target_date',
      request_id: state.request_id,
    });
    return;
  }

  const tripId =
    state.trip_plan_request?.trip_id?.trim() ??
    state.trip_plan_request?.ontology_context?.trip_id?.trim();
  const userId = (state.metadata as { userId?: string })?.userId;
  if (!tripId || !host.tripsService) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: !tripId ? 'missing_trip_id' : 'trips_service_unavailable',
      executionMode,
    };
    return;
  }

  const targetDay = pickTargetDayFromItinerary(state.itinerary, targetDateIso.slice(0, 10));
  if (!targetDay?.items?.length) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'empty_target_day_itinerary',
      executionMode,
    };
    return;
  }

  let trip: TripLikeForDelete;
  try {
    trip = (await host.tripsService.findOne(tripId, userId)) as TripLikeForDelete;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary adjust auto-apply trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    md.itinerary_adjust_auto_apply = { applied: false, reason: 'trip_load_failed', executionMode };
    return;
  }

  const placeIdCache = new Map<string, number>();
  const resolvePlaceId = (item: ItineraryItem): number | undefined => {
    const fromRef = parseNumericPlaceId(item.location_ref?.place_id);
    if (fromRef != null) return fromRef;
    const key = String(item.location_ref?.place_id ?? item.location_ref?.name ?? item.id);
    if (placeIdCache.has(key)) return placeIdCache.get(key);
    const resolved = host.resolvePlaceIdForItineraryAdjustApply(item, state);
    if (resolved != null) placeIdCache.set(key, resolved);
    return resolved;
  };

  const { edits, deleteIds, addCount, unresolvedItems } = buildCorridorDayApplyEdits({
    trip,
    targetDateIso: targetDateIso.slice(0, 10),
    targetDay,
    resolvePlaceId,
  });

  if (addCount === 0 || unresolvedItems.length > 0) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'unresolved_places',
      executionMode,
      unresolvedItems,
      deleteIds,
      addCount,
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    return;
  }

  try {
    const mutation = await runPlanMutationCommand(host.skillsRegistry, {
      tripId: tripId.trim(),
      commandType: 'ITINERARY_ADJUST_AUTO',
      source: 'maybeAutoApplyItineraryAdjustCorridor',
      requestId: state.request_id,
      mode: 'db',
      edits: edits as TripUserEdit[],
    });
    if (mutation.reason === 'trip_apply_edit_unavailable') {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        executionMode,
      };
      return;
    }
    const out = { success: mutation.success };
    if (out?.success) {
      md.itinerary_adjust_auto_apply = {
        applied: true,
        executionMode: 'AUTO',
        subIntent,
        confidence,
        targetDateIso: targetDateIso.slice(0, 10),
        deletedCount: deleteIds.length,
        addedCount: addCount,
        skillsHit: ['trip.applyEdit'],
      };
      recordItineraryAdjustFunnel(host.promMetrics, {
        stage: 'auto_apply',
        outcome: 'success',
        sub_intent: subIntent,
        execution_mode: 'AUTO',
        request_id: state.request_id,
        added_count: addCount,
      });
      const lead = buildItineraryAdjustAutoApplyLeadMessage({
        applied: true,
        executionMode: 'AUTO',
        targetDateIso: targetDateIso.slice(0, 10),
        dayNumber: Number.isFinite(dayNumber) ? dayNumber : undefined,
      });
      if (lead) {
        const prior = state.narration;
        state.narration = {
          user_friendly_summary: lead,
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
      }
      state.decision_log.push({
        request_id: state.request_id,
        step: 'REPAIR',
        actor: 'Planner',
        inputs_summary: `ITINERARY_ADJUST 走廊自动落库 ${targetDateIso.slice(0, 10)}`,
        outputs_summary: `已落库：删除 ${deleteIds.length} 项，新增 ${addCount} 项（trip.applyEdit）`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'ITINERARY_ADJUST_AUTO_APPLIED',
          skills_hit: ['trip.applyEdit'],
          fallback_level: confidence.fallbackLevel,
        },
      });
      return;
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary adjust auto-apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  md.itinerary_adjust_auto_apply = {
    applied: false,
    reason: 'apply_failed',
    executionMode: 'ADVICE_ONLY',
  };
  md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
}

/** POI_SLOT_FILL：向稀疏日追加推荐景点（只增不删，place_id 齐备时 SEMI_AUTO 落库） */
export async function maybeAutoApplyPoiSlotFill(
  host: ItineraryAdjustAutoApplyHost,
  state: OrchestratorState,
  md: Record<string, unknown>,
  intakeMsg: string,
  subIntent: 'poi_slot_fill',
): Promise<void> {
  md.itinerary_adjust_poi_slot_fill = true;
  if (!state.itinerary?.days?.length) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'empty_itinerary_draft',
      subIntent,
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    return;
  }

  const tripId =
    state.trip_plan_request?.trip_id?.trim() ??
    state.trip_plan_request?.ontology_context?.trip_id?.trim();
  const userId = (state.metadata as { userId?: string })?.userId;
  if (!tripId || !host.tripsService) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: !tripId ? 'missing_trip_id' : 'trips_service_unavailable',
      subIntent,
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    return;
  }

  let trip: TripLikeForDelete;
  try {
    trip = (await host.tripsService.findOne(tripId, userId)) as TripLikeForDelete;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] poi slot fill trip load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'trip_load_failed',
      subIntent,
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    return;
  }

  const sparseTargets = collectSparseTripDayTargets(trip);
  md.itinerary_adjust_poi_slot_fill_targets = sparseTargets;
  if (!sparseTargets.length) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: 'no_sparse_days',
      subIntent,
      executionMode: 'ADVICE_ONLY',
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    return;
  }

  const merged = mergePoiSlotFillOrchestratorItinerary({
    orchestrator: state.itinerary,
    trip,
    sparseTargets,
  });
  if (merged?.days?.length) {
    state.itinerary = merged;
  }

  const researchPools = collectResearchPools(
    state.research_data as Record<string, unknown> | undefined,
  );
  const boundCount = enrichItineraryWithPlaceIdsFromResearch(state.itinerary, researchPools);
  md.itinerary_adjust_place_id_bound_count = boundCount;

  const poiSlotFillReady = allNewPoiItemsHavePlaceIds(
    state.itinerary.days ?? [],
    sparseTargets,
    trip,
  );
  const executionMode = resolveItineraryAdjustExecutionMode({
    subIntent,
    highConfidence: false,
    poiSlotFillReady,
  });
  md.itinerary_adjust_execution_mode = executionMode;

  const primaryTarget = sparseTargets[0];
  if (!md.itinerary_adjust_target_date_iso) {
    md.itinerary_adjust_target_date_iso = primaryTarget.dateIso;
    md.itinerary_adjust_target_day_number = primaryTarget.dayNumber;
  }

  if (executionMode !== 'SEMI_AUTO') {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: poiSlotFillReady ? 'execution_mode_advice_only' : 'unresolved_places',
      subIntent,
      executionMode,
      sparseDayCount: sparseTargets.length,
      placeIdBoundCount: boundCount,
    };
    recordItineraryAdjustFunnel(host.promMetrics, {
      stage: 'draft_created',
      outcome: 'success',
      sub_intent: subIntent,
      execution_mode: executionMode,
      reason: poiSlotFillReady ? 'execution_mode_advice_only' : 'unresolved_places',
      request_id: state.request_id,
    });
    return;
  }

  const placeIdCache = new Map<string, number>();
  const resolvePlaceId = (item: ItineraryItem): number | undefined => {
    const fromRef = parseNumericPlaceId(item.location_ref?.place_id);
    if (fromRef != null) return fromRef;
    const key = String(item.location_ref?.place_id ?? item.location_ref?.name ?? item.id);
    if (placeIdCache.has(key)) return placeIdCache.get(key);
    const resolved = host.resolvePlaceIdForItineraryAdjustApply(item, state);
    if (resolved != null) placeIdCache.set(key, resolved);
    return resolved;
  };

  const { edits, addCount, unresolvedItems, appliedDays } = buildPoiSlotFillAppendEdits({
    trip,
    sparseTargets,
    draftDays: state.itinerary.days ?? [],
    resolvePlaceId,
  });

  if (addCount === 0 || unresolvedItems.length > 0) {
    md.itinerary_adjust_auto_apply = {
      applied: false,
      reason: addCount === 0 ? 'no_new_pois' : 'unresolved_places',
      subIntent,
      executionMode: 'ADVICE_ONLY',
      unresolvedItems,
      addCount,
      sparseDayCount: sparseTargets.length,
    };
    md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
    return;
  }

  try {
    const mutation = await runPlanMutationCommand(host.skillsRegistry, {
      tripId: tripId.trim(),
      commandType: 'POI_SLOT_FILL',
      source: 'maybeAutoApplyPoiSlotFill',
      requestId: state.request_id,
      mode: 'db',
      edits: edits as TripUserEdit[],
    });
    if (mutation.reason === 'trip_apply_edit_unavailable') {
      md.itinerary_adjust_auto_apply = {
        applied: false,
        reason: 'trip_apply_edit_unavailable',
        subIntent,
        executionMode,
      };
      return;
    }
    const out = { success: mutation.success };
    if (out?.success) {
      md.itinerary_adjust_auto_apply = {
        applied: true,
        executionMode: 'SEMI_AUTO',
        subIntent,
        addedCount: addCount,
        appliedDays,
        sparseDayCount: sparseTargets.length,
        skillsHit: ['trip.applyEdit'],
      };
      recordItineraryAdjustFunnel(host.promMetrics, {
        stage: 'auto_apply',
        outcome: 'success',
        sub_intent: subIntent,
        execution_mode: 'SEMI_AUTO',
        request_id: state.request_id,
        added_count: addCount,
        applied_days: appliedDays.length,
      });
      const lead = buildItineraryAdjustAutoApplyLeadMessage({
        applied: true,
        executionMode: 'SEMI_AUTO',
        targetDateIso: primaryTarget.dateIso,
        dayNumber: primaryTarget.dayNumber,
      });
      if (lead) {
        const prior = state.narration;
        state.narration = {
          user_friendly_summary: lead,
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
      }
      state.decision_log.push({
        request_id: state.request_id,
        step: 'REPAIR',
        actor: 'Planner',
        inputs_summary: `POI_SLOT_FILL 追加落库 ${appliedDays.join(', ')}`,
        outputs_summary: `已落库：向 ${appliedDays.length} 个稀疏日新增 ${addCount} 个景点（trip.applyEdit append-only）`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: 'POI_SLOT_FILL_AUTO_APPLIED',
          skills_hit: ['trip.applyEdit'],
          applied_days: appliedDays,
        },
      });
      return;
    }
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] poi slot fill auto-apply failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  md.itinerary_adjust_auto_apply = {
    applied: false,
    reason: 'apply_failed',
    subIntent,
    executionMode: 'ADVICE_ONLY',
  };
  md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
}
