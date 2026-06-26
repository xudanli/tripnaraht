// src/itinerary-items/dto/item-cost.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 费用分类枚举
 */
export enum CostCategory {
  ACCOMMODATION = 'ACCOMMODATION',     // 住宿
  TRANSPORTATION = 'TRANSPORTATION',   // 交通
  FOOD = 'FOOD',                       // 餐饮
  ACTIVITIES = 'ACTIVITIES',           // 活动/门票
  SHOPPING = 'SHOPPING',               // 购物
  OTHER = 'OTHER',                     // 其他
}

/**
 * 行程项费用 DTO
 */
export class ItemCostDto {
  @ApiPropertyOptional({ 
    description: '预估费用（人民币或指定货币）', 
    example: 150,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedCost?: number;

  @ApiPropertyOptional({ 
    description: '实际费用（旅行后记录）', 
    example: 165,
    minimum: 0
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  actualCost?: number;

  @ApiPropertyOptional({ 
    description: '货币类型（ISO 4217）', 
    example: 'CNY', 
    default: 'CNY',
    enum: ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'KRW', 'THB', 'SGD', 'AUD']
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ 
    description: '费用分类', 
    enum: CostCategory,
    example: CostCategory.ACTIVITIES
  })
  @IsEnum(CostCategory)
  @IsOptional()
  costCategory?: CostCategory;

  @ApiPropertyOptional({ 
    description: '费用备注（如：门票+缆车）', 
    example: '门票含缆车' 
  })
  @IsString()
  @IsOptional()
  costNote?: string;

  @ApiPropertyOptional({ 
    description: '是否已支付', 
    default: false 
  })
  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @ApiPropertyOptional({ 
    description: '支付人ID（多人旅行场景）' 
  })
  @IsString()
  @IsOptional()
  paidBy?: string;

  @ApiPropertyOptional({
    description: '参与分摊的用户 ID 列表（L3 Travel Wallet）',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  splitAmongUserIds?: string[];

  @ApiPropertyOptional({
    description: '是否自动写入旅行钱包账本（默认 true）',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  autoLedger?: boolean;
}

/**
 * 批量更新费用项
 */
export class BatchUpdateCostItemDto {
  @ApiProperty({ description: '行程项ID' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ description: '实际费用', minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  actualCost?: number;

  @ApiPropertyOptional({ description: '是否已支付' })
  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @ApiPropertyOptional({ description: '费用备注' })
  @IsString()
  @IsOptional()
  costNote?: string;
}

/**
 * 批量更新费用 DTO
 */
export class BatchUpdateCostDto {
  @ApiProperty({ description: '行程ID' })
  @IsString()
  tripId!: string;

  @ApiProperty({ 
    description: '费用更新列表', 
    type: [BatchUpdateCostItemDto] 
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateCostItemDto)
  items!: BatchUpdateCostItemDto[];
}

// ========== 响应 DTO ==========

/**
 * 分类费用汇总
 */
export class CategoryCostSummaryDto {
  @ApiProperty({ description: '预估费用' })
  estimated!: number;

  @ApiProperty({ description: '实际费用' })
  actual!: number;

  @ApiProperty({ description: '费用项数量' })
  count!: number;
}

/**
 * 每日费用汇总
 */
export class DailyCostSummaryDto {
  @ApiProperty({ description: '日期 (YYYY-MM-DD)' })
  date!: string;

  @ApiProperty({ description: '预估费用' })
  estimated!: number;

  @ApiProperty({ description: '实际费用' })
  actual!: number;

  @ApiProperty({ description: '费用项数量' })
  itemCount!: number;
}

/**
 * 费用偏差
 */
export class CostVarianceDto {
  @ApiProperty({ description: '差额（负数表示节省，正数表示超支）' })
  amount!: number;

  @ApiProperty({ description: '差额百分比' })
  percentage!: number;

  @ApiProperty({ 
    description: '状态', 
    enum: ['UNDER_BUDGET', 'ON_BUDGET', 'OVER_BUDGET'] 
  })
  status!: 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET';
}

/**
 * 行程费用汇总响应
 */
export class TripCostSummaryDto {
  @ApiProperty({ description: '行程总预算' })
  totalBudget!: number;

  @ApiProperty({ description: '总预估费用' })
  totalEstimated!: number;

  @ApiProperty({ description: '总实际费用' })
  totalActual!: number;

  @ApiProperty({ description: '已支付金额' })
  totalPaid!: number;

  @ApiProperty({ description: '待支付金额' })
  totalUnpaid!: number;

  @ApiProperty({ description: '货币类型' })
  currency!: string;

  @ApiProperty({ 
    description: '按分类汇总',
    type: 'object',
    additionalProperties: { type: 'object' }
  })
  byCategory!: Record<string, CategoryCostSummaryDto>;

  @ApiProperty({ 
    description: '按日期汇总', 
    type: [DailyCostSummaryDto] 
  })
  byDay!: DailyCostSummaryDto[];

  @ApiProperty({ 
    description: '预算偏差（实际 vs 预估）', 
    type: CostVarianceDto 
  })
  variance!: CostVarianceDto;

  @ApiProperty({ 
    description: '预算使用率（实际费用/总预算）', 
    example: 65.5 
  })
  budgetUsagePercent!: number;
}

/**
 * 批量更新结果
 */
export class BatchUpdateCostResultDto {
  @ApiProperty({ description: '更新成功数量' })
  updated!: number;

  @ApiProperty({ description: '更新失败数量' })
  failed!: number;

  @ApiPropertyOptional({ description: '失败的项目ID列表' })
  failedIds?: string[];
}
