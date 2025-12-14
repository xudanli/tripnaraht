// src/trips/services/action-history.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';
import { AssistantAction } from '../../assist/dto/action.dto';

/**
 * 操作历史记录
 */
export interface ActionHistory {
  id: string;
  tripId: string;
  dateISO: string;
  actionType: string;
  action: AssistantAction;
  scheduleBefore: DayScheduleResult;
  scheduleAfter: DayScheduleResult;
  timestamp: Date;
  userId?: string;
}

/**
 * 操作历史服务
 * 
 * 管理行程操作历史，支持撤销/重做
 */
@Injectable()
export class ActionHistoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * 记录操作历史
   */
  async recordAction(
    tripId: string,
    dateISO: string,
    action: AssistantAction,
    scheduleBefore: DayScheduleResult,
    scheduleAfter: DayScheduleResult
  ): Promise<string> {
    // 将历史记录保存到 Trip 的 metadata 中（简化实现）
    // 实际应该创建独立的 ActionHistory 表
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new Error(`行程 ID ${tripId} 不存在`);
    }

    const historyId = randomUUID();
    const historyEntry = {
      id: historyId,
      tripId,
      dateISO,
      actionType: action.type,
      action,
      scheduleBefore,
      scheduleAfter,
      timestamp: new Date(),
    };

    // 更新 Trip 的 metadata（存储操作历史）
    const metadata = (trip as any).metadata || {};
    const actionHistory = metadata.actionHistory || [];
    actionHistory.push(historyEntry);

    // 只保留最近 50 条历史
    const trimmedHistory = actionHistory.slice(-50);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          actionHistory: trimmedHistory,
        } as any,
        updatedAt: new Date(),
      },
    });

    return historyId;
  }

  /**
   * 获取操作历史
   */
  async getActionHistory(
    tripId: string,
    dateISO?: string
  ): Promise<ActionHistory[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new Error(`行程 ID ${tripId} 不存在`);
    }

    const metadata = (trip as any).metadata || {};
    const actionHistory: ActionHistory[] = metadata.actionHistory || [];

    // 如果指定了日期，只返回该日期的历史
    if (dateISO) {
      return actionHistory.filter(h => h.dateISO === dateISO);
    }

    return actionHistory;
  }

  /**
   * 撤销操作
   */
  async undoAction(
    tripId: string,
    dateISO: string
  ): Promise<DayScheduleResult | null> {
    const history = await this.getActionHistory(tripId, dateISO);

    if (history.length === 0) {
      return null;
    }

    // 获取最后一次操作
    const lastAction = history[history.length - 1];

    // 返回操作前的 schedule
    return lastAction.scheduleBefore;
  }

  /**
   * 重做操作
   */
  async redoAction(
    tripId: string,
    dateISO: string
  ): Promise<DayScheduleResult | null> {
    // 简化实现：重做就是撤销的逆操作
    // 实际应该维护一个 redo 栈
    const history = await this.getActionHistory(tripId, dateISO);

    if (history.length === 0) {
      return null;
    }

    // 获取最后一次操作
    const lastAction = history[history.length - 1];

    // 返回操作后的 schedule
    return lastAction.scheduleAfter;
  }
}
