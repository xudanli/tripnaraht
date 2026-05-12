// src/itinerary-items/services/itinerary-validation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { 
  ValidationContext, 
  AggregatedValidationResult,
  ValidationResult,
  ValidationSeverity,
  TravelInfo,
  CascadeImpact,
  CascadeImpactItem,
  BatchValidationResult,
  BatchValidationItem,
  ContextItem
} from '../interfaces/validation.interface';
import { CreateItineraryItemDto } from '../dto/create-itinerary-item.dto';
import { TravelTimeValidator } from '../validators/travel-time.validator';
import { BufferTimeValidator } from '../validators/buffer-time.validator';
import { DateTime } from 'luxon';

/**
 * 行程项校验服务
 * 
 * 负责协调所有校验器，执行创建/更新/批量校验
 */
@Injectable()
export class ItineraryValidationService {
  private readonly logger = new Logger(ItineraryValidationService.name);
  private readonly validators;

  constructor(
    private readonly prisma: PrismaService,
    private readonly travelTimeValidator: TravelTimeValidator,
    private readonly bufferTimeValidator: BufferTimeValidator
  ) {
    // 按优先级排序校验器（ERROR > WARNING > INFO）
    // 注：时间冲突校验已移除，允许创建时间重叠的行程项
    this.validators = [
      this.travelTimeValidator,
      this.bufferTimeValidator,
    ];
  }

  /**
   * 校验创建请求
   */
  async validateCreate(
    dto: CreateItineraryItemDto
  ): Promise<AggregatedValidationResult> {
    try {
      // 构建校验上下文
      const context = await this.buildContext(dto);

      // 执行所有校验
      const results: ValidationResult[] = [];
      let travelInfo: TravelInfo | undefined;

      for (const validator of this.validators) {
        try {
          const result = await validator.validate(context);
          if (result) {
            results.push(result);
            
            // 提取交通信息
            if (result.details?.distance) {
              travelInfo = {
                fromPlace: result.details.fromPlace?.name,
                toPlace: result.details.toPlace?.name,
                straightDistance: result.details.distance.straight,
                roadDistance: result.details.distance.road,
                estimatedDuration: result.details.travelTime?.estimated || 0,
                recommendedTransport: result.details.recommendedTransport,
                availableTime: result.details.availableTime || 0,
              };
            }
          }
        } catch (error) {
          this.logger.error(`校验器 ${validator.getCode()} 执行失败:`, error);
        }
      }

      return this.aggregateResults(results, travelInfo);
    } catch (error) {
      this.logger.error('校验失败:', error);
      return {
        canProceed: false,
        requiresConfirmation: false,
        errors: [{
          valid: false,
          severity: ValidationSeverity.ERROR,
          code: 'NOT_FOUND' as any,
          message: error instanceof Error ? error.message : '校验过程发生错误',
          details: {},
        }],
        warnings: [],
        infos: [],
      };
    }
  }

