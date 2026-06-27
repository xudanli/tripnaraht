import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class PoiExecutionFeedbackDto {
  @ApiProperty({ example: 'is.gullfoss' })
  @IsString()
  poiId!: string;

  @ApiProperty({ example: '2026-07-15' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateISO!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  placeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ example: '11:30' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/)
  arrivalTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  parkingWaitMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  visitDurationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  couldNotPark?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  abandonedDueToCrowd?: boolean;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])
  crowdLevelSubjective?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
