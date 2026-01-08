// src/trips/decision/services/approval.service.ts
/**
 * Approval Service
 * 
 * 核心的审批请求管理服务，负责数据库的读写
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalStatus } from '@prisma/client';

export interface CreateApprovalRequestData {
  threadId: string;
  agentRunId?: string;
  toolCallId?: string;
  skillName: string;
  summary: string;
  description?: string;
  payload: any;
  riskLevel: string;
  expiresAt?: Date;
  metadata?: any;
}

export interface HandleDecisionData {
  approved: boolean;
  decisionNote?: string;
  userId?: string;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * 检查数据库是否可用
   */
  private isDatabaseAvailable(): boolean {
    return !!this.prisma && this.prisma.isDbConnected();
  }

  /**
   * 创建审批请求
   */
  async createRequest(data: CreateApprovalRequestData) {
    if (!this.isDatabaseAvailable()) {
      throw new Error('数据库不可用，无法创建审批请求。请确保 DATABASE_URL 已配置。');
    }

    try {
      const request = await this.prisma!.approvalRequest.create({
        data: {
          threadId: data.threadId,
          agentRunId: data.agentRunId,
          toolCallId: data.toolCallId,
          skillName: data.skillName,
          summary: data.summary,
          description: data.description,
          payload: data.payload,
          riskLevel: data.riskLevel,
          status: ApprovalStatus.PENDING,
          expiresAt: data.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 默认 24h 过期
          metadata: data.metadata || {},
        },
      });

      this.logger.log(`创建审批请求: ${request.id} (threadId: ${data.threadId})`);
      return request;
    } catch (error: any) {
      this.logger.error(`创建审批请求失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 用户处理审批 (前端调用的 API)
   */
  async handleDecision(requestId: string, data: HandleDecisionData) {
    if (!this.isDatabaseAvailable()) {
      throw new Error('数据库不可用，无法处理审批请求。');
    }

    const request = await this.prisma!.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`审批请求不存在: ${requestId}`);
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`审批请求状态为 ${request.status}，无法更新`);
    }

    // 检查是否过期
    if (request.expiresAt && request.expiresAt < new Date()) {
      // 自动更新为过期状态
      const expired = await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: ApprovalStatus.EXPIRED,
          handledAt: new Date(),
        },
      });
      throw new Error(`审批请求已过期: ${requestId}`);
    }

    const status = data.approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;

    const updated = await this.prisma!.approvalRequest.update({
      where: { id: requestId },
      data: {
        status,
        decisionNote: data.decisionNote,
        handledAt: new Date(),
        metadata: {
          ...(request.metadata as any || {}),
          userId: data.userId,
          decisionTimestamp: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`审批请求已处理: ${requestId} (${status})`);
    return updated;
  }

  /**
   * 检查状态 (Agent 轮询或恢复时使用)
   */
  async checkStatus(requestId: string) {
    if (!this.isDatabaseAvailable()) {
      return null;
    }

    const request = await this.prisma!.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return null;
    }

    // 检查是否过期
    if (request.status === ApprovalStatus.PENDING && request.expiresAt && request.expiresAt < new Date()) {
      // 自动更新为过期状态
      return await this.prisma!.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: ApprovalStatus.EXPIRED,
          handledAt: new Date(),
        },
      });
    }

    return request;
  }

  /**
   * 根据 threadId 获取所有待审批的请求
   */
  async getPendingApprovalsByThreadId(threadId: string) {
    if (!this.isDatabaseAvailable()) {
      return [];
    }

    return this.prisma!.approvalRequest.findMany({
      where: {
        threadId,
        status: ApprovalStatus.PENDING,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * 根据 toolCallId 查找审批请求
   */
  async findByToolCallId(toolCallId: string) {
    if (!this.isDatabaseAvailable()) {
      return null;
    }

    return this.prisma!.approvalRequest.findFirst({
      where: { toolCallId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 取消审批请求
   */
  async cancelRequest(requestId: string, reason?: string) {
    if (!this.isDatabaseAvailable()) {
      throw new Error('数据库不可用，无法取消审批请求。');
    }

    const request = await this.prisma!.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`审批请求不存在: ${requestId}`);
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error(`审批请求状态为 ${request.status}，无法取消`);
    }

    return this.prisma!.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: ApprovalStatus.CANCELLED,
        decisionNote: reason || '已取消',
        handledAt: new Date(),
      },
    });
  }

  /**
   * 清理过期的审批请求（定期任务）
   */
  async cleanupExpiredRequests() {
    if (!this.isDatabaseAvailable()) {
      return 0;
    }

    const now = new Date();
    const result = await this.prisma!.approvalRequest.updateMany({
      where: {
        status: ApprovalStatus.PENDING,
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: ApprovalStatus.EXPIRED,
        handledAt: now,
      },
    });

    if (result.count > 0) {
      this.logger.log(`清理了 ${result.count} 个过期的审批请求`);
    }

    return result.count;
  }
}
