import type { MatchSquareApplication, MatchSquarePost } from '@prisma/client';
import {
  PLANNING_STYLE_CAPSULES,
  PLANNING_STYLE_LABELS,
} from '../match-square.constants';
import { computeCompatibilityPercent } from './match-square-persona.util';

type ApplicationRow = Pick<
  MatchSquareApplication,
  | 'id'
  | 'postId'
  | 'status'
  | 'applicantUserId'
  | 'message'
  | 'planningCommitmentAccepted'
  | 'teamworkCommitmentAccepted'
  | 'targetSlotIndex'
  | 'targetSlotId'
  | 'targetSlotLabel'
  | 'applicantMbtiType'
  | 'applicantCardTitle'
  | 'applicantInteractionMode'
  | 'createdAt'
  | 'decidedAt'
>;

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function routeTemplateFieldsFromSnapshot(snapshot: unknown) {
  const root = objectRecord(snapshot);
  if (!root) return {};
  const binding = objectRecord(root.routeTemplateBinding ?? root.route_template_binding);
  const routeTemplateCatalogId =
    stringValue(root.routeTemplateCatalogId ?? root.route_template_catalog_id) ??
    stringValue(binding?.catalogId ?? binding?.catalog_id);
  const routeTemplateIdRaw =
    root.routeTemplateId ?? root.route_template_id ?? binding?.routeTemplateId ?? binding?.route_template_id;
  const routeTemplateId =
    typeof routeTemplateIdRaw === 'number'
      ? routeTemplateIdRaw
      : typeof routeTemplateIdRaw === 'string' && routeTemplateIdRaw.trim()
        ? Number(routeTemplateIdRaw)
        : undefined;
  const titleZh =
    stringValue(binding?.titleZh ?? binding?.title_zh) ??
    stringValue(root.templateName ?? root.template_name) ??
    routeTemplateCatalogId;

  return {
    routeTemplateCatalogId: routeTemplateCatalogId ?? undefined,
    routeTemplateId: Number.isFinite(routeTemplateId) ? routeTemplateId : undefined,
    routeTemplateBinding:
      routeTemplateCatalogId && Number.isFinite(routeTemplateId)
        ? {
            catalogId: routeTemplateCatalogId,
            routeTemplateId,
            titleZh: titleZh ?? routeTemplateCatalogId,
          }
        : undefined,
    routeTemplateMatch: root.routeTemplateMatch ?? root.route_template_match ?? undefined,
  };
}

function approvedCount(applications: ApplicationRow[]): number {
  return applications.filter((row) => row.status === 'approved').length;
}

export function buildTeamPuzzle(
  post: MatchSquarePost,
  applications: ApplicationRow[],
  viewerUserId?: string,
) {
  const approved = applications.filter((row) => row.status === 'approved');
  const slotsFilled = 1 + approved.length;
  const slotsRemaining = Math.max(0, post.slotsNeeded - approved.length);

  const slots = [
    {
      kind: 'captain' as const,
      slotIndex: 0,
      slotId: 'puzzle-slot-0',
      roleLabel: '队长',
      occupantLabel: post.captainCardTitle ?? '队长',
      occupantUserId: post.captainUserId,
      highlightForViewer: false,
    },
    ...approved.map((app, index) => ({
      kind: 'filled' as const,
      slotIndex: index + 1,
      slotId: `puzzle-slot-${index + 1}`,
      roleLabel: app.targetSlotLabel ?? `队员 ${index + 1}`,
      occupantLabel: app.applicantCardTitle ?? '已通过队员',
      occupantUserId: app.applicantUserId,
      highlightForViewer: false,
    })),
    ...Array.from({ length: slotsRemaining }, (_, index) => ({
      kind: 'open' as const,
      slotIndex: approved.length + index + 1,
      slotId: `puzzle-slot-${approved.length + index + 1}`,
      roleLabel: '建议补位 · 旅伴',
      highlightForViewer: viewerUserId != null && viewerUserId !== post.captainUserId,
      deficitDimension: 'collaboration_fit' as const,
    })),
  ];

  return {
    progressLabel: `${slotsFilled}/${post.slotsNeeded + 1} 位已就位`,
    algorithm: 'team_deficit_pomdp_v1' as const,
    slots,
    viewerPuzzleMatch: null,
  };
}

export function buildTeamStatus(post: MatchSquarePost, applications: ApplicationRow[]) {
  const filled = 1 + approvedCount(applications);
  const slotsNeeded = post.slotsNeeded + 1;
  return {
    slotsFilled: filled,
    slotsNeeded,
    slotsRemaining: Math.max(0, slotsNeeded - filled),
  };
}

