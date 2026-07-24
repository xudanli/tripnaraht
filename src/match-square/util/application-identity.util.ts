import type { MatchSquareRecruitmentPost } from '@prisma/client';
import { resolveInteractionModeLabel } from '../config/interaction-modes.config';
import { readTeamPuzzleFilledSlots } from '../engine/team-puzzle-assignment.engine';
import type {
  CaptainPersonaSnapshot,
  ApplicantVerifiedCredentialsView,
  TeamPuzzleView,
} from '../types/match-square.types';
import type { VerifiedCredentialsView } from '../../odyssey-intake/types/verified-credentials.types';
import type { UserCredentialsContext } from './credentials-context.util';

const SLOT_PERSONA_PATTERN = /建议补位|🧩|缺位|补位\s*·|极冷酷的|物理输出/;

export function isLikelySlotPersonaLabel(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return SLOT_PERSONA_PATTERN.test(text);
}

export function buildApplicantVerifiedCredentialsEmbed(
  verifiedCredentials: VerifiedCredentialsView,
): ApplicantVerifiedCredentialsView {
  return {
    headline: {
      identityHeadline: verifiedCredentials.headline.identityHeadline,
      trustAssetLine: verifiedCredentials.headline.trustAssetLine,
    },
    dossier: {
      displayName: verifiedCredentials.headline.displayName,
      educationTags: verifiedCredentials.headline.educationTags,
      professionTags: verifiedCredentials.headline.professionTags,
    },
  };
}

export interface ResolvedApplicantIdentity {
  applicantDisplayName: string;
  applicantCardTitle: string;
  applicantInteractionModeLabel: string;
  applicantVerifiedCredentials: ApplicantVerifiedCredentialsView;
}

export interface ApplicantIdentityRowInput {
  applicantDisplayName: string | null;
  applicantCardTitle: string;
  applicantInteractionMode: string;
  applicantPersonaSnapshot: unknown;
  targetSlotLabel: string | null;
}

function parseApplicantPersonaSnapshot(raw: unknown): CaptainPersonaSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CaptainPersonaSnapshot;
}

export function resolveApplicantIdentityFields(input: {
  row: ApplicantIdentityRowInput;
  profileCardTitle?: string | null;
  credentialsCtx: Pick<UserCredentialsContext, 'verifiedCredentials' | 'trust'>;
}): ResolvedApplicantIdentity {
  const snapshot = parseApplicantPersonaSnapshot(input.row.applicantPersonaSnapshot);
  const vc = input.credentialsCtx.verifiedCredentials;

  const storedDisplay = input.row.applicantDisplayName?.trim() || null;
  const displayName =
    vc.headline.displayName ??
    input.credentialsCtx.trust?.displayName ??
    (storedDisplay && !isLikelySlotPersonaLabel(storedDisplay) && storedDisplay !== input.row.targetSlotLabel
      ? storedDisplay
      : null) ??
    snapshot?.cardTitle ??
    '旅伴';

  const profileTitle = input.profileCardTitle?.trim() || snapshot?.cardTitle?.trim() || null;
  const storedTitle = input.row.applicantCardTitle?.trim() || '';
  const titleDirty =
    !storedTitle ||
    isLikelySlotPersonaLabel(storedTitle) ||
    (input.row.targetSlotLabel != null && storedTitle === input.row.targetSlotLabel.trim());

  const applicantCardTitle = titleDirty
    ? profileTitle ?? (isLikelySlotPersonaLabel(storedTitle) ? '旅伴' : storedTitle)
    : profileTitle ?? storedTitle;

  const applicantInteractionModeLabel =
    snapshot?.interactionModeLabel ?? resolveInteractionModeLabel(input.row.applicantInteractionMode);

  return {
    applicantDisplayName: displayName,
    applicantCardTitle,
    applicantInteractionModeLabel,
    applicantVerifiedCredentials: buildApplicantVerifiedCredentialsEmbed(vc),
  };
}

export function resolveCaptainPuzzleOccupantLabel(input: {
  captainCardTitle: string;
  displayName?: string | null;
}): string {
  return input.displayName?.trim() || input.captainCardTitle;
}

export function enrichTeamPuzzleWithIdentities(input: {
  post: MatchSquareRecruitmentPost;
  puzzle: TeamPuzzleView;
  captainDisplayName?: string | null;
  memberIdentities: Map<
    string,
    Pick<ResolvedApplicantIdentity, 'applicantDisplayName' | 'applicantCardTitle'>
  >;
}): TeamPuzzleView {
  const filled = readTeamPuzzleFilledSlots(input.post.captainPersonaSnapshot);

  const slots = input.puzzle.slots.map((slot) => {
    if (slot.slotIndex === 0 && slot.kind === 'filled') {
      return {
        ...slot,
        occupantUserId: input.post.captainUserId,
        occupantLabel: resolveCaptainPuzzleOccupantLabel({
          captainCardTitle: input.post.captainCardTitle,
          displayName: input.captainDisplayName,
        }),
        roleLabel: '队长',
      };
    }

    if (slot.kind !== 'filled' || slot.slotIndex == null || slot.slotIndex < 1) {
      return slot;
    }

    const record = filled?.slots.find((s) => s.slotIndex === slot.slotIndex);
    const userId = record?.userId;
    if (!userId) return slot;

    const identity = input.memberIdentities.get(userId);
    if (!identity) {
      return { ...slot, occupantUserId: userId };
    }

    return {
      ...slot,
      occupantUserId: userId,
      occupantLabel: identity.applicantDisplayName,
      roleLabel: identity.applicantCardTitle,
    };
  });

  return { ...input.puzzle, slots };
}
