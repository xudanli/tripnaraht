import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { OrchestrationStep } from '../interfaces/trip-plan.interface';
import type { CtreCompileProgressView } from '../../travel-compiler/contracts/ctre-compile-progress.types';
import {
  orchestrationStepProgressMessageZh,
  orchestrationStepProgressPercent,
} from './route-and-run-orchestration-progress.util';
import type { RouteAndRunAsyncTaskStore } from '../services/route-and-run-async-task.store';
import {
  ROUTE_AND_RUN_TASK_EVENT_BUS,
  type RouteAndRunTaskEventBusPort,
} from '../ports/route-and-run-task-event-bus.port';
import { taskRecordToProgressPayload } from '../utils/route-and-run-task-progress-payload.util';
import { attachEmotionalContextToProgressPayload } from '../narrator/emotional-context-client-projection.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

/**
 * 在异步 `route_and_run` 后台执行链路内，将编排步骤同步到任务进度存储（Redis/内存）。
 */
@Injectable()
export class RouteAndRunTaskProgressReporter {
  private readonly logger = new Logger(RouteAndRunTaskProgressReporter.name);
  private readonly als = new AsyncLocalStorage<{ taskId: string; destinationHint?: string }>();

  constructor(
    @Optional() private readonly taskStore?: RouteAndRunAsyncTaskStore,
    @Optional()
    @Inject(ROUTE_AND_RUN_TASK_EVENT_BUS)
    private readonly eventBus?: RouteAndRunTaskEventBusPort,
  ) {}

  getActiveTaskId(): string | undefined {
    return this.als.getStore()?.taskId;
  }

  async runWithTask<T>(
    taskId: string,
    destinationHint: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.als.run({ taskId, destinationHint }, fn);
  }

  async reportOrchestrationStep(step: OrchestrationStep | string, customMessage?: string): Promise<void> {
    await this.reportOrchestrationStepWithState(step, undefined, customMessage);
  }

  /** NARRATE 等阶段可附带 OrchestratorState，用于 SSE emotional_context 增量。 */
  async reportOrchestrationStepWithState(
    step: OrchestrationStep | string,
    orchestratorState?: OrchestratorState,
    customMessage?: string,
  ): Promise<void> {
    const ctx = this.als.getStore();
    if (!ctx?.taskId || !this.taskStore) return;
    const phase = String(step);
    const progress = orchestrationStepProgressPercent(phase);
    const message =
      customMessage?.trim() ||
      orchestrationStepProgressMessageZh(phase, ctx.destinationHint);
    try {
      await this.taskStore.updateProgress(ctx.taskId, {
        current_phase: phase,
        progress_percentage: progress,
        message,
        status: phase === 'DONE' ? 'SUCCESS' : phase === 'FAILED' || phase === 'TIMEOUT' ? 'FAILED' : 'PROCESSING',
      });
      const record = await this.taskStore.getRecord(ctx.taskId);
      if (record && this.eventBus) {
        const payload = attachEmotionalContextToProgressPayload(
          taskRecordToProgressPayload(record, 'PHASE'),
          orchestratorState,
        );
        this.eventBus.emitProgress(payload);
      }
    } catch (e: unknown) {
      this.logger.warn(
        `进度上报失败 task=${ctx.taskId} step=${phase}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** CTRE 编译进度 — SSE 增量（phaseReports + counters） */
  async reportCtreCompilationProgress(view: CtreCompileProgressView): Promise<void> {
    const ctx = this.als.getStore();
    if (!ctx?.taskId || !this.taskStore) return;

    const poi = view.counters.POI;
    const route = view.counters.Route;
    const parts: string[] = [];
    if (poi) parts.push(`POI ${poi.done}/${poi.total}`);
    if (route) parts.push(`Route ${route.done}/${route.total}`);
    const counterText = parts.length ? `（${parts.join(' · ')}）` : '';
    const message = `CTRE 编译${view.trigger === 'repair' ? '(修复后)' : ''}：${view.status} score=${view.score}${counterText}`;

    try {
      await this.taskStore.updateProgress(ctx.taskId, {
        current_phase: 'TRAVEL_COMPILE',
        progress_percentage: orchestrationStepProgressPercent('TRAVEL_COMPILE'),
        message,
        status: 'PROCESSING',
      });
      const record = await this.taskStore.getRecord(ctx.taskId);
      if (record && this.eventBus) {
        const payload = attachEmotionalContextToProgressPayload(
          {
            ...taskRecordToProgressPayload(record, 'PHASE'),
            ctre_compilation: view,
          },
          undefined,
        );
        this.eventBus.emitProgress(payload);
      }
    } catch (e: unknown) {
      this.logger.warn(
        `CTRE 进度上报失败 task=${ctx.taskId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
