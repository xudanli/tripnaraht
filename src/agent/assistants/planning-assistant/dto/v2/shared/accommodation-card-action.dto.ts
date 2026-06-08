import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 住宿推荐卡片操作（与航班/铁路卡片 actions 对齐，供前端一键加入行程）
 */
export class AccommodationCardActionDto {
  @ApiProperty({ description: '操作标识', example: 'add_accommodation_to_itinerary' })
  action!: string;

  @ApiProperty({ description: '英文标签', example: 'Add to Trip' })
  label!: string;

  @ApiProperty({ description: '中文标签', example: '加入行程' })
  labelCN!: string;

  @ApiPropertyOptional({ description: '操作参数' })
  params?: Record<string, unknown>;
}
