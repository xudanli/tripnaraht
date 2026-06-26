import { Injectable, Logger, Optional } from '@nestjs/common';
import type { IReplanTrigger } from '../kernel/replan-trigger.interface';
import { DecisionOsSloService } from '../slo/decision-os-slo.service';
import type { ContingencyPathId, SloOutcome } from '../slo/decision-os-slo.types';
import type {
  ContingencyHandler,
  ContingencyHandlerResult,
  ContingencyTriggerResponse,
} from './contingency-handler.types';

export interface ContingencyTriggerRequest {
  tripId: string;
  reason: string;
  /** 显式指定路径；缺省时由 reason 推断 */
  pathId?: ContingencyPathId;
  humanAssisted?: boolean;
  metadata?: Record<string, unknown>;
}

export type { ContingencyHandler, ContingencyHandlerResult, ContingencyTriggerResponse };

/**
 * 统一 Contingency 入口 — Sprint 1 包装 KERNEL_REPLAN；Sprint 3 接入 IN_TRIP / SILENT_HEAL / Gate1 Plan B。
 */
@Injectable()
export class ContingencyOrchestratorService implements IReplanTrigger {
  private readonly logger = new Logger(ContingencyOrchestratorService.name);
  private readonly handlers = new Map<ContingencyPathId, ContingencyHandler>();

  constructor(@Optional() private readonly slo?: DecisionOsSloService) {}

  registerHandler(handler: ContingencyHandler): void {
    this.handlers.set(handler.pathId, handler);
    this.logger.log(`[ContingencyOrchestrator] registered path=${handler.pathId}`);
  }

  resolvePath(reason: string, explicit?: ContingencyPathId): ContingencyPathId {
    if (explicit) return explicit;
    const r = reason.toLowerCase();
    if (r.includes('silent_heal') || r.includes('budget_drift')) return 'SILENT_HEAL';
    if (r.includes('in_trip') || r.includes('dev-env')) return 'IN_TRIP_RECOVERY';
    if (r.includes('plan_b') || r.includes('advisor')) return 'ADVISOR_PLAN_B';
    return 'KERNEL_REPLAN';
  }

  async trigger(req: ContingencyTriggerRequest): Promise<ContingencyTriggerResponse> {
    const pathId = this.resolvePath(req.reason, req.pathId);
    const handler = this.handlers.get(pathId);
    const started = Date.now();

    if (!handler) {
      const msg = `No contingency handler for path=${pathId}`;
      this.logger.warn(`[ContingencyOrchestrator] ${msg} trip=${req.tripId}`);
      this.record(pathId, req, 'SKIPPED', started, msg);
      return { pathId, outcome: 'SKIPPED' };
    }

    try {
      const handlerResult = await handler.trigger(req.tripId, req.reason, req.metadata);
      const outcome: SloOutcome =
        handlerResult && handlerResult.outcome ? handlerResult.outcome : 'SUCCESS';
      const recordReq: ContingencyTriggerRequest = {
        ...req,
        humanAssisted:
          handlerResult && handlerResult.humanAssisted !== undefined
            ? handlerResult.humanAssisted
            : req.humanAssisted,
      };
      this.record(pathId, recordReq, outcome, started);
      return {
        pathId,
        outcome,
        payload: handlerResult ? handlerResult.payload : undefined,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[ContingencyOrchestrator] path=${pathId} failed trip=${req.tripId}: ${msg}`);
      this.record(pathId, req, 'FAILED', started, msg);
      throw e;
    }
  }

  /** IReplanTrigger — DecisionKernel.pushEnvironmentDelta 兼容入口 */
  async triggerReplan(tripRunIdOrTripId: string, reason: string): Promise<void> {
    await this.trigger({
      tripId: tripRunIdOrTripId,
      reason,
      pathId: this.resolvePath(reason),
    });
  }

  private record(
    pathId: ContingencyPathId,
    req: ContingencyTriggerRequest,
    outcome: SloOutcome,
    startedMs: number,
    error?: string,
  ): void {
    if (!this.slo) return;
    this.slo.recordContingency({
      tripId: req.tripId,
      pathId,
      reason: req.reason,
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      outcome,
      error,
      humanAssisted: req.humanAssisted,
    });
  }
}
