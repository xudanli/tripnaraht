// src/schedule-action/schedule-action.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { DayScheduleResult, PlannedStop } from '../planning-policy/interfaces/scheduler.interface';
import { AssistantAction } from '../assist/dto/action.dto';
import { PlaceToPoiHelperService } from '../planning-policy/services/place-to-poi-helper.service';
import { Poi } from '../planning-policy/interfaces/poi.interface';
import {
  successResponse,
  errorResponse,
  ErrorCode,
  StandardResponse,
} from '../common/dto/standard-response.dto';
import { randomUUID } from 'crypto';
import { TimelineRebuilder } from './utils/timeline-rebuilder.util';

/**
 * 行程动作执行服务
 * 
 * 执行助手建议的动作，修改行程计划
 */
@Injectable()
export class ScheduleActionService {
  private readonly logger = new Logger(ScheduleActionService.name);
  private readonly timelineRebuilder = new TimelineRebuilder();

  constructor(
    private readonly placeToPoiHelper: PlaceToPoiHelperService
  ) {}

  /**
   * 应用动作到行程
   * 
   * @param schedule 当前行程计划
   * @param action 要执行的动作
   * @returns 统一格式的响应
   */
  async apply(
    schedule: DayScheduleResult,
    action: AssistantAction
  ): Promise<StandardResponse<{
    applied: boolean;
    newSchedule?: DayScheduleResult;
    answer?: { title: string; details: string };
    message?: string;
  }>> {
    const requestId = randomUUID();
    const actionType = action.type;
    const poiId = (action as any).poiId;

    this.logger.log(
      `[${requestId}] apply action: type=${actionType}, poiId=${poiId || 'N/A'}`
    );

    try {
      switch (action.type) {
        case 'QUERY_NEXT_STOP':
          return this.queryNextStop(schedule, requestId);

        case 'MOVE_POI_TO_MORNING':
          return await this.movePoiToMorning(schedule, action, requestId);

        case 'ADD_POI_TO_SCHEDULE':
          return await this.addPoiToSchedule(schedule, action, requestId);

        default:
          this.logger.warn(`[${requestId}] Unsupported action type: ${(action as any).type}`);
          return errorResponse(
            ErrorCode.UNSUPPORTED_ACTION,
            `不支持的动作类型: ${(action as any).type}`,
            { actionType: (action as any).type }
          );
      }
    } catch (error: any) {
      this.logger.error(`[${requestId}] Error applying action: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '执行动作时发生错误',
        { actionType, requestId }
      );
    }
  }

  /**
   * 查询下一站
   */
  private queryNextStop(
    schedule: DayScheduleResult,
    requestId: string
  ): StandardResponse<{
    applied: false;
    answer: { title: string; details: string };
  }> {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const nextStop = schedule.stops.find(
      (s) => s.kind === 'POI' && s.startMin >= nowMin
    );

    if (nextStop) {
      const timeStr = this.formatTime(nextStop.startMin);
      return successResponse({
        applied: false,
        answer: {
          title: `下一站是：${nextStop.name}（${timeStr}）`,
          details: `预计 ${timeStr} 到达 ${nextStop.name}`,
        },
      });
    } else {
      return successResponse({
        applied: false,
        answer: {
          title: '今天没有更多行程了',
          details: '当前行程已全部完成',
        },
      });
    }
  }

  /**
   * 移动 POI 到上午
   * 
   * 实现：
   * - 找到目标 POI
   * - 将其移动到上午时间段（12:00 前）
   * - 调整顺序：放在第一个上午 POI 之前，或如果上午没有 POI，放在最前面
   * - 如果 rebuildTimeline=true，尝试重建时间轴（考虑交通、营业时间等约束）
   * - 如果重建失败，回退到仅重排（不修改时间戳）
   */
  private async movePoiToMorning(
    schedule: DayScheduleResult,
    action: Extract<AssistantAction, { type: 'MOVE_POI_TO_MORNING' }>,
    requestId: string
  ): Promise<StandardResponse<{
    applied: true;
    newSchedule: DayScheduleResult;
    message: string;
  }>> {
    // 验证必需字段
    if (!action.poiId && !action.poiName) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'poiId 或 poiName 必须提供一个',
        { field: 'action.poiId' }
      );
    }

    // 找到目标 POI
    const targetStop = schedule.stops.find(
      (s) => s.kind === 'POI' && (action.poiId ? s.id === action.poiId : s.name === action.poiName)
    );

    if (!targetStop) {
      return errorResponse(
        ErrorCode.NOT_FOUND,
        `找不到指定的 POI: ${action.poiId || action.poiName}`,
        { poiId: action.poiId, poiName: action.poiName }
      );
    }

    // 定义"上午"（11:30 = 690 分钟）
    const morningEndMin = 690;

    // 检查是否已经在上午
    if (targetStop.startMin < morningEndMin) {
      return errorResponse(
        ErrorCode.BUSINESS_ERROR,
        `${targetStop.name} 已经在上午时间段了`,
        { poiId: targetStop.id, currentStartMin: targetStop.startMin }
      );
    }

    // 创建新的 stops 数组
    const newStops = [...schedule.stops];

    // 移除目标 POI
    const originalIndex = newStops.findIndex((s) => s.id === targetStop.id);
    if (originalIndex === -1) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        '无法找到目标 POI 在行程中的位置',
        { poiId: targetStop.id }
      );
    }
    newStops.splice(originalIndex, 1);

    // 找到第一个上午 POI 的位置（或在上午时间段之后的位置）
    let insertIndex = 0;
    for (let i = 0; i < newStops.length; i++) {
      const stop = newStops[i];
      if (stop.kind === 'POI' && stop.startMin >= morningEndMin) {
        insertIndex = i;
        break;
      }
      if (stop.kind === 'POI' && stop.startMin < morningEndMin) {
        insertIndex = i + 1;
      }
    }

    // 判断是否需要重建时间轴
    const rebuildTimeline = action.rebuildTimeline ?? false;
    let finalStops: PlannedStop[];
    let timelineRebuilt = false;

    if (rebuildTimeline) {
      // 尝试获取完整的 POI 信息以重建时间轴
      let targetPoi: Poi | null = null;
      
      // 尝试从 Place 表获取 POI 信息
      const placeIdNum = action.poiId ? parseInt(action.poiId, 10) : NaN;
      if (!isNaN(placeIdNum)) {
        try {
          targetPoi = await this.placeToPoiHelper.getPoiById(placeIdNum);
        } catch (error: any) {
          this.logger.warn(
            `[${requestId}] Failed to fetch POI info for timeline rebuild: ${error.message}`
          );
        }
      }

      // 计算行程的边界时间
      const dayStartMin = schedule.stops.length > 0
        ? Math.min(...schedule.stops.map((s) => s.startMin))
        : 540; // 默认 9:00
      const dayEndMin = schedule.stops.length > 0
        ? Math.max(...schedule.stops.map((s) => s.endMin))
        : 1200; // 默认 20:00

      // 创建临时 stop（用于插入测试）
      const tempTargetStop: PlannedStop = {
        ...targetStop,
        startMin: 600, // 临时值
        endMin: 600 + (targetStop.endMin - targetStop.startMin),
      };
      newStops.splice(insertIndex, 0, tempTargetStop);

      // 尝试重建时间轴
      const rebuiltStops = this.timelineRebuilder.rebuildTimeline(
        newStops,
        targetPoi,
        insertIndex,
        dayStartMin,
        dayEndMin
      );

      if (rebuiltStops) {
        // 重建成功
        finalStops = rebuiltStops;
        timelineRebuilt = true;
        this.logger.log(
          `[${requestId}] Timeline rebuilt for POI ${targetStop.id}: ${targetStop.startMin} -> ${rebuiltStops[insertIndex].startMin}`
        );
      } else {
        // 重建失败，回退到仅重排
        this.logger.warn(
          `[${requestId}] Timeline rebuild failed for POI ${targetStop.id}, falling back to reorder only`
        );
        // 移除临时 stop，使用简单重排逻辑
        newStops.splice(insertIndex, 1);
        finalStops = newStops;
        
        // 简单调整到上午中段
        const newTargetStop: PlannedStop = {
          ...targetStop,
          startMin: 600, // 10:00
          endMin: 600 + (targetStop.endMin - targetStop.startMin), // 保持原有时长
        };
        finalStops.splice(insertIndex, 0, newTargetStop);
      }
    } else {
      // 仅重排（不重建时间轴）
      const newTargetStop: PlannedStop = {
        ...targetStop,
        startMin: 600, // 10:00
        endMin: 600 + (targetStop.endMin - targetStop.startMin), // 保持原有时长
      };
      newStops.splice(insertIndex, 0, newTargetStop);
      finalStops = newStops;
    }

    const finalTargetStop = finalStops[insertIndex];
    this.logger.log(
      `[${requestId}] Moved POI ${targetStop.id} to morning: ${targetStop.startMin} -> ${finalTargetStop.startMin}${timelineRebuilt ? ' (timeline rebuilt)' : ' (reordered only)'}`
    );

    return successResponse({
      applied: true,
      newSchedule: {
        ...schedule,
        stops: finalStops,
        // 注意：metrics 可能需要重新计算，但 MVP 先不处理
      },
      message: `已将「${targetStop.name}」移动到上午段${timelineRebuilt ? '（已重建时间轴）' : '（仅调整顺序）'}`,
    });
  }

  /**
   * 添加 POI 到行程
   * 
   * 方案 A：后端内部通过 poiId 拉取完整 POI（从 Place 表或外部 Provider）
   * 
   * MVP 实现：
   * - 尝试从 Place 表获取 POI 信息（如果 poiId 是数字）
   * - 添加到末尾（或指定位置）
   * - 简单的时间计算（使用 avgVisitMin）
   */
  private async addPoiToSchedule(
    schedule: DayScheduleResult,
    action: Extract<AssistantAction, { type: 'ADD_POI_TO_SCHEDULE' }>,
    requestId: string
  ): Promise<StandardResponse<{
    applied: true;
    newSchedule: DayScheduleResult;
    message: string;
  }>> {
    try {
      // 验证必需字段
      if (!action.poiId) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'poiId is required for ADD_POI_TO_SCHEDULE',
          { field: 'action.poiId' }
        );
      }

      // 方案 A：后端内部拉取完整 POI 信息
      let poi: Poi | null = null;
      const placeIdNum = parseInt(action.poiId, 10);
      
      if (!isNaN(placeIdNum)) {
        // 如果是数字，从 Place 表查询（推荐路径）
        this.logger.log(`[${requestId}] Fetching POI from Place table: placeId=${placeIdNum}`);
        poi = await this.placeToPoiHelper.getPoiById(placeIdNum);
      } else {
        // TODO: 如果 poiId 不是数字，可能是外部 Provider 的 ID
        // 这里可以接入 POI Provider 查询，但目前只支持 Place 表的数字 ID
        this.logger.warn(`[${requestId}] POI ID is not a number, Place table lookup skipped: ${action.poiId}`);
      }
      
      if (!poi) {
        return errorResponse(
          ErrorCode.NOT_FOUND,
          `找不到指定的 POI: ${action.poiId}（请确保 poiId 是有效的 Place ID）`,
          { poiId: action.poiId, suggestion: '请使用 Place 表中的数字 ID' }
        );
      }

      // 检查 POI 是否已经在行程中
      const existingStop = schedule.stops.find((s) => s.kind === 'POI' && s.id === poi!.id);
      if (existingStop) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          `POI「${poi.name}」已经在行程中`,
          { poiId: poi.id, existingStartMin: existingStop.startMin }
        );
      }

      // 计算插入位置和时间
      const lastStop = schedule.stops[schedule.stops.length - 1];
      const insertAfterIndex = action.insertAfterStopId
        ? schedule.stops.findIndex((s) => s.id === action.insertAfterStopId)
        : schedule.stops.length - 1;

      // 计算新 stop 的时间（简单实现：放在最后一个 stop 之后）
      const baseTime = lastStop ? lastStop.endMin : 540; // 如果没有 stop，默认 9:00
      const visitMin = poi.avgVisitMin || 120;
      const newStartMin = baseTime + 30; // 预留 30 分钟交通时间
      const newEndMin = newStartMin + visitMin;

      // 创建新的 stop
      const newStop: PlannedStop = {
        kind: 'POI',
        id: poi.id,
        name: poi.name,
        startMin: newStartMin,
        endMin: newEndMin,
        lat: poi.lat,
        lng: poi.lng,
        notes: [`从拍照识别添加: ${poi.name}`],
      };

      // 创建新的 stops 数组
      const newStops = [...schedule.stops];
      if (insertAfterIndex >= 0 && insertAfterIndex < newStops.length) {
        newStops.splice(insertAfterIndex + 1, 0, newStop);
      } else {
        newStops.push(newStop);
      }

      this.logger.log(
        `[${requestId}] Added POI ${poi.id} (${poi.name}) to schedule at ${this.formatTime(newStartMin)}`
      );

      return successResponse({
        applied: true,
        newSchedule: {
          ...schedule,
          stops: newStops,
          // 注意：metrics 可能需要重新计算，但 MVP 先不处理
        },
        message: `已将「${poi.name}」添加到行程中（${this.formatTime(newStartMin)}）`,
      });
    } catch (error: any) {
      this.logger.error(`[${requestId}] Error adding POI: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '添加 POI 时发生错误',
        { poiId: action.poiId, requestId }
      );
    }
  }

