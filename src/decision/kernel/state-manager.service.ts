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
    return {
      ...current,
      ...patch,
      lastUpdatedAt: now,
    };
  }
}
