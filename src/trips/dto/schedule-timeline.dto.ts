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
}

export class ScheduleTimelineDayDto {
  @ApiProperty()
  dayId!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  date!: string;

  @ApiProperty()
  dayIndex!: number;

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
