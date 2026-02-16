/**
 * Decision Kernel Service
 *
 * Phase 2.1: Decision Kernel 中心化架构入口
 * 职责：协调 State Manager、Constraint Engine、Optimization Engine、Context Engine
 *
 * 核心原则：Kernel 是系统大脑，所有 Agent 依赖它
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionState, DecisionStatePatch } from './decision-state.types';
import { StateManagerService } from './state-manager.service';
import { ConstraintEngineAdapterService } from './constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import { ContextEngineAdapterService, ContextPackageOverrides } from './context-engine-adapter.service';

@Injectable()
export class DecisionKernelService {
  private readonly logger = new Logger(DecisionKernelService.name);

  constructor(
    private readonly stateManager: StateManagerService,
    private readonly constraintAdapter: ConstraintEngineAdapterService,
    private readonly optimizationAdapter: OptimizationEngineAdapterService,
    private readonly contextAdapter: ContextEngineAdapterService,
  ) {}

  /**
   * 创建初始 DecisionState
   */
  createInitialState(requestId: string): DecisionState {
    return {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
      requestId,
    };
  }

  /**
   * 更新状态（委托 State Manager）
   */
  updateState(current: DecisionState, patch: DecisionStatePatch): DecisionState {
    return this.stateManager.merge(current, patch);
  }

  /**
   * 获取 Constraint 报告（委托 Constraint Engine Adapter）
   */
  getConstraintReport(state: DecisionState): DecisionState['constraints'] {
    return this.constraintAdapter.getReport(state);
  }

  /**
   * 获取 Optimization Hints（委托 Optimization Engine Adapter）
   */
  getOptimizationHints(state: DecisionState): DecisionState['optimizationHints'] {
    return this.optimizationAdapter.getHints(state);
  }

  /**
   * 构建 Context Package（委托 Context Engine Adapter）
   * @param overrides 来自 Conductor 的 tripId/userId/userQuery 等
   */
  async getContextPackage(
    state: DecisionState,
    overrides?: ContextPackageOverrides,
  ): Promise<DecisionState['contextPackage']> {
    return this.contextAdapter.buildContextPackage(state, overrides);
  }
}
