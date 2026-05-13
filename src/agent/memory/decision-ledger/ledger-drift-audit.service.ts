import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import { applyLedgerConstraintChange } from './decision-ledger-invalidation.util';
import { buildWorldAnchorV1FromSlices, listStaleWorldTopicTopics } from './decision-ledger-world-anchor.util';
import type { WorldTopicSlice, MemoryLedgerPhaseV1 } from './world-topic-slice.types';
import { LedgerRecomputeExecutorService } from './ledger-recompute-executor.service';
import type { LedgerAuditReportV1 } from './ledger-drift-audit.types';
import { LedgerPendingAuditStoreService } from './ledger-pending-audit.store.service';
import type { LedgerPendingAuditPayloadV1 } from './ledger-pending-audit.types';

/**
 * 响应式中枢：外界（MCP/API）更新世界切片后，串联 WORLD 锚变更 → 失效闭包 → D 执行计划。
 * 不修改 DecisionState；不直接调用 LLM。
 *
 * route_and_run 主链路的「装配后观测」见 `execution-gateway.route-and-run.orchestration.ts`
 * 中对 `LedgerRecomputeExecutorService` 的轻量接线；本服务供 MCP 等显式推送切片时复用同一套语义。
 */
@Injectable()
export class LedgerDriftAuditService {
  private readonly logger = new Logger(LedgerDriftAuditService.name);

  constructor(
    private readonly recomputeExecutor: LedgerRecomputeExecutorService,
    @Optional() private readonly pendingAuditStore?: LedgerPendingAuditStoreService,
  ) {}

  /**
   * 基于刷新后的 topic 切片重建 worldLayered，应用 WORLD 约束变更，并产出重算步骤。
   */
  auditWorldSlicesAndPlan(input: {
    currentLedger: DecisionLedgerSnapshot;
    updatedSlices: WorldTopicSlice[];
    phase: MemoryLedgerPhaseV1;
    nowMs?: number;
    /** 若设置且 Pending 存储可用，在下一次 route_and_run 前写入待合并 world 锚 */
    persistTripId?: string;
  }): LedgerAuditReportV1 {
    const nowMs = input.nowMs ?? Date.now();
    const newWorldLayered = buildWorldAnchorV1FromSlices(input.updatedSlices);
    const { ledger: afterChange, invalidatedNodeIds, staleNodeIds } = applyLedgerConstraintChange(
      input.currentLedger,
      { kind: 'WORLD', newWorldLayered },
      { memoryPhase: input.phase },
    );

    const staleWorldTopics = listStaleWorldTopicTopics(input.updatedSlices, nowMs);
    const updatedLedger: DecisionLedgerSnapshot = {
      ...afterChange,
      worldSlices: input.updatedSlices,
      staleWorldTopics,
    };

    const executionPlan = this.recomputeExecutor.buildExecutionPlan(updatedLedger);
    const hasDrift = invalidatedNodeIds.length > 0 || staleNodeIds.length > 0;

    this.logger.debug(
      `LedgerDriftAudit: drift=${hasDrift} invalidated=${invalidatedNodeIds.length} stale=${staleNodeIds.length} replanSteps=${executionPlan.invalidatedSteps.length}`,
    );

    const report: LedgerAuditReportV1 = {
      revision: 'v1',
      hasDrift,
      updatedLedger,
      executionPlan,
      impactMetrics: {
        invalidatedCount: invalidatedNodeIds.length,
        staleCount: staleNodeIds.length,
      },
    };

    if (input.persistTripId?.trim() && this.pendingAuditStore?.isEnabled()) {
      const payload: LedgerPendingAuditPayloadV1 = {
        revision: 'v1',
        worldSlices: input.updatedSlices,
        anchors: {
          world: updatedLedger.anchors.world,
          worldLayered: updatedLedger.anchors.worldLayered,
        },
      };
      void this.pendingAuditStore.save(input.persistTripId.trim(), payload);
    }

    return report;
  }
}
