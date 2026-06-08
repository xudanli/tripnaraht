import {
  computeCompatibilityScore,
  type MatchableProfile,
} from '../../odyssey-intake/engine/companion-matching.engine';
import type { VerifiedCredentialsBundle } from '../../odyssey-intake/types/verified-credentials.types';
import type {
  CaptainPersonaSnapshot,
  MatchInsightDrawerView,
  RecruitmentPlanningStyle,
  StructuralMatchBreakdownView,
} from '../types/match-square.types';
import {
  clampCompatibilityPercent,
  computeTeamworkStyleMatch,
  failsTeamworkStyleHardGate,
} from '../engine/teamwork-style-matching.engine';
import {
  computeSocialBackgroundAlignment,
  type SocialBackgroundProfile,
} from '../engine/social-background-matching.engine';
import {
  computeStructuralMatchScore,
  type TripWindow,
} from '../engine/structural-match.engine';

export interface RecruitmentMatchContext {
  captainTrip?: TripWindow | null;
  viewerTrip?: TripWindow | null;
  captainCredentials?: VerifiedCredentialsBundle | null;
  viewerCredentials?: VerifiedCredentialsBundle | null;
}

export interface RecruitmentCompatibilityResult {
  compatibilityPercent: number | null;
  teamworkMatchBlocked: boolean;
  teamworkBlockReason: string | null;
  socialBackgroundBonusPercent: number;
  recommendationHidden: boolean;
  recommendationHiddenReason: string | null;
  highlights: string[];
  warnings: string[];
  matchInsightDrawer?: MatchInsightDrawerView | null;
  structuralMatch?: StructuralMatchBreakdownView | null;
}

function toMatchable(snapshot: CaptainPersonaSnapshot, userId: string): MatchableProfile {
  return {
    userId,
    mbtiType: snapshot.mbtiType,
    cardTitle: snapshot.cardTitle,
    rawScores: snapshot.rawScores,
    dimensionPercents: snapshot.dimensionPercents,
  };
}

function snapshotFromViewer(viewer: MatchableProfile): CaptainPersonaSnapshot {
  return {
    mbtiType: viewer.mbtiType,
    cardTitle: viewer.cardTitle,
    interactionMode: '',
    interactionModeLabel: '',
    quadrant: 'NT',
    rawScores: viewer.rawScores,
    dimensionPercents: viewer.dimensionPercents,
  };
}

function toBreakdownView(
  breakdown: NonNullable<ReturnType<typeof computeStructuralMatchScore>['breakdown']>,
): StructuralMatchBreakdownView {
  return {
    baseScore: breakdown.baseScore,
    teamworkFitPoints: breakdown.teamworkFitPoints,
    stressFitPoints: breakdown.stressFitPoints,
    mbtiSynergyPoints: breakdown.mbtiSynergyPoints,
    chemistryScriptPoints: breakdown.chemistryScriptPoints,
    industryAntiClusterPoints: breakdown.industryAntiClusterPoints,
    chemistryScriptId: breakdown.chemistryScriptId,
    chemistryScriptTitle: breakdown.chemistryScriptTitle,
    algorithm: breakdown.algorithm,
  };
}

