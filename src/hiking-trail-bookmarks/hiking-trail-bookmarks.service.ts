import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HikingTrailDetailService } from '../hiking-demo/services/hiking-trail-detail.service';

export type TrailBookmarkCard = {
  routeDirectionId: number;
  name: string;
  nameCN?: string | null;
  readinessScore?: number;
  totalDistanceKm?: number;
  totalAscentM?: number;
  estimatedDays?: number;
  startPoint?: { lat: number; lng: number };
  bookmarkedAt: string;
};

@Injectable()
export class HikingTrailBookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.hikeTrailBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { routeDirection: true },
    });

    const items: TrailBookmarkCard[] = rows.map((row) => {
      const rd = row.routeDirection;
      const card = this.trailDetail.buildListCardFields(rd);
      return {
        routeDirectionId: rd.id,
        name: rd.name,
        nameCN: rd.nameCN,
        readinessScore: card.readinessScore,
        totalDistanceKm: card.totalDistanceKm,
        totalAscentM: card.totalAscentM,
        estimatedDays: card.estimatedDays,
        startPoint: card.startPoint,
        bookmarkedAt: row.createdAt.toISOString(),
      };
    });

    return {
      routeDirectionIds: items.map((i) => i.routeDirectionId),
      items,
    };
  }

  async bookmark(userId: string, routeDirectionId: number) {
    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: routeDirectionId },
    });
    if (!rd) {
      throw new NotFoundException(`Route direction ${routeDirectionId} not found`);
    }
    if (!this.trailDetail.isHikingRoute(rd)) {
      throw new NotFoundException('Route direction is not a hiking trail');
    }

    await this.prisma.hikeTrailBookmark.upsert({
      where: {
        userId_routeDirectionId: { userId, routeDirectionId },
      },
      create: { userId, routeDirectionId },
      update: {},
    });

    return this.list(userId);
  }

  async remove(userId: string, routeDirectionId: number) {
    await this.prisma.hikeTrailBookmark.deleteMany({
      where: { userId, routeDirectionId },
    });
    return this.list(userId);
  }
}
