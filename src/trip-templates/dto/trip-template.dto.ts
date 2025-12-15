// src/trip-templates/dto/trip-template.dto.ts
import { IsString, IsOptional, IsObject, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 行程模板主题枚举
 */
export enum TripTemplateTheme {
  FAMILY = 'FAMILY', // 亲子游
  BACKPACKER = 'BACKPACKER', // 特种兵旅游
  LEISURE = 'LEISURE', // 休闲度假
  BUSINESS = 'BUSINESS', // 商务出行
  HONEYMOON = 'HONEYMOON', // 蜜月游
  ADVENTURE = 'ADVENTURE', // 探险游
}

/**
 * 获取行程模板列表查询参数
 */
export class GetTripTemplatesQueryDto {
  @ApiPropertyOptional({
    description: '模板主题',
    enum: TripTemplateTheme,
  })
  @IsEnum(TripTemplateTheme)
  @IsOptional()
  theme?: TripTemplateTheme;

  @ApiPropertyOptional({
    description: '目的地国家代码',
    example: 'JP',
  })
  @IsString()
  @IsOptional()
  destination?: string;

  @ApiPropertyOptional({
    description: '是否只返回公开模板',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

/**
 * 行程模板响应 DTO
 */
export class TripTemplateResponseDto {
  @ApiProperty({ description: '模板ID', example: 'uuid' })
  id!: string;

  @ApiProperty({ description: '模板名称', example: '日本亲子游' })
  name!: string;

  @ApiPropertyOptional({ description: '中文名称', example: '日本亲子游' })
  nameCN?: string;

  @ApiPropertyOptional({ description: '模板描述', example: '适合带小孩的日本旅行' })
  description?: string;

  @ApiProperty({ description: '主题', enum: TripTemplateTheme, example: TripTemplateTheme.FAMILY })
  theme!: string;

  @ApiPropertyOptional({ description: '推荐目的地', example: 'JP' })
  destination?: string;

  @ApiProperty({ description: '模板配置（budgetConfig, pacingConfig 等）', type: Object })
  config!: Record<string, any>;

  @ApiProperty({ description: '是否公开', example: true })
  isPublic!: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

/**
 * 基于模板创建行程请求 DTO
 */
export class CreateTripFromTemplateDto {
  @ApiProperty({ description: '模板ID', example: 'uuid' })
  @IsString()
  templateId!: string;

  @ApiProperty({ description: '目的地国家代码', example: 'JP' })
  @IsString()
  destination!: string;

  @ApiProperty({ description: '开始日期（ISO 格式）', example: '2024-05-01T00:00:00.000Z' })
  @IsString()
  startDate!: string;

  @ApiProperty({ description: '结束日期（ISO 格式）', example: '2024-05-05T00:00:00.000Z' })
  @IsString()
  endDate!: string;

  @ApiPropertyOptional({
    description: '总预算（元）',
    example: 20000,
  })
  @IsOptional()
  totalBudget?: number;

  @ApiPropertyOptional({
    description: '覆盖模板配置（可选）',
    type: Object,
  })
  @IsObject()
  @IsOptional()
  overrideConfig?: Record<string, any>;
}
