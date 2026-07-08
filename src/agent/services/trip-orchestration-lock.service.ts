import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { DistributedLockService } from '../../redis/distributed-lock.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import {
  evaluateClientPlanVersionConflict,
  shouldAcquireTripOrchestrationLock,
  tripOrchestrationLockResourceId,
} from '../utils/trip-orchestration-lock.util';
import {
  buildTripLockObservabilityTrace,
  type TripLockObservabilityRecord,
} from '../utils/trip-orchestration-lock.observability.util';
import { TripRunManagerService } from './trip-run-manager.service';

@Injectable()
export class TripOrchestrationLockService {
  private readonly logger = new Logger(TripOrchestrationLockService.name);

  constructor(
    @Optional() private readonly distributedLock?: DistributedLockService,
    @Optional() private readonly tripRunManager?: TripRunManagerService,
  ) {}

  /**
   * 写编排入口互斥：同一 trip 串行执行 fn；读路径无 trip 或只读 task 直接执行。
   * Phase 2：抢锁前 + 持锁后双检 client_dso_version，落后则 STALE_PLAN_VERSION。
   */
  async runWithTripWriteLockIfNeeded<T>(
    request: RouteAndRunRequestDto,
    fn: () => Promise<T>,
  ): Promise<T> {
    const signals = signalsFromRequest(request);
    if (!shouldAcquireTripOrchestrationLock(request, signals)) {
      this.recordLockSkipped(request, signals.taskType);
      return fn();
    }

    const tripId = request.trip_id!.trim();
    const lockWaitStart = Date.now();

    // 抢锁前 Fast-Fail：避免在锁队列中空等后才发现视图过期
    await this.assertClientDsoVersionFresh(request, tripId, 'pre_lock');

    const resourceId = tripOrchestrationLockResourceId(tripId);

    if (!this.distributedLock) {
      this.logger.warn(
        `[TripOrchestrationLock] DistributedLock 不可用，跳过 trip=${tripId} 串行化`,
      );
      return fn();
    }

    const maxSeconds = request.options?.max_seconds;
    const ttlMs = Math.min(
      Math.max((typeof maxSeconds === 'number' && maxSeconds > 0 ? maxSeconds : 90) * 1000 + 15_000, 30_000),
      180_000,
    );

    const lockResult = await this.distributedLock.withLock(
      resourceId,
      async () => {
        await this.assertClientDsoVersionFresh(request, tripId, 'post_lock');
        const holdStart = Date.now();
        try {
          return await fn();
        } finally {
          this.recordLockHeld(request, signals.taskType, Date.now() - lockWaitStart, Date.now() - holdStart);
        }
      },
      {
        ttlMs,
        retryCount: 25,
        retryDelayMs: 120,
        retryJitterMs: 80,
      },
    );

    if (!lockResult.success) {
      this.recordLockConflict(request, signals.taskType, Date.now() - lockWaitStart);
      this.logger.warn(
        `[TripOrchestrationLock] 获取锁超时 trip=${tripId} request_id=${request.request_id} err=${lockResult.error ?? 'unknown'}`,
      );
      throw new HttpException(
        {
          code: 'TRIP_ORCHESTRATION_BUSY',
          message:
            '该行程正在处理上一笔修改，请稍后重试；若持续出现，请刷新页面后重试。',
          trip_id: tripId,
          request_id: request.request_id,
        },
        HttpStatus.CONFLICT,
      );
    }

    return lockResult.result as T;
  }

  private recordLockObservability(record: TripLockObservabilityRecord): void {
    this.logger.debug(
      buildTripLockObservabilityTrace(record),
      `[TripOrchestrationLock] observability trip=${record.trip_id} wait=${record.wait_ms}ms hold=${record.hold_ms}ms`,
    );
  }

  private recordLockSkipped(request: RouteAndRunRequestDto, taskType: string): void {
    const tripId = request.trip_id?.trim();
    if (!tripId) return;
    this.recordLockObservability({
      trip_id: tripId,
      request_id: request.request_id,
      scope: tripOrchestrationLockResourceId(tripId),
      reason: taskType,
      wait_ms: 0,
      hold_ms: 0,
      conflict: false,
      acquired: false,
      skipped: true,
      skip_reason: 'read_path_no_lock',
    });
  }

  private recordLockHeld(
    request: RouteAndRunRequestDto,
    taskType: string,
    waitMs: number,
    holdMs: number,
  ): void {
    const tripId = request.trip_id!.trim();
    this.recordLockObservability({
      trip_id: tripId,
      request_id: request.request_id,
      scope: tripOrchestrationLockResourceId(tripId),
      reason: taskType,
      wait_ms: waitMs,
      hold_ms: holdMs,
      conflict: false,
      acquired: true,
      skipped: false,
    });
  }

  private recordLockConflict(
    request: RouteAndRunRequestDto,
    taskType: string,
    waitMs: number,
  ): void {
    const tripId = request.trip_id!.trim();
    this.recordLockObservability({
      trip_id: tripId,
      request_id: request.request_id,
      scope: tripOrchestrationLockResourceId(tripId),
      reason: taskType,
      wait_ms: waitMs,
      hold_ms: 0,
      conflict: true,
      acquired: false,
      skipped: false,
    });
  }

  private async assertClientDsoVersionFresh(
    request: RouteAndRunRequestDto,
    tripId: string,
    stage: 'pre_lock' | 'post_lock',
  ): Promise<void> {
    const clientRaw = request.options?.client_dso_version;
    if (clientRaw === undefined || clientRaw === null) {
      return;
    }
    if (!Number.isFinite(Number(clientRaw))) {
      return;
    }

    const serverVersion = await this.tripRunManager?.resolveLatestServerDsoVersionForTrip(
      tripId,
      request.options?.durable_trip_run_id,
    );
    if (serverVersion === undefined) {
      return;
    }

    const verdict = evaluateClientPlanVersionConflict({
      clientVersion: Number(clientRaw),
      serverVersion,
    });
    if (!verdict.conflict) {
      return;
    }

    this.logger.debug(
      `[TripOrchestrationLock] STALE_PLAN_VERSION (${stage}) trip=${tripId} ${verdict.reason} request_id=${request.request_id}`,
    );
    throw new HttpException(
      {
        code: 'STALE_PLAN_VERSION',
        message: '行程已被更新，请刷新页面后重试。',
        trip_id: tripId,
        request_id: request.request_id,
        client_dso_version: verdict.clientVersion,
        server_dso_version: verdict.serverVersion,
        reason: verdict.reason,
      },
      HttpStatus.CONFLICT,
    );
  }
}
