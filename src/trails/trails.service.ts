// src/trails/trails.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrailDto } from './dto/create-trail.dto';
import { UpdateTrailDto } from './dto/update-trail.dto';
import { TrailCacheService } from './services/trail-cache.service';
import { randomUUID } from 'crypto';

@Injectable()
export class TrailsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: TrailCacheService
  ) {}

  /**
   * 创建徒步路线
   */
  async create(dto: CreateTrailDto) {
    // 验证起点和终点Place是否存在
    if (dto.startPlaceId) {
      const startPlace = await this.prisma.place.findUnique({
        where: { id: dto.startPlaceId },
      });
      if (!startPlace) {
        throw new NotFoundException(`起点Place ID ${dto.startPlaceId} 不存在`);
      }
    }

    if (dto.endPlaceId) {
      const endPlace = await this.prisma.place.findUnique({
        where: { id: dto.endPlaceId },
      });
      if (!endPlace) {
        throw new NotFoundException(`终点Place ID ${dto.endPlaceId} 不存在`);
      }
    }

    // 验证途经点
    if (dto.waypointPlaceIds && dto.waypointPlaceIds.length > 0) {
      const waypointPlaces = await this.prisma.place.findMany({
        where: { id: { in: dto.waypointPlaceIds } },
      });
      if (waypointPlaces.length !== dto.waypointPlaceIds.length) {
        throw new NotFoundException('部分途经点Place ID不存在');
      }
    }

    // 创建Trail记录
    const trail = await this.prisma.trail.create({
      data: {
        uuid: randomUUID(),
        nameCN: dto.nameCN,
        nameEN: dto.nameEN,
        description: dto.description,
        distanceKm: dto.distanceKm,
        elevationGainM: dto.elevationGainM,
        elevationLossM: dto.elevationLossM,
        maxElevationM: dto.maxElevationM,
        minElevationM: dto.minElevationM,
        averageSlope: dto.averageSlope,
        difficultyLevel: dto.difficultyLevel,
        equivalentDistanceKm: dto.equivalentDistanceKm,
        fatigueScore: dto.fatigueScore,
        gpxData: dto.gpxData as any,
        gpxFileUrl: dto.gpxFileUrl,
        bounds: dto.bounds as any,
        startPlaceId: dto.startPlaceId,
        endPlaceId: dto.endPlaceId,
        metadata: dto.metadata as any,
        source: dto.source,
        sourceUrl: dto.sourceUrl,
        rating: dto.rating,
        estimatedDurationHours: dto.estimatedDurationHours,
      } as any,
    });

    // 创建途经点
    if (dto.waypointPlaceIds && dto.waypointPlaceIds.length > 0) {
      await this.prisma.trailWaypoint.createMany({
        data: dto.waypointPlaceIds.map((placeId, index) => ({
          trailId: trail.id,
          placeId,
          order: index,
        })),
      });
    }

    // 返回完整的Trail记录（包含关联）
    return this.findOne(trail.id);
  }

  /**
   * 查找所有徒步路线
   */
  async findAll(filters?: {
    placeId?: number;
    difficulty?: string;
    minDistance?: number;
    maxDistance?: number;
    source?: string;
  }) {
    const where: any = {};

    if (filters?.placeId) {
      where.OR = [
        { startPlaceId: filters.placeId },
        { endPlaceId: filters.placeId },
        { waypoints: { some: { placeId: filters.placeId } } },
      ];
    }

    if (filters?.difficulty) {
      where.difficultyLevel = filters.difficulty;
    }

    if (filters?.minDistance !== undefined || filters?.maxDistance !== undefined) {
      where.distanceKm = {};
      if (filters?.minDistance !== undefined) {
        where.distanceKm.gte = filters.minDistance;
      }
      if (filters?.maxDistance !== undefined) {
        where.distanceKm.lte = filters.maxDistance;
      }
    }

    if (filters?.source) {
      where.source = filters.source;
    }

    return this.prisma.trail.findMany({
      where,
      include: {
        startPlace: {
          select: {
            id: true,
            nameCN: true,
            nameEN: true,
          },
        },
        endPlace: {
          select: {
            id: true,
            nameCN: true,
            nameEN: true,
          },
        },
        waypoints: {
          include: {
            place: {
              select: {
                id: true,
                nameCN: true,
                nameEN: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * 根据ID查找徒步路线（带缓存）
   */
  async findOne(id: number) {
    // 检查缓存
    const cached = this.cacheService.getTrail(id);
    if (cached) {
      return cached;
    }

    const trail = await this.prisma.trail.findUnique({
      where: { id },
      include: {
        startPlace: {
          select: {
            id: true,
            nameCN: true,
            nameEN: true,
            address: true,
          },
        },
        endPlace: {
          select: {
            id: true,
            nameCN: true,
            nameEN: true,
            address: true,
          },
        },
        waypoints: {
          include: {
            place: {
              select: {
                id: true,
                nameCN: true,
                nameEN: true,
                address: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!trail) {
      throw new NotFoundException(`徒步路线 ID ${id} 不存在`);
    }

    // 缓存结果
    this.cacheService.setTrail(id, trail);

    return trail;
  }

  /**
   * 更新徒步路线
   */
  async update(id: number, dto: UpdateTrailDto) {
    // 检查Trail是否存在
    const existing = await this.prisma.trail.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`徒步路线 ID ${id} 不存在`);
    }

    // 验证起点和终点Place
    if (dto.startPlaceId) {
      const startPlace = await this.prisma.place.findUnique({
        where: { id: dto.startPlaceId },
      });
      if (!startPlace) {
        throw new NotFoundException(`起点Place ID ${dto.startPlaceId} 不存在`);
      }
    }

    if (dto.endPlaceId) {
      const endPlace = await this.prisma.place.findUnique({
        where: { id: dto.endPlaceId },
      });
      if (!endPlace) {
        throw new NotFoundException(`终点Place ID ${dto.endPlaceId} 不存在`);
      }
    }

    // 更新途经点（如果提供了waypointPlaceIds）
    if (dto.waypointPlaceIds !== undefined) {
      // 删除现有途经点
      await this.prisma.trailWaypoint.deleteMany({
        where: { trailId: id },
      });

      // 创建新途经点
      if (dto.waypointPlaceIds.length > 0) {
        const waypointPlaces = await this.prisma.place.findMany({
          where: { id: { in: dto.waypointPlaceIds } },
        });
        if (waypointPlaces.length !== dto.waypointPlaceIds.length) {
          throw new NotFoundException('部分途经点Place ID不存在');
        }

        await this.prisma.trailWaypoint.createMany({
          data: dto.waypointPlaceIds.map((placeId, index) => ({
            trailId: id,
            placeId,
            order: index,
          })),
        });
      }
    }

    // 更新Trail记录
    const updateData: any = {};

    if (dto.nameCN !== undefined) updateData.nameCN = dto.nameCN;
    if (dto.nameEN !== undefined) updateData.nameEN = dto.nameEN;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.distanceKm !== undefined) updateData.distanceKm = dto.distanceKm;
    if (dto.elevationGainM !== undefined) updateData.elevationGainM = dto.elevationGainM;
    if (dto.elevationLossM !== undefined) updateData.elevationLossM = dto.elevationLossM;
    if (dto.maxElevationM !== undefined) updateData.maxElevationM = dto.maxElevationM;
    if (dto.minElevationM !== undefined) updateData.minElevationM = dto.minElevationM;
    if (dto.averageSlope !== undefined) updateData.averageSlope = dto.averageSlope;
    if (dto.difficultyLevel !== undefined) updateData.difficultyLevel = dto.difficultyLevel;
    if (dto.equivalentDistanceKm !== undefined) updateData.equivalentDistanceKm = dto.equivalentDistanceKm;
    if (dto.fatigueScore !== undefined) updateData.fatigueScore = dto.fatigueScore;
    if (dto.gpxData !== undefined) updateData.gpxData = dto.gpxData as any;
    if (dto.gpxFileUrl !== undefined) updateData.gpxFileUrl = dto.gpxFileUrl;
    if (dto.bounds !== undefined) updateData.bounds = dto.bounds as any;
    if (dto.startPlaceId !== undefined) updateData.startPlaceId = dto.startPlaceId;
    if (dto.endPlaceId !== undefined) updateData.endPlaceId = dto.endPlaceId;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata as any;
    if (dto.source !== undefined) updateData.source = dto.source;
    if (dto.sourceUrl !== undefined) updateData.sourceUrl = dto.sourceUrl;
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.estimatedDurationHours !== undefined) updateData.estimatedDurationHours = dto.estimatedDurationHours;

    await this.prisma.trail.update({
      where: { id },
      data: updateData,
    });

    return this.findOne(id);
  }

  /**
   * 删除徒步路线
   */
  async remove(id: number) {
    const trail = await this.prisma.trail.findUnique({
      where: { id },
    });

    if (!trail) {
      throw new NotFoundException(`徒步路线 ID ${id} 不存在`);
    }

    // 检查是否有ItineraryItem关联
    const items = await this.prisma.itineraryItem.findMany({
      where: { trailId: id },
    });

    if (items.length > 0) {
      throw new BadRequestException(
        `无法删除：该路线已被 ${items.length} 个行程项使用。请先删除相关行程项。`
      );
    }

    // 删除途经点（级联删除）
    await this.prisma.trailWaypoint.deleteMany({
      where: { trailId: id },
    });

    // 删除Trail
    await this.prisma.trail.delete({
      where: { id },
    });

    return { message: `徒步路线 ID ${id} 已删除` };
  }

  /**
   * 根据多个景点推荐徒步路线（带缓存）
   * 核心思路：找到能够串联这些景点的Trail，优先推荐小众步道
   */
  async recommendTrailsForPlaces(placeIds: number[], options?: {
    maxDistance?: number; // 最大距离（公里）
    preferOffRoad?: boolean; // 优先推荐非公路步道
    maxDifficulty?: string; // 最大难度等级
  }) {
    if (placeIds.length < 2) {
      throw new BadRequestException('至少需要2个景点才能推荐徒步路线');
    }

    // 检查缓存
    const cached = this.cacheService.getRecommendation(placeIds, options);
    if (cached) {
      return cached;
    }

    // 获取所有景点的位置信息
    const places = await this.prisma.place.findMany({
      where: { id: { in: placeIds } },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
      },
    });

    if (places.length !== placeIds.length) {
      throw new NotFoundException('部分景点ID不存在');
    }

    // 提取坐标（使用raw query获取location）
    const placeCoords = await Promise.all(
      places.map(async (p) => {
        const locationResult = await this.prisma.$queryRaw<Array<{
          lat: number;
          lng: number;
        }>>`
          SELECT 
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ${p.id}
        `;
        
        const coords = locationResult[0] ? {
          lat: locationResult[0].lat,
          lng: locationResult[0].lng,
        } : {};
        
        return { placeId: p.id, place: p, ...coords };
      })
    );
    
    const validPlaceCoords = placeCoords.filter(p => p.lat && p.lng);

    if (validPlaceCoords.length < 2) {
      throw new BadRequestException('部分景点缺少位置信息');
    }

    // 查找所有可能的Trail（起点、终点或途经点匹配这些景点）
    const allTrails = await this.prisma.trail.findMany({
      where: {
        OR: [
          { startPlaceId: { in: placeIds } },
          { endPlaceId: { in: placeIds } },
          { waypoints: { some: { placeId: { in: placeIds } } } },
        ],
        ...(options?.maxDistance && { distanceKm: { lte: options.maxDistance } }),
        ...(options?.maxDifficulty && { difficultyLevel: { lte: options.maxDifficulty } }),
      },
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
    });

    // 计算每个Trail与景点的匹配度
    const scoredTrails = await Promise.all(
      allTrails.map(async (trail) => {
        const matchedPlaces = new Set<number>();
        
        // 检查起点
        if (trail.startPlaceId && placeIds.includes(trail.startPlaceId)) {
          matchedPlaces.add(trail.startPlaceId);
        }

        // 检查终点
        if (trail.endPlaceId && placeIds.includes(trail.endPlaceId)) {
          matchedPlaces.add(trail.endPlaceId);
        }

        // 检查途经点
        trail.waypoints.forEach(wp => {
          if (wp.placeId && placeIds.includes(wp.placeId)) {
            matchedPlaces.add(wp.placeId);
          }
        });

        // 计算匹配度：匹配的景点数量 / 总景点数量
        const matchScore = matchedPlaces.size / placeIds.length;

        // 计算平均距离（Trail到未匹配景点的距离）
        let avgDistance = 0;
        const unmatchedPlaceIds = placeIds.filter(id => !matchedPlaces.has(id));
        if (unmatchedPlaceIds.length > 0) {
          const unmatchedPlaces = validPlaceCoords.filter(p => unmatchedPlaceIds.includes(p.placeId));
          const trailCoords = await this.getTrailCenter(trail);
          if (trailCoords && unmatchedPlaces.length > 0) {
            const distances = unmatchedPlaces
              .filter(p => p.lat && p.lng)
              .map(p => 
                this.haversineDistance(trailCoords.lat, trailCoords.lng, p.lat!, p.lng!)
              );
            if (distances.length > 0) {
              avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
            }
          }
        }

        // 计算总分数（匹配度越高、距离越近越好）
        const distanceScore = avgDistance > 0 ? Math.max(0, 1 - avgDistance / 10) : 1; // 10km内满分
        const totalScore = matchScore * 0.7 + distanceScore * 0.3;

        // 优先非公路步道（如果metadata中有roadType字段）
        const isOffRoad = (trail.metadata as any)?.roadType !== 'road';
        const offRoadBonus = options?.preferOffRoad && isOffRoad ? 0.1 : 0;

        return {
          trail,
          matchScore,
          avgDistance,
          totalScore: totalScore + offRoadBonus,
          matchedPlaceIds: Array.from(matchedPlaces),
        };
      })
    );

    // 按分数排序
    scoredTrails.sort((a, b) => b.totalScore - a.totalScore);

    const result = scoredTrails.map(st => ({
      trail: st.trail,
      matchScore: st.matchScore,
      avgDistance: st.avgDistance,
      matchedPlaceIds: st.matchedPlaceIds,
      recommendation: st.matchScore >= 0.5 
        ? '高度匹配：该路线串联了多个目标景点'
        : st.avgDistance < 3
        ? '距离较近：该路线距离未匹配景点较近，可考虑作为补充'
        : '部分匹配：该路线仅部分匹配目标景点',
    }));

    // 缓存结果
    this.cacheService.setRecommendation(placeIds, options, result);

    return result;
  }

  /**
   * 识别Trail沿途3km内的景点（使用PostGIS优化，带缓存）
   */
  async findPlacesAlongTrail(trailId: number, radiusKm: number = 3) {
    // 检查缓存
    const cached = this.cacheService.getPlacesAlong(trailId, radiusKm);
    if (cached) {
      return cached;
    }

    const trail = await this.findOne(trailId);

    // 从GPX数据或waypoints提取轨迹点
    const trailPoints = await this.extractTrailPoints(trail);
    
    if (trailPoints.length === 0) {
      return [];
    }

    // 使用PostGIS空间查询：查找轨迹点周围radiusKm内的景点
    // 策略：对每个轨迹点周围查询，然后去重并计算最短距离
    const radiusMeters = radiusKm * 1000;
    const placeIds = new Set<number>();
    const placeDistanceMap = new Map<number, number>();

    // 采样轨迹点（每100米一个点，避免查询过多）
    const sampledPoints = this.sampleTrailPoints(trailPoints, 100);

    for (const point of sampledPoints) {
      // 使用PostGIS ST_DWithin查询
      const nearbyPlaces = await this.prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        nameEN: string | null;
        category: string;
        rating: number | null;
        distance_meters: number;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category,
          p.rating,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
          ) as distance_meters
        FROM "Place" p
        WHERE 
          p.location IS NOT NULL
          AND p.category IN ('ATTRACTION', 'VIEWPOINT', 'NATURE', 'HISTORIC_SITE')
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY distance_meters ASC
        LIMIT 20
      `;

      // 合并结果，保留最短距离
      for (const place of nearbyPlaces) {
        const distanceKm = place.distance_meters / 1000;
        if (!placeDistanceMap.has(place.id) || placeDistanceMap.get(place.id)! > distanceKm) {
          placeDistanceMap.set(place.id, distanceKm);
          placeIds.add(place.id);
        }
      }
    }

    // 获取完整的Place信息
    if (placeIds.size === 0) {
      return [];
    }

    const places = await this.prisma.place.findMany({
      where: {
        id: { in: Array.from(placeIds) },
      },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        rating: true,
      },
    });

    // 使用raw query获取location
    const placesWithLocation = await Promise.all(
      places.map(async (place) => {
        const locationResult = await this.prisma.$queryRaw<Array<{
          lat: number;
          lng: number;
        }>>`
          SELECT 
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ${place.id}
        `;
        
        return {
          ...place,
          location: locationResult[0] ? {
            lat: locationResult[0].lat,
            lng: locationResult[0].lng,
          } : null,
        };
      })
    );

    // 转换为结果格式
    const result = placesWithLocation
      .filter(p => p.location !== null)
      .map(place => {
        const distanceKm = placeDistanceMap.get(place.id)!;
        return {
          place: {
            id: place.id,
            nameCN: place.nameCN,
            nameEN: place.nameEN,
            category: place.category,
            rating: place.rating,
          },
          distanceKm,
          recommendation: distanceKm < 1 
            ? '强烈推荐：距离路线很近，可作为打卡点'
            : distanceKm < 2
            ? '推荐：距离适中，可考虑加入行程'
            : '可选：距离较远，需要绕行',
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // 缓存结果
    this.cacheService.setPlacesAlong(trailId, radiusKm, result);

    return result;
  }

  /**
   * 拆分长徒步路线为多个分段
   */
  async splitTrailIntoSegments(trailId: number, maxSegmentLengthKm?: number) {
    const trail = await this.findOne(trailId);
    const trailPoints = await this.extractTrailPoints(trail);

    if (trailPoints.length < 2) {
      throw new BadRequestException('轨迹点不足，无法拆分');
    }

    const maxLength = maxSegmentLengthKm || trail.distanceKm / 2; // 默认拆分为2段
    const segments: Array<{
      startIndex: number;
      endIndex: number;
      distanceKm: number;
      elevationGainM: number;
      waypoints: typeof trailPoints;
    }> = [];

    let currentSegmentStart = 0;
    let currentDistance = 0;
    let currentElevationGain = 0;

    for (let i = 1; i < trailPoints.length; i++) {
      const prev = trailPoints[i - 1];
      const curr = trailPoints[i];

      const segmentDistance = this.haversineDistance(
        prev.lat,
        prev.lng,
        curr.lat,
        curr.lng
      );

      const elevationDiff = (curr.elevation || 0) - (prev.elevation || 0);
      if (elevationDiff > 0) {
        currentElevationGain += elevationDiff;
      }

      currentDistance += segmentDistance;

      // 如果超过最大长度，创建新分段
      if (currentDistance >= maxLength && i < trailPoints.length - 1) {
        segments.push({
          startIndex: currentSegmentStart,
          endIndex: i,
          distanceKm: currentDistance,
          elevationGainM: currentElevationGain,
          waypoints: trailPoints.slice(currentSegmentStart, i + 1),
        });

        currentSegmentStart = i;
        currentDistance = 0;
        currentElevationGain = 0;
      }
    }

    // 添加最后一段
    if (currentSegmentStart < trailPoints.length - 1) {
      segments.push({
        startIndex: currentSegmentStart,
        endIndex: trailPoints.length - 1,
        distanceKm: currentDistance,
        elevationGainM: currentElevationGain,
        waypoints: trailPoints.slice(currentSegmentStart),
      });
    }

    return segments.map((seg, index) => ({
      segmentIndex: index + 1,
      startPoint: seg.waypoints[0],
      endPoint: seg.waypoints[seg.waypoints.length - 1],
      distanceKm: seg.distanceKm,
      elevationGainM: seg.elevationGainM,
      estimatedDurationHours: seg.distanceKm / 4 + seg.elevationGainM / 300, // 简化估算
      waypointCount: seg.waypoints.length,
    }));
  }

  // ========== 辅助方法 ==========

  /**
   * 提取坐标（从PostGIS geography类型）
   */
  private extractCoordinates(location: any): { lat?: number; lng?: number } {
    if (!location) return {};
    
    // PostGIS geography类型通常是字符串 "POINT(lng lat)" 或对象
    if (typeof location === 'string') {
      const match = location.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
      if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      }
    }
    
    if (typeof location === 'object') {
      if ('lat' in location && 'lng' in location) {
        return { lat: location.lat, lng: location.lng };
      }
      if ('latitude' in location && 'longitude' in location) {
        return { lat: location.latitude, lng: location.longitude };
      }
    }
    
    return {};
  }

  /**
   * 从Trail提取轨迹点（优先GPX，其次waypoints）
   */
  private async extractTrailPoints(trail: any): Promise<Array<{ lat: number; lng: number; elevation?: number }>> {
    // 优先使用GPX数据
    if (trail.gpxData) {
      try {
        const gpx = typeof trail.gpxData === 'string' 
          ? JSON.parse(trail.gpxData) 
          : trail.gpxData;
        
        if (gpx.points && Array.isArray(gpx.points)) {
          return gpx.points.map((p: any) => ({
            lat: p.lat,
            lng: p.lng,
            elevation: p.elevation,
          }));
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 其次使用waypoints（通过关联的place获取位置）
    if (trail.waypoints && trail.waypoints.length > 0) {
      const waypointPoints = await Promise.all(
        trail.waypoints.map(async (wp: any) => {
          if (wp.placeId) {
            const locationResult = await this.prisma.$queryRaw<Array<{
              lat: number;
              lng: number;
            }>>`
              SELECT 
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ${wp.placeId}
            `;
            
            if (locationResult[0]) {
              return {
                lat: locationResult[0].lat,
                lng: locationResult[0].lng,
                elevation: undefined, // TrailWaypoint没有elevation字段
              };
            }
          }
          return null;
        })
      );
      
      const validPoints = waypointPoints.filter((p): p is NonNullable<typeof p> => p !== null);
      if (validPoints.length > 0) {
        return validPoints;
      }
    }

    // 最后使用起点和终点（通过raw query获取location）
    const points: Array<{ lat: number; lng: number; elevation?: number }> = [];
    
    if (trail.startPlaceId) {
      const startLocation = await this.prisma.$queryRaw<Array<{
        lat: number;
        lng: number;
      }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${trail.startPlaceId}
      `;
      
      if (startLocation[0]) {
        points.push({ lat: startLocation[0].lat, lng: startLocation[0].lng });
      }
    }
    
    if (trail.endPlaceId) {
      const endLocation = await this.prisma.$queryRaw<Array<{
        lat: number;
        lng: number;
      }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${trail.endPlaceId}
      `;
      
      if (endLocation[0]) {
        points.push({ lat: endLocation[0].lat, lng: endLocation[0].lng });
      }
    }

    return points;
  }

  /**
   * 获取Trail的中心点
   */
  private async getTrailCenter(trail: any): Promise<{ lat: number; lng: number } | null> {
    const points = await this.extractTrailPoints(trail);
    if (points.length === 0) return null;

    const midIndex = Math.floor(points.length / 2);
    return { lat: points[midIndex].lat, lng: points[midIndex].lng };
  }

  /**
   * 计算边界框
   */
  private calculateBounds(points: Array<{ lat: number; lng: number }>): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } {
    if (points.length === 0) {
      throw new Error('点列表为空');
    }

    let minLat = points[0].lat;
    let maxLat = points[0].lat;
    let minLng = points[0].lng;
    let maxLng = points[0].lng;

    points.forEach(p => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Haversine距离计算（公里）
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 采样轨迹点（每N米一个点）
   */
  private sampleTrailPoints(
    points: Array<{ lat: number; lng: number }>,
    intervalMeters: number
  ): Array<{ lat: number; lng: number }> {
    if (points.length <= 1) return points;

    const sampled: Array<{ lat: number; lng: number }> = [points[0]];
    let accumulatedDistance = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const segmentDistance = this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng) * 1000; // 转为米
      accumulatedDistance += segmentDistance;

      if (accumulatedDistance >= intervalMeters) {
        sampled.push(curr);
        accumulatedDistance = 0;
      }
    }

    // 确保包含最后一个点
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }

    return sampled;
  }

  /**
   * 检查Trail是否适合用户的体力配置
   */
  async checkTrailSuitability(
    trailId: number,
    pacingConfig: {
      max_daily_hp: number;
      walk_speed_factor: number;
      terrain_filter?: string;
    }
  ) {
    const trail = await this.findOne(trailId);
    
    // 动态导入TrailFatigueCalculator（避免循环依赖）
    const { TrailFatigueCalculator } = await import('./utils/trail-fatigue-calculator.util');
    
    return TrailFatigueCalculator.isTrailSuitable(
      {
        distanceKm: trail.distanceKm,
        elevationGainM: trail.elevationGainM,
        maxElevationM: trail.maxElevationM || undefined,
        difficultyLevel: trail.difficultyLevel || undefined,
      },
      pacingConfig as any
    );
  }
}

