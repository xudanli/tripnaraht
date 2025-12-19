// src/trips/decision/events/event-trigger.service.ts

/**
 * 事件驱动触发机制
 * 
 * 定义什么事件触发 Neptune repair，并保证触发频率可控
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionTrigger } from '../decision-log';
import { TripWorldState } from '../world-model';

export type RepairEventType =
  | 'weather_update'
  | 'availability_update'
  | 'user_behavior'
  | 'traffic_change'
  | 'manual_trigger';

export interface RepairEvent {
  type: RepairEventType;
  timestamp: string;
  payload: Record<string, any>;
  severity: 'low' | 'medium' | 'high';
}

export interface EventTriggerConfig {
  // 去抖时间（毫秒）
  debounceMs: number;
  // 节流时间（毫秒）
  throttleMs: number;
  // 最小触发间隔（毫秒）
  minIntervalMs: number;
}

export const DEFAULT_EVENT_TRIGGER_CONFIG: EventTriggerConfig = {
  debounceMs: 5000,      // 5秒去抖
  throttleMs: 30000,     // 30秒节流
  minIntervalMs: 60000,  // 1分钟最小间隔
};

@Injectable()
export class EventTriggerService {
  private readonly logger = new Logger(EventTriggerService.name);
  private lastTriggerTime = 0;
  private pendingEvents: RepairEvent[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private readonly config: EventTriggerConfig;

  constructor() {
    this.config = DEFAULT_EVENT_TRIGGER_CONFIG;
  }

  /**
   * 注册事件
   */
  registerEvent(event: RepairEvent): boolean {
    this.logger.debug(`Event registered: ${event.type}`, event.payload);

    // 添加到待处理队列
    this.pendingEvents.push(event);

    // 去抖处理
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processEvents();
    }, this.config.debounceMs);

    return true;
  }

  /**
   * 处理事件队列
   */
  private processEvents(): void {
    if (this.pendingEvents.length === 0) {
      return;
    }

    const now = Date.now();

    // 节流检查
    if (now - this.lastTriggerTime < this.config.minIntervalMs) {
      this.logger.debug(
        `Throttled: last trigger was ${now - this.lastTriggerTime}ms ago`
      );
      return;
    }

    // 合并事件（按严重程度）
    const mergedEvent = this.mergeEvents(this.pendingEvents);

    // 判断是否需要触发修复
    if (this.shouldTriggerRepair(mergedEvent)) {
      this.lastTriggerTime = now;
      this.logger.log(
        `Triggering repair for event: ${mergedEvent.type}`,
        mergedEvent.payload
      );
      // 这里应该触发实际的修复逻辑
      // 可以通过事件总线或回调函数实现
    }

    // 清空队列
    this.pendingEvents = [];
  }

  /**
   * 合并事件
   */
  private mergeEvents(events: RepairEvent[]): RepairEvent {
    // 按严重程度排序，取最严重的
    const sorted = events.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    const primary = sorted[0];

    // 合并 payload
    const mergedPayload = events.reduce(
      (acc, e) => ({ ...acc, ...e.payload }),
      {}
    );

    return {
      ...primary,
      payload: mergedPayload,
    };
  }

  /**
   * 判断是否应该触发修复
   */
  private shouldTriggerRepair(event: RepairEvent): boolean {
    // 高严重度事件总是触发
    if (event.severity === 'high') {
      return true;
    }

    // 特定类型的事件总是触发
    if (
      event.type === 'availability_update' ||
      event.type === 'manual_trigger'
    ) {
      return true;
    }

    // 其他情况根据配置决定
    return event.severity === 'medium';
  }

  /**
   * 映射事件类型到 DecisionTrigger
   */
  mapToDecisionTrigger(eventType: RepairEventType): DecisionTrigger {
    switch (eventType) {
      case 'weather_update':
      case 'traffic_change':
        return 'signal_update';
      case 'availability_update':
        return 'availability_update';
      case 'user_behavior':
        return 'user_edit';
      case 'manual_trigger':
        return 'manual_repair';
      default:
        return 'signal_update';
    }
  }

  /**
   * 检查世界状态变化，生成事件
   */
  detectStateChanges(
    oldState: TripWorldState,
    newState: TripWorldState
  ): RepairEvent[] {
    const events: RepairEvent[] = [];

    // 检查天气变化
    if (
      oldState.signals.lastUpdatedAt !== newState.signals.lastUpdatedAt
    ) {
      const oldAlerts = oldState.signals.alerts || [];
      const newAlerts = newState.signals.alerts || [];

      if (newAlerts.length > oldAlerts.length) {
        events.push({
          type: 'weather_update',
          timestamp: new Date().toISOString(),
          payload: {
            newAlerts: newAlerts,
            oldAlerts: oldAlerts,
          },
          severity: newAlerts.some(a => a.severity === 'critical')
            ? 'high'
            : 'medium',
        });
      }
    }

    // 检查候选集变化（可能表示开放时间/库存变化）
    for (const date of Object.keys(newState.candidatesByDate)) {
      const oldCandidates = oldState.candidatesByDate[date] || [];
      const newCandidates = newState.candidatesByDate[date] || [];

      if (oldCandidates.length !== newCandidates.length) {
        events.push({
          type: 'availability_update',
          timestamp: new Date().toISOString(),
          payload: {
            date,
            oldCount: oldCandidates.length,
            newCount: newCandidates.length,
          },
          severity: 'medium',
        });
      }
    }

    return events;
  }
}

