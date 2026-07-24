import { TREKKING_SPAWN_RESULT_SNAPSHOT_KEY } from '../types/trekking-spawn.types';
import type { TrekkingRouteCandidate } from '../types/trekking-vibe-orchestration.types';
import type { TrekkingVibeOrchestrationPlan } from '../types/trekking-vibe-orchestration.types';
import type {
  TrekkingSpawnResultView,
  TrekkingSpawnRouteResolution,
  TrekkingSpawnTripMetadata,
} from '../types/trekking-spawn.types';

export function pickLiveRouteCandidate(
  plan: TrekkingVibeOrchestrationPlan,
): TrekkingRouteCandidate | null {
  return plan.worldModel.routeDirectionCandidates.find((r) => r.availability === 'live') ?? null;
}

export function listPlannedRouteCandidates(plan: TrekkingVibeOrchestrationPlan): TrekkingRouteCandidate[] {
  return plan.worldModel.routeDirectionCandidates.filter((r) => r.availability === 'planned');
}

export function toRouteResolution(
  candidate: TrekkingRouteCandidate,
  routeDirectionId: number | null,
): TrekkingSpawnRouteResolution {
  return {
    routeDirectionName: candidate.routeDirectionName,
    labelZh: candidate.labelZh,
    availability: candidate.availability,
    routeDirectionId,
    offlinePackKey: candidate.offlinePackKey,
  };
}

export function buildTrekkingSpawnTripMetadata(
  postId: string,
  result: TrekkingSpawnResultView,
): TrekkingSpawnTripMetadata {
  return {
    matchSquareRecruitmentPostId: postId,
    trekkingScriptId: result.orchestration.scriptId,
    trekkingOrchestrationVersion: result.orchestration.version,
    trekkingSpawn: {
      status: 'spawned',
      postId: result.postId,
      tripId: result.tripId,
      hikePlanId: result.hikePlanId,
      segmentId: result.segmentId,
      routeDirectionId: result.routeDirectionId,
      routeDirectionName: result.routeDirectionName,
      routeLabelZh: result.routeLabelZh,
      orchestrationScriptId: result.orchestration.scriptId,
      offlinePreloadRequired: result.offlinePreloadRequired,
      offlinePackChecksum: result.offlinePack?.checksum ?? null,
      sharedGearDeficits: result.sharedGearDeficits,
      eventStreamMilestones: result.eventStreamMilestones,
      toolchain: result.toolchain,
      dnaEvolutionScheduled: result.dnaEvolutionScheduled,
      dnaEvolutionReason: result.dnaEvolutionReason,
      spawnedAt: result.spawnedAt,
    },
  };
}

export function readTrekkingSpawnResultFromSnapshot(raw: unknown): TrekkingSpawnResultView | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = (raw as Record<string, unknown>)[TREKKING_SPAWN_RESULT_SNAPSHOT_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const result = stored as TrekkingSpawnResultView;
  return result.status === 'spawned' && result.tripId ? result : null;
}

export function attachTrekkingSpawnResultSnapshot<T extends object>(
  snapshot: T,
  result: TrekkingSpawnResultView,
): T & Record<typeof TREKKING_SPAWN_RESULT_SNAPSHOT_KEY, TrekkingSpawnResultView> {
  return { ...snapshot, [TREKKING_SPAWN_RESULT_SNAPSHOT_KEY]: result };
}
