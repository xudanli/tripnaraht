import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/dto/standard-response.dto';

@Injectable()
export class TeamTasksAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertTripMember(tripId: string, userId: string): Promise<void> {
    const trip = await this.requireTripWithCollaborators(tripId);
    if (this.isTripMember(trip, userId)) return;
    throw new ForbiddenException({
      code: ErrorCode.NOT_TRIP_MEMBER,
      message: '无权访问该行程任务，需要为行程成员',
    });
  }

  async requireTripWithCollaborators(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }

  isTripMember(
    trip: { metadata: unknown; TripCollaborator: Array<{ userId: string }> },
    userId: string,
  ): boolean {
    if (userId === 'anonymous-dev-user') return true;
    if (trip.TripCollaborator.some((c) => c.userId === userId)) return true;
    const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
    return metadataUserId === userId;
  }

  getOwnerId(metadata: unknown): string | null {
    const m = metadata as {
      ownerUserId?: string;
      userId?: string;
    } | null;
    if (typeof m?.ownerUserId === 'string') return m.ownerUserId;
    if (typeof m?.userId === 'string') return m.userId;
    return null;
  }

  async isOwner(tripId: string, userId: string): Promise<boolean> {
    if (userId === 'anonymous-dev-user') return true;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const ownerId = this.getOwnerId(trip?.metadata);
    return ownerId === userId;
  }
}
