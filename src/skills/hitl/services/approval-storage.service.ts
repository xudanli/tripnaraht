// src/skills/hitl/services/approval-storage.service.ts
/**
 * Approval Storage Service
 * 
 * 管理 HITL 审批请求的持久化存储
 * 
 * 当前实现：内存存储（用于开发）
 * 生产环境：应该使用数据库（Prisma）或 Redis
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ApprovalRequest } from '../entities/approval-request.entity';

@Injectable()
export class ApprovalStorageService implements OnModuleInit {
  private readonly logger = new Logger(ApprovalStorageService.name);
  
  // 内存存储（生产环境应替换为数据库）
  private readonly approvalStore = new Map<string, ApprovalRequest>();

  async onModuleInit() {
    this.logger.log('ApprovalStorageService 初始化完成（当前使用内存存储）');
    this.logger.warn('⚠️  生产环境警告: 当前使用内存存储，重启后数据会丢失。建议使用数据库或 Redis。');
    
    // 启动过期清理任务
    this.startExpirationCleanup();
  }

  /**
   * 创建审批请求
   */
  async createApprovalRequest(request: ApprovalRequest): Promise<ApprovalRequest> {
    this.approvalStore.set(request.id, request);
    this.logger.log(`创建审批请求: ${request.id} (threadId: ${request.threadId})`);
    
    // TODO: 生产环境 - 保存到数据库
    // await this.prisma.approvalRequest.create({ data: request });
    
    return request;
  }

  /**
   * 获取审批请求
   */
  async getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
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

    // TODO: 生产环境 - 从数据库获取
    // return await this.prisma.approvalRequest.findUnique({ where: { id } });
    
    return request;
  }

  /**
   * 更新审批请求
   */
  async updateApprovalRequest(
    id: string,
    updates: Partial<ApprovalRequest>
  ): Promise<ApprovalRequest | null> {
    const request = this.approvalStore.get(id);
    
    if (!request) {
      return null;
    }

    const updated = { ...request, ...updates };
    this.approvalStore.set(id, updated);
    this.logger.log(`更新审批请求: ${id} (status: ${updates.status})`);
    
    // TODO: 生产环境 - 更新数据库
    // return await this.prisma.approvalRequest.update({
    //   where: { id },
    //   data: updates,
    // });
    
    return updated;
  }

  /**
   * 根据 threadId 获取所有待审批的请求
   */
  async getPendingApprovalsByThreadId(threadId: string): Promise<ApprovalRequest[]> {
    const pending = Array.from(this.approvalStore.values()).filter(
      (request) => request.threadId === threadId && request.status === 'pending'
    );
    
    // TODO: 生产环境 - 从数据库查询
    // return await this.prisma.approvalRequest.findMany({
    //   where: { threadId, status: 'pending' },
    // });
    
    return pending;
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
   */
  private startExpirationCleanup() {
    // 每 5 分钟检查一次过期请求
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
    return Array.from(this.approvalStore.values());
  }
}
