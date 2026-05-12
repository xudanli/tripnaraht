// src/skills/hitl/entities/approval-request.entity.ts
/**
 * Approval Request Entity
 *
 * HITL 审批请求的持久化实体
 */

export interface ApprovalRequest {
  /** 唯一审批 ID */
  id: string;

  /** 关联的会话/线程 ID（用于 Agent 恢复上下文） */
  threadId: string;

  /** LLM 调用该工具时的 ID（用于回填结果到 Agent） */
  toolCallId?: string;

  /** 触发的技能名称 */
  skillName: string;

  /** 原始参数（如预订酒店的详情） */
  payload: any;

  /** 审批状态 */
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto-approved';

  /** 创建时间 */
  createdAt: Date;

  /** 过期时间 */
  expiresAt?: Date;

  /** 审批结果（如果已审批） */
  result?: {
    approved: boolean;
    timestamp: Date;
    userFeedback?: string;
    userId?: string;
  };

  /** 用户提示信息（前端显示） */
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
  };

  /** 元数据（用于扩展） */
  metadata?: Record<string, any>;
}

/**
 * Approval Request 的数据库实体（如果使用 Prisma）
 */
export const ApprovalRequestSchema = {
  id: String,
  threadId: String,
  toolCallId: String,
  skillName: String,
  payload: Object,
  status: String,
  createdAt: Date,
  expiresAt: Date,
  result: Object,
  userPrompt: Object,
  metadata: Object,
};
