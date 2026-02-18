/**
 * State Manager Service
 *
 * Phase 2.2: 统一 User/Trip/Environment 状态读写
 * 职责：合并 patch 到 DecisionState，保证嵌套对象正确合并
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md
 */

import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class StateManagerService {
  private readonly logger = new Logger(StateManagerService.name);

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
    this.logger.debug(
      `[StateManager] Committed: requestId=${transaction.requestId}, version ${currentVersion}→${newVersion}`,
    );
    return { newState: withHistory, newVersion };
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
    return deltas;
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
