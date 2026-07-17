/**
 * 组装 OverallReadinessSnapshot
 */

import {
  resolveWeightTemplateId,
  resolveWeights,
} from '../config/readiness-weight-templates';
import type {
  OverallReadinessCardProjection,
  OverallReadinessFactInput,
  OverallReadinessSnapshot,
  ReadinessAction,
  ReadinessDimension,
  ReadinessDimensionCode,
  ReadinessGate,
  ReadinessIssue,
  ReadinessSeverity,
} from '../types/overall-trip-readiness.types';
import { buildAccommodationDimension } from './build-accommodation-dimension.util';
import { buildActivityDimension } from './build-activity-dimension.util';
import { buildMemberDimension } from './build-member-dimension.util';
import { buildRouteDimension } from './build-route-dimension.util';
import { buildTransportDimension } from './build-transport-dimension.util';
import {
  OVERALL_READINESS_STATE_LABELS_ZH,
  resolveOverallReadinessState,
} from './overall-readiness-state.util';
import { projectReadinessEvidence } from './project-readiness-evidence.util';
import {
  buildHomepageSummary,
  resolveDisplayLabelZh,
} from './homepage-summary.util';

const DIMENSION_LABELS_ZH: Record<ReadinessDimensionCode, string> = {
  ROUTE: '路线',
  ACCOMMODATION: '住宿',
  TRANSPORT: '交通',
  ACTIVITY: '活动',
  MEMBER: '成员',
};

