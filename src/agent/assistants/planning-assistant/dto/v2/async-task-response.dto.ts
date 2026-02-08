// src/agent/assistants/planning-assistant/dto/v2/async-task-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCandidateDto } from './shared/plan-candidate.dto';

/**
 * 异步任务响应DTO
 */
export class AsyncTaskResponseDto {
  @ApiProperty({ description: '任务ID' })
  taskId!: string;

  @ApiProperty({ 
    description: '任务状态',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
  })
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @ApiPropertyOptional({ description: '进度百分比', minimum: 0, maximum: 100 })
  progress?: number;

  @ApiPropertyOptional({ description: '当前阶段' })
  currentStage?: string;

  @ApiPropertyOptional({ description: '预计剩余时间（秒）' })
  estimatedTimeRemaining?: number;

  @ApiPropertyOptional({ description: '更新时间' })
  updatedAt?: string;

  @ApiPropertyOptional({ description: '结果（完成时）' })
  result?: {
    plans: PlanCandidateDto[];
  };

  @ApiPropertyOptional({ description: '错误信息（失败时）' })
  error?: {
    code: string;
    message: string;
    messageCN?: string;
    details?: any;
  };

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiPropertyOptional({ description: '完成时间' })
  completedAt?: string;

  @ApiPropertyOptional({ description: '预估耗时（秒）' })
  estimatedDuration?: number;
}
