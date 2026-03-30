// src/system/system.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Get('status')
  @ApiOperation({
    summary: '获取系统能力/状态',
    description:
      '返回系统各功能模块的状态信息，用于前端提示"某能力暂不可用"。\n\n' +
      '**返回内容**：\n' +
      '- OCR Provider 状态（mock/google/unavailable）\n' +
      '- POI Provider 状态（mock/google/osm/unavailable）\n' +
      '- ASR Provider 状态（mock/openai/google/azure/unavailable）\n' +
      '- TTS Provider 状态（mock/openai/google/azure/unavailable）\n' +
      '- LLM Provider 状态（mock/openai/anthropic/google/unavailable）\n' +
      '- 限流信息\n' +
      '- 功能开关状态',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回系统状态',
    type: ApiSuccessResponseDto,
  })
  getStatus() {
    const status = this.systemService.getStatus();
    return successResponse(status);
  }

  // ==================== 后台管理接口 ====================

  @Public()
  @Get('admin/metrics')
  @ApiOperation({
    summary: '获取系统指标（管理接口）',
    description: '获取系统整体指标统计，包括系统资源、API性能、数据库、缓存等。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回系统指标（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminMetrics() {
    try {
      const metrics = await this.systemService.getAdminMetrics();
      return successResponse(metrics);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/performance')
  @ApiOperation({
    summary: '获取性能指标（管理接口）',
    description: '获取详细的性能指标，支持时间范围筛选。',
  })
  @ApiQuery({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' })
  @ApiQuery({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day'], description: '时间粒度' })
  @ApiResponse({
    status: 200,
    description: '成功返回性能指标（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminPerformance(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('granularity') granularity?: string,
  ) {
    try {
      const performance = await this.systemService.getAdminPerformance({
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        granularity: granularity as 'hour' | 'day' | undefined,
      });
      return successResponse(performance);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/errors')
  @ApiOperation({
    summary: '获取错误日志统计（管理接口）',
    description: '获取错误日志统计信息，包括错误分类、趋势分析等。',
  })
  @ApiQuery({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' })
  @ApiQuery({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' })
  @ApiQuery({ name: 'level', required: false, enum: ['error', 'warn'], description: '错误级别' })
  @ApiResponse({
    status: 200,
    description: '成功返回错误统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminErrors(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('level') level?: string,
  ) {
    try {
      const errors = await this.systemService.getAdminErrors({
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        level: level as 'error' | 'warn' | undefined,
      });
      return successResponse(errors);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/requests')
  @ApiOperation({
    summary: '获取请求统计（管理接口）',
    description: '获取API请求统计信息，包括请求量、端点统计、方法统计等。',
  })
  @ApiQuery({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' })
  @ApiQuery({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day'], description: '时间粒度' })
  @ApiResponse({
    status: 200,
    description: '成功返回请求统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminRequests(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('granularity') granularity?: string,
  ) {
    try {
      const requests = await this.systemService.getAdminRequests({
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        granularity: granularity as 'hour' | 'day' | undefined,
      });
      return successResponse(requests);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/database')
  @ApiOperation({
    summary: '获取数据库状态（管理接口）',
    description: '获取数据库连接池状态、查询统计、表信息等。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回数据库状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminDatabase() {
    try {
      const database = await this.systemService.getAdminDatabase();
      return successResponse(database);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/cache')
  @ApiOperation({
    summary: '获取缓存状态（管理接口）',
    description: '获取缓存系统状态，包括命中率、内存使用、操作统计等。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回缓存状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminCache() {
    try {
      const cache = await this.systemService.getAdminCache();
      return successResponse(cache);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