  /**
   * 格式化时间（分钟数 → HH:mm）
   */
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * 预览动作（dry-run）
   * 
   * 执行动作但不实际修改 schedule，返回 diff、warnings 等信息
   * 
   * @param schedule 当前行程计划
   * @param action 要执行的动作
   * @returns 预览结果（diff、warnings、是否可应用等）
   */
  async preview(
    schedule: DayScheduleResult,
    action: AssistantAction
  ): Promise<StandardResponse<{
    applied: boolean;
    canApply: boolean;
    diff?: {
      movedStops: Array<{ id: string; name: string; from: number; to: number }>;
      addedStops: Array<{ id: string; name: string; position: number }>;
      removedStops: Array<{ id: string; name: string }>;
      affectedStopCount: number;
    };
    warnings: string[];
    newSchedule?: DayScheduleResult;
    message: string;
  }>> {
    const requestId = randomUUID();
    const actionType = action.type;

    this.logger.log(
      `[${requestId}] preview action: type=${actionType}`
    );

    try {
      // 复制 schedule 以避免修改原始数据
      const scheduleCopy: DayScheduleResult = JSON.parse(JSON.stringify(schedule));

      // 执行动作（但不持久化）
      const result = await this.apply(scheduleCopy, action);

      if (!result.success || !result.data) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          result.error?.message || '预览动作失败',
          result.error?.details
        );
      }