export function assembleOverallReadinessSnapshot(
  input: OverallReadinessFactInput,
): OverallReadinessSnapshot {
  const templateId = resolveWeightTemplateId(input);
  const weights = resolveWeights(templateId);
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();

  const route = buildRouteDimension({
    weight: weights.route,
    feasibility: input.feasibility,
  });
  const accommodation = buildAccommodationDimension({
    weight: weights.accommodation,
    accommodation: input.accommodation,
  });
  const transport = buildTransportDimension({
    weight: weights.transport,
    isSelfDrive: input.isSelfDrive,
    transport: input.transport,
  });
  const activity = buildActivityDimension({
    weight: weights.activity,
    activities: input.activities,
  });
  const member = buildMemberDimension({
    weight: weights.member,
    members: input.members,
  });

  const dimensions = {
    route: route.dimension,
    accommodation: accommodation.dimension,
    transport: transport.dimension,
    activity: activity.dimension,
    member: member.dimension,
  };

  const score = Math.round(
    dimensions.route.score * weights.route +
      dimensions.accommodation.score * weights.accommodation +
      dimensions.transport.score * weights.transport +
      dimensions.activity.score * weights.activity +
      dimensions.member.score * weights.member,
  );

  const allIssues: ReadinessIssue[] = [
    ...route.issues,
    ...accommodation.issues,
    ...transport.issues,
    ...activity.issues,
    ...member.issues,
  ];

  const blockers = allIssues.filter((i) => i.severity === 'BLOCKER');
  const pendingConfirmations = allIssues.filter(
    (i) => i.severity === 'MUST' || i.severity === 'SHOULD',
  );

  const evidenceBundle = projectReadinessEvidence({ ...input, calculatedAt });

  const globalGates: ReadinessGate[] = [
    {
      gateCode: 'ROUTE_EXECUTABLE',
      dimension: 'ROUTE',
      triggered: route.issues.some((i) => i.severity === 'BLOCKER'),
      title: '路线可执行',
      reason: route.issues.find((i) => i.severity === 'BLOCKER')?.title,
    },
    {
      gateCode: 'ACCOM_NIGHT_COVERAGE',
      dimension: 'ACCOMMODATION',
      triggered: accommodation.issues.some((i) => i.severity === 'BLOCKER'),
      title: '每晚有住宿',
      reason: accommodation.issues.find((i) => i.severity === 'BLOCKER')?.title,
    },
    {
      gateCode: 'TRANSPORT_RESOURCES',
      dimension: 'TRANSPORT',
      triggered: transport.issues.some((i) => i.severity === 'BLOCKER'),
      title: '交通资源可用',
      reason: transport.issues.find((i) => i.severity === 'BLOCKER')?.title,
    },
    {
      gateCode: 'MEMBER_PARTICIPATION',
      dimension: 'MEMBER',
      triggered: member.issues.some((i) => i.severity === 'BLOCKER'),
      title: '成员参与确认',
      reason: member.issues.find((i) => i.severity === 'BLOCKER')?.title,
    },
    {
      gateCode: 'EVIDENCE_FRESHNESS',
      dimension: 'FOUNDATION',
      triggered:
        Boolean(input.evidenceFreshness?.revalidationRequired) ||
        evidenceBundle.hasExpiredCritical,
      title: '证据有效',
      reason: evidenceBundle.hasExpiredCritical
        ? `${evidenceBundle.expiredCount} 项动态证据已过期，需重新验证`
        : input.evidenceFreshness?.revalidationRequired
          ? '关键动态证据已过期，需重新验证'
          : undefined,
    },
  ];

  let evidenceConfidence = evidenceBundle.confidence;
  if (input.evidenceFreshness?.isStale || evidenceBundle.hasExpiredCritical) {
    evidenceConfidence = Math.min(evidenceConfidence, 55);
  }

  const needsRevalidation = Boolean(
    input.evidenceFreshness?.revalidationRequired ||
      input.feasibility?.isStale ||
      evidenceBundle.hasExpiredCritical,
  );

  const state = resolveOverallReadinessState({
    score,
    dimensions: Object.values(dimensions),
    blockers,
    evidenceConfidence,
    needsRevalidation,
  });

  const recommendations = enrichRecommendationsWithScoreLift(
    allIssues,
    dimensions,
    weights,
  );

  for (const issue of [...blockers, ...pendingConfirmations]) {
    if (!issue.recommendedAction) continue;
    const match = recommendations.find(
      (r) => r.actionCode === issue.recommendedAction!.actionCode,
    );
    if (match?.estimatedScoreLift != null) {
      issue.recommendedAction.estimatedScoreLift = match.estimatedScoreLift;
    }
  }

  const displayLabelZh = resolveDisplayLabelZh(state);
  const homepage = buildHomepageSummary({
    score,
    state,
    displayLabelZh,
    dimensions,
    blockers,
    pendingConfirmations,
    recommendations,
    expiredEvidenceCount: evidenceBundle.expiredCount,
  });

  return {
    tripId: input.tripId,
    score,
    state,
    stateLabelZh: OVERALL_READINESS_STATE_LABELS_ZH[state],
    displayLabelZh,
    evidenceConfidence,
    weightTemplateId: templateId,
    weights,
    dimensions,
    globalGates,
    blockers,
    pendingConfirmations,
    recommendations,
    homepage,
    evidence: evidenceBundle.evidence,
    expiredEvidenceCount: evidenceBundle.expiredCount,
    planningProgressInternal: input.planningProgressInternal,
    calculatedAt,
  };
}

