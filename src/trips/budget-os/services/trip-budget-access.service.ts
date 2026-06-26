import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const BUDGET_WRITE_ROLES = new Set(['OWNER', 'EDITOR']);

@Injectable()
export class TripBudgetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** OWNER / EDITOR, or trip metadata owner — required for L1/L2/L3 writes */
  async assertCanModifyBudget(tripId: string, userId: string): Promise<void> {
    const trip = await this.requireTripWithCollaborators(tripId);
    if (this.hasBudgetWriteAccess(trip, userId)) {
      return;
    }
    throw new ForbiddenException('无权修改该行程预算，需要 OWNER 或 EDITOR 权限');
  }

  /** Any trip collaborator or metadata owner — e.g. value feedback */
  async assertTripMember(tripId: string, userId: string): Promise<void> {
    const trip = await this.requireTripWithCollaborators(tripId);
    if (this.isTripMember(trip, userId)) {
      return;
    }
    throw new ForbiddenException('无权访问该行程预算，需要为行程成员');
  }

  /** Primary user for Money DNA prefill (OWNER > metadata.userId > first collaborator) */
  async resolvePrimaryUserId(tripId: string): Promise<string | null> {
    const trip = await this.requireTripWithCollaborators(tripId);
    const owner = trip.TripCollaborator.find((c) => c.role === 'OWNER');
    if (owner) return owner.userId;
    const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
    if (metadataUserId) return metadataUserId;
    return trip.TripCollaborator[0]?.userId ?? null;
  }

  private async requireTripWithCollaborators(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }

  private hasBudgetWriteAccess(
    trip: { metadata: unknown; TripCollaborator: Array<{ userId: string; role: string }> },
    userId: string,
  ): boolean {
    const collaborator = trip.TripCollaborator.find(
      (c) => c.userId === userId && BUDGET_WRITE_ROLES.has(c.role),
    );
    if (collaborator) return true;
    const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
    return metadataUserId === userId;
  }

  private isTripMember(
    trip: { metadata: unknown; TripCollaborator: Array<{ userId: string }> },
    userId: string,
  ): boolean {
    if (trip.TripCollaborator.some((c) => c.userId === userId)) {
      return true;
    }
    const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
    return metadataUserId === userId;
  }
}
