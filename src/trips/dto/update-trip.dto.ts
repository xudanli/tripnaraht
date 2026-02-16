import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTripDto } from './create-trip.dto';

export class UpdateTripDto extends PartialType(CreateTripDto) {
  @ApiPropertyOptional({
    description: '行程元数据（与现有 metadata 合并，如 teamId 等）',
    example: { teamId: 'team_123' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
