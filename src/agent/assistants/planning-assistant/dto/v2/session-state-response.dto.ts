// src/agent/assistants/planning-assistant/dto/v2/session-state-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DestinationRecommendationDto } from './shared/destination-recommendation.dto';
import { PlanCandidateDto } from './shared/plan-candidate.dto';

/**
 * 会话状态响应
 */
export class SessionStateResponseDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  userId?: string;

  @ApiProperty({ 
    description: '当前阶段',
    enum: ['INITIAL', 'COLLECTING_PREFERENCES', 'RECOMMENDING', 'COMPARING_PLANS', 'CONFIRMING', 'COMPLETED', 'CLARIFYING_HOTEL_DATES', 'CLARIFYING_RAIL_DATES', 'CLARIFYING_FLIGHT_ORIGIN']
  })
  phase!: string;

  @ApiProperty({ description: '用户偏好' })
  preferences!: Record<string, any>;

  @ApiPropertyOptional({ description: '目的地推荐', type: [DestinationRecommendationDto] })
  recommendations?: DestinationRecommendationDto[];

  @ApiPropertyOptional({ description: '选中的目的地' })
  selectedDestination?: string;

  @ApiPropertyOptional({ description: '方案候选', type: [PlanCandidateDto] })
  planCandidates?: PlanCandidateDto[];

  @ApiPropertyOptional({ description: '选中的方案ID' })
  selectedPlanId?: string;

  @ApiPropertyOptional({ description: '确认的行程ID' })
  confirmedTripId?: string;

  @ApiProperty({ description: '消息历史数量' })
  messageCount!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;

  @ApiProperty({ description: '过期时间' })
  expiresAt!: string;
}
