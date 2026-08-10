import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TeamTaskSourceDto {
  @ApiProperty({
    description:
      '来源类型；已知：manual | packing_template | readiness | ask_ai | itinerary_item；未知 type 原样持久化',
    example: 'manual',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  type!: string;

  @ApiPropertyOptional({
    description: 'itinerary_item 时为 itineraryItemId',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  refId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelZh?: string;
}

export class CreateTeamTaskDto {
  @ApiProperty({ example: '预订蓝湖门票' })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: '行程成员 id；null/缺省 = 待认领',
  })
  @IsOptional()
  @IsString()
  assigneeMemberId?: string | null;

  @ApiPropertyOptional({
    description: 'ISO8601 或 YYYY-MM-DD',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsString()
  dueAt?: string | null;

  @ApiPropertyOptional({ type: TeamTaskSourceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TeamTaskSourceDto)
  source?: TeamTaskSourceDto;
}

export class UpdateTeamTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  assigneeMemberId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  dueAt?: string | null;
}

export class FromPackingTemplateDto {
  @ApiProperty({ example: 'iceland_summer_v1' })
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @ApiPropertyOptional({
    enum: ['team_tasks', 'personal_checklist'],
    default: 'team_tasks',
  })
  @IsOptional()
  @IsIn(['team_tasks', 'personal_checklist'])
  mode?: 'team_tasks' | 'personal_checklist';

  @ApiProperty({ type: [String], example: ['rain_jacket', 'eu_adapter'] })
  @IsArray()
  @IsString({ each: true })
  includeItemIds!: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  defaultAssigneeMemberId?: string | null;
}

export class FromReadinessDto {
  @ApiProperty({
    type: [String],
    example: ['RENTAL_ORDER', 'TRANSPORT_INSURANCE_PENDING'],
  })
  @IsArray()
  @IsString({ each: true })
  itemIds!: string[];
}

export class RemindTeamTasksDto {
  @ApiProperty({ type: [String], example: ['m_li', 'm_wang'] })
  @IsArray()
  @IsString({ each: true })
  memberIds!: string[];

  @ApiPropertyOptional({
    example: '请尽快完成分配给你的团队任务，方便行程按时推进。',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sendAppPush?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'false 时跳过 24h 内已提醒过的成员',
  })
  @IsOptional()
  @IsBoolean()
  allowRemindAgain?: boolean;
}

export class CreateMyPackingListItemDto {
  @ApiProperty({ example: '备用雨衣' })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(200)
  titleZh!: string;

  @ApiPropertyOptional({ example: '衣物' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryZh?: string | null;
}

export class UpdateMyPackingListItemDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  checked?: boolean;
}
