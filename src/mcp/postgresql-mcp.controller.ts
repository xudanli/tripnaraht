/**
 * PostgreSQL MCP Controller
 * 
 * 提供 PostgreSQL MCP 服务的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { PostgreSQLMcpService } from './postgresql-mcp.service';
import { PostgreSQLMcpMonitoringService } from './services/postgresql-mcp-monitoring.service';
import { QueryDto, ExecuteDto } from './dto/postgresql.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('postgresql-mcp')
@Controller('postgresql-mcp')
@Public() // 临时开放，生产环境可能需要认证
export class PostgreSQLMcpController {
  private readonly logger = new Logger(PostgreSQLMcpController.name);

  constructor(
    private readonly postgresqlMcpService: PostgreSQLMcpService,
    private readonly monitoringService: PostgreSQLMcpMonitoringService,
  ) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行 SQL 查询',
    description: '执行 SELECT 查询并返回结果',
  })
  @ApiBody({ type: QueryDto })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async query(@Body() dto: QueryDto) {
    try {
      if (!this.postgresqlMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration.',
        );
      }

      const result = await this.postgresqlMcpService.query(dto.query, dto.params);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('PostgreSQL query failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '执行查询失败',
      );
    }
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行 SQL 命令',
    description: '执行 INSERT, UPDATE, DELETE 等命令',
  })
  @ApiBody({ type: ExecuteDto })
  @ApiResponse({
    status: 200,
    description: '执行成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async execute(@Body() dto: ExecuteDto) {
    try {
      if (!this.postgresqlMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration.',
        );
      }

      const result = await this.postgresqlMcpService.execute(dto.query, dto.params);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('PostgreSQL execute failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '执行命令失败',
      );
    }
  }

  @Get('tools')
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 PostgreSQL MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      if (!this.postgresqlMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration.',
        );
      }

      const tools = await this.postgresqlMcpService.listTools();
      return successResponse({ tools });
    } catch (error: any) {
      this.logger.error('List tools failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Get('health')
  @ApiOperation({
    summary: '检查服务状态',
    description: '检查 PostgreSQL MCP 服务是否可用',
  })
  @ApiResponse({
    status: 200,
    description: '服务状态',
    type: ApiSuccessResponseDto,
  })
  async health() {
    return successResponse({
      available: this.postgresqlMcpService.isAvailable(),
      service: 'postgresql-mcp',
    });
  }

  @Get('monitoring/stats')
  @ApiOperation({
    summary: '获取性能统计',
    description: '获取 PostgreSQL MCP 查询的性能统计信息',
  })
  @ApiResponse({
    status: 200,
    description: '统计信息',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async getPerformanceStats(@Query('days') days?: string) {
    try {
      const daysNum = days ? parseInt(days, 10) : 1;
      if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'days 参数必须是 1-30 之间的整数',
        );
      }

      const stats = await this.monitoringService.getPerformanceStats(daysNum);
      return successResponse(stats);
    } catch (error: any) {
      this.logger.error('Get performance stats failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取性能统计失败',
      );
    }
  }

  @Get('monitoring/slow-queries')
  @ApiOperation({
    summary: '获取慢查询列表',
    description: '获取执行时间超过阈值的慢查询列表',
  })
  @ApiResponse({
    status: 200,
    description: '慢查询列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async getSlowQueries(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 20;
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'limit 参数必须是 1-100 之间的整数',
        );
      }

      const slowQueries = await this.monitoringService.getSlowQueries(limitNum);
      return successResponse({ slowQueries });
    } catch (error: any) {
      this.logger.error('Get slow queries failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取慢查询列表失败',
      );
    }
  }
}
