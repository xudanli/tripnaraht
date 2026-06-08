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

  private async executeInBackground(
    taskId: string,
    request: RouteAndRunRequestDto,
    destinationHint: string | undefined,
  ): Promise<void> {
    const run = async (): Promise<void> => {
      try {
        const response = await this.agentService.routeAndRun(request);

        await this.progressReporter?.reportOrchestrationStep('DONE');
        await this.taskStore.markSuccess(taskId, response);
        this.logger.log(
          `[route_and_run/async] 完成 task=${taskId} request_id=${request.request_id} status=${response.result?.status}`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.progressReporter?.reportOrchestrationStep('FAILED', msg);
        await this.taskStore.markFailed(taskId, msg);
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
