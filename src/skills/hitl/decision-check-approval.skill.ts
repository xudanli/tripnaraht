// src/skills/hitl/decision-check-approval.skill.ts
/**
 * skill.decision.checkApproval
 * 
 * 检查审批状态
 * 
 * 输入：{ approvalId }
 * 输出：{ status, result, message }
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { ApprovalService } from '../../trips/decision/services/approval.service';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';

export interface DecisionCheckApprovalInput extends BaseSkillInput {
  /** 审批 ID */
  approvalId: string;
}

export interface DecisionCheckApprovalOutput extends SkillOutput {
  /** 审批状态 */
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'not_found';
  
  /** 审批结果 */
  result?: {
    approved: boolean;
    timestamp: string;
    userFeedback?: string;
  };
  
  /** 消息 */
  message: string;
}

@SkillDecorator({
  name: 'decision.checkApproval',
  description: '检查审批请求的状态',
  version: '1.0.0',
  category: 'decision',
})
@Injectable()
export class DecisionCheckApprovalSkill implements Skill<DecisionCheckApprovalInput, DecisionCheckApprovalOutput> {
  private readonly logger = new Logger(DecisionCheckApprovalSkill.name);

  metadata = {
    name: 'decision.checkApproval',
    description: '检查审批请求的状态',
    version: '1.0.0',
    category: 'decision' as const,
  };

  private approvalService?: ApprovalService;

  constructor(
    private readonly moduleRef: ModuleRef,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
    // ApprovalService 在 execute 方法中通过 ModuleRef 获取
  }

  /**
   * 懒加载获取 ApprovalService
   * 避免在构造函数中注入，防止循环依赖死锁
   */
  private getApprovalService(): ApprovalService | null {
    if (!this.approvalService) {
      try {
        this.approvalService = this.moduleRef.get(ApprovalService, { strict: false });
      } catch (error) {
        // 可选依赖，不记录警告
        return null;
      }
    }
    return this.approvalService || null;
  }

  async execute(input: DecisionCheckApprovalInput): Promise<DecisionCheckApprovalOutput> {
    this.logger.log(`检查审批状态: ${input.approvalId}`);

    // Dry Run 模式
    if (input.dryRun) {
      return {
        status: 'pending',
        message: 'Dry Run: 参数验证通过',
      };
    }

    const approvalService = this.getApprovalService();
    if (!approvalService) {
      return {
        status: 'not_found',
        message: 'ApprovalService 未可用',
      };
    }

    const approval = await approvalService.checkStatus(input.approvalId);

    if (!approval) {
      return {
        status: 'not_found',
        message: '未找到审批请求',
      };
    }

    const status = approval.status.toLowerCase() as DecisionCheckApprovalOutput['status'];
    const result = approval.handledAt
      ? {
          approved: status === 'approved',
          timestamp: approval.handledAt.toISOString(),
          userFeedback: approval.decisionNote || undefined,
        }
      : undefined;

    return {
      status,
      result,
      message: this.getStatusMessage(status),
    };
  }

  private getStatusMessage(status: DecisionCheckApprovalOutput['status']): string {
    const messages = {
      pending: '审批请求待处理',
      approved: '审批已通过',
      rejected: '审批已拒绝',
      expired: '审批请求已过期',
      not_found: '未找到审批请求',
    };
    return messages[status] || '未知状态';
  }
}
