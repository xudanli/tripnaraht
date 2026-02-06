// src/agent/services/agent-run-admin.service.ts
/**
 * Agent Run Admin Service
 * 
 * 用于后台管理 Agent 运行（TripRun）和尝试（TripAttempt）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostgreSQLMcpService } from '../../mcp/postgresql-mcp.service';

@Injectable()
export class AgentRunAdminService {
  private readonly logger = new Logger(AgentRunAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly postgresqlMcp?: PostgreSQLMcpService,
  ) {}

  /**
   * 验证 UUID 格式
   * UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 十六进制字符)
   */
  private isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid.trim());
  }

  /**
   * 分页查询 TripRun 列表
   */
  async getRuns(filters: {
    tripId?: string;
    userId?: string;
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    planningPhase?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    // 验证并过滤无效的 UUID（如占位符 "trip-uuid", "user-uuid"）
    if (filters.tripId) {
      if (this.isValidUUID(filters.tripId)) {
        where.tripId = filters.tripId.trim();
      } else {
        this.logger.warn(`Invalid tripId format: ${filters.tripId}, ignoring filter`);
      }
    }
    if (filters.userId) {
      if (this.isValidUUID(filters.userId)) {
        where.userId = filters.userId.trim();
      } else {
        this.logger.warn(`Invalid userId format: ${filters.userId}, ignoring filter`);
      }
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.planningPhase) {
      where.planningPhase = filters.planningPhase;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const total = await this.prisma.tripRun.count({ where });

    const runs = await this.prisma.tripRun.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        TripAttempt: {
          orderBy: { attemptNumber: 'desc' },
          take: 1, // 只取最新的 attempt
        },
      },
    });

    const items = runs.map(run => ({
      id: run.id,
      tripId: run.tripId,
      userId: run.userId,
      userQuery: run.userQuery,
      planningPhase: run.planningPhase,
      currentAgent: run.currentAgent,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      metadata: run.metadata || {},
      latestAttempt: run.TripAttempt[0] ? {
        id: run.TripAttempt[0].id,
        attemptNumber: run.TripAttempt[0].attemptNumber,
        status: run.TripAttempt[0].status,
        createdAt: run.TripAttempt[0].createdAt.toISOString(),
      } : null,
      duration: run.completedAt 
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : null,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取 TripRun 详情
   */
  async getRunById(runId: string): Promise<any | null> {
    // 验证 UUID 格式
    if (!this.isValidUUID(runId)) {
      this.logger.warn(`Invalid runId format: ${runId}`);
      return null;
    }

    const run = await this.prisma.tripRun.findUnique({
      where: { id: runId.trim() },
      include: {
        TripAttempt: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });

    if (!run) {
      return null;
    }

    return {
      id: run.id,
      tripId: run.tripId,
      userId: run.userId,
      userQuery: run.userQuery,
      planningPhase: run.planningPhase,
      currentAgent: run.currentAgent,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      metadata: run.metadata || {},
      attempts: run.TripAttempt.map(attempt => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        planOutline: attempt.planOutline,
        openQuestions: attempt.openQuestions || [],
        constraintsAssumed: attempt.constraintsAssumed || [],
        nextActions: attempt.nextActions || [],
        failureNotes: attempt.failureNotes,
        status: attempt.status,
        resultSummary: attempt.resultSummary,
        artifacts: attempt.artifacts || {},
        createdAt: attempt.createdAt.toISOString(),
        updatedAt: attempt.updatedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString(),
        metadata: attempt.metadata || {},
      })),
      duration: run.completedAt 
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : Math.floor((new Date().getTime() - run.createdAt.getTime()) / 1000),
    };
  }

  /**
   * 获取 TripRun 统计
   */
  async getRunStats(filters?: {
    startDate?: Date;
    endDate?: Date;
    planningPhase?: string;
  }): Promise<any> {
    const where: any = {};
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }
    if (filters?.planningPhase) {
      where.planningPhase = filters.planningPhase;
    }

    const total = await this.prisma.tripRun.count({ where });

    const byStatus = await this.prisma.tripRun.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const byPhase = await this.prisma.tripRun.groupBy({
      by: ['planningPhase'],
      where,
      _count: true,
    });

    // 计算平均耗时
    const completedRuns = await this.prisma.tripRun.findMany({
      where: {
        ...where,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    const durations = completedRuns
      .map(run => run.completedAt 
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : null
      )
      .filter((d): d is number => d !== null);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      summary: {
        totalRuns: total,
        completedRuns: byStatus.find(s => s.status === 'COMPLETED')?._count || 0,
        failedRuns: byStatus.find(s => s.status === 'FAILED')?._count || 0,
        inProgressRuns: byStatus.find(s => s.status === 'IN_PROGRESS')?._count || 0,
        successRate: total > 0 
          ? (byStatus.find(s => s.status === 'COMPLETED')?._count || 0) / total
          : 0,
        avgDuration,
      },
      byStatus: byStatus.map(s => ({
        status: s.status,
        count: s._count,
        percentage: total > 0 ? (s._count / total) * 100 : 0,
      })),
      byPhase: byPhase.map(p => ({
        phase: p.planningPhase,
        count: p._count,
        percentage: total > 0 ? (p._count / total) * 100 : 0,
      })),
    };
  }

  /**
   * 分页查询 TripAttempt 列表
   */
  async getAttempts(filters: {
    tripRunId?: string;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    // 验证并过滤无效的 UUID
    if (filters.tripRunId) {
      if (this.isValidUUID(filters.tripRunId)) {
        where.tripRunId = filters.tripRunId.trim();
      } else {
        this.logger.warn(`Invalid tripRunId format: ${filters.tripRunId}, ignoring filter`);
      }
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const total = await this.prisma.tripAttempt.count({ where });

    const attempts = await this.prisma.tripAttempt.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        TripRun: {
          select: {
            id: true,
            tripId: true,
            userId: true,
            userQuery: true,
            planningPhase: true,
          },
        },
      },
    });

    const items = attempts.map(attempt => ({
      id: attempt.id,
      tripRunId: attempt.tripRunId,
      attemptNumber: attempt.attemptNumber,
      planOutline: attempt.planOutline,
      openQuestions: attempt.openQuestions || [],
      constraintsAssumed: attempt.constraintsAssumed || [],
      nextActions: attempt.nextActions || [],
      failureNotes: attempt.failureNotes,
      status: attempt.status,
      resultSummary: attempt.resultSummary,
      artifacts: attempt.artifacts || {},
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString(),
      metadata: attempt.metadata || {},
      run: {
        id: attempt.TripRun.id,
        tripId: attempt.TripRun.tripId,
        userId: attempt.TripRun.userId,
        userQuery: attempt.TripRun.userQuery,
        planningPhase: attempt.TripRun.planningPhase,
      },
      duration: attempt.completedAt 
        ? Math.floor((attempt.completedAt.getTime() - attempt.createdAt.getTime()) / 1000)
        : null,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取 TripAttempt 详情
   */
  async getAttemptById(attemptId: string): Promise<any | null> {
    // 验证 UUID 格式
    if (!this.isValidUUID(attemptId)) {
      this.logger.warn(`Invalid attemptId format: ${attemptId}`);
      return null;
    }

    const attempt = await this.prisma.tripAttempt.findUnique({
      where: { id: attemptId.trim() },
      include: {
        TripRun: true,
      },
    });

    if (!attempt) {
      return null;
    }

    return {
      id: attempt.id,
      tripRunId: attempt.tripRunId,
      attemptNumber: attempt.attemptNumber,
      planOutline: attempt.planOutline,
      openQuestions: attempt.openQuestions || [],
      constraintsAssumed: attempt.constraintsAssumed || [],
      nextActions: attempt.nextActions || [],
      failureNotes: attempt.failureNotes,
      status: attempt.status,
      resultSummary: attempt.resultSummary,
      artifacts: attempt.artifacts || {},
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString(),
      metadata: attempt.metadata || {},
      run: {
        id: attempt.TripRun.id,
        tripId: attempt.TripRun.tripId,
        userId: attempt.TripRun.userId,
        userQuery: attempt.TripRun.userQuery,
        planningPhase: attempt.TripRun.planningPhase,
        currentAgent: attempt.TripRun.currentAgent,
        status: attempt.TripRun.status,
        createdAt: attempt.TripRun.createdAt.toISOString(),
      },
      duration: attempt.completedAt 
        ? Math.floor((attempt.completedAt.getTime() - attempt.createdAt.getTime()) / 1000)
        : null,
    };
  }

  /**
   * 取消 TripRun
   */
  async cancelRun(runId: string): Promise<boolean> {
    // 验证 UUID 格式
    if (!this.isValidUUID(runId)) {
      this.logger.warn(`Invalid runId format: ${runId}`);
      return false;
    }

    try {
      await this.prisma.tripRun.update({
        where: { id: runId.trim() },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          metadata: {
            cancelled: true,
            cancelledAt: new Date().toISOString(),
          },
        },
      });
      return true;
    } catch (error: any) {
      this.logger.error(`取消运行失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取性能分析
   */
  async getPerformanceAnalysis(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    const where: any = {
      status: 'COMPLETED',
      completedAt: { not: null },
    };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const runs = await this.prisma.tripRun.findMany({
      where,
      select: {
        createdAt: true,
        completedAt: true,
        planningPhase: true,
        status: true,
      },
    });

    const durations = runs
      .map(run => run.completedAt 
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : null
      )
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalRuns: 0,
      };
    }

    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50Duration: durations[p50Index] || 0,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      totalRuns: durations.length,
    };
  }

  /**
   * 批量更新 TripRun 状态（使用 PostgreSQL MCP）
   */
  async batchUpdateRunStatus(
    runIds: string[],
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  ): Promise<number> {
    if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
      // 降级：逐个更新（较慢）
      this.logger.warn('PostgreSQL MCP service not available, falling back to individual updates');
      let updated = 0;
      for (const runId of runIds) {
        try {
          await this.prisma.tripRun.update({
            where: { id: runId },
            data: { status },
          });
          updated++;
        } catch (error: any) {
          this.logger.warn(`Failed to update run ${runId}: ${error.message}`);
        }
      }
      return updated;
    }

    try {
      const query = `
        UPDATE "TripRun"
        SET 
          status = $1,
          updated_at = NOW()
        WHERE id = ANY($2::uuid[])
      `;

      const result = await this.postgresqlMcp.execute(query, [status, runIds]);
      return result.rowCount || 0;
    } catch (error: any) {
      this.logger.error(`批量更新 TripRun 状态失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理过期的 TripRun（使用 PostgreSQL MCP）
   */
  async cleanupExpiredRuns(retentionDays: number = 90): Promise<number> {
    if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
      throw new Error('PostgreSQL MCP service not available for cleanup operation');
    }

    try {
      const query = `
        DELETE FROM "TripRun"
        WHERE status = 'COMPLETED'
          AND completed_at < NOW() - INTERVAL '${retentionDays} days'
      `;

      const result = await this.postgresqlMcp.execute(query);
      return result.rowCount || 0;
    } catch (error: any) {
      this.logger.error(`清理过期 TripRun 失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
