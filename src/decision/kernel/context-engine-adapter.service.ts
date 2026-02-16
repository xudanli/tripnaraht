/**
 * Context Engine Adapter
 *
 * Phase 2.2: Kernel 与 ContextEngineerService 的桥接
 * 将 DSO 映射为 ContextPackageOptions，调用 ContextEngineer.build()
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ContextEngineerService } from '../../agent/context-engine/services/context-engineer.service';
import { DecisionState } from './decision-state.types';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';

/** 调用 getContextPackage 时可选的覆盖参数（来自 Conductor） */
export interface ContextPackageOverrides {
  tripId?: string;
  userId?: string;
  userQuery?: string;
  phase?: string;
  agent?: string;
  tokenBudget?: number;
}

@Injectable()
export class ContextEngineAdapterService {
  private readonly logger = new Logger(ContextEngineAdapterService.name);

  constructor(
    @Optional() private readonly contextEngineer?: ContextEngineerService,
  ) {}

  /**
   * 构建 Context Package
   * 将 DSO 与 Conductor 提供的参数组合为 ContextPackageOptions
   */
  async buildContextPackage(
    state: DecisionState,
    overrides: ContextPackageOverrides = {},
  ): Promise<ContextPackage | undefined> {
    if (!this.contextEngineer) return undefined;

    const tripId = overrides.tripId ?? (state.requestId as string);
    const phase = overrides.phase ?? state.systemState.currentPhase ?? 'PLANNING';
    const agent = overrides.agent ?? 'PLANNER';
    const userQuery = overrides.userQuery ?? this.inferUserQuery(state);
    if (!userQuery) {
      this.logger.warn('[ContextAdapter] 无法推断 userQuery，跳过 build');
      return undefined;
    }

    try {
      const package_ = await this.contextEngineer.build({
        tripId,
        userId: overrides.userId,
        phase,
        agent,
        userQuery,
        tokenBudget: overrides.tokenBudget,
        includePrivate: false,
      });
      this.logger.debug(`[ContextAdapter] Built: blocks=${package_.blocks?.length ?? 0}, tokens=${package_.totalTokens ?? 0}`);
      return package_;
    } catch (err) {
      this.logger.warn(`[ContextAdapter] build 失败: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private inferUserQuery(state: DecisionState): string {
    const u = state.userIntent;
    if (!u) return '';
    const parts: string[] = [];
    if (u.destination) parts.push(`目的地: ${typeof u.destination === 'string' ? u.destination : `(${u.destination.lat},${u.destination.lng})`}`);
    if (u.days) parts.push(`${u.days}天`);
    if (u.mode) parts.push(u.mode);
    if (u.dateRange) parts.push(`${u.dateRange.startDate}~${u.dateRange.endDate}`);
    return parts.length > 0 ? parts.join('，') : '行程规划';
  }
}
