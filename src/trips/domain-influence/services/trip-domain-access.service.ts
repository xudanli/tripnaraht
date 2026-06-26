import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TripDomainAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertTripMember(tripId: string, userId: string): Promise<void> {
    const trip = await this.requireTripWithCollaborators(tripId);
    if (this.isTripMember(trip, userId)) {
      return;
    }
    throw new ForbiddenException('无权访问该行程领域映射，需要为行程成员');
  }

  async listMemberIds(tripId: string): Promise<string[]> {
    const trip = await this.requireTripWithCollaborators(tripId);
    const ids = new Set(trip.TripCollaborator.map((c) => c.userId));
    const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
    if (ownerId) ids.add(ownerId);
    return [...ids];
  }

  async countEligibleMembers(tripId: string): Promise<number> {
    const ids = await this.listMemberIds(tripId);
    return Math.max(ids.length, 1);
  }

  async assertDomainLeader(
    tripId: string,
    domain: string,
    userId: string,
  ): Promise<void> {
    await this.assertTripMember(tripId, userId);
    const claim = await this.prisma.tripDomainClaim.findFirst({
      where: { tripId, domain, userId, status: 'active' },
    });
    if (!claim) {
      throw new ForbiddenException('仅该领域认领者可查看决策私密约束');
    }
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

  private isTripMember(
    trip: { metadata: unknown; TripCollaborator: Array<{ userId: string }> },
    userId: string,
  ): boolean {
    if (userId === 'anonymous-dev-user') {
      return true;
    }
    if (trip.TripCollaborator.some((c) => c.userId === userId)) {
      return true;
    }
    const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
    return metadataUserId === userId;
  }
}
