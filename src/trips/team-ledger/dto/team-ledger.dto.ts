import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLedgerExpenseDto {
  @ApiProperty({ example: 'Blue Lagoon 门票' })
  @IsString()
  @IsNotEmpty({ message: '请填写事项' })
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'm_xu' })
  @IsString()
  @IsNotEmpty({ message: '付款人不存在' })
  payerMemberId!: string;

  @ApiProperty({ example: 160000, description: '金额（分）' })
  @IsInt({ message: '请填写金额' })
  @Min(1, { message: '请填写金额' })
  amountCents!: number;

  @ApiPropertyOptional({ example: 'CNY', default: 'CNY' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiProperty({ example: '2026-02-12T14:20:00Z' })
  @IsISO8601()
  occurredAt!: string;

  @ApiProperty({ type: [String], example: ['m_xu', 'm_li'] })
  @IsArray()
  @ArrayMinSize(1, { message: '请选择分摊成员' })
  @IsString({ each: true })
  splitMemberIds!: string[];

  @ApiPropertyOptional({
    example: 'item_xxx',
    description: '关联行程活动；活动详情「团队账本」据此回显',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(128)
  itineraryItemId?: string | null;
}

export class UpdateLedgerExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '请填写事项' })
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  payerMemberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: '请填写金额' })
  @Min(1, { message: '请填写金额' })
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: '请选择分摊成员' })
  @IsString({ each: true })
  splitMemberIds?: string[];

  @ApiPropertyOptional({
    description: '关联行程活动；传 null 清除关联',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(128)
  itineraryItemId?: string | null;
}

export class NotifyLedgerSettlementDto {
  @ApiPropertyOptional({
    enum: ['push_and_inapp', 'push', 'inapp'],
    default: 'push_and_inapp',
  })
  @IsOptional()
  @IsIn(['push_and_inapp', 'push', 'inapp'])
  channel?: 'push_and_inapp' | 'push' | 'inapp';
}
