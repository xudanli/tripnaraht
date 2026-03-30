// src/skills/hitl/hitl-create-approval-task.skill.ts
/**
 * tripnara.hitl.createApprovalTask
 * 
 * P0: HITL/Approval MCP - 创建审批任务
 * 
 * 功能：创建审批任务，输出 task_id + payload，支持多种审批类型
 * 与 Decision Logs 绑定，提供统一的审批任务创建接口
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { ApprovalService } from '../../trips/decision/services/approval.service';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';

export interface HitlCreateApprovalTaskInput extends BaseSkillInput {
  /** 任务类型 */
  taskType: 'DECISION_REJECT' | 'PLAN_REPLACEMENT' | 'RISK_CONFIRMATION' | 'CUSTOM';
  
  /** 任务标题 */
  title: string;
  
  /** 任务描述 */
  description: string;
  
  /** 任务负载 */
  payload: {
    /** 关联的决策日志 ID（可选） */
    decisionLogId?: string;
    /** Trip ID（可选） */
    tripId?: string;
    /** 路线方向 ID（可选） */
    routeDirectionId?: string;
    /** 审批上下文 */
    context: Record<string, any>;
  };
  
  /** 选项 */
  options?: {
    /** 是否必需（必需的操作如果被拒绝，可能导致任务失败） */
    required?: boolean;
    /** 过期时间（ISO 8601 格式） */
    expiresAt?: string;
    /** 通知渠道 */
    notifyChannels?: string[];
    /** 优先级 */
    priority?: 'low' | 'medium' | 'high' | 'critical';
    /** 风险等级 */
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    /** 会话/线程 ID（用于 Agent 恢复上下文） */
    threadId?: string;
    /** LLM 工具调用的 ID（用于回填结果） */
    toolCallId?: string;
  };
}

export interface HitlCreateApprovalTaskOutput extends SkillOutput {
  /** 任务 ID */
  taskId: string;
  
  /** 任务状态 */
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  
  /** 消息 */
  message: string;
  
  /** 给用户的提示信息 */
  userPrompt: string;
  
  /** 审批页面 URL（如果有 Web UI） */
  approvalUrl?: string;
  
  /** 过期时间 */
  expiresAt?: string;
  
  /** 关联的决策日志 ID（如果提供了） */
  decisionLogId?: string;
}

