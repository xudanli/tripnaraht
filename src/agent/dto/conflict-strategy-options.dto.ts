import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConflictStrategyOptionsRequestDto {
  @ApiProperty({ description: '与 MultiAgent / PlanningWorkbench 对齐的 trip 标识', example: 'trip-uuid-123' })
  @IsString()
  trip_id!: string;

  @ApiPropertyOptional({
    description: '可选：覆盖 locale（默认 zh）',
    example: 'zh-CN',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class StrategyOptionCardDto {
  @ApiProperty({ example: 'opt_shorten' })
  id!: string;

  @ApiProperty({ example: '保留玻璃屋，压缩行程天数' })
  title_zh!: string;

  @ApiProperty({
    example: '削减 1–2 个非核心停留日，总支出更接近预算软顶',
  })
  summary_zh!: string;

  @ApiProperty({
    description: '粗略杠杆标签',
    example: ['缩短天数', '维持高光住宿'],
  })
  levers!: string[];
}

export class ConflictStrategyOptionsResponseDto {
  @ApiProperty({
    description: '冲突机制说明（面向 UI「决策对话」首屏）',
  })
  explanation_zh!: string;

  @ApiProperty({ type: [StrategyOptionCardDto] })
  @ValidateNested({ each: true })
  @Type(() => StrategyOptionCardDto)
  options!: StrategyOptionCardDto[];

  @ApiPropertyOptional({
    description: '来自 MAC 的共识摘要（若 trip 上已有协作状态）',
  })
  consensus_summary?: string | null;

  @ApiPropertyOptional({
    description: '未解决冲突条数',
    example: 1,
  })
  open_conflict_count?: number;
}
