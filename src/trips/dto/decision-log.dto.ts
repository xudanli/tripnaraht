// src/trips/dto/decision-log.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 决策来源类型
 */
export enum DecisionSource {
  PHYSICAL = 'PHYSICAL',
  HUMAN = 'HUMAN',
  PHILOSOPHY = 'PHILOSOPHY',
  SPATIAL = 'SPATIAL',
}

/**
 * Persona 类型
 */
export enum PersonaType {
  ABU = 'ABU',
  DR_DRE = 'DR_DRE',
  NEPTUNE = 'NEPTUNE',
}

/**
 * 决策记录条目 DTO
 */
export class DecisionLogEntryDto {
  @ApiProperty({ description: '记录ID', example: 'log-1' })
  id!: string;

  @ApiProperty({ description: '日期时间', example: '2024-12-30T10:00:00Z' })
  date!: string;

  @ApiProperty({ description: '描述', example: '依据道路通行记录进行了风险提示' })
  description!: string;

  @ApiProperty({ description: '决策来源', enum: DecisionSource, example: DecisionSource.PHYSICAL })
  source!: DecisionSource;

  @ApiPropertyOptional({ description: 'Persona', enum: PersonaType, example: PersonaType.ABU })
  persona?: PersonaType;

  @ApiProperty({ description: '动作类型', example: 'RISK_WARNING' })
  action!: string;

  @ApiPropertyOptional({ description: '元数据', type: Object, additionalProperties: true })
  metadata?: Record<string, any>;
}

/**
 * 决策记录响应 DTO
 */
export class DecisionLogResponseDto {
  @ApiProperty({ description: '记录列表', type: [DecisionLogEntryDto] })
  items!: DecisionLogEntryDto[];

  @ApiProperty({ description: '总记录数', example: 15 })
  total!: number;

  @ApiProperty({ description: '返回数量限制', example: 10 })
  limit!: number;

  @ApiProperty({ description: '偏移量', example: 0 })
  offset!: number;
}

