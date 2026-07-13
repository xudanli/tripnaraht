import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { OptionId, PremiumOptionId, PremiumStressScenarioId, ScenarioId } from '../types/odyssey-intake.types';

/** PATCH /trip-intent 请求体（HTTP DTO + 服务层入参） */
export interface UpdateTripIntentInput {
  tripIntentTag?: string;
  trip_intent_tag?: string;
  tripIntentTags?: string[];
  trip_intent_tags?: string[];
}

export class OdysseyAnswerDto {
  @ApiProperty({
    enum: ['budget_financial_tolerance', 'ambiguity_tolerance', 'energy_pace', 'social_recharge', 'aesthetic_meaning'],
    deprecated: true,
  })
  @IsString()
  scenarioId!: ScenarioId;

  @ApiProperty({ enum: ['A', 'B', 'C'], deprecated: true })
  @IsIn(['A', 'B', 'C'])
  optionId!: OptionId;
}

/** @deprecated v1 五题测评已下线 */
export class SubmitOdysseyIntakeDto {
  @ApiProperty({ type: [OdysseyAnswerDto], description: '【已废弃】5 道场景题答案' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OdysseyAnswerDto)
  answers!: OdysseyAnswerDto[];
}

export class SelectMbtiDto {
  @ApiProperty({ example: 'INTJ', description: '16 型 MBTI，用户自选' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  mbtiType!: string;
}

export class PremiumStressAnswerDto {
  @ApiProperty({
    enum: ['resource_scarcity_replan', 'convoy_division_collaboration', 'premium_upcharge_decision'],
  })
  @IsString()
  scenarioId!: PremiumStressScenarioId;

  @ApiProperty({ enum: ['A', 'B'] })
  @IsIn(['A', 'B'])
  optionId!: PremiumOptionId;
}

export class SubmitPremiumStressTestDto {
  @ApiProperty({ type: [PremiumStressAnswerDto], description: '3 道行中博弈题答案' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PremiumStressAnswerDto)
  answers!: PremiumStressAnswerDto[];
}

export class SubmitPremiumIntakeDto {
  @ApiPropertyOptional({
    example: 'INTJ',
    description: '若已通过 POST /mbti/select 点亮，可省略',
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  mbtiType?: string;

  @ApiProperty({ type: [PremiumStressAnswerDto], description: '3 道 Premium Stress Test 答案' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PremiumStressAnswerDto)
  answers!: PremiumStressAnswerDto[];
}

/**
 * PATCH /trip-intent 请求体（兼容 camelCase / snake_case、单选 / 多选）。
 * 前端当前发送 `{ "tripIntentTag": "budget_mode" }` — 推荐格式。
 * 至少需提供一种字段；空 body 由服务层 normalizeTripIntentInput 返回 400。
 */
export class UpdateTripIntentDto implements UpdateTripIntentInput {
  @ApiPropertyOptional({
    example: 'budget_mode',
    description: '当前选中的即时意向标签（推荐；写入 tripIntentTags[0]）',
  })
  @IsOptional()
  @IsString()
  tripIntentTag?: string;

  @ApiPropertyOptional({ example: 'budget_mode', description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  trip_intent_tag?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['budget_mode'],
    description: '多标签；若与 tripIntentTag 同时出现，以 tripIntentTag 为准',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tripIntentTags?: string[];

  @ApiPropertyOptional({ type: [String], example: ['budget_mode'], description: 'snake_case 别名' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trip_intent_tags?: string[];
}

/** @deprecated 使用 UpdateTripIntentDto */
export class UpdateTripIntentTagsDto extends UpdateTripIntentDto {}

export class UpdateTripMetaDto {
  @ApiProperty({ example: 'Iceland' })
  @IsString()
  destination!: string;

  @ApiProperty({ example: '2026-07-01' })
  @IsString()
  startDate!: string;

  @ApiProperty({ example: '2026-07-10' })
  @IsString()
  endDate!: string;
}

export class TrustVerifyDto {
  @ApiProperty({ enum: ['zhima_credit', 'real_name_id'] })
  @IsIn(['zhima_credit', 'real_name_id'])
  provider!: 'zhima_credit' | 'real_name_id';

  @ApiProperty({ description: '第三方授权 token / auth code（生产环境由网关校验）' })
  @IsString()
  authToken!: string;

  @ApiPropertyOptional({ description: '芝麻信用分（脱敏展示，如 800）' })
  @IsOptional()
  @IsInt()
  @Min(350)
  @Max(950)
  creditScore?: number;
}

const PROFESSION_INDUSTRY_VALUES = [
  'tech',
  'finance',
  'consulting',
  'manufacturing',
  'creative',
  'other',
] as const;
const PROFESSION_OAUTH_PROVIDERS = ['maimai', 'linkedin'] as const;

export class VerifyEducationCredentialDto {
  @ApiProperty({ description: '学信网在线验证码（CHSI online verification code）' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  verificationCode!: string;

  @ApiPropertyOptional({ description: '兼容旧字段名 authToken' })
  @IsOptional()
  @IsString()
  authToken?: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  verification_code?: string;
}

export class SendProfessionEmailCodeDto {
  @ApiProperty({ example: 'name@tencent.com', description: '官方工作邮箱' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  workEmail!: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  work_email?: string;
}

export class VerifyProfessionEmailDto {
  @ApiProperty({ example: 'name@tencent.com' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  workEmail!: string;

  @ApiProperty({ description: '6 位邮箱验证码' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  verificationCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  work_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  verification_code?: string;
}

export class VerifyProfessionOAuthDto {
  @ApiProperty({ enum: PROFESSION_OAUTH_PROVIDERS })
  @IsIn([...PROFESSION_OAUTH_PROVIDERS])
  provider!: (typeof PROFESSION_OAUTH_PROVIDERS)[number];

  @ApiProperty({ description: 'OAuth 授权 token / code（生产环境网关校验）' })
  @IsString()
  @MinLength(1)
  authToken!: string;
}

export class VerifyProfessionBadgeDto {
  @ApiProperty({ description: '工牌/名片 OCR 上传 token（由 upload 接口返回）' })
  @IsString()
  @MinLength(8)
  imageToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_token?: string;
}

export class UploadProfessionBadgeDto {
  @ApiProperty({ description: 'Base64 图片（不含 data-uri 前缀）' })
  @IsString()
  @MinLength(32)
  imageBase64!: string;

  @ApiPropertyOptional({ enum: ['image/jpeg', 'image/png', 'image/webp'], default: 'image/jpeg' })
  @IsOptional()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_base64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mime_type?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** @deprecated PRD 3.1.3 起禁止自选行业/职位；请使用 email/oauth/badge 通道 */
export class VerifyProfessionCredentialDto {
  @ApiProperty({ enum: PROFESSION_INDUSTRY_VALUES })
  @IsIn([...PROFESSION_INDUSTRY_VALUES])
  industryTag!: (typeof PROFESSION_INDUSTRY_VALUES)[number];

  @ApiProperty({ example: '👨‍💻 AI产品总监' })
  @IsString()
  @MaxLength(80)
  roleDisplayTag!: string;

  @ApiPropertyOptional({ example: 'Full-Stack' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  skillDisplayTag?: string;

  @ApiProperty({ description: '企业邮箱/工牌/职场平台授权 token' })
  @IsString()
  authToken!: string;
}
