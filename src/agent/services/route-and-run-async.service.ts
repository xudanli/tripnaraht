import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { RouteAndRunTaskInitResponseDto } from '../dto/route-and-run-task.dto';
import { AgentService } from './agent.service';
import { RouteAndRunAsyncTaskStore } from './route-and-run-async-task.store';
import { RouteAndRunTaskProgressReporter } from '../runtime/route-and-run-task-progress.reporter';
import {
  orchestrationStepProgressMessageZh,
  orchestrationStepProgressPercent,
} from '../runtime/route-and-run-orchestration-progress.util';
import { parseTaskMaxResume } from '../runtime/route-and-run-task-lease.constants';
import { TripRunManagerService } from './trip-run-manager.service';
import { buildDurableAuthoritySnapshotV1 } from '../../decision-runtime/execution/async-resume-authority.util';
import { applyAsyncMutationCommitGuard } from '../../decision-runtime/execution/async-mutation-commit.adapter';
import {
  isAsyncMutationWriteGuardEnforce,
  validateAsyncAuthority,
} from '../../decision-runtime/execution/async-resume-authority.util';
import { AgentChatService } from '../chat/agent-chat.service';

/**
 * Durable Task Pattern：`POST /agent/route_and_run/async` 秒回 task_id，后台跑完整编排链。
 */
@Injectable()
export class RouteAndRunAsyncService {
  private readonly logger = new Logger(RouteAndRunAsyncService.name);

  constructor(
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
    private readonly taskStore: RouteAndRunAsyncTaskStore,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly progressReporter?: RouteAndRunTaskProgressReporter,
    @Optional() private readonly tripRunManager?: TripRunManagerService,
  ) {}

