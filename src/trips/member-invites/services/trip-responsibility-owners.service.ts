import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ADVISOR_PATCH_ROLES,
  OWNER_KEY_TO_ROLE_SLOT,
  ROLE_SLOT_TO_COLLABORATOR_ROLE,
  type ResponsibilityOwnerKey,
} from '../constants/member-invite.constants';
import type {
  PatchTripResponsibilityOwnersDto,
  TripMemberRefDto,
  TripResponsibilityOwnersDto,
  TripResponsibilityOwnersResponseDto,
} from '../dto/trip-responsibility-owners.dto';

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
export class TripResponsibilityOwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwners(
    tripId: string,
    userId: string,
  ): Promise<TripResponsibilityOwnersResponseDto> {
    const trip = await this.loadTrip(tripId);
    await this.assertTripMember(trip, userId);
    return this.buildResponse(trip);
  }

  /** Internal snapshot — no auth (e.g. advisor-create response). */
  async getOwnersSnapshot(
    tripId: string,
  ): Promise<TripResponsibilityOwnersResponseDto> {
    const trip = await this.loadTrip(tripId);
    return this.buildResponse(trip);
  }

  async patchOwners(
    tripId: string,
    userId: string,
    body: PatchTripResponsibilityOwnersDto,
  ): Promise<TripResponsibilityOwnersResponseDto> {
    const trip = await this.loadTrip(tripId);
    await this.assertAdvisorOrOwner(trip, userId);

    const current = await this.resolveOwners(trip);
    const merged = this.mergeOwners(current, body.owners);
    const now = new Date();

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          responsibilityOwners: merged,
          responsibilityOwnersUpdatedAt: now.toISOString(),
        } as any,
      },
    });

    return {
      tripId,
      owners: merged,
      updatedAt: now.toISOString(),
    };
  }

  buildFromTripMetadata(metadata: unknown): TripResponsibilityOwnersDto | null {
    const stored = (metadata as Record<string, unknown> | null)
      ?.responsibilityOwners;
    if (!stored || typeof stored !== 'object') {
      return null;
    }
    return stored as TripResponsibilityOwnersDto;
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

  private async buildResponse(
    trip: TripContext,
  ): Promise<TripResponsibilityOwnersResponseDto> {
    const owners = await this.resolveOwners(trip);
    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const updatedAt =
      typeof metadata.responsibilityOwnersUpdatedAt === 'string'
        ? metadata.responsibilityOwnersUpdatedAt
        : undefined;

    return { tripId: trip.id, owners, updatedAt };
  }

  private async resolveOwners(trip: TripContext): Promise<TripResponsibilityOwnersDto> {
    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const stored = metadata.responsibilityOwners as
      | TripResponsibilityOwnersDto
      | undefined;
    if (stored?.planningOwner) {
      return this.normalizeOwners(stored);
    }

    return this.buildDefaultOwners(trip);
  }

  private async buildDefaultOwners(
    trip: TripContext,
  ): Promise<TripResponsibilityOwnersDto> {
    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const invites = await this.prisma.tripMemberInvite.findMany({
      where: { tripId: trip.id },
      select: {
        roleSlot: true,
        label: true,
        status: true,
        collaboratorId: true,
        acceptedByUserId: true,
      },
    });

    const collaborators = trip.TripCollaborator;
    const userIds = collaborators.map((c) => c.userId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true },
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const owners = {} as TripResponsibilityOwnersDto;
    const ownerKeys = Object.keys(OWNER_KEY_TO_ROLE_SLOT) as ResponsibilityOwnerKey[];

    for (const ownerKey of ownerKeys) {
      const roleSlot = OWNER_KEY_TO_ROLE_SLOT[ownerKey];
      if (!roleSlot) {
        owners[ownerKey] = {};
        continue;
      }

      const collaboratorRole = ROLE_SLOT_TO_COLLABORATOR_ROLE[roleSlot];
      const altRoles =
        roleSlot === 'advisor' ? ['OWNER', 'ADVISOR'] : [collaboratorRole];

      const collaborator = collaborators.find((c) =>
        altRoles.includes(c.role),
      );
      if (collaborator) {
        const user = userById.get(collaborator.userId);
        owners[ownerKey] = {
          memberId: collaborator.id,
          userId: collaborator.userId,
          name: user?.displayName ?? undefined,
          email: user?.email ?? undefined,
        };
        continue;
      }

      const pendingInvite = invites.find(
        (inv) =>
          inv.roleSlot === roleSlot &&
          inv.status === 'PENDING',
      );
      if (pendingInvite) {
        owners[ownerKey] = { inviteLabel: pendingInvite.label };
        continue;
      }

      const acceptedInvite = invites.find(
        (inv) =>
          inv.roleSlot === roleSlot &&
          inv.status === 'ACCEPTED' &&
          inv.acceptedByUserId,
      );
      if (acceptedInvite?.acceptedByUserId) {
        const user = userById.get(acceptedInvite.acceptedByUserId);
        owners[ownerKey] = {
          memberId: acceptedInvite.collaboratorId ?? undefined,
          userId: acceptedInvite.acceptedByUserId,
          name: user?.displayName ?? undefined,
          email: user?.email ?? undefined,
          inviteLabel: acceptedInvite.label,
        };
        continue;
      }

      const stakeholder = (
        metadata.stakeholders as
          | Record<string, { name?: string; email?: string; phone?: string }>
          | undefined
      )?.[roleSlot];
      if (stakeholder) {
        owners[ownerKey] = {
          name: stakeholder.name,
          email: stakeholder.email,
          phone: stakeholder.phone,
        };
        continue;
      }

      owners[ownerKey] = {};
    }

    // onTripLeader mirrors executionOwner (leader) when unset
    if (!owners.onTripLeader?.memberId && !owners.onTripLeader?.inviteLabel) {
      owners.onTripLeader = { ...owners.executionOwner };
    }

    return owners;
  }

  private mergeOwners(
    current: TripResponsibilityOwnersDto,
    patch: Partial<TripResponsibilityOwnersDto>,
  ): TripResponsibilityOwnersDto {
    const merged = { ...current };
    for (const key of Object.keys(patch) as Array<keyof TripResponsibilityOwnersDto>) {
      const value = patch[key];
      if (value) {
        merged[key] = { ...current[key], ...value };
      }
    }
    return this.normalizeOwners(merged);
  }

  private normalizeOwners(
    owners: TripResponsibilityOwnersDto,
  ): TripResponsibilityOwnersDto {
    const empty: TripMemberRefDto = {};
    return {
      planningOwner: owners.planningOwner ?? empty,
      executionOwner: owners.executionOwner ?? empty,
      paymentApprover: owners.paymentApprover ?? empty,
      finalApprover: owners.finalApprover ?? empty,
      onTripLeader: owners.onTripLeader ?? owners.executionOwner ?? empty,
      emergencyContact: owners.emergencyContact ?? empty,
    };
  }

  private async assertTripMember(trip: TripContext, userId: string): Promise<void> {
    if (userId === 'anonymous-dev-user') {
      return;
    }
    if (trip.TripCollaborator.some((c) => c.userId === userId)) {
      return;
    }
    const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
    if (metadataUserId === userId) {
      return;
    }
    throw new ForbiddenException('无权访问该行程');
  }

  private async assertAdvisorOrOwner(
    trip: TripContext,
    userId: string,
  ): Promise<void> {
    if (userId === 'anonymous-dev-user') {
      return;
    }
    const collaborator = trip.TripCollaborator.find((c) => c.userId === userId);
    if (collaborator && ADVISOR_PATCH_ROLES.has(collaborator.role)) {
      return;
    }
    throw new ForbiddenException('仅顾问或 OWNER 可修改责任分配');
  }
}
