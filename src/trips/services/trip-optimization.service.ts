// src/trips/services/trip-optimization.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { ApplyOptimizationRequestDto, ApplyOptimizationResponseDto, ChangePreviewDto } from '../dto/trip-optimization.dto';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { randomUUID } from 'crypto';

@Injectable()
export class TripOptimizationService {
  private readonly logger = new Logger(TripOptimizationService.name);

  constructor(
    private prisma: PrismaService,
    private itineraryItemsService: ItineraryItemsService
  ) {}

  /**
   * 应用优化结果到行程
   */
  async applyOptimization(
    tripId: string,
    dto: ApplyOptimizationRequestDto
  ): Promise<ApplyOptimizationResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
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

    const options = dto.options || {};
    const dryRun = options.dryRun || false;
    const replaceExisting = options.replaceExisting !== false;
    const preserveManualEdits = options.preserveManualEdits !== false;
    const targetDayId = options.dayId;

    const result = dto.result;
    
    // 验证 result 对象（DTO 验证应该已经处理，这里作为双重检查）
    if (result === null || result === undefined) {
      this.logger.warn('优化结果数据为空', { tripId, dto: { ...dto, result: 'null/undefined' } });
      throw new BadRequestException('优化结果数据不能为空。请确保请求体中包含 result 字段，且 result 不为 null 或 undefined。');
    }
    
    // 验证 result 是对象
    if (typeof result !== 'object' || Array.isArray(result)) {
      this.logger.warn('优化结果数据格式不正确', { tripId, resultType: typeof result });
      throw new BadRequestException('优化结果数据必须是对象类型。');
    }
    
    // 处理 route 字段：支持多种格式
    let route: any[] = [];
    
    if (result.route) {
      // 如果 route 是数组，直接使用
      if (Array.isArray(result.route)) {
        route = result.route;
      } else if (result.route.nodes && Array.isArray(result.route.nodes)) {
        // 如果 route 是对象，包含 nodes 数组（RouteSolution 格式）
        route = result.route.nodes;
      } else {
        this.logger.warn('result.route 格式不正确，期望数组或包含 nodes 的对象');
        route = [];
      }
    }
    
    // 如果 route 为空数组，返回空结果（这是合法的，表示没有优化结果）
    if (route.length === 0) {
      this.logger.log('优化结果 route 为空，返回空结果');
      return {
        success: true,
        appliedItems: 0,
        modifiedDays: [],
        preview: dryRun ? [] : undefined,
      };
    }
    
    const timeline = result.timeline || [];

    // 检查 route 中的节点格式，判断是否需要从 trip 日期推断
    const hasRouteNodeFormat = route.length > 0 && route.some(node => 
      (node.start_service || node.arrival) && !node.startTime
    );
    
    // 如果所有节点都是 RouteNode 格式（只有 HH:mm），需要从 trip 日期推断
    // 通常单日优化结果都属于同一天，使用 trip 的起始日期
    let defaultDate: string | undefined;
    if (hasRouteNodeFormat && trip.startDate && trip.endDate) {
      // 使用 trip 的起始日期作为默认日期
      const tripStartDate = DateTime.fromJSDate(trip.startDate).toISODate();
      defaultDate = tripStartDate || undefined;
      this.logger.debug(`检测到 RouteNode 格式，使用默认日期: ${defaultDate}`);
    }

    // 按日期分组优化结果
    const dayGroups = new Map<string, any[]>();
    
