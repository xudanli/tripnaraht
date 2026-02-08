// src/agent/assistants/planning-assistant/dto/v2/recommendations-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DestinationRecommendationDto } from './shared/destination-recommendation.dto';

/**
 * 推荐响应DTO
 */
export class RecommendationsResponseDto {
  @ApiProperty({ description: '推荐列表', type: [DestinationRecommendationDto] })
  recommendations!: DestinationRecommendationDto[];

  @ApiPropertyOptional({ description: '会话ID' })
  sessionId?: string;

  @ApiPropertyOptional({ description: '使用的偏好' })
  preferencesUsed?: Record<string, any>;

  @ApiProperty({ description: '生成时间' })
  generatedAt!: string;
}