function computeStructuralRecruitmentScore(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
  captain: CaptainPersonaSnapshot,
  member: CaptainPersonaSnapshot,
  ctx?: RecruitmentMatchContext,
  social?: { captain?: SocialBackgroundProfile; viewer?: SocialBackgroundProfile },
): RecruitmentCompatibilityResult | null {
  const structural = computeStructuralMatchScore({
    leader: {
      mbtiType: captain.mbtiType,
      rawScores: captain.rawScores,
      dimensionPercents: captain.dimensionPercents,
      credentials: ctx?.captainCredentials,
      social: social?.captain,
      trip: ctx?.captainTrip ?? undefined,
    },
    member: {
      mbtiType: member.mbtiType,
      rawScores: member.rawScores,
      dimensionPercents: member.dimensionPercents,
      credentials: ctx?.viewerCredentials,
      social: social?.viewer,
      trip: ctx?.viewerTrip ?? undefined,
    },
    teamworkStyle,
    skipTripGate: !ctx?.captainTrip?.startDate || !ctx?.viewerTrip?.startDate,
  });

  if (structural.hardBlocked) {
    return {
      compatibilityPercent: null,
      teamworkMatchBlocked: false,
      teamworkBlockReason: null,
      socialBackgroundBonusPercent: 0,
      recommendationHidden: true,
      recommendationHiddenReason: structural.hardGateMessage,
      highlights: structural.highlights,
      warnings: structural.warnings,
      matchInsightDrawer: null,
      structuralMatch: null,
    };
  }

  return {
    compatibilityPercent: structural.compatibilityPercent,
    teamworkMatchBlocked: false,
    teamworkBlockReason: null,
    socialBackgroundBonusPercent: 0,
    recommendationHidden: false,
    recommendationHiddenReason: null,
    highlights: structural.highlights,
    warnings: structural.warnings,
    matchInsightDrawer: structural.insightDrawer,
    structuralMatch: structural.breakdown ? toBreakdownView(structural.breakdown) : null,
  };
}

function mergeMatchResult(
  base: Omit<
    RecruitmentCompatibilityResult,
    'socialBackgroundBonusPercent' | 'recommendationHidden' | 'recommendationHiddenReason'
  >,
  social: ReturnType<typeof computeSocialBackgroundAlignment>,
  teamworkDelta: number,
  baseScorePercent: number,
): RecruitmentCompatibilityResult {
  if (social.hardBlocked) {
    return {
      compatibilityPercent: null,
      teamworkMatchBlocked: base.teamworkMatchBlocked,
      teamworkBlockReason: base.teamworkBlockReason,
      socialBackgroundBonusPercent: 0,
      recommendationHidden: true,
      recommendationHiddenReason: social.blockReason,
      highlights: [...base.highlights, ...social.highlights],
      warnings: [...base.warnings, ...social.warnings],
      matchInsightDrawer: base.matchInsightDrawer ?? null,
      structuralMatch: base.structuralMatch ?? null,
    };
  }

  return {
    ...base,
    socialBackgroundBonusPercent: social.bonusPercent,
    recommendationHidden: false,
    recommendationHiddenReason: null,
    compatibilityPercent: clampCompatibilityPercent(
      baseScorePercent + teamworkDelta + social.bonusPercent,
    ),
    highlights: [...base.highlights, ...social.highlights],
    warnings: [...base.warnings, ...social.warnings],
  };
}

/** PRD Match Engine v2 — Graph Clustering + CSP 双层撮合（优先） / legacy 回退 */
export function computeRecruitmentCompatibility(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
  captainSnapshot: CaptainPersonaSnapshot | null,
  viewer: MatchableProfile | null,
  social?: {
    captain?: SocialBackgroundProfile;
    viewer?: SocialBackgroundProfile;
  },
  ctx?: RecruitmentMatchContext,
): RecruitmentCompatibilityResult {
  if (!viewer || !captainSnapshot) {
    return emptyCompatibilityResult();
  }

  if (social?.captain?.fulfillmentBlocked) {
    return fulfillmentBlockedResult('该招募发起者履约背书未达平台安全阈值，系统不予推荐。');
  }

  const applicantSnapshot = snapshotFromViewer(viewer);

  if (failsTeamworkStyleHardGate(teamworkStyle, applicantSnapshot)) {
    return teamworkBlockedResult(
      '该招募为「一起随便玩」即兴模式，与你的强计划型人格存在责任边界冲突，系统不予推荐。',
    );
  }

  const structuralResult = computeStructuralRecruitmentScore(
    teamworkStyle,
    captainSnapshot,
    applicantSnapshot,
    ctx,
    social,
  );

  if (structuralResult?.compatibilityPercent != null) {
    return structuralResult;
  }

  if (structuralResult?.recommendationHidden) {
    return structuralResult;
  }

  return computeLegacyRecruitmentCompatibility(teamworkStyle, captainSnapshot, applicantSnapshot, social);
}

