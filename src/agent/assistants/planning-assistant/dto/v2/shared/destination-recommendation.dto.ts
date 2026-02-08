// src/agent/assistants/planning-assistant/dto/v2/shared/destination-recommendation.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 目的地推荐DTO（共享类型）
 */
export class DestinationRecommendationDto {
  @ApiProperty({ description: '目的地ID' })
  id!: string;

  @ApiProperty({ description: '国家代码' })
  countryCode!: string;

  @ApiProperty({ description: '名称（英文）' })
  name!: string;

  @ApiProperty({ description: '名称（中文）' })
  nameCN!: string;

  @ApiProperty({ description: '描述（英文）' })
  description!: string;

  @ApiProperty({ description: '描述（中文）' })
  descriptionCN!: string;

  @ApiProperty({ description: '亮点（英文）', type: [String] })
  highlights!: string[];

  @ApiProperty({ description: '亮点（中文）', type: [String] })
  highlightsCN!: string[];

  @ApiProperty({ description: '匹配分数 (0-100)' })
  matchScore!: number;

  @ApiProperty({ description: '匹配原因（英文）', type: [String] })
  matchReasons!: string[];

  @ApiProperty({ description: '匹配原因（中文）', type: [String] })
  matchReasonsCN!: string[];

  @ApiProperty({ description: '预估预算' })
  estimatedBudget!: {
    min: number;
    max: number;
    currency: string;
  };

  @ApiProperty({ description: '最佳季节', type: [String] })
  bestSeasons!: string[];

  @ApiPropertyOptional({ description: '图片URL' })
  imageUrl?: string;

  @ApiProperty({ description: '标签', type: [String] })
  tags!: string[];
}
