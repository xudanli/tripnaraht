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
    // 步骤 2.5: 校验日期一致性
    // ============================================
    // 行程项的开始时间应该在 TripDay 的日期范围内
    // TripDay.date 存储的是 UTC 00:00:00，代表该天
    // 允许跨夜活动（如住宿），所以只检查开始时间
    const tripDayDate = DateTime.fromJSDate(tripDay.date, { zone: 'utc' });
    const startDateTime = DateTime.fromJSDate(start, { zone: 'utc' });
    
    // 计算行程日期的范围：当天 00:00 到次日 03:00（允许深夜活动）
    // 注：03:00 而非 06:00，因为凌晨 3 点后的活动更应归属于新的一天
    const dayStart = tripDayDate.startOf('day');
    const dayEnd = tripDayDate.plus({ days: 1, hours: 3 }); // 次日凌晨3点
    
    if (startDateTime < dayStart || startDateTime >= dayEnd) {
      const expectedDate = tripDayDate.toFormat('yyyy-MM-dd');
      const actualDate = startDateTime.toFormat('yyyy-MM-dd HH:mm');
      throw new BadRequestException(
        `行程项开始时间 (${actualDate}) 与所属日期 (${expectedDate}) 不匹配。请检查日期或选择正确的行程日`
      );
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
    // 步骤 3.8: 🆕 智能类型推断（如果未指定类型）
    // ============================================
    let finalType = dto.type;
    if (!finalType && dto.placeId) {
      const placeForType = await this.prisma.place.findUnique({
        where: { id: dto.placeId },
        select: { category: true, nameCN: true, nameEN: true, metadata: true },
      });
      if (placeForType) {
        finalType = this.inferItemType(placeForType);
      }
    }
    // 默认为 ACTIVITY
    if (!finalType) {
      finalType = ItemType.ACTIVITY;
    }

    // ============================================
    // 步骤 4: 写入数据库
    // ============================================
    const newItem = await this.prisma.itineraryItem.create({
      data: {
        id: randomUUID(),
        tripDayId: dto.tripDayId,
        placeId: dto.placeId,
        trailId: dto.trailId,
        type: finalType as any, // Prisma 枚举类型
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

    // ============================================
    // 步骤 5: 自动计算交通信息（异步执行，不阻塞返回）
    // ============================================
    this.calculateTravelInfoForItem(newItem.id, tripDay.Trip.id).catch(err => {
      console.warn('自动计算交通信息失败:', err.message);
    });

    return newItem;
  }

  /**
   * 🆕 根据 Place 信息推断行程项类型
   */
  private inferItemType(place: {
    category: string | null;
    nameCN: string | null;
    nameEN: string | null;
    metadata: any;
  }): ItemType {
    const category = (place.category || '').toUpperCase();
    const nameCN = (place.nameCN || '').toLowerCase();
    const nameEN = (place.nameEN || '').toLowerCase();
    const name = `${nameCN} ${nameEN}`;
    const meta = place.metadata as any;
    const metaCategory = (meta?.category || '').toLowerCase();

    // 1. 根据 PlaceCategory 推断
    if (category === 'HOTEL') {
      return ItemType.REST;  // 住宿用 REST 类型
    }
    if (category === 'RESTAURANT') {
      return ItemType.MEAL_ANCHOR;  // 餐厅用 MEAL_ANCHOR
    }
    if (category === 'TRANSIT_HUB') {
      return ItemType.TRANSIT;  // 交通枢纽用 TRANSIT
    }

    // 2. 根据名称关键词推断
    // 住宿类
    if (name.includes('酒店') || name.includes('hotel') || 
        name.includes('旅馆') || name.includes('民宿') ||
        name.includes('套房') || name.includes('hostel') ||
        name.includes('resort') || name.includes('度假') ||
        name.includes('guesthouse') || name.includes('inn')) {
      return ItemType.REST;
    }

    // 餐饮类
    if (name.includes('餐厅') || name.includes('restaurant') ||
        name.includes('饭店') || name.includes('cafe') ||
        name.includes('咖啡') || name.includes('bar') ||
        name.includes('酒吧') || name.includes('小吃') ||
        name.includes('food') || name.includes('bakery')) {
      return ItemType.MEAL_ANCHOR;
    }

    // 3. 根据元数据中的 category 推断
    if (metaCategory.includes('hotel') || metaCategory.includes('lodging') ||
        metaCategory.includes('accommodation')) {
      return ItemType.REST;
    }
    if (metaCategory.includes('restaurant') || metaCategory.includes('food') ||
        metaCategory.includes('cafe') || metaCategory.includes('dining')) {
      return ItemType.MEAL_ANCHOR;
    }

    // 4. 默认为 ACTIVITY
    return ItemType.ACTIVITY;
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
   * 
   * 🆕 支持跨天住宿显示：
   * - 返回当天的所有行程项
   * - 额外返回前一天跨到今天的住宿项（标记为退房）
   */
  async findByTripDay(tripDayId: string) {
    // 获取当前 TripDay 信息
    const currentTripDay = await this.prisma.tripDay.findUnique({
      where: { id: tripDayId },
      include: { Trip: true },
    });

    if (!currentTripDay) {
      return [];
    }

    // 查询当天的行程项
    const todayItems = await this.prisma.itineraryItem.findMany({
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
        TripDay: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // 🆕 查询前一天的跨天住宿项
    const checkoutItems = await this.findCheckoutItemsForDay(currentTripDay);

    // 合并结果，退房项排在最前面
    const allItems = [...checkoutItems, ...todayItems];

    // 添加跨天标记
    return allItems.map(item => this.addCrossDayInfo(item, currentTripDay.date));
  }

  /**
   * 🆕 查找应该在指定日期显示"退房"的住宿项
   */
  private async findCheckoutItemsForDay(currentTripDay: any): Promise<any[]> {
    const currentDate = DateTime.fromJSDate(currentTripDay.date, { zone: 'utc' });
    const currentDayStart = currentDate.startOf('day');
    const currentDayEnd = currentDate.endOf('day');

    // 获取同一行程的前一天
    const previousTripDay = await this.prisma.tripDay.findFirst({
      where: {
        tripId: currentTripDay.tripId,
        date: {
          lt: currentTripDay.date,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (!previousTripDay) {
      return [];
    }

    // 查询前一天的住宿项（REST 类型），其结束时间在今天
    const checkoutItems = await this.prisma.itineraryItem.findMany({
      where: {
        tripDayId: previousTripDay.id,
        type: 'REST', // 住宿类型
        endTime: {
          gte: currentDayStart.toJSDate(),
          lte: currentDayEnd.plus({ hours: 14 }).toJSDate(), // 退房时间通常在中午前
        },
      },
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
        TripDay: true,
      },
    });

    // 标记为退房项
    return checkoutItems.map(item => ({
      ...item,
      _isCheckoutItem: true,  // 内部标记
      _checkoutDate: currentTripDay.date,
    }));
  }

  /**
   * 🆕 为行程项添加跨天信息
   */
  private addCrossDayInfo(item: any, tripDayDate: Date): any {
    const startDate = DateTime.fromJSDate(item.startTime, { zone: 'utc' });
    const endDate = DateTime.fromJSDate(item.endTime, { zone: 'utc' });
    const tripDate = DateTime.fromJSDate(tripDayDate, { zone: 'utc' });

    // 计算跨天数
    const startDay = startDate.startOf('day');
    const endDay = endDate.startOf('day');
    const crossDays = Math.floor(endDay.diff(startDay, 'days').days);

    // 判断是否为退房项
    const isCheckoutItem = item._isCheckoutItem === true;

    return {
      ...item,
      // 🆕 跨天信息
      crossDayInfo: {
        isCrossDay: crossDays > 0,
        crossDays: crossDays,
        isCheckoutItem: isCheckoutItem,
        displayMode: isCheckoutItem ? 'checkout' : (crossDays > 0 ? 'checkin' : 'normal'),
        // 时间标签建议
        timeLabels: this.getTimeLabels(item.type, isCheckoutItem),
      },
    };
  }

  /**
   * 🆕 根据类型获取时间标签
   */
  private getTimeLabels(itemType: string, isCheckoutItem: boolean): { start: string; end: string } {
    if (isCheckoutItem) {
      return { start: '退房时间', end: '' };
    }
    
    switch (itemType) {
      case 'REST':
        return { start: '入住时间', end: '退房时间' };
      case 'MEAL_ANCHOR':
      case 'MEAL_FLOATING':
        return { start: '用餐时间', end: '结束时间' };
      case 'TRANSIT':
        return { start: '出发时间', end: '到达时间' };
      default:
        return { start: '开始时间', end: '结束时间' };
    }
  }

  /**
   * 更新行程项
   * 
   * 如果更新了开始时间，会根据前一个行程项的位置和当前行程项的位置，
   * 计算实际距离和旅行时间，并根据 cascadeMode 决定是否自动调整后续行程项的时间。
   * 
   * @param id 行程项 ID
   * @param updateDto 更新数据
   * @param options.forceUpdate 用户已确认级联影响，跳过部分校验
   */
  async update(
    id: string, 
    updateDto: Partial<CreateItineraryItemDto> & { cascadeMode?: 'auto' | 'none' },
    options?: { forceUpdate?: boolean }
  ) {
    const { forceUpdate = false } = options || {};
    const cascadeMode = updateDto.cascadeMode ?? 'auto'; // 默认为 'auto'
    
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
            Trip: true, // 需要获取 tripId 来查找新的 TripDay
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

    // 处理 tripDayId 更新：如果 startTime 跨天或明确提供了 tripDayId
    let targetTripDayId = updateDto.tripDayId;
    
    // 如果明确提供了 tripDayId，使用它
    if (targetTripDayId) {
      // 验证 tripDayId 是否存在
      const tripDay = await this.prisma.tripDay.findUnique({
        where: { id: targetTripDayId },
      });
      if (!tripDay) {
        throw new NotFoundException(`找不到指定的行程日期 (ID: ${targetTripDayId})`);
      }
    } else if (updateDto.startTime) {
      // 如果更新了 startTime 但未提供 tripDayId，根据新的 startTime 找到对应的 TripDay
      const startDate = DateTime.fromJSDate(start, { zone: 'utc' });
      const dayStart = startDate.startOf('day').toJSDate();
      const dayEnd = startDate.endOf('day').toJSDate();

      const tripId = existing.TripDay.Trip.id;
      
      // 查找对应日期的 TripDay
      const targetTripDay = await this.prisma.tripDay.findFirst({
        where: {
          tripId,
          date: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      if (targetTripDay) {
        targetTripDayId = targetTripDay.id;
      } else {
        // 如果找不到对应的 TripDay，使用现有的（不跨天的情况）
        targetTripDayId = existing.tripDayId;
      }
    } else {
      // 没有更新 startTime，保持原有的 tripDayId
      targetTripDayId = existing.tripDayId;
    }

    // 如果更新了时间，需要重新校验和计算
    if (updateDto.startTime || updateDto.endTime) {
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

      // 如果更新了开始时间，且 cascadeMode 为 'auto'，需要根据实际距离计算旅行时间并调整后续行程项
      // 注意：如果跨天了，需要获取新日期的 TripDay 来调整后续项
      if (updateDto.startTime && cascadeMode === 'auto' && this.smartRoutesService) {
        // 获取目标 TripDay（可能是新的日期）
        const targetTripDay = targetTripDayId !== existing.tripDayId
          ? await this.prisma.tripDay.findUnique({
              where: { id: targetTripDayId },
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
            })
          : existing.TripDay;

        if (targetTripDay) {
          await this.adjustSubsequentItemsBasedOnTravelTime(
            existing,
            start,
            targetTripDay,
            { skipTimeValidation: forceUpdate } // 用户已确认时，跳过时间合理性校验
          );
        }
      }
      // 如果 cascadeMode 为 'none'，只更新当前项，不调整后续行程项
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
        // 更新 tripDayId（如果跨天或明确提供）
        ...(targetTripDayId !== existing.tripDayId && { tripDayId: targetTripDayId }),
        // 费用相关字段
        ...(updateDto.estimatedCost !== undefined && { estimatedCost: updateDto.estimatedCost }),
        ...(updateDto.actualCost !== undefined && { actualCost: updateDto.actualCost }),
        ...(updateDto.currency !== undefined && { currency: updateDto.currency }),
        ...(updateDto.costCategory !== undefined && { costCategory: updateDto.costCategory }),
        ...(updateDto.costNote !== undefined && { costNote: updateDto.costNote }),
        ...(updateDto.isPaid !== undefined && { isPaid: updateDto.isPaid }),
        ...(updateDto.paidBy !== undefined && { paidBy: updateDto.paidBy }),
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
   * 
   * @param currentItem 当前行程项
   * @param newStartTime 新的开始时间
   * @param tripDay 行程日
   * @param options.skipTimeValidation 跳过时间合理性校验（用户已确认级联影响时使用）
   */
  private async adjustSubsequentItemsBasedOnTravelTime(
    currentItem: any,
    newStartTime: Date,
    tripDay: any,
    options?: { skipTimeValidation?: boolean }
  ): Promise<void> {
    const { skipTimeValidation = false } = options || {};
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
          
          // 如果用户指定的时间早于计算出的时间
          if (newStart < calculatedStart) {
            const diffMinutes = calculatedStart.diff(newStart, 'minutes').minutes;
            if (diffMinutes > 30) {
              // 时间差异超过30分钟
              if (skipTimeValidation) {
                // 用户已确认级联影响，只记录警告不阻止操作
                console.warn(
                  `[时间偏差警告] 用户已确认。实际距离 ${distance.toFixed(1)}km，` +
                  `交通方式 ${travelMode}，预计需要 ${travelTimeMinutes} 分钟，` +
                  `建议时间 ${calculatedStart.toFormat('HH:mm')}，用户选择 ${newStart.toFormat('HH:mm')}`
                );
              } else {
                // 首次请求，抛出异常让用户确认
                throw new BadRequestException(
                  `时间可能不合理：根据实际距离（${distance.toFixed(1)}km）和交通方式（${travelMode}），预计需要 ${travelTimeMinutes} 分钟，建议开始时间不早于 ${calculatedStart.toFormat('HH:mm')}`
                );
              }
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

    // 方法3: 从 _coordinates 缓存字段获取（用于 PostGIS）
    if (place._coordinates) {
      return { lat: place._coordinates.lat, lng: place._coordinates.lng };
    }

    return null;
  }

  /**
   * 使用原始 SQL 获取 Place 坐标（解决 PostGIS 类型问题）
   */
  private async getPlaceCoordinates(placeId: number): Promise<{ lat: number; lng: number } | null> {
    if (!placeId) return null;

    try {
      const result = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${placeId} AND location IS NOT NULL
      `;

      if (result.length > 0 && result[0].lat && result[0].lng) {
        return { lat: result[0].lat, lng: result[0].lng };
      }
    } catch (e) {
      // PostGIS 查询失败，返回 null
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

  // ========== 交通信息相关方法 ==========

  /**
   * 计算单个行程项与前一个行程项之间的交通信息（支持跨天）
   * 
   * @param itemId 当前行程项 ID
   * @param tripId 行程 ID
   */
  async calculateTravelInfoForItem(itemId: string, tripId: string) {
    // 获取该行程的所有天和行程项，按日期和时间排序
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) return;

    // 构建所有行程项的有序列表（跨天）
    const allItems: Array<{
      id: string;
      placeId: number | null;
      Place: any;
      startTime: Date | null;
      dayIndex: number;
    }> = [];

    trip.TripDay.forEach((day, dayIndex) => {
      day.ItineraryItem.forEach(item => {
        allItems.push({
          id: item.id,
          placeId: item.placeId,
          Place: item.Place,
          startTime: item.startTime,
          dayIndex,
        });
      });
    });

    // 按开始时间排序
    allItems.sort((a, b) => {
      if (!a.startTime || !b.startTime) return 0;
      return a.startTime.getTime() - b.startTime.getTime();
    });

    // 找到当前行程项的位置
    const currentIndex = allItems.findIndex(item => item.id === itemId);
    if (currentIndex <= 0) {
      // 是第一个行程项，没有前一个
      return;
    }

    const currentItem = allItems[currentIndex];
    const prevItem = allItems[currentIndex - 1];

    // 获取坐标
    let fromCoords = this.extractPlaceCoordinates(prevItem.Place);
    let toCoords = this.extractPlaceCoordinates(currentItem.Place);

    if (!fromCoords && prevItem.placeId) {
      fromCoords = await this.getPlaceCoordinates(prevItem.placeId);
    }
    if (!toCoords && currentItem.placeId) {
      toCoords = await this.getPlaceCoordinates(currentItem.placeId);
    }

    if (!fromCoords || !toCoords) {
      return; // 缺少坐标，无法计算
    }

    // 计算距离
    const straightDistance = this.calculateHaversineDistance(
      fromCoords.lat, fromCoords.lng,
      toCoords.lat, toCoords.lng
    );

    // 自动选择交通方式
    let travelMode: string;
    if (straightDistance < 1) {
      travelMode = 'WALKING';
    } else if (straightDistance < 50) {
      travelMode = 'DRIVING';
    } else {
      travelMode = 'DRIVING';
    }

    let duration: number | null = null;
    let distance: number | null = null;

    // 调用路线 API
    if (this.smartRoutesService && ['DRIVING', 'WALKING', 'TRANSIT'].includes(travelMode)) {
      try {
        const routes = await this.smartRoutesService.getRoutes(
          fromCoords.lat, fromCoords.lng,
          toCoords.lat, toCoords.lng,
          travelMode as 'DRIVING' | 'WALKING' | 'TRANSIT'
        );

        if (routes.length > 0) {
          duration = routes[0].durationMinutes;
          const routeData = routes[0] as any;
          if (routeData.distanceMeters) {
            distance = routeData.distanceMeters;
          } else if (routeData.distanceKm) {
            distance = Math.round(routeData.distanceKm * 1000);
          } else {
            distance = Math.round(straightDistance * 1000);
          }
        } else {
          distance = Math.round(straightDistance * 1000);
          duration = this.estimateDuration(straightDistance, travelMode);
        }
      } catch (e) {
        distance = Math.round(straightDistance * 1000);
        duration = this.estimateDuration(straightDistance, travelMode);
      }
    } else {
      distance = Math.round(straightDistance * 1000);
      duration = this.estimateDuration(straightDistance, travelMode);
    }

    // 保存到数据库
    await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        travelFromPreviousDuration: duration,
        travelFromPreviousDistance: distance,
        travelMode: travelMode,
      },
    });

    return {
      itemId,
      fromPlace: prevItem.Place?.nameCN || prevItem.Place?.nameEN || '未知',
      toPlace: currentItem.Place?.nameCN || currentItem.Place?.nameEN || '未知',
      duration,
      distance,
      travelMode,
      crossDay: currentItem.dayIndex !== prevItem.dayIndex,
    };
  }

  /**
   * 自动计算并保存整个行程所有行程项之间的交通信息（支持跨天）
   * 
   * @param tripId 行程 ID
   * @param defaultTravelMode 默认交通方式
   * @returns 计算结果
   */
  async calculateAllTravelInfo(
    tripId: string,
    defaultTravelMode: 'DRIVING' | 'WALKING' | 'TRANSIT' = 'DRIVING'
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`找不到行程 (ID: ${tripId})`);
    }

    // 构建所有行程项的有序列表
    const allItems: Array<{
      id: string;
      placeId: number | null;
      Place: any;
      startTime: Date | null;
      travelMode: string | null;
      dayIndex: number;
      dayDate: Date;
    }> = [];

    trip.TripDay.forEach((day, dayIndex) => {
      day.ItineraryItem.forEach(item => {
        allItems.push({
          id: item.id,
          placeId: item.placeId,
          Place: item.Place,
          startTime: item.startTime,
          travelMode: item.travelMode,
          dayIndex,
          dayDate: day.date,
        });
      });
    });

    // 按开始时间排序
    allItems.sort((a, b) => {
      if (!a.startTime || !b.startTime) return 0;
      return a.startTime.getTime() - b.startTime.getTime();
    });

    const results: Array<{
      itemId: string;
      fromPlace: string;
      toPlace: string;
      duration: number | null;
      distance: number | null;
      travelMode: string;
      crossDay: boolean;
      calculated: boolean;
      error?: string;
    }> = [];

    // 计算每个行程项与前一个的交通信息
    for (let i = 1; i < allItems.length; i++) {
      const fromItem = allItems[i - 1];
      const toItem = allItems[i];
      const crossDay = toItem.dayIndex !== fromItem.dayIndex;

      const resultEntry = {
        itemId: toItem.id,
        fromPlace: fromItem.Place?.nameCN || fromItem.Place?.nameEN || '未知地点',
        toPlace: toItem.Place?.nameCN || toItem.Place?.nameEN || '未知地点',
        duration: null as number | null,
        distance: null as number | null,
        travelMode: toItem.travelMode || defaultTravelMode,
        crossDay,
        calculated: false,
        error: undefined as string | undefined,
      };

      let fromCoords = this.extractPlaceCoordinates(fromItem.Place);
      let toCoords = this.extractPlaceCoordinates(toItem.Place);

      if (!fromCoords && fromItem.placeId) {
        fromCoords = await this.getPlaceCoordinates(fromItem.placeId);
      }
      if (!toCoords && toItem.placeId) {
        toCoords = await this.getPlaceCoordinates(toItem.placeId);
      }

      if (!fromCoords || !toCoords) {
        resultEntry.error = '缺少坐标信息';
        results.push(resultEntry);
        continue;
      }

      try {
        const straightDistance = this.calculateHaversineDistance(
          fromCoords.lat, fromCoords.lng,
          toCoords.lat, toCoords.lng
        );

        let travelMode = toItem.travelMode;
        if (!travelMode) {
          if (straightDistance < 1) {
            travelMode = 'WALKING';
          } else if (straightDistance < 50) {
            travelMode = 'DRIVING';
          } else {
            travelMode = 'DRIVING';
          }
        }

        let duration: number | null = null;
        let distance: number | null = null;

        if (this.smartRoutesService && ['DRIVING', 'WALKING', 'TRANSIT'].includes(travelMode)) {
          try {
            const routes = await this.smartRoutesService.getRoutes(
              fromCoords.lat, fromCoords.lng,
              toCoords.lat, toCoords.lng,
              travelMode as 'DRIVING' | 'WALKING' | 'TRANSIT'
            );

            if (routes.length > 0) {
              duration = routes[0].durationMinutes;
              const routeData = routes[0] as any;
              if (routeData.distanceMeters) {
                distance = routeData.distanceMeters;
              } else if (routeData.distanceKm) {
                distance = Math.round(routeData.distanceKm * 1000);
              } else {
                distance = Math.round(straightDistance * 1000);
              }
            } else {
              distance = Math.round(straightDistance * 1000);
              duration = this.estimateDuration(straightDistance, travelMode);
            }
          } catch (e) {
            distance = Math.round(straightDistance * 1000);
            duration = this.estimateDuration(straightDistance, travelMode);
          }
        } else {
          distance = Math.round(straightDistance * 1000);
          duration = this.estimateDuration(straightDistance, travelMode);
        }

        await this.prisma.itineraryItem.update({
          where: { id: toItem.id },
          data: {
            travelFromPreviousDuration: duration,
            travelFromPreviousDistance: distance,
            travelMode: travelMode,
          },
        });

        resultEntry.duration = duration;
        resultEntry.distance = distance;
        resultEntry.travelMode = travelMode;
        resultEntry.calculated = true;
        results.push(resultEntry);
      } catch (error) {
        resultEntry.error = error instanceof Error ? error.message : String(error);
        results.push(resultEntry);
      }
    }

    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalDistance = results.reduce((sum, r) => sum + (r.distance || 0), 0);
    const successCount = results.filter(r => r.calculated).length;
    const crossDayCount = results.filter(r => r.crossDay).length;

    return {
      tripId,
      totalDays: trip.TripDay.length,
      totalItems: allItems.length,
      calculatedCount: successCount,
      crossDaySegments: crossDayCount,
      results,
      summary: {
        totalDuration,
        totalDistance,
        successRate: allItems.length > 1 ? successCount / (allItems.length - 1) : 1,
      },
    };
  }

  /**
   * 自动计算并保存某天所有行程项之间的交通信息
   * 
   * @param tripId 行程 ID
   * @param dayId 行程日期 ID
   * @param defaultTravelMode 默认交通方式（用于无法自动判断时）
   * @returns 计算结果
   */
  async calculateAndSaveTravelInfo(
    tripId: string,
    dayId: string,
    defaultTravelMode: 'DRIVING' | 'WALKING' | 'TRANSIT' = 'DRIVING'
  ) {
    // 验证 TripDay 存在且属于该 Trip
    const tripDay = await this.prisma.tripDay.findFirst({
      where: {
        id: dayId,
        Trip: { id: tripId },
      },
      include: {
        ItineraryItem: {
          include: {
            Place: true,
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!tripDay) {
      throw new NotFoundException(`找不到指定的行程日期 (tripId: ${tripId}, dayId: ${dayId})`);
    }

    const items = tripDay.ItineraryItem;
    const results: Array<{
      itemId: string;
      fromPlace: string;
      toPlace: string;
      duration: number | null;
      distance: number | null;
      travelMode: string;
      calculated: boolean;
      error?: string;
    }> = [];

    // 计算相邻行程项之间的交通信息
    for (let i = 1; i < items.length; i++) {
      const fromItem = items[i - 1];
      const toItem = items[i];

      // 先尝试从 metadata 获取，再用 PostGIS 原始查询
      let fromCoords = this.extractPlaceCoordinates(fromItem.Place);
      let toCoords = this.extractPlaceCoordinates(toItem.Place);

      // 如果 metadata 没有坐标，使用原始 SQL 查询 PostGIS
      if (!fromCoords && fromItem.placeId) {
        fromCoords = await this.getPlaceCoordinates(fromItem.placeId);
      }
      if (!toCoords && toItem.placeId) {
        toCoords = await this.getPlaceCoordinates(toItem.placeId);
      }

      const resultEntry = {
        itemId: toItem.id,
        fromPlace: fromItem.Place?.nameCN || fromItem.Place?.nameEN || '未知地点',
        toPlace: toItem.Place?.nameCN || toItem.Place?.nameEN || '未知地点',
        duration: null as number | null,
        distance: null as number | null,
        travelMode: toItem.travelMode || defaultTravelMode,
        calculated: false,
        error: undefined as string | undefined,
      };

      if (!fromCoords || !toCoords) {
        resultEntry.error = '缺少坐标信息';
        results.push(resultEntry);
        continue;
      }

      try {
        // 计算直线距离
        const straightDistance = this.calculateHaversineDistance(
          fromCoords.lat, fromCoords.lng,
          toCoords.lat, toCoords.lng
        );

        // 根据距离自动选择交通方式（如果未指定）
        let travelMode = toItem.travelMode;
        if (!travelMode) {
          if (straightDistance < 1) {
            travelMode = 'WALKING';
          } else if (straightDistance < 50) {
            travelMode = 'DRIVING';
          } else {
            travelMode = 'DRIVING'; // 长距离默认驾车，飞机/高铁需要手动指定
          }
        }

        // 调用路线 API 计算实际距离和时间
        let duration: number | null = null;
        let distance: number | null = null;

        if (this.smartRoutesService && ['DRIVING', 'WALKING', 'TRANSIT'].includes(travelMode)) {
          try {
            const routes = await this.smartRoutesService.getRoutes(
              fromCoords.lat, fromCoords.lng,
              toCoords.lat, toCoords.lng,
              travelMode as 'DRIVING' | 'WALKING' | 'TRANSIT'
            );

            if (routes.length > 0) {
              duration = routes[0].durationMinutes;
              // 尝试获取距离
              const routeData = routes[0] as any;
              if (routeData.distanceMeters) {
                distance = routeData.distanceMeters;
              } else if (routeData.distanceKm) {
                distance = Math.round(routeData.distanceKm * 1000);
              } else {
                distance = Math.round(straightDistance * 1000);
              }
            } else {
              // API 返回空结果，使用估算
              distance = Math.round(straightDistance * 1000);
              duration = this.estimateDuration(straightDistance, travelMode);
            }
          } catch (routeError) {
            // API 调用失败，使用估算
            distance = Math.round(straightDistance * 1000);
            duration = this.estimateDuration(straightDistance, travelMode);
          }
        } else {
          // 对于飞机、高铁等，使用估算
          distance = Math.round(straightDistance * 1000);
          duration = this.estimateDuration(straightDistance, travelMode);
        }

        // 保存到数据库
        await this.prisma.itineraryItem.update({
          where: { id: toItem.id },
          data: {
            travelFromPreviousDuration: duration,
            travelFromPreviousDistance: distance,
            travelMode: travelMode,
          },
        });

        resultEntry.duration = duration;
        resultEntry.distance = distance;
        resultEntry.travelMode = travelMode;
        resultEntry.calculated = true;
        results.push(resultEntry);

      } catch (error) {
        resultEntry.error = error instanceof Error ? error.message : String(error);
        results.push(resultEntry);
      }
    }

    // 计算总计
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalDistance = results.reduce((sum, r) => sum + (r.distance || 0), 0);
    const successCount = results.filter(r => r.calculated).length;

    return {
      dayId,
      date: tripDay.date,
      itemCount: items.length,
      calculatedCount: successCount,
      results,
      summary: {
        totalDuration,
        totalDistance,
        successRate: items.length > 1 ? successCount / (items.length - 1) : 1,
      },
    };
  }

  /**
   * 根据距离和交通方式估算时间（分钟）
   */
  private estimateDuration(distanceKm: number, travelMode: string): number {
    switch (travelMode) {
      case 'WALKING':
        return Math.round(distanceKm / 5 * 60); // 5 km/h
      case 'BICYCLE':
        return Math.round(distanceKm / 15 * 60); // 15 km/h
      case 'DRIVING':
      case 'TAXI':
        return Math.round(distanceKm / 60 * 60); // 60 km/h (含堵车)
      case 'TRANSIT':
        return Math.round(distanceKm / 30 * 60); // 30 km/h (含换乘)
      case 'TRAIN':
        return Math.round(distanceKm / 250 * 60) + 60; // 250 km/h + 1小时候车
      case 'FLIGHT':
        return Math.round(distanceKm / 800 * 60) + 180; // 800 km/h + 3小时值机安检
      case 'FERRY':
        return Math.round(distanceKm / 30 * 60) + 30; // 30 km/h + 30分钟登船
      default:
        return Math.round(distanceKm / 50 * 60); // 默认 50 km/h
    }
  }

  /**
   * 获取某天所有行程项之间的交通信息
   */
  async getDayTravelInfo(tripId: string, dayId: string) {
    // 验证 TripDay 存在且属于该 Trip
    const tripDay = await this.prisma.tripDay.findFirst({
      where: {
        id: dayId,
        Trip: { id: tripId },
      },
      include: {
        ItineraryItem: {
          include: {
            Place: true,
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!tripDay) {
      throw new NotFoundException(`找不到指定的行程日期 (tripId: ${tripId}, dayId: ${dayId})`);
    }

    const items = tripDay.ItineraryItem;
    const travelSegments: Array<{
      fromItemId: string;
      toItemId: string;
      fromPlace: string;
      toPlace: string;
      duration: number | null;
      distance: number | null;
      travelMode: string | null;
    }> = [];

    // 计算相邻行程项之间的交通信息
    for (let i = 0; i < items.length - 1; i++) {
      const fromItem = items[i];
      const toItem = items[i + 1];

      // 先尝试从 metadata 获取，再用 PostGIS 原始查询
      let fromCoords = this.extractPlaceCoordinates(fromItem.Place);
      let toCoords = this.extractPlaceCoordinates(toItem.Place);

      // 如果 metadata 没有坐标，使用原始 SQL 查询 PostGIS
      if (!fromCoords && fromItem.placeId) {
        fromCoords = await this.getPlaceCoordinates(fromItem.placeId);
      }
      if (!toCoords && toItem.placeId) {
        toCoords = await this.getPlaceCoordinates(toItem.placeId);
      }

      let duration: number | null = toItem.travelFromPreviousDuration;
      let distance: number | null = toItem.travelFromPreviousDistance;
      let travelMode: string | null = toItem.travelMode;

      // 如果数据库没有存储，尝试计算
      if ((!duration || !distance) && fromCoords && toCoords) {
        const calculatedDistance = this.calculateHaversineDistance(
          fromCoords.lat, fromCoords.lng,
          toCoords.lat, toCoords.lng
        );
        distance = Math.round(calculatedDistance * 1000); // 转为米

        // 根据距离估算时间
        if (calculatedDistance < 2) {
          travelMode = 'WALKING';
          duration = Math.round(calculatedDistance / 5 * 60); // 步行 5km/h
        } else if (calculatedDistance < 50) {
          travelMode = 'DRIVING';
          duration = Math.round(calculatedDistance / 60 * 60); // 驾车 60km/h
        } else {
          travelMode = 'TRANSIT';
          duration = Math.round(calculatedDistance / 80 * 60); // 公交 80km/h
        }

        // 如果有 SmartRoutesService，使用更精确的计算
        if (this.smartRoutesService) {
          try {
            const routes = await this.smartRoutesService.getRoutes(
              fromCoords.lat, fromCoords.lng,
              toCoords.lat, toCoords.lng,
              travelMode as 'DRIVING' | 'WALKING' | 'TRANSIT'
            );
            if (routes.length > 0) {
              duration = routes[0].durationMinutes;
              // 使用 distanceMeters 如果存在，否则使用估算
              const routeData = routes[0] as any;
              if (routeData.distanceMeters) {
                distance = routeData.distanceMeters;
              } else if (routeData.distanceKm) {
                distance = Math.round(routeData.distanceKm * 1000);
              }
            }
          } catch (e) {
            // 使用估算值
          }
        }
      }

      travelSegments.push({
        fromItemId: fromItem.id,
        toItemId: toItem.id,
        fromPlace: fromItem.Place?.nameCN || fromItem.Place?.nameEN || '未知地点',
        toPlace: toItem.Place?.nameCN || toItem.Place?.nameEN || '未知地点',
        duration,
        distance,
        travelMode,
      });
    }

    // 计算总时间和距离
    const totalDuration = travelSegments.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalDistance = travelSegments.reduce((sum, s) => sum + (s.distance || 0), 0);

    return {
      dayId,
      date: tripDay.date,
      itemCount: items.length,
      segments: travelSegments,
      summary: {
        totalDuration, // 分钟
        totalDistance, // 米
        segmentCount: travelSegments.length,
      },
    };
  }

  // ========== 预订信息相关方法 ==========

  /**
   * 更新行程项的预订状态
   */
  async updateBookingStatus(
    id: string,
    bookingData: {
      bookingStatus?: 'BOOKED' | 'NEED_BOOKING' | 'NO_BOOKING';
      bookingConfirmation?: string;
      bookingUrl?: string;
      bookedAt?: string;
    }
  ) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${id})`);
    }

    return this.prisma.itineraryItem.update({
      where: { id },
      data: {
        bookingStatus: bookingData.bookingStatus,
        bookingConfirmation: bookingData.bookingConfirmation,
        bookingUrl: bookingData.bookingUrl,
        bookedAt: bookingData.bookedAt ? new Date(bookingData.bookedAt) : undefined,
      },
      include: {
        Place: true,
        TripDay: true,
      },
    });
  }

  /**
   * 修复行程项的日期一致性
   * 
   * 将行程项的 startTime/endTime 调整为与 TripDay.date 一致
   */
  async fixItemDateConsistency(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`找不到行程 (ID: ${tripId})`);
    }

    const fixes: Array<{
      itemId: string;
      placeName: string;
      oldStartTime: string;
      newStartTime: string;
      fixed: boolean;
    }> = [];

    for (const day of trip.TripDay) {
      const tripDayDate = DateTime.fromJSDate(day.date, { zone: 'utc' });
      
      for (const item of day.ItineraryItem) {
        if (!item.startTime) continue;
        
        const startDateTime = DateTime.fromJSDate(item.startTime, { zone: 'utc' });
        const startDateOnly = startDateTime.toFormat('yyyy-MM-dd');
        const tripDayDateOnly = tripDayDate.toFormat('yyyy-MM-dd');
        
        // 检查日期是否一致
        if (startDateOnly !== tripDayDateOnly) {
          // 保留原始的时间部分（小时、分钟），只修改日期
          const timeOfDay = startDateTime.toFormat('HH:mm:ss');
          const newStartTime = DateTime.fromFormat(
            `${tripDayDateOnly} ${timeOfDay}`,
            'yyyy-MM-dd HH:mm:ss',
            { zone: 'utc' }
          );
          
          // 计算时间差，用于调整 endTime
          const timeDiff = newStartTime.toMillis() - startDateTime.toMillis();
          
          let newEndTime: DateTime | null = null;
          if (item.endTime) {
            newEndTime = DateTime.fromJSDate(item.endTime, { zone: 'utc' }).plus({ milliseconds: timeDiff });
          }
          
          // 更新数据库
          await this.prisma.itineraryItem.update({
            where: { id: item.id },
            data: {
              startTime: newStartTime.toJSDate(),
              ...(newEndTime && { endTime: newEndTime.toJSDate() }),
            },
          });
          
          fixes.push({
            itemId: item.id,
            placeName: item.id, // 简化，实际可以关联 Place
            oldStartTime: startDateTime.toISO() || '',
            newStartTime: newStartTime.toISO() || '',
            fixed: true,
          });
        }
      }
    }

    return {
      tripId,
      totalDays: trip.TripDay.length,
      fixedCount: fixes.length,
      fixes,
    };
  }

  /**
   * 更新行程项的交通信息
   */
  async updateTravelInfo(
    id: string,
    travelData: {
      travelFromPreviousDuration?: number;
      travelFromPreviousDistance?: number;
      travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT' | 'FLIGHT' | 'TRAIN' | 'FERRY' | 'BICYCLE' | 'TAXI';
    }
  ) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${id})`);
    }

    return this.prisma.itineraryItem.update({
      where: { id },
      data: {
        travelFromPreviousDuration: travelData.travelFromPreviousDuration,
        travelFromPreviousDistance: travelData.travelFromPreviousDistance,
        travelMode: travelData.travelMode,
      },
      include: {
        Place: true,
        TripDay: true,
      },
    });
  }
}
