// src/agent/services/execution-agent.service.ts
/**
 * ExecutionAgentService
 * 
 * 执行阶段的 Agent，负责"贴心管家式的提醒、变更与兜底"
 * 
 * 职责：
 * - 生成提醒（出发、入住、活动、交通、天气、安全、预算）
 * - 处理变更（时间、地点、活动取消、交通延误等）
 * - 生成兜底方案（当原计划无法执行时）
 */

import { Injectable, Logger, Optional, Inject, forwardRef, NotFoundException, BadRequestException } from '@nestjs/common';
import { ExecRemindSkill } from '../../skills/exec/exec-remind.skill';
import { ExecHandleChangeSkill } from '../../skills/exec/exec-handle-change.skill';
import { ExecFallbackSkill } from '../../skills/exec/exec-fallback.skill';
import { ExecutionState, Reminder, ChangeHandlingResult, FallbackPlan } from '../../skills/exec/shared/execution-state.types';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';
import { TripsService } from '../../trips/trips.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { ReorderRequestDto } from '../dto/reorder.dto';
import { ApplyFallbackRequestDto } from '../dto/apply-fallback.dto';

export interface ExecutionAgentRequest {
  /** Trip ID */
  tripId: string;
  
  /** 操作类型 */
  action: 'remind' | 'handle_change' | 'fallback' | 'get_status';
  
  /** 提醒相关参数（action === 'remind' 时） */
  remindParams?: {
    reminderTypes?: string[];
    advanceHours?: number;
  };
  
  /** 变更相关参数（action === 'handle_change' 时） */
  changeParams?: {
    changeType: string;
    changeDetails: any;
  };
  
  /** 兜底相关参数（action === 'fallback' 时） */
  fallbackParams?: {
    triggerReason: string;
    originalPlan: any;
  };
}

export interface ExecutionAgentResponse {
  /** 执行状态 */
  executionState: ExecutionState;
  
  /** 三人格输出（如果有） */
  personas?: PersonaShellOutput;
  
  /** UI 输出 */
  uiOutput: {
    reminders?: Reminder[];
    changeResult?: ChangeHandlingResult;
    fallbackPlan?: FallbackPlan;
    status?: {
      currentDay: number;
      currentDate: string;
      phase: 'ON_TRIP' | 'CHANGE_HANDLING' | 'FALLBACK';
      activeIssues: number;
    };
  };
}

@Injectable()
export class ExecutionAgentService {
  private readonly logger = new Logger(ExecutionAgentService.name);
  
  // 简单的内存存储，用于保存最近的fallback方案（实际生产环境应使用数据库或Redis）
  private readonly fallbackPlanCache = new Map<string, FallbackPlan>();

  constructor(
    @Optional() private readonly execRemind?: ExecRemindSkill,
    @Optional() private readonly execHandleChange?: ExecHandleChangeSkill,
    @Optional() private readonly execFallback?: ExecFallbackSkill,
    @Optional() private readonly personaShell?: PersonaShellService,
    @Optional() @Inject(forwardRef(() => TripsService)) private readonly tripsService?: TripsService,
    @Optional() @Inject(forwardRef(() => ItineraryItemsService)) private readonly itineraryItemsService?: ItineraryItemsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    // 添加诊断日志
    this.logger.log(`[ExecutionAgentService] 服务已创建`);
    this.logger.log(`[ExecutionAgentService] execRemind: ${!!this.execRemind}, execHandleChange: ${!!this.execHandleChange}, execFallback: ${!!this.execFallback}`);
    this.logger.log(`[ExecutionAgentService] tripsService: ${!!this.tripsService}, itineraryItemsService: ${!!this.itineraryItemsService}, prisma: ${!!this.prisma}`);
  }

