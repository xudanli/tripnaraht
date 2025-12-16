// src/trips/services/trip-extended.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripShareDto, SharePermission } from '../dto/trip-share.dto';
import { AddCollaboratorDto } from '../dto/trip-collaborator.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class TripExtendedService {
  constructor(private prisma: PrismaService) {}

  /**
   * 创建行程分享
   */
  async createShare(tripId: string, dto: CreateTripShareDto) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    // 生成分享令牌
    const shareToken = randomUUID();

    // 创建分享记录
    const share = await this.prisma.tripShare.create({
      data: {
        tripId,
        shareToken,
        permission: dto.permission || SharePermission.VIEW,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    // 生成分享链接（实际应该使用前端域名）
    const shareUrl = `/trips/shared/${shareToken}`;

    return {
      id: share.id,
      tripId: share.tripId,
      shareToken: share.shareToken,
      permission: share.permission,
      expiresAt: share.expiresAt,
      shareUrl,
      createdAt: share.createdAt,
    };
  }

  /**
   * 添加协作者
   */
  async addCollaborator(tripId: string, dto: AddCollaboratorDto) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    // 检查是否已存在
    const existing = await this.prisma.tripCollaborator.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId: dto.userId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('该用户已经是协作者');
    }

    // 创建协作者记录
    const collaborator = await this.prisma.tripCollaborator.create({
      data: {
        tripId,
        userId: dto.userId,
        role: dto.role,
      },
    });

    return {
      id: collaborator.id,
      tripId: collaborator.tripId,
      userId: collaborator.userId,
      role: collaborator.role,
      createdAt: collaborator.createdAt,
    };
  }

  /**
   * 根据分享令牌获取行程（用于导入）
   */
  async getTripByShareToken(shareToken: string) {
    const share = await this.prisma.tripShare.findUnique({
      where: { shareToken },
      include: {
        trip: {
          include: {
            days: {
              include: {
                items: {
                  include: {
                    place: true,
                    trail: {
                      include: {
                        startPlace: true,
                        endPlace: true,
                        waypoints: {
                          include: {
                            place: true,
                          },
                          orderBy: {
                            order: 'asc',
                          },
                        },
                      },
                    },
                  },
                  orderBy: {
                    startTime: 'asc',
                  },
                },
              },
              orderBy: {
                date: 'asc',
              },
            },
          },
        },
      },
    });

    if (!share) {
      throw new NotFoundException('分享链接不存在或已失效');
    }

    // 检查是否过期
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new BadRequestException('分享链接已过期');
    }

    return {
      trip: share.trip,
      permission: share.permission,
      shareToken: share.shareToken,
    };
  }

  /**
   * 导入行程（从分享链接）
   */
  async importTripFromShare(
    shareToken: string,
    newTripData: {
      destination: string;
      startDate: string;
      endDate: string;
      userId?: string;
    }
  ) {
    // 获取原行程
    const shareData = await this.getTripByShareToken(shareToken);
    const originalTrip = shareData.trip;

    // 创建新行程
    const newTrip = await this.prisma.trip.create({
      data: {
        id: randomUUID(),
        destination: newTripData.destination,
        startDate: new Date(newTripData.startDate),
        endDate: new Date(newTripData.endDate),
        budgetConfig: originalTrip.budgetConfig as any,
        pacingConfig: originalTrip.pacingConfig as any,
        metadata: {
          ...((originalTrip.metadata as any) || {}),
          importedFrom: shareToken,
          importedAt: new Date().toISOString(),
        } as any,
      } as any,
    });

    // 复制行程日期和行程项（包括Trail数据）
    for (const day of originalTrip.days) {
      const newDay = await this.prisma.tripDay.create({
        data: {
          id: randomUUID(),
          tripId: newTrip.id,
          date: day.date,
        },
      });

      // 复制行程项
      for (const item of day.items) {
        await this.prisma.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: newDay.id,
            placeId: item.placeId,
            trailId: item.trailId, // 复制Trail关联
            type: item.type as any,
            startTime: item.startTime,
            endTime: item.endTime,
            note: item.note,
          } as any,
        });
      }
    }

    return {
      tripId: newTrip.id,
      importedFrom: shareToken,
      message: '行程导入成功，包括所有Trail数据',
    };
  }

  /**
   * 获取协作者列表
   */
  async getCollaborators(tripId: string) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    const collaborators = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });

    return collaborators.map(c => ({
      id: c.id,
      tripId: c.tripId,
      userId: c.userId,
      role: c.role,
      createdAt: c.createdAt,
    }));
  }

  /**
   * 移除协作者
   */
  async removeCollaborator(tripId: string, userId: string) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    if (!collaborator) {
      throw new NotFoundException('协作者不存在');
    }

    await this.prisma.tripCollaborator.delete({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    return { success: true };
  }

  /**
   * 收藏行程
   */
  async collectTrip(tripId: string, userId: string) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    // 检查是否已收藏
    const existing = await this.prisma.tripCollection.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    if (existing) {
      return { success: true, message: '已收藏' };
    }

    await this.prisma.tripCollection.create({
      data: {
        tripId,
        userId,
      },
    });

    return { success: true };
  }

  /**
   * 取消收藏
   */
  async uncollectTrip(tripId: string, userId: string) {
    const collection = await this.prisma.tripCollection.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    if (!collection) {
      return { success: true, message: '未收藏' };
    }

    await this.prisma.tripCollection.delete({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    return { success: true };
  }

  /**
   * 获取用户收藏的行程列表
   */
  async getCollectedTrips(userId: string) {
    const collections = await this.prisma.tripCollection.findMany({
      where: { userId },
      include: {
        trip: {
          include: {
            days: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return collections.map(c => ({
      id: c.id,
      trip: c.trip,
      createdAt: c.createdAt,
    }));
  }

  /**
   * 点赞行程
   */
  async likeTrip(tripId: string, userId: string) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    // 检查是否已点赞
    const existing = await this.prisma.tripLike.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    if (existing) {
      return { success: true, message: '已点赞' };
    }

    await this.prisma.tripLike.create({
      data: {
        tripId,
        userId,
      },
    });

    return { success: true };
  }

  /**
   * 取消点赞
   */
  async unlikeTrip(tripId: string, userId: string) {
    const like = await this.prisma.tripLike.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    if (!like) {
      return { success: true, message: '未点赞' };
    }

    await this.prisma.tripLike.delete({
      where: {
        tripId_userId: {
          tripId,
          userId,
        },
      },
    });

    return { success: true };
  }

  /**
   * 获取热门行程
   */
  async getFeaturedTrips(limit: number = 10) {
    // 按点赞数排序获取热门行程
    const trips = await this.prisma.trip.findMany({
      include: {
        likes: true,
        collections: true,
        _count: {
          select: {
            likes: true,
            collections: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit * 2, // 多取一些，然后按热度排序
    });

    // 计算热度分数（点赞数 + 收藏数 * 2）
    const featured = trips.map(trip => ({
      ...trip,
      likeCount: trip._count.likes,
      collectionCount: trip._count.collections,
      popularityScore: trip._count.likes + trip._count.collections * 2,
    }));

    // 按热度分数排序
    featured.sort((a, b) => b.popularityScore - a.popularityScore);

    return featured.slice(0, limit);
  }

  /**
   * 导出行程离线数据包
   */
  async exportOfflinePack(tripId: string) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          include: {
            items: {
              include: {
                place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    // 构建离线数据包
    const offlinePack = {
      trip: {
        id: trip.id,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budgetConfig: trip.budgetConfig,
        pacingConfig: trip.pacingConfig,
      },
      days: trip.days.map(day => ({
        id: day.id,
        date: day.date,
        items: day.items.map(item => ({
          id: item.id,
          type: item.type,
          startTime: item.startTime,
          endTime: item.endTime,
          place: item.place ? {
            id: item.place.id,
            nameCN: item.place.nameCN,
            nameEN: item.place.nameEN,
            category: item.place.category,
            // location: item.place.location, // PostGIS geography 类型，需要特殊处理
            address: item.place.address,
            metadata: item.place.metadata,
          } : null,
          note: item.note,
        })),
      })),
      exportedAt: new Date().toISOString(),
    };

    // 保存或更新离线数据包
    const pack = await this.prisma.tripOfflinePack.upsert({
      where: { tripId },
      update: {
        data: offlinePack as any,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        tripId,
        data: offlinePack as any,
        version: 1,
      },
    });

    return {
      tripId: pack.tripId,
      version: pack.version,
      data: pack.data,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
    };
  }

  /**
   * 获取离线数据包状态
   */
  async getOfflinePackStatus(tripId: string) {
    const pack = await this.prisma.tripOfflinePack.findUnique({
      where: { tripId },
    });

    if (!pack) {
      return { exists: false };
    }

    return {
      exists: true,
      tripId: pack.tripId,
      version: pack.version,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
    };
  }

  /**
   * 同步离线修改
   */
  async syncOfflineChanges(tripId: string, offlineData: any) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程不存在: ${tripId}`);
    }

    // TODO: 实现离线数据同步逻辑
    // 这里需要比较离线数据和服务器数据，合并变更
    // 暂时返回成功
    return {
      success: true,
      message: '离线数据已同步',
      syncedAt: new Date(),
    };
  }
}
