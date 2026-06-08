/** PRD 3.10 Phase 2 — spawn-trip 请求/响应类型 */

import type { HikingOfflinePackDto } from '../../hiking-demo/services/hiking-offline-pack.service';
import type { TrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.types';

export type TrekkingSpawnStatus = 'spawned' | 'blocked' | 'preview';

export interface TrekkingSpawnRouteResolution {
  routeDirectionName: string;
  labelZh: string;
  availability: 'live' | 'planned';
  routeDirectionId: number | null;
  offlinePackKey?: string;
}

export interface TrekkingSpawnPreviewView {
  status: 'preview';
  canSpawn: boolean;
  blockReason: string | null;
  orchestration: TrekkingVibeOrchestrationPlan;
  selectedRoute: TrekkingSpawnRouteResolution | null;
  plannedRoutes: TrekkingSpawnRouteResolution[];
  offlinePreloadRequired: boolean;
  existingSpawn: TrekkingSpawnResultView | null;
}

export interface TrekkingSpawnResultView {
  status: 'spawned';
  postId: string;
  tripId: string;
  hikePlanId: string;
  segmentId: string;
  routeDirectionId: number;
  routeDirectionName: string;
  routeLabelZh: string;
  orchestration: TrekkingVibeOrchestrationPlan;
  offlinePack: HikingOfflinePackDto | null;
  offlinePreloadRequired: boolean;
  sharedGearDeficits: TrekkingVibeOrchestrationPlan['sharedGearDeficits'];
  eventStreamMilestones: TrekkingVibeOrchestrationPlan['eventStreamMilestones'];
  toolchain: TrekkingVibeOrchestrationPlan['toolchain'];
  dnaEvolutionScheduled: boolean;
  dnaEvolutionReason: string | null;
  spawnedAt: string;
}

export const TREKKING_SPAWN_RESULT_SNAPSHOT_KEY = '_trekkingSpawnResult' as const;

export interface TrekkingSpawnTripMetadata {
  matchSquareRecruitmentPostId: string;
  trekkingScriptId: string;
  trekkingOrchestrationVersion: string;
  trekkingSpawn: Omit<TrekkingSpawnResultView, 'orchestration' | 'offlinePack'> & {
    orchestrationScriptId: string;
    offlinePackChecksum?: string | null;
  };
}
