import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class BudgetSnapshotDto {
  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiProperty()
  @IsNumber()
  total!: number;

  @ApiProperty()
  @IsNumber()
  available!: number;

  @ApiProperty()
  @IsNumber()
  held!: number;

  @ApiProperty()
  @IsNumber()
  spent!: number;
}

export class BudgetAdjustDto {
  @ApiProperty()
  @IsNumber()
  amount!: number;

  @ApiProperty()
  @IsIn(['CREDIT', 'DEBIT'])
  op!: 'CREDIT' | 'DEBIT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateBudgetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  total?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  available?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  held?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  spent?: number;
}

export class BudgetListQueryDto {
  @ApiPropertyOptional({ description: '账户模糊搜索（匹配 accountId）' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: '币种筛选（如 USD）' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: '状态筛选：HEALTHY | ANOMALY（可选）' })
  @IsOptional()
  @IsIn(['HEALTHY', 'ANOMALY'])
  status?: 'HEALTHY' | 'ANOMALY';

  @ApiPropertyOptional({ description: '分页页码（从 1 开始）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数（默认 20）' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class InventoryItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['HOTEL', 'FLIGHT', 'CAR'] })
  @IsIn(['HOTEL', 'FLIGHT', 'CAR'])
  type!: 'HOTEL' | 'FLIGHT' | 'CAR';

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ enum: ['AVAILABLE', 'LIMITED', 'SOLD_OUT'] })
  @IsIn(['AVAILABLE', 'LIMITED', 'SOLD_OUT'])
  availability!: 'AVAILABLE' | 'LIMITED' | 'SOLD_OUT';

  @ApiProperty()
  @IsBoolean()
  lockable!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  holdExpiresAt?: string;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional({ enum: ['HOTEL', 'FLIGHT', 'CAR'] })
  @IsOptional()
  @IsIn(['HOTEL', 'FLIGHT', 'CAR'])
  type?: 'HOTEL' | 'FLIGHT' | 'CAR';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: ['AVAILABLE', 'LIMITED', 'SOLD_OUT'] })
  @IsOptional()
  @IsIn(['AVAILABLE', 'LIMITED', 'SOLD_OUT'])
  availability?: 'AVAILABLE' | 'LIMITED' | 'SOLD_OUT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  lockable?: boolean;
}

export class LockInventoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  holdExpiresAt?: string;
}

export class ConstraintConfigDto {
  @ApiProperty()
  @IsString()
  ruleId!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class UpdateConstraintConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class DataSourceConfigDto {
  @ApiProperty()
  @IsString()
  sourceId!: string;

  @ApiProperty()
  @IsString()
  provider!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fallbackStrategy?: string;
}

export class UpdateDataSourceConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fallbackStrategy?: string;
}

export class QuoteResourceDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty()
  @IsString()
  inventoryId!: string;
}

export class HoldResourceDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty()
  @IsString()
  inventoryId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsString()
  idempotencyKey!: string;
}

export class CommitResourceDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty()
  @IsString()
  inventoryId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty()
  @IsString()
  holdId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedResourceHash?: string;
}

export class ReleaseResourceDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty()
  @IsString()
  inventoryId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  holdId?: string;
}

export class CompensateResourceDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty()
  @IsString()
  inventoryId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
