// src/agent/dto/reorder.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReorderRequestDto {
  @ApiProperty({ description: '行程ID', example: 'trip-uuid' })
  tripId!: string;

  @ApiProperty({ description: '日期ID（通常是currentDayId）', example: 'day-uuid' })
  dayId!: string;

  @ApiProperty({ 
    description: '重新排序后的行程项ID数组', 
    type: [String],
    example: ['item1-uuid', 'item2-uuid', 'item3-uuid'],
  })
  newOrder!: string[];

  @ApiPropertyOptional({ description: '重新排序原因', example: '用户请求调整顺序' })
  reason?: string;
}
