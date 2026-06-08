/**
 * INTAKE：复合意图 CRUD 队列（先删→改→增，再保留 DATA_LOOKUP follow-up）。
 */

import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import {
  buildCompoundDataLookupFollowupText,
  parseCompoundIntentPlan,
} from '../../../intent/compound-intent.util';
import { detectItineraryAdjustIntent } from '../../../utils/itinerary-adjust-intent.util';
import { applyItineraryItemAddIfRequested } from './intake-itinerary-add.util';
import { applyItineraryItemDeleteIfRequested } from './intake-itinerary-delete.util';
import { applyItineraryItemUpdateIfRequested } from './intake-itinerary-update.util';
import type { ItineraryItemAddIntakeHost } from './intake-itinerary-add.util';

export type CompoundCrudIntakeHost = ItineraryItemAddIntakeHost & {
  tryApplyBoundTripItineraryItemDelete?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{ applied: boolean; answerText?: string }>;
  tryApplyBoundTripItineraryItemUpdate?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{ applied: boolean; answerText?: string }>;
};

export async function applyItineraryCrudWithCompoundPlan(
  host: CompoundCrudIntakeHost,
  params: {
    message?: string | null;
    tripId?: string | null;
    userId?: string;
    state: OrchestratorState;
    countryCode?: string | null;
  },
): Promise<boolean> {
  const intakeMsg = String(params.message ?? '').trim();
  const tripId = params.tripId?.trim();
  if (!intakeMsg || !tripId) return false;

  const routePrimary = (
    (params.state.metadata as Record<string, unknown>)?.route_and_run_intent as
      | { primary?: string }
      | undefined
  )?.primary;
  if (routePrimary === 'ITINERARY_ADJUST' || detectItineraryAdjustIntent(intakeMsg)) {
    return false;
  }

  const plan = parseCompoundIntentPlan(intakeMsg, {
    tripId,
    countryCode: params.countryCode ?? undefined,
  });
  (params.state.metadata as Record<string, unknown>).compound_intent_plan = plan;

  if (plan.dataLookupClauses.length > 0) {
    (params.state.metadata as Record<string, unknown>).compound_data_lookup_followup =
      buildCompoundDataLookupFollowupText(plan.dataLookupClauses);
  }

  const crudTargets = plan.isCompound ? plan.crudMessages : [intakeMsg];
  let anyHandled = false;

  for (const clause of crudTargets) {
    const deleteHandled = await applyItineraryItemDeleteIfRequested(host, {
      message: clause,
      tripId,
      userId: params.userId,
      state: params.state,
    });
    if (deleteHandled) {
      anyHandled = true;
      continue;
    }
    const updateHandled = await applyItineraryItemUpdateIfRequested(host, {
      message: clause,
      tripId,
      userId: params.userId,
      state: params.state,
    });
    if (updateHandled) {
      anyHandled = true;
      continue;
    }
    const addHandled = await applyItineraryItemAddIfRequested(host, {
      message: clause,
      tripId,
      userId: params.userId,
      state: params.state,
    });
    if (addHandled) anyHandled = true;
  }

  if (!plan.isCompound && !anyHandled) {
    return false;
  }

  return anyHandled || plan.isCompound;
}

/** 是否存在 CRUD 后待回答的轻量咨询子句 */
export function hasCompoundDataLookupFollowup(state: OrchestratorState): boolean {
  const followup = (state.metadata as Record<string, unknown>)?.compound_data_lookup_followup;
  return typeof followup === 'string' && followup.trim().length > 0;
}

export function readCompoundDataLookupFollowup(state: OrchestratorState): string | undefined {
  const followup = (state.metadata as Record<string, unknown>)?.compound_data_lookup_followup;
  const s = typeof followup === 'string' ? followup.trim() : '';
  return s || undefined;
}
