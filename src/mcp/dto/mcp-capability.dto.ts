// src/mcp/dto/mcp-capability.dto.ts

/**
 * MCP 能力管理 DTO 定义
 * 
 * 用于 MCP 能力管理 API 的请求和响应数据结构
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

/**
 * MCP 能力状态枚举
 */
export enum McpCapabilityStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
}

/**
 * MCP 服务能力信息
 */
export class McpCapabilityDto {
  @ApiProperty({ description: '服务名称', example: 'google_maps' })
  @IsString()
  serviceName: string;

  @ApiProperty({ description: '服务显示名称', example: 'Google Maps' })
  @IsString()
  displayName: string;

  @ApiProperty({ description: '服务描述', example: 'Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能' })
  @IsString()
  description: string; // 服务功能描述，用于列表显示

  @ApiProperty({ description: '是否启用', example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: '工具列表', example: ['google_maps.searchPlaces', 'google_maps.getRoute'] })
  @IsArray()
  @IsString({ each: true })
  tools: string[];

  @ApiPropertyOptional({ description: '服务分类', example: 'mapping' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '是否需要认证', example: false })
  @IsOptional()
  @IsBoolean()
  authRequired?: boolean;
}

/**
 * 更新能力状态请求
 */
export class UpdateCapabilityStatusDto {
  @ApiProperty({ description: '服务名称', example: 'google_maps' })
  @IsString()
  serviceName: string;

  @ApiProperty({ description: '启用状态', enum: McpCapabilityStatus, example: McpCapabilityStatus.ENABLED })
  @IsEnum(McpCapabilityStatus)
  status: McpCapabilityStatus;
}

/**
 * 批量更新能力状态请求
 */
export class BatchUpdateCapabilityStatusDto {
  @ApiProperty({ description: '更新列表', type: [UpdateCapabilityStatusDto] })
  @IsArray()
  updates: UpdateCapabilityStatusDto[];
}

/**
 * 查询能力列表请求
 */
export class QueryCapabilitiesDto {
  @ApiPropertyOptional({ description: '按服务名称过滤', example: 'google_maps' })
  @IsOptional()
  @IsString()
  serviceName?: string;

  @ApiPropertyOptional({ description: '按启用状态过滤', enum: McpCapabilityStatus })
  @IsOptional()
  @IsEnum(McpCapabilityStatus)
  status?: McpCapabilityStatus;

  @ApiPropertyOptional({ description: '按分类过滤', example: 'mapping' })
  @IsOptional()
  @IsString()
  category?: string;
}
