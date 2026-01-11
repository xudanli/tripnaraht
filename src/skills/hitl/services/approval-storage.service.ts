// src/skills/hitl/services/approval-storage.service.ts
/**
 * Approval Storage Service
 * 
 * 管理 HITL 审批请求的持久化存储
 * 
 * 实现：优先使用数据库（Prisma），数据库不可用时降级到内存存储
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalRequest } from '../entities/approval-request.entity';
import { ApprovalStatus } from '@prisma/client';

@Injectable()
export class ApprovalStorageService implements OnModuleInit {
  private readonly logger = new Logger(ApprovalStorageService.name);
  private useDatabase: boolean = false; // 在 onModuleInit 中设置
  
  // 内存存储（数据库不可用时的降级方案）
  private readonly approvalStore = new Map<string, ApprovalRequest>();

  constructor(@Optional() private readonly prisma?: PrismaService) {
    // 注意：在构造函数中，PrismaService.onModuleInit() 还没有执行，所以 isDbConnected() 可能返回 false
    // 实际的数据库连接检查在 onModuleInit() 中进行
  }

  async onModuleInit() {
    this.logger.log('[ApprovalStorageService] onModuleInit 开始执行...');
    // 在 onModuleInit 中检查数据库连接状态（此时 PrismaService.onModuleInit() 已经执行）
    this.useDatabase = !!this.prisma && this.prisma.isDbConnected();
    
    if (this.useDatabase) {
      this.logger.log('ApprovalStorageService 初始化完成（使用数据库存储）');
    } else {
      this.logger.log('ApprovalStorageService 初始化完成（使用内存存储）');
      if (!this.prisma) {
        this.logger.warn('ApprovalStorageService: PrismaService 未注入');
      } else if (!this.prisma.isDbConnected()) {
        this.logger.warn(
          'ApprovalStorageService: 数据库不可用，使用内存存储。' +
          '数据在重启后会丢失。如需启用数据库存储，请确保 DATABASE_URL 已配置且数据库可访问。'
        );
      }
      // 仅在内存存储模式下启动过期清理任务（数据库模式下使用 ApprovalCleanupScheduler）
      this.startExpirationCleanup();
    }
    this.logger.log('[ApprovalStorageService] onModuleInit 执行完成');
  }

  /**
   * 创建审批请求
   */
  async createApprovalRequest(request: ApprovalRequest): Promise<ApprovalRequest> {
    this.logger.log(`创建审批请求: ${request.id} (threadId: ${request.threadId})`);
    
    if (this.useDatabase && this.prisma) {
      try {
        // 将 ApprovalRequest 实体转换为数据库模型
        const dbRequest = await this.prisma.approvalRequest.create({
          data: {
            threadId: request.threadId,
            agentRunId: (request as any).agentRunId,
            toolCallId: request.toolCallId,
            skillName: request.skillName,
            summary: (request as any).summary || request.userPrompt?.title || '',
            description: (request as any).description || request.userPrompt?.description,
            payload: request.payload,
            riskLevel: (request as any).riskLevel || 'medium',
            status: this.mapStatusToApprovalStatus(request.status),
            expiresAt: request.expiresAt,
            metadata: {
              ...(request.userPrompt ? { userPrompt: request.userPrompt } : {}),
              ...(request.metadata || {}),
            },
          },
        });
        
        // 转换为 ApprovalRequest 实体
        return this.mapDbToEntity(dbRequest);
      } catch (error: any) {
        this.logger.error(`保存审批请求到数据库失败: ${error.message}`, error.stack);
        // 降级到内存存储
        this.approvalStore.set(request.id, request);
        return request;
      }
    } else {
      // 内存存储
      this.approvalStore.set(request.id, request);
      return request;
    }
  }

  /**
   * 获取审批请求
   */
  async getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
    if (this.useDatabase && this.prisma) {
      try {
        const dbRequest = await this.prisma.approvalRequest.findUnique({
          where: { id },
        });
        
        if (!dbRequest) {
          return null;
        }

        // 检查是否过期
        if (dbRequest.status === ApprovalStatus.PENDING && 
            dbRequest.expiresAt && 
            dbRequest.expiresAt < new Date()) {
          // 自动更新为过期状态
          const updated = await this.prisma.approvalRequest.update({
            where: { id },
            data: {
              status: ApprovalStatus.EXPIRED,
              handledAt: new Date(),
            },
          });
          return this.mapDbToEntity(updated);
        }
        
        return this.mapDbToEntity(dbRequest);
      } catch (error: any) {
        this.logger.error(`从数据库获取审批请求失败: ${error.message}`, error.stack);
        // 降级到内存存储
        return this.approvalStore.get(id) || null;
      }
    } else {
      // 内存存储
      const request = this.approvalStore.get(id);
      
      if (!request) {
        return null;
      }

      // 检查是否过期
      if (request.expiresAt && request.expiresAt < new Date()) {
        if (request.status === 'pending') {
          request.status = 'expired';
          await this.updateApprovalRequest(id, { status: 'expired' });
        }
      }
      
      return request;
    }
  }

  /**
   * 更新审批请求
   */
  async updateApprovalRequest(
    id: string,
    updates: Partial<ApprovalRequest>
  ): Promise<ApprovalRequest | null> {
    this.logger.log(`更新审批请求: ${id} (status: ${updates.status || 'unknown'})`);
    
    if (this.useDatabase && this.prisma) {
      try {
        // 准备数据库更新数据
        const dbUpdates: any = {};
        
        if (updates.status) {
          dbUpdates.status = this.mapStatusToApprovalStatus(updates.status);
        }
        if (updates.expiresAt !== undefined) {
          dbUpdates.expiresAt = updates.expiresAt;
        }
        if (updates.result) {
          dbUpdates.handledAt = updates.result.timestamp || new Date();
          dbUpdates.decisionNote = updates.result.userFeedback;
          const existingRequest = await this.prisma.approvalRequest.findUnique({ where: { id } });
          dbUpdates.metadata = {
            ...(existingRequest?.metadata as any || {}),
            userId: updates.result.userId,
            decisionTimestamp: updates.result.timestamp?.toISOString(),
          };
        }
        if (updates.userPrompt) {
          const existingRequest = await this.prisma.approvalRequest.findUnique({ where: { id } });
          dbUpdates.metadata = {
            ...(existingRequest?.metadata as any || {}),
            userPrompt: updates.userPrompt,
          };
        }
        if (updates.payload) {
          dbUpdates.payload = updates.payload;
        }
        
        const updated = await this.prisma.approvalRequest.update({
          where: { id },
          data: dbUpdates,
        });
        
        return this.mapDbToEntity(updated);
      } catch (error: any) {
        this.logger.error(`更新审批请求到数据库失败: ${error.message}`, error.stack);
        // 降级到内存存储
        const request = this.approvalStore.get(id);
        if (!request) {
          return null;
        }
        const updated = { ...request, ...updates };
        this.approvalStore.set(id, updated);
        return updated;
      }
    } else {
      // 内存存储
      const request = this.approvalStore.get(id);
      
      if (!request) {
        return null;
      }

      const updated = { ...request, ...updates };
      this.approvalStore.set(id, updated);
      
      return updated;
    }
  }

  /**
   * 根据 threadId 获取所有待审批的请求
   */
  async getPendingApprovalsByThreadId(threadId: string): Promise<ApprovalRequest[]> {
    if (this.useDatabase && this.prisma) {
      try {
        const dbRequests = await this.prisma.approvalRequest.findMany({
          where: {
            threadId,
            status: ApprovalStatus.PENDING,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });
        
        return dbRequests.map(req => this.mapDbToEntity(req));
      } catch (error: any) {
        this.logger.error(`从数据库查询待审批请求失败: ${error.message}`, error.stack);
        // 降级到内存存储
        return Array.from(this.approvalStore.values()).filter(
          (request) => request.threadId === threadId && request.status === 'pending'
        );
      }
    } else {
      // 内存存储
      return Array.from(this.approvalStore.values()).filter(
        (request) => request.threadId === threadId && request.status === 'pending'
      );
    }
  }

  /**
   * 处理审批响应
   */
  async handleApprovalResponse(
    id: string,
    approved: boolean,
    userFeedback?: string,
    userId?: string
  ): Promise<ApprovalRequest | null> {
    const request = await this.getApprovalRequest(id);
    
    if (!request) {
      return null;
    }

    if (request.status !== 'pending') {
      this.logger.warn(`审批请求 ${id} 状态为 ${request.status}，无法更新`);
      return request;
    }

    const updates: Partial<ApprovalRequest> = {
      status: approved ? 'approved' : 'rejected',
      result: {
        approved,
        timestamp: new Date(),
        userFeedback,
        userId,
      },
    };

    return await this.updateApprovalRequest(id, updates);
  }

  /**
   * 启动过期清理任务（定期清理过期的审批请求）
   * 注意：仅在内存存储模式下使用（数据库模式下使用 ApprovalCleanupScheduler）
   */
  private startExpirationCleanup() {
    if (this.useDatabase) {
      // 数据库模式下，清理任务由 ApprovalCleanupScheduler 处理
      return;
    }
    
    // 内存存储模式：每 5 分钟检查一次过期请求
    setInterval(() => {
      const now = new Date();
      let expiredCount = 0;

      for (const [id, request] of this.approvalStore.entries()) {
        if (
          request.status === 'pending' &&
          request.expiresAt &&
          request.expiresAt < now
        ) {
          request.status = 'expired';
          this.updateApprovalRequest(id, { status: 'expired' });
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        this.logger.log(`清理了 ${expiredCount} 个过期的审批请求`);
      }
    }, 5 * 60 * 1000); // 5 分钟
  }

  /**
   * 获取所有审批请求（用于调试）
   */
  getAllApprovals(): ApprovalRequest[] {
    if (this.useDatabase && this.prisma) {
      // 注意：数据库模式下，这个方法可能需要分页，避免返回过多数据
      return []; // 或实现分页查询
    } else {
      return Array.from(this.approvalStore.values());
    }
  }

  /**
   * 将数据库模型转换为 ApprovalRequest 实体
   */
  private mapDbToEntity(dbRequest: any): ApprovalRequest {
    const metadata = (dbRequest.metadata || {}) as any;
    
    return {
      id: dbRequest.id,
      threadId: dbRequest.threadId,
      toolCallId: dbRequest.toolCallId || undefined,
      skillName: dbRequest.skillName,
      payload: dbRequest.payload,
      status: this.mapApprovalStatusToStatus(dbRequest.status),
      createdAt: dbRequest.createdAt,
      expiresAt: dbRequest.expiresAt || undefined,
      result: dbRequest.handledAt ? {
        approved: dbRequest.status === ApprovalStatus.APPROVED,
        timestamp: dbRequest.handledAt,
        userFeedback: dbRequest.decisionNote || undefined,
        userId: metadata.userId || undefined,
      } : undefined,
      userPrompt: metadata.userPrompt || undefined,
      metadata: metadata,
    };
  }

  /**
   * 将 ApprovalStatus 枚举转换为字符串状态
   */
  private mapApprovalStatusToStatus(status: ApprovalStatus): ApprovalRequest['status'] {
    switch (status) {
      case ApprovalStatus.PENDING:
        return 'pending';
      case ApprovalStatus.APPROVED:
        return 'approved';
      case ApprovalStatus.REJECTED:
        return 'rejected';
      case ApprovalStatus.EXPIRED:
        return 'expired';
      case ApprovalStatus.CANCELLED:
        return 'expired'; // 取消状态映射为过期
      default:
        return 'pending';
    }
  }

  /**
   * 将字符串状态转换为 ApprovalStatus 枚举
   */
  private mapStatusToApprovalStatus(status: ApprovalRequest['status']): ApprovalStatus {
    switch (status) {
      case 'pending':
        return ApprovalStatus.PENDING;
      case 'approved':
        return ApprovalStatus.APPROVED;
      case 'rejected':
        return ApprovalStatus.REJECTED;
      case 'expired':
        return ApprovalStatus.EXPIRED;
      case 'auto-approved':
        return ApprovalStatus.APPROVED; // 自动批准映射为已批准
      default:
        return ApprovalStatus.PENDING;
    }
  }
}
