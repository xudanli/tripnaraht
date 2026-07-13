import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProjectMembershipService } from '../../../identity-governance/services/project-membership.service';
import {
  ROLE_SLOT_TO_COLLABORATOR_ROLE,
  ROLE_SLOT_TO_DEFAULT_TRIP_ROLE,
  type RoleSlotKey,
} from '../constants/member-invite.constants';
import type {
  MemberInviteAcceptResponseDto,
  MemberInvitePreviewDto,
  MemberOnboardingDraftDto,
  MemberOnboardingSubmitResponseDto,
  SaveMemberOnboardingDraftDto,
} from '../dto/trip-member-invite.dto';

type InviteRow = {
  id: string;
  tripId: string;
  inviteCode: string;
  roleSlot: string;
  label: string;
  expiresAt: Date | null;
  status: string;
  acceptedByUserId: string | null;
  collaboratorId: string | null;
  Trip: {
    id: string;
    name: string | null;
    destination: string | null;
    metadata: unknown;
  };
  onboardingDraft?: {
    completedAt: Date | null;
    userId: string;
  } | null;
};

const EMPTY_DRAFT_FIELDS = {
  guardianFor: '',
  coreWishes: [] as string[],
  mustExperience: '',
  avoidExperience: '',
  pacePreference: 'moderate' as const,
  earlyRiser: false,
  maxDailyWalkKm: undefined as number | undefined,
  lodgingPreference: '',
  dietRestrictions: '',
  healthNotes: '',
  personalSpendingLevel: 'moderate' as const,
  personalSpendingNotes: '',
  acceptSplitGroup: 'depends' as const,
  splitGroupNotes: '',
  privateNotes: '',
  privateNotesAuth: 'SANITIZED_TO_ADVISOR' as const,
  currentStepId: undefined as string | undefined,
};