@Injectable()
export class HitlCreateApprovalTaskSkill
  implements Skill<HitlCreateApprovalTaskInput, HitlCreateApprovalTaskOutput>
{
  private readonly logger = new Logger(HitlCreateApprovalTaskSkill.name);

  metadata = {
    name: 'hitl.createApprovalTask',
    description: '创建审批任务：输出 task_id + payload，支持多种审批类型，与 Decision Logs 绑定',
    version: '1.0.0',
    category: 'decision' as const,
  };

  private approvalService?: ApprovalService;
  private decisionLogStorage?: DecisionLogStorageService;

  constructor(
    private readonly moduleRef: ModuleRef,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
    // ApprovalService 和 DecisionLogStorageService 在 execute 方法中通过 ModuleRef 获取
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
        this.logger.warn('无法获取 ApprovalService，hitl.createApprovalTask 功能将不可用');
        return null;
      }
    }
    return this.approvalService || null;
  }

  /**
   * 懒加载获取 DecisionLogStorageService
   */
  private getDecisionLogStorage(): DecisionLogStorageService | null {
    if (!this.decisionLogStorage) {
      try {
        this.decisionLogStorage = this.moduleRef.get(DecisionLogStorageService, { strict: false });
      } catch (error) {
        // 可选依赖，不记录警告
        return null;
      }
    }
    return this.decisionLogStorage || null;
  }

  async execute(
    input: HitlCreateApprovalTaskInput,
  ): Promise<HitlCreateApprovalTaskOutput> {
    this.logger.debug(
      `执行 hitl.createApprovalTask: taskType=${input.taskType}, title=${input.title}`,
    );

    try {
      const approvalService = this.getApprovalService();
      if (!approvalService) {
        throw new Error('ApprovalService 未注入，无法创建审批任务');
      }

      // 1. 验证决策日志 ID（如果提供）
      let decisionLogId = input.payload.decisionLogId;
      const decisionLogStorage = this.getDecisionLogStorage();
      if (decisionLogId && decisionLogStorage) {
        try {
          const log = await decisionLogStorage.getLogById(decisionLogId);
          if (!log) {
            this.logger.warn(`决策日志 ${decisionLogId} 不存在，将创建无关联的审批任务`);
            decisionLogId = undefined;
          } else {
            this.logger.debug(`已验证决策日志 ${decisionLogId} 存在`);
          }
        } catch (error: any) {
          this.logger.warn(`验证决策日志失败: ${error.message}，将创建无关联的审批任务`);
          decisionLogId = undefined;
        }
      }

      // 2. 构建审批请求参数（转换为 ApprovalService 的格式）
      const riskLevel = input.options?.riskLevel || 'medium';
      const expiresAt = input.options?.expiresAt
        ? new Date(input.options.expiresAt)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // 默认 24h 过期

      const approvalData = {
        threadId: input.options?.threadId || 'unknown',
        toolCallId: input.options?.toolCallId,
        skillName: this.metadata.name,
        summary: input.title,
        description: input.description,
        payload: {
          ...input.payload.context,
          decisionLogId,
          tripId: input.payload.tripId,
          routeDirectionId: input.payload.routeDirectionId,
          taskType: input.taskType,
        },
        riskLevel,
        expiresAt,
        metadata: {
          taskType: input.taskType,
          required: input.options?.required !== false,
          priority: input.options?.priority || 'medium',
          notifyChannels: input.options?.notifyChannels || [],
        },
      };

      // 3. 创建审批请求
      const approvalResult = await approvalService.createRequest(approvalData);

      // 4. 如果提供了决策日志 ID，记录关联
      if (decisionLogId && decisionLogStorage) {
        try {
          const log = await decisionLogStorage.getLogById(decisionLogId);
          if (log) {
            const updatedMetadata = {
              approvalTaskId: approvalResult.id,
              approvalTaskType: input.taskType,
              approvalTaskCreatedAt: new Date().toISOString(),
            };
            await decisionLogStorage.updateLogMetadata(decisionLogId, updatedMetadata);
            this.logger.debug(`已关联审批任务 ${approvalResult.id} 到决策日志 ${decisionLogId}`);
          }
        } catch (error: any) {
          this.logger.warn(`更新决策日志失败: ${error.message}`);
        }
      }

      // 5. 构建用户提示信息
      const userPrompt = this.buildUserPrompt(input, approvalResult.id);

      // 6. 构建审批 URL（如果有 Web UI）
      const approvalUrl = this.buildApprovalUrl(approvalResult.id);

      return {
        taskId: approvalResult.id,
        status: 'PENDING',
        message: '审批任务已创建',
        userPrompt,
        approvalUrl,
        expiresAt: approvalResult.expiresAt?.toISOString(),
        decisionLogId,
      };
    } catch (error: any) {
      this.logger.error(`创建审批任务失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 构建用户提示信息
   */
  private buildUserPrompt(
    input: HitlCreateApprovalTaskInput,
    taskId: string,
  ): string {
    const riskLevelText = {
      low: '低风险',
      medium: '中等风险',
      high: '高风险',
      critical: '严重风险',
    };

    const riskText = riskLevelText[input.options?.riskLevel || 'medium'];
    const requiredText = input.options?.required !== false ? '（必需）' : '（可选）';

    return `${input.title}${requiredText}\n\n${input.description}\n\n风险等级：${riskText}\n任务 ID：${taskId}`;
  }

  /**
   * 构建审批 URL
   * 
   * 根据环境变量和配置构建审批页面的 URL
   */
  private buildApprovalUrl(taskId: string): string {
    // 优先使用环境变量中的基础 URL
    const baseUrl = process.env.APP_BASE_URL || 
                   process.env.FRONTEND_URL || 
                   process.env.NEXT_PUBLIC_APP_URL ||
                   'https://app.tripnara.com';
    
    // 构建审批页面路径
    // 支持不同的路径格式：/approvals/:id 或 /approval/:id
    const approvalPath = process.env.APPROVAL_PATH_PATTERN || '/approvals';
    const url = `${baseUrl}${approvalPath}/${taskId}`;
    
    this.logger.debug(`构建审批 URL: ${url}`);
    
    return url;
  }
}