export function computeRecruitmentCompatibilityForSnapshots(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
  captain: CaptainPersonaSnapshot,
  applicant: CaptainPersonaSnapshot,
  social?: {
    captain?: SocialBackgroundProfile;
    viewer?: SocialBackgroundProfile;
  },
  ctx?: RecruitmentMatchContext,
): RecruitmentCompatibilityResult {
  if (social?.captain?.fulfillmentBlocked) {
    return fulfillmentBlockedResult('该招募发起者履约背书未达平台安全阈值，系统不予推荐。');
  }

  if (failsTeamworkStyleHardGate(teamworkStyle, applicant)) {
    return teamworkBlockedResult(
      '该招募为「一起随便玩」即兴模式，与申请者的强计划型人格存在责任边界冲突。',
    );
  }

  const structuralResult = computeStructuralRecruitmentScore(
    teamworkStyle,
    captain,
    applicant,
    ctx,
    social,
  );

  if (structuralResult?.compatibilityPercent != null) {
    return structuralResult;
  }

  if (structuralResult?.recommendationHidden) {
    return structuralResult;
  }

  const captainProfile = toMatchable(captain, 'captain');
  const applicantProfile = toMatchable(applicant, 'applicant');
  return computeLegacyRecruitmentCompatibility(
    teamworkStyle,
    captain,
    applicant,
    social,
    captainProfile,
    applicantProfile,
  );
}

function computeLegacyRecruitmentCompatibility(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
  captain: CaptainPersonaSnapshot,
  applicant: CaptainPersonaSnapshot,
  social?: { captain?: SocialBackgroundProfile; viewer?: SocialBackgroundProfile },
  captainProfileOverride?: MatchableProfile,
  applicantProfileOverride?: MatchableProfile,
): RecruitmentCompatibilityResult {
  const captainProfile = captainProfileOverride ?? toMatchable(captain, 'captain');
  const applicantProfile = applicantProfileOverride ?? toMatchable(applicant, 'applicant');
  const { score } = computeCompatibilityScore(captainProfile, applicantProfile);
  const baseScorePercent = Math.round(score * 100);
  const teamwork = computeTeamworkStyleMatch(teamworkStyle, captain, applicant);

  const socialMatch =
    social?.captain && social?.viewer
      ? computeSocialBackgroundAlignment(social.captain, social.viewer)
      : { hardBlocked: false, blockReason: null, bonusPercent: 0, highlights: [], warnings: [] };

  return mergeMatchResult(
    {
      compatibilityPercent: clampCompatibilityPercent(baseScorePercent + teamwork.deltaPercent),
      teamworkMatchBlocked: false,
      teamworkBlockReason: null,
      highlights: teamwork.highlights,
      warnings: teamwork.warnings,
      matchInsightDrawer: null,
      structuralMatch: null,
    },
    socialMatch,
    teamwork.deltaPercent,
    baseScorePercent,
  );
}

function emptyCompatibilityResult(): RecruitmentCompatibilityResult {
  return {
    compatibilityPercent: null,
    teamworkMatchBlocked: false,
    teamworkBlockReason: null,
    socialBackgroundBonusPercent: 0,
    recommendationHidden: false,
    recommendationHiddenReason: null,
    highlights: [],
    warnings: [],
    matchInsightDrawer: null,
    structuralMatch: null,
  };
}

function fulfillmentBlockedResult(message: string): RecruitmentCompatibilityResult {
  return {
    compatibilityPercent: null,
    teamworkMatchBlocked: false,
    teamworkBlockReason: null,
    socialBackgroundBonusPercent: 0,
    recommendationHidden: true,
    recommendationHiddenReason: message,
    highlights: [],
    warnings: [],
    matchInsightDrawer: null,
    structuralMatch: null,
  };
}

function teamworkBlockedResult(message: string): RecruitmentCompatibilityResult {
  return {
    compatibilityPercent: null,
    teamworkMatchBlocked: true,
    teamworkBlockReason: message,
    socialBackgroundBonusPercent: 0,
    recommendationHidden: false,
    recommendationHiddenReason: null,
    highlights: [],
    warnings: [],
    matchInsightDrawer: null,
    structuralMatch: null,
  };
}
