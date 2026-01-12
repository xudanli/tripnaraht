// src/agent/planning-workbench.controller.ts
/**
 * Planning Workbench Controller
 * 
 * 规划工作台 API 接口
 */

import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PlanningWorkbenchAgentService, PlanningWorkbenchRequest, PlanningWorkbenchResponse } from './services/planning-workbench-agent.service';
import { PlanContext } from '../skills/plan/shared/plan-state.types';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('planning-workbench')
@Controller('planning-workbench')
export class PlanningWorkbenchController {
  constructor(
    private readonly planningWorkbenchAgent: PlanningWorkbenchAgentService,
  ) {}

  /**
   * 执行规划工作台流程
   */
  @Public()
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行规划工作台流程',
    description: `
规划工作台的主入口，支持以下操作：
- generate: 生成行程骨架方案
- compare: 对比多个方案
- commit: 提交选定的方案
- adjust: 调整现有方案

返回三人格的决策结果（Abu/Dr.Dre/Neptune），其他角色（预算/交通/节奏/总规划师）隐藏为能力模块。
    `.trim(),
  })
  @ApiBody({
    description: '规划工作台请求',
    schema: {
      type: 'object',
      properties: {
        context: {
          type: 'object',
          properties: {
            destination: {
              type: 'object',
              properties: {
                country: { type: 'string' },
                city: { type: 'string' },
                region: { type: 'string' },
              },
            },
            days: { type: 'number' },
            travelMode: { type: 'string', enum: ['self_drive', 'public_transit', 'walking', 'mixed'] },
            mustDo: { type: 'array', items: { type: 'string' } },
            mustAvoid: { type: 'array', items: { type: 'string' } },
            constraints: { type: 'object' },
          },
          required: ['destination', 'days'],
        },
        tripId: { type: 'string' },
        userAction: { type: 'string', enum: ['generate', 'compare', 'commit', 'adjust'] },
      },
      required: ['context'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '规划工作台执行成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            planState: { type: 'object' },
            uiOutput: {
              type: 'object',
              properties: {
                personas: {
                  type: 'object',
                  properties: {
                    abu: { type: 'object' },
                    drdre: { type: 'object' },
                    neptune: { type: 'object' },
                  },
                },
                consolidatedDecision: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ALLOW', 'NEED_CONFIRM', 'REJECT'] },
                    summary: { type: 'string' },
                    nextSteps: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async execute(@Body() request: PlanningWorkbenchRequest) {
    try {
      const result = await this.planningWorkbenchAgent.execute(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取规划状态
   */
  @Public()
  @Get('state/:planId')
  @ApiOperation({
    summary: '获取规划状态',
    description: '根据 planId 获取当前的 PlanState',
  })
  @ApiParam({
    name: 'planId',
    description: '规划 ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getState(@Param('planId') planId: string) {
    // TODO: 实现从存储中获取 PlanState
    return successResponse({ planId, message: 'Not implemented yet' });
  }
}
