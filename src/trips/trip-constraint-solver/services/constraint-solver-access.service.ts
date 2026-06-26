import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

import type { CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';

@Injectable()
export class ConstraintSolverAccessService {
  constructor(private readonly prisma: PrismaService) {}

  resolveUserId(user?: CurrentUserPayload): string {
    const id = user?.userId;
    if (id?.trim()) return id.trim();
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('需要登录');
  }

  async assertTripMember(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: { select: { userId: true, role: true } } },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    const isMember = trip.TripCollaborator.some((c) => c.userId === userId);
    if (!isMember && userId === 'anonymous-dev-user' && process.env.NODE_ENV !== 'production') {
      return trip;
    }
    if (!isMember) {
      throw new ForbiddenException('需要为行程成员');
    }
    return trip;
  }
}
