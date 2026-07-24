import type { MatchSquareRecruitmentPost } from '@prisma/client';
import type { MatchableProfile } from '../../odyssey-intake/engine/companion-matching.engine';
import { resolveInteractionModeLabel } from '../config/interaction-modes.config';
import {
  resolveTeamworkStyleCapsule,
  resolveTeamworkStyleDefinition,
  resolveTeamworkStyleLabel,
  TEAMWORK_STYLE_OPTIONS,
} from '../config/planning-styles.config';
import { buildTeamPuzzle } from '../engine/slot-filling.engine';
import { buildVibeLlmPostView } from '../util/vibe-post-view.util';
import { readVibeParseFromSnapshot } from '../engine/vibe-llm-parse.engine';
import { readTrekkingOrchestrationFromSnapshot } from '../engine/trekking-vibe-orchestration.engine';
import { readTrekkingSpawnResultFromSnapshot } from '../engine/trekking-spawn.engine';
import { readTripInstantiationResultFromSnapshot } from '../engine/trip-instantiation.engine';
import { readSovereignForceLockFromSnapshot } from '../engine/sovereign-force-lock.engine';
import {
  readRouteTemplateLaunchFromSnapshot,
  toRouteTemplateBindingView,
} from '../engine/route-template-launch-recruitment.engine';
import type { VerifiedCredentialsView } from '../../odyssey-intake/types/verified-credentials.types';
import { computeRecruitmentCompatibility } from '../util/recruitment-compatibility.util';
import type { SocialBackgroundProfile } from '../engine/social-background-matching.engine';
import type {
  CaptainPersonaSnapshot,
  RecruitmentPlanningStyle,
  RecruitmentPostCardView,
  RecruitmentPostDetailView,
  RecruitmentPostStatus,
  TravelMode,
  TripMoodTag,
  TeamworkStyle,
} from '../types/match-square.types';
import type { TrekkingVibeOrchestrationPlan } from '../types/trekking-vibe-orchestration.types';
import type { TrekkingSpawnResultView } from '../types/trekking-spawn.types';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseSnapshot(raw: unknown): CaptainPersonaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CaptainPersonaSnapshot;
}

export function computeCompatibilityPercent(
  viewer: MatchableProfile | null,
  snapshot: CaptainPersonaSnapshot | null,
  teamworkStyle?: TeamworkStyle | null,
): number | null {
  return computeRecruitmentCompatibility(teamworkStyle, snapshot, viewer).compatibilityPercent;
}

function buildBudgetRange(
  min: number | null,
  max: number | null,
): RecruitmentPostCardView['budgetRange'] {
  if (min == null && max == null) return null;
  return { minCents: min, maxCents: max };
}

