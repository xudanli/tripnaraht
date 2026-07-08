import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GUIDE_PLAN_VARIANT,
  GUIDE_SOURCE_TYPE,
  type GuidePlanVariant,
  type GuideSourceType,
} from '../constants/guide-to-plan-status.constants';

export class CreateGuideToPlanSessionDto {
  @ApiPropertyOptional({ description: '目的地国家代码', example: 'IS' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  countryCode?: string;

  @ApiPropertyOptional({ description: '目的地描述', example: '冰岛南岸' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;
}

export class ImportGuideTextDto {
  @ApiProperty({
    description: '输入类型',
    enum: Object.values(GUIDE_SOURCE_TYPE),
    example: 'text',
  })
  @IsEnum(GUIDE_SOURCE_TYPE)
  sourceType!: GuideSourceType;

  @ApiPropertyOptional({ description: '攻略标题（用户可编辑）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ description: '粘贴的攻略正文或链接' })
  @IsOptional()
  @IsString()
  @MaxLength(80_000)
  content?: string;

  @ApiPropertyOptional({ description: '来源链接（小红书/公众号等）' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: '手动灵感输入，如「想去冰河湖、黑沙滩、看极光」',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualInspirations?: string[];

  @ApiPropertyOptional({ description: '导入后是否立即触发异步解析', default: false })
  @IsOptional()
  parseImmediately?: boolean;
}

export class GuideTravelersDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  adults?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  seniors?: number;
}

export class ConfirmGuideTravelContextDto {
  @ApiPropertyOptional({ description: '出行开始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '出行结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ type: GuideTravelersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuideTravelersDto)
  travelers?: GuideTravelersDto;

  @ApiPropertyOptional({
    enum: ['self_drive', 'bus', 'tour', 'mixed', 'unknown'],
    example: 'self_drive',
  })
  @IsOptional()
  @IsString()
  transportMode?: string;

  @ApiPropertyOptional({
    enum: ['2wd', '4x4', 'suv', 'campervan'],
    description: '自驾车型（冰岛 F-road / 高地约束）',
    example: '4x4',
  })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['冰河湖', '黑沙滩摄影'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preserveExperiences?: string[];

  @ApiPropertyOptional({ description: '国家代码', example: 'IS' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  countryCode?: string;

  @ApiPropertyOptional({ description: '目的地' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;
}

export class GenerateGuidePlanDto {
  @ApiPropertyOptional({
    description: '生成方案变体',
    enum: Object.values(GUIDE_PLAN_VARIANT),
    default: 'balanced',
  })
  @IsOptional()
  @IsEnum(GUIDE_PLAN_VARIANT)
  variant?: GuidePlanVariant;

  @ApiPropertyOptional({
    description: '一次生成多个变体',
    enum: Object.values(GUIDE_PLAN_VARIANT),
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(GUIDE_PLAN_VARIANT, { each: true })
  variants?: GuidePlanVariant[];
}

export class AcceptGuidePlanDto {
  @ApiProperty({ description: '要接受的草案 ID' })
  @IsUUID()
  planCandidateId!: string;

  @ApiPropertyOptional({
    description: '接受策略',
    enum: ['accept_all', 'review_items', 'keep_faithful'],
    default: 'accept_all',
  })
  @IsOptional()
  @IsString()
  acceptanceMode?: 'accept_all' | 'review_items' | 'keep_faithful';
}

export class ConfirmGuidePlanItemsDto {
  @ApiProperty({ description: '要接受的草案 ID' })
  @IsUUID()
  planCandidateId!: string;

  @ApiProperty({
    description: '逐项确认后勾选的活动 reviewKey 列表（来自 GET review-items）',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  acceptedItemKeys!: string[];
}

export class RematchGuidePlacesDto {
  @ApiPropertyOptional({
    description: '国家代码；不传则使用会话 countryCode 或 travelContext.countryCode',
    example: 'IS',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  countryCode?: string;
}

export class BindGuidePlaceDto {
  @ApiPropertyOptional({
    description: '绑定的 TripNARA Place ID（来自 GET /places/autocomplete）',
    example: 381090,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  placeId?: number;

  @ApiPropertyOptional({
    description: '设为 rejected 表示用户确认无法/不需要匹配 POI',
    enum: ['rejected'],
  })
  @IsOptional()
  @IsEnum(['rejected'])
  matchStatus?: 'rejected';
}
