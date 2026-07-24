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
import { DistributedLockService } from '../../redis/distributed-lock.service';
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
  StateCommitPhaseViolationError,
  STAGE_PRIORITY,
  VerificationReport,
} from './decision-state.types';
import { mergeTravelOntologyState } from './travel-ontology.mapper';
import { ContextCacheEvictionService } from '../../agent/context-engine/services/context-cache-eviction.service';

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
  private readonly strictStability = process.env.DECISION_OS_STABILITY_STRICT === '1';
  private readonly strictPhaseWrite = process.env.DECISION_OS_PHASE_STRICT === '1';

  /**
   * 阶段→允许写入的字段前缀（最小可行矩阵）
   * - 专利步骤三：阶段合法性校验（写入字段必须与当前阶段匹配）
   * - 采用“前缀匹配”：touchedPath 必须以某个 allowedPrefix 开头
   */
  private readonly phaseWritePolicy: Record<string, string[]> = {
    // 同步步骤：允许全量 patch（用于 bridge/兼容路径）；严格模式下仍建议由上层控制
    STATE_UPDATE: [''],

    INTAKE: ['userIntent', 'systemState', 'history', 'requestId'],
    RESEARCH: [
      'environmentState',
      'worldStateSummary',
      'uncertaintyProfile',
      'beliefSamples',
      'harnessRuntime',
      'systemState',
      'history',
      'requestId',
    ],
    GATE_EVAL: ['constraints', 'tripState.orchestratorAlternatives', 'systemState', 'history', 'requestId'],
    CONTEXT_BUILD: ['contextPackage', 'systemState', 'history', 'requestId'],
    PLAN_GEN: ['tripState.planDraft', 'tripState.planVersion', 'candidates', 'systemState', 'history', 'requestId'],
    OPTIMIZE: ['optimizationHints', 'tripState.fatigue', 'tripState.planDraft', 'environmentState', 'constraints', 'research_data', 'systemState', 'history', 'requestId'],
    VERIFY: ['confidence', 'systemState', 'history', 'requestId'],
    REPAIR: ['tripState.planDraft', 'systemState', 'history', 'requestId'],
    NARRATE: ['systemState', 'history', 'requestId'],
    FEEDBACK: ['feedback', 'systemState', 'history', 'requestId'],
  };

  constructor(
    @Optional() private readonly dsoStability?: DSOStabilityMonitorService,
    @Optional() private readonly distributedLock?: DistributedLockService,
    @Optional() private readonly contextCacheEviction?: ContextCacheEvictionService,
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
    if (patch.travelOntologyState !== undefined) {
      updated.travelOntologyState = mergeTravelOntologyState(
        current.travelOntologyState,
        patch.travelOntologyState,
      );
    }
    if (patch.harnessRuntime !== undefined) {
      updated.harnessRuntime = {
        ...(current.harnessRuntime ?? {}),
        ...patch.harnessRuntime,
      };
    }
    // Phase 1 POI：patch 显式携带时合并（此前 merge 未拷贝，STATE_UPDATE 写入的 slice 会丢失）
    if (patch.poiPlanning !== undefined) {
      updated.poiPlanning = patch.poiPlanning;
    }
    if (patch.verification !== undefined) {
      updated.verification = this.mergeVerificationReport(current.verification, patch.verification);
    }
    if (patch.research_data !== undefined) {
      updated.research_data = {
        ...(current.research_data ?? {}),
        ...patch.research_data,
      };
    }
    if (patch.uncertaintyProfile !== undefined) {
      updated.uncertaintyProfile = { ...(current.uncertaintyProfile ?? {}), ...patch.uncertaintyProfile };
    }
    if (patch.worldStateSummary !== undefined) {
      updated.worldStateSummary = patch.worldStateSummary;
    }
    if (patch.beliefSamples !== undefined) {
      updated.beliefSamples = patch.beliefSamples;
    }

    this.logger.debug(`[StateManager] Merged: requestId=${updated.requestId}, phase=${updated.systemState.currentPhase}`);
    return updated;
  }

  /** 合并 VERIFY 全量报告与 REPAIR 局部补丁（如仅 escalationPlan） */
  private mergeVerificationReport(
    current: VerificationReport | undefined,
    patch: Partial<VerificationReport>,
  ): VerificationReport {
    const base: VerificationReport =
      current ??
      ({
        issues: [],
        hasFatal: false,
        hasConflict: false,
        hasAdvisory: false,
        counts: { fatal: 0, conflict: 0, advisory: 0 },
        verifiedAt: patch.verifiedAt ?? new Date().toISOString(),
      } satisfies VerificationReport);
    const issues = patch.issues !== undefined ? patch.issues : base.issues;
    const counts =
      patch.counts ??
      ((): VerificationReport['counts'] => {
        let fatal = 0;
        let conflict = 0;
        let advisory = 0;
        for (const i of issues) {
          if (i.class === 'FATAL') fatal += 1;
          else if (i.class === 'CONFLICT') conflict += 1;
          else if (i.class === 'ADVISORY') advisory += 1;
        }
        return { fatal, conflict, advisory };
      })();
    return {
      issues,
      hasFatal: patch.hasFatal !== undefined ? patch.hasFatal : counts.fatal > 0,
      hasConflict: patch.hasConflict !== undefined ? patch.hasConflict : counts.conflict > 0,
      hasAdvisory: patch.hasAdvisory !== undefined ? patch.hasAdvisory : counts.advisory > 0,
      counts,
      verifiedAt: patch.verifiedAt ?? base.verifiedAt,
      escalationPlan: patch.escalationPlan !== undefined ? patch.escalationPlan : base.escalationPlan,
    };
  }

  /**
   * v1.0 推荐入口：将阶段结果以原子提交写入 DSO（推进 `version` 与 `lastStep`）。
   * 与 {@link commit} 等价，显式表达「仅允许经此路径做版本化写」的语义。
   */
  applyPhaseResult(
    current: DecisionState,
    patch: DecisionStatePatch,
    phase: string,
  ): StateCommitResult {
    const requestId = current.systemState?.requestId ?? current.requestId ?? '';
    return this.commit(
      {
        requestId,
        expectedVersion: current.systemState?.version ?? 0,
        patch,
        stageOutput: phase,
      },
      current,
    );
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
    return {
      ...current,
      ...patch,
      lastUpdatedAt: now,
      // version 仅在 commit() 时递增；merge() 不应产生“伪提交”的版本推进
      version: patch?.version ?? current.version ?? 0,
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

    // 事务锁：VERIFY→REPAIR 临界区只允许提交 VERIFY/REPAIR（避免半执行态被其它阶段覆盖）
    const lock = current.systemState?.stageLock;
    if (lock?.locked) {
      const stage = (transaction.stageOutput ?? '').toString().trim();
      const allowed = new Set(lock.allowedStages ?? []);
      if (!allowed.has(stage as any)) {
        const msg = `[StateManager] stageLock 拒绝提交: lockedBy=${lock.owner} stage=${stage} allowed=${JSON.stringify(
          lock.allowedStages,
        )}`;
        // 事务锁属于正确性保护：默认严格拒绝
        throw new Error(msg);
      }
    }

    // 阶段合法性校验（专利步骤三）
    const phase = (transaction.stageOutput ?? current.systemState?.currentPhase ?? '').toString();
    const touchedPaths = this.computeTouchedPaths(transaction.patch);
    const allowedPrefixes = this.phaseWritePolicy[phase] ?? [''];
    const phaseOk = this.isPatchAllowedByPhase(touchedPaths, allowedPrefixes);
    if (!phaseOk) {
      const msg = `[StateManager] 阶段合法性校验失败: phase=${phase} touched=${JSON.stringify(touchedPaths)} allowed=${JSON.stringify(allowedPrefixes)}`;
      if (this.strictPhaseWrite) {
        throw new StateCommitPhaseViolationError(phase, touchedPaths, allowedPrefixes);
      } else {
        this.logger.warn(msg);
      }
    }

    // 先合并 patch（不递增版本），commit 成功时再一次性推进版本号
    const mergedDraft = this.merge(current, transaction.patch);
    const deltas = this.buildHistoryDeltasFromPatch(transaction.patch, transaction.stageOutput);
    let withHistory = mergedDraft;
    for (const d of deltas) {
      withHistory = this.appendHistoryDelta(withHistory, d);
    }

    // 递增版本号并提交（原子语义：一次 commit 只推进一次版本）
    const newVersion = currentVersion + 1;
    const stage = transaction.stageOutput?.toString().trim();
    withHistory = this.merge(withHistory, {
      systemState: {
        requestId: withHistory.systemState.requestId,
        version: newVersion,
        ...(stage ? { lastStep: stage } : {}),
      },
    });

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
          if (this.strictStability) {
            const rolledBack = this.appendHistoryDelta(current, {
              type: 'kernel_arbitration',
              at: new Date().toISOString(),
              summary: 'stability violation: rollback to previous stable state',
              payload: {
                status: 'ROLLED_BACK',
                reason: 'LYAPUNOV_INCREASE',
                v_prev: vPrev,
                v_new: vNew,
                expected_version: transaction.expectedVersion,
                attempted_new_version: newVersion,
              },
            });
            return {
              newState: rolledBack,
              newVersion: currentVersion,
              rolledBack: true,
              rollbackReason: 'LYAPUNOV_INCREASE',
            };
          }
        }
      } catch (err) {
        this.logger.debug(`[StateManager] DSO 稳定性校验跳过: ${(err as Error)?.message}`);
      }
    }

    this.logger.debug(
      `[StateManager] Committed: requestId=${transaction.requestId}, version ${currentVersion}→${newVersion}`,
    );

    void this.evictContextCacheAfterCommit(withHistory, currentVersion);

    return { newState: withHistory, newVersion };
  }

  private extractTripIdForCacheEviction(state: DecisionState): string | null {
    const fromOntology = state.travelOntologyState?.tripId?.trim();
    if (fromOntology) return fromOntology;
    const meta = (state as { metadata?: { tripId?: string; trip_id?: string } }).metadata;
    const fromMeta = meta?.tripId?.trim() || meta?.trip_id?.trim();
    return fromMeta || null;
  }

  private async evictContextCacheAfterCommit(
    state: DecisionState,
    supersededVersion: number,
  ): Promise<void> {
    if (!this.contextCacheEviction) return;
    const tripId = this.extractTripIdForCacheEviction(state);
    if (!tripId) return;
    try {
      await this.contextCacheEviction.evictSupersededDsoVersion({
        tripId,
        supersededVersion,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[StateManager] Context cache eviction failed: ${msg}`);
    }
  }

  /**
   * 批量原子提交（专利并发示例：同 base version、无字段冲突的多个增量 → 一次提交）
   * - 所有 transaction.expectedVersion 必须等于 currentVersion
   * - touchedPaths 两两不允许相同/前缀重叠（例如 tripState 与 tripState.planDraft 视为冲突）
   * - 成功时仅推进一次 version
   */
  commitBatch(transactions: StateUpdateTransaction[], current: DecisionState): StateCommitResult {
    if (transactions.length === 0) {
      return { newState: current, newVersion: current.systemState?.version ?? 0 };
    }

    const currentVersion = current.systemState?.version ?? 0;
    for (const tx of transactions) {
      if (tx.expectedVersion !== currentVersion) {
        throw new StateCommitConflictError(tx.expectedVersion, currentVersion);
      }
    }

    const perTxTouched = transactions.map((tx) => ({
      tx,
      touched: this.computeTouchedPaths(tx.patch),
    }));

    // 字段冲突检测：任意路径相同或前缀重叠都视为冲突（不可在同一提交窗口合并）
    for (let i = 0; i < perTxTouched.length; i++) {
      for (let j = i + 1; j < perTxTouched.length; j++) {
        if (this.hasPathConflict(perTxTouched[i].touched, perTxTouched[j].touched)) {
          throw new Error(
            `State batch commit field conflict: tx#${i} touched=${JSON.stringify(perTxTouched[i].touched)} vs tx#${j} touched=${JSON.stringify(perTxTouched[j].touched)}`,
          );
        }
      }
    }

    // 阶段合法性校验：对每个 tx 单独校验其 touchedPaths
    for (const { tx, touched } of perTxTouched) {
      const phase = (tx.stageOutput ?? current.systemState?.currentPhase ?? '').toString();
      const allowedPrefixes = this.phaseWritePolicy[phase] ?? [''];
      const phaseOk = this.isPatchAllowedByPhase(touched, allowedPrefixes);
      if (!phaseOk) {
        const msg = `[StateManager] commitBatch 阶段合法性校验失败: phase=${phase} touched=${JSON.stringify(touched)} allowed=${JSON.stringify(allowedPrefixes)}`;
        if (this.strictPhaseWrite) {
          throw new StateCommitPhaseViolationError(phase, touched, allowedPrefixes);
        } else {
          this.logger.warn(msg);
        }
      }
    }

    // 合并所有 patch（不递增版本），并追加 history
    let draft = current;
    for (const tx of transactions) {
      draft = this.merge(draft, tx.patch);
      const deltas = this.buildHistoryDeltasFromPatch(tx.patch, tx.stageOutput);
      for (const d of deltas) {
        draft = this.appendHistoryDelta(draft, d);
      }
    }

    // 一次性版本推进
    const newVersion = currentVersion + 1;
    const batchStage = transactions[transactions.length - 1]?.stageOutput?.toString().trim();
    draft = this.merge(draft, {
      systemState: {
        requestId: draft.systemState.requestId,
        version: newVersion,
        ...(batchStage ? { lastStep: batchStage } : {}),
      },
    });

    // 稳定性校验（与 commit() 行为对齐）
    if (this.dsoStability) {
      try {
        const vPrev = this.dsoStability.computeDSOLyapunov(current, current);
        const vNew = this.dsoStability.computeDSOLyapunov(current, draft);
        const stable = this.dsoStability.checkStability(vNew, vPrev);
        if (!stable) {
          this.logger.warn(
            `[StateManager] (batch) DSO 稳定性校验: V_new=${vNew.toFixed(4)} > V_prev=${vPrev.toFixed(4)}`,
          );
          if (this.strictStability) {
            const rolledBack = this.appendHistoryDelta(current, {
              type: 'kernel_arbitration',
              at: new Date().toISOString(),
              summary: 'batch stability violation: rollback to previous stable state',
              payload: {
                status: 'ROLLED_BACK',
                reason: 'LYAPUNOV_INCREASE',
                v_prev: vPrev,
                v_new: vNew,
                expected_version: currentVersion,
                attempted_new_version: newVersion,
                tx_count: transactions.length,
              },
            });
            return {
              newState: rolledBack,
              newVersion: currentVersion,
              rolledBack: true,
              rollbackReason: 'LYAPUNOV_INCREASE',
            };
          }
        }
      } catch (err) {
        this.logger.debug(`[StateManager] (batch) DSO 稳定性校验跳过: ${(err as Error)?.message}`);
      }
    }

    this.logger.debug(
      `[StateManager] Committed batch: requestId=${transactions[0].requestId}, tx=${transactions.length}, version ${currentVersion}→${newVersion}`,
    );
    void this.evictContextCacheAfterCommit(draft, currentVersion);
    return { newState: draft, newVersion };
  }

  private isPatchAllowedByPhase(touchedPaths: string[], allowedPrefixes: string[]): boolean {
    // allowedPrefixes 包含 '' 表示允许全部
    if (allowedPrefixes.some((p) => p === '')) return true;
    return touchedPaths.every((path) => allowedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + '.')));
  }

  /**
   * 计算 patch 触碰的字段路径（点分隔）
   * - 只遍历 patch 的“存在键”，不尝试做深度 diff
   * - 数组按整体字段处理（例如 tripState.planDraft）
   */
  private computeTouchedPaths(patch: DecisionStatePatch): string[] {
    const out: string[] = [];
    const walk = (obj: any, base: string) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        out.push(base);
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        const next = base ? `${base}.${k}` : k;
        // 仅记录“叶子路径”：避免同时记录 tripState 与 tripState.planDraft 造成虚假冲突/非法提示
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          // 对嵌套对象：记录对象根路径（用于冲突检测/阶段校验），但避免记录顶层容器（如 tripState）
          if (base) out.push(next);
          walk(v, next);
        } else {
          out.push(next);
        }
      }
    };
    walk(patch as any, '');
    // 去重 + 排序，便于测试稳定
    return Array.from(new Set(out)).sort();
  }

  private hasPathConflict(a: string[], b: string[]): boolean {
    for (const pa of a) {
      for (const pb of b) {
        if (pa === pb) return true;
        if (pa && pb && (pa.startsWith(pb + '.') || pb.startsWith(pa + '.'))) return true;
      }
    }
    return false;
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
