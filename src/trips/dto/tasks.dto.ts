// src/trips/dto/tasks.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * 任务优先级
 */
export enum TaskPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * 任务分类
 */
export enum TaskCategory {
  PREFERENCE = 'PREFERENCE',
  SCHEDULE = 'SCHEDULE',
  SAFETY = 'SAFETY',
  BUDGET = 'BUDGET',
  OTHER = 'OTHER',
}

/**
 * 任务 DTO
 */
export class TaskDto {
  @ApiProperty({ description: '任务ID', example: 'task-1' })
  id!: string;

  @ApiProperty({ description: '任务文本', example: '确认你能接受的最长驾驶时长' })
  text!: string;

  @ApiProperty({ description: '是否已完成', example: false })
  completed!: boolean;

  @ApiProperty({ description: '优先级', enum: TaskPriority, example: TaskPriority.HIGH })
  priority!: TaskPriority;

  @ApiProperty({ description: '任务分类', enum: TaskCategory, example: TaskCategory.PREFERENCE })
  category!: TaskCategory;

  @ApiPropertyOptional({ description: '跳转路由', example: '/dashboard/trips/{tripId}' })
  route?: string;

  @ApiPropertyOptional({ description: '元数据', type: Object, additionalProperties: true })
  metadata?: Record<string, any>;
}

/**
 * 更新任务状态请求 DTO
 */
export class UpdateTaskStatusDto {
  @ApiProperty({ description: '是否已完成', example: true })
  @IsBoolean()
  completed!: boolean;
}

