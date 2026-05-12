// src/agent/dto/replay-from-trace.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import type { OrchestrationExecutionTraceV1 } from '../contracts/orchestration-execution-trace-v1.types';
import { AgentOptionsDto } from './route-and-run.dto';

/**
 * POST /agent/replay_from_trace — 稳定产品接口；内核须经由 `route_and_run` 重入。
 */
export class ReplayFromTraceRequestDto {
  @ApiProperty({
    description: '与 `execution_trace_v1.snapshot_id` 必须一致（P3 记忆快照 Redis 键）',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  trace_id!: string;

  @ApiProperty({
    description: '§16 `OrchestrationExecutionTraceV1`（来自上一轮 route_and_run observability.trace）',
  })
  @IsObject()
  execution_trace_v1!: OrchestrationExecutionTraceV1;

  @ApiPropertyOptional({ description: '可选；缺省生成 UUID' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  request_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ type: () => AgentOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentOptionsDto)
  options?: AgentOptionsDto;

  @ApiPropertyOptional({
    description:
      '可选：语义回归 — 注入 `route_and_run.options.change_impact_descriptor_v1` 并在响应后比对 `observability.trace` 是否一致（400 on mismatch）。',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  expected_change_impact_descriptor_v1?: Record<string, unknown>;
}
