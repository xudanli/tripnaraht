// src/agent/services/trip-run-manager.service.ts
/**
 * TripRun Manager Service
 * 
 * 负责管理 Agent 运行记录（TripRun 和 TripAttempt）的创建和更新
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DecisionState } from '../../decision/kernel/decision-state.types';

/** TripRun.metadata 中 DSO 断点快照的键名（v1.0 Durable） */
export const TRIP_RUN_DSO_CHECKPOINT_META_KEY = 'dso_checkpoint';

/** Phase B+：编排恢复审计事件列表（刷新会话后可读） */
export const TRIP_RUN_RECOVERY_AUDIT_META_KEY = 'recovery_audit';

/** 写入 TripRun.metadata 的可序列化检查点 */
export interface TripRunDsoCheckpointPayload {
  decision_state: DecisionState;
  cursor_step?: string;
  saved_at: string;
}

export interface CreateTripRunParams {
  tripId?: string | null;
  userId?: string | null;
  userQuery: string;
  planningPhase?: string;
  currentAgent?: string;
  metadata?: Record<string, any>;
}

export interface CreateTripAttemptParams {
  tripRunId: string;
  attemptNumber: number;
  planOutline?: string;
  openQuestions?: string[];
  constraintsAssumed?: string[];
  nextActions?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateTripRunParams {
  runId: string;
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  planningPhase?: string;
  currentAgent?: string;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export interface UpdateTripAttemptParams {
  attemptId: string;
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  planOutline?: string;
  openQuestions?: string[];
  constraintsAssumed?: string[];
  nextActions?: string[];
  failureNotes?: string;
  resultSummary?: string;
  artifacts?: Record<string, any>;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class TripRunManagerService {
  private readonly logger = new Logger(TripRunManagerService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {
    if (!this.prisma) {
      this.logger.warn('PrismaService not available, TripRun recording will be disabled');
    }
  }

  /**
   * 创建 TripRun 记录
   */
  async createTripRun(params: CreateTripRunParams): Promise<string | null> {
    if (!this.prisma) {
      this.logger.debug('PrismaService not available, skipping TripRun creation');
      return null;
    }

    try {
      // 验证 UUID 格式（如果提供）
      if (params.tripId && !this.isValidUUID(params.tripId)) {
        this.logger.warn(`Invalid tripId format: ${params.tripId}, creating TripRun without tripId`);
        params.tripId = null;
      }
      if (params.userId && !this.isValidUUID(params.userId)) {
        this.logger.warn(`Invalid userId format: ${params.userId}, creating TripRun without userId`);
        params.userId = null;
      }

      const tripRun = await this.prisma.tripRun.create({
        data: {
          tripId: params.tripId || null,
          userId: params.userId || null,
          userQuery: params.userQuery,
          planningPhase: params.planningPhase || 'INITIAL',
          currentAgent: params.currentAgent || null,
          status: 'IN_PROGRESS',
          metadata: params.metadata || {},
        },
      });

      this.logger.debug(`Created TripRun: ${tripRun.id} for tripId=${params.tripId || 'none'}, userId=${params.userId || 'none'}`);
      return tripRun.id;
    } catch (error: any) {
      this.logger.error(`Failed to create TripRun: ${error.message}`, error.stack);
      // 不抛出错误，避免影响主流程
      return null;
    }
  }

  /**
   * 创建 TripAttempt 记录
   */
  async createTripAttempt(params: CreateTripAttemptParams): Promise<string | null> {
    if (!this.prisma) {
      this.logger.debug('PrismaService not available, skipping TripAttempt creation');
      return null;
    }

    try {
      // 验证 UUID 格式
      if (!this.isValidUUID(params.tripRunId)) {
        this.logger.warn(`Invalid tripRunId format: ${params.tripRunId}`);
        return null;
      }

      const attempt = await this.prisma.tripAttempt.create({
        data: {
          tripRunId: params.tripRunId,
          attemptNumber: params.attemptNumber,
          planOutline: params.planOutline || null,
          openQuestions: params.openQuestions || [],
          constraintsAssumed: params.constraintsAssumed || [],
          nextActions: params.nextActions || [],
          status: 'IN_PROGRESS',
          metadata: params.metadata || {},
        },
      });

      this.logger.debug(`Created TripAttempt: ${attempt.id} for runId=${params.tripRunId}, attemptNumber=${params.attemptNumber}`);
      return attempt.id;
    } catch (error: any) {
      this.logger.error(`Failed to create TripAttempt: ${error.message}`, error.stack);
      // 不抛出错误，避免影响主流程
      return null;
    }
  }

  /**
   * 更新 TripRun 记录
   */
  async updateTripRun(params: UpdateTripRunParams): Promise<boolean> {
    if (!this.prisma) {
      this.logger.debug('PrismaService not available, skipping TripRun update');
      return false;
    }

    try {
      // 验证 UUID 格式
      if (!this.isValidUUID(params.runId)) {
        this.logger.warn(`Invalid runId format: ${params.runId}`);
        return false;
      }

      const updateData: any = {};
      if (params.status) {
        updateData.status = params.status;
      }
      if (params.planningPhase) {
        updateData.planningPhase = params.planningPhase;
      }
      if (params.currentAgent !== undefined) {
        updateData.currentAgent = params.currentAgent;
      }
      if (params.completedAt) {
        updateData.completedAt = params.completedAt;
      }
      if (params.metadata) {
        // 合并元数据
        const existing = await this.prisma.tripRun.findUnique({
          where: { id: params.runId },
          select: { metadata: true },
        });
        updateData.metadata = {
          ...((existing?.metadata as Record<string, any>) || {}),
          ...params.metadata,
        };
      }

      await this.prisma.tripRun.update({
        where: { id: params.runId },
        data: updateData,
      });

      this.logger.debug(`Updated TripRun: ${params.runId}, status=${params.status || 'unchanged'}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to update TripRun: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 更新 TripAttempt 记录
   */
  async updateTripAttempt(params: UpdateTripAttemptParams): Promise<boolean> {
    if (!this.prisma) {
      this.logger.debug('PrismaService not available, skipping TripAttempt update');
      return false;
    }

    try {
      // 验证 UUID 格式
      if (!this.isValidUUID(params.attemptId)) {
        this.logger.warn(`Invalid attemptId format: ${params.attemptId}`);
        return false;
      }

      const updateData: any = {};
      if (params.status) {
        updateData.status = params.status;
      }
      if (params.planOutline !== undefined) {
        updateData.planOutline = params.planOutline;
      }
      if (params.openQuestions) {
        updateData.openQuestions = params.openQuestions;
      }
      if (params.constraintsAssumed) {
        updateData.constraintsAssumed = params.constraintsAssumed;
      }
      if (params.nextActions) {
        updateData.nextActions = params.nextActions;
      }
      if (params.failureNotes !== undefined) {
        updateData.failureNotes = params.failureNotes;
      }
      if (params.resultSummary !== undefined) {
        updateData.resultSummary = params.resultSummary;
      }
      if (params.artifacts) {
        updateData.artifacts = params.artifacts;
      }
      if (params.completedAt) {
        updateData.completedAt = params.completedAt;
      }
      if (params.metadata) {
        // 合并元数据
        const existing = await this.prisma.tripAttempt.findUnique({
          where: { id: params.attemptId },
          select: { metadata: true },
        });
        updateData.metadata = {
          ...((existing?.metadata as Record<string, any>) || {}),
          ...params.metadata,
        };
      }

      await this.prisma.tripAttempt.update({
        where: { id: params.attemptId },
        data: updateData,
      });

      this.logger.debug(`Updated TripAttempt: ${params.attemptId}, status=${params.status || 'unchanged'}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to update TripAttempt: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 完成 TripRun（设置状态为 COMPLETED）
   */
  async completeTripRun(runId: string, metadata?: Record<string, any>): Promise<boolean> {
    return this.updateTripRun({
      runId,
      status: 'COMPLETED',
      completedAt: new Date(),
      metadata,
    });
  }

  /**
   * 失败 TripRun（设置状态为 FAILED）
   */
  async failTripRun(runId: string, error?: Error | string, metadata?: Record<string, any>): Promise<boolean> {
    const errorMessage = error instanceof Error ? error.message : error;
    return this.updateTripRun({
      runId,
      status: 'FAILED',
      completedAt: new Date(),
      metadata: {
        ...metadata,
        error: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * 完成 TripAttempt（设置状态为 COMPLETED）
   */
  async completeTripAttempt(
    attemptId: string,
    resultSummary?: string,
    artifacts?: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<boolean> {
    return this.updateTripAttempt({
      attemptId,
      status: 'COMPLETED',
      resultSummary,
      artifacts,
      completedAt: new Date(),
      metadata,
    });
  }

  /**
   * 失败 TripAttempt（设置状态为 FAILED）
   */
  async failTripAttempt(
    attemptId: string,
    failureNotes: string,
    metadata?: Record<string, any>,
  ): Promise<boolean> {
    return this.updateTripAttempt({
      attemptId,
      status: 'FAILED',
      failureNotes,
      completedAt: new Date(),
      metadata,
    });
  }

  /**
   * v1.0：将 DSO 快照写入 TripRun.metadata（与 `completeTripRun` 等元数据合并）。
   */
  /**
   * 追加单次恢复事件（与既有 metadata 合并；最多保留 40 条）。
   */
  async appendRecoveryAuditEntry(tripRunId: string, entry: Record<string, unknown>): Promise<boolean> {
    if (!this.prisma || !this.isValidUUID(tripRunId)) {
      return false;
    }
    try {
      const existing = await this.prisma.tripRun.findUnique({
        where: { id: tripRunId },
        select: { metadata: true },
      });
      const meta = (existing?.metadata as Record<string, unknown>) || {};
      const prev = (meta[TRIP_RUN_RECOVERY_AUDIT_META_KEY] as { events?: unknown[] }) || {};
      const events = Array.isArray(prev.events) ? [...prev.events] : [];
      events.push({
        ...entry,
        recorded_at: new Date().toISOString(),
      });
      while (events.length > 40) events.shift();

      return this.updateTripRun({
        runId: tripRunId,
        metadata: {
          [TRIP_RUN_RECOVERY_AUDIT_META_KEY]: { events },
        },
      });
    } catch (err: any) {
      this.logger.warn(`appendRecoveryAuditEntry failed: ${err?.message}`);
      return false;
    }
  }

  async saveDsoCheckpoint(tripRunId: string, checkpoint: TripRunDsoCheckpointPayload): Promise<boolean> {
    if (!this.isValidUUID(tripRunId)) {
      this.logger.warn(`saveDsoCheckpoint: invalid tripRunId ${tripRunId}`);
      return false;
    }
    const ok = await this.updateTripRun({
      runId: tripRunId,
      metadata: {
        [TRIP_RUN_DSO_CHECKPOINT_META_KEY]: {
          decision_state: checkpoint.decision_state,
          cursor_step: checkpoint.cursor_step,
          saved_at: checkpoint.saved_at,
        },
      },
    });
    if (ok) {
      this.logger.debug(`[TripRunManager] DSO checkpoint saved for TripRun ${tripRunId}`);
    }
    return ok;
  }

  /**
   * v1.0：读取上次持久化的 DSO 检查点（供断点续跑编排接入；当前仅 API 层加载与可观测性）。
   */
  /**
   * Phase 2：解析 trip 维度服务端最新 DSO systemState.version（TripRun.metadata.dso_checkpoint）。
   * 优先 durable_trip_run_id，否则取该 trip 最近更新的 TripRun。
   */
  async resolveLatestServerDsoVersionForTrip(
    tripId: string,
    preferredTripRunId?: string | null,
  ): Promise<number | undefined> {
    if (!this.prisma) return undefined;
    const tid = tripId?.trim();
    if (!tid || !this.isValidUUID(tid)) return undefined;

    const readVersionFromMetadata = (metadata: unknown): number | undefined => {
      const raw = (metadata as Record<string, unknown> | null)?.[TRIP_RUN_DSO_CHECKPOINT_META_KEY];
      if (!raw || typeof raw !== 'object') return undefined;
      const ds = (raw as Record<string, unknown>).decision_state;
      if (!ds || typeof ds !== 'object') return undefined;
      const ver = (ds as DecisionState).systemState?.version;
      return typeof ver === 'number' && Number.isFinite(ver) ? Math.floor(ver) : undefined;
    };

    const preferred = preferredTripRunId?.trim();
    if (preferred && this.isValidUUID(preferred)) {
      try {
        const row = await this.prisma.tripRun.findUnique({
          where: { id: preferred },
          select: { metadata: true, tripId: true },
        });
        if (row && row.tripId === tid) {
          const v = readVersionFromMetadata(row.metadata);
          if (v !== undefined) return v;
        }
      } catch (error: any) {
        this.logger.debug(`resolveLatestServerDsoVersion preferred run failed: ${error.message}`);
      }
    }

    try {
      const row = await this.prisma.tripRun.findFirst({
        where: { tripId: tid },
        orderBy: { updatedAt: 'desc' },
        select: { metadata: true },
      });
      return readVersionFromMetadata(row?.metadata);
    } catch (error: any) {
      this.logger.warn(`resolveLatestServerDsoVersionForTrip failed: ${error.message}`);
      return undefined;
    }
  }

  async loadDsoCheckpoint(tripRunId: string): Promise<TripRunDsoCheckpointPayload | null> {
    if (!this.prisma) {
      return null;
    }
    if (!this.isValidUUID(tripRunId)) {
      return null;
    }
    try {
      const row = await this.prisma.tripRun.findUnique({
        where: { id: tripRunId },
        select: { metadata: true },
      });
      const raw = (row?.metadata as Record<string, unknown>)?.[TRIP_RUN_DSO_CHECKPOINT_META_KEY];
      if (!raw || typeof raw !== 'object') return null;
      const o = raw as Record<string, unknown>;
      if (!o.decision_state || typeof o.decision_state !== 'object') return null;
      return {
        decision_state: o.decision_state as DecisionState,
        cursor_step: typeof o.cursor_step === 'string' ? o.cursor_step : undefined,
        saved_at: typeof o.saved_at === 'string' ? o.saved_at : new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.warn(`loadDsoCheckpoint failed: ${error.message}`);
      return null;
    }
  }

  /**
   * 验证 UUID 格式
   */
  private isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid.trim());
  }
}
