import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { DayBudgetItem } from '../types/route-budget-estimate.types';

function preserveDayBudgets({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return { ...(item as Record<string, unknown>) };
    }
    return item;
  });
}

export class UpdateRouteBudgetEstimateDto {
  @ApiPropertyOptional({ description: '国家码' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  countryCode?: string;

  @ApiPropertyOptional({ description: '币种 ISO 4217' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: '人数口径', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize?: number;

  @ApiPropertyOptional({ enum: ['fuel', 'ev', 'hybrid'] })
  @IsOptional()
  @IsString()
  @IsIn(['fuel', 'ev', 'hybrid'])
  vehicleType?: 'fuel' | 'ev' | 'hybrid';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameEN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assumptions?: string;

  @ApiPropertyOptional({
    description: '按天预算明细（整表替换）',
    type: 'array',
  })
  @IsOptional()
  @Transform(preserveDayBudgets)
  @IsArray()
  dayBudgets?: DayBudgetItem[];
}
