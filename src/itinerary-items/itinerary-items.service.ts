// src/itinerary-items/itinerary-items.service.ts
import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItineraryItemDto, ItemType } from './dto/create-itinerary-item.dto';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { SmartRoutesService } from '../transport/services/smart-routes.service';

@Injectable()
export class ItineraryItemsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly smartRoutesService?: SmartRoutesService
  ) {}

  /**
   * 创建行程项（带智能校验）
   * 
   * 校验逻辑：
   * 1. 基础逻辑校验：结束时间必须晚于开始时间
   * 2. 营业状态校验：如果关联了地点，检查指定时间是否营业
   * 
   * @param dto 创建行程项的输入数据
   * @returns 创建成功的 ItineraryItem 对象（包含关联的 Place 信息）
   */
  async create(dto: CreateItineraryItemDto) {
    // ============================================
    // 步骤 1: 基础逻辑校验
    // ============================================
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    // 验证日期有效性
    if (isNaN(start.getTime())) {
      throw new BadRequestException('无效的开始时间');
    }
    if (isNaN(end.getTime())) {
      throw new BadRequestException('无效的结束时间');
    }

    // 结束时间必须晚于开始时间
    if (start >= end) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    // ============================================
    // 步骤 2: 验证 TripDay 是否存在
    // ============================================
    const tripDay = await this.prisma.tripDay.findUnique({
      where: { id: dto.tripDayId },
      include: { Trip: true }
    });

    if (!tripDay) {
      throw new NotFoundException(`找不到指定的行程日期 (ID: ${dto.tripDayId})`);
    }

    // ============================================
    // 步骤 3: 智能营业时间校验（如果关联了地点）
    // ============================================
    // 只有当类型是 ACTIVITY 或 MEAL_ANCHOR 时才需要检查营业时间
    // TRANSIT、REST、MEAL_FLOATING 通常不需要检查
    if (dto.placeId && (dto.type === ItemType.ACTIVITY || dto.type === ItemType.MEAL_ANCHOR)) {
      const place = await this.prisma.place.findUnique({
        where: { id: dto.placeId },
        include: { City: true } // 获取城市信息（可能需要时区）
      });

      if (!place) {
        throw new NotFoundException(`找不到指定地点 (ID: ${dto.placeId})`);
      }

      // 获取元数据中的营业时间和时区
      const meta = place.metadata as any;
      const openingHours = meta?.openingHours;
      const timezone = meta?.timezone || 'Atlantic/Reykjavik'; // 默认冰岛时区

      // 如果地点有营业时间信息，进行校验
      if (openingHours) {
        // 获取指定日期的营业时间字符串
        const hoursStr = OpeningHoursUtil.getHoursForDate(meta, start, timezone);

        // 如果当天不营业
        if (hoursStr === 'Closed' || !hoursStr) {
          const dateStr = DateTime.fromJSDate(start).setZone(timezone).toFormat('yyyy-MM-dd cccc', { locale: 'zh-CN' });
          throw new BadRequestException(
            `${place.nameEN || place.nameCN} 在 ${dateStr} 不营业`
          );
        }

        // 检查开始时间是否在营业时间内
        const isOpenAtStart = OpeningHoursUtil.isOpenAt(hoursStr, start, timezone);

        if (!isOpenAtStart) {
          // 格式化时间显示
          const startTimeStr = DateTime.fromJSDate(start).setZone(timezone).toFormat('HH:mm');
          const dateStr = DateTime.fromJSDate(start).setZone(timezone).toFormat('yyyy-MM-dd cccc', { locale: 'zh-CN' });
          
          throw new BadRequestException(
            `时间冲突警告：${place.nameEN || place.nameCN} 在 ${dateStr} ${startTimeStr} 可能未营业 (营业时间: ${hoursStr})`
          );
  }

        // 可选：检查结束时间是否也在营业时间内（更严格的校验）
        // 这里只检查开始时间，因为有些活动可能跨营业时间（如：10:00-12:00，但店铺 11:30 关门）
        // 如果需要更严格的校验，可以取消下面的注释
        /*
        const isOpenAtEnd = OpeningHoursUtil.isOpenAt(hoursStr, end, timezone);
        if (!isOpenAtEnd) {
          const endTimeStr = DateTime.fromJSDate(end).setZone(timezone).toFormat('HH:mm');
          throw new BadRequestException(
            `时间冲突警告：${place.name} 在 ${endTimeStr} 可能已关门 (营业时间: ${hoursStr})`
          );
        }
        */
      }
    }

    // ============================================
    // 步骤 3.5: 验证 Trail（如果提供了trailId）
    // ============================================
    if (dto.trailId) {
      const trail = await this.prisma.trail.findUnique({
        where: { id: dto.trailId },
      });

      if (!trail) {
        throw new NotFoundException(`找不到指定徒步路线 (ID: ${dto.trailId})`);
      }

      // 如果关联了Trail，验证时间是否合理（至少需要estimatedDurationHours）
      if (trail.estimatedDurationHours) {
        const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const minDuration = trail.estimatedDurationHours * 0.8; // 允许20%的误差
        if (durationHours < minDuration) {
          throw new BadRequestException(
            `徒步路线预计耗时 ${trail.estimatedDurationHours} 小时，但行程时间仅 ${durationHours.toFixed(1)} 小时，可能不够`
          );
        }
      }
    }

    // ============================================
    // 步骤 4: 写入数据库
    // ============================================
    return this.prisma.itineraryItem.create({
      data: {
        id: randomUUID(),
        tripDayId: dto.tripDayId,
        placeId: dto.placeId,
        trailId: dto.trailId,
        type: dto.type as any, // Prisma 枚举类型
        startTime: start,
        endTime: end,
        note: dto.note,
      } as any, // Use UncheckedCreateInput to allow direct foreign key assignment
      include: {
        Place: {
          include: {
            City: true,
          },
        },
        Trail: {
          include: {
                    Place_Trail_startPlaceIdToPlace: true,
                    Place_Trail_endPlaceIdToPlace: true,
                TrailWaypoint: {
              include: {
                Place: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        TripDay: {
          include: {
            Trip: true,
          },
        },
      },
    });
  }

  /**
   * 获取所有行程项
   */
  async findAll() {
    return this.prisma.itineraryItem.findMany({
      include: {
        Place: true,
        Trail: {
          include: {
                    Place_Trail_startPlaceIdToPlace: true,
                    Place_Trail_endPlaceIdToPlace: true,
                TrailWaypoint: {
              include: {
                Place: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        TripDay: {
          include: {
            Trip: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  /**
   * 根据 ID 获取单个行程项
   */
  async findOne(id: string) {
    return this.prisma.itineraryItem.findUnique({
      where: { id },
      include: {
        Place: {
          include: {
            City: true,
          },
        },
        Trail: {
          include: {
                    Place_Trail_startPlaceIdToPlace: true,
                    Place_Trail_endPlaceIdToPlace: true,
                TrailWaypoint: {
              include: {
                Place: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        TripDay: {
          include: {
            Trip: true,
            ItineraryItem: {
              orderBy: {
                startTime: 'asc',
              },
            },
          },
        },
      },
    });
  }

  /**
   * 获取指定 TripDay 的所有行程项
   */
  async findByTripDay(tripDayId: string) {
    return this.prisma.itineraryItem.findMany({
      where: { tripDayId },
      include: {
        Place: true,
        Trail: {
          include: {
                    Place_Trail_startPlaceIdToPlace: true,
                    Place_Trail_endPlaceIdToPlace: true,
                TrailWaypoint: {
              include: {
                Place: true,
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
    });
  }

  /**
   * 更新行程项
   * 
   * 如果更新了开始时间，会根据前一个行程项的位置和当前行程项的位置，
   * 计算实际距离和旅行时间，并自动调整后续行程项的时间。
   */
  async update(id: string, updateDto: Partial<CreateItineraryItemDto>) {
    // 如果更新了时间，需要重新校验和计算
    if (updateDto.startTime || updateDto.endTime) {
      // 获取现有数据（包含完整的关联信息）
      const existing = await this.prisma.itineraryItem.findUnique({
        where: { id },
        include: {
          Place: {
            include: {
              City: true,
            },
          },
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: {
                    include: {
                      City: true,
                    },
                  },
                },
                orderBy: {
                  startTime: 'asc',
                },
              },
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException(`找不到指定的行程项 (ID: ${id})`);
      }

      const start = updateDto.startTime ? new Date(updateDto.startTime) : existing.startTime;
      const end = updateDto.endTime ? new Date(updateDto.endTime) : existing.endTime;

      // 基础校验
      if (start >= end) {
        throw new BadRequestException('结束时间必须晚于开始时间');
      }

      // 如果关联了地点，重新校验营业时间
      if (existing.placeId && existing.Place) {
        const meta = existing.Place?.metadata as any;
        const timezone = meta?.timezone || 'Atlantic/Reykjavik';
        const hoursStr = OpeningHoursUtil.getHoursForDate(meta, start, timezone);

        if (hoursStr !== 'Closed' && hoursStr) {
          const isOpen = OpeningHoursUtil.isOpenAt(hoursStr, start, timezone);
          if (!isOpen) {
            throw new BadRequestException(
              `时间冲突警告：${existing.Place?.nameEN || existing.Place?.nameCN} 在指定时间可能未营业 (营业时间: ${hoursStr})`
            );
          }
        }
      }

      // 如果更新了开始时间，需要根据实际距离计算旅行时间并调整后续行程项
      if (updateDto.startTime && this.smartRoutesService) {
        await this.adjustSubsequentItemsBasedOnTravelTime(
          existing,
          start,
          existing.TripDay
        );
      }
    }

    return this.prisma.itineraryItem.update({
      where: { id },
      data: {
        ...(updateDto.placeId !== undefined && { placeId: updateDto.placeId }),
        ...(updateDto.trailId !== undefined && { trailId: updateDto.trailId }),
        ...(updateDto.type && { type: updateDto.type as any }),
        ...(updateDto.startTime && { startTime: new Date(updateDto.startTime) }),
        ...(updateDto.endTime && { endTime: new Date(updateDto.endTime) }),
        ...(updateDto.note !== undefined && { note: updateDto.note }),
      },
      include: {
        Place: {
          include: {
            City: true,
          },
        },
        Trail: {
          include: {
                    Place_Trail_startPlaceIdToPlace: true,
                    Place_Trail_endPlaceIdToPlace: true,
                TrailWaypoint: {
              include: {
                Place: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        TripDay: true,
      },
    });
  }

  /**
   * 根据实际距离和交通方式调整后续行程项的时间
   */
  private async adjustSubsequentItemsBasedOnTravelTime(
    currentItem: any,
    newStartTime: Date,
    tripDay: any
  ): Promise<void> {
    if (!tripDay || !tripDay.ItineraryItem) {
      return;
    }

    const items = tripDay.ItineraryItem;
    const currentIndex = items.findIndex((item: any) => item.id === currentItem.id);
    
    if (currentIndex < 0) {
      return;
    }

    // 获取前一个行程项的位置（用于计算旅行时间）
    let fromLocation: { lat: number; lng: number } | null = null;
    
    if (currentIndex > 0) {
      // 前一个行程项
      const prevItem = items[currentIndex - 1];
      fromLocation = this.extractPlaceCoordinates(prevItem.Place);
      
      // 如果前一个行程项没有位置，尝试从住宿位置获取（如果是当天的第一个活动）
      if (!fromLocation && currentIndex === 1) {
        // TODO: 从 Trip 的 anchors 中获取当天的酒店位置
        // 这里暂时跳过，后续可以扩展
      }
    } else {
      // 如果是当天的第一个行程项，尝试从住宿位置获取
      // TODO: 从 Trip 的 anchors 中获取当天的酒店位置
      // 这里暂时跳过，后续可以扩展
    }

    // 获取当前行程项的位置
    const toLocation = this.extractPlaceCoordinates(currentItem.Place);
    
    // 如果两个位置都存在，计算旅行时间
    if (fromLocation && toLocation && this.smartRoutesService) {
      try {
        // 根据距离选择合适的交通方式
        const distance = this.calculateHaversineDistance(
          fromLocation.lat,
          fromLocation.lng,
          toLocation.lat,
          toLocation.lng
        );
        
        // 选择交通方式：< 2km 步行，2-50km 驾车，> 50km 公共交通
        const travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 
          distance < 2 ? 'WALKING' :
          distance < 50 ? 'DRIVING' :
          'TRANSIT';

        // 获取路线选项
        const routes = await this.smartRoutesService.getRoutes(
          fromLocation.lat,
          fromLocation.lng,
          toLocation.lat,
          toLocation.lng,
          travelMode
        );

        if (routes.length > 0) {
          const travelTimeMinutes = routes[0].durationMinutes;
          
          // 计算前一个行程项的结束时间
          let prevEndTime: Date;
          if (currentIndex > 0) {
            const prevItem = items[currentIndex - 1];
            prevEndTime = prevItem.endTime || new Date(prevItem.startTime.getTime() + 2 * 60 * 60 * 1000); // 默认2小时
          } else {
            // 如果是第一个行程项，使用当天的开始时间（例如 9:00）
            const dayStart = DateTime.fromJSDate(tripDay.date).set({ hour: 9, minute: 0 }).toJSDate();
            prevEndTime = dayStart;
          }

          // 计算新的开始时间：前一个结束时间 + 旅行时间 + 缓冲时间（15分钟）
          const bufferMinutes = 15;
          const calculatedStartTime = DateTime.fromJSDate(prevEndTime)
            .plus({ minutes: travelTimeMinutes + bufferMinutes })
            .toJSDate();

          // 如果计算出的开始时间与新的开始时间不同，使用计算出的时间
          // 但这里我们尊重用户指定的时间，只是确保后续行程项的时间是合理的
          const newStart = DateTime.fromJSDate(newStartTime);
          const calculatedStart = DateTime.fromJSDate(calculatedStartTime);
          
          // 如果用户指定的时间早于计算出的时间，给出警告
          if (newStart < calculatedStart) {
            const diffMinutes = calculatedStart.diff(newStart, 'minutes').minutes;
            if (diffMinutes > 30) {
              // 时间差异超过30分钟，给出警告
              throw new BadRequestException(
                `时间可能不合理：根据实际距离（${distance.toFixed(1)}km）和交通方式（${travelMode}），预计需要 ${travelTimeMinutes} 分钟，建议开始时间不早于 ${calculatedStart.toFormat('HH:mm')}`
              );
            }
          }

          // 调整后续行程项的时间
          let currentEndTime = DateTime.fromJSDate(newStartTime);
          if (currentItem.endTime) {
            const duration = DateTime.fromJSDate(currentItem.endTime).diff(
              DateTime.fromJSDate(currentItem.startTime),
              'minutes'
            ).minutes;
            currentEndTime = DateTime.fromJSDate(newStartTime).plus({ minutes: duration });
          } else {
            // 如果没有结束时间，默认2小时
            currentEndTime = DateTime.fromJSDate(newStartTime).plus({ hours: 2 });
          }

          // 更新后续行程项的时间
          for (let i = currentIndex + 1; i < items.length; i++) {
            const nextItem = items[i];
            if (!nextItem.Place) {
              continue;
            }

            const nextLocation = this.extractPlaceCoordinates(nextItem.Place);
            if (!nextLocation) {
              continue;
            }

            // 计算到下一个地点的旅行时间
            const nextDistance = this.calculateHaversineDistance(
              toLocation.lat,
              toLocation.lng,
              nextLocation.lat,
              nextLocation.lng
            );

            const nextTravelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 
              nextDistance < 2 ? 'WALKING' :
              nextDistance < 50 ? 'DRIVING' :
              'TRANSIT';

            const nextRoutes = await this.smartRoutesService.getRoutes(
              toLocation.lat,
              toLocation.lng,
              nextLocation.lat,
              nextLocation.lng,
              nextTravelMode
            );

            if (nextRoutes.length > 0) {
              const nextTravelTime = nextRoutes[0].durationMinutes;
              const bufferMinutes = 15;
              
              // 计算下一个行程项的开始时间
              const nextStartTime = currentEndTime.plus({ minutes: nextTravelTime + bufferMinutes });
              
              // 计算下一个行程项的结束时间（保持原有时长）
              let nextEndTime: DateTime;
              if (nextItem.endTime && nextItem.startTime) {
                const duration = DateTime.fromJSDate(nextItem.endTime).diff(
                  DateTime.fromJSDate(nextItem.startTime),
                  'minutes'
                ).minutes;
                nextEndTime = nextStartTime.plus({ minutes: duration });
              } else {
                nextEndTime = nextStartTime.plus({ hours: 2 });
              }

              // 更新下一个行程项的时间
              await this.prisma.itineraryItem.update({
                where: { id: nextItem.id },
                data: {
                  startTime: nextStartTime.toJSDate(),
                  endTime: nextEndTime.toJSDate(),
                },
              });

              // 更新当前位置和结束时间，用于下一个循环
              toLocation.lat = nextLocation.lat;
              toLocation.lng = nextLocation.lng;
              currentEndTime = nextEndTime;
            }
          }
        }
      } catch (error) {
        // 如果计算旅行时间失败，记录警告但不阻止更新
        console.warn(`计算旅行时间失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 从 Place 提取坐标
   */
  private extractPlaceCoordinates(place: any): { lat: number; lng: number } | null {
    if (!place) {
      return null;
    }

    // 方法1: 从 metadata 中获取坐标
    const metadata = (place.metadata as any) || {};
    if (metadata.lat && metadata.lng) {
      return { lat: metadata.lat, lng: metadata.lng };
    }
    if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
      return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
    }

    // 方法2: 从 PostGIS location 字段提取
    const location = place.location;
    if (location) {
      // 如果 location 是字符串格式 (POINT(lng lat))
      if (typeof location === 'string') {
        const match = location.match(/POINT\(([^)]+)\)/);
        if (match) {
          const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
          return { lat, lng };
        }
      }
      // 如果 location 是对象格式
      if (typeof location === 'object') {
        if (location.coordinates && Array.isArray(location.coordinates)) {
          return { lng: location.coordinates[0], lat: location.coordinates[1] };
        }
        if (location.lat && location.lng) {
          return { lat: location.lat, lng: location.lng };
        }
      }
    }

    return null;
  }

  /**
   * 使用 Haversine 公式计算两点间距离（公里）
   */
  private calculateHaversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度转弧度
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 删除行程项
   */
  async remove(id: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${id})`);
    }

    return this.prisma.itineraryItem.delete({
      where: { id },
    });
  }
}
