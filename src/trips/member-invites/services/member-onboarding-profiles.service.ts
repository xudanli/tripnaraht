import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ADVISOR_PATCH_ROLES } from '../constants/member-invite.constants';
import type {
  MemberOnboardingPendingMemberDto,
  MemberOnboardingProfileDto,
  MemberOnboardingProfilesResponseDto,
} from '../dto/member-onboarding-profiles.dto';
import {
  hasCompletedProfile,
  projectSubmittedProfile,
  readStoredString,
  resolvePendingReason,
  withSnakeCaseAliases,
} from '../utils/member-onboarding-profile.projection.util';

type TripContext = {
  id: string;
  metadata: unknown;
  TripCollaborator: Array<{
    id: string;
    userId: string;
    role: string;
  }>;
};

@Injectable()
export class MemberOnboardingProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfiles(
    tripId: string,
    userId: string,
  ): Promise<MemberOnboardingProfilesResponseDto> {
    const trip = await this.loadTrip(tripId);
    this.assertAdvisorEditorOrOwner(trip, userId);

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const storedProfiles =
      (metadata.memberOnboardingProfiles as Record<string, unknown> | undefined) ??
      {};

    const collaboratorByUserId = new Map(
      trip.TripCollaborator.map((collaborator) => [
        collaborator.userId,
        collaborator,
      ]),
    );

    const acceptedInvites = await this.prisma.tripMemberInvite.findMany({
      where: {
        tripId,
        status: 'ACCEPTED',
        acceptedByUserId: { not: null },
      },
      select: {
        inviteCode: true,
        label: true,
        roleSlot: true,
        acceptedByUserId: true,
        collaboratorId: true,
        onboardingDraft: {
          select: {
            draft: true,
            currentStepId: true,
          },
        },
      },
    });

    const inviteByUserId = new Map(
      acceptedInvites.map((invite) => [invite.acceptedByUserId!, invite]),
    );

    const profiles = Object.entries(storedProfiles)
      .filter(([, profile]) => hasCompletedProfile(profile))
      .map(([profileUserId, profile]) => {
        const invite = inviteByUserId.get(profileUserId);
        const collaborator = collaboratorByUserId.get(profileUserId);
        return projectSubmittedProfile(
          profileUserId,
          profile as Record<string, unknown>,
          {
            memberId: invite?.collaboratorId ?? collaborator?.id,
            inviteCode: invite?.inviteCode,
          },
        ) as unknown as MemberOnboardingProfileDto;
      });

    const pendingMembers = await this.buildPendingMembers(
      acceptedInvites,
      storedProfiles,
      collaboratorByUserId,
    );

    return withSnakeCaseAliases({
      tripId,
      profiles,
      pendingMembers,
    }) as unknown as MemberOnboardingProfilesResponseDto;
  }

  private async buildPendingMembers(
    acceptedInvites: Array<{
      inviteCode: string;
      label: string;
      roleSlot: string;
      acceptedByUserId: string | null;
      collaboratorId: string | null;
      onboardingDraft: {
        draft: unknown;
        currentStepId: string | null;
      } | null;
    }>,
    storedProfiles: Record<string, unknown>,
    collaboratorByUserId: Map<
      string,
      { id: string; userId: string; role: string }
    >,
  ): Promise<MemberOnboardingPendingMemberDto[]> {
    const pendingUserIds = acceptedInvites
      .map((invite) => invite.acceptedByUserId)
      .filter((uid): uid is string => Boolean(uid))
      .filter((uid) => !hasCompletedProfile(storedProfiles[uid]));

    if (pendingUserIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: pendingUserIds } },
      select: { id: true, displayName: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    return acceptedInvites
      .filter(
        (invite) =>
          invite.acceptedByUserId &&
          !hasCompletedProfile(storedProfiles[invite.acceptedByUserId]),
      )
      .map((invite) => {
        const memberUserId = invite.acceptedByUserId!;
        const draftRecord =
          (invite.onboardingDraft?.draft as Record<string, unknown> | null) ??
          null;
        const user = userById.get(memberUserId);
        const collaborator = collaboratorByUserId.get(memberUserId);

        const pending = {
          userId: memberUserId,
          memberId: invite.collaboratorId ?? collaborator?.id,
          displayName:
            readStoredString(draftRecord ?? {}, 'displayName') ||
            user?.displayName ||
            undefined,
          label: invite.label,
          roleSlot: invite.roleSlot,
          reason: resolvePendingReason({
            draft: draftRecord,
            currentStepId: invite.onboardingDraft?.currentStepId,
          }),
        };

        return withSnakeCaseAliases(pending) as unknown as MemberOnboardingPendingMemberDto;
      });
  }

  private async loadTrip(tripId: string): Promise<TripContext> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        metadata: true,
        TripCollaborator: {
          select: { id: true, userId: true, role: true },
        },
      },
    });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }
    return trip;
  }

  private assertAdvisorEditorOrOwner(trip: TripContext, userId: string): void {
    if (userId === 'anonymous-dev-user') {
      return;
    }

    const collaborator = trip.TripCollaborator.find((c) => c.userId === userId);
    if (collaborator && ADVISOR_PATCH_ROLES.has(collaborator.role)) {
      return;
    }

    throw new ForbiddenException('仅 OWNER / ADVISOR / EDITOR 可查看成员入职画像');
  }
}
