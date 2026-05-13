import { Injectable, Logger } from '@nestjs/common';
import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import { planLedgerRecomputeOrder } from './decision-ledger-invalidation.util';
import type {
  LedgerRecomputeExecutorResultV1,
  LedgerRecomputeStepV1,
  LedgerRecomputeStrategyV1,
} from './ledger-recompute.types';

/**
 * D：消费 `planLedgerRecomputeOrder` 输出，将 STALE / INVALIDATED 映射为可编排策略。
 * 不直接调用 LLM；上层 Orchestrator / Action 层按 step.strategy 接入。
 */
@Injectable()
export class LedgerRecomputeExecutorService {
  private readonly logger = new Logger(LedgerRecomputeExecutorService.name);

  /**
   * 根据账本当前节点状态生成重算执行计划。
   */
  buildExecutionPlan(ledger: DecisionLedgerSnapshot): LedgerRecomputeExecutorResultV1 {
    const plan = planLedgerRecomputeOrder(ledger);
    const byId = new Map(ledger.nodes.map(n => [n.nodeId, n]));

    const strategyForInvalidated = (): LedgerRecomputeStrategyV1 => 'FULL_REPLAN';

    const invalidatedIds = [...plan.orderedNodeIds, ...plan.unorderedFallbackNodeIds];
    const invalidatedSteps: LedgerRecomputeStepV1[] = [];
    for (const nodeId of invalidatedIds) {
      const n = byId.get(nodeId);
      if (!n || n.status !== 'INVALIDATED') continue;
      invalidatedSteps.push({
        nodeId,
        actionType: n.actionType,
        status: n.status,
        strategy: strategyForInvalidated(),
      });
    }

    const staleSteps: LedgerRecomputeStepV1[] = ledger.nodes
      .filter(n => n.status === 'STALE')
      .map(n => ({
        nodeId: n.nodeId,
        actionType: n.actionType,
        status: n.status,
        strategy: 'REFRESH_SUMMARY' as const,
      }));

    this.logger.debug(
      `LedgerRecomputeExecutor: invalidated=${invalidatedSteps.length} stale=${staleSteps.length} snapshot=${ledger.revision}`,
    );

    return { revision: 'v1', invalidatedSteps, staleSteps };
  }
}
