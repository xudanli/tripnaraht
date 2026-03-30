// src/agent/infra/state-store.service.ts
/**
 * StateStore - 状态管理与版本控制
 * 
 * V2.1 架构核心服务，职责：
 * - PlanState / TripState 的集中管理
 * - 乐观锁与版本控制
 * - 事件化 patch（JSON Patch 格式）
 * - 检查点与回滚能力
 * - 补偿策略（Saga 风格）
 * 
 * 架构位置：Agent Infra 层
 * 
 * 规则（V2.1）：
 * - 只有核心层（PlanningCore / ExecutionCore）可以写入 StateStore
 * - 入口层、子智能体、Tools 都不能直接写入
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ============== 类型定义 ==============

/**
 * 状态类型
 */
export type StateType = 'PlanState' | 'TripState' | 'TripPlannerSession';

/**
 * JSON Patch 操作
 */
export interface JsonPatch {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * 状态变更记录
 */
export interface StateChange {
  changeId: string;
  stateId: string;
  stateType: StateType;
  version: number;
  previousVersion: number;
  
  // JSON Patch
  patches: JsonPatch[];
  
  // 元数据
  meta: {
    traceId: string;
    actor: string;          // 执行者（CoreAgent 名称）
    action: string;         // 动作类型
    reason: string;         // 变更原因
    timestamp: string;
  };
  
  // 回滚支持
  checkpointId?: string;           // 关联的检查点
  compensations?: Compensation[];  // 补偿动作（用于外部副作用回滚）
}

/**
 * 补偿动作（Saga 风格）
 */
export interface Compensation {
  type: 'api_call' | 'database' | 'notification' | 'external';
  target: string;
  action: string;
  params: Record<string, unknown>;
  executed: boolean;
  executedAt?: string;
}

/**
 * 检查点
 */
export interface Checkpoint {
  checkpointId: string;
  stateId: string;
  stateType: StateType;
  version: number;
  snapshot: unknown;          // 完整状态快照
  createdAt: string;
  createdBy: string;
  reason: string;
}

/**
 * 状态元数据
 */
export interface StateMeta {
  stateId: string;
  stateType: StateType;
  version: number;
  createdAt: string;
  updatedAt: string;
  lockedBy?: string;
  lockExpiresAt?: string;
}

/**
 * 写入结果
 */
export interface WriteResult {
  success: boolean;
  version: number;
  changeId?: string;
  error?: {
    code: 'VERSION_CONFLICT' | 'LOCKED' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'UNKNOWN';
    message: string;
    currentVersion?: number;
  };
}

/**
 * 回滚结果
 */
export interface RollbackResult {
  success: boolean;
  rolledBackTo: number;
  compensationsExecuted: number;
  error?: string;
}

@Injectable()
export class StateStoreService {
  private readonly logger = new Logger(StateStoreService.name);
  
  // 内存状态存储（生产环境应使用 Redis + DB）
  private states: Map<string, { data: unknown; meta: StateMeta }> = new Map();
  
  // 变更历史
  private changeHistory: Map<string, StateChange[]> = new Map();
  
  // 检查点
  private checkpoints: Map<string, Checkpoint[]> = new Map();
  
  // 锁超时时间（毫秒）
  private readonly LOCK_TIMEOUT_MS = 30000;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('🗄️ StateStore 已初始化');
  }

  // ============== 读取操作 ==============

  /**
   * 获取状态
   */
  async get<T>(stateId: string, stateType: StateType): Promise<{ data: T; meta: StateMeta } | null> {
    const key = this.getKey(stateId, stateType);
    const state = this.states.get(key);
    
    if (!state) {
      return null;
    }
    
    return {
      data: state.data as T,
      meta: state.meta,
    };
  }

  /**
   * 获取状态版本
   */
  async getVersion(stateId: string, stateType: StateType): Promise<number | null> {
    const state = await this.get(stateId, stateType);
    return state?.meta.version ?? null;
  }

