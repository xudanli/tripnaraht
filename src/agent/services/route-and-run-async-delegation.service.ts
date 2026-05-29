import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { RouteAndRunAsyncService } from './route-and-run-async.service';
import {
  buildDelegatedRouteAndRunResponse,
  parseRouteAndRunAsyncMode,
  shouldDelegateRouteAndRunToAsync,
  type AsyncDelegationClassifyInput,
} from '../runtime/route-and-run-async-delegation.util';

/**
 * 将同步 `route_and_run` 在预分类后委托给 `RouteAndRunAsyncService`（E4 + A3）。
 */
@Injectable()
export class RouteAndRunAsyncDelegationService {
  private readonly logger = new Logger(RouteAndRunAsyncDelegationService.name);

  constructor(private readonly routeAndRunAsyncService: RouteAndRunAsyncService) {}

  async delegateIfRequested(
    request: RouteAndRunRequestDto,
    classify?: Omit<AsyncDelegationClassifyInput, 'request'>,
  ): Promise<RouteAndRunResponseDto | null> {
    const mode = parseRouteAndRunAsyncMode(request.options?.async_mode);
    if (mode === 'OFF') return null;

    const input: AsyncDelegationClassifyInput = { request, ...classify };
    if (!shouldDelegateRouteAndRunToAsync(input)) return null;

    return this.delegate(request, {
      delegation_reason:
        mode === 'FORCE'
          ? 'async_mode=FORCE：强制后台执行完整编排链'
          : 'async_mode=AUTO：INTENT_COMPILE 后判定为重规划，已切入异步流水线',
    });
  }

  async delegate(
    request: RouteAndRunRequestDto,
    opts?: { delegation_reason?: string },
  ): Promise<RouteAndRunResponseDto> {
    const init = await this.routeAndRunAsyncService.startRouteAndRunAsync(request);
    this.logger.log(
      `[async_delegation] task_id=${init.task_id} request_id=${request.request_id} mode=${parseRouteAndRunAsyncMode(request.options?.async_mode)}`,
    );
    return buildDelegatedRouteAndRunResponse(request, init, opts);
  }

  async delegateForceOrThrow(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
    if (parseRouteAndRunAsyncMode(request.options?.async_mode) !== 'FORCE') {
      throw new ServiceUnavailableException('async_mode must be FORCE for immediate delegation');
    }
    return this.delegate(request, { delegation_reason: 'async_mode=FORCE' });
  }
}
