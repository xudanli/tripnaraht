// src/chain-of-work/dto/chain-of-work.dto.ts

import { IsObject, IsOptional, IsString, IsBoolean, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft, DraftGenerationConfig } from '../interfaces/chain-of-work.interface';

export class GenerateDraftDto {
  @ApiProperty({ description: '旅行规划请求' })
  @IsObject()
  @ValidateNested()
  trip_plan_request!: TripPlanRequest;

  @ApiPropertyOptional({ description: '生成配置' })
  @IsObject()
  @IsOptional()
  config?: DraftGenerationConfig;
}

export class SaveDraftDto {
  @ApiProperty({ description: '工作流草案' })
  @IsObject()
  @ValidateNested()
  draft!: TripNARAWorkflowDraft;

  @ApiPropertyOptional({ description: '是否自动保存', default: false })
  @IsBoolean()
  @IsOptional()
  is_auto_save?: boolean;
}

export class ExecuteDraftDto {
  @ApiPropertyOptional({ description: '执行选项' })
  @IsObject()
  @IsOptional()
  options?: {
    timeout_ms?: number;
    cost_budget_usd?: number;
  };
}

export class RollbackVersionDto {
  @ApiProperty({ description: '版本 ID' })
  @IsString()
  version_id!: string; // 注意：这里使用 version_id 作为 DTO 字段名，但实际 Version 接口使用 id

  @ApiPropertyOptional({ description: '确认回滚', default: false })
  @IsBoolean()
  @IsOptional()
  confirm?: boolean;
}