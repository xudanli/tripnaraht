import type { MatchSquareRecruitmentApplication } from '@prisma/client';
import { resolveInteractionModeLabel } from '../config/interaction-modes.config';
import type {
  ApplicationStatus,
  CaptainPersonaSnapshot,
  RecruitmentApplicationCardView,
} from '../types/match-square.types';
import type { ResolvedApplicantIdentity } from './application-identity.util';

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

export function toRecruitmentApplicationCardView(
  row: MatchSquareRecruitmentApplication,
  identity?: ResolvedApplicantIdentity | null,
): RecruitmentApplicationCardView {
  const snapshot = row.applicantPersonaSnapshot as unknown as CaptainPersonaSnapshot | null;

  const applicantDisplayName =
    identity?.applicantDisplayName ??
    row.applicantDisplayName ??
    row.applicantCardTitle;
  const applicantCardTitle = identity?.applicantCardTitle ?? row.applicantCardTitle;
  const applicantInteractionModeLabel =
    identity?.applicantInteractionModeLabel ??
    snapshot?.interactionModeLabel ??
    resolveInteractionModeLabel(row.applicantInteractionMode);

  return {
    id: row.id,
    postId: row.postId,
    status: row.status as ApplicationStatus,
    applicantUserId: row.applicantUserId,
    applicantDisplayName,
    applicantCardTitle,
    applicantMbtiType: row.applicantMbtiType,
    applicantInteractionMode: row.applicantInteractionMode,
    applicantInteractionModeLabel,
    applicantReputationStars: row.applicantReputationStars,
    safetyWarning: null,
    compatibilityPercent: row.compatibilityPercent,
    highlights: parseStringArray(row.matchHighlights),
    warnings: parseStringArray(row.matchWarnings),
    message: row.message,
    planningCommitmentAccepted: row.planningCommitmentAccepted,
    teamworkCommitmentAccepted: row.teamworkCommitmentAccepted,
    targetSlotIndex: row.targetSlotIndex,
    targetSlotId: row.targetSlotId,
    targetSlotLabel: row.targetSlotLabel,
    applicantVerifiedCredentials: identity?.applicantVerifiedCredentials ?? null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}