@Injectable()
export class TripMemberInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectMembership: ProjectMembershipService,
  ) {}

  async getPreview(code: string): Promise<MemberInvitePreviewDto> {
    const invite = await this.loadInvite(code);
    const expired = this.isExpired(invite);
    const onboardingCompleted = invite.onboardingDraft?.completedAt != null;

    return {
      inviteCode: invite.inviteCode,
      tripId: invite.tripId,
      tripName: invite.Trip.name ?? undefined,
      destination: invite.Trip.destination ?? undefined,
      label: invite.label,
      roleHint: invite.roleSlot,
      expired,
      onboardingRequired: true,
      onboardingCompleted,
    };
  }

  async accept(code: string, userId: string): Promise<MemberInviteAcceptResponseDto> {
    const invite = await this.loadInvite(code);

    if (this.isExpired(invite)) {
      throw new BadRequestException('邀请已过期');
    }

    if (invite.status === 'ACCEPTED') {
      if (invite.acceptedByUserId === userId) {
        return {
          tripId: invite.tripId,
          memberId: invite.collaboratorId ?? undefined,
        };
      }
      throw new ConflictException('邀请已被其他用户接受');
    }

    const roleSlot = invite.roleSlot as RoleSlotKey;
    const collaboratorRole =
      ROLE_SLOT_TO_COLLABORATOR_ROLE[roleSlot] ?? 'MEMBER';
    const now = new Date();
    let memberId = '';

    await this.prisma.$transaction(async (tx) => {
      const collaborator = await tx.tripCollaborator.upsert({
        where: { tripId_userId: { tripId: invite.tripId, userId } },
        create: {
          id: randomUUID(),
          tripId: invite.tripId,
          userId,
          role: collaboratorRole,
          updatedAt: now,
        },
        update: {
          role: collaboratorRole,
          updatedAt: now,
        },
      });
      memberId = collaborator.id;

      await this.projectMembership.syncFromCollaborator(
        invite.tripId,
        userId,
        collaboratorRole,
        tx,
      );

      await tx.tripMemberInvite.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedByUserId: userId,
          acceptedAt: now,
          collaboratorId: collaborator.id,
        },
      });
    });

    return { tripId: invite.tripId, memberId };
  }

  async getOnboarding(
    code: string,
    userId: string,
  ): Promise<MemberOnboardingDraftDto> {
    const invite = await this.requireAcceptedByUser(code, userId);
    const draftRow = await this.ensureDraftRow(invite, userId);
    return this.toDraftDto(invite, draftRow);
  }

  async saveOnboarding(
    code: string,
    userId: string,
    patch: SaveMemberOnboardingDraftDto,
  ): Promise<MemberOnboardingDraftDto> {
    const invite = await this.requireAcceptedByUser(code, userId);
    const draftRow = await this.ensureDraftRow(invite, userId);

    if (draftRow.completedAt) {
      throw new ConflictException('入职问卷已提交，无法修改');
    }

    const existing = (draftRow.draft ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = {
      ...existing,
      ...this.stripUndefined(patch as Record<string, unknown>),
      inviteToken: invite.inviteCode,
      tripId: invite.tripId,
    };

    if (Array.isArray(merged.coreWishes)) {
      merged.coreWishes = merged.coreWishes.slice(0, 3);
    }

    const updated = await this.prisma.tripMemberOnboardingDraft.update({
      where: { id: draftRow.id },
      data: {
        draft: merged as any,
        currentStepId: patch.currentStepId ?? draftRow.currentStepId,
      },
    });

    return this.toDraftDto(invite, updated);
  }

  async submitOnboarding(
    code: string,
    userId: string,
  ): Promise<MemberOnboardingSubmitResponseDto> {
    const invite = await this.requireAcceptedByUser(code, userId);
    const draftRow = await this.ensureDraftRow(invite, userId);

    if (draftRow.completedAt) {
      return {
        tripId: invite.tripId,
        memberId: invite.collaboratorId ?? undefined,
        status: 'SUBMITTED',
        homePath: `/member/${invite.inviteCode}/home`,
      };
    }

    const draft = (draftRow.draft ?? {}) as unknown as MemberOnboardingDraftDto;
    if (!draft.displayName?.trim()) {
      throw new BadRequestException('请先填写 displayName');
    }

    const now = new Date();
    const completedDraft = {
      ...draft,
      inviteToken: invite.inviteCode,
      tripId: invite.tripId,
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.tripMemberOnboardingDraft.update({
        where: { id: draftRow.id },
        data: {
          draft: completedDraft as any,
          completedAt: now,
        },
      });

      const trip = await tx.trip.findUnique({
        where: { id: invite.tripId },
        select: { metadata: true },
      });
      const metadata = (trip?.metadata as Record<string, unknown> | null) ?? {};
      const profiles =
        (metadata.memberOnboardingProfiles as Record<string, unknown> | undefined) ??
        {};
      profiles[userId] = {
        ...completedDraft,
        roleSlot: invite.roleSlot,
        label: invite.label,
        submittedAt: now.toISOString(),
      };

      await tx.trip.update({
        where: { id: invite.tripId },
        data: {
          metadata: {
            ...metadata,
            memberOnboardingProfiles: profiles,
          } as any,
        },
      });
    });

    return {
      tripId: invite.tripId,
      memberId: invite.collaboratorId ?? undefined,
      status: 'SUBMITTED',
      homePath: `/member/${invite.inviteCode}/home`,
    };
  }

  private async loadInvite(code: string): Promise<InviteRow> {
    const invite = await this.prisma.tripMemberInvite.findUnique({
      where: { inviteCode: code },
      include: {
        Trip: {
          select: { id: true, name: true, destination: true, metadata: true },
        },
        onboardingDraft: {
          select: { completedAt: true, userId: true },
        },
      },
    });
    if (!invite) {
      throw new NotFoundException('邀请不存在');
    }
    return invite;
  }

  private async requireAcceptedByUser(
    code: string,
    userId: string,
  ): Promise<InviteRow> {
    const invite = await this.loadInvite(code);

    if (invite.status !== 'ACCEPTED' || invite.acceptedByUserId !== userId) {
      throw new ForbiddenException('请先接受邀请');
    }
    return invite;
  }

  private isExpired(invite: InviteRow): boolean {
    return invite.expiresAt != null && invite.expiresAt.getTime() < Date.now();
  }

  private async ensureDraftRow(invite: InviteRow, userId: string) {
    const existing = await this.prisma.tripMemberOnboardingDraft.findUnique({
      where: { inviteId: invite.id },
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('无权访问该入职问卷');
      }
      return existing;
    }

    const roleSlot = invite.roleSlot as RoleSlotKey;
    const defaultRole =
      ROLE_SLOT_TO_DEFAULT_TRIP_ROLE[roleSlot] ?? 'MEMBER';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });

    const draft = {
      inviteToken: invite.inviteCode,
      tripId: invite.tripId,
      displayName: user?.displayName ?? '',
      tripRole: defaultRole,
      ...EMPTY_DRAFT_FIELDS,
    };

    return this.prisma.tripMemberOnboardingDraft.create({
      data: {
        inviteId: invite.id,
        tripId: invite.tripId,
        userId,
        draft,
      },
    });
  }

  private toDraftDto(
    invite: InviteRow,
    row: { draft: unknown; currentStepId: string | null; completedAt: Date | null; updatedAt: Date },
  ): MemberOnboardingDraftDto {
    const stored = (row.draft ?? {}) as Partial<MemberOnboardingDraftDto>;
    const roleSlot = invite.roleSlot as RoleSlotKey;

    return {
      inviteToken: invite.inviteCode,
      tripId: invite.tripId,
      displayName: stored.displayName ?? '',
      tripRole:
        stored.tripRole ??
        ROLE_SLOT_TO_DEFAULT_TRIP_ROLE[roleSlot] ??
        'MEMBER',
      guardianFor: stored.guardianFor ?? '',
      coreWishes: stored.coreWishes ?? [],
      mustExperience: stored.mustExperience ?? '',
      avoidExperience: stored.avoidExperience ?? '',
      pacePreference: stored.pacePreference ?? 'moderate',
      earlyRiser: stored.earlyRiser ?? false,
      maxDailyWalkKm: stored.maxDailyWalkKm,
      lodgingPreference: stored.lodgingPreference ?? '',
      dietRestrictions: stored.dietRestrictions ?? '',
      healthNotes: stored.healthNotes ?? '',
      personalSpendingLevel: stored.personalSpendingLevel ?? 'moderate',
      personalSpendingNotes: stored.personalSpendingNotes ?? '',
      acceptSplitGroup: stored.acceptSplitGroup ?? 'depends',
      splitGroupNotes: stored.splitGroupNotes ?? '',
      privateNotes: stored.privateNotes ?? '',
      privateNotesAuth: stored.privateNotesAuth ?? 'SANITIZED_TO_ADVISOR',
      currentStepId: row.currentStepId ?? stored.currentStepId,
      completedAt: row.completedAt?.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }
}
