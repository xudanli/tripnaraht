// src/mcp/mcp-capability.controller.ts

/**
 * MCP 能力管理控制器
 * 
 * 提供 REST API 接口用于管理 MCP 能力的启用/禁用状态
 * 所有接口均为公开访问（@Public()），方便管理员操作
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { McpCapabilityManagerService } from './services/mcp-capability-manager.service';
import {
  McpCapabilityDto,
  UpdateCapabilityStatusDto,
  BatchUpdateCapabilityStatusDto,
  QueryCapabilitiesDto,
  McpCapabilityStatus,
} from './dto/mcp-capability.dto';
import { StandardResponse, successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('mcp-capability')
@Controller('mcp/capabilities')
@Public() // 公开访问，用于管理 MCP 能力
export class McpCapabilityController {
  constructor(
    private readonly capabilityManager: McpCapabilityManagerService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '获取所有 MCP 能力列表',
    description: '获取所有 MCP 服务的列表，支持按服务名称、状态、分类过滤',
  })
  @ApiQuery({ name: 'serviceName', required: false, description: '服务名称' })
  @ApiQuery({ name: 'status', required: false, enum: McpCapabilityStatus, description: '启用状态' })
  @ApiQuery({ name: 'category', required: false, description: '服务分类' })
  @ApiResponse({
    status: 200,
    description: '返回能力列表',
    type: [McpCapabilityDto],
  })
  async getAllCapabilities(
    @Query() query: QueryCapabilitiesDto,
  ): Promise<StandardResponse<McpCapabilityDto[]>> {
    const filters: any = {};
    if (query.serviceName) filters.serviceName = query.serviceName;
    if (query.status) filters.status = query.status;
    if (query.category) filters.category = query.category;

    const capabilities = await this.capabilityManager.getAllCapabilities(filters);
    return successResponse(capabilities);
  }

  @Get('statistics')
  @ApiOperation({
    summary: '获取能力统计信息',
    description: '获取 MCP 能力的统计信息，包括总数、启用数、禁用数、按分类统计等',
  })
  @ApiResponse({
    status: 200,
    description: '返回统计信息',
  })
  async getStatistics(): Promise<StandardResponse<any>> {
    const stats = await this.capabilityManager.getStatistics();
    return successResponse(stats);
  }

  @Get(':serviceName')
  @ApiOperation({
    summary: '获取单个能力信息',
    description: '根据服务名称获取单个 MCP 能力的详细信息',
  })
  @ApiParam({ name: 'serviceName', description: '服务名称', example: 'google_maps' })
  @ApiResponse({
    status: 200,
    description: '返回能力信息',
    type: McpCapabilityDto,
  })
  @ApiResponse({
    status: 404,
    description: '能力不存在',
  })
  async getCapability(
    @Param('serviceName') serviceName: string,
  ): Promise<StandardResponse<McpCapabilityDto>> {
    const capability = await this.capabilityManager.getCapability(serviceName);
    if (!capability) {
      throw new NotFoundException(`Capability not found: ${serviceName}`);
    }
    return successResponse(capability);
  }

  @Put(':serviceName/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '更新能力状态',
    description: '启用或禁用指定的 MCP 能力',
  })
  @ApiParam({ name: 'serviceName', description: '服务名称', example: 'google_maps' })
  @ApiResponse({
    status: 200,
    description: '更新成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '能力不存在',
  })
  async updateCapabilityStatus(
    @Param('serviceName') serviceName: string,
    @Body() body: UpdateCapabilityStatusDto,
  ): Promise<StandardResponse<{ serviceName: string; enabled: boolean }>> {
    if (body.serviceName !== serviceName) {
      throw new BadRequestException('Service name mismatch');
    }

    const enabled = body.status === McpCapabilityStatus.ENABLED;
    const success = await this.capabilityManager.updateCapabilityStatus(serviceName, enabled);

    if (!success) {
      throw new NotFoundException(`Capability not found: ${serviceName}`);
    }

    return successResponse({
      serviceName,
      enabled,
    });
  }

  @Post('batch-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '批量更新能力状态',
    description: '批量启用或禁用多个 MCP 能力',
  })
  @ApiResponse({
    status: 200,
    description: '批量更新结果',
  })
  async batchUpdateCapabilityStatus(
    @Body() body: BatchUpdateCapabilityStatusDto,
  ): Promise<StandardResponse<{
    success: number;
    failed: number;
    results: Array<{ serviceName: string; success: boolean; error?: string }>;
  }>> {
    const updates = body.updates.map(update => ({
      serviceName: update.serviceName,
      enabled: update.status === McpCapabilityStatus.ENABLED,
    }));

    const result = await this.capabilityManager.batchUpdateCapabilityStatus(updates);
    return successResponse(result);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '重置所有能力为默认状态',
    description: '将所有 MCP 能力重置为默认的启用/禁用状态',
  })
  @ApiResponse({
    status: 200,
    description: '重置成功',
  })
  async resetToDefaults(): Promise<StandardResponse<{ message: string }>> {
    await this.capabilityManager.resetToDefaults();
    return successResponse({ message: 'All capabilities reset to default state' });
  }

  @Get(':serviceName/enabled')
  @ApiOperation({
    summary: '检查能力是否启用',
    description: '检查指定的 MCP 能力是否已启用',
  })
  @ApiParam({ name: 'serviceName', description: '服务名称', example: 'google_maps' })
  @ApiResponse({
    status: 200,
    description: '返回启用状态',
  })
  async checkCapabilityEnabled(
    @Param('serviceName') serviceName: string,
  ): Promise<StandardResponse<{ serviceName: string; enabled: boolean }>> {
    // 使用异步方法获取最新状态
    const enabled = await this.capabilityManager.isCapabilityEnabledAsync(serviceName);
    return successResponse({
      serviceName,
      enabled,
    });
  }
}
