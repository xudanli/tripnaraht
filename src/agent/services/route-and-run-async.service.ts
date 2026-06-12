import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
    @Optional() private readonly progressReporter?: RouteAndRunTaskProgressReporter,
  ) {}

  async startRouteAndRunAsync(request: RouteAndRunRequestDto): Promise<RouteAndRunTaskInitResponseDto> {
    const taskId = this.taskStore.buildTaskId(request);
    const destinationHint = this.inferDestinationHint(request);

    const init = await this.taskStore.createInitialized(request, taskId, {
      current_phase: 'INTAKE',
      progress_percentage: orchestrationStepProgressPercent('INTAKE'),
      message: orchestrationStepProgressMessageZh('INTAKE', destinationHint),
    });

    setImmediate(() => {
      void this.executeInBackground(taskId, request, destinationHint).catch((err: unknown) => {
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
    const nextResume = (record.resume_count ?? 0) + 1;
    await this.taskStore.markResuming(taskId, {
      resume_count: nextResume,
      message: `Worker 续跑 (${nextResume}/${maxResume})，从 ${record.current_phase} 快照恢复…`,
    });

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
    const destinationHint = this.inferDestinationHint(request);

    setImmediate(() => {
      void this.executeInBackground(taskId, request, destinationHint, { isResume: true })
        .catch(async (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`[route_and_run/async] resume 失败 task=${taskId}: ${msg}`);
          await this.taskStore.markFailed(taskId, msg);
        });
    });
  }

  private async executeInBackground(
    taskId: string,
    request: RouteAndRunRequestDto,
    destinationHint: string | undefined,
    opts?: { isResume?: boolean },
  ): Promise<void> {
    const run = async (): Promise<void> => {
      try {
        const response = await this.agentService.routeAndRun(request);
        const obs = response.observability as { durable_trip_run_id?: string } | undefined;
        if (obs?.durable_trip_run_id) {
          await this.taskStore.patchDurableTripRunId(taskId, obs.durable_trip_run_id);
        }

        await this.progressReporter?.reportOrchestrationStep('DONE');
        await this.taskStore.markSuccess(taskId, response);
        await this.taskStore.clearResuming(taskId);
        this.logger.log(
          `[route_and_run/async] 完成 task=${taskId} request_id=${request.request_id} status=${response.result?.status} resume=${opts?.isResume === true}`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.progressReporter?.reportOrchestrationStep('FAILED', msg);
        await this.taskStore.markFailed(taskId, msg);
        await this.taskStore.clearResuming(taskId);
        this.logger.warn(`[route_and_run/async] 失败 task=${taskId}: ${msg}`);
      }
    };

    if (this.progressReporter) {
      await this.progressReporter.runWithTask(taskId, destinationHint, run);
    } else {
      await run();
    }
  }

  private inferDestinationHint(request: RouteAndRunRequestDto): string | undefined {
    const msg = String(request.message ?? '');
    if (/冰岛|iceland/i.test(msg)) return '冰岛';
    const dest = (request as { destination?: string }).destination;
    if (typeof dest === 'string' && dest.trim()) return dest.trim();
    return undefined;
  }
}
