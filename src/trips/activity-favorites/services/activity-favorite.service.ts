import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ActivityFavoritesListResponse,
  SetActivityFavoriteDto,
  SetActivityFavoriteResponse,
} from '../dto/activity-favorite.dto';
import { ActivityFavoriteAccessService } from './activity-favorite-access.service';
import {
  extractFavoriteIdLists,
  mapFavoriteRows,
  resolveFavoriteTarget,
} from '../utils/activity-favorite.util';

@Injectable()
export class ActivityFavoriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ActivityFavoriteAccessService,
  ) {}

  async listFavorites(tripId: string, userId: string): Promise<ActivityFavoritesListResponse> {
    await this.access.assertTripMember(tripId, userId);
    return this.buildListResponse(tripId, userId);
  }

  async setFavorite(
    tripId: string,
    userId: string,
    input: SetActivityFavoriteDto,
  ): Promise<SetActivityFavoriteResponse> {
    await this.access.assertTripMember(tripId, userId);

    let target: ReturnType<typeof resolveFavoriteTarget>;
    try {
      target = resolveFavoriteTarget(input);
    } catch {
      throw new BadRequestException('请提供 itineraryItemId 或 placeId 之一');
    }

    if (target.itineraryItemId && target.placeId) {
      throw new BadRequestException('itineraryItemId 与 placeId 不能同时提供');
    }

    if (target.itineraryItemId) {
      await this.assertActivityItineraryItem(tripId, target.itineraryItemId);
    } else if (target.placeId != null) {
      await this.assertPlaceExists(target.placeId);
    }

    if (input.favorited) {
      await this.prisma.tripActivityFavorite.upsert({
        where: {
          tripId_userId_targetKey: {
            tripId,
            userId,
            targetKey: target.targetKey,
          },
        },
        create: {
          tripId,
          userId,
          targetKey: target.targetKey,
          itineraryItemId: target.itineraryItemId,
          placeId: target.placeId,
        },
        update: {},
      });
    } else {
      await this.prisma.tripActivityFavorite.deleteMany({
        where: {
          tripId,
          userId,
          targetKey: target.targetKey,
        },
      });
    }

    const list = await this.buildListResponse(tripId, userId);
    return {
      tripId,
      userId,
      favorited: input.favorited,
      targetKey: target.targetKey,
      itineraryItemId: target.itineraryItemId,
      placeId: target.placeId,
      favorites: list.favorites,
      itineraryItemIds: list.itineraryItemIds,
      placeIds: list.placeIds,
      total: list.total,
    };
  }

  private async buildListResponse(
    tripId: string,
    userId: string,
  ): Promise<ActivityFavoritesListResponse> {
    const rows = await this.prisma.tripActivityFavorite.findMany({
      where: { tripId, userId },
      orderBy: { createdAt: 'desc' },
    });
    const favorites = mapFavoriteRows(rows);
    const { itineraryItemIds, placeIds } = extractFavoriteIdLists(favorites);
    return {
      tripId,
      userId,
      favorites,
      itineraryItemIds,
      placeIds,
      total: favorites.length,
    };
  }

  private async assertActivityItineraryItem(tripId: string, itemId: string): Promise<void> {
    const item = await this.prisma.itineraryItem.findFirst({
      where: {
        id: itemId,
        TripDay: { tripId },
      },
      select: { id: true, type: true },
    });
    if (!item) {
      throw new NotFoundException(`行程项 ${itemId} 不存在或不属于该行程`);
    }
    if (String(item.type).toUpperCase() !== 'ACTIVITY') {
      throw new BadRequestException('仅支持收藏 ACTIVITY 类型行程项');
    }
  }

  private async assertPlaceExists(placeId: number): Promise<void> {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true },
    });
    if (!place) {
      throw new NotFoundException(`地点 ${placeId} 不存在`);
    }
  }
}
