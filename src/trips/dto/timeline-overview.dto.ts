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
  | 'planobjects'
  | 'readiness';

export type OverallReadinessStateDto =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'NEAR_READY'
  | 'READY'
  | 'BLOCKED'
  | 'NEEDS_REVALIDATION';

export type ReadinessDimensionCodeDto =
  | 'ROUTE'
  | 'ACCOMMODATION'
  | 'TRANSPORT'
  | 'ACTIVITY'
  | 'MEMBER';

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
  @ApiProperty({
    description:
      '【兼容】原规划进度 0–100（pipeline 阶段占比）。主界面请优先读 overallReadiness.score',
  })
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

export class TimelineOverviewReadinessDimensionDto {
  @ApiProperty({ enum: ['ROUTE', 'ACCOMMODATION', 'TRANSPORT', 'ACTIVITY', 'MEMBER'] })
  code!: ReadinessDimensionCodeDto;

  @ApiProperty()
  labelZh!: string;

  @ApiProperty({ description: '维度得分 0–100' })
  score!: number;
}

export class TimelineOverviewReadinessCardDto {
  @ApiProperty({ description: '整体准备度得分 0–100（与是否就绪独立）' })
  score!: number;

  @ApiProperty({
    enum: [
      'NOT_STARTED',
      'IN_PROGRESS',
      'NEAR_READY',
      'READY',
      'BLOCKED',
      'NEEDS_REVALIDATION',
    ],
  })
  state!: OverallReadinessStateDto;

  @ApiProperty({ description: '细粒度状态，如「接近就绪」' })
  stateLabelZh!: string;

  @ApiProperty({
    description: '首页主状态：非 READY 多为「尚未就绪」；BLOCKED/过期保留专词',
  })
  displayLabelZh!: string;

  @ApiProperty({ description: '如「整体准备度 78% · 尚未就绪」' })
  headline!: string;

  @ApiProperty({ description: '证据可信度 0–100' })
  evidenceConfidence!: number;

  @ApiProperty()
  blockerCount!: number;

  @ApiProperty()
  pendingConfirmationCount!: number;

  @ApiPropertyOptional({ description: '首要未就绪原因' })
  whyNotReady?: string;

  @ApiPropertyOptional({ description: '处理优先事项后预计可涨分' })
  potentialScoreLift?: number;

  @ApiProperty({ type: [TimelineOverviewReadinessDimensionDto] })
  dimensions!: TimelineOverviewReadinessDimensionDto[];

  @ApiPropertyOptional()
  topPriority?: { title: string; actionCode?: string; estimatedScoreLift?: number };

  @ApiProperty({ description: '准备报告详情深链' })
  reportDeepLink!: string;
}

export class TimelineOverviewResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiProperty({ type: TimelineOverviewStatsDto })
  stats!: TimelineOverviewStatsDto;

  @ApiProperty({
    type: TimelineOverviewPlanningDto,
    description: '原规划进度（内部指标，保留兼容）',
  })
  planning!: TimelineOverviewPlanningDto;

  @ApiPropertyOptional({
    type: TimelineOverviewReadinessCardDto,
    description:
      '整体准备度卡片（替代规划进度作为主分数）。默认返回；可用 include 排除 readiness',
  })
  overallReadiness?: TimelineOverviewReadinessCardDto;

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
