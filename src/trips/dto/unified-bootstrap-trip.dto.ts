import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  TravelerDto,
  TRIP_SUPPORTED_CURRENCIES,
  type TripSupportedCurrency,
} from './create-trip.dto';

/**
 * 统一 Bootstrap API：`POST /trips/bootstrap`
 *
 * - 无模板字段：创建 Trip + 同步 Draft Runtime（HYBRID/LLM/ALGO）
 * - 有 routeTemplateId / templateUuid / classicRouteId：走路线模板物化（中国经典自驾等）
 *
 * iOS：经典线选线后传模板字段；自由规划不传。
 */
export class UnifiedBootstrapTripDto {
  @ApiPropertyOptional({ description: '自然语言意图摘要（写入 Trip/上下文，可选）' })
  @IsOptional()
  @IsString()
  userInput?: string;

  @ApiProperty({ description: 'ISO 目的地国家码', example: 'JP' })
  @IsString()
  destination!: string;

  @ApiProperty({ description: '开始日期 YYYY-MM-DD' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: '结束日期 YYYY-MM-DD' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ description: '总预算', example: 20000 })
  @IsNumber()
  totalBudget!: number;

  @ApiPropertyOptional({
    description: '货币 ISO 4217',
    example: 'CNY',
    enum: TRIP_SUPPORTED_CURRENCIES,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'currency 必须是字符串' })
  @IsIn([...TRIP_SUPPORTED_CURRENCIES], {
    message: `currency 必须是有效的 ISO 4217 货币代码（支持: ${TRIP_SUPPORTED_CURRENCIES.join(', ')}）`,
  })
  currency?: TripSupportedCurrency;

  @ApiPropertyOptional({ type: [TravelerDto], description: '缺省为单人成人' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerDto)
  travelers?: TravelerDto[];

  @ApiPropertyOptional({ enum: ['LLM', 'ALGO', 'HYBRID'], description: '草案运行时模式（模板物化时忽略）' })
  @IsOptional()
  @IsIn(['LLM', 'ALGO', 'HYBRID'])
  draftRuntimeMode?: 'LLM' | 'ALGO' | 'HYBRID';

  /** 优先：数字 RouteTemplate id（create-trip 同款） */
  @ApiPropertyOptional({
    description: '路线模板数字 id（优先于 templateUuid / classicRouteId）',
    example: 86,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  routeTemplateId?: number;

  /** 如 cn-classic-cn-route-qinggan_loop-8d */
  @ApiPropertyOptional({
    description: '路线模板 uuid（如 cn-classic-cn-route-qinggan_loop-8d）',
    example: 'cn-classic-cn-route-qinggan_loop-8d',
  })
  @IsOptional()
  @IsString()
  templateUuid?: string;

  /** 如 cn.route.qinggan_loop；按行程天数就近选变体 */
  @ApiPropertyOptional({
    description: '经典线 id（如 cn.route.qinggan_loop）；按 start/end 天数就近匹配模板',
    example: 'cn.route.qinggan_loop',
  })
  @IsOptional()
  @IsString()
  classicRouteId?: string;

  @ApiPropertyOptional({
    enum: ['walk', 'transit', 'car'],
    description: '交通方式（模板物化时默认 car）',
    example: 'car',
  })
  @IsOptional()
  @IsIn(['walk', 'transit', 'car'])
  transport?: 'walk' | 'transit' | 'car';

  @ApiPropertyOptional({
    enum: ['RELAXED', 'BALANCED', 'CHALLENGE'],
    description: '节奏偏好（覆盖模板默认）',
    example: 'BALANCED',
  })
  @IsOptional()
  @IsIn(['RELAXED', 'BALANCED', 'CHALLENGE'])
  pacePreference?: 'RELAXED' | 'BALANCED' | 'CHALLENGE';

  @ApiPropertyOptional({
    description: '行程名称（1-200）',
    example: '青甘大环线 · 经典 8 日',
    maxLength: 200,
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}
