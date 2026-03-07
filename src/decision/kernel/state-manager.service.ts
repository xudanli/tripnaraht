/**
 * State Manager Service
 *
 * Phase 2.2: 统一 User/Trip/Environment 状态读写
 * 职责：合并 patch 到 DecisionState，保证嵌套对象正确合并
 *
 * 专利 4.14.3：commit 后可选调用 DSOStabilityMonitor 校验 V(DSO_t)≤V(DSO_{t−1})
 * P0 优化：集成分布式锁，支持多节点部署的状态一致性
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DSOStabilityMonitorService } from '../../trips/decision/optimization/theory/dso-stability.service';
import { DistributedLockService, LockHandle } from '../../redis/distributed-lock.service';
import {
  DecisionState,
  DecisionStatePatch,
  UserIntent,
  TripState,
  EnvironmentState,
  SystemState,
  DecisionMeta,
  DecisionStateHistory,
  StateHistoryDelta,
  StateUpdateTransaction,
  StateCommitResult,
  StateCommitConflictError,
  STAGE_PRIORITY,
} from './decision-state.types';

/** 分布式提交配置 */
export interface DistributedCommitConfig {
  /** 是否启用分布式锁（生产环境建议启用） */
  useDistributedLock: boolean;
  /** 锁超时时间（毫秒） */
  lockTtlMs: number;
  /** 锁获取重试次数 */
  lockRetryCount: number;
}

const DEFAULT_DISTRIBUTED_CONFIG: DistributedCommitConfig = {
  useDistributedLock: true,
  lockTtlMs: 10000,
  lockRetryCount: 3,
};

@Injectable()
export class StateManagerService {
  private readonly logger = new Logger(StateManagerService.name);

  constructor(
    @Optional() private readonly dsoStability?: DSOStabilityMonitorService,
    @Optional() private readonly distributedLock?: DistributedLockService,
  ) {
    if (distributedLock) {
      this.logger.log('[StateManager] 分布式锁服务已注入，支持多节点一致性');
    }
  }

  /**
   * 合并 patch 到当前状态，返回新状态（不可变）
   */
  merge(current: DecisionState, patch: DecisionStatePatch): DecisionState {
    const updated: DecisionState = {
      ...current,
      userIntent: this.mergeUserIntent(current.userIntent, patch.userIntent),
      tripState: this.mergeTripState(current.tripState, patch.tripState),
      environmentState: this.mergeEnvironmentState(current.environmentState, patch.environmentState),
      systemState: this.mergeSystemState(current.systemState, patch.systemState),
      requestId: patch.requestId ?? current.requestId,
    };

    if (patch.constraints !== undefined) updated.constraints = patch.constraints;
    if (patch.candidates !== undefined) updated.candidates = patch.candidates;
    if (patch.optimizationHints !== undefined) updated.optimizationHints = patch.optimizationHints;
    if (patch.riskLevel !== undefined) updated.riskLevel = patch.riskLevel;
    if (patch.contextPackage !== undefined) updated.contextPackage = patch.contextPackage;
    if (patch.decisionMeta !== undefined) updated.decisionMeta = this.mergeDecisionMeta(current.decisionMeta, patch.decisionMeta);
    if (patch.history !== undefined) updated.history = this.mergeHistory(current.history, patch.history);
    if (patch.confidence !== undefined) updated.confidence = patch.confidence;
    if (patch.feedback !== undefined) updated.feedback = { ...(current.feedback ?? {}), ...patch.feedback };

    this.logger.debug(`[StateManager] Merged: requestId=${updated.requestId}, phase=${updated.systemState.currentPhase}`);
    return updated;
  }

  private mergeUserIntent(current: UserIntent, patch?: Partial<UserIntent>): UserIntent {
    if (!patch) return current;
    return { ...current, ...patch };
  }

  private mergeTripState(current: TripState, patch?: Partial<TripState>): TripState {
    if (!patch) return current;
    return { ...current, ...patch };
  }

  private mergeEnvironmentState(current: EnvironmentState, patch?: Partial<EnvironmentState>): EnvironmentState {
    if (!patch) return current;
    return { ...current, ...patch };
  }

  private mergeSystemState(current: SystemState, patch?: Partial<SystemState>): SystemState {
    const now = new Date().toISOString();
    const nextVersion = (current.version ?? 0) + 1;
    return {
      ...current,
      ...patch,
      lastUpdatedAt: now,
      version: nextVersion,
    };
  }

