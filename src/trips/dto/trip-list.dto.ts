import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TripListQueryDto {
  @ApiPropertyOptional({ description: '分页条数', default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: '偏移量', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: '状态筛选，逗号分隔：PLANNING,IN_PROGRESS,COMPLETED,CANCELLED',
    example: 'PLANNING,IN_PROGRESS',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '是否包含已取消行程（排末尾）', default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return normalized !== 'false' && normalized !== '0';
  })
  @IsBoolean()
  includeCancelled?: boolean = true;
}
