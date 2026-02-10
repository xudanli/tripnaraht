/**
 * 世界模型事件服务
 * 
 * Code Review P2-3修复：实现事件驱动架构
 * 
 * 职责：
 * - 发布世界模型更新事件
 * - 发布智能体贡献事件
 * - 支持事件订阅和监听
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UnifiedWorldModel } from '../interfaces/unified-world-model.interface';

/**
 * 世界模型事件类型
 */
export enum WorldModelEventType {
  /** 世界模型构建完成 */
  WORLD_MODEL_BUILT = 'world_model.built',
  
  /** 世界模型更新 */
  WORLD_MODEL_UPDATED = 'world_model.updated',
  
  /** 实时状态更新 */
  REALTIME_STATE_UPDATED = 'world_model.realtime_state.updated',
  
  /** 预测数据更新 */
  PREDICTIONS_UPDATED = 'world_model.predictions.updated',
  
  /** 智能体贡献 */
  AGENT_CONTRIBUTION = 'world_model.agent.contribution',
  
  /** 用户贡献 */
  USER_CONTRIBUTION = 'world_model.user.contribution',
  
  /** 版本创建 */
  VERSION_CREATED = 'world_model.version.created',
  
  /** 版本回滚 */
  VERSION_ROLLED_BACK = 'world_model.version.rolled_back',
}

/**
 * 世界模型事件数据
 */
export interface WorldModelEvent {
  type: WorldModelEventType;
  timestamp: Date;
  tripId?: string;
  routeDirectionId?: string;
  countryCode?: string;
  data?: any;
  metadata?: Record<string, any>;
}

/**
 * 世界模型构建事件
 */
export interface WorldModelBuiltEvent extends WorldModelEvent {
  type: WorldModelEventType.WORLD_MODEL_BUILT;
  worldModel: Partial<UnifiedWorldModel>;
  buildTimeMs: number;
}

/**
 * 智能体贡献事件
 */
export interface AgentContributionEvent extends WorldModelEvent {
  type: WorldModelEventType.AGENT_CONTRIBUTION;
  agentId: string;
  agentType: string;
  contribution: Partial<UnifiedWorldModel>;
  confidence: number;
}

/**
 * 用户贡献事件
 */
export interface UserContributionEvent extends WorldModelEvent {
  type: WorldModelEventType.USER_CONTRIBUTION;
  userId: string;
  contributionId: string;
  contributionType: string;
  qualityScore: number;
}

/**
 * 事件监听器类型
 */
type EventListener<T extends WorldModelEvent = WorldModelEvent> = (event: T) => void | Promise<void>;

@Injectable()
export class WorldModelEventsService implements OnModuleInit {
  private readonly logger = new Logger(WorldModelEventsService.name);
  
  /** 事件监听器映射 */
  private readonly listeners = new Map<WorldModelEventType, Set<EventListener>>();

  onModuleInit() {
    this.logger.log('世界模型事件服务已初始化');
  }

  /**
   * 订阅事件
   */
  on<T extends WorldModelEvent>(
    eventType: WorldModelEventType,
    listener: EventListener<T>,
  ): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener as EventListener);
    this.logger.debug(`[WorldModelEvents] 订阅事件: ${eventType}`);
  }

  /**
   * 取消订阅事件
   */
  off<T extends WorldModelEvent>(
    eventType: WorldModelEventType,
    listener: EventListener<T>,
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener as EventListener);
      this.logger.debug(`[WorldModelEvents] 取消订阅事件: ${eventType}`);
    }
  }

  /**
   * 发布事件（内部方法）
   */
  private async emit(event: WorldModelEvent): Promise<void> {
    const listeners = this.listeners.get(event.type);
    if (listeners && listeners.size > 0) {
      // 并行执行所有监听器
      const promises = Array.from(listeners).map(async (listener) => {
        try {
          await listener(event);
        } catch (error: any) {
          this.logger.error(
            `[WorldModelEvents] 事件监听器执行失败: ${error.message}`,
            error.stack,
          );
        }
      });
      await Promise.all(promises);
    }
  }

  /**
   * 发布世界模型构建完成事件
   */
  async emitWorldModelBuilt(event: Omit<WorldModelBuiltEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: WorldModelBuiltEvent = {
      ...event,
      type: WorldModelEventType.WORLD_MODEL_BUILT,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布世界模型构建事件: tripId=${event.tripId}, buildTimeMs=${event.buildTimeMs}`,
    );
  }

  /**
   * 发布世界模型更新事件
   */
  async emitWorldModelUpdated(event: Omit<WorldModelEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: WorldModelEvent = {
      ...event,
      type: WorldModelEventType.WORLD_MODEL_UPDATED,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布世界模型更新事件: tripId=${event.tripId}`,
    );
  }

  /**
   * 发布实时状态更新事件
   */
  async emitRealtimeStateUpdated(event: Omit<WorldModelEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: WorldModelEvent = {
      ...event,
      type: WorldModelEventType.REALTIME_STATE_UPDATED,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布实时状态更新事件: tripId=${event.tripId}`,
    );
  }

  /**
   * 发布预测数据更新事件
   */
  async emitPredictionsUpdated(event: Omit<WorldModelEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: WorldModelEvent = {
      ...event,
      type: WorldModelEventType.PREDICTIONS_UPDATED,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布预测数据更新事件: tripId=${event.tripId}`,
    );
  }

  /**
   * 发布智能体贡献事件
   */
  async emitAgentContribution(event: Omit<AgentContributionEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: AgentContributionEvent = {
      ...event,
      type: WorldModelEventType.AGENT_CONTRIBUTION,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布智能体贡献事件: agentId=${event.agentId}, agentType=${event.agentType}`,
    );
  }

  /**
   * 发布用户贡献事件
   */
  async emitUserContribution(event: Omit<UserContributionEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: UserContributionEvent = {
      ...event,
      type: WorldModelEventType.USER_CONTRIBUTION,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布用户贡献事件: userId=${event.userId}, contributionId=${event.contributionId}`,
    );
  }

  /**
   * 发布版本创建事件
   */
  async emitVersionCreated(event: Omit<WorldModelEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: WorldModelEvent = {
      ...event,
      type: WorldModelEventType.VERSION_CREATED,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布版本创建事件: versionId=${event.metadata?.versionId}`,
    );
  }

  /**
   * 发布版本回滚事件
   */
  async emitVersionRolledBack(event: Omit<WorldModelEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: WorldModelEvent = {
      ...event,
      type: WorldModelEventType.VERSION_ROLLED_BACK,
      timestamp: new Date(),
    };

    await this.emit(fullEvent);
    this.logger.debug(
      `[WorldModelEvents] 发布版本回滚事件: versionId=${event.metadata?.versionId}`,
    );
  }
}