export function mapPostCard(
  post: MatchSquarePost,
  options: {
    applications?: ApplicationRow[];
    viewerUserId?: string;
    includeCaptainFields?: boolean;
  } = {},
) {
  const applications = options.applications ?? [];
  const planningStyle = post.planningStyle ?? 'co_planning';
  const compatibilityPercent = computeCompatibilityPercent(
    post.captainUserId,
    options.viewerUserId,
  );
  const routeTemplateFields = routeTemplateFieldsFromSnapshot(post.vibeSnapshot);

  return {
    id: post.id,
    status: post.status,
    captainUserId: post.captainUserId,
    captainDisplayName: null,
    captainCardTitle: post.captainCardTitle ?? '旅行者',
    captainMbtiType: post.captainMbtiType ?? 'INFJ',
    captainInteractionMode: post.captainInteractionMode ?? 'easy_companion',
    captainInteractionModeLabel:
      post.captainInteractionMode === 'deep_learning'
        ? '深度共学型'
        : post.captainInteractionMode === 'independent'
          ? '各自独立型'
          : '轻松陪伴型',
    captainReputationStars: null,
    compatibilityPercent,
    destination: post.destination,
    recruitmentVision: post.recruitmentVision,
    departureLabel: post.departureLabel,
    startDate: formatDateOnly(post.startDate),
    endDate: formatDateOnly(post.endDate),
    teamStatus: buildTeamStatus(post, applications),
    teamPuzzle: buildTeamPuzzle(post, applications, options.viewerUserId),
    captainMessage: post.captainMessage,
    itinerarySummary: post.itinerarySummary,
    budgetRange:
      post.budgetMinCents != null || post.budgetMaxCents != null
        ? {
            minCents: post.budgetMinCents,
            maxCents: post.budgetMaxCents,
          }
        : null,
    tripMoodTag: post.tripMoodTag,
    planningStyle,
    planningStyleLabel: PLANNING_STYLE_LABELS[planningStyle] ?? PLANNING_STYLE_LABELS.co_planning,
    planningStyleDescription: null,
    teamworkStyle: planningStyle,
    teamworkStyleCapsule:
      PLANNING_STYLE_CAPSULES[planningStyle] ?? PLANNING_STYLE_CAPSULES.co_planning,
    travelMode: post.travelMode,
    vehicleInfo: post.vehicleInfo,
    preferences: post.preferenceNotes,
    publishedAt: formatIso(post.publishedAt),
    routeDirectionId: post.routeDirectionId,
    routeDirectionName: post.routeDirectionName,
    ...routeTemplateFields,
    vibeLlm: post.vibeSnapshot ?? null,
    isCaptain: options.viewerUserId === post.captainUserId,
    teamworkMatchBlocked: false,
    teamworkBlockReason: null,
    recommendationHidden: false,
    recommendationHiddenReason: null,
    matchInsightDrawer: compatibilityPercent
      ? {
          headline: `契合度 ${compatibilityPercent}%`,
          lines: [
            {
              status: 'ok' as const,
              label: '组队风格',
              detail: PLANNING_STYLE_LABELS[planningStyle] ?? '一起策划',
            },
          ],
        }
      : null,
    structuralMatch: compatibilityPercent
      ? {
          baseScore: compatibilityPercent,
          teamworkFitPoints: 8,
          stressFitPoints: 6,
          mbtiSynergyPoints: 5,
          algorithm: 'graph_cluster_csp_v1',
        }
      : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    closedAt: formatIso(post.closedAt),
    preferenceNotes: post.preferenceNotes,
    destinationLat: post.destinationLat,
    destinationLng: post.destinationLng,
    vibeParse: post.vibeSnapshot ?? null,
  };
}

export function mapApplicationCard(
  application: ApplicationRow,
  post?: MatchSquarePost,
) {
  const compatibilityPercent = post
    ? computeCompatibilityPercent(post.captainUserId, application.applicantUserId) ?? 75
    : 75;

  return {
    id: application.id,
    postId: application.postId,
    status: application.status,
    applicantUserId: application.applicantUserId,
    applicantDisplayName: application.applicantCardTitle ?? '申请人',
    applicantCardTitle: application.applicantCardTitle ?? '申请人',
    applicantMbtiType: application.applicantMbtiType ?? 'INFJ',
    applicantInteractionMode: application.applicantInteractionMode ?? 'easy_companion',
    applicantInteractionModeLabel:
      application.applicantInteractionMode === 'deep_learning'
        ? '深度共学型'
        : application.applicantInteractionMode === 'independent'
          ? '各自独立型'
          : '轻松陪伴型',
    applicantReputationStars: null,
    compatibilityPercent,
    highlights: ['申请留言已提交，等待队长审批'],
    warnings: [],
    message: application.message,
    planningCommitmentAccepted: application.planningCommitmentAccepted,
    teamworkCommitmentAccepted: application.teamworkCommitmentAccepted,
    targetSlotIndex: application.targetSlotIndex,
    targetSlotId: application.targetSlotId,
    targetSlotLabel: application.targetSlotLabel,
    createdAt: application.createdAt.toISOString(),
    decidedAt: formatIso(application.decidedAt),
  };
}
