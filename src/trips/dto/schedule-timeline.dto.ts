import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type ScheduleTimelineInclude = 'items' | 'schedule' | 'metrics' | 'travelInfo';

export type ScheduleTimelineTravelInfoMode = 'cached' | 'none' | 'recalculate';

export class ScheduleTimelineQueryDto {
  @ApiPropertyOptional({
    description: '逗号分隔：items,schedule,metrics,travelInfo（默认全开）',
    example: 'items,schedule,metrics',
  })
  include?: string;

  @ApiPropertyOptional({
    description: '仅拉指定日期（YYYY-MM-DD，逗号分隔）',
    example: '2026-06-20,2026-06-21',
  })
  dates?: string;

  @ApiPropertyOptional({ description: '按天窗口起始索引（0-based）', example: 0 })
  from?: number;

  @ApiPropertyOptional({ description: '按天窗口长度', example: 5 })
  limit?: number;

  @ApiPropertyOptional({
    enum: ['cached', 'none', 'recalculate'],
    description: '交通信息模式；GET 禁止 recalculate，请用 POST calculate-all-travel',
    default: 'cached',
  })
  travelInfoMode?: ScheduleTimelineTravelInfoMode;
}

export class ScheduleTimelineTripMetaDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  destination?: string | null;

  @ApiPropertyOptional()
  startDate?: string | null;

  @ApiPropertyOptional()
  endDate?: string | null;

  @ApiPropertyOptional()
  pacingConfig?: unknown;

  @ApiPropertyOptional()
  metadata?: unknown;

  @ApiPropertyOptional()
  status?: string | null;

  @ApiPropertyOptional({ description: 'pipeline / planning 状态（metadata 投影）' })
  pipelineStatus?: string | null;

  @ApiPropertyOptional({
    description: '目的地墙钟时区（IANA），用于展示 startTimeLocal / offset ISO',
    example: 'Asia/Shanghai',
  })
  timezone?: string | null;
}

export class ScheduleTimelineDayDto {
  @ApiProperty()
  dayId!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: '0-based 窗口日索引（与历史契约一致）' })
  dayIndex!: number;

  @ApiPropertyOptional({
    description: '当日叙事主题（来自 trip.metadata.dayThemes，1-based 键）',
  })
  theme?: string | null;

  @ApiPropertyOptional({
    description: '兼容别名：与 theme 同值',
  })
  title?: string | null;

  @ApiPropertyOptional({
    description: '区域短名（来自 trip.metadata.dayLabels）',
  })
  label?: string | null;

  @ApiPropertyOptional({
    description: '区域短名别名（与 label 同值）',
  })
  locationLabel?: string | null;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  itineraryItems?: unknown[];

  @ApiPropertyOptional()
  schedule?: {
    date: string;
    schedule: unknown;
    persisted: boolean;
  };

  @ApiPropertyOptional()
  metrics?: unknown;

  @ApiPropertyOptional()
  travelInfo?: unknown;
}

export class ScheduleTimelineResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiProperty({ type: ScheduleTimelineTripMetaDto })
  trip!: ScheduleTimelineTripMetaDto;

  @ApiProperty({ type: [ScheduleTimelineDayDto] })
  days!: ScheduleTimelineDayDto[];

  @ApiPropertyOptional()
  metricsSummary?: unknown;

  @ApiPropertyOptional({ description: '供 silent refresh / 304 协商' })
  etag?: string;
}
