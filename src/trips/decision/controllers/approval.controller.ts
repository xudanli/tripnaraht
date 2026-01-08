// src/trips/decision/controllers/approval.controller.ts
/**
 * Approval Controller
 * 
 * 提供审批请求的前端 API
 */

import { Controller, Get, Post, Param, Body, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { ApprovalService } from '../services/approval.service';
import { AgentResumeService } from '../services/agent-resume.service';

@ApiTags('approvals')
@Controller('api/approvals')
export class ApprovalController {
  private readonly logger = new Logger(ApprovalController.name);

  constructor(
    private readonly approvalService: ApprovalService,
    private readonly agentResumeService: AgentResumeService,
  ) {}

  /**
   * 获取审批请求详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取审批请求详情' })
  @ApiParam({ name: 'id', description: '审批请求 ID' })
  async getApproval(@Param('id') id: string) {
    const request = await this.approvalService.checkStatus(id);
    if (!request) {
      throw new NotFoundException(`审批请求不存在: ${id}`);
    }
    return request;
  }

  /**
   * 获取会话的所有待审批请求
   */
  @Get('thread/:threadId/pending')
  @ApiOperation({ summary: '获取会话的所有待审批请求' })
  @ApiParam({ name: 'threadId', description: '会话/线程 ID' })
  async getPendingApprovals(@Param('threadId') threadId: string) {
    return this.approvalService.getPendingApprovalsByThreadId(threadId);
  }

  /**
   * 处理审批（批准或拒绝）
   */
  @Post(':id/decision')
  @ApiOperation({ summary: '处理审批请求（批准或拒绝）' })
  @ApiParam({ name: 'id', description: '审批请求 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        approved: { type: 'boolean', description: '是否批准' },
        decisionNote: { type: 'string', description: '审批备注（可选）' },
        userId: { type: 'string', description: '用户 ID（可选）' },
        resumeAgent: { type: 'boolean', description: '是否立即恢复 Agent（默认 true）' },
      },
      required: ['approved'],
    },
  })
  async handleDecision(
    @Param('id') id: string,
    @Body() body: {
      approved: boolean;
      decisionNote?: string;
      userId?: string;
      resumeAgent?: boolean;
    },
  ) {
    // 1. 处理审批
    const approvalRequest = await this.approvalService.handleDecision(id, {
      approved: body.approved,
      decisionNote: body.decisionNote,
      userId: body.userId,
    });

    // 2. 如果用户要求恢复 Agent，则恢复
    const shouldResume = body.resumeAgent !== false; // 默认为 true
    if (shouldResume && approvalRequest.threadId) {
      try {
        await this.agentResumeService.resumeAgent(approvalRequest.threadId, id);
        this.logger.log(`Agent 已恢复: threadId=${approvalRequest.threadId}, approvalId=${id}`);
      } catch (error: any) {
        this.logger.error(`恢复 Agent 失败: ${error.message}`, error.stack);
        // 不抛出错误，因为审批已经成功处理
      }
    }

    return {
      success: true,
      approval: approvalRequest,
      agentResumed: shouldResume,
    };
  }

  /**
   * 取消审批请求
   */
  @Post(':id/cancel')
  @ApiOperation({ summary: '取消审批请求' })
  @ApiParam({ name: 'id', description: '审批请求 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: '取消原因（可选）' },
      },
    },
  })
  async cancelApproval(
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
  ) {
    const request = await this.approvalService.cancelRequest(id, body.reason);
    return {
      success: true,
      approval: request,
    };
  }

  /**
   * 手动触发 Agent 恢复（用于调试或手动恢复）
   */
  @Post(':id/resume-agent')
  @ApiOperation({ summary: '手动触发 Agent 恢复' })
  @ApiParam({ name: 'id', description: '审批请求 ID' })
  async resumeAgent(@Param('id') id: string) {
    const approvalRequest = await this.approvalService.checkStatus(id);
    if (!approvalRequest) {
      throw new NotFoundException(`审批请求不存在: ${id}`);
    }

    if (approvalRequest.status !== 'APPROVED' && approvalRequest.status !== 'REJECTED') {
      throw new BadRequestException(
        `只能恢复已审批的请求（当前状态: ${approvalRequest.status}）`,
      );
    }

    if (!approvalRequest.threadId) {
      throw new BadRequestException('审批请求缺少 threadId，无法恢复 Agent');
    }

    const snapshot = await this.agentResumeService.resumeAgent(approvalRequest.threadId, id);
    if (!snapshot) {
      throw new BadRequestException('无法恢复 Agent：未找到 Agent 状态');
    }

    return {
      success: true,
      message: 'Agent 已恢复',
      snapshot: {
        threadId: snapshot.threadId,
        messageCount: snapshot.messages.length,
      },
    };
  }
}
