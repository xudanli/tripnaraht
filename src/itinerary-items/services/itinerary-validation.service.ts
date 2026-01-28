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
import { TimeOverlapValidator } from '../validators/time-overlap.validator';
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
    private readonly timeOverlapValidator: TimeOverlapValidator,
    private readonly travelTimeValidator: TravelTimeValidator,
    private readonly bufferTimeValidator: BufferTimeValidator
  ) {
    // 按优先级排序校验器（ERROR > WARNING > INFO）
    this.validators = [
      this.timeOverlapValidator,
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
    dto: Partial<CreateItineraryItemDto>
  ): Promise<AggregatedValidationResult & { cascadeImpact?: CascadeImpact }> {
    // 获取现有行程项
    const existingItem = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        Place: true,
        TripDay: {
          include: {
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

    // 合并现有数据和更新数据
    const mergedDto: CreateItineraryItemDto = {
      tripDayId: existingItem.tripDayId,
      placeId: dto.placeId ?? existingItem.placeId ?? undefined,
      type: (dto.type ?? existingItem.type) as any,
      startTime: dto.startTime ?? existingItem.startTime.toISOString(),
      endTime: dto.endTime ?? existingItem.endTime.toISOString(),
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

    // 检测级联影响
    const cascadeImpact = this.detectCascadeImpact(
      existingItem,
      dto,
      existingItem.TripDay
    );

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
            startTime: item.startTime,
            endTime: item.endTime,
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

    // 检查后续行程项是否受影响
    for (let i = currentIndex + 1; i < items.length; i++) {
      const nextItem = items[i];
      const nextStart = DateTime.fromJSDate(nextItem.startTime);
      const nextEnd = DateTime.fromJSDate(nextItem.endTime);
      const newEnd = DateTime.fromJSDate(newEndTime);

      // 如果新结束时间晚于下一项开始时间
      if (newEnd > nextStart) {
        const delay = newEnd.diff(nextStart, 'minutes').minutes;
        const suggestedStart = newEnd.plus({ minutes: 15 });
        const duration = nextEnd.diff(nextStart, 'minutes').minutes;
        const suggestedEnd = suggestedStart.plus({ minutes: duration });
        const totalDelayMinutes = Math.ceil(delay + 15);

        affectedItems.push({
          id: nextItem.id,
          name: nextItem.Place?.nameCN || nextItem.Place?.nameEN || '未知活动',
          // 兼容旧格式
          originalTime: `${nextStart.toFormat('HH:mm')}-${nextEnd.toFormat('HH:mm')}`,
          suggestedTime: `${suggestedStart.toFormat('HH:mm')}-${suggestedEnd.toFormat('HH:mm')}`,
          delayMinutes: totalDelayMinutes,
          // 🆕 新增结构化字段
          originalTimeRange: {
            start: nextStart.toFormat('HH:mm'),
            end: nextEnd.toFormat('HH:mm'),
          },
          adjustedTimeRange: {
            start: suggestedStart.toFormat('HH:mm'),
            end: suggestedEnd.toFormat('HH:mm'),
          },
          timeDelta: this.formatTimeDelta(totalDelayMinutes),
        });
      } else {
        // 如果这个不受影响，后面的也不会受影响
        break;
      }
    }

    if (affectedItems.length === 0) {
      return undefined;
    }

    // 生成调整说明
    const totalDelay = affectedItems.reduce((sum, item) => sum + item.delayMinutes, 0);
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
