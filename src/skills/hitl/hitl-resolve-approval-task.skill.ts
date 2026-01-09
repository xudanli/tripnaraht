// src/skills/hitl/hitl-resolve-approval-task.skill.ts
/**
 * tripnara.hitl.resolveApprovalTask
 * 
 * P0: HITL/Approval MCP - 解决审批任务
 * 
 * 功能：approve/reject/feedback，和 decision logs 绑定
 * 提供统一的审批任务解决接口
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { ApprovalService } from '../../trips/decision/services/approval.service';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';

export interface HitlResolveApprovalTaskInput extends BaseSkillInput {
  /** 任务 ID */
  taskId: string;
  
  /** 操作：approve / reject / request_changes */
  action: 'approve' | 'reject' | 'request_changes';
  
  /** 用户反馈（可选） */
  feedback?: string;
  
  /** 审批人 ID（可选） */
  userId?: string;
}

export interface HitlResolveApprovalTaskOutput extends SkillOutput {
  /** 任务 ID */
  taskId: string;
  
  /** 任务状态 */
  status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  
  /** 解决时间 */
  resolvedAt: string;
  
  /** 如果绑定了决策日志，返回更新后的日志 */
  decisionLogEntry?: DecisionLogEntry;
  
  /** 下一步操作建议 */
  nextActions?: string[];
  
  /** 消息 */
  message: string;
}

@Injectable()
export class HitlResolveApprovalTaskSkill
  implements Skill<HitlResolveApprovalTaskInput, HitlResolveApprovalTaskOutput>
{
  private readonly logger = new Logger(HitlResolveApprovalTaskSkill.name);

  metadata = {
    name: 'hitl.resolveApprovalTask',
    description: '解决审批任务：approve/reject/feedback，和 decision logs 绑定',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    @Optional() private readonly approvalService?: ApprovalService,
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
  ) {
    if (!this.approvalService) {
      this.logger.warn('ApprovalService 未注入，hitl.resolveApprovalTask 功能将不可用');
    }
  }

  async execute(
    input: HitlResolveApprovalTaskInput,
  ): Promise<HitlResolveApprovalTaskOutput> {
    this.logger.debug(
      `执行 hitl.resolveApprovalTask: taskId=${input.taskId}, action=${input.action}`,
    );

    try {
      if (!this.approvalService) {
        throw new Error('ApprovalService 未注入，无法解决审批任务');
      }

      // 1. 获取审批请求
      const approval = await this.approvalService.checkStatus(input.taskId);
      if (!approval) {
        throw new Error(`审批任务 ${input.taskId} 不存在`);
      }

      // 2. 检查当前状态
      if (approval.status !== 'PENDING') {
        const statusText = {
          APPROVED: '已批准',
          REJECTED: '已拒绝',
          EXPIRED: '已过期',
        };
        throw new Error(`审批任务 ${input.taskId} 已处理：${statusText[approval.status] || approval.status}`);
      }

      // 3. 处理审批
      const approved = input.action === 'approve';
      const decisionNote = input.feedback || (approved ? '已批准' : '已拒绝');

      // 使用 ApprovalService 处理审批
      await this.approvalService.handleDecision(input.taskId, {
        approved,
        decisionNote,
        userId: input.userId,
      });

      // 4. 获取关联的决策日志 ID（从 payload 或 metadata 中）
      const payload = approval.payload as any;
      const metadata = approval.metadata as any;
      const decisionLogId = payload?.decisionLogId || metadata?.decisionLogId;

      // 5. 如果绑定了决策日志，记录关联
      let decisionLogEntry: DecisionLogEntry | undefined;
      if (decisionLogId && this.decisionLogStorage) {
        try {
          const log = await this.decisionLogStorage.getLogById(decisionLogId);
          if (log) {
            const updatedMetadata = {
              approvalResolved: true,
              approvalResult: approved ? 'APPROVED' : 'REJECTED',
              approvalFeedback: input.feedback,
              approvalResolvedAt: new Date().toISOString(),
            };
            decisionLogEntry = await this.decisionLogStorage.updateLogMetadata(decisionLogId, updatedMetadata);
            this.logger.debug(`已更新决策日志 ${decisionLogId} 的审批结果`);
          }
        } catch (error: any) {
          this.logger.warn(`更新决策日志失败: ${error.message}`);
        }
      }

      // 6. 生成下一步操作建议
      const nextActions = this.generateNextActions(input.action, approved, decisionLogId);

      // 7. 构建状态
      const status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' =
        input.action === 'approve'
          ? 'APPROVED'
          : input.action === 'reject'
            ? 'REJECTED'
            : 'CHANGES_REQUESTED';

      return {
        taskId: input.taskId,
        status,
        resolvedAt: new Date().toISOString(),
        decisionLogEntry,
        nextActions,
        message: this.getStatusMessage(status, input.feedback),
      };
    } catch (error: any) {
      this.logger.error(`解决审批任务失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 生成下一步操作建议
   */
  private generateNextActions(
    action: string,
    approved: boolean,
    decisionLogId?: string,
  ): string[] {
    const actions: string[] = [];

    if (approved) {
      actions.push('继续执行被批准的操作');
      if (decisionLogId) {
        actions.push(`查看决策日志 ${decisionLogId} 的详细信息`);
      }
    } else if (action === 'reject') {
      actions.push('考虑替代方案');
      actions.push('重新评估决策条件');
      if (decisionLogId) {
        actions.push(`查看决策日志 ${decisionLogId} 了解拒绝原因`);
      }
    } else if (action === 'request_changes') {
      actions.push('根据反馈修改操作参数');
      actions.push('重新提交审批请求');
    }

    return actions;
  }

  /**
   * 获取状态消息
   */
  private getStatusMessage(
    status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
    feedback?: string,
  ): string {
    const messages = {
      APPROVED: '审批已通过',
      REJECTED: '审批已拒绝',
      CHANGES_REQUESTED: '已请求修改',
    };

    const baseMessage = messages[status];
    return feedback ? `${baseMessage}：${feedback}` : baseMessage;
  }
}
