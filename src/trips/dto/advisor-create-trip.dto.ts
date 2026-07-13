import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripResponsibilityOwnersDto } from '../member-invites/dto/trip-responsibility-owners.dto';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/** 顾问创建行程时的干系人（可为字符串简写或结构化对象） */
export class AdvisorStakeholderDto {
  @ApiPropertyOptional({ description: '姓名或称呼' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '已注册用户的 UUID' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

function normalizeStakeholder(value: unknown): AdvisorStakeholderDto | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { name: trimmed } : undefined;
  }
  if (typeof value === 'object') {
    return value as AdvisorStakeholderDto;
  }
  return undefined;
}

export class AdvisorCreateTripDto {
  @ApiProperty({ description: '目的地（国家码或文本）', example: 'IS' })
  @IsString()
  destination!: string;

  @ApiProperty({ description: '开始日期 YYYY-MM-DD' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: '结束日期 YYYY-MM-DD' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ description: '行程天数', example: 7 })
  @IsInt()
  @Min(1)
  dayCount!: number;

  @ApiProperty({ description: '预估出行人数', example: 12 })
  @IsInt()
  @Min(1)
  estimatedHeadcount!: number;

  @ApiProperty({ description: '总预算', example: 50000 })
  @IsNumber()
  @Min(0)
  totalBudget!: number;

  @ApiProperty({ description: '主要联系人' })
  @Transform(({ value }) => normalizeStakeholder(value))
  @ValidateNested()
  @Type(() => AdvisorStakeholderDto)
  primaryContact!: AdvisorStakeholderDto;

  @ApiProperty({ description: '付款人' })
  @Transform(({ value }) => normalizeStakeholder(value))
  @ValidateNested()
  @Type(() => AdvisorStakeholderDto)
  payer!: AdvisorStakeholderDto;

  @ApiProperty({ description: '最终确认人' })
  @Transform(({ value }) => normalizeStakeholder(value))
  @ValidateNested()
  @Type(() => AdvisorStakeholderDto)
  finalConfirmer!: AdvisorStakeholderDto;

  @ApiProperty({ description: '顾问（缺省绑定当前登录用户）' })
  @Transform(({ value }) => normalizeStakeholder(value))
  @ValidateNested()
  @Type(() => AdvisorStakeholderDto)
  advisor!: AdvisorStakeholderDto;

  @ApiProperty({ description: '领队' })
  @Transform(({ value }) => normalizeStakeholder(value))
  @ValidateNested()
  @Type(() => AdvisorStakeholderDto)
  leader!: AdvisorStakeholderDto;

  @ApiPropertyOptional({ description: '已知需求/约束说明' })
  @IsOptional()
  @IsString()
  knownRequirements?: string;

  @ApiPropertyOptional({ description: '所属机构 ID' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: '行程名称' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AdvisorMemberInviteCodeDto {
  @ApiProperty({ description: '邀请码' })
  inviteCode!: string;

  @ApiProperty({ description: '邀请链接' })
  inviteUrl!: string;

  @ApiProperty({ description: '角色标签（中文）' })
  label!: string;
}

export class AdvisorCreateTripResponseDto {
  @ApiProperty({ description: '新建行程 ID' })
  tripId!: string;

  @ApiProperty({ type: [AdvisorMemberInviteCodeDto], description: '各角色成员邀请码' })
  memberInviteCodes!: AdvisorMemberInviteCodeDto[];

  @ApiPropertyOptional({
    type: TripResponsibilityOwnersDto,
    description: '责任分配 SSOT（P1，创建时预写）',
  })
  responsibilityOwners?: TripResponsibilityOwnersDto;
}