      // 计算 diff
      const diff = this.calculateDiff(schedule, result.data.newSchedule || scheduleCopy);
      
      // 生成 warnings
      const warnings = this.generateWarnings(schedule, result.data.newSchedule || scheduleCopy, action);

      return successResponse({
        applied: false, // 预览模式不实际应用
        canApply: result.data.applied !== false,
        diff,
        warnings,
        newSchedule: result.data.newSchedule,
        message: result.data.message || '预览完成',
      });
    } catch (error: any) {
      this.logger.error(`[${requestId}] Error previewing action: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '预览动作时发生错误',
        { actionType, requestId }
      );
    }
  }

  /**
   * 计算两个 schedule 之间的差异
   */
  private calculateDiff(
    oldSchedule: DayScheduleResult,
    newSchedule: DayScheduleResult
  ): {
    movedStops: Array<{ id: string; name: string; from: number; to: number }>;
    addedStops: Array<{ id: string; name: string; position: number }>;
    removedStops: Array<{ id: string; name: string }>;
    affectedStopCount: number;
  } {
    const oldStops = oldSchedule.stops;
    const newStops = newSchedule.stops;

    const movedStops: Array<{ id: string; name: string; from: number; to: number }> = [];
    const addedStops: Array<{ id: string; name: string; position: number }> = [];
    const removedStops: Array<{ id: string; name: string }> = [];

    // 找出移动的 stop
    for (let i = 0; i < newStops.length; i++) {
      const newStop = newStops[i];
      const oldIndex = oldStops.findIndex(s => s.id === newStop.id);
      if (oldIndex >= 0 && oldIndex !== i) {
        movedStops.push({
          id: newStop.id,
          name: newStop.name,
          from: oldIndex,
          to: i,
        });
      }
    }

    // 找出新增的 stop
    for (let i = 0; i < newStops.length; i++) {
      const newStop = newStops[i];
      if (!oldStops.find(s => s.id === newStop.id)) {
        addedStops.push({
          id: newStop.id,
          name: newStop.name,
          position: i,
        });
      }
    }

    // 找出删除的 stop
    for (const oldStop of oldStops) {
      if (!newStops.find(s => s.id === oldStop.id)) {
        removedStops.push({
          id: oldStop.id,
          name: oldStop.name,
        });
      }
    }

    const affectedStopCount = movedStops.length + addedStops.length + removedStops.length;

    return {
      movedStops,
      addedStops,
      removedStops,
      affectedStopCount,
    };
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(
    oldSchedule: DayScheduleResult,
    newSchedule: DayScheduleResult,
    action: AssistantAction
  ): string[] {
    const warnings: string[] = [];

    // 检查时间冲突
    const stops = newSchedule.stops;
    for (let i = 0; i < stops.length - 1; i++) {
      if (stops[i].endMin > stops[i + 1].startMin) {
        warnings.push(`时间冲突：${stops[i].name} 和 ${stops[i + 1].name} 时间重叠`);
      }
    }

    // 检查影响范围
    const diff = this.calculateDiff(oldSchedule, newSchedule);
    if (diff.affectedStopCount > 3) {
      warnings.push(`此操作将影响 ${diff.affectedStopCount} 个行程项，请确认`);
    }

    return warnings;
  }
}
