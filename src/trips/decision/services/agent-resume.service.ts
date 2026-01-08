// src/trips/decision/services/agent-resume.service.ts
/**
 * Agent Resume Service
 * 
 * 负责 Agent 的挂起和恢复机制
 * 
 * 核心功能：
 * 1. 保存 Agent 状态（挂起时）
 * 2. 恢复 Agent 状态（用户审批后）
 * 3. 构造 Tool Output 消息，让 Agent 继续执行
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalService } from './approval.service';
import { ApprovalStatus } from '@prisma/client';

export interface AgentStateSnapshot {
  threadId: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    toolCallId?: string;
    toolCalls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
  lastToolCallId?: string;
  metadata?: any;
}

@Injectable()
export class AgentResumeService {
  private readonly logger = new Logger(AgentResumeService.name);
  
  // 内存存储 Agent 状态（生产环境应使用 Redis 或数据库）
  private readonly agentStateStore = new Map<string, AgentStateSnapshot>();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly approvalService?: ApprovalService,
  ) {}

  /**
   * 保存 Agent 状态（当检测到 SUSPENDED 信号时调用）
   */
  async saveAgentState(threadId: string, snapshot: AgentStateSnapshot): Promise<void> {
    this.agentStateStore.set(threadId, snapshot);
    this.logger.log(`保存 Agent 状态: threadId=${threadId}, messages=${snapshot.messages.length}`);

    // TODO: 生产环境 - 保存到 Redis 或数据库
    // await this.redis.setex(`agent:state:${threadId}`, 86400, JSON.stringify(snapshot));
    // 或
    // await this.prisma.agentState.upsert({ ... });
  }

  /**
   * 加载 Agent 状态
   */
  async loadAgentState(threadId: string): Promise<AgentStateSnapshot | null> {
    const snapshot = this.agentStateStore.get(threadId);
    
    if (snapshot) {
      this.logger.log(`加载 Agent 状态: threadId=${threadId}, messages=${snapshot.messages.length}`);
      return snapshot;
    }

    // TODO: 生产环境 - 从 Redis 或数据库加载
    // const state = await this.redis.get(`agent:state:${threadId}`);
    // return state ? JSON.parse(state) : null;

    return null;
  }

  /**
   * 清除 Agent 状态（任务完成后）
   */
  async clearAgentState(threadId: string): Promise<void> {
    this.agentStateStore.delete(threadId);
    this.logger.log(`清除 Agent 状态: threadId=${threadId}`);

    // TODO: 生产环境
    // await this.redis.del(`agent:state:${threadId}`);
  }

  /**
   * 构造 Tool Output 消息（用于恢复 Agent）
   * 
   * 这是关键方法：将审批结果"伪造"成 Tool Output，让 Agent 以为函数调用完成了
   */
  constructToolOutputMessage(
    toolCallId: string,
    approvalRequest: { status: ApprovalStatus; decisionNote?: string | null; payload?: any }
  ): AgentStateSnapshot['messages'][0] {
    const status = approvalRequest.status;

    if (status === ApprovalStatus.APPROVED) {
      // 用户已批准：告诉 Agent 可以继续执行
      return {
        role: 'tool',
        toolCallId,
        content: JSON.stringify({
          status: 'APPROVED',
          note: approvalRequest.decisionNote,
          instruction: 'User has APPROVED this action. You may now proceed to execute the actual tool with the original parameters.',
          originalPayload: approvalRequest.payload, // 把原始参数还给 Agent
        }),
      };
    } else if (status === ApprovalStatus.REJECTED) {
      // 用户已拒绝：告诉 Agent 操作被拒绝
      return {
        role: 'tool',
        toolCallId,
        content: JSON.stringify({
          status: 'REJECTED',
          note: approvalRequest.decisionNote,
          instruction: 'User has REJECTED this action. You should not proceed with this operation. Consider alternative approaches or inform the user.',
        }),
      };
    } else if (status === ApprovalStatus.EXPIRED) {
      // 已过期：告诉 Agent 请求已过期
      return {
        role: 'tool',
        toolCallId,
        content: JSON.stringify({
          status: 'EXPIRED',
          instruction: 'The approval request has EXPIRED. You should inform the user and ask if they still want to proceed, or suggest alternative actions.',
        }),
      };
    }

    // 其他状态
    return {
      role: 'tool',
      toolCallId,
      content: JSON.stringify({
        status,
        instruction: `The approval request status is ${status}. Please handle accordingly.`,
      }),
    };
  }

  /**
   * 恢复 Agent 执行（用户审批后调用）
   * 
   * 流程：
   * 1. 加载 Agent 状态
   * 2. 构造 Tool Output 消息
   * 3. 将消息添加到历史
   * 4. 返回更新后的消息列表（供 Agent 继续执行）
   */
  async resumeAgent(threadId: string, approvalId: string): Promise<AgentStateSnapshot | null> {
    // 1. 加载历史状态
    const snapshot = await this.loadAgentState(threadId);
    if (!snapshot) {
      this.logger.warn(`未找到 Agent 状态: threadId=${threadId}`);
      return null;
    }

    // 2. 获取审批结果
    if (!this.approvalService) {
      this.logger.error('ApprovalService 未可用，无法恢复 Agent');
      return null;
    }

    const approvalRequest = await this.approvalService.checkStatus(approvalId);
    if (!approvalRequest) {
      this.logger.warn(`审批请求不存在: ${approvalId}`);
      return null;
    }

    // 3. 构造 Tool Output 消息
    const toolCallId = approvalRequest.toolCallId || snapshot.lastToolCallId;
    if (!toolCallId) {
      this.logger.warn(`未找到 toolCallId，无法构造 Tool Output`);
      return null;
    }

    const toolOutputMessage = this.constructToolOutputMessage(toolCallId, approvalRequest);

    // 4. 将 Tool Output 添加到消息历史
    const updatedMessages = [...snapshot.messages, toolOutputMessage];

    // 5. 更新状态
    const updatedSnapshot: AgentStateSnapshot = {
      ...snapshot,
      messages: updatedMessages,
    };

    // 6. 保存更新后的状态
    await this.saveAgentState(threadId, updatedSnapshot);

    this.logger.log(`Agent 已恢复: threadId=${threadId}, approvalId=${approvalId}, status=${approvalRequest.status}`);

    return updatedSnapshot;
  }

  /**
   * 检测 Agent 执行结果中的 SUSPENDED 信号
   * 
   * 在 Agent Runner 中调用，用于检测是否需要挂起
   */
  detectSuspensionSignal(result: any): boolean {
    return result?._system_status === 'SUSPENDED';
  }

  /**
   * 从 Agent 执行结果中提取挂起信息
   */
  extractSuspensionInfo(result: any): {
    approvalId: string;
    message: string;
    userUI?: any;
  } | null {
    if (!this.detectSuspensionSignal(result)) {
      return null;
    }

    return {
      approvalId: result.approvalId,
      message: result.message,
      userUI: result.userUI,
    };
  }
}
