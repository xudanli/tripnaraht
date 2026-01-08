// src/skills/hitl/decision-request-approval.skill.ts
/**
 * skill.decision.requestApproval
 * 
 * Human-in-the-loop (HITL) 审批 Skill
 * 
 * 当 Agent 做出高风险决定时，挂起任务并返回给用户确认
 * 
 * 输入：{ action, context, riskLevel, required, expiresAt? }
 * 输出：{ approvalId, status, message, userPrompt }
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { ApprovalService } from '../../trips/decision/services/approval.service';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';

export interface DecisionRequestApprovalInput extends BaseSkillInput {
  /** 会话/线程 ID（用于 Agent 恢复上下文） */
  threadId?: string;
  
  /** LLM 工具调用的 ID（用于回填结果） */
  toolCallId?: string;
  /** 需要审批的操作 */
  action: {
    type: string;
    description: string;
    details: Record<string, any>;
  };
  
  /** 上下文信息（用于用户理解决策背景） */
  context?: {
    tripId?: string;
    userId?: string;
    decisionReason?: string;
    alternatives?: Array<{
      option: string;
      description: string;
      pros?: string[];
      cons?: string[];
    }>;
  };
  
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  
  /** 是否必需（必需的操作如果被拒绝，可能导致任务失败） */
  required?: boolean;
  
  /** 审批过期时间（ISO 8601 格式，可选） */
  expiresAt?: string;
  
  /** 自动审批延迟（秒，如果设置且未过期，将自动批准） */
  autoApproveAfter?: number;
}

export interface DecisionRequestApprovalOutput extends SkillOutput {
  /** 系统状态标记 - 用于 Agent 识别挂起信号 */
  _system_status?: 'SUSPENDED';
  
  /** 审批 ID（用于后续查询状态） */
  approvalId: string;
  
  /** 审批状态 */
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto-approved';
  
  /** 消息 */
  message: string;
  
  /** 给用户的提示信息（需要用户看到的） */
  userPrompt?: {
    title: string;
    description: string;
    action: string;
    riskLevel: string;
    context?: Record<string, any>;
    alternatives?: Array<{
      option: string;
      description: string;
      pros?: string[];
      cons?: string[];
    }>;
    buttons?: Array<{
      label: string;
      action: 'approve' | 'reject' | 'modify';
      value?: { approved?: boolean; showAlternatives?: boolean; [key: string]: any };
    }>;
  };
  
  /** 如果需要用户交互，返回此字段指示挂起任务 */
  requiresUserInput?: boolean;
  
  /** 任务挂起信息 */
  suspendedTask?: {
    taskId: string;
    resumeAfter: 'user_approval' | 'user_rejection' | 'expiration';
    timeout?: number;
  };
  
  /** 前端 UI 类型（用于显示审批卡片） */
  userUI?: {
    type: 'approval_card';
    data: any;
  };
}

@SkillDecorator({
  name: 'decision.requestApproval',
  description: '请求用户审批高风险决策（Human-in-the-loop）。当 Agent 需要做出高风险决定时，挂起任务并等待用户确认',
  version: '1.0.0',
  category: 'decision',
})
@Injectable()
export class DecisionRequestApprovalSkill implements Skill<DecisionRequestApprovalInput, DecisionRequestApprovalOutput> {
  private readonly logger = new Logger(DecisionRequestApprovalSkill.name);

  metadata = {
    name: 'decision.requestApproval',
    description: '请求用户审批高风险决策（Human-in-the-loop）。当 Agent 需要做出高风险决定时，挂起任务并等待用户确认',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    @Optional() private readonly approvalService?: ApprovalService,
  ) {}

