// src/agent/execution.controller.ts
/**
 * Execution Controller
 * 
 * 执行阶段 API 接口
 */

import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { ExecutionAgentService, ExecutionAgentRequest, ExecutionAgentResponse } from './services/execution-agent.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('execution')
@Controller('execution')
export class ExecutionController {
  constructor(
    private readonly executionAgent: ExecutionAgentService,
  ) {}

  /**
   * 执行执行阶段流程
   */
  @Public()
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行执行阶段流程',
    description: `
执行阶段的 Agent，负责"贴心管家式的提醒、变更与兜底"。

支持的操作：
- remind: 生成提醒
- handle_change: 处理变更
- fallback: 生成兜底方案
- get_status: 获取执行状态
    `.trim(),
  })
  @ApiBody({
    description: '执行阶段请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['remind', 'handle_change', 'fallback', 'get_status'],
        },
        remindParams: { type: 'object' },
        changeParams: { type: 'object' },
        fallbackParams: { type: 'object' },
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
}