export function projectOverallReadinessCard(
  snapshot: OverallReadinessSnapshot,
): OverallReadinessCardProjection {
  const top =
    snapshot.blockers[0] ??
    snapshot.pendingConfirmations[0] ??
    undefined;
  const topLift = snapshot.recommendations.find(
    (r) => r.actionCode === top?.recommendedAction?.actionCode,
  )?.estimatedScoreLift;

  return {
    score: snapshot.score,
    state: snapshot.state,
    stateLabelZh: snapshot.stateLabelZh,
    displayLabelZh: snapshot.displayLabelZh,
    headline: snapshot.homepage.headline,
    evidenceConfidence: snapshot.evidenceConfidence,
    blockerCount: snapshot.blockers.length,
    pendingConfirmationCount: snapshot.pendingConfirmations.length,
    whyNotReady: snapshot.homepage.whyNotReady[0],
    potentialScoreLift: snapshot.homepage.potentialScoreLift || undefined,
    dimensions: [
      {
        code: 'ROUTE',
        labelZh: DIMENSION_LABELS_ZH.ROUTE,
        score: snapshot.dimensions.route.score,
      },
      {
        code: 'ACCOMMODATION',
        labelZh: DIMENSION_LABELS_ZH.ACCOMMODATION,
        score: snapshot.dimensions.accommodation.score,
      },
      {
        code: 'TRANSPORT',
        labelZh: DIMENSION_LABELS_ZH.TRANSPORT,
        score: snapshot.dimensions.transport.score,
      },
      {
        code: 'ACTIVITY',
        labelZh: DIMENSION_LABELS_ZH.ACTIVITY,
        score: snapshot.dimensions.activity.score,
      },
      {
        code: 'MEMBER',
        labelZh: DIMENSION_LABELS_ZH.MEMBER,
        score: snapshot.dimensions.member.score,
      },
    ],
    topPriority: top
      ? {
          title: top.title,
          actionCode: top.recommendedAction?.actionCode,
          estimatedScoreLift: topLift ?? top.recommendedAction?.estimatedScoreLift,
        }
      : undefined,
    reportDeepLink: `/api/trips/${snapshot.tripId}/overall-readiness`,
  };
}

function enrichRecommendationsWithScoreLift(
  issues: ReadinessIssue[],
  dimensions: {
    route: ReadinessDimension;
    accommodation: ReadinessDimension;
    transport: ReadinessDimension;
    activity: ReadinessDimension;
    member: ReadinessDimension;
  },
  weights: {
    route: number;
    accommodation: number;
    transport: number;
    activity: number;
    member: number;
  },
): ReadinessAction[] {
  const seen = new Set<string>();
  const out: ReadinessAction[] = [];
  const ordered = [
    ...issues.filter((i) => i.severity === 'BLOCKER'),
    ...issues.filter((i) => i.severity === 'MUST'),
    ...issues.filter((i) => i.severity === 'SHOULD'),
  ];

  const weightByDim: Record<ReadinessDimensionCode, number> = {
    ROUTE: weights.route,
    ACCOMMODATION: weights.accommodation,
    TRANSPORT: weights.transport,
    ACTIVITY: weights.activity,
    MEMBER: weights.member,
  };
  const scoreByDim: Record<ReadinessDimensionCode, number> = {
    ROUTE: dimensions.route.score,
    ACCOMMODATION: dimensions.accommodation.score,
    TRANSPORT: dimensions.transport.score,
    ACTIVITY: dimensions.activity.score,
    MEMBER: dimensions.member.score,
  };

  for (const issue of ordered) {
    const action = issue.recommendedAction;
    if (!action) continue;
    if (seen.has(action.actionCode)) continue;
    seen.add(action.actionCode);

    const dimWeight = weightByDim[issue.dimension] ?? 0.2;
    const dimScore = scoreByDim[issue.dimension] ?? 50;
    const target = issue.severity === 'BLOCKER' ? 85 : 100;
    const projected = Math.min(target, dimScore + severityDelta(issue.severity));
    const lift = Math.max(1, Math.round(dimWeight * Math.max(0, projected - dimScore)));

    out.push({
      ...action,
      estimatedScoreLift: action.estimatedScoreLift ?? lift,
      description:
        action.description ??
        (lift > 0 ? `处理后预计提升约 ${lift} 分` : undefined),
    });
    if (out.length >= 8) break;
  }
  return out;
}

function severityDelta(severity: ReadinessSeverity): number {
  if (severity === 'BLOCKER') return 40;
  if (severity === 'MUST') return 25;
  if (severity === 'SHOULD') return 12;
  return 5;
}
