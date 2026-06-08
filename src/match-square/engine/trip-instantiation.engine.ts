import { readTrekkingOrchestrationFromSnapshot } from './trekking-vibe-orchestration.engine';
import { readTrekkingSpawnResultFromSnapshot } from './trekking-spawn.engine';
import { readRouteTemplateLaunchFromSnapshot } from './route-template-launch-recruitment.engine';
import { readVibeParseFromSnapshot } from './vibe-llm-parse.engine';
import {
  resolveContextualCardIds,
  resolveInstantiationStrategy,
} from '../config/trip-instantiation-strategies.config';
import type {
  TripInstantiationPlan,
  TripInstantiationResultView,
} from '../types/trip-instantiation.types';
import {
  TRIP_INSTANTIATION_RESULT_SNAPSHOT_KEY,
  TRIP_INSTANTIATION_VERSION,
} from '../types/trip-instantiation.types';
import { readSovereignForceLockFromSnapshot, isSovereignSealedPost } from './sovereign-force-lock.engine';

export interface BuildTripInstantiationPlanInput {
  post: {
    id: string;
    captainUserId: string;
    status: string;
    slotsFilled: number;
    slotsNeeded: number;
    captainPersonaSnapshot: unknown;
  };
  approvedApplications: Array<{ id: string; applicantUserId: string }>;
}

export function buildTripInstantiationPlan(
  input: BuildTripInstantiationPlanInput,
): TripInstantiationPlan {
  const { post, approvedApplications } = input;
  const vibeParse = readVibeParseFromSnapshot(post.captainPersonaSnapshot);
  const orchestration =
    vibeParse?.trekkingOrchestration ??
    readTrekkingOrchestrationFromSnapshot(post.captainPersonaSnapshot);
  const spawnResult = readTrekkingSpawnResultFromSnapshot(post.captainPersonaSnapshot);
  const routeTemplateMatch = vibeParse?.routeTemplateMatch ?? null;
  const templateLaunch = readRouteTemplateLaunchFromSnapshot(post.captainPersonaSnapshot);

  const hasLiveRoute =
    orchestration?.worldModel.routeDirectionCandidates.some((r) => r.availability === 'live') ??
    false;
  const catalogId =
    routeTemplateMatch?.primaryMatch?.catalogId ?? templateLaunch?.catalogId ?? null;

  const strategy = resolveInstantiationStrategy({
    hasTrekkingSpawnResult: Boolean(spawnResult?.tripId),
    hasTrekkingOrchestrationLive: Boolean(orchestration && hasLiveRoute),
    hasRouteTemplateCatalog: Boolean(catalogId),
  });

  const crew = [
    { userId: post.captainUserId, role: 'captain' as const },
    ...approvedApplications.map((a) => ({
      userId: a.applicantUserId,
      role: 'member' as const,
      applicationId: a.id,
    })),
  ];

  const vibeChipIds = vibeParse?.payload.vibe_chips.map((c) => c.id) ?? [];
  const toolchainIds = orchestration?.toolchain.map((t) => t.toolId) ?? [];
  const vaultMilestoneIds = routeTemplateMatch?.primaryMatch?.vaultMilestoneIds ?? [];

  const sovereignLock = readSovereignForceLockFromSnapshot(post.captainPersonaSnapshot);
  const sealed =
    isSovereignSealedPost(post) ||
    (post.status === 'closed' && post.slotsFilled >= post.slotsNeeded);
  let canInstantiate = sealed;
  let blockReason: string | null = null;

  if (!sealed) {
    canInstantiate = false;
    blockReason = sovereignLock
      ? '招募尚未完成强制锁团'
      : '招募尚未成团锁死（满员 closed）';
  } else if (approvedApplications.length < 1 && !sovereignLock) {
    canInstantiate = false;
    blockReason = '至少需 1 名已通过队员方可实例化';
  } else if (strategy === 'trekking_spawn' && !hasLiveRoute) {
    canInstantiate = false;
    blockReason = '徒步路线尚无 live fixture，无法实例化 Active Trip';
  }

  return {
    version: TRIP_INSTANTIATION_VERSION,
    recruitmentPostId: post.id,
    strategy,
    canInstantiate,
    blockReason,
    existingTripId: spawnResult?.tripId ?? null,
    routeTemplateCatalogId: catalogId,
    routeDirectionName:
      spawnResult?.routeDirectionName ??
      routeTemplateMatch?.primaryMatch?.routeDirectionName ??
      orchestration?.worldModel.routeDirectionCandidates.find((r) => r.availability === 'live')
        ?.routeDirectionName ??
      null,
    routeTemplateDurationDays:
      routeTemplateMatch?.primaryMatch?.durationDays ?? templateLaunch?.durationDays ?? null,
    recruitmentScriptId: vibeParse?.payload.recruitment_script_id ?? null,
    vibeChipIds,
    toolchainIds,
    vaultMilestoneIds,
    crew,
    contextualCardIds: resolveContextualCardIds(vibeChipIds, toolchainIds),
  };
}

export function readTripInstantiationResultFromSnapshot(
  raw: unknown,
): TripInstantiationResultView | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = (raw as Record<string, unknown>)[TRIP_INSTANTIATION_RESULT_SNAPSHOT_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const result = stored as TripInstantiationResultView;
  return result.status === 'instantiated' && result.tripId ? result : null;
}

export function attachTripInstantiationResultSnapshot<T extends object>(
  snapshot: T,
  result: TripInstantiationResultView,
): T & Record<typeof TRIP_INSTANTIATION_RESULT_SNAPSHOT_KEY, TripInstantiationResultView> {
  return { ...snapshot, [TRIP_INSTANTIATION_RESULT_SNAPSHOT_KEY]: result };
}
