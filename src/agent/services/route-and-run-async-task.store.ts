import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type {
  RouteAndRunTaskInitResponseDto,
  RouteAndRunTaskStatusResponseDto,
} from '../dto/route-and-run-task.dto';
import {
  isTerminalTaskPublicStatus,
  type RouteAndRunTaskPublicStatus,
} from '../runtime/route-and-run-orchestration-progress.util';
import {
  ROUTE_AND_RUN_TASK_EVENT_BUS,
  type RouteAndRunTaskEventBusPort,
} from '../ports/route-and-run-task-event-bus.port';
import { taskRecordToProgressPayload } from '../utils/route-and-run-task-progress-payload.util';

export type RouteAndRunTaskRecord = {
  task_id: string;
  request_id: string;
  status: RouteAndRunTaskPublicStatus;
  current_phase: string;
  progress_percentage: number;
  message: string;
  data: RouteAndRunResponseDto | null;
  error?: string;
  estimated_time_remaining_sec?: number;
  updated_at: string;
  created_at: string;
};

const TASK_PROGRESS_PREFIX = 'task_progress';
const TASK_TTL_SEC = 24 * 60 * 60;

@Injectable()
export class RouteAndRunAsyncTaskStore {
  private readonly logger = new Logger(RouteAndRunAsyncTaskStore.name);
  private readonly memory = new Map<string, RouteAndRunTaskRecord>();

  constructor(
    @Optional() private readonly cacheService?: CacheService,
    @Optional()
    @Inject(ROUTE_AND_RUN_TASK_EVENT_BUS)
    private readonly eventBus?: RouteAndRunTaskEventBusPort,
  ) {}

  buildTaskId(request: RouteAndRunRequestDto): string {
    const trip = request.trip_id?.trim() || 'new';
    const safeTrip = trip.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    return `task_${safeTrip}_${Date.now()}`;
  }

  async createInitialized(
    request: RouteAndRunRequestDto,
    taskId: string,
    init: Pick<RouteAndRunTaskRecord, 'current_phase' | 'progress_percentage' | 'message'>,
  ): Promise<RouteAndRunTaskInitResponseDto> {
    const now = new Date().toISOString();
    const record: RouteAndRunTaskRecord = {
      task_id: taskId,
      request_id: request.request_id,
      status: 'PROCESSING',
      current_phase: init.current_phase,
      progress_percentage: init.progress_percentage,
      message: init.message,
      data: null,
      updated_at: now,
      created_at: now,
    };
    await this.persist(record);
    this.emitSse(record, 'PHASE');
    return this.toInitDto(record);
  }

  async updateProgress(
    taskId: string,
    patch: Partial<
      Pick<
        RouteAndRunTaskRecord,
        'current_phase' | 'progress_percentage' | 'message' | 'status' | 'estimated_time_remaining_sec'
      >
    >,
  ): Promise<void> {
    const prev = await this.getRecordInternal(taskId);
    if (!prev) return;
    if (isTerminalTaskPublicStatus(prev.status)) return;
    const next: RouteAndRunTaskRecord = {
      ...prev,
      ...patch,
      updated_at: new Date().toISOString(),
      status: patch.status ?? prev.status,
    };
    await this.persist(next);
  }

  async markSuccess(taskId: string, response: RouteAndRunResponseDto): Promise<void> {
    const prev = await this.getRecordInternal(taskId);
    if (!prev) return;
    const next: RouteAndRunTaskRecord = {
      ...prev,
      status: 'SUCCESS',
      current_phase: 'DONE',
      progress_percentage: 100,
      message: '行程规划已完成',
      data: response,
      updated_at: new Date().toISOString(),
      estimated_time_remaining_sec: 0,
    };
    await this.persist(next);
    this.emitSse(next, 'RESULT');
  }

