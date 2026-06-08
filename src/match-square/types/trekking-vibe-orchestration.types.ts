/** PRD 3.10 — Vibe 徒步愿景 → TripNARA World Model / DNA 编排计划 */

import type { PremiumTrekkingScriptId } from '../config/premium-trekking.config';

export const TREKKING_ORCHESTRATION_VERSION = 'trekking_orchestration_v1' as const;

export type TrekkingWorldModelProfile =
  | 'heavy_offline_dem'
  | 'light_dyl_retreat'
  | 'fast_light_sprint';

export type TrekkingRouteAvailability = 'live' | 'planned';

export interface TrekkingRouteCandidate {
  routeDirectionName: string;
  labelZh: string;
  availability: TrekkingRouteAvailability;
  offlinePackKey?: string;
  destinationSubScopeId?: string;
}

export interface TrekkingSharedGearDeficit {
  item: string;
  reason: string;
}

export interface TrekkingEventStreamMilestone {
  slot: 'evening' | 'summit' | 'finish' | 'pre_dawn';
  eventId: string;
  label: string;
  condition?: string;
}

export interface TrekkingToolchainItem {
  toolId: string;
  label: string;
  trigger: string;
}

export type TrekkingDnaAmbiguityHint = 'minimize' | 'co_create' | 'silent_flow';

export interface TrekkingDnaEvolutionHints {
  teamworkModel: string;
  ambiguityToleranceHint: TrekkingDnaAmbiguityHint;
  socialMatchingHint: string;
  postTripConfirmTrigger: string;
  /** 未来 PreferenceEvolutionService 扩展 reason */
  preferenceEvolutionReasonPlanned:
    | 'TREK_VIBE_CONFIRMED'
    | 'TREK_READINESS_ACK'
    | 'TREK_POST_RATING_FIVE_STAR';
  odysseyWeightAdjustments?: Array<{ dimension: string; direction: 'increase' | 'decrease'; rationale: string }>;
}

export interface TrekkingStructuralMatchHints {
  filterNegativeTags: string[];
  preferSlotMbtiTypes: boolean;
  requireHighSecurity: boolean;
}

export interface TrekkingVibeOrchestrationPlan {
  version: typeof TREKKING_ORCHESTRATION_VERSION;
  scriptId: PremiumTrekkingScriptId;
  sceneCategory: 'premium_trekking';
  worldModel: {
    profile: TrekkingWorldModelProfile;
    routeDirectionCandidates: TrekkingRouteCandidate[];
    offlineDataPreloadRequired: boolean;
    demGridMetres: 12.5 | 20 | null;
    physicalConstraints: string[];
  };
  sharedGearDeficits: TrekkingSharedGearDeficit[];
  eventStreamMilestones: TrekkingEventStreamMilestone[];
  toolchain: TrekkingToolchainItem[];
  dnaEvolution: TrekkingDnaEvolutionHints;
  structuralMatch: TrekkingStructuralMatchHints;
}

export const TREKKING_ORCHESTRATION_SNAPSHOT_KEY = '_trekkingOrchestration' as const;
