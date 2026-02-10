// src/skills/world/world-model-evidence.controller.ts
/**
 * 世界模型证据 API 控制器
 * 
 * 提供世界模型证据的查询接口
 */

import { Controller, Get, Post, Body, Query, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { WorldModelEvidenceService } from './services/world-model-evidence.service';
import {
  WorldModelEvidenceRequestDto,
  WorldModelEvidenceResponseDto,
} from './dto/world-model-evidence.dto';

@ApiTags('world-model-evidence')
@Controller('world-model-evidence')
export class WorldModelEvidenceController {
  constructor(private readonly evidenceService: WorldModelEvidenceService) {}

  /**
   * 获取世界模型证据（POST方式）
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取世界模型证据',
    description: `
根据行程ID或国家代码获取世界模型证据，包括：
- DEM证据（地形难度、累计爬升、坡度等）
- 道路状态（开放/关闭、车辆要求等）
- 天气窗口（最佳月份、可达性评分等）
- 路线哲学（核心陈述、必须体验、路线红线等）
- 失败画像（常见失败日期、典型失败原因、缓解措施等）
- 用户能力匹配（风险承受度、车辆要求、体能匹配等）

支持通过include参数选择返回的证据类型。
    `.trim(),
  })
  @ApiBody({
    type: WorldModelEvidenceRequestDto,
    description: '世界模型证据查询请求',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回世界模型证据',
    type: WorldModelEvidenceResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误（缺少tripId或countryCode）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'BAD_REQUEST' },
            message: { type: 'string', example: '必须提供tripId或countryCode' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'INTERNAL_ERROR' },
            message: { type: 'string', example: '构建世界模型失败' },
          },
        },
      },
    },
  })
  async getEvidence(@Body() request: WorldModelEvidenceRequestDto) {
    try {
      const result = await this.evidenceService.getEvidence(request);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('必须提供')) {
        return errorResponse(ErrorCode.BAD_REQUEST, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取世界模型证据（GET方式）
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: '获取世界模型证据（GET方式）',
    description: '通过查询参数获取世界模型证据，功能与POST方式相同',
  })
  @ApiQuery({
    name: 'tripId',
    required: false,
    description: '行程ID（UUID）',
    example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
  })
  @ApiQuery({
    name: 'countryCode',
    required: false,
    description: '国家代码（ISO 3166-1 alpha-2），如果未提供tripId则必需',
    example: 'IS',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    description: '月份（1-12），用于天气窗口评估',
    example: 7,
    type: Number,
  })
  @ApiQuery({
    name: 'routeDirectionId',
    required: false,
    description: '路线方向ID（UUID）',
    example: '8afd4b2e-7dd1-4837-8169-d3efed748138',
  })
  @ApiQuery({
    name: 'include',
    required: false,
    description: '包含的证据类型',
    enum: ['dem', 'road', 'weather', 'philosophy', 'failure', 'all'],
    example: 'all',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回世界模型证据',
    type: WorldModelEvidenceResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误（缺少tripId或countryCode）',
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
  })
  async getEvidenceByQuery(
    @Query('tripId') tripId?: string,
    @Query('countryCode') countryCode?: string,
    @Query('month') month?: number,
    @Query('routeDirectionId') routeDirectionId?: string,
    @Query('include') include?: 'dem' | 'road' | 'weather' | 'philosophy' | 'failure' | 'all',
  ) {
    try {
      const request: WorldModelEvidenceRequestDto = {
        tripId,
        countryCode,
        month: month ? Number(month) : undefined,
        routeDirectionId,
        include: include || 'all',
      };
      const result = await this.evidenceService.getEvidence(request);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('必须提供')) {
        return errorResponse(ErrorCode.BAD_REQUEST, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 根据行程ID获取世界模型证据
   */
  @Public()
  @Get('trip/:tripId')
  @ApiOperation({
    summary: '根据行程ID获取世界模型证据',
    description: '快速获取指定行程的世界模型证据',
  })
  @ApiParam({
    name: 'tripId',
    description: '行程ID（UUID）',
    example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
  })
  @ApiQuery({
    name: 'include',
    required: false,
    description: '包含的证据类型',
    enum: ['dem', 'road', 'weather', 'philosophy', 'failure', 'all'],
    example: 'all',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回世界模型证据',
    type: WorldModelEvidenceResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
  })
  async getEvidenceByTripId(
    @Param('tripId') tripId: string,
    @Query('include') include?: 'dem' | 'road' | 'weather' | 'philosophy' | 'failure' | 'all',
  ) {
    try {
      const request: WorldModelEvidenceRequestDto = {
        tripId,
        include: include || 'all',
      };
      const result = await this.evidenceService.getEvidence(request);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('必须提供')) {
        return errorResponse(ErrorCode.BAD_REQUEST, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
