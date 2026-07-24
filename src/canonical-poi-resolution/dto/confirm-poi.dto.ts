import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmPoiResolutionDto {
  @ApiProperty({ example: 'Secret Canyon', description: 'AI / 用户原始 POI 文本' })
  @IsString()
  @MinLength(1)
  queryName!: string;

  @ApiProperty({ example: 'is.studlagil', description: '用户选中的 Travel Primary Key' })
  @IsString()
  @MinLength(3)
  selectedPoiId!: string;

  @ApiPropertyOptional({ example: 'IS' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 'zh' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: '关联的 poi_resolution_logs.id（可选）' })
  @IsOptional()
  @IsString()
  resolutionLogId?: string;
}
