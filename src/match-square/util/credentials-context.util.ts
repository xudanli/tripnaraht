import type { PrismaService } from '../../prisma/prisma.service';
import type { ReputationOsService } from '../../reputation-os/reputation-os.service';
import type { OdysseyIntakeService } from '../../odyssey-intake/odyssey-intake.service';
import { buildVerifiedCredentialsView } from '../../odyssey-intake/util/verified-credentials.util';
import type { VerifiedCredentialsView } from '../../odyssey-intake/types/verified-credentials.types';
import type { OdysseyTrustVerification } from '../../odyssey-intake/types/odyssey-intake-ext.types';
import type { VerifiedCredentialsBundle } from '../../odyssey-intake/types/verified-credentials.types';
import {
  failsFulfillmentHardGate,
  socialProfileFromCredentials,
  type SocialBackgroundProfile,
} from '../engine/social-background-matching.engine';
import { parseVerifiedCredentialsBundle } from '../../odyssey-intake/util/verified-credentials.util';
import { resolveTeamworkStyleCapsule } from '../config/planning-styles.config';

export interface UserCredentialsContext {
  trust: OdysseyTrustVerification | null;
  credentials: VerifiedCredentialsBundle | null;
  verifiedCredentials: VerifiedCredentialsView;
  socialProfile: SocialBackgroundProfile;
  fulfillmentBlocked: boolean;
  reputationStars: number | null;
  safetyWarning: string | null;
}

export async function loadUserCredentialsContext(
  prisma: PrismaService,
  reputationOs: ReputationOsService,
  userId: string,
  options?: { teamworkStyleCapsule?: string | null },
): Promise<UserCredentialsContext> {
  const row = await prisma.userTravelProfile.findUnique({
    where: { userId },
    select: { extendedProfile: true },
  });
  const ext = (row?.extendedProfile as Record<string, unknown> | null) ?? null;
  const trust = (ext?.odyssey_trust as OdysseyTrustVerification | undefined) ?? null;
  const credentials = parseVerifiedCredentialsBundle(ext?.verified_credentials);

  const [reputationStars, safetyWarning, reputationAssets] = await Promise.all([
    reputationOs.getAverageStars(userId),
    reputationOs.getSafetyWarning(userId),
    reputationOs.getUserReputation(userId),
  ]);

  const fulfillmentBlocked = failsFulfillmentHardGate({
    trust,
    safetyWarning,
    internalRiskHigh: reputationAssets.internalRiskLevel === 'high',
  });

  const verifiedCredentials = buildVerifiedCredentialsView({
    trust,
    credentials,
    reputationStars,
    safetyNote: safetyWarning,
    teamworkStyleCapsule: options?.teamworkStyleCapsule ?? null,
  });

  const socialProfile = socialProfileFromCredentials(trust, credentials, {
    reputationStars,
    fulfillmentBlocked,
  });

  return {
    trust,
    credentials,
    verifiedCredentials,
    socialProfile,
    fulfillmentBlocked,
    reputationStars,
    safetyWarning,
  };
}

export async function loadCredentialsContextBatch(
  prisma: PrismaService,
  reputationOs: ReputationOsService,
  userIds: string[],
  teamworkCapsules?: Map<string, string | null>,
): Promise<Map<string, UserCredentialsContext>> {
  const unique = [...new Set(userIds)];
  const map = new Map<string, UserCredentialsContext>();

  await Promise.all(
    unique.map(async (userId) => {
      const ctx = await loadUserCredentialsContext(prisma, reputationOs, userId, {
        teamworkStyleCapsule: teamworkCapsules?.get(userId) ?? null,
      });
      map.set(userId, ctx);
    }),
  );

  return map;
}

export function buildCaptainCredentialsContext(
  post: { captainUserId: string; planningStyle: string | null },
  batch: Map<string, UserCredentialsContext>,
): UserCredentialsContext | null {
  const capsule = resolveTeamworkStyleCapsule(post.planningStyle);
  const ctx = batch.get(post.captainUserId);
  if (!ctx) return null;

  if (capsule && ctx.verifiedCredentials.headline.trustAssetLine?.includes(capsule)) {
    return ctx;
  }

  if (!capsule) return ctx;

  return {
    ...ctx,
    verifiedCredentials: buildVerifiedCredentialsView({
      trust: ctx.trust,
      credentials: ctx.credentials,
      reputationStars: ctx.reputationStars,
      safetyNote: ctx.safetyWarning,
      teamworkStyleCapsule: capsule,
    }),
  };
}