  private mergeDecisionMeta(current?: DecisionMeta, patch?: Partial<DecisionMeta>): DecisionMeta | undefined {
    if (!patch) return current;
    return { ...current, ...patch };
  }

  /** history: 追加新条目，不覆盖（Token 优化：只保留最近 N 条可在外层控制） */
  private mergeHistory(current?: DecisionStateHistory, patch?: DecisionStateHistory): DecisionStateHistory | undefined {
    if (!patch || patch.length === 0) return current;
    const base = current ?? [];
    return [...base, ...patch];
  }

  /**
   * 冲突解决（专利权利要求 5、6：阶段优先级或时间戳）
   * 当多源更新同一字段时，高优先级阶段覆盖
   */
  resolveConflict(
    current: Partial<DecisionState>,
    incoming: Partial<DecisionState>,
    strategy: 'STAGE_PRIORITY' | 'TIMESTAMP_WINS' = 'STAGE_PRIORITY',
  ): Partial<DecisionState> {
    if (strategy === 'TIMESTAMP_WINS') {
      const currTs = current.systemState?.lastUpdatedAt ?? '';
      const incTs = incoming.systemState?.lastUpdatedAt ?? '';
      return incTs > currTs ? incoming : current;
    }
    const currP = STAGE_PRIORITY[current.systemState?.currentPhase ?? ''] ?? 0;
    const incP = STAGE_PRIORITY[incoming.systemState?.currentPhase ?? ''] ?? 0;
    return incP >= currP ? incoming : current;
  }

  /**
   * 原子提交（专利权利要求 7）
   * 校验版本 → 合并 → 追加 history → 更新版本
   * @throws StateCommitConflictError 当 expectedVersion 不匹配时
   */
  commit(transaction: StateUpdateTransaction, current: DecisionState): StateCommitResult {
    const currentVersion = current.systemState?.version ?? 0;
    if (transaction.expectedVersion !== currentVersion) {
      throw new StateCommitConflictError(transaction.expectedVersion, currentVersion);
    }
    const merged = this.merge(current, transaction.patch);
    const deltas = this.buildHistoryDeltasFromPatch(transaction.patch, transaction.stageOutput);
    let withHistory = merged;
    for (const d of deltas) {
      withHistory = this.appendHistoryDelta(withHistory, d);
    }
    const newVersion = withHistory.systemState?.version ?? currentVersion + 1;

    // 专利 4.14.3：commit 后可选校验 DSO 稳定性 V(DSO_t)≤V(DSO_{t−1})
    if (this.dsoStability) {
      try {
        const vPrev = this.dsoStability.computeDSOLyapunov(current, current);
        const vNew = this.dsoStability.computeDSOLyapunov(current, withHistory);
        const stable = this.dsoStability.checkStability(vNew, vPrev);
        if (!stable) {
          this.logger.warn(
            `[StateManager] DSO 稳定性校验: V_new=${vNew.toFixed(4)} > V_prev=${vPrev.toFixed(4)}`,
          );
        }
      } catch (err) {
        this.logger.debug(`[StateManager] DSO 稳定性校验跳过: ${(err as Error)?.message}`);
      }
    }

    this.logger.debug(
      `[StateManager] Committed: requestId=${transaction.requestId}, version ${currentVersion}→${newVersion}`,
    );
    return { newState: withHistory, newVersion };
  }

  /**
   * 分布式原子提交（P0 优化：多节点部署支持）
   * 
   * 使用分布式锁保护 commit 操作，确保跨节点状态一致性
   * 1. 获取分布式锁
   * 2. 执行原子提交
   * 3. 释放锁
   * 
   * @throws StateCommitConflictError 版本冲突
   * @throws Error 锁获取失败
   */
  async commitWithLock(
    transaction: StateUpdateTransaction,
    current: DecisionState,
    config: Partial<DistributedCommitConfig> = {},
  ): Promise<StateCommitResult> {
    const finalConfig = { ...DEFAULT_DISTRIBUTED_CONFIG, ...config };
    const resourceId = transaction.requestId;

    // 如果未启用分布式锁或服务不可用，回退到本地提交
    if (!finalConfig.useDistributedLock || !this.distributedLock) {
      this.logger.debug(`[StateManager] 使用本地提交模式: requestId=${resourceId}`);
      return this.commit(transaction, current);
    }

    // 获取分布式锁
    const lockResult = await this.distributedLock.acquire(resourceId, {
      ttlMs: finalConfig.lockTtlMs,
      retryCount: finalConfig.lockRetryCount,
    });

    if (!lockResult.success || !lockResult.handle) {
      const error = `无法获取分布式锁: ${resourceId}, attempts=${lockResult.attempts}`;
      this.logger.error(`[StateManager] ${error}`);
      throw new Error(error);
    }

    try {
      // 执行原子提交
      const result = this.commit(transaction, current);
      
      this.logger.debug(
        `[StateManager] 分布式提交成功: requestId=${resourceId}, version=${result.newVersion}`,
      );
      
      return result;
    } finally {
      // 确保释放锁
      await this.distributedLock.release(lockResult.handle);
    }
  }

