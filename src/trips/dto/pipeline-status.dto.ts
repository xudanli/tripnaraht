// src/trips/dto/pipeline-status.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Pipeline 阶段状态
 */
export enum PipelineStageStatus {
  COMPLETED = 'completed',
  IN_PROGRESS = 'in-progress',
  PENDING = 'pending',
  RISK = 'risk',
}

/**
 * Pipeline 阶段 DTO
 */
export class PipelineStageDto {
  @ApiProperty({ description: '阶段ID', example: '1' })
  id!: string;

  @ApiProperty({ description: '阶段名称', example: '明确旅行目标' })
  name!: string;

  @ApiProperty({ description: '状态', enum: PipelineStageStatus, example: PipelineStageStatus.COMPLETED })
  status!: PipelineStageStatus;

  @ApiPropertyOptional({ description: '完成时间', example: '2024-12-25T10:00:00Z' })
  completedAt?: string;

  @ApiPropertyOptional({ description: '摘要信息', example: '建议驾驶时长：每天 3–5 小时\n疲劳指数：中\n🚨 第 5 天稍紧张' })
  summary?: string;
}

/**
 * Pipeline 状态响应 DTO
 */
export class PipelineStatusResponseDto {
  @ApiProperty({ description: '阶段列表', type: [PipelineStageDto] })
  stages!: PipelineStageDto[];
}

