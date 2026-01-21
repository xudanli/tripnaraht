// src/trips/decision/controllers/approval.controller.ts
/**
 * Approval Controller
 * 
 * 提供审批请求的前端 API
 */

import { Controller, Get, Post, Param, Body, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { ApprovalService } from '../services/approval.service';
import { AgentResumeService } from '../services/agent-resume.service';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { Public } from '../../../auth/decorators/public.decorator';
import { TrajectoryCollectionService } from '../../../agent/training/services/trajectory-collection.service';
import { ApprovalStatus } from '@prisma/client';

@ApiTags('decision')
@Controller('approvals')
export class ApprovalController {
  private readonly logger = new Logger(ApprovalController.name);

  constructor(
    private readonly approvalService: ApprovalService,
    private readonly agentResumeService: AgentResumeService,
    @Optional() private readonly trajectoryCollection?: TrajectoryCollectionService,
  ) {}

  /**
   * 获取审批请求详情
   */
  @Public()
  @Get(':id')
  @ApiOperation({ 
    summary: '获取审批请求详情',
    description: '根据审批请求 ID 获取审批请求的详细信息',
  })
  @ApiParam({ name: 'id', description: '审批请求 ID' })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '审批请求不存在', type: ApiErrorResponseDto })
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
  @Public()
  @Get('thread/:threadId/pending')
  @ApiOperation({ 
    summary: '获取会话的所有待审批请求',
    description: '获取指定会话/线程的所有待审批请求列表',
  })
  @ApiParam({ name: 'threadId', description: '会话/线程 ID' })
  @ApiResponse({ status: 200, description: '获取成功', type: ApiSuccessResponseDto })
  async getPendingApprovals(@Param('threadId') threadId: string) {
    return this.approvalService.getPendingApprovalsByThreadId(threadId);
  }

  /**
   * 处理审批（批准或拒绝）
   */
  @Public()
  @Post(':id/decision')
  @ApiOperation({ 
    summary: '处理审批请求（批准或拒绝）',
    description: '处理审批请求，可以批准或拒绝，并可选择是否立即恢复 Agent 执行',
  })
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
  @ApiResponse({ status: 200, description: '处理成功', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '审批请求不存在', type: ApiErrorResponseDto })
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

    // Iterative Deployment: 更新轨迹的用户审批状态
    if (this.trajectoryCollection && approvalRequest.agentRunId) {
      try {
        // 尝试根据 agentRunId 查找轨迹（agentRunId 通常就是 requestId）
        const trajectoryResult = await this.trajectoryCollection.findTrajectoryByRequestId(
          approvalRequest.agentRunId,
        );
        if (trajectoryResult.trajectoryId) {
          const userApproval = body.approved
            ? ApprovalStatus.APPROVED
            : ApprovalStatus.REJECTED;
          await this.trajectoryCollection.updateTrajectoryWithApproval(
            trajectoryResult.trajectoryId,
            userApproval,
          );
          this.logger.debug(
            `轨迹审批状态已更新: trajectoryId=${trajectoryResult.trajectoryId}, approval=${userApproval}`,
          );
        }
      } catch (error: any) {
        // 轨迹更新失败不应该影响审批流程
        this.logger.warn(`更新轨迹审批状态失败: ${error?.message}`);
      }
    }

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
  @ApiResponse({ status: 200, description: '取消成功', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '审批请求不存在', type: ApiErrorResponseDto })
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
  @Public()
  @Post(':id/resume-agent')
  @ApiOperation({ 
    summary: '手动触发 Agent 恢复',
    description: '手动触发 Agent 恢复执行，用于调试或手动恢复场景',
  })
  @ApiParam({ name: 'id', description: '审批请求 ID' })
  @ApiResponse({ status: 200, description: '恢复成功', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '审批请求不存在', type: ApiErrorResponseDto })
  @ApiResponse({ status: 400, description: '请求状态无效', type: ApiErrorResponseDto })
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
