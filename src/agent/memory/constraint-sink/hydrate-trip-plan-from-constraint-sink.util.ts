import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { TripPlanRequest } from '../../interfaces/trip-plan.interface';
import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';
import type { ConstraintSinkHydrateResult } from './constraint-sink.types';
import { foldConstraintSinkPatches, readConstraintSinkState } from './constraint-sink-state.util';

function hasExplicitDestination(request: RouteAndRunRequestDto, tripPlanRequest: TripPlanRequest): boolean {
  const msgDest = typeof tripPlanRequest.destination === 'string' ? tripPlanRequest.destination.trim() : '';
  const reqMsg = String(request.message ?? '').trim();
  return Boolean(msgDest && msgDest !== '未指定') || reqMsg.length > 0;
}

/**
 * Merge folded Constraint Sink patches into TripPlanRequest before GATE_EVAL / PLAN_GEN.
 * Explicit request fields win over sink (Session/Task explicit > sink fold).
 */
export function hydrateTripPlanFromConstraintSink(
  tripPlanRequest: TripPlanRequest,
  activeTripState: TripTaskMemory | null | undefined,
  request: RouteAndRunRequestDto,
): ConstraintSinkHydrateResult {
  const applied = { keys: [] as string[], patch_ids: [] as string[], overridden_by_request: [] as string[] };
  let tpr = { ...tripPlanRequest };

  const sinkState = readConstraintSinkState(activeTripState?.constraints);
  const { delta, patch_ids } = foldConstraintSinkPatches(sinkState);
  applied.patch_ids = patch_ids;
  if (patch_ids.length === 0) {
    return { tripPlanRequest: tpr, applied };
  }

  if (delta.destination_pivot?.to) {
    const explicit =
      (typeof tpr.destination === 'string' && tpr.destination.trim() && tpr.destination !== '未指定');
    if (!explicit) {
      tpr.destination = delta.destination_pivot.to;
      applied.keys.push('destination');
    } else {
      applied.overridden_by_request.push('destination');
    }
  }

  if (delta.pace && !tpr.pace) {
    const mapped = delta.pace === 'tight' ? 'dense' : delta.pace === 'relaxed' ? 'relaxed' : 'normal';
    tpr.pace = mapped as TripPlanRequest['pace'];
    applied.keys.push('pace');
  }

  if (delta.budget?.total !== undefined && !tpr.constraints?.budget?.total) {
    tpr.constraints = {
      ...tpr.constraints,
      budget: {
        total: delta.budget.total,
        currency: delta.budget.currency ?? tpr.constraints?.budget?.currency ?? 'USD',
      },
    };
    applied.keys.push('constraints.budget');
  }

  if (delta.party?.fitness_level && !tpr.party?.fitness_level) {
    tpr.party = { count: tpr.party?.count ?? 1, ...tpr.party, fitness_level: delta.party.fitness_level };
    applied.keys.push('party.fitness_level');
  }

  if (delta.negative?.notes_zh) {
    const notes = delta.negative.notes_zh;
    if (!tpr.message?.includes(notes)) {
      const anchorBlock = `[SYSTEM_MESSAGE][CONSTRAINT_SINK][USER_INTENT]\n${notes}\n`;
      tpr.message = tpr.message?.includes('[CONSTRAINT_SINK]')
        ? tpr.message
        : `${anchorBlock}${tpr.message ?? request.message ?? ''}`.trim();
      if (!applied.keys.includes('guardian_debate_intent_hint')) {
        applied.keys.push('guardian_debate_intent_hint');
      }
    }

    const g = tpr.guardian_debate_trip_context ?? {};
    tpr.guardian_debate_trip_context = {
      ...g,
      user_intent_anchors: {
        ...g.user_intent_anchors,
        interpretation_zh: g.user_intent_anchors?.interpretation_zh ?? notes,
      },
    };
  }

  if (delta.negative?.avoid_regions?.includes('south_coast')) {
    applied.keys.push('avoid_south_coast');
  }

  if (delta.negative?.avoid_poi_types?.length) {
    tpr.style_tags = [...new Set([...(tpr.style_tags ?? []), ...delta.negative.avoid_poi_types.map((t) => `avoid:${t}`)])];
    applied.keys.push('style_tags');
  }

  return { tripPlanRequest: tpr, applied };
}

export function mergeConstraintSinkIntoMemoryContractObs(
  memContractObs: Record<string, unknown> | undefined,
  applied: ConstraintSinkHydrateResult['applied'],
): Record<string, unknown> {
  if (!memContractObs) return memContractObs ?? {};
  const layers = Array.isArray(memContractObs.layers) ? [...(memContractObs.layers as string[])] : [];
  if (applied.patch_ids.length > 0 && !layers.includes('constraint_sink_hydrated')) {
    layers.push('constraint_sink_hydrated');
  }
  return {
    ...memContractObs,
    layers,
    constraint_sink: {
      hydrated: applied.patch_ids.length > 0 && applied.keys.length > 0,
      applied_keys: applied.keys,
      patch_ids: applied.patch_ids,
      overridden_by_request_keys: applied.overridden_by_request,
    },
  };
}
