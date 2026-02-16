/**
 * 用户修改行为日志 DTO
 *
 * Phase 3：为反向学习、用户修改热力图提供数据
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type PlanModificationType =
  | 'day_removed'
  | 'day_added'
  | 'poi_replaced'
  | 'poi_removed'
  | 'poi_added'
  | 'order_changed'
  | 'time_adjusted'
  | 'budget_override'
  | 'other';

export class PlanModificationEventDto {
  @ApiProperty({ description: '计划 ID / 方案 ID' })
  planId!: string;

  @ApiPropertyOptional({ description: '行程 ID' })
  tripId?: string;

  @ApiProperty({
    description: '修改类型',
    enum: [
      'day_removed',
      'day_added',
      'poi_replaced',
      'poi_removed',
      'poi_added',
      'order_changed',
      'time_adjusted',
      'budget_override',
      'other',
    ],
  })
  modificationType!: PlanModificationType;

  @ApiPropertyOptional({ description: '受影响的日期' })
  affectedDate?: string;

  @ApiPropertyOptional({ description: '受影响的 slot/activity ID' })
  affectedSlotId?: string;

  @ApiPropertyOptional({ description: '修改前摘要' })
  beforeSummary?: string;

  @ApiPropertyOptional({ description: '修改后摘要' })
  afterSummary?: string;

  @ApiPropertyOptional({ description: '额外上下文' })
  context?: Record<string, any>;
}
