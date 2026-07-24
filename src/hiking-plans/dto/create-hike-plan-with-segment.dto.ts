import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateHikePlanWithSegmentDto {
  @ApiProperty()
  @IsUUID()
  tripId!: string;

  @ApiProperty()
  @IsInt()
  routeDirectionId!: number;

  @ApiProperty({ example: '2026-03-10' })
  @IsString()
  startDate!: string;

  @ApiProperty({ example: '2026-03-11' })
  @IsString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  segmentId?: string;

  @ApiPropertyOptional({ example: 'Routeburn 2日' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ example: '2026-03-10' })
  @IsOptional()
  @IsString()
  plannedDate?: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @IsString()
  plannedStartTime?: string;
}
