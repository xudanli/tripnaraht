// src/kpu/dto/retrieval-and-validate.dto.ts
/**
 * 检索并验证 DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidationOptionsDto {
  @ApiPropertyOptional({ description: '启用事实检查', default: true })
  @IsOptional()
  @IsBoolean()
  enableFactCheck?: boolean;

  @ApiPropertyOptional({ description: '启用一致性检查', default: true })
  @IsOptional()
  @IsBoolean()
  enableConsistencyCheck?: boolean;

  @ApiPropertyOptional({ description: '启用引用检查', default: true })
  @IsOptional()
  @IsBoolean()
  enableCitationCheck?: boolean;
}

export class RetrievalAndValidateRequestDto {
  @ApiProperty({ description: '查询文本', example: '冰岛F26公路冬天能走吗？' })
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: '返回数量限制', default: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: '最小可信度', default: 0.5 })
  @IsOptional()
  @IsNumber()
  credibilityMin?: number;

  @ApiPropertyOptional({ description: '文档类型' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '文件分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Chunk分类' })
  @IsOptional()
  @IsString()
  chunkCategory?: string;

  @ApiPropertyOptional({ description: '文件ID' })
  @IsOptional()
  @IsString()
  fileId?: string;

  @ApiPropertyOptional({ description: '使用混合检索', default: true })
  @IsOptional()
  @IsBoolean()
  useHybridSearch?: boolean;

  @ApiPropertyOptional({ description: 'Dense检索权重', default: 0.6 })
  @IsOptional()
  @IsNumber()
  denseWeight?: number;

  @ApiPropertyOptional({ description: 'Sparse检索权重', default: 0.4 })
  @IsOptional()
  @IsNumber()
  sparseWeight?: number;

  @ApiPropertyOptional({ description: '使用重排序', default: false })
  @IsOptional()
  @IsBoolean()
  useReranking?: boolean;

  @ApiPropertyOptional({ description: '重排序Top-K数量', default: 20 })
  @IsOptional()
  @IsNumber()
  rerankTopK?: number;

  @ApiPropertyOptional({ description: '使用查询扩展', default: false })
  @IsOptional()
  @IsBoolean()
  useQueryExpansion?: boolean;

  @ApiPropertyOptional({ description: '最大查询变体数量', default: 3 })
  @IsOptional()
  @IsNumber()
  maxQueryVariants?: number;

  @ApiPropertyOptional({ description: '使用意图分类', default: false })
  @IsOptional()
  @IsBoolean()
  useIntentClassification?: boolean;

  // KPU扩展参数
  @ApiPropertyOptional({ description: '最低验证得分阈值', default: 0.5 })
  @IsOptional()
  @IsNumber()
  minValidationScore?: number;

  @ApiPropertyOptional({ description: '启用片段验证', default: true })
  @IsOptional()
  @IsBoolean()
  enableSnippetValidation?: boolean;

  @ApiPropertyOptional({ description: '验证选项', type: ValidationOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ValidationOptionsDto)
  validationOptions?: ValidationOptionsDto;

  @ApiPropertyOptional({ description: '上下文信息' })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class ValidationMetadataDto {
  @ApiProperty({ description: '总候选数' })
  totalCandidates: number;

  @ApiProperty({ description: '验证数量' })
  validatedCount: number;

  @ApiProperty({ description: '过滤后数量' })
  filteredCount: number;

  @ApiProperty({ description: '平均验证得分' })
  avgValidationScore: number;

  @ApiProperty({ description: '延迟（毫秒）' })
  latency: number;
}

export class ValidationResultDto {
  @ApiProperty({ description: '事实检查状态', enum: ['pass', 'fail', 'unknown'] })
  factCheck: 'pass' | 'fail' | 'unknown';

  @ApiProperty({ description: '来源可信度', example: 0.85 })
  sourceCredibility: number;

  @ApiProperty({ description: '新鲜度', example: 0.9 })
  freshness: number;

  @ApiProperty({ description: '完整性', example: 0.8 })
  completeness: number;

  @ApiProperty({ description: '一致性状态', enum: ['consistent', 'inconsistent', 'unknown'] })
  consistency: 'consistent' | 'inconsistent' | 'unknown';

  @ApiProperty({ description: '综合得分', example: 0.85 })
  overallScore: number;
}

export class CitationDto {
  @ApiProperty({ description: '引用ID' })
  id: string;

  @ApiProperty({ description: '引用内容' })
  content: string;

  @ApiProperty({ description: '来源' })
  source: string;

  @ApiPropertyOptional({ description: '文档ID' })
  documentId?: string;

  @ApiProperty({ description: '置信度', example: 0.9 })
  confidence: number;

  @ApiPropertyOptional({ description: '位置信息' })
  position?: {
    field: string;
    paragraph?: number;
    line?: number;
  };
}

export class ValidatedRetrievalResultDto {
  @ApiProperty({ description: '结果ID' })
  id: string;

  @ApiProperty({ description: 'Chunk ID' })
  chunkId: string;

  @ApiProperty({ description: '内容' })
  content: string;

  @ApiProperty({ description: '类型' })
  type: string;

  @ApiProperty({ description: '可信度得分', example: 0.85 })
  credibilityScore: number;

  @ApiProperty({ description: '相似度', example: 0.9 })
  similarity: number;

  @ApiPropertyOptional({ description: '混合得分' })
  hybridScore?: number;

  @ApiProperty({ description: '验证结果', type: ValidationResultDto })
  validation: ValidationResultDto;

  @ApiProperty({ description: '引用列表', type: [CitationDto] })
  citations: CitationDto[];
}

export class RetrievalAndValidateResponseDto {
  @ApiProperty({ description: '验证后的检索结果', type: [ValidatedRetrievalResultDto] })
  results: ValidatedRetrievalResultDto[];

  @ApiProperty({ description: '元数据', type: ValidationMetadataDto })
  metadata: ValidationMetadataDto;
}
