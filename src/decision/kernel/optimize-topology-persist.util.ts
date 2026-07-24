/**
 * executeOptimize 落盘：freezeRouteSelection 时固化 segmentId 拓扑并写入 DSO 元数据
 */

import type { DecisionState, OptimizationHints } from './decision-state.types';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { WorldModelMeta } from '../../skills/world/world-model-provenance.types';
import {
  buildRouteTopologyLockRecord,
  type RouteTopologyLockRecord,
} from './route-topology-lock.util';

export interface TopologyPersistResult {
  state: DecisionState;
  lock?: RouteTopologyLockRecord;
  appliedRecommended: boolean;
}

export function shouldApplyTopologyLockOnOptimize(hints: OptimizationHints | undefined): boolean {
  return hints?.optimizationFlags?.freezeRouteSelection === true;
}

export function applyTopologyLockedOptimizePersist(
  state: DecisionState,
  hints: OptimizationHints,
): TopologyPersistResult {
  if (!shouldApplyTopologyLockOnOptimize(hints)) {
    return { state, appliedRecommended: false };
  }

  const planDraft = state.tripState?.planDraft as Itinerary | undefined;
  if (!planDraft?.days?.length) {
    const envPatch = {
      isRouteTopologyLocked: true,
      route_skeleton_locked: true,
    };
    return {
      state: patchStateForTopologyLock(state, envPatch, undefined, hints),
      appliedRecommended: false,
    };
  }

  const tripId = state.systemState?.requestId ?? state.requestId ?? 'unknown';
  const routeDirectionId =
    (state.environmentState as { routeDirectionId?: string })?.routeDirectionId ?? 'unknown';

  const recId = hints.recommendedAlternativeId;
  const alt = hints.alternatives?.find((a) => a.id === recId);
  const recommendedItinerary = (alt as { itinerary?: Itinerary } | undefined)?.itinerary;

  const { lock, nextItinerary } = buildRouteTopologyLockRecord({
    anchorItinerary: planDraft,
    tripId,
    routeDirectionId,
    recommendedItinerary,
    recommendedAlternativeId: recId,
  });

  const envPatch = {
    isRouteTopologyLocked: true,
    route_skeleton_locked: true,
    routeTopologyLock: lock,
  };

  return {
    state: patchStateForTopologyLock(state, envPatch, lock, hints, nextItinerary),
    lock,
    appliedRecommended: Boolean(recommendedItinerary?.days?.length) && lock.topologyMatch,
  };
}

function patchStateForTopologyLock(
  state: DecisionState,
  envPatch: Record<string, unknown>,
  lock: RouteTopologyLockRecord | undefined,
  hints: OptimizationHints,
  nextItinerary?: Itinerary,
): DecisionState {
  const rd = { ...(state.research_data ?? {}) } as Record<string, unknown>;
  const prevMeta = (rd.worldModelMeta ?? {}) as WorldModelMeta;
  rd.worldModelMeta = {
    ...prevMeta,
    isRouteTopologyLocked: true,
    route_skeleton_locked: true,
    lockedSegmentIds: lock?.lockedSegmentIds,
    routeSkeletonSignature: lock?.routeSkeletonSignature,
    physicalRealityIncomplete:
      prevMeta.physicalRealityIncomplete ?? hints.optimizationFlags?.physicalRealityIncomplete,
  };

  const tripState = {
    ...(state.tripState ?? {}),
    ...(nextItinerary ? { planDraft: nextItinerary } : {}),
    ...(lock ? { routeTopologyLock: lock } : {}),
  };

  return {
    ...state,
    tripState,
    environmentState: {
      ...(state.environmentState ?? {}),
      ...envPatch,
    },
    research_data: rd,
    optimizationHints: {
      ...hints,
      optimizationFlags: {
        ...hints.optimizationFlags,
        freezeRouteSelection: true,
      },
    },
  };
}
