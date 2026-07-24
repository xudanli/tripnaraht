/** PRD 3.12 — 成团 → Active Trip 实例化计划 Schema */

export const TRIP_INSTANTIATION_VERSION = 'trip_instantiation_v1' as const;

export type TripInstantiationStrategy =
  | 'reuse_trekking_spawn'
  | 'trekking_spawn'
  | 'route_template'
  | 'minimal_trip';

export interface TripInstantiationCrewMember {
  userId: string;
  role: 'captain' | 'member';
  applicationId?: string;
}

export interface TripInstantiationPlan {
  version: typeof TRIP_INSTANTIATION_VERSION;
  recruitmentPostId: string;
  strategy: TripInstantiationStrategy;
  canInstantiate: boolean;
  blockReason: string | null;
  /** 已有 spawn 时复用 */
  existingTripId: string | null;
  routeTemplateCatalogId: string | null;
  routeDirectionName: string | null;
  routeTemplateDurationDays: number | null;
  recruitmentScriptId: string | null;
  vibeChipIds: string[];
  toolchainIds: string[];
  vaultMilestoneIds: string[];
  crew: TripInstantiationCrewMember[];
  contextualCardIds: string[];
}

export const TRIP_INSTANTIATION_SNAPSHOT_KEY = '_tripInstantiation' as const;

export interface TripInstantiationResultView {
  status: 'instantiated' | 'blocked';
  postId: string;
  tripId: string | null;
  plan: TripInstantiationPlan;
  instantiatedAt: string | null;
  blockReason: string | null;
  activeTripPath: string | null;
}

export const TRIP_INSTANTIATION_RESULT_SNAPSHOT_KEY = '_tripInstantiationResult' as const;

export interface TripInstantiationPreviewView {
  status: 'preview';
  plan: TripInstantiationPlan;
  existingResult: TripInstantiationResultView | null;
  /** PRD 3.13 — 成团后将派发的协同任务预览 */
  collaborativeTaskPreview?: import('./recruitment-task-flywheel.types').CollaborativeTaskPreviewView | null;
}
