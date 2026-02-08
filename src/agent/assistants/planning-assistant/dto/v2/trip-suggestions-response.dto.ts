// src/agent/assistants/planning-assistant/dto/v2/trip-suggestions-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

/**
 * 行程建议DTO
 */
export class TripSuggestionDto {
  @ApiProperty({ description: '建议类型' })
  type!: string;

  @ApiProperty({ description: '标题（英文）' })
  title!: string;

  @ApiProperty({ description: '标题（中文）' })
  titleCN!: string;

  @ApiProperty({ description: '描述（英文）' })
  description!: string;

  @ApiProperty({ description: '描述（中文）' })
  descriptionCN!: string;

  @ApiProperty({ description: '优先级', enum: ['low', 'medium', 'high'] })
  priority!: 'low' | 'medium' | 'high';

  @ApiProperty({ description: '操作建议' })
  action!: {
    type: string;
    label: string;
    labelCN: string;
    params: Record<string, any>;
  };
}

/**
 * 行程建议响应DTO
 */
export class TripSuggestionsResponseDto {
  @ApiProperty({ description: '建议列表', type: [TripSuggestionDto] })
  suggestions!: TripSuggestionDto[];

  @ApiProperty({ description: '生成时间' })
  generatedAt!: string;
}
