// src/agent/execution.controller.ts
/**
 * Execution Controller
 * 
 * 执行阶段 API 接口
 * 
 * 注意：此控制器已被标记为可删除（见 API_CLEANUP_PROPOSAL.md）
 * 功能已合并到 journey-assistant.controller.ts
 * 保留此文件仅为了向后兼容
 */

import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { ExecutionAgentService, ExecutionAgentRequest, ExecutionAgentResponse } from './services/execution-agent.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ReorderRequestDto } from './dto/reorder.dto';
import { ApplyFallbackRequestDto } from './dto/apply-fallback.dto';

@ApiTags('execution')
@Controller('execution')
export class ExecutionController {
  private readonly logger = new Logger(ExecutionController.name);

  constructor(
    private readonly executionAgent: ExecutionAgentService,
  ) {
    // 添加诊断日志
    this.logger.log(`[ExecutionController] 控制器已创建，executionAgent: ${!!this.executionAgent}`);
  }

  /**
   * 健康检查（用于测试路由是否注册）
   */
  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行控制器健康检查',
    description: '用于测试路由是否注册',
  })
  async health() {
    return successResponse({ status: 'ok', message: 'ExecutionController is working' });
  }

  /**
   * 执行执行阶段流程
   */
  @Public()
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行执行阶段流程',
    description: '执行阶段的 Agent，负责处理行程执行中的各种事件和变更',
  })
  @ApiBody({
    description: '执行阶段请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['remind', 'handle_change', 'fallback'],
        },
      },
      required: ['tripId', 'action'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '执行成功',
  })
  async execute(@Body() request: ExecutionAgentRequest) {
    try {
      const result = await this.executionAgent.execute(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 重新排序行程
   */
  @Public()
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '重新排序行程',
    description: '重新排序指定日期的行程项顺序',
  })
  @ApiBody({
    description: '重新排序请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        dayId: { type: 'string' },
        newOrder: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
      required: ['tripId', 'dayId', 'newOrder'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '重新排序成功',
  })
  async reorder(@Body() request: ReorderRequestDto) {
    try {
      const result = await this.executionAgent.reorder(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 应用修复方案
   */
  @Public()
  @Post('apply-fallback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '应用修复方案',
    description: '应用Neptune提供的修复方案',
  })
  @ApiBody({
    description: '应用修复方案请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        solutionId: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['tripId', 'solutionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '应用修复方案成功',
  })
  async applyFallback(@Body() request: ApplyFallbackRequestDto) {
    try {
      const result = await this.executionAgent.applyFallback(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 预览修复方案
   */
  @Public()
  @Get('fallback/:solutionId/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '预览修复方案',
    description: '预览修复方案的详细变更内容',
  })
  @ApiParam({ name: 'solutionId', description: '修复方案ID', example: 'solution-uuid' })
  @ApiResponse({
    status: 200,
    description: '成功返回修复方案预览',
  })
  async previewFallback(@Param('solutionId') solutionId: string) {
    try {
      const result = await this.executionAgent.previewFallback(solutionId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
