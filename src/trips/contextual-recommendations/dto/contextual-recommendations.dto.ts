import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GeoPointBodyDto {
  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class ContextualTeamStateDeltaDto {
  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  energy?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional({ type: [String], example: ['MOTION_SICKNESS', '刚完成长途飞行'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  temporaryConstraints?: string[];
}

export class ContextualRecommendationsContextDeltaDto {
  @ApiPropertyOptional({
    description: 'GeoPoint 或地名字符串（现场位置）',
  })
  @IsOptional()
  currentLocation?: GeoPointBodyDto | string;

  @ApiPropertyOptional({ example: '2026-07-16T16:20:00+00:00' })
  @IsOptional()
  @IsString()
  currentTime?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  availableUntil?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  desiredReturnTime?: string;

  @ApiPropertyOptional({
    enum: ['ARRIVAL_DAY', 'IN_TRIP', 'DEPARTURE_DAY', 'UNKNOWN'],
  })
  @IsOptional()
  @IsIn(['ARRIVAL_DAY', 'IN_TRIP', 'DEPARTURE_DAY', 'UNKNOWN'])
  tripPhase?: 'ARRIVAL_DAY' | 'IN_TRIP' | 'DEPARTURE_DAY' | 'UNKNOWN';

  @ApiPropertyOptional({ enum: ['LIGHT', 'MODERATE', 'FULL'] })
  @IsOptional()
  @IsIn(['LIGHT', 'MODERATE', 'FULL'])
  desiredIntensity?: 'LIGHT' | 'MODERATE' | 'FULL';

  @ApiPropertyOptional({ type: ContextualTeamStateDeltaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContextualTeamStateDeltaDto)
  teamState?: ContextualTeamStateDeltaDto;

  @ApiPropertyOptional({ type: [String], example: ['吃饭', '简单逛逛', '早点回酒店'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preference?: string[];
}

export class ContextualRecommendationsRequestDto {
  @ApiProperty({ enum: ['SAME_DAY_ACTIVITY'], example: 'SAME_DAY_ACTIVITY' })
  @IsIn(['SAME_DAY_ACTIVITY'])
  scenario!: 'SAME_DAY_ACTIVITY';

  @ApiPropertyOptional({ example: '今晚安排一个适合全家的轻松活动' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  intent?: string;

  @ApiPropertyOptional({ type: ContextualRecommendationsContextDeltaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContextualRecommendationsContextDeltaDto)
  @IsObject()
  contextDelta?: ContextualRecommendationsContextDeltaDto;

  @ApiPropertyOptional({ description: '1-based 焦点日；默认按日历日/行程阶段推断' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({ description: '规则不足时用 LLM 精炼意图（默认 false）' })
  @IsOptional()
  @Type(() => Boolean)
  useLlmIntent?: boolean;

  @ApiPropertyOptional({
    description:
      '当前位置→酒店使用实时路线 API（失败回退启发式；也可用环境变量 CONTEXTUAL_SAME_DAY_LIVE_ROUTES=1）',
  })
  @IsOptional()
  @Type(() => Boolean)
  useLiveRoutes?: boolean;
}

export class MicroPlanScheduleSlotDto {
  @ApiProperty({
    enum: ['HOTEL_CHECK_IN', 'DINING', 'LIGHT_ACTIVITY', 'REST', 'TRANSFER', 'OTHER'],
  })
  @IsIn(['HOTEL_CHECK_IN', 'DINING', 'LIGHT_ACTIVITY', 'REST', 'TRANSFER', 'OTHER'])
  type!: 'HOTEL_CHECK_IN' | 'DINING' | 'LIGHT_ACTIVITY' | 'REST' | 'TRANSFER' | 'OTHER';

  @ApiProperty({ example: '18:15' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({ example: '18:45' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  placeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ContextualRecommendationsCommitDto {
  @ApiPropertyOptional({
    enum: ['PRIMARY', 'MOST_RELAXED', 'MORE_EXPERIENCE'],
    default: 'PRIMARY',
    description: '未传 schedule 时按 variant 再生成后写入',
  })
  @IsOptional()
  @IsIn(['PRIMARY', 'MOST_RELAXED', 'MORE_EXPERIENCE'])
  variant?: 'PRIMARY' | 'MOST_RELAXED' | 'MORE_EXPERIENCE';

  @ApiPropertyOptional({ description: '1-based 目标日，默认焦点日 / 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({ description: '方案标题（写入审计 note）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    type: [MicroPlanScheduleSlotDto],
    description: '优先使用客户端回传的推荐 schedule，避免重算漂移',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MicroPlanScheduleSlotDto)
  schedule?: MicroPlanScheduleSlotDto[];

  @ApiPropertyOptional({ description: '无 schedule 时用于重算的意图' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  intent?: string;

  @ApiPropertyOptional({ type: ContextualRecommendationsContextDeltaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContextualRecommendationsContextDeltaDto)
  contextDelta?: ContextualRecommendationsContextDeltaDto;

  @ApiPropertyOptional({
    description: 'gate=NEED_CONFIRM 时需显式确认才可写入',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  forceConfirm?: boolean;
}
