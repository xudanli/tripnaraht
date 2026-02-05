// src/agent/dto/apply-fallback.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyFallbackRequestDto {
  @ApiProperty({ description: '行程ID', example: 'trip-uuid' })
  tripId!: string;

  @ApiProperty({ description: '修复方案ID（从fallback响应中获取）', example: 'solution-uuid' })
  solutionId!: string;

  @ApiPropertyOptional({ description: '是否确认应用（默认true）', example: true })
  confirm?: boolean;
}
