// src/agent/assistants/planning-assistant/dto/v2/compare-plans-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 方案对比DTO
 */
export class PlanComparisonDto {
  @ApiProperty({ description: '方案ID' })
  id!: string;

  @ApiProperty({ description: '方案名称' })
  name!: string;

  @ApiProperty({ description: '方案名称（中文）' })
  nameCN!: string;

  @ApiProperty({ description: '各维度分数' })
  scores!: Record<string, number>;
}

/**
 * 对比差异DTO
 */
export class ComparisonDifferenceDto {
  @ApiProperty({ description: '对比字段' })
  field!: string;

  @ApiProperty({ description: '方案1的值' })
  plan1Value!: any;

  @ApiProperty({ description: '方案2的值' })
  plan2Value!: any;

  @ApiProperty({ description: '影响程度', enum: ['low', 'medium', 'high'] })
  impact!: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({ description: '描述' })
  description?: string;

  @ApiPropertyOptional({ description: '描述（中文）' })
  descriptionCN?: string;
}

/**
 * 对比推荐DTO
 */
export class ComparisonRecommendationDto {
  @ApiPropertyOptional({ description: '最佳预算方案ID' })
  bestBudget?: string;

  @ApiPropertyOptional({ description: '最佳路线方案ID' })
  bestRoute?: string;

  @ApiPropertyOptional({ description: '最佳时间方案ID' })
  bestTime?: string;

  @ApiPropertyOptional({ description: '总结' })
  summary?: string;

  @ApiPropertyOptional({ description: '总结（中文）' })
  summaryCN?: string;
}

/**
 * 对比方案响应DTO
 */
export class ComparePlansResponseDto {
  @ApiProperty({ description: '方案列表', type: [PlanComparisonDto] })
  plans!: PlanComparisonDto[];

  @ApiProperty({ description: '对比维度', type: [String] })
  dimensions!: string[];

  @ApiProperty({ description: '差异列表', type: [ComparisonDifferenceDto] })
  differences!: ComparisonDifferenceDto[];

  @ApiProperty({ description: '推荐' })
  recommendation!: ComparisonRecommendationDto;
}