  async execute(input: DecisionRequestApprovalInput): Promise<DecisionRequestApprovalOutput> {
    this.logger.log(`请求审批: ${input.action.type} (风险等级: ${input.riskLevel})`);

    // Dry Run 模式：只验证参数，不执行实际操作
    if (input.dryRun) {
      this.logger.log('Dry Run 模式: 只验证参数，不执行实际操作');
      return {
        approvalId: 'dry-run',
        status: 'approved',
        message: 'Dry Run: 参数验证通过',
        userPrompt: {
          title: 'Dry Run 模式',
          description: '参数验证通过，但未执行实际操作',
          action: input.action.description,
          riskLevel: input.riskLevel,
        },
      };
    }

    // 检查是否过期
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    if (expiresAt && expiresAt < new Date()) {
      return {
        _system_status: undefined, // 过期不需要挂起
        approvalId: 'expired',
        status: 'expired',
        message: '审批请求已过期',
        userPrompt: {
          title: '审批请求已过期',
          description: '此审批请求已过期，无法继续处理',
          action: input.action.description,
          riskLevel: input.riskLevel,
        },
      };
    }

    // 检查是否自动审批
    if (input.autoApproveAfter && input.riskLevel === 'low') {
      // 低风险操作可以自动审批
      this.logger.log(`低风险操作将自动审批`);
      
      if (this.approvalService) {
        try {
          await this.approvalService.createRequest({
            threadId: input.threadId || 'unknown',
            agentRunId: undefined, // 可以从上下文中获取
            toolCallId: input.toolCallId,
            skillName: this.metadata.name,
            summary: input.action.description,
            description: input.context?.decisionReason,
            payload: input.action.details,
            riskLevel: input.riskLevel,
            expiresAt,
            metadata: {
              autoApproved: true,
              userPrompt: this.generateUserPrompt(input),
            },
          });
        } catch (error: any) {
          this.logger.warn(`创建审批记录失败（自动审批仍继续）: ${error.message}`);
        }
      }
      
      return {
        _system_status: undefined, // 自动审批不需要挂起
        approvalId: 'auto-approved',
        status: 'auto-approved',
        message: '低风险操作已自动审批',
        userPrompt: {
          title: '操作已自动审批',
          description: `低风险操作"${input.action.description}"已自动审批`,
          action: input.action.description,
          riskLevel: input.riskLevel,
        },
      };
    }

    // 生成用户提示
    const userPrompt = this.generateUserPrompt(input);

    // 创建审批请求（持久化到数据库）
    let approvalId: string;
    if (this.approvalService) {
      try {
        const request = await this.approvalService.createRequest({
          threadId: input.threadId || 'unknown',
          agentRunId: undefined, // 可以从上下文中获取
          toolCallId: input.toolCallId,
          skillName: this.metadata.name,
          summary: input.action.description,
          description: input.context?.decisionReason,
          payload: input.action.details, // 存原始参数，用于后续执行
          riskLevel: input.riskLevel,
          expiresAt,
          metadata: {
            action: input.action,
            context: input.context,
            userPrompt,
          },
        });
        approvalId = request.id;
      } catch (error: any) {
        this.logger.error(`创建审批请求失败: ${error.message}`, error.stack);
        throw new Error(`无法创建审批请求: ${error.message}`);
      }
    } else {
      // 降级：如果没有 ApprovalService，使用内存存储（不推荐生产环境）
      this.logger.warn('⚠️  ApprovalService 未可用，使用内存存储（数据在重启后会丢失）');
      approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      (global as any).__approvalStore = (global as any).__approvalStore || new Map();
      (global as any).__approvalStore.set(approvalId, {
        id: approvalId,
        threadId: input.threadId || 'unknown',
        toolCallId: input.toolCallId,
        skillName: this.metadata.name,
        payload: input.action.details,
        status: 'pending',
        createdAt: new Date(),
        expiresAt,
        userPrompt,
      });
    }

    // 返回给 Agent 的关键信号：挂起标记
    return {
      _system_status: 'SUSPENDED', // 🔑 这是 Agent 识别挂起的关键标记
      approvalId,
      status: 'pending',
      message: `I have created an approval request (ID: ${approvalId}) for user confirmation. I will wait for the user's decision before proceeding.`,
      userPrompt,
      requiresUserInput: true,
      suspendedTask: {
        taskId: approvalId,
        resumeAfter: 'user_approval',
        timeout: expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : undefined,
      },
      userUI: {
        type: 'approval_card',
        data: {
          approvalId,
          summary: input.action.description,
          description: input.context?.decisionReason,
          riskLevel: input.riskLevel,
          action: input.action,
          context: input.context,
        },
      },
    };
  }

  /**
   * 生成用户提示信息
   */
  private generateUserPrompt(input: DecisionRequestApprovalInput): DecisionRequestApprovalOutput['userPrompt'] {
    const riskLevelLabels = {
      low: '低风险',
      medium: '中等风险',
      high: '高风险',
      critical: '极高风险',
    };

    const buttons: Array<{
      label: string;
      action: 'approve' | 'reject' | 'modify';
      value?: { approved?: boolean; showAlternatives?: boolean; [key: string]: any };
    }> = [
      {
        label: '批准',
        action: 'approve',
        value: { approved: true },
      },
      {
        label: '拒绝',
        action: 'reject',
        value: { approved: false },
      },
    ];

    // 如果有替代方案，添加"修改"按钮
    if (input.context?.alternatives && input.context.alternatives.length > 0) {
      buttons.push({
        label: '查看替代方案',
        action: 'modify',
        value: { showAlternatives: true },
      });
    }

    return {
      title: `需要您的审批: ${input.action.type}`,
      description: input.action.description,
      action: input.action.description,
      riskLevel: riskLevelLabels[input.riskLevel],
      context: {
        decisionReason: input.context?.decisionReason,
        tripId: input.context?.tripId,
        details: input.action.details,
      },
      alternatives: input.context?.alternatives,
      buttons,
    };
  }

}
