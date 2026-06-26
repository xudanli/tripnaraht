import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TripPreferenceRoundAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertTripMember(tripId: string, userId: string): Promise<void> {
    const trip = await this.requireTripWithCollaborators(tripId);
    if (this.isTripMember(trip, userId)) {
      return;
    }
    throw new ForbiddenException('无权访问该行程偏好轮次，需要为行程成员');
  }

  async listMemberIds(tripId: string): Promise<string[]> {
    const trip = await this.requireTripWithCollaborators(tripId);
    const ids = new Set(trip.TripCollaborator.map((c) => c.userId));
    const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
    if (ownerId) ids.add(ownerId);
    return [...ids];
  }

  async resolveDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const unique = [...new Set(userIds.filter((id) => uuidPattern.test(id)))];
    const map = new Map<string, string>();
    for (const id of userIds) {
      if (!uuidPattern.test(id)) {
        map.set(id, id === 'anonymous-dev-user' ? '开发者' : '同行者');
      }
    }
    if (unique.length === 0) return map;

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true, email: true },
    });
    for (const u of users) {
      map.set(u.id, u.displayName ?? u.email ?? '同行者');
    }
    for (const id of userIds) {
      if (!map.has(id)) {
        map.set(id, '同行者');
      }
    }
    return map;
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
