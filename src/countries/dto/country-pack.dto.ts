// src/countries/dto/country-pack.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 风险阈值 DTO
 */
export class RiskThresholdsDto {
  @ApiPropertyOptional({
    description: '高海拔阈值（米）',
    example: 3500,
  })
  @IsOptional()
  @IsNumber()
  highAltitudeM?: number;

  @ApiPropertyOptional({
    description: '快速上升阈值（米/天）',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  rapidAscentM?: number;

  @ApiPropertyOptional({
    description: '陡坡阈值（百分比）',
    example: 15,
  })
  @IsOptional()
  @IsNumber()
  steepSlopePct?: number;

  @ApiPropertyOptional({
    description: '大爬升日阈值（米/天）',
    example: 1500,
  })
  @IsOptional()
  @IsNumber()
  bigAscentDayM?: number;
}

/**
 * 体力等级映射 DTO
 */
export class EffortLevelMappingDto {
  @ApiPropertyOptional({
    description: '轻松等级最大值',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  relaxMax?: number;

  @ApiPropertyOptional({
    description: '中等等级最大值',
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  moderateMax?: number;

  @ApiPropertyOptional({
    description: '挑战等级最大值',
    example: 85,
  })
  @IsOptional()
  @IsNumber()
  challengeMax?: number;

  @ApiPropertyOptional({
    description: '极限等级最小值',
    example: 85,
  })
  @IsOptional()
  @IsNumber()
  extremeMin?: number;
}

/**
 * 地形约束 DTO
 */
export class TerrainConstraintsDto {
  @ApiPropertyOptional({
    description: '第一天高海拔限制（米）',
    example: 3000,
  })
  @IsOptional()
  @IsNumber()
  firstDayMaxElevationM?: number;

  @ApiPropertyOptional({
    description: '最大日爬升限制（米）',
    example: 1000,
  })
  @IsOptional()
  @IsNumber()
  maxDailyAscentM?: number;

  @ApiPropertyOptional({
    description: '连续高爬升天数限制',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  maxConsecutiveHighAscentDays?: number;

  @ApiPropertyOptional({
    description: '高海拔日缓冲时间（小时）',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  highAltitudeBufferHours?: number;
}

/**
 * Country Pack 响应 DTO
 */
export class CountryPackDto {
  @ApiProperty({
    description: '国家代码',
    example: 'CN_XIZANG',
  })
  countryCode!: string;

  @ApiProperty({
    description: '国家名称',
    example: '中国西藏',
  })
  countryName!: string;

  @ApiPropertyOptional({
    description: '风险阈值（覆盖默认值）',
    type: RiskThresholdsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RiskThresholdsDto)
  riskThresholds?: RiskThresholdsDto;

  @ApiPropertyOptional({
    description: '体力等级映射（覆盖默认值）',
    type: EffortLevelMappingDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EffortLevelMappingDto)
  effortLevelMapping?: EffortLevelMappingDto;

  @ApiPropertyOptional({
    description: '地形约束（覆盖默认值）',
    type: TerrainConstraintsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TerrainConstraintsDto)
  terrainConstraints?: TerrainConstraintsDto;
}

/**
 * 创建/更新 Country Pack 请求 DTO
 */
export class CreateOrUpdateCountryPackDto {
  @ApiProperty({
    description: '国家名称',
    example: '中国西藏',
  })
  @IsString()
  countryName!: string;

  @ApiPropertyOptional({
    description: '风险阈值（覆盖默认值）',
    type: RiskThresholdsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RiskThresholdsDto)
  riskThresholds?: RiskThresholdsDto;

  @ApiPropertyOptional({
    description: '体力等级映射（覆盖默认值）',
    type: EffortLevelMappingDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EffortLevelMappingDto)
  effortLevelMapping?: EffortLevelMappingDto;

  @ApiPropertyOptional({
    description: '地形约束（覆盖默认值）',
    type: TerrainConstraintsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TerrainConstraintsDto)
  terrainConstraints?: TerrainConstraintsDto;
}
