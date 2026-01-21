// src/agent/services/trip-run-manager.service.ts
/**
 * TripRun Manager Service
 * 
 * 负责管理 Agent 运行记录（TripRun 和 TripAttempt）的创建和更新
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