  async markFailed(taskId: string, error: string): Promise<void> {
    const prev = await this.getRecordInternal(taskId);
    if (!prev) return;
    const next: RouteAndRunTaskRecord = {
      ...prev,
      status: 'FAILED',
      current_phase: 'FAILED',
      message: error || '规划失败',
      error: error || '规划失败',
      updated_at: new Date().toISOString(),
    };
    await this.persist(next);
    this.emitSse(next, 'ERROR');
  }

  /** 供进度上报与 SSE snapshot 读取（与轮询 store 同源）。 */
  async getRecord(taskId: string): Promise<RouteAndRunTaskRecord | null> {
    return this.getRecordInternal(taskId);
  }

  /**
   * 进程退出兜底：仅处理本进程 `memory` 中仍为 PROCESSING/PENDING 的任务（Redis 中孤儿任务靠 TTL/轮询发现）。
   */
  async abandonInFlightTasks(reason: string): Promise<string[]> {
    const abandoned: string[] = [];
    for (const [taskId, record] of this.memory.entries()) {
      if (record.status !== 'PROCESSING' && record.status !== 'PENDING') continue;
      await this.markFailed(taskId, reason);
      abandoned.push(taskId);
    }
    return abandoned;
  }

  async getStatus(taskId: string): Promise<RouteAndRunTaskStatusResponseDto | null> {
    const record = await this.getRecordInternal(taskId);
    if (!record) return null;
    return this.toStatusDto(record);
  }

  private cacheKey(taskId: string): string {
    return this.cacheService
      ? this.cacheService.generateKey(TASK_PROGRESS_PREFIX, taskId)
      : `${TASK_PROGRESS_PREFIX}:${taskId}`;
  }

  private async persist(record: RouteAndRunTaskRecord): Promise<void> {
    this.memory.set(record.task_id, record);
    if (!this.cacheService) return;
    try {
      await this.cacheService.set(this.cacheKey(record.task_id), record, TASK_TTL_SEC);
    } catch (e: unknown) {
      this.logger.warn(
        `任务进度写入缓存失败 task=${record.task_id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private emitSse(
    record: RouteAndRunTaskRecord,
    type: 'PHASE' | 'RESULT' | 'ERROR',
  ): void {
    try {
      this.eventBus?.emitProgress(taskRecordToProgressPayload(record, type));
    } catch (e: unknown) {
      this.logger.warn(
        `SSE emit failed task=${record.task_id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async getRecordInternal(taskId: string): Promise<RouteAndRunTaskRecord | null> {
    const mem = this.memory.get(taskId);
    if (mem) return mem;
    if (!this.cacheService) return null;
    try {
      const fromCache = await this.cacheService.get<RouteAndRunTaskRecord>(this.cacheKey(taskId));
      if (fromCache) {
        this.memory.set(taskId, fromCache);
        return fromCache;
      }
    } catch (e: unknown) {
      this.logger.warn(
        `任务进度读取缓存失败 task=${taskId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return null;
  }

  private toInitDto(record: RouteAndRunTaskRecord): RouteAndRunTaskInitResponseDto {
    return {
      task_id: record.task_id,
      status: record.status === 'PENDING' ? 'PENDING' : 'PROCESSING',
      current_phase: record.current_phase,
      progress_percentage: record.progress_percentage,
      message: record.message,
      data: null,
      request_id: record.request_id,
    };
  }

  private toStatusDto(record: RouteAndRunTaskRecord): RouteAndRunTaskStatusResponseDto {
    return {
      task_id: record.task_id,
      status: record.status,
      current_phase: record.current_phase,
      progress_percentage: record.progress_percentage,
      message: record.message,
      data: record.status === 'SUCCESS' ? record.data : null,
      ...(record.error ? { error: record.error } : {}),
      ...(record.estimated_time_remaining_sec !== undefined
        ? { estimated_time_remaining_sec: record.estimated_time_remaining_sec }
        : {}),
      updated_at: record.updated_at,
    };
  }
}