  /**
   * 带锁执行状态更新（推荐用于复杂更新场景）
   * 
   * 自动管理锁的获取和释放，支持自定义更新逻辑
   */
  async withStateLock<T>(
    requestId: string,
    callback: () => Promise<T>,
    config: Partial<DistributedCommitConfig> = {},
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const finalConfig = { ...DEFAULT_DISTRIBUTED_CONFIG, ...config };

    // 如果未启用分布式锁或服务不可用，直接执行
    if (!finalConfig.useDistributedLock || !this.distributedLock) {
      try {
        const result = await callback();
        return { success: true, result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }

    // 使用分布式锁包装执行
    return this.distributedLock.withLock(requestId, callback, {
      ttlMs: finalConfig.lockTtlMs,
      retryCount: finalConfig.lockRetryCount,
    });
  }

  /**
   * 检查资源是否被锁定
   */
  async isResourceLocked(requestId: string): Promise<boolean> {
    if (!this.distributedLock) {
      return false;
    }
    return this.distributedLock.isLocked(requestId);
  }

  private buildHistoryDeltasFromPatch(
    patch: DecisionStatePatch,
    stageOutput?: string,
  ): Array<StateHistoryDelta & { at?: string }> {
    const now = new Date().toISOString();
    const deltas: Array<StateHistoryDelta & { at?: string }> = [];
    if (patch.userIntent) {
      deltas.push({ type: 'userIntent', summary: stageOutput ?? 'userIntent updated', at: now });
    }
    if (patch.environmentState) {
      deltas.push({ type: 'weather', summary: stageOutput ?? 'environmentState updated', at: now });
    }
    if (patch.constraints) {
      deltas.push({ type: 'constraints', summary: stageOutput ?? 'constraints updated', at: now });
    }
    if (patch.tripState?.planDraft) {
      deltas.push({ type: 'plan', summary: stageOutput ?? 'plan draft updated', at: now });
    }
    if (patch.feedback) {
      deltas.push({ type: 'feedback', summary: stageOutput ?? 'user feedback submitted', at: now });
    }
    return deltas;
  }

  /**
   * 约束一致性验证（专利性质 4）
   * 若 STATE_UPDATE 采用原子提交机制，则 DSO 与内核期望一致
   * 校验：version 存在、lastUpdatedAt 存在、无结构异常
   * 参考：docs/Decision_OS_技术交底书.md 3.10 性质 4
   */
  verifyConsistency(dso: DecisionState): { consistent: boolean; reason?: string } {
    const sys = dso.systemState;
    if (!sys) {
      return { consistent: false, reason: 'systemState 缺失' };
    }
    if (typeof sys.version !== 'number' || sys.version < 0) {
      return { consistent: false, reason: `version 无效: ${sys.version}` };
    }
    if (!sys.lastUpdatedAt || typeof sys.lastUpdatedAt !== 'string') {
      return { consistent: false, reason: 'lastUpdatedAt 缺失' };
    }
    return { consistent: true };
  }

  /**
   * 追加状态变化差分（Token 优化：只记录变化）
   * @param maxEntries 可选：限制 history 长度，超出时丢弃最旧
   */
  appendHistoryDelta(
    current: DecisionState,
    delta: StateHistoryDelta,
    maxEntries = 50,
  ): DecisionState {
    const entry: StateHistoryDelta = {
      ...delta,
      at: delta.at ?? new Date().toISOString(),
    };
    const base = current.history ?? [];
    const next = [...base, entry];
    const trimmed = next.length > maxEntries ? next.slice(-maxEntries) : next;
    return { ...current, history: trimmed };
  }
}