    for (const node of route) {
      // 支持多种时间字段格式
      let startTimeStr: string | undefined;
      let nodeDate: string | undefined;
      
      // 尝试不同的时间字段
      if (node.startTime) {
        // 标准格式：ISO 8601 完整日期时间
        startTimeStr = node.startTime;
      } else if (node.start_service) {
        // RouteNode 格式：start_service 是 "HH:mm"
        if (!defaultDate) {
          this.logger.warn(`节点 ${node.node_id || node.id} 使用 start_service 格式，但无法确定日期，跳过`);
          continue;
        }
        nodeDate = defaultDate;
        // 构建完整的 ISO 8601 时间字符串
        const [hours, minutes] = node.start_service.split(':').map(Number);
        const dateTime = DateTime.fromISO(defaultDate).set({ 
          hour: hours || 9, 
          minute: minutes || 0 
        });
        startTimeStr = dateTime.toISO() || undefined;
        if (!startTimeStr) {
          this.logger.warn(`无法构建完整时间: ${defaultDate} ${node.start_service}`);
          continue;
        }
      } else if (node.arrival) {
        // RouteNode 格式：arrival 是 "HH:mm"
        if (!defaultDate) {
          this.logger.warn(`节点 ${node.node_id || node.id} 使用 arrival 格式，但无法确定日期，跳过`);
          continue;
        }
        nodeDate = defaultDate;
        // 构建完整的 ISO 8601 时间字符串
        const [hours, minutes] = node.arrival.split(':').map(Number);
        const dateTime = DateTime.fromISO(defaultDate).set({ 
          hour: hours || 9, 
          minute: minutes || 0 
        });
        startTimeStr = dateTime.toISO() || undefined;
        if (!startTimeStr) {
          this.logger.warn(`无法构建完整时间: ${defaultDate} ${node.arrival}`);
          continue;
        }
      }
      
      if (!startTimeStr) {
        this.logger.warn(`节点 ${node.node_id || node.id || 'unknown'} 缺少时间信息，跳过`);
        continue;
      }
      
      try {
        const startTime = DateTime.fromISO(startTimeStr);
        if (!startTime.isValid) {
          this.logger.warn(`节点时间格式无效: ${startTimeStr}`);
          continue;
        }
        
        // 如果已经确定了日期（RouteNode 格式），使用该日期；否则从时间中提取
        const date = nodeDate || startTime.toISODate() || '';
        if (!date) {
          this.logger.warn(`无法从时间 ${startTimeStr} 提取日期`);
          continue;
        }
      
      if (!dayGroups.has(date)) {
        dayGroups.set(date, []);
      }
      dayGroups.get(date)!.push(node);
      } catch (error: any) {
        this.logger.warn(`解析节点时间失败: ${startTimeStr}`, error.message);
        continue;
      }
    }

    const changes: ChangePreviewDto[] = [];
    const modifiedDays: string[] = [];
    const skipped: { placeId: number; reason: string }[] = [];
    let appliedItems = 0;

    // 若指定了 dayId，仅处理该日的日期
    const targetDayDate =
      targetDayId &&
      trip.TripDay.find((d) => d.id === targetDayId) &&
      DateTime.fromJSDate(trip.TripDay.find((d) => d.id === targetDayId)!.date).toISODate();

