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

export class CreateRouteBudgetEstimateDto {
  @ApiProperty({ description: '路线模板 ID（必填，一期一模板一份）', type: Number })
  @Type(() => Number)
  @IsInt()
  routeTemplateId!: number;

  @ApiPropertyOptional({ description: '国家码；省略时从路线方向推断', example: 'CN' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  countryCode?: string;

  @ApiPropertyOptional({ description: '币种 ISO 4217', example: 'CNY', default: 'CNY' })
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

  @ApiPropertyOptional({
    description: '车辆类型',
    enum: ['fuel', 'ev', 'hybrid'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['fuel', 'ev', 'hybrid'])
  vehicleType?: 'fuel' | 'ev' | 'hybrid';

  @ApiPropertyOptional({ description: '中文名' })
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiPropertyOptional({ description: '英文名' })
  @IsOptional()
  @IsString()
  nameEN?: string;

  @ApiPropertyOptional({ description: '版本号', example: '1.0.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ description: '是否激活', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: '口径说明，如「自驾燃油车 / 中档住宿 / 2 人」',
  })
  @IsOptional()
  @IsString()
  assumptions?: string;

  @ApiProperty({
    description:
      '按天预算明细。每项含 day + 可选 tickets/fuel/charging/parking/accommodation/other/dayTotal',
    type: 'array',
    example: [
      {
        day: 1,
        tickets: { amount: 200, note: '景区门票' },
        fuel: { amount: 150 },
        parking: { amount: 40 },
        accommodation: { min: 400, max: 600 },
      },
    ],
  })
  @Transform(preserveDayBudgets)
  @IsArray()
  dayBudgets!: DayBudgetItem[];
}
