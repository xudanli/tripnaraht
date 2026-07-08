import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStageDto } from './pipeline-status.dto';
import { TaskDto } from './tasks.dto';
import { PersonaAlertDto } from './persona-alerts.dto';
import type { TripHealth } from '../../skills/detail/shared/detail-state.types';
import type { TimelinePlanObjectsSummary } from '../utils/timeline-plan-objects.util';

export type TimelineOverviewInclude =
  | 'stats'
  | 'pipeline'
  | 'tasks'
  | 'reminders'
  | 'health'
  | 'suggestions'
  | 'planobjects';

export type TimelineConflictCountSource = 'ssot_planning_conflicts' | 'schedule_conflicts';

export class TimelineOverviewStatsDto {
  @ApiProperty({ description: '可行性分数 0–100（冲突推导）' })
  feasibilityScore!: number;

  @ApiProperty({ description: '节奏分数 0–100（指标疲劳推导）' })
  paceScore!: number;

  @ApiProperty({ description: '未解决冲突总数' })
  conflictCount!: number;

  @ApiProperty({
    enum: ['ssot_planning_conflicts', 'schedule_conflicts'],
    description:
      'conflictCount 来源：ssot_planning_conflicts = planning-conflicts SSOT；schedule_conflicts = 日程冲突列表回退',
  })
  conflictCountSource!: TimelineConflictCountSource;

  @ApiProperty({ description: '待确认预订数（NEED_BOOKING / PENDING 等）' })
  pendingConfirmationCount!: number;

  @ApiPropertyOptional({ description: '待补充文件数（trip_files PENDING）' })
  filesPendingCount?: number;

  @ApiProperty({ description: '未读/新建议数' })
  newSuggestionCount!: number;
}

export class TimelineOverviewPlanningDto {
  @ApiProperty({ description: '规划进度 0–100' })
  progressPercent!: number;

  @ApiProperty()
  completedStages!: number;

  @ApiProperty()
  totalStages!: number;

  @ApiPropertyOptional()
  currentStageName?: string;

  @ApiProperty({ type: [PipelineStageDto] })
  stages!: PipelineStageDto[];
}

export class TimelineOverviewResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiProperty({ type: TimelineOverviewStatsDto })
  stats!: TimelineOverviewStatsDto;

  @ApiProperty({ type: TimelineOverviewPlanningDto })
  planning!: TimelineOverviewPlanningDto;

  @ApiProperty({ type: [TaskDto] })
  tasks!: TaskDto[];

  @ApiProperty()
  incompleteTaskCount!: number;

  @ApiProperty({ type: [PersonaAlertDto], description: '今日提醒 / 人格提醒（Top N）' })
  todayReminders!: PersonaAlertDto[];

  @ApiPropertyOptional({ description: '健康度详情（include=health 时）' })
  health?: TripHealth;

  @ApiPropertyOptional({ description: '规划对象投影摘要（include=planobjects 且 PLAN_OBJECT_PROJECTION_ENABLED=1）' })
  planObjects?: TimelinePlanObjectsSummary;

  @ApiProperty()
  generatedAt!: string;
}
