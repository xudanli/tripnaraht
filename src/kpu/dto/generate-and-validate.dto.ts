// src/kpu/dto/generate-and-validate.dto.ts
/**
 * 生成并验证 DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidatedRetrievalResultDto } from './retrieval-and-validate.dto';

export class GenerateAndValidateRequestDto {
  @ApiProperty({ description: '查询文本', example: '冰岛F26公路冬天能走吗？' })
  @IsString()
  query!: string;

  @ApiProperty({ description: '验证后的检索结果', type: [ValidatedRetrievalResultDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidatedRetrievalResultDto)
  validatedResults!: ValidatedRetrievalResultDto[];

  @ApiPropertyOptional({ description: '上下文信息' })
  @IsOptional()
  context?: Record<string, any>;

  @ApiPropertyOptional({ description: '验证失败时是否重试', default: true })
  @IsOptional()
  @IsBoolean()
  retryOnFailure?: boolean;

  @ApiPropertyOptional({ description: '最大重试次数', default: 2 })
  @IsOptional()
  @IsNumber()
  maxRetries?: number;
}

export class FactCheckDto {
  @ApiProperty({ description: '检查ID' })
  id!: string;

  @ApiProperty({ description: '检查描述' })
  description!: string;

  @ApiProperty({ description: '是否通过' })
  passed!: boolean;

  @ApiProperty({ description: '详细信息' })
  details!: string;

  @ApiProperty({ description: '来源列表', type: [String] })
  sources!: string[];
}

export class ConsistencyCheckDto {
  @ApiProperty({ description: '检查ID' })
  id!: string;

  @ApiProperty({ description: '检查类型', enum: ['internal', 'external', 'contextual'] })
  type!: 'internal' | 'external' | 'contextual';

  @ApiProperty({ description: '是否通过' })
  passed!: boolean;

  @ApiProperty({ description: '详细信息' })
  details!: string;
}

export class OutputValidationResultDto {
  @ApiProperty({ description: '总体结果', enum: ['pass', 'fail', 'warning'] })
  overall!: 'pass' | 'fail' | 'warning';

  @ApiProperty({ description: '验证得分', example: 85 })
  score!: number;

  @ApiProperty({ description: '事实检查列表', type: [FactCheckDto] })
  factChecks!: FactCheckDto[];

  @ApiProperty({ description: '一致性检查列表', type: [ConsistencyCheckDto] })
  consistencyChecks!: ConsistencyCheckDto[];

  @ApiProperty({ description: '引用列表', type: [ValidatedRetrievalResultDto] })
  citations!: any[];

  @ApiProperty({ description: '警告列表', type: [String] })
  warnings!: string[];
}

export class GenerationMetadataDto {
  @ApiProperty({ description: '生成延迟（毫秒）' })
  generationLatency!: number;

  @ApiProperty({ description: '验证延迟（毫秒）' })
  validationLatency!: number;

  @ApiProperty({ description: '总延迟（毫秒）' })
  totalLatency!: number;
}

export class GenerateAndValidateResponseDto {
  @ApiProperty({ description: '生成的回答' })
  answer!: string;

  @ApiProperty({ description: '验证结果', type: OutputValidationResultDto })
  validation!: OutputValidationResultDto;

  @ApiProperty({ description: '验证后的知识源', type: [ValidatedRetrievalResultDto] })
  validatedSources!: ValidatedRetrievalResultDto[];

  @ApiProperty({ description: '是否重试' })
  retried!: boolean;

  @ApiProperty({ description: '元数据', type: GenerationMetadataDto })
  metadata!: GenerationMetadataDto;
}