  /**
   * 获取变更历史
   */
  async getHistory(stateId: string, stateType: StateType, limit = 50): Promise<StateChange[]> {
    const key = this.getKey(stateId, stateType);
    const history = this.changeHistory.get(key) || [];
    return history.slice(-limit);
  }

  /**
   * 获取检查点列表
   */
  async getCheckpoints(stateId: string, stateType: StateType): Promise<Checkpoint[]> {
    const key = this.getKey(stateId, stateType);
    return this.checkpoints.get(key) || [];
  }

  // ============== 写入操作（乐观锁） ==============

  /**
   * 创建状态
   */
  async create<T>(
    stateId: string,
    stateType: StateType,
    initialData: T,
    actor: string,
    traceId: string,
  ): Promise<WriteResult> {
    const key = this.getKey(stateId, stateType);
    
    // 检查是否已存在
    if (this.states.has(key)) {
      return {
        success: false,
        version: 0,
        error: {
          code: 'VALIDATION_ERROR',
          message: `State ${stateId} already exists`,
        },
      };
    }

    const now = new Date().toISOString();
    const meta: StateMeta = {
      stateId,
      stateType,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.states.set(key, { data: initialData, meta });
    
    // 记录创建变更
    const changeId = this.generateId('change');
    const change: StateChange = {
      changeId,
      stateId,
      stateType,
      version: 1,
      previousVersion: 0,
      patches: [{ op: 'add', path: '/', value: initialData }],
      meta: {
        traceId,
        actor,
        action: 'create',
        reason: 'Initial creation',
        timestamp: now,
      },
    };
    
    this.addToHistory(key, change);

    this.logger.debug(`[StateStore] 创建状态: ${stateType}/${stateId} v1`);

    return {
      success: true,
      version: 1,
      changeId,
    };
  }

  /**
   * 更新状态（乐观锁）
   */
  async update(
    stateId: string,
    stateType: StateType,
    patches: JsonPatch[],
    expectedVersion: number,
    actor: string,
    traceId: string,
    options?: {
      action?: string;
      reason?: string;
      compensations?: Compensation[];
    },
  ): Promise<WriteResult> {
    const key = this.getKey(stateId, stateType);
    const state = this.states.get(key);

    // 检查状态是否存在
    if (!state) {
      return {
        success: false,
        version: 0,
        error: {
          code: 'NOT_FOUND',
          message: `State ${stateId} not found`,
        },
      };
    }

    // 乐观锁检查
    if (state.meta.version !== expectedVersion) {
      this.logger.warn(`[StateStore] 版本冲突: ${stateType}/${stateId} expected=${expectedVersion} actual=${state.meta.version}`);
      return {
        success: false,
        version: state.meta.version,
        error: {
          code: 'VERSION_CONFLICT',
          message: `Version conflict: expected ${expectedVersion}, actual ${state.meta.version}`,
          currentVersion: state.meta.version,
        },
      };
    }

    // 检查锁
    if (state.meta.lockedBy && state.meta.lockExpiresAt) {
      const lockExpires = new Date(state.meta.lockExpiresAt).getTime();
      if (lockExpires > Date.now() && state.meta.lockedBy !== actor) {
        return {
          success: false,
          version: state.meta.version,
          error: {
            code: 'LOCKED',
            message: `State is locked by ${state.meta.lockedBy}`,
          },
        };
      }
    }

    // 应用 patches
    const newData = this.applyPatches(state.data, patches);
    const newVersion = state.meta.version + 1;
    const now = new Date().toISOString();

    // 更新状态
    state.data = newData;
    state.meta.version = newVersion;
    state.meta.updatedAt = now;

    // 记录变更
    const changeId = this.generateId('change');
    const change: StateChange = {
      changeId,
      stateId,
      stateType,
      version: newVersion,
      previousVersion: expectedVersion,
      patches,
      meta: {
        traceId,
        actor,
        action: options?.action || 'update',
        reason: options?.reason || 'State update',
        timestamp: now,
      },
      compensations: options?.compensations,
    };

    this.addToHistory(key, change);

    this.logger.debug(`[StateStore] 更新状态: ${stateType}/${stateId} v${expectedVersion} -> v${newVersion}`);

    return {
      success: true,
      version: newVersion,
      changeId,
    };
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(
    stateId: string,
    stateType: StateType,
    actor: string,
    reason: string,
  ): Promise<Checkpoint | null> {
    const state = await this.get(stateId, stateType);
    if (!state) {
      return null;
    }

    const checkpoint: Checkpoint = {
      checkpointId: this.generateId('checkpoint'),
      stateId,
      stateType,
      version: state.meta.version,
      snapshot: JSON.parse(JSON.stringify(state.data)), // 深拷贝
      createdAt: new Date().toISOString(),
      createdBy: actor,
      reason,
    };

    const key = this.getKey(stateId, stateType);
    const checkpointList = this.checkpoints.get(key) || [];
    checkpointList.push(checkpoint);
    this.checkpoints.set(key, checkpointList);

    this.logger.debug(`[StateStore] 创建检查点: ${stateType}/${stateId} v${state.meta.version}`);

    return checkpoint;
  }

  /**
   * 回滚到检查点
   */
  async rollbackToCheckpoint(
    stateId: string,
    stateType: StateType,
    checkpointId: string,
    actor: string,
    traceId: string,
  ): Promise<RollbackResult> {
    const key = this.getKey(stateId, stateType);
    const checkpointList = this.checkpoints.get(key) || [];
    const checkpoint = checkpointList.find(c => c.checkpointId === checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        rolledBackTo: 0,
        compensationsExecuted: 0,
        error: 'Checkpoint not found',
      };
    }

    const state = this.states.get(key);
    if (!state) {
      return {
        success: false,
        rolledBackTo: 0,
        compensationsExecuted: 0,
        error: 'State not found',
      };
    }

    // 获取需要回滚的变更
    const history = this.changeHistory.get(key) || [];
    const changesToRollback = history.filter(c => c.version > checkpoint.version);
    
    // 执行补偿动作
    let compensationsExecuted = 0;
    for (const change of changesToRollback.reverse()) {
      if (change.compensations) {
        for (const comp of change.compensations) {
          if (!comp.executed) {
            await this.executeCompensation(comp);
            compensationsExecuted++;
          }
        }
      }
    }

    // 恢复状态
    const newVersion = state.meta.version + 1;
    const now = new Date().toISOString();
    
    state.data = JSON.parse(JSON.stringify(checkpoint.snapshot));
    state.meta.version = newVersion;
    state.meta.updatedAt = now;

    // 记录回滚变更
    const change: StateChange = {
      changeId: this.generateId('change'),
      stateId,
      stateType,
      version: newVersion,
      previousVersion: state.meta.version - 1,
      patches: [{ op: 'replace', path: '/', value: checkpoint.snapshot }],
      meta: {
        traceId,
        actor,
        action: 'rollback',
        reason: `Rollback to checkpoint ${checkpointId}`,
        timestamp: now,
      },
      checkpointId,
    };

    this.addToHistory(key, change);

    this.logger.log(`[StateStore] 回滚成功: ${stateType}/${stateId} -> v${checkpoint.version} (checkpoint)`);

    return {
      success: true,
      rolledBackTo: checkpoint.version,
      compensationsExecuted,
    };
  }

  /**
   * 获取锁
   */
  async acquireLock(
    stateId: string,
    stateType: StateType,
    actor: string,
  ): Promise<boolean> {
    const state = await this.get(stateId, stateType);
    if (!state) {
      return false;
    }

    // 检查现有锁
    if (state.meta.lockedBy && state.meta.lockExpiresAt) {
      const lockExpires = new Date(state.meta.lockExpiresAt).getTime();
      if (lockExpires > Date.now() && state.meta.lockedBy !== actor) {
        return false;
      }
    }

    // 设置锁
    state.meta.lockedBy = actor;
    state.meta.lockExpiresAt = new Date(Date.now() + this.LOCK_TIMEOUT_MS).toISOString();

    return true;
  }

  /**
   * 释放锁
   */
  async releaseLock(
    stateId: string,
    stateType: StateType,
    actor: string,
  ): Promise<boolean> {
    const state = await this.get(stateId, stateType);
    if (!state) {
      return false;
    }

    if (state.meta.lockedBy === actor) {
      state.meta.lockedBy = undefined;
      state.meta.lockExpiresAt = undefined;
      return true;
    }

    return false;
  }

  // ============== 降级策略 ==============

  /**
   * Rebase 并重试（处理版本冲突）
   */
  async rebaseAndRetry<T>(
    stateId: string,
    stateType: StateType,
    patchGenerator: (currentData: T) => JsonPatch[],
    actor: string,
    traceId: string,
    maxRetries = 3,
  ): Promise<WriteResult> {
    let retries = 0;
    
    while (retries < maxRetries) {
      const state = await this.get<T>(stateId, stateType);
      if (!state) {
        return {
          success: false,
          version: 0,
          error: { code: 'NOT_FOUND', message: 'State not found' },
        };
      }

      const patches = patchGenerator(state.data);
      const result = await this.update(
        stateId,
        stateType,
        patches,
        state.meta.version,
        actor,
        traceId,
        { action: 'rebase_retry', reason: `Retry ${retries + 1}` },
      );

      if (result.success || result.error?.code !== 'VERSION_CONFLICT') {
        return result;
      }

      retries++;
      this.logger.warn(`[StateStore] 版本冲突，重试 ${retries}/${maxRetries}`);
      
      // 短暂延迟后重试
      await new Promise(resolve => setTimeout(resolve, 100 * retries));
    }

    return {
      success: false,
      version: 0,
      error: {
        code: 'VERSION_CONFLICT',
        message: `Failed after ${maxRetries} retries`,
      },
    };
  }

  // ============== 私有方法 ==============

  private getKey(stateId: string, stateType: StateType): string {
    return `${stateType}:${stateId}`;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addToHistory(key: string, change: StateChange): void {
    const history = this.changeHistory.get(key) || [];
    history.push(change);
    
    // 保留最近 1000 条记录
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
    
    this.changeHistory.set(key, history);
  }

  private applyPatches(data: unknown, patches: JsonPatch[]): unknown {
    // 简化的 JSON Patch 实现（生产环境应使用 fast-json-patch）
    let result = JSON.parse(JSON.stringify(data));
    
    for (const patch of patches) {
      const pathParts = patch.path.split('/').filter(p => p);
      
      switch (patch.op) {
        case 'replace':
        case 'add':
          if (pathParts.length === 0) {
            result = patch.value;
          } else {
            let current = result;
            for (let i = 0; i < pathParts.length - 1; i++) {
              current = current[pathParts[i]];
            }
            current[pathParts[pathParts.length - 1]] = patch.value;
          }
          break;
        case 'remove':
          if (pathParts.length > 0) {
            let current = result;
            for (let i = 0; i < pathParts.length - 1; i++) {
              current = current[pathParts[i]];
            }
            delete current[pathParts[pathParts.length - 1]];
          }
          break;
      }
    }
    
    return result;
  }

  private async executeCompensation(compensation: Compensation): Promise<void> {
    this.logger.debug(`[StateStore] 执行补偿动作: ${compensation.type} - ${compensation.action}`);
    
    // TODO: 实际执行补偿动作
    // 这里需要根据 compensation.type 调用相应的服务
    
    compensation.executed = true;
    compensation.executedAt = new Date().toISOString();
  }
}
