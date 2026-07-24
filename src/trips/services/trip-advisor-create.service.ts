import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdvisorCreateTripDto,
  AdvisorCreateTripResponseDto,
  AdvisorMemberInviteCodeDto,
  AdvisorStakeholderDto,
} from '../dto/advisor-create-trip.dto';
import { TripStatus } from '../dto/trip-status.dto';
import { MobilityTag } from '../dto/create-trip.dto';
import { ProjectMembershipService } from '../../identity-governance/services/project-membership.service';
import type { ProjectRole } from '../../identity-governance/constants/identity-governance.constants';
import { TripResponsibilityOwnersService } from '../member-invites/services/trip-responsibility-owners.service';

export const TRIP_COLLABORATION_MODE_ADVISOR_LED = 'advisor_led' as const;

const INVITE_TOKEN_BYTES = 24;
const DEFAULT_INVITE_DAYS = 14;

type RoleSlotKey =
  | 'primaryContact'
  | 'payer'
  | 'finalConfirmer'
  | 'advisor'
  | 'leader';

type RoleSlotConfig = {
  key: RoleSlotKey;
  label: string;
  collaboratorRole: string;
  projectRoles: ProjectRole[];
};

const ROLE_SLOTS: RoleSlotConfig[] = [
  {
    key: 'primaryContact',
    label: '主要联系人',
    collaboratorRole: 'PRIMARY_CONTACT',
    projectRoles: ['participant'],
  },
  {
    key: 'payer',
    label: '付款人',
    collaboratorRole: 'PAYER',
    projectRoles: ['payer'],
  },
  {
    key: 'finalConfirmer',
    label: '最终确认人',
    collaboratorRole: 'FINAL_CONFIRMER',
    projectRoles: ['organizer'],
  },
  {
    key: 'advisor',
    label: '顾问',
    collaboratorRole: 'ADVISOR',
    projectRoles: ['organizer'],
  },
  {
    key: 'leader',
    label: '领队',
    collaboratorRole: 'LEADER',
    projectRoles: ['organizer'],
  },
];

@Injectable()
export class TripAdvisorCreateService {
  private readonly logger = new Logger(TripAdvisorCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly projectMembership?: ProjectMembershipService,
    @Optional()
    private readonly responsibilityOwners?: TripResponsibilityOwnersService,
  ) {}

