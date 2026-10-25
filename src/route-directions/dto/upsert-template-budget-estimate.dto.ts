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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DayBudgetItem } from '../types/route-budget-estimate.types';

/** 保留按天明细全部字段，避免 whitelist 弄丢嵌套对象 */
function preserveDayBudgets({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return { ...(item as Record<string, unknown>) };
    }
    return item;
  });
}

/** 按模板 upsert 预算（routeTemplateId 由路径决定） */
export class UpsertTemplateBudgetEstimateDto {
  @ApiPropertyOptional({ description: '国家码；省略时从路线方向推断' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  countryCode?: string;

  @ApiPropertyOptional({ description: '币种 ISO 4217', example: 'CNY' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: '人数口径', type: Number, default: 2 })
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

  @ApiProperty({
    description: '按天预算明细',
    type: 'array',
  })
  @Transform(preserveDayBudgets)
  @IsArray()
  dayBudgets!: DayBudgetItem[];
}
