// src/decision-draft/dto/decision-draft.dto.ts

import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { DecisionDraftGenerationConfig } from '../interfaces/decision-draft.interface';
import { DecisionStepEditOperation } from '../services/decision-draft-editor.service';
import { PartialRegenerationConfig } from '../services/decision-draft-editor.service';

/**
 * 决策步骤修改内容 DTO
 */
class DecisionStepModificationsDto {
  @ApiPropertyOptional({ description: '标题' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '输出列表' })
  @IsArray()
  @IsOptional()
  outputs?: Array<{
    name: string;
    value: any;
    confidence?: number;
  }>;

  @ApiPropertyOptional({ description: '证据权重映射' })
  @IsObject()
  @IsOptional()
  evidence_weights?: Record<string, number>;
}

/**
 * 决策步骤编辑操作 DTO（用于验证）
 */
export class DecisionStepEditOperationDto {
  @ApiProperty({ description: '决策步骤 ID' })
  @IsString()
  decision_step_id!: string;

  @ApiProperty({ description: '操作类型', enum: ['approve', 'reject', 'modify'] })
  @IsEnum(['approve', 'reject', 'modify'])
  action!: 'approve' | 'reject' | 'modify';

  @ApiPropertyOptional({ description: '修改内容' })
  @ValidateNested()
  @Type(() => DecisionStepModificationsDto)
  @IsOptional()
  modifications?: DecisionStepModificationsDto;

  @ApiPropertyOptional({ description: '操作理由' })
  @IsString()
  @IsOptional()
  reasoning?: string;
}

/**
 * 生成决策草案 DTO
 */
export class GenerateDecisionDraftDto {
  @ApiProperty({ description: '用户输入（自然语言）' })
  @IsString()
  user_input!: string;

  @ApiProperty({ description: '旅行规划请求' })
  @IsObject()
  @ValidateNested()
  trip_plan_request!: TripPlanRequest;

  @ApiPropertyOptional({ description: '生成配置' })
  @IsObject()
  @IsOptional()
  config?: DecisionDraftGenerationConfig;
}

/**
 * 编辑决策步骤 DTO
 */
export class EditDecisionStepDto {
  @ApiProperty({ description: '编辑操作' })
  @ValidateNested()
  @Type(() => DecisionStepEditOperationDto)
  operation!: DecisionStepEditOperationDto;
}

/**
 * 批量编辑决策步骤 DTO
 */
export class BatchEditDecisionStepsDto {
  @ApiProperty({ description: '编辑操作列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionStepEditOperationDto)
  operations!: DecisionStepEditOperationDto[];
}

/**
 * 局部重算 DTO
 */
export class PartialRegenerateDto {
  @ApiPropertyOptional({ description: '局部重算配置' })
  @IsObject()
  @IsOptional()
  config?: PartialRegenerationConfig;
}

/**
 * 重新排序决策步骤 DTO
 */
export class ReorderDecisionStepsDto {
  @ApiProperty({ description: '新的决策步骤顺序（decision_step_id 数组）' })
  @IsArray()
  @IsString({ each: true })
  new_order!: string[];
}

/**
 * 保存版本 DTO
 */
export class SaveVersionDto {
  @ApiProperty({ description: '创建者' })
  @IsString()
  creator!: string;

  @ApiPropertyOptional({ description: '版本描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '标签' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

/**
 * Fork 版本 DTO
 */
export class ForkVersionDto {
  @ApiProperty({ description: '新的工作流 ID' })
  @IsString()
  new_workflow_id!: string;

  @ApiProperty({ description: '创建者' })
  @IsString()
  creator!: string;

  @ApiPropertyOptional({ description: '版本描述' })
  @IsString()
  @IsOptional()
  description?: string;
}

/**
 * 获取解释 DTO（查询参数）
 */
export class GetExplanationQueryDto {
  @ApiPropertyOptional({
    description: '解释模式',
    enum: ['toc', 'expert', 'studio'],
    default: 'toc',
  })
  @IsEnum(['toc', 'expert', 'studio'])
  @IsOptional()
  mode?: 'toc' | 'expert' | 'studio';
}