  /**
   * 校验更新请求
   */
  async validateUpdate(
    itemId: string,
    dto: Partial<CreateItineraryItemDto>,
    options?: { detectCascadeImpact?: boolean }
  ): Promise<AggregatedValidationResult & { cascadeImpact?: CascadeImpact }> {
    const { detectCascadeImpact = true } = options || {};
    // 获取现有行程项
    const existingItem = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        Place: true,
        TripDay: {
          include: {
            Trip: true, // 需要获取 tripId 来查找新的 TripDay
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
            },
          },
        },
      },
    });

    if (!existingItem) {
      return {
        canProceed: false,
        requiresConfirmation: false,
        errors: [{
          valid: false,
          severity: ValidationSeverity.ERROR,
          code: 'NOT_FOUND' as any,
          message: '找不到指定的行程项',
          details: { itemId },
        }],
        warnings: [],
        infos: [],
      };
    }

    // 确定目标 tripDayId：如果明确提供则使用，否则根据 startTime 查找
    let targetTripDayId = dto.tripDayId;
    let targetTripDay: any = existingItem.TripDay;

    if (dto.startTime && !targetTripDayId) {
      // 如果更新了 startTime 但未提供 tripDayId，根据新的 startTime 找到对应的 TripDay
      const startDate = DateTime.fromJSDate(new Date(dto.startTime), { zone: 'utc' });
      const dayStart = startDate.startOf('day').toJSDate();
      const dayEnd = startDate.endOf('day').toJSDate();

      const tripId = existingItem.TripDay.Trip?.id;
      if (tripId) {
        const newTripDay = await this.prisma.tripDay.findFirst({
          where: {
            tripId,
            date: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
          include: {
            Trip: true,
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
            },
          },
        });

        if (newTripDay) {
          targetTripDayId = newTripDay.id;
          targetTripDay = newTripDay;
        }
      }
    } else if (targetTripDayId && targetTripDayId !== existingItem.tripDayId) {
      // 如果明确提供了不同的 tripDayId，获取新的 TripDay
      const newTripDay = await this.prisma.tripDay.findUnique({
        where: { id: targetTripDayId },
        include: {
          Trip: true,
          ItineraryItem: {
            include: { Place: true },
            orderBy: { startTime: 'asc' },
          },
        },
      });

      if (newTripDay) {
        targetTripDay = newTripDay;
      }
    }

    // 合并现有数据和更新数据
    const mergedDto: CreateItineraryItemDto = {
      tripDayId: targetTripDayId ?? existingItem.tripDayId,
      placeId: dto.placeId ?? existingItem.placeId ?? undefined,
      type: (dto.type ?? existingItem.type) as any,
      startTime: dto.startTime ?? existingItem.startTime?.toISOString() ?? '',
      endTime: dto.endTime ?? existingItem.endTime?.toISOString() ?? '',
    };

    // 执行基本校验（排除当前项）
    const context = await this.buildContextForUpdate(mergedDto, itemId);
    const results: ValidationResult[] = [];
    let travelInfo: TravelInfo | undefined;

    for (const validator of this.validators) {
      try {
        const result = await validator.validate(context);
        if (result) {
          results.push(result);
          if (result.details?.distance) {
            travelInfo = {
              fromPlace: result.details.fromPlace?.name,
              toPlace: result.details.toPlace?.name,
              straightDistance: result.details.distance.straight,
              roadDistance: result.details.distance.road,
              estimatedDuration: result.details.travelTime?.estimated || 0,
              recommendedTransport: result.details.recommendedTransport,
              availableTime: result.details.availableTime || 0,
            };
          }
        }
      } catch (error) {
        this.logger.error(`校验器 ${validator.getCode()} 执行失败:`, error);
      }
    }

    const basicResult = this.aggregateResults(results, travelInfo);

    // 检测级联影响（如果启用）- 使用目标 TripDay
    const cascadeImpact = detectCascadeImpact
      ? this.detectCascadeImpact(
          existingItem,
          dto,
          targetTripDay
        )
      : undefined;

    return {
      ...basicResult,
      cascadeImpact,
    };
  }

  /**
   * 批量校验行程
   */
  async validateBatch(
    tripId: string,
    dates?: string[]
  ): Promise<BatchValidationResult> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          where: dates?.length ? {
            date: {
              in: dates.map(d => new Date(d)),
            },
          } : undefined,
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
      return {
        valid: false,
        tripId,
        errors: [],
        warnings: [],
        summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
      };
    }

    const allErrors: BatchValidationItem[] = [];
    const allWarnings: BatchValidationItem[] = [];

    for (const day of trip.TripDay) {
      const items = day.ItineraryItem;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prevItem = i > 0 ? items[i - 1] : undefined;

        // 构建简化上下文
        const context: ValidationContext = {
          tripDayId: day.id,
          tripDayDate: day.date,
          newItem: {
            placeId: item.placeId ?? undefined,
            startTime: item.startTime ?? day.date,
            endTime: item.endTime ?? day.date,
            type: item.type,
          },
          newItemPlace: item.Place ? {
            id: item.Place.id,
            name: item.Place.nameCN || item.Place.nameEN || '',
            coordinates: this.extractCoordinates(item.Place),
            metadata: item.Place.metadata,
          } : undefined,
          existingItems: items.filter(it => it.id !== item.id).map(it => this.toContextItem(it)),
          previousItem: prevItem ? this.toContextItem(prevItem) : undefined,
        };

        // 执行校验
        for (const validator of this.validators) {
          try {
            const result = await validator.validate(context);
            if (result && !result.valid) {
              const batchItem: BatchValidationItem = {
                day: DateTime.fromJSDate(day.date).toISODate() || '',
                itemIds: [item.id],
                type: result.code,
                message: result.message,
                severity: result.severity,
              };

              if (result.severity === ValidationSeverity.ERROR) {
                allErrors.push(batchItem);
              } else if (result.severity === ValidationSeverity.WARNING) {
                allWarnings.push(batchItem);
              }
            }
          } catch (error) {
            this.logger.error(`批量校验失败: ${error}`);
          }
        }
      }
    }

    return {
      valid: allErrors.length === 0,
      tripId,
      errors: allErrors,
      warnings: allWarnings,
      summary: {
        errorCount: allErrors.length,
        warningCount: allWarnings.length,
        infoCount: 0,
      },
    };
  }

  /**
   * 构建校验上下文
   */
  private async buildContext(dto: CreateItineraryItemDto): Promise<ValidationContext> {
    // 获取 TripDay 及其现有行程项
    const tripDay = await this.prisma.tripDay.findUnique({
      where: { id: dto.tripDayId },
      include: {
        ItineraryItem: {
          include: { Place: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!tripDay) {
      throw new Error(`TripDay ${dto.tripDayId} 不存在`);
    }

    // 获取新行程项的地点信息
    let newItemPlace: ValidationContext['newItemPlace'];
    if (dto.placeId) {
      const place = await this.prisma.place.findUnique({
        where: { id: dto.placeId },
      });
      if (place) {
        newItemPlace = {
          id: place.id,
          name: place.nameCN || place.nameEN || '',
          coordinates: this.extractCoordinates(place),
          metadata: place.metadata as any,
        };
      }
    }

    // 转换现有行程项
    const existingItems = tripDay.ItineraryItem.map(item => this.toContextItem(item));

    // 确定新项的前序和后序
    const newStart = new Date(dto.startTime);
    const newEnd = new Date(dto.endTime);
    let previousItem: ContextItem | undefined;
    let nextItem: ContextItem | undefined;

    for (let i = 0; i < existingItems.length; i++) {
      if (existingItems[i].endTime <= newStart) {
        previousItem = existingItems[i];
      }
      if (existingItems[i].startTime >= newEnd && !nextItem) {
        nextItem = existingItems[i];
      }
    }

    return {
      tripDayId: dto.tripDayId,
      tripDayDate: tripDay.date,
      newItem: {
        placeId: dto.placeId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        type: dto.type,
      },
      newItemPlace,
      existingItems,
      previousItem,
      nextItem,
    };
  }

  /**
   * 为更新操作构建校验上下文（排除当前项）
   */
  private async buildContextForUpdate(
    dto: CreateItineraryItemDto,
    excludeItemId: string
  ): Promise<ValidationContext> {
    const context = await this.buildContext(dto);
    
    // 排除当前正在更新的项
    context.existingItems = context.existingItems.filter(
      item => item.id !== excludeItemId
    );

    // 重新计算前序和后序
    const newStart = new Date(dto.startTime);
    const newEnd = new Date(dto.endTime);
    context.previousItem = undefined;
    context.nextItem = undefined;

    for (const item of context.existingItems) {
      if (item.endTime <= newStart) {
        context.previousItem = item;
      }
      if (item.startTime >= newEnd && !context.nextItem) {
        context.nextItem = item;
      }
    }

    return context;
  }

  /**
   * 转换为上下文行程项
   */
  private toContextItem(item: any): ContextItem {
    return {
      id: item.id,
      placeId: item.placeId ?? undefined,
      startTime: item.startTime,
      endTime: item.endTime,
      type: item.type,
      place: item.Place ? {
        id: item.Place.id,
        name: item.Place.nameCN || item.Place.nameEN || '',
        coordinates: this.extractCoordinates(item.Place),
      } : undefined,
    };
  }

  /**
   * 聚合校验结果
   */
  private aggregateResults(
    results: ValidationResult[],
    travelInfo?: TravelInfo
  ): AggregatedValidationResult {
    const errors = results.filter(r => r.severity === ValidationSeverity.ERROR);
    const warnings = results.filter(r => r.severity === ValidationSeverity.WARNING);
    const infos = results.filter(r => r.severity === ValidationSeverity.INFO);

    return {
      canProceed: errors.length === 0,
      requiresConfirmation: warnings.length > 0,
      errors,
      warnings,
      infos,
      travelInfo,
    };
  }

  /**
   * 检测级联影响
   */
  private detectCascadeImpact(
    existingItem: any,
    dto: Partial<CreateItineraryItemDto>,
    tripDay: any
  ): CascadeImpact | undefined {
    if (!dto.startTime && !dto.endTime) {
      return undefined;
    }

    const items = tripDay.ItineraryItem;
    const currentIndex = items.findIndex((i: any) => i.id === existingItem.id);
    
    if (currentIndex < 0 || currentIndex >= items.length - 1) {
      return undefined;
    }

    const newEndTime = dto.endTime 
      ? new Date(dto.endTime) 
      : existingItem.endTime;

    const affectedItems: CascadeImpactItem[] = [];

    // 追踪累积的时间偏移（与执行阶段逻辑一致）
    let currentEndTime = DateTime.fromJSDate(newEndTime);
    let prevLocation = this.extractCoordinates(existingItem.Place);

    // 检查后续行程项是否受影响
    for (let i = currentIndex + 1; i < items.length; i++) {
      const nextItem = items[i];
      const nextStart = DateTime.fromJSDate(nextItem.startTime);
      const nextEnd = DateTime.fromJSDate(nextItem.endTime);
      const duration = nextEnd.diff(nextStart, 'minutes').minutes;

      // 获取下一个行程项的位置
      const nextLocation = this.extractCoordinates(nextItem.Place);
      
      // 🆕 计算旅行时间（与执行阶段逻辑一致）
      let travelTimeMinutes = 15; // 默认 15 分钟缓冲
      if (prevLocation && nextLocation) {
        const distance = this.calculateHaversineDistance(
          prevLocation.lat, prevLocation.lng,
          nextLocation.lat, nextLocation.lng
        );
        // 根据距离估算旅行时间（与执行阶段使用相同的逻辑）
        travelTimeMinutes = this.estimateTravelTime(distance);
      }

      // 计算建议的开始时间
      const suggestedStart = currentEndTime.plus({ minutes: travelTimeMinutes });
      
      // 只有当建议开始时间晚于原开始时间时，才算受影响
      if (suggestedStart > nextStart) {
        const suggestedEnd = suggestedStart.plus({ minutes: duration });
        const delayMinutes = Math.ceil(suggestedStart.diff(nextStart, 'minutes').minutes);

        affectedItems.push({
          id: nextItem.id,
          name: nextItem.Place?.nameCN || nextItem.Place?.nameEN || '未知活动',
          // 兼容旧格式
          originalTime: `${nextStart.toFormat('HH:mm')}-${nextEnd.toFormat('HH:mm')}`,
          suggestedTime: `${suggestedStart.toFormat('HH:mm')}-${suggestedEnd.toFormat('HH:mm')}`,
          delayMinutes,
          // 🆕 新增结构化字段
          originalTimeRange: {
            start: nextStart.toFormat('HH:mm'),
            end: nextEnd.toFormat('HH:mm'),
          },
          adjustedTimeRange: {
            start: suggestedStart.toFormat('HH:mm'),
            end: suggestedEnd.toFormat('HH:mm'),
          },
          timeDelta: this.formatTimeDelta(delayMinutes),
        });

        // 更新累积时间，继续检查后续项
        currentEndTime = suggestedEnd;
        prevLocation = nextLocation;
      } else {
        // 如果这个不受影响，后面的可能仍受影响（因为时间链式传递）
        // 但如果原时间已经足够，就不需要调整
        currentEndTime = nextEnd;
        prevLocation = nextLocation;
      }
    }

    if (affectedItems.length === 0) {
      return undefined;
    }

    // 生成调整说明
    const adjustmentSummary = affectedItems.length === 1
      ? `「${affectedItems[0].name}」将顺延${this.formatTimeDelta(affectedItems[0].delayMinutes)}`
      : `${affectedItems.length}个活动将顺延，最大延迟${this.formatTimeDelta(Math.max(...affectedItems.map(i => i.delayMinutes)))}`;

    return {
      affectedCount: affectedItems.length,
      affectedItems,
      autoAdjusted: false,
      autoAdjust: true,  // 确认后会自动调整
      adjustmentSummary,
    };
  }

  /**
   * 🆕 估算旅行时间（与执行阶段逻辑一致）
   */
  private estimateTravelTime(distanceKm: number): number {
    const bufferMinutes = 15;
    
    if (distanceKm < 2) {
      // 步行：约 12 分钟/km
      return Math.ceil(distanceKm * 12) + bufferMinutes;
    } else if (distanceKm < 50) {
      // 驾车：约 2 分钟/km（考虑市区交通）
      return Math.ceil(distanceKm * 2) + bufferMinutes;
    } else {
      // 长途：约 1 分钟/km
      return Math.ceil(distanceKm * 1) + bufferMinutes;
    }
  }

  /**
   * 🆕 计算两点间的距离（Haversine 公式）
   */
  private calculateHaversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * 🆕 格式化时间差
   */
  private formatTimeDelta(minutes: number): string {
    if (minutes < 60) {
      return `+${minutes}分钟`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `+${hours}小时`;
    }
    return `+${hours}小时${mins}分钟`;
  }

  /**
   * 从 Place 提取坐标
   */
  private extractCoordinates(place: any): { lat: number; lng: number } | undefined {
    if (!place) return undefined;

    const metadata = place.metadata as any;
    if (metadata?.lat && metadata?.lng) {
      return { lat: metadata.lat, lng: metadata.lng };
    }
    if (metadata?.coordinates && Array.isArray(metadata.coordinates)) {
      return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
    }

    // 尝试从 location 字段解析
    if (place.location) {
      if (typeof place.location === 'string') {
        const match = place.location.match(/POINT\(([^)]+)\)/);
        if (match) {
          const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
          return { lat, lng };
        }
      }
    }

    return undefined;
  }
}