  /**
   * 执行执行阶段流程
   */
  async execute(request: ExecutionAgentRequest): Promise<ExecutionAgentResponse> {
    this.logger.debug(`执行执行阶段 Agent: tripId=${request.tripId}, action=${request.action}`);

    try {
      const currentDate = new Date().toISOString().split('T')[0];
      const executionState: ExecutionState = {
        tripId: request.tripId,
        phase: 'ON_TRIP',
        currentDay: 1, // TODO: 从数据库计算
        currentDate,
        reminders: [],
        pendingChanges: [],
        activeFallbacks: [],
        lastUpdated: new Date().toISOString(),
      };

      const uiOutput: ExecutionAgentResponse['uiOutput'] = {};

      switch (request.action) {
        case 'remind':
          if (this.execRemind) {
            const remindResult = await this.execRemind.execute({
              tripId: request.tripId,
              currentDate,
              reminderTypes: request.remindParams?.reminderTypes as any,
              advanceHours: request.remindParams?.advanceHours,
            });
            executionState.reminders = remindResult.reminders;
            uiOutput.reminders = remindResult.reminders;
          }
          break;

        case 'handle_change':
          if (this.execHandleChange && request.changeParams) {
            const changeResult = await this.execHandleChange.execute({
              tripId: request.tripId,
              changeType: request.changeParams.changeType as any,
              changeDetails: request.changeParams.changeDetails,
            });
            executionState.pendingChanges.push(changeResult.result);
            executionState.phase = 'CHANGE_HANDLING';
            
            // 增强响应：添加成功状态和更新后的时间线
            const enhancedResult: ChangeHandlingResult = {
              ...changeResult.result,
              success: true,
              message: '变更已处理',
            };
            
            // 尝试获取更新后的时间线
            if (this.tripsService) {
              try {
                const scheduleResult = await this.tripsService.getSchedule(request.tripId, currentDate);
                if (scheduleResult && scheduleResult.schedule) {
                  // 转换 DayScheduleResult 为前端需要的格式
                  const scheduleItems = scheduleResult.schedule.stops?.map((stop: any) => ({
                    placeId: stop.id?.replace('poi-', '') || 0,
                    placeName: stop.name || '未知地点',
                    startTime: this.minutesToTimeString(stop.startMin),
                    endTime: this.minutesToTimeString(stop.endMin),
                    status: 'upcoming' as const,
                  })) || [];
                  
                  enhancedResult.updatedSchedule = {
                    date: currentDate,
                    schedule: {
                      items: scheduleItems,
                    },
                  };
                }
              } catch (error: any) {
                this.logger.warn(`获取更新后的时间线失败: ${error.message}`);
              }
            }
            
            uiOutput.changeResult = enhancedResult;
          }
          break;

        case 'fallback':
          if (this.execFallback && request.fallbackParams) {
            const fallbackResult = await this.execFallback.execute({
              tripId: request.tripId,
              triggerReason: request.fallbackParams.triggerReason,
              originalPlan: request.fallbackParams.originalPlan,
            });
            executionState.activeFallbacks.push(fallbackResult.fallbackPlan);
            executionState.phase = 'FALLBACK';
            uiOutput.fallbackPlan = fallbackResult.fallbackPlan;
            
            // 缓存fallback方案，以便后续应用和预览
            this.fallbackPlanCache.set(fallbackResult.fallbackPlan.id, fallbackResult.fallbackPlan);
            
            // 为每个solution也创建缓存键
            if (fallbackResult.fallbackPlan.solutions) {
              for (const solution of fallbackResult.fallbackPlan.solutions) {
                this.fallbackPlanCache.set(solution.id, fallbackResult.fallbackPlan);
              }
            }
          }
          break;

        case 'get_status':
          // 获取当前状态
          uiOutput.status = {
            currentDay: executionState.currentDay,
            currentDate: executionState.currentDate,
            phase: executionState.phase,
            activeIssues: executionState.pendingChanges.length + executionState.activeFallbacks.length,
          };
          break;
      }

      return {
        executionState,
        uiOutput,
      };
    } catch (error: any) {
      this.logger.error(`执行阶段 Agent 执行失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 重新排序行程
   */
  async reorder(request: ReorderRequestDto) {
    this.logger.debug(`重新排序行程: tripId=${request.tripId}, dayId=${request.dayId}`);

    if (!this.itineraryItemsService || !this.prisma) {
      throw new BadRequestException('ItineraryItemsService 或 PrismaService 未注入');
    }

    // 1. 获取指定日期的所有行程项
    const items = await this.itineraryItemsService.findByTripDay(request.dayId);
    
    if (items.length === 0) {
      throw new NotFoundException(`日期 ${request.dayId} 没有行程项`);
    }

    // 2. 验证 newOrder 数组
    if (request.newOrder.length !== items.length) {
      throw new BadRequestException(`newOrder 数组长度 (${request.newOrder.length}) 与行程项数量 (${items.length}) 不匹配`);
    }

    const itemMap = new Map(items.map(item => [item.id, item]));
    for (const itemId of request.newOrder) {
      if (!itemMap.has(itemId)) {
        throw new BadRequestException(`行程项 ${itemId} 不存在于指定日期`);
      }
    }

    // 3. 获取日期信息
    const tripDay = await this.prisma.tripDay.findUnique({
      where: { id: request.dayId },
    });

    if (!tripDay) {
      throw new NotFoundException(`日期 ${request.dayId} 不存在`);
    }

    const dayDate = DateTime.fromJSDate(tripDay.date);
    const dateISO = dayDate.toISODate() || '';

    // 4. 按照 newOrder 重新排序，计算新的时间
    const timeAdjustments: Array<{ itemId: string; originalTime: string; newTime: string }> = [];
    const conflicts: Array<{ type: string; message: string }> = [];
    
    // 从早上9点开始（可以根据需求调整）
    let currentStartMinutes = 9 * 60; // 09:00
    const updates: Array<{ id: string; startTime: Date; endTime: Date }> = [];

    for (const itemId of request.newOrder) {
      const item = itemMap.get(itemId)!;
      
      if (!item.startTime || !item.endTime) {
        conflicts.push({
          type: 'missing_time',
          message: `行程项 ${itemId} 缺少时间信息`,
        });
        continue;
      }

      const originalStart = DateTime.fromJSDate(item.startTime);
      const originalEnd = DateTime.fromJSDate(item.endTime);
      const duration = originalEnd.diff(originalStart, 'minutes').minutes;

      // 计算新的开始和结束时间
      const newStartTime = dayDate.startOf('day').plus({ minutes: currentStartMinutes });
      const newEndTime = newStartTime.plus({ minutes: duration });

      updates.push({
        id: itemId,
        startTime: newStartTime.toJSDate(),
        endTime: newEndTime.toJSDate(),
      });

      timeAdjustments.push({
        itemId,
        originalTime: originalStart.toFormat('HH:mm'),
        newTime: newStartTime.toFormat('HH:mm'),
      });

      // 下一个item的开始时间 = 当前item的结束时间 + 30分钟缓冲（可以根据需求调整）
      currentStartMinutes += duration + 30;
    }

    // 5. 批量更新数据库
    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(update =>
          this.prisma!.itineraryItem.update({
            where: { id: update.id },
            data: {
              startTime: update.startTime,
              endTime: update.endTime,
            },
          })
        )
      );
    }

    // 6. 获取更新后的时间线
    let updatedSchedule: any = null;
    if (this.tripsService) {
      try {
        const scheduleResult = await this.tripsService.getSchedule(request.tripId, dateISO);
        if (scheduleResult && scheduleResult.schedule) {
          const scheduleItems = scheduleResult.schedule.stops?.map((stop: any) => ({
            placeId: stop.id?.replace('poi-', '') || 0,
            placeName: stop.name || '未知地点',
            startTime: this.minutesToTimeString(stop.startMin),
            endTime: this.minutesToTimeString(stop.endMin),
            status: 'upcoming' as const,
          })) || [];
          
          updatedSchedule = {
            date: dateISO,
            schedule: {
              items: scheduleItems,
            },
          };
        }
      } catch (error: any) {
        this.logger.warn(`获取更新后的时间线失败: ${error.message}`);
      }
    }

    return {
      success: true,
      message: '行程已重新排序',
      updatedSchedule,
      impact: {
        timeAdjustments,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      },
    };
  }

  /**
   * 应用修复方案
   */
  async applyFallback(request: ApplyFallbackRequestDto) {
    this.logger.debug(`应用修复方案: tripId=${request.tripId}, solutionId=${request.solutionId}`);

    if (!this.itineraryItemsService || !this.prisma) {
      throw new BadRequestException('ItineraryItemsService 或 PrismaService 未注入');
    }

    // 1. 从缓存中获取fallback方案
    const fallbackPlan = this.fallbackPlanCache.get(request.solutionId);
    if (!fallbackPlan || !fallbackPlan.solutions) {
      throw new NotFoundException(`修复方案 ${request.solutionId} 不存在或已过期`);
    }

    // 2. 找到对应的solution
    const solution = fallbackPlan.solutions.find(s => s.id === request.solutionId);
    if (!solution) {
      throw new NotFoundException(`修复方案 ${request.solutionId} 不存在`);
    }

    // 3. 应用变更
    const appliedChanges: Array<{ itemId: string; action: string; details: any }> = [];
    
    if (solution.changes && solution.changes.length > 0) {
      for (const change of solution.changes) {
        try {
          if (change.action === 'modify' && change.itemId) {
            const updateData: any = {};
            if (change.newTime) {
              // 解析时间字符串并更新
              const [hours, minutes] = change.newTime.split(':').map(Number);
              const dayDate = DateTime.now().startOf('day');
              updateData.startTime = dayDate.plus({ hours, minutes }).toJSDate();
              // 假设结束时间延后2小时（可以根据实际需求调整）
              updateData.endTime = dayDate.plus({ hours: hours + 2, minutes }).toJSDate();
            }
            if (change.newPlace) {
              updateData.placeId = change.newPlace.id;
            }
            
            if (Object.keys(updateData).length > 0) {
              await this.itineraryItemsService.update(change.itemId, updateData);
              appliedChanges.push({
                itemId: change.itemId,
                action: 'modified',
                details: updateData,
              });
            }
          } else if (change.action === 'remove' && change.itemId) {
            await this.itineraryItemsService.remove(change.itemId);
            appliedChanges.push({
              itemId: change.itemId,
              action: 'removed',
              details: {},
            });
          } else if (change.action === 'add' && change.newPlace) {
            // TODO: 实现添加新行程项的逻辑
            appliedChanges.push({
              itemId: 'new',
              action: 'added',
              details: change.newPlace,
            });
          }
        } catch (error: any) {
          this.logger.warn(`应用变更失败: itemId=${change.itemId}, error=${error.message}`);
        }
      }
    }

    // 4. 获取更新后的时间线
    let updatedSchedule: any = null;
    const currentDate = new Date().toISOString().split('T')[0];
    if (this.tripsService) {
      try {
        const scheduleResult = await this.tripsService.getSchedule(request.tripId, currentDate);
        if (scheduleResult && scheduleResult.schedule) {
          const scheduleItems = scheduleResult.schedule.stops?.map((stop: any) => ({
            placeId: stop.id?.replace('poi-', '') || 0,
            placeName: stop.name || '未知地点',
            startTime: this.minutesToTimeString(stop.startMin),
            endTime: this.minutesToTimeString(stop.endMin),
            status: 'upcoming' as const,
          })) || [];
          
          updatedSchedule = {
            date: currentDate,
            schedule: {
              items: scheduleItems,
            },
          };
        }
      } catch (error: any) {
        this.logger.warn(`获取更新后的时间线失败: ${error.message}`);
      }
    }

    return {
      success: true,
      message: '修复方案已应用',
      appliedChanges,
      updatedSchedule,
      impact: solution.impact,
    };
  }

  /**
   * 预览修复方案
   */
  async previewFallback(solutionId: string) {
    this.logger.debug(`预览修复方案: solutionId=${solutionId}`);

    // 从缓存中获取fallback方案
    const fallbackPlan = this.fallbackPlanCache.get(solutionId);
    if (!fallbackPlan || !fallbackPlan.solutions) {
      throw new NotFoundException(`修复方案 ${solutionId} 不存在或已过期`);
    }

    // 找到对应的solution
    const solution = fallbackPlan.solutions.find(s => s.id === solutionId);
    if (!solution) {
      throw new NotFoundException(`修复方案 ${solutionId} 不存在`);
    }

    // 构建预览响应
    return {
      solutionId: solution.id,
      type: solution.type,
      title: solution.title,
      description: solution.description,
      changes: solution.changes.map(change => ({
        itemId: change.itemId,
        action: change.action,
        original: change.action === 'modify' ? {
          // TODO: 从数据库获取原始信息
          placeName: '原始地点',
          startTime: '09:00',
          endTime: '11:00',
        } : undefined,
        modified: change.action === 'modify' ? {
          placeName: change.newPlace?.name || '新地点',
          startTime: change.newTime || '10:00',
          endTime: change.newTime ? this.addHours(change.newTime, 2) : '12:00',
        } : undefined,
        reason: `根据${solution.type}方案调整`,
      })),
      impact: solution.impact,
      timeline: {
        // TODO: 构建预览时间线
        date: new Date().toISOString().split('T')[0],
        schedule: {
          items: [],
        },
      },
    };
  }

  /**
   * 将分钟数转换为时间字符串（HH:mm）
   */
  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * 时间字符串加小时数
   */
  private addHours(timeStr: string, hours: number): string {
    const [h, m] = timeStr.split(':').map(Number);
    const newHour = (h + hours) % 24;
    return `${newHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
