import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripStatus, normalizeTripStatus } from '../../dto/trip-status.dto';
import { isInTripExecutionEnabled } from '../utils/in-trip-config.util';

const ORGANIZER_ROLES = new Set(['OWNER', 'EDITOR']);

@Injectable()
export class InTripAccessService {
  constructor(private readonly prisma: PrismaService) {}

  assertModuleEnabled(): void {
    if (!isInTripExecutionEnabled()) {
      throw new ServiceUnavailableException(
        '行中执行模块未启用（设置 IN_TRIP_EXECUTION_ENABLED=true）',
      );
    }
  }

  async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }

  async assertInTripPhase(tripId: string) {
    this.assertModuleEnabled();
    const trip = await this.requireTrip(tripId);
    const status = normalizeTripStatus(trip.status);
    if (status !== TripStatus.TRAVELING) {
      throw new BadRequestException(
        `行中接口要求行程处于 TRAVELING 状态，当前为 ${status}`,
      );
    }
    return trip;
  }

  async assertTripMember(tripId: string, userId: string) {
    const trip = await this.requireTrip(tripId);
    if (this.isMember(trip, userId)) return trip;
    throw new ForbiddenException('需要为行程成员');
  }

  async assertOrganizer(tripId: string, userId: string) {
    const trip = await this.assertTripMember(tripId, userId);
    if (this.isOrganizer(trip, userId)) return trip;
    throw new ForbiddenException('需要 OWNER 或 EDITOR 权限');
  }

  isMember(
    trip: { TripCollaborator: Array<{ userId: string }>; metadata: unknown },
    userId: string,
  ): boolean {
    if (trip.TripCollaborator.some((c) => c.userId === userId)) return true;
    const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
    return ownerId === userId;
  }

  isOrganizer(
    trip: { TripCollaborator: Array<{ userId: string; role: string }>; metadata: unknown },
    userId: string,
  ): boolean {
    const collab = trip.TripCollaborator.find((c) => c.userId === userId);
    if (collab && ORGANIZER_ROLES.has(collab.role)) return true;
    const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
    return ownerId === userId;
  }
}
