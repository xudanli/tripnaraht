import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityItemDto } from './shared/activity-item.dto';

export class ApplyActivityToItineraryRequestDto {
  @ApiPropertyOptional({
    description: '规划助手会话 ID（有 activity / activityCard 时可省略）',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    description: '活动在 activity_booking_cards 列表中的下标（与 actions.params.activityIndex 一致）',
    example: 0,
  })
  @IsInt()
  @Min(0)
  activityIndex!: number;

  @ApiPropertyOptional({
    description: '写入的行程日（1-based）；未传则用卡片 associatedDayNumber，再回落到首日',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayNumber?: number;

  @ApiPropertyOptional({
    description: '活动日期 YYYY-MM-DD（优先于 dayNumber 解析 TripDay）',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: '可选：直接传入活动快照',
    type: ActivityItemDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActivityItemDto)
  activity?: ActivityItemDto;

  @ApiPropertyOptional({
    description:
      '卡片原始快照（与 payload.activity_booking_cards[i] 或 actions.params.applySnapshot 一致）',
  })
  @IsOptional()
  @IsObject()
  activityCard?: Record<string, unknown>;
}

export class ApplyActivityToItineraryResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiPropertyOptional({ description: '新建的行程项 ID' })
  itineraryItemId?: string;

  @ApiPropertyOptional({ description: '写入的 TripDay ID' })
  tripDayId?: string;

  @ApiProperty({ description: '英文提示' })
  message!: string;

  @ApiProperty({ description: '中文提示' })
  messageCN!: string;

  @ApiPropertyOptional({ description: '关联 Place ID' })
  placeId?: number;
}