  async createFromAdvisor(
    dto: AdvisorCreateTripDto,
    creatorUserId: string,
  ): Promise<AdvisorCreateTripResponseDto> {
    const start = DateTime.fromISO(dto.startDate);
    const end = DateTime.fromISO(dto.endDate);
    if (!start.isValid || !end.isValid) {
      throw new BadRequestException('startDate / endDate 格式无效');
    }
    if (end < start) {
      throw new BadRequestException('结束日期不能早于开始日期');
    }

    if (dto.organizationId) {
      await this.assertOrganizationAccess(dto.organizationId, creatorUserId);
    }

    const destination = this.normalizeDestination(dto.destination);
    const tripName =
      dto.name?.trim() ||
      `${destination} ${dto.dayCount}日团 · ${start.toFormat('yyyy-MM-dd')}`;
    const now = new Date();
    const budgetConfig = {
      totalBudget: dto.totalBudget,
      currency: 'CNY',
      estimatedHeadcount: dto.estimatedHeadcount,
    };
    const metadata = {
      source: 'advisor-create',
      tripCollaborationMode: TRIP_COLLABORATION_MODE_ADVISOR_LED,
      organizationId: dto.organizationId ?? null,
      estimatedHeadcount: dto.estimatedHeadcount,
      knownRequirements: dto.knownRequirements?.trim() || null,
      stakeholders: this.buildStakeholderSnapshot(dto, creatorUserId),
      pacingConfig: {
        maxDailyActivities: 5,
        travelers: Array.from({ length: Math.min(dto.estimatedHeadcount, 50) }, () => ({
          type: 'ADULT',
          mobilityTag: MobilityTag.CITY_POTATO,
        })),
      },
    };

    const tripId = randomUUID();
    const memberInviteCodes: AdvisorMemberInviteCodeDto[] = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: tripName,
          destination,
          startDate: start.toJSDate(),
          endDate: end.toJSDate(),
          status: TripStatus.PLANNING,
          budgetConfig,
          pacingConfig: metadata.pacingConfig as any,
          metadata: metadata as any,
          updatedAt: now,
        },
      });

      for (let i = 0; i < dto.dayCount; i++) {
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId,
            date: start.plus({ days: i }).toJSDate(),
          },
        });
      }

      for (const slot of ROLE_SLOTS) {
        const stakeholder = this.resolveStakeholder(slot.key, dto, creatorUserId);
        const boundUserId = stakeholder?.userId;

        if (boundUserId) {
          await this.bindCollaborator(tx, tripId, boundUserId, slot, now);
          continue;
        }

        const invite = await this.createRoleInvite(tx, {
          tripId,
          slot,
          stakeholder,
          invitedByUserId: creatorUserId,
          now,
        });
        memberInviteCodes.push(invite);
      }
    });

    this.logger.log(
      `[AdvisorCreate] trip=${tripId} invites=${memberInviteCodes.length} by=${creatorUserId}`,
    );

    let responsibilityOwners;
    if (this.responsibilityOwners) {
      const snapshot =
        await this.responsibilityOwners.getOwnersSnapshot(tripId);
      responsibilityOwners = snapshot.owners;

      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      const existingMeta = (trip?.metadata as Record<string, unknown> | null) ?? {};
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...existingMeta,
            responsibilityOwners,
            responsibilityOwnersUpdatedAt: new Date().toISOString(),
          } as any,
        },
      });
    }

    return { tripId, memberInviteCodes, responsibilityOwners };
  }

  private resolveStakeholder(
    key: RoleSlotKey,
    dto: AdvisorCreateTripDto,
    creatorUserId: string,
  ): AdvisorStakeholderDto | undefined {
    if (key === 'advisor') {
      const advisor = dto.advisor ?? {};
      return {
        ...advisor,
        userId: advisor.userId ?? creatorUserId,
      };
    }
    return dto[key];
  }

  private buildStakeholderSnapshot(dto: AdvisorCreateTripDto, creatorUserId: string) {
    const snapshot: Record<string, AdvisorStakeholderDto | undefined> = {};
    for (const slot of ROLE_SLOTS) {
      snapshot[slot.key] = this.resolveStakeholder(slot.key, dto, creatorUserId);
    }
    return snapshot;
  }

  private async bindCollaborator(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    tripId: string,
    userId: string,
    slot: RoleSlotConfig,
    now: Date,
  ) {
    const role =
      slot.key === 'advisor' && userId ? 'OWNER' : slot.collaboratorRole;

    await tx.tripCollaborator.upsert({
      where: { tripId_userId: { tripId, userId } },
      create: {
        id: randomUUID(),
        tripId,
        userId,
        role,
        updatedAt: now,
      },
      update: {
        role,
        updatedAt: now,
      },
    });

    if (this.projectMembership) {
      await this.projectMembership.syncFromCollaborator(tripId, userId, role, tx);
    } else {
      await tx.projectMembership.upsert({
        where: { tripId_userId: { tripId, userId } },
        create: {
          tripId,
          userId,
          roles: slot.projectRoles,
          status: 'ACTIVE',
        },
        update: {
          roles: slot.projectRoles,
          status: 'ACTIVE',
        },
      });
    }
  }

  private async createRoleInvite(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    input: {
      tripId: string;
      slot: RoleSlotConfig;
      stakeholder?: AdvisorStakeholderDto;
      invitedByUserId: string;
      now: Date;
    },
  ): Promise<AdvisorMemberInviteCodeDto> {
    const inviteCode = await this.generateUniqueInviteCode(tx);
    const expiresAt = new Date(input.now.getTime() + DEFAULT_INVITE_DAYS * 86400000);
    const contactHint = this.formatContactHint(input.stakeholder);

    await tx.tripMemberInvite.create({
      data: {
        tripId: input.tripId,
        inviteCode,
        roleSlot: input.slot.key,
        label: input.slot.label,
        contactHint,
        invitedByUserId: input.invitedByUserId,
        expiresAt,
        status: 'PENDING',
      },
    });

    return {
      inviteCode,
      inviteUrl: `${this.getInviteBaseUrl()}/invite/${inviteCode}`,
      label: input.slot.label,
    };
  }

  private formatContactHint(stakeholder?: AdvisorStakeholderDto): string | null {
    if (!stakeholder) return null;
    const parts = [stakeholder.name, stakeholder.email, stakeholder.phone]
      .map((v) => v?.trim())
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }

  private async generateUniqueInviteCode(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateToken();
      const existing = await tx.tripMemberInvite.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('邀请码生成失败，请重试');
  }

  private generateToken(): string {
    return randomBytes(INVITE_TOKEN_BYTES)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private getInviteBaseUrl(): string {
    const url =
      this.configService?.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'https://example.com';
    return String(url).replace(/\/$/, '');
  }

  private normalizeDestination(destination: string): string {
    const trimmed = destination.trim();
    if (/^[A-Za-z]{2}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    return trimmed.slice(0, 128);
  }

  private async assertOrganizationAccess(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      select: { status: true },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('无权在该机构下创建行程');
    }
  }
}
