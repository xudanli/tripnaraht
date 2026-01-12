// src/agent/trip-detail.controller.ts
/**
 * Trip Detail Controller
 * 
 * 行程详情页 API 接口
 */

import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TripDetailAgentService, TripDetailAgentRequest, TripDetailAgentResponse } from './services/trip-detail-agent.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('trip-detail')
@Controller('trip-detail')
export class TripDetailController {
  constructor(
    private readonly tripDetailAgent: TripDetailAgentService,
  ) {}

  /**
   * 执行行程详情页流程
   */
  @Public()
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行行程详情页流程',
    description: `
行程详情页的 Agent，负责"理解与掌控旅行现状"。

支持的操作：
- get_status: 理解当前状态
- get_health: 分析健康度
- explain_decisions: 解释决策
- show_evidence: 展示证据
- get_full: 获取完整信息
    `.trim(),
  })
  @ApiBody({
    description: '行程详情页请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['get_status', 'get_health', 'explain_decisions', 'show_evidence', 'get_full'],
        },
        decisionId: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
      },
      required: ['tripId', 'action'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '执行成功',
  })
  async execute(@Body() request: TripDetailAgentRequest) {
    try {
      const result = await this.tripDetailAgent.execute(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取行程状态（GET 方式）
   */
  @Public()
  @Get(':tripId/status')
  @ApiOperation({
    summary: '获取行程状态',
    description: '理解当前行程状态（规划中/进行中/已完成）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getStatus(@Param('tripId') tripId: string) {
    try {
      const result = await this.tripDetailAgent.execute({
        tripId,
        action: 'get_status',
      });
      return successResponse(result.uiOutput.status);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取行程健康度（GET 方式）
   */
  @Public()
  @Get(':tripId/health')
  @ApiOperation({
    summary: '获取行程健康度',
    description: '分析行程健康度（时间、预算、节奏、可达性）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getHealth(@Param('tripId') tripId: string) {
    try {
      const result = await this.tripDetailAgent.execute({
        tripId,
        action: 'get_health',
      });
      return successResponse(result.uiOutput.health);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
