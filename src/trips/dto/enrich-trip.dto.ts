import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

/** `POST /trips/:tripId/enrich` — 增量增强（后续可接仿真/补全/局部重算） */
export class EnrichTripDto {
  @ApiPropertyOptional({ description: '用户或系统提示，指导增强方向', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hints?: string[];
}
