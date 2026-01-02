// src/trips/dto/trip-conflicts.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 冲突类型
 */
export enum ConflictType {
  TIME_CONFLICT = 'TIME_CONFLICT',
  LUNCH_WINDOW = 'LUNCH_WINDOW',
  FATIGUE_EXCEEDED = 'FATIGUE_EXCEEDED',
  BUFFER_INSUFFICIENT = 'BUFFER_INSUFFICIENT',
  CLOSURE_RISK = 'CLOSURE_RISK',
  ACCESSIBILITY_MISMATCH = 'ACCESSIBILITY_MISMATCH',
  TRANSPORT_TOO_LONG = 'TRANSPORT_TOO_LONG',
}

/**
 * 冲突严重程度
 */
export enum ConflictSeverity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * 冲突建议
 */
export class ConflictSuggestionDto {
  @ApiProperty({ description: '建议操作' })
  action: string;

  @ApiProperty({ description: '建议描述' })
  description: string;

  @ApiProperty({ description: '影响说明' })
  impact: string;
}

/**
 * 冲突项 DTO
 */
export class ConflictDto {
  @ApiProperty({ description: '冲突 ID' })
  id: string;

  @ApiProperty({ description: '冲突类型', enum: ConflictType })
  type: ConflictType;

  @ApiProperty({ description: '严重程度', enum: ConflictSeverity })
  severity: ConflictSeverity;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiProperty({ description: '受影响的日期数组' })
  affectedDays: string[];

  @ApiProperty({ description: '受影响的行程项 ID 数组' })
  affectedItemIds: string[];

  @ApiPropertyOptional({ description: '建议列表', type: [ConflictSuggestionDto] })
  suggestions?: ConflictSuggestionDto[];
}

/**
 * 冲突列表响应 DTO
 */
export class ConflictsResponseDto {
  @ApiProperty({ description: '行程 ID' })
  tripId: string;

  @ApiProperty({ description: '冲突列表', type: [ConflictDto] })
  conflicts: ConflictDto[];

  @ApiProperty({ description: '冲突总数' })
  total: number;
}

