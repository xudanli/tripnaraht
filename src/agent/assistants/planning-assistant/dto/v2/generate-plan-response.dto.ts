// src/agent/assistants/planning-assistant/dto/v2/generate-plan-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCandidateDto } from './shared/plan-candidate.dto';

/**
 * 生成方案响应DTO
 */
export class GeneratePlanResponseDto {
  @ApiProperty({ description: '方案列表', type: [PlanCandidateDto] })
  plans!: PlanCandidateDto[];

  @ApiPropertyOptional({ description: '会话ID' })
  sessionId?: string;

  @ApiProperty({ description: '生成时间' })
  generatedAt!: string;

  @ApiPropertyOptional({ description: '追踪ID' })
  traceId?: string;
}
