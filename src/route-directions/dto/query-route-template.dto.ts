// src/route-directions/dto/query-route-template.dto.ts
import { IsOptional, IsInt, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

function parseBooleanQuery(value: unknown): boolean | unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
}

export class QueryRouteTemplateDto {
  @ApiPropertyOptional({ description: '路线方向 ID', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  routeDirectionId?: number;

  @ApiPropertyOptional({ description: '行程天数', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  durationDays?: number;

  @ApiPropertyOptional({ description: '是否激活', type: Boolean })
  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: '是否附带打包清单摘要（packingChecklistId / hasPackingChecklist / packingChecklistSummary）',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean()
  includePackingSummary?: boolean;

  @ApiPropertyOptional({
    description: '筛选：是否已绑定打包清单',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean()
  hasPackingChecklist?: boolean;

  @ApiPropertyOptional({
    description: '是否附带预算摘要（budgetEstimateId / hasBudgetEstimate / budgetEstimateSummary）',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean()
  includeBudgetSummary?: boolean;

  @ApiPropertyOptional({
    description: '筛选：是否已绑定预算估算',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean()
  hasBudgetEstimate?: boolean;

  @ApiPropertyOptional({ description: '返回数量限制', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @ApiPropertyOptional({ description: '偏移量', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset?: number;
}
