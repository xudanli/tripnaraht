import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class LaunchRecruitmentFromTemplateDto {
  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  slotsNeeded!: number;

  @ApiProperty({ enum: ['full_managed', 'co_planning', 'casual_play'] })
  @IsEnum(['full_managed', 'co_planning', 'casual_play'])
  planningStyle!: 'full_managed' | 'co_planning' | 'casual_play';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departureLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetMinCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetMaxCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captainMessage?: string;

  @ApiPropertyOptional({ description: '前端 catalog 匹配结果，可选；缺省时后端用模板元数据或模板名兜底' })
  @IsOptional()
  @IsString()
  routeTemplateCatalogId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  routeTemplateTitleZh?: string;
}
