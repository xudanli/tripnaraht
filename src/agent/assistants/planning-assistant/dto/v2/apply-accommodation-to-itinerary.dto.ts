import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccommodationItemDto } from './shared/accommodation-item.dto';

export class ApplyAccommodationToItineraryRequestDto {
  @ApiPropertyOptional({
    description:
      '规划助手会话 ID（用于读取最近一次住宿搜索结果）。若已传 accommodation / accommodationCard 可省略',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    description: '住宿在 accommodations 列表中的下标（与卡片 actions.params.accommodationIndex 一致）',
    example: 0,
  })
  @IsInt()
  @Min(0)
  accommodationIndex!: number;

  @ApiPropertyOptional({
    description: '若当日已有住宿项，是否先移除再写入（默认 true）',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;

  @ApiPropertyOptional({
    description: '可选：直接传入住宿快照（未传则从会话 lastAccommodations 读取）',
    type: AccommodationItemDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccommodationItemDto)
  accommodation?: AccommodationItemDto;

  @ApiPropertyOptional({
    description:
      'route_and_run 卡片原始快照（与 payload.accommodations[i] 或 actions.params.applySnapshot 一致）',
  })
  @IsOptional()
  @IsObject()
  accommodationCard?: Record<string, unknown>;
}

export class ApplyAccommodationToItineraryResponseDto {
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

  @ApiPropertyOptional({ description: '被替换移除的旧住宿项数量' })
  replacedCount?: number;
}
