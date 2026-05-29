import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HikingTrailDetailService } from '../hiking-demo/services/hiking-trail-detail.service';
import { RouteDirectionsService } from '../route-directions/route-directions.service';
import {
  CreateRouteDirectionShareDto,
  RouteDirectionSharePermission,
} from './dto/route-direction-share.dto';

@Injectable()
export class HikingRouteShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trailDetail: HikingTrailDetailService,
    private readonly routeDirections: RouteDirectionsService,
  ) {}

  async createShare(
    userId: string,
    routeDirectionId: number,
    dto: CreateRouteDirectionShareDto,
  ) {
    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: routeDirectionId },
    });
    if (!rd) {
      throw new NotFoundException(`Route direction ${routeDirectionId} not found`);
    }
    if (!this.trailDetail.isHikingRoute(rd)) {
      throw new NotFoundException('Route direction is not a hiking trail');
    }

    const shareToken = randomUUID();
    const permission = dto.permission ?? RouteDirectionSharePermission.VIEW;

    const share = await this.prisma.hikeRouteDirectionShare.create({
      data: {
        routeDirectionId,
        createdByUserId: userId,
        shareToken,
        permission,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return {
      id: share.id,
      routeDirectionId: share.routeDirectionId,
      shareToken: share.shareToken,
      permission: share.permission,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      shareUrl: `/trails/shared/${share.shareToken}`,
      createdAt: share.createdAt.toISOString(),
    };
  }

  async getByShareToken(shareToken: string) {
    const share = await this.prisma.hikeRouteDirectionShare.findUnique({
      where: { shareToken },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在或已失效');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new BadRequestException('分享链接已过期');
    }

    const routeDirection = await this.routeDirections.findRouteDirectionById(
      share.routeDirectionId,
      { includeHikingDetail: true },
    );

    return {
      routeDirection,
      permission: share.permission,
      shareToken: share.shareToken,
      expiresAt: share.expiresAt?.toISOString() ?? null,
    };
  }
}