    // 处理每个日期
    for (const [date, nodes] of dayGroups.entries()) {
      if (targetDayId && date !== targetDayDate) continue;

      // 查找或创建 TripDay
      let tripDay = trip.TripDay.find(day => {
        const dayDate = DateTime.fromJSDate(day.date).toISODate();
        return dayDate === date;
      });

      if (!tripDay) {
        if (dryRun) {
          // 预览模式下，创建虚拟的 TripDay
          tripDay = {
            id: randomUUID(),
            date: DateTime.fromISO(date).toJSDate(),
            tripId,
            ItineraryItem: [],
          } as any;
        } else {
          // 实际创建 TripDay
          tripDay = await this.prisma.tripDay.create({
            data: {
              id: randomUUID(),
              date: DateTime.fromISO(date).toJSDate(),
              tripId,
            } as any,
            include: {
              ItineraryItem: true,
            },
          }) as any;
        }
      }

      // 获取现有行程项
      const existingItems = tripDay.ItineraryItem || [];
      
      // 计算变更
      const added: any[] = [];
      const removed: any[] = [];
      const modified: any[] = [];

      if (replaceExisting) {
        // 标记需要删除的项（除非 preserveManualEdits 为 true）
        for (const item of existingItems) {
          if (preserveManualEdits && (item as any).isManualEdit) {
            // 保留手动编辑的项
            continue;
          }
          removed.push(item);
        }

        // 添加新的项
        for (const node of nodes) {
          added.push(node);
        }
      } else {
        // 合并模式：只添加新项，不删除现有项
        for (const node of nodes) {
          // 提取节点 ID（支持多种格式）
          const nodePlaceId = node.placeId ?? node.node_id ?? node.id;
          if (!nodePlaceId) {
            this.logger.warn('节点缺少 ID 字段，跳过', JSON.stringify(node));
            continue;
          }
          
          // 检查是否已存在类似项（通过 placeId 匹配）
          const existing = existingItems.find((item: any) => 
            item.placeId === nodePlaceId
          );
          
          if (existing) {
            modified.push({ existing, new: node });
          } else {
            added.push(node);
          }
        }
      }

      const skipped: { placeId: number; reason: string }[] = [];

      if (dryRun) {
        // 预览模式：只返回变更预览
        changes.push({
          dayId: tripDay.id,
          date,
          added: added.length,
          removed: removed.length,
          modified: modified.length,
        });
      } else {
        // 实际应用变更
        // 删除项
        for (const item of removed) {
          await this.itineraryItemsService.remove(item.id);
        }

        // 修改项
        for (const change of modified) {
          const newNode = change.new;
          let startTime: string | undefined;
          let endTime: string | undefined;
          
          // 提取 startTime
          if (newNode.startTime) {
            startTime = newNode.startTime;
          } else if (newNode.start_service) {
            // RouteNode 格式：需要将 "HH:mm" 转换为完整日期时间
            const dayDate = DateTime.fromJSDate(tripDay.date);
            const [hours, minutes] = newNode.start_service.split(':').map(Number);
            const fullDateTime = dayDate.set({ hour: hours || 9, minute: minutes || 0 });
            startTime = fullDateTime.toISO() || undefined;
          }
          
          // 提取 endTime
          if (newNode.endTime) {
            endTime = newNode.endTime;
          } else if (newNode.end_service) {
            // RouteNode 格式：需要将 "HH:mm" 转换为完整日期时间
            const dayDate = DateTime.fromJSDate(tripDay.date);
            const [hours, minutes] = newNode.end_service.split(':').map(Number);
            const fullDateTime = dayDate.set({ hour: hours || 11, minute: minutes || 0 });
            endTime = fullDateTime.toISO() || undefined;
          }
          
          if (!startTime) {
            this.logger.warn(`修改项缺少时间信息，跳过`, JSON.stringify(newNode));
            continue;
          }
          
          try {
          await this.itineraryItemsService.update(change.existing.id, {
              startTime,
              endTime,
            });
          } catch (error: any) {
            this.logger.error(`更新行程项失败 (id: ${change.existing.id})`, error.message);
            // 继续处理其他项
          }
        }

        // 添加项
        for (const node of added) {
          // 支持多种节点格式
          // 1. 标准格式：{ placeId, startTime, endTime, type, note }
          // 2. RouteNode 格式：{ node_id, start_service, end_service }
          // 3. PlaceNode + schedule 格式：需要从 schedule 中获取时间
          
          let placeId: number;
          let startTime: string;
          let endTime: string | undefined;
          let type: string = 'ACTIVITY';
          let note: string | undefined;
          
          // 提取 placeId
          if (node.placeId !== undefined) {
            placeId = node.placeId;
          } else if (node.node_id !== undefined) {
            placeId = node.node_id;
          } else if (node.id !== undefined) {
            placeId = node.id;
          } else {
            this.logger.warn('节点缺少 placeId/node_id/id 字段，跳过', JSON.stringify(node));
            continue;
          }
          
          // 提取 startTime
          if (node.startTime) {
            startTime = node.startTime;
          } else if (node.start_service) {
            // RouteNode 格式：需要将 "HH:mm" 转换为完整日期时间
            const dayDate = DateTime.fromJSDate(tripDay.date);
            const [hours, minutes] = node.start_service.split(':').map(Number);
            const fullDateTime = dayDate.set({ hour: hours || 9, minute: minutes || 0 });
            startTime = fullDateTime.toISO() || '';
            if (!startTime) {
              this.logger.warn(`无法构建完整时间: ${node.start_service}`);
              continue;
            }
          } else {
            this.logger.warn(`节点 ${placeId} 缺少 startTime/start_service 字段，跳过`);
            continue;
          }
          
          // 提取 endTime
          if (node.endTime) {
            endTime = node.endTime;
          } else if (node.end_service) {
            // RouteNode 格式：需要将 "HH:mm" 转换为完整日期时间
            const dayDate = DateTime.fromJSDate(tripDay.date);
            const [hours, minutes] = node.end_service.split(':').map(Number);
            const fullDateTime = dayDate.set({ hour: hours || 11, minute: minutes || 0 });
            endTime = fullDateTime.toISO() || undefined;
          } else {
            // 默认：开始时间 + 2小时
            endTime = DateTime.fromISO(startTime).plus({ hours: 2 }).toISO() || undefined;
          }
          
          // 提取 type
          if (node.type) {
            type = node.type;
          } else if (node.category) {
            // 从 category 推断 type
            if (node.category === 'RESTAURANT') {
              type = 'MEAL_ANCHOR';
            } else if (node.category === 'HOTEL') {
              type = 'REST';
            } else {
              type = 'ACTIVITY';
            }
          }
          
          // 提取 note
          note = node.note || node.reason || undefined;
          
          try {
          await this.itineraryItemsService.create({
            tripDayId: tripDay.id,
              placeId,
              type: type as any,
              startTime,
              endTime,
              note,
              travelFromPreviousDuration: node.travelFromPreviousDuration,
              travelFromPreviousDistance: node.travelFromPreviousDistance,
          });
          appliedItems++;
          } catch (error: any) {
            this.logger.error(`创建行程项失败 (placeId: ${placeId})`, error.message);
            skipped.push({ placeId, reason: error.message || '创建失败' });
            // 继续处理其他项，不中断整个流程
          }
        }
      }

      modifiedDays.push(date);
    }

    return {
      success: true,
      appliedItems,
      modifiedDays,
      skipped: skipped.length > 0 ? skipped : undefined,
      preview: dryRun ? changes : undefined,
    };
  }
}