  async startRouteAndRunAsync(request: RouteAndRunRequestDto): Promise<RouteAndRunTaskInitResponseDto> {
    const taskId = this.taskStore.buildTaskId(request);
    const destinationHint = this.inferDestinationHint(request);
    const serverTripVersion = await this.resolveCurrentTripVersion(request);
    const authoritySnapshot = buildDurableAuthoritySnapshotV1({
      request,
      serverTripVersion,
    });

    const init = await this.taskStore.createInitialized(request, taskId, {
      current_phase: 'INTAKE',
      progress_percentage: orchestrationStepProgressPercent('INTAKE'),
      message: orchestrationStepProgressMessageZh('INTAKE', destinationHint),
      authority_snapshot_v1: authoritySnapshot ?? undefined,
    });

    setImmediate(() => {
      void this.executeInBackground(taskId, request, destinationHint, {
        authoritySnapshot,
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[route_and_run/async] 后台任务未捕获异常 task=${taskId}: ${msg}`);
      });
    });

    return init;
  }

  /**
   * P2：Worker lease 过期或显式 resume — 用 request_snapshot + durable_trip_run_id 断点续跑。
   */
  async resumeStaleTask(taskId: string, opts?: { explicit?: boolean }): Promise<void> {
    const record = await this.taskStore.getRecord(taskId);
    if (!record?.request_snapshot) {
      this.logger.warn(`[route_and_run/async] resume 跳过：无 request_snapshot task=${taskId}`);
      return;
    }
    const maxResume = parseTaskMaxResume();
    if ((record.resume_count ?? 0) >= maxResume && !opts?.explicit) {
      await this.taskStore.markFailed(taskId, `Worker lease stale; max resume ${maxResume} reached`);
      return;
    }

    const request: RouteAndRunRequestDto = {
      ...record.request_snapshot,
      request_id: record.request_snapshot.request_id,
      options: {
        ...(record.request_snapshot.options ?? {}),
        ...(record.durable_trip_run_id?.trim()
          ? { durable_trip_run_id: record.durable_trip_run_id.trim() }
          : {}),
      },
    };

    const currentTripVersion = await this.resolveCurrentTripVersion(request);
    const resumeValidation = validateAsyncAuthority({
      snapshot: record.authority_snapshot_v1,
      currentTripVersion,
      stage: 'resume',
    });

    if (!resumeValidation.allowed && isAsyncMutationWriteGuardEnforce()) {
      const reasons = resumeValidation.reasonCodes.join(',');
      this.logger.warn(`[route_and_run/async] resume blocked task=${taskId} reasons=${reasons}`);
      await this.taskStore.markFailed(
        taskId,
        `Async resume authority check failed: ${reasons}`,
      );
      return;
    }

    const nextResume = (record.resume_count ?? 0) + 1;
    await this.taskStore.markResuming(taskId, {
      resume_count: nextResume,
      message: `Worker 续跑 (${nextResume}/${maxResume})，从 ${record.current_phase} 快照恢复…`,
    });

    const destinationHint = this.inferDestinationHint(request);

    setImmediate(() => {
      void this.executeInBackground(taskId, request, destinationHint, {
        isResume: true,
        authoritySnapshot: record.authority_snapshot_v1,
      }).catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[route_and_run/async] resume 失败 task=${taskId}: ${msg}`);
        await this.taskStore.markFailed(taskId, msg);
      });
    });
  }

  private forWorkerExecution(request: RouteAndRunRequestDto): RouteAndRunRequestDto {
    return {
      ...request,
      options: {
        ...(request.options ?? {}),
        // Prevent async worker from re-hitting AUTO/FORCE delegation (infinite task spawn).
        async_mode: 'OFF',
        skip_async_delegation: true,
      },
    };
  }

  private async executeInBackground(
    taskId: string,
    request: RouteAndRunRequestDto,
    destinationHint: string | undefined,
    opts?: {
      isResume?: boolean;
      authoritySnapshot?: import('../../decision-runtime/execution/durable-authority-snapshot-v1.types').DurableAuthoritySnapshotV1 | null;
    },
  ): Promise<void> {
    const workerRequest = this.forWorkerExecution(request);
    const run = async (): Promise<void> => {
      try {
        let response = await this.agentService.routeAndRun(workerRequest);
        const obs = response.observability as { durable_trip_run_id?: string } | undefined;
        if (obs?.durable_trip_run_id) {
          await this.taskStore.patchDurableTripRunId(taskId, obs.durable_trip_run_id);
        }

        // Nested ACCIDENTAL re-delegation would mark SUCCESS with PROCESSING forever — fail loudly.
        if (response.async_task?.is_async_delegated === true) {
          const nestedId = response.async_task?.task_id ?? 'unknown';
          throw new Error(
            `Async worker re-delegated instead of executing (nested_task=${nestedId}); skip_async_delegation missing?`,
          );
        }

        const currentTripVersion = await this.resolveCurrentTripVersion(workerRequest);
        response = applyAsyncMutationCommitGuard({
          request: workerRequest,
          response,
          authoritySnapshot: opts?.authoritySnapshot,
          currentTripVersion,
          stage: 'commit',
        });

        const blocked = (response.observability as Record<string, unknown>)?.async_mutation_guard_v1;
        if (blocked && isAsyncMutationWriteGuardEnforce()) {
          await this.progressReporter?.reportOrchestrationStep('FAILED', 'authority_commit_blocked');
          await this.taskStore.markSuccess(taskId, response);
          await this.taskStore.clearResuming(taskId);
          await this.finalizeChatPlaceholder(taskId, {
            status: 'SUCCESS',
            data: response,
          });
          this.logger.warn(
            `[route_and_run/async] commit blocked by authority task=${taskId} request_id=${request.request_id}`,
          );
          return;
        }

        await this.progressReporter?.reportOrchestrationStep('DONE');
        await this.taskStore.markSuccess(taskId, response);
        await this.taskStore.clearResuming(taskId);
        await this.finalizeChatPlaceholder(taskId, {
          status: 'SUCCESS',
          data: response,
        });
        this.logger.log(
          `[route_and_run/async] 完成 task=${taskId} request_id=${request.request_id} status=${response.result?.status} resume=${opts?.isResume === true}`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.progressReporter?.reportOrchestrationStep('FAILED', msg);
        await this.taskStore.markFailed(taskId, msg);
        await this.taskStore.clearResuming(taskId);
        await this.finalizeChatPlaceholder(taskId, { status: 'FAILED', error: msg });
        this.logger.warn(`[route_and_run/async] 失败 task=${taskId}: ${msg}`);
      }
    };

    if (this.progressReporter) {
      await this.progressReporter.runWithTask(taskId, destinationHint, run);
    } else {
      await run();
    }
  }

  private async resolveCurrentTripVersion(
    request: RouteAndRunRequestDto,
  ): Promise<number | undefined> {
    const tripId = request.trip_id?.trim();
    if (!tripId || !this.tripRunManager) return undefined;
    return this.tripRunManager.resolveLatestServerDsoVersionForTrip(
      tripId,
      request.options?.durable_trip_run_id,
    );
  }

  private inferDestinationHint(request: RouteAndRunRequestDto): string | undefined {
    const msg = String(request.message ?? '');
    if (/冰岛|iceland/i.test(msg)) return '冰岛';
    const dest = (request as { destination?: string }).destination;
    if (typeof dest === 'string' && dest.trim()) return dest.trim();
    return undefined;
  }

  /** agent-chat FORCE 异步：任务终态后写回「正在规划中…」占位并推 SSE。 */
  private async finalizeChatPlaceholder(
    taskId: string,
    outcome:
      | { status: 'SUCCESS'; data: RouteAndRunResponseDto }
      | { status: 'FAILED'; error: string },
  ): Promise<void> {
    try {
      // 避免 AgentModule ↔ AgentChatModule 循环依赖：运行时按需解析
      const agentChat = this.moduleRef.get(AgentChatService, { strict: false });
      await agentChat.finalizeAsyncTaskFromWorker(taskId, outcome);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[route_and_run/async] chat finalize failed task=${taskId}: ${msg}`,
      );
    }
  }
}