export function toRecruitmentPostCardView(
  post: MatchSquareRecruitmentPost,
  viewer: MatchableProfile | null,
  options?: {
    captainSocial?: SocialBackgroundProfile;
    viewerSocial?: SocialBackgroundProfile;
    verifiedCredentials?: VerifiedCredentialsView | null;
    captainDisplayName?: string | null;
  },
): RecruitmentPostCardView {
  const snapshot = parseSnapshot(post.captainPersonaSnapshot);
  const styleDef = resolveTeamworkStyleDefinition(post.planningStyle);
  const teamworkStyle = (post.planningStyle as TeamworkStyle | null) ?? null;
  const match = computeRecruitmentCompatibility(teamworkStyle, snapshot, viewer, {
    captain: options?.captainSocial,
    viewer: options?.viewerSocial,
  }, {
    captainTrip: {
      destination: post.destination,
      startDate: formatDate(post.startDate),
      endDate: formatDate(post.endDate),
    },
    viewerTrip: viewer
      ? {
          destination: viewer.destination,
          startDate: viewer.startDate,
          endDate: viewer.endDate,
        }
      : null,
  });

  const vibeLlm = buildVibeLlmPostView(post.captainPersonaSnapshot);

  return {
    id: post.id,
    status: post.status as RecruitmentPostStatus,
    captainUserId: post.captainUserId,
    captainCardTitle: post.captainCardTitle,
    captainMbtiType: post.captainMbtiType,
    captainInteractionMode: post.captainInteractionMode,
    captainInteractionModeLabel: snapshot?.interactionModeLabel ?? resolveInteractionModeLabel(post.captainInteractionMode),
    captainReputationStars: post.captainReputationStars,
    compatibilityPercent: match.compatibilityPercent,
    matchInsightDrawer: match.matchInsightDrawer ?? null,
    structuralMatch: match.structuralMatch ?? null,
    teamworkMatchBlocked: match.teamworkMatchBlocked,
    teamworkBlockReason: match.teamworkBlockReason,
    recommendationHidden: match.recommendationHidden,
    recommendationHiddenReason: match.recommendationHiddenReason,
    verifiedCredentials: options?.verifiedCredentials ?? null,
    destination: post.destination,
    departureLabel: post.departureLabel,
    startDate: formatDate(post.startDate),
    endDate: formatDate(post.endDate),
    teamStatus: {
      slotsFilled: post.slotsFilled,
      slotsNeeded: post.slotsNeeded,
      slotsRemaining: Math.max(0, post.slotsNeeded - post.slotsFilled),
    },
    teamPuzzle: buildTeamPuzzle(post, viewer, {
      captainSocial: options?.captainSocial ?? null,
      captainDisplayName: options?.captainDisplayName ?? null,
    }),
    vibeLlm,
    captainMessage: post.captainMessage,
    recruitmentVision: vibeLlm?.visionText ?? null,
    itinerarySummary: post.itinerarySummary,
    budgetRange: buildBudgetRange(post.budgetMinCents, post.budgetMaxCents),
    tripMoodTag: (post.tripMoodTag as TripMoodTag | null) ?? null,
    teamworkStyle,
    teamworkStyleCapsule: resolveTeamworkStyleCapsule(teamworkStyle),
    planningStyle: teamworkStyle,
    planningStyleLabel: styleDef?.label ?? resolveTeamworkStyleLabel(teamworkStyle),
    planningStyleDescription: styleDef?.description ?? null,
    travelMode: (post.travelMode as TravelMode | null) ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}

export function toRecruitmentPostDetailView(
  post: MatchSquareRecruitmentPost,
  viewer: MatchableProfile | null,
  viewerUserId?: string,
  options?: {
    captainSocial?: SocialBackgroundProfile;
    viewerSocial?: SocialBackgroundProfile;
    verifiedCredentials?: VerifiedCredentialsView | null;
    captainDisplayName?: string | null;
  },
): RecruitmentPostDetailView {
  return {
    ...toRecruitmentPostCardView(post, viewer, options),
    vibeParse: readVibeParseFromSnapshot(post.captainPersonaSnapshot),
    trekkingOrchestration: readTrekkingOrchestrationFromSnapshot(post.captainPersonaSnapshot),
    trekkingSpawnResult: readTrekkingSpawnResultFromSnapshot(post.captainPersonaSnapshot),
    tripInstantiationResult: readTripInstantiationResultFromSnapshot(post.captainPersonaSnapshot),
    routeTemplateBinding: (() => {
      const launch = readRouteTemplateLaunchFromSnapshot(post.captainPersonaSnapshot);
      return launch ? toRouteTemplateBindingView(launch) : null;
    })(),
    sovereignLock: readSovereignForceLockFromSnapshot(post.captainPersonaSnapshot),
    preferenceNotes: post.preferenceNotes,
    vehicleInfo: post.vehicleInfo,
    destinationLat: post.destinationLat,
    destinationLng: post.destinationLng,
    destinationPoiId: post.destinationPoiId,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    closedAt: post.closedAt?.toISOString() ?? null,
    isCaptain: viewerUserId != null && post.captainUserId === viewerUserId,
  };
}
