// src/trips/services/trip-recap.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';

export interface TripRecapReport {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  places: Array<{
    id: number;
    nameCN: string;
    nameEN?: string;
    category: string;
    visitDate: string;
    visitTime: string;
    photos?: string[];
  }>;
  trails: Array<{
    id: number;
    nameCN: string;
    nameEN?: string;
    distanceKm: number;
    elevationGainM: number;
    durationHours: number;
    visitDate: string;
    gpxData?: any;
    waypoints?: Array<{
      placeId?: number;
      placeName?: string;
      latitude: number;
      longitude: number;
      elevation?: number;
    }>;
  }>;
  statistics: {
    totalPlaces: number;
    totalTrails: number;
    totalTrailDistanceKm: number;
    totalElevationGainM: number;
    totalTrailDurationHours: number;
    placesByCategory: Record<string, number>;
  };
  timeline: Array<{
    date: string;
    items: Array<{
      type: 'PLACE' | 'TRAIL' | 'REST' | 'MEAL';
      name: string;
      time: string;
      duration?: number;
      note?: string;
    }>;
  }>;
  metadata?: {
    photos?: string[];
    notes?: string;
    rating?: number;
  };
}

@Injectable()
export class TripRecapService {
  constructor(private prisma: PrismaService) {}

  /**
   * 生成行程复盘报告（包含景点和徒步轨迹）
   */
  async generateRecap(tripId: string): Promise<TripRecapReport> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          include: {
            items: {
              include: {
                place: {
                  select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
                  },
                },
                trail: {
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
                      select: {
                        id: true,
                        trailId: true,
                        placeId: true,
                        order: true,
                        note: true,
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
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 提取景点信息
    const places: TripRecapReport['places'] = [];
    const trails: TripRecapReport['trails'] = [];
    const timeline: TripRecapReport['timeline'] = [];

    // 按日期组织数据
    for (const day of trip.days) {
      const dateStr = DateTime.fromJSDate(day.date).toISODate()!;
      const dayItems: TripRecapReport['timeline'][0]['items'] = [];

      for (const item of day.items) {
        const startTime = DateTime.fromJSDate(item.startTime);
        const endTime = DateTime.fromJSDate(item.endTime);
        const duration = endTime.diff(startTime, 'hours').hours;

        // 处理景点
        if (item.place) {
          places.push({
            id: item.place.id,
            nameCN: item.place.nameCN,
            nameEN: item.place.nameEN || undefined,
            category: item.place.category,
            visitDate: dateStr,
            visitTime: startTime.toFormat('HH:mm'),
          });

          dayItems.push({
            type: 'PLACE',
            name: item.place.nameCN,
            time: startTime.toFormat('HH:mm'),
            duration,
            note: item.note || undefined,
          });
        }

        // 处理徒步路线
        if (item.trail) {
          const trail = item.trail;
          trails.push({
            id: trail.id,
            nameCN: trail.nameCN,
            nameEN: trail.nameEN || undefined,
            distanceKm: trail.distanceKm,
            elevationGainM: trail.elevationGainM,
            durationHours: trail.estimatedDurationHours || duration,
            visitDate: dateStr,
            gpxData: trail.gpxData || undefined,
            waypoints: await Promise.all(
              trail.waypoints.map(async (wp) => {
                let lat: number | undefined;
                let lng: number | undefined;
                
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
                    lat = locationResult[0].lat;
                    lng = locationResult[0].lng;
                  }
                }
                
                return {
                  placeId: wp.placeId || undefined,
                  placeName: wp.place?.nameCN || wp.place?.nameEN || undefined,
                  latitude: lat || 0,
                  longitude: lng || 0,
                  elevation: undefined, // TrailWaypoint没有elevation字段
                };
              })
            ),
          });

          dayItems.push({
            type: 'TRAIL',
            name: trail.nameCN,
            time: startTime.toFormat('HH:mm'),
            duration: trail.estimatedDurationHours || duration,
            note: item.note || undefined,
          });
        }

        // 处理其他类型
        if (item.type === 'REST' || item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING') {
          dayItems.push({
            type: item.type === 'REST' ? 'REST' : 'MEAL',
            name: item.place?.nameCN || item.note || '休息/用餐',
            time: startTime.toFormat('HH:mm'),
            duration,
            note: item.note || undefined,
          });
        }
      }

      if (dayItems.length > 0) {
        timeline.push({
          date: dateStr,
          items: dayItems,
        });
      }
    }

    // 计算统计信息
    const placesByCategory: Record<string, number> = {};
    places.forEach(p => {
      placesByCategory[p.category] = (placesByCategory[p.category] || 0) + 1;
    });

    const statistics: TripRecapReport['statistics'] = {
      totalPlaces: places.length,
      totalTrails: trails.length,
      totalTrailDistanceKm: trails.reduce((sum, t) => sum + t.distanceKm, 0),
      totalElevationGainM: trails.reduce((sum, t) => sum + t.elevationGainM, 0),
      totalTrailDurationHours: trails.reduce((sum, t) => sum + t.durationHours, 0),
      placesByCategory,
    };

    return {
      tripId: trip.id,
      destination: trip.destination,
      startDate: DateTime.fromJSDate(trip.startDate).toISODate()!,
      endDate: DateTime.fromJSDate(trip.endDate).toISODate()!,
      totalDays: trip.days.length,
      places,
      trails,
      statistics,
      timeline,
      metadata: (trip.metadata as any) || {},
    };
  }

  /**
   * 导出为可分享的格式（JSON）
   */
  async exportForSharing(tripId: string): Promise<{
    recap: TripRecapReport;
    shareUrl: string;
    exportDate: string;
  }> {
    const recap = await this.generateRecap(tripId);

    // 检查是否已有分享链接
    const existingShare = await this.prisma.tripShare.findFirst({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
    });

    const shareUrl = existingShare
      ? `/trips/shared/${existingShare.shareToken}`
      : null;

    return {
      recap,
      shareUrl: shareUrl || '',
      exportDate: DateTime.now().toISO()!,
    };
  }

  /**
   * 生成3D轨迹视频数据（返回GPX和关键点信息，前端可据此生成视频）
   */
  async generateTrailVideoData(tripId: string): Promise<{
    trails: Array<{
      trailId: number;
      name: string;
      gpxData: any;
      keyPoints: Array<{
        latitude: number;
        longitude: number;
        elevation: number;
        timestamp: string;
        description?: string;
      }>;
    }>;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          include: {
            items: {
              include: {
                trail: {
                  include: {
                    waypoints: {
                      orderBy: {
                        order: 'asc',
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const trailData: Array<{
      trailId: number;
      name: string;
      gpxData: any;
      keyPoints: Array<{
        latitude: number;
        longitude: number;
        elevation: number;
        timestamp: string;
        description?: string;
      }>;
    }> = [];

    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.trail) {
          const trail = item.trail;
          const startTime = DateTime.fromJSDate(item.startTime);

          // 从GPX数据或waypoints提取关键点
          let points: Array<{ lat: number; lng: number; elevation?: number }> = [];
          
          if (trail.gpxData) {
            try {
              const gpx = typeof trail.gpxData === 'string' 
                ? JSON.parse(trail.gpxData) 
                : trail.gpxData;
              if (gpx.points && Array.isArray(gpx.points)) {
                points = gpx.points;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }

          // 如果没有GPX，使用waypoints（通过关联的place获取位置）
          if (points.length === 0 && trail.waypoints.length > 0) {
            // 从waypoints的place获取位置（需要raw query）
            const waypointPoints = await Promise.all(
              trail.waypoints.map(async (wp) => {
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
            
            points = waypointPoints.filter((p): p is NonNullable<typeof p> => p !== null);
          }

          // 生成关键点（起点、终点、途经点）
          const keyPoints = points
            .filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 10)) === 0)
            .map((point, index) => {
              const timeOffset = (trail.estimatedDurationHours || 1) * 3600 * (index / points.length);
              return {
                latitude: point.lat,
                longitude: point.lng,
                elevation: point.elevation || 0,
                timestamp: startTime.plus({ seconds: timeOffset }).toISO()!,
                description: index === 0 
                  ? '起点' 
                  : index === points.length - 1 
                  ? '终点'
                  : `途经点 ${index + 1}`,
              };
            });

          trailData.push({
            trailId: trail.id,
            name: trail.nameCN,
            gpxData: trail.gpxData,
            keyPoints,
          });
        }
      }
    }

    return { trails: trailData };
  }
}

