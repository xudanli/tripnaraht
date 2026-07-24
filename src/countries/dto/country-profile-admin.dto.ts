import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class GetCountryProfilesAdminQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量（最大 100）', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '搜索（中文名、英文名、ISO 代码）' })
  @IsOptional()
  @IsString()
  q?: string;

}

/** 国家档案写入体（与 data/country-profiles/*.v2.json 同构，仅 V2） */
export class UpsertCountryProfileAdminDto {
  @ApiProperty({ description: '必须为 2', example: 2 })
  @IsNumber()
  schemaVersion!: number;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2', example: 'IS' })
  @IsString()
  @Length(2, 2)
  isoCode!: string;

  @ApiProperty({ example: '冰岛' })
  @IsString()
  nameCN!: string;

  @ApiPropertyOptional({ example: 'Iceland' })
  @IsOptional()
  @IsString()
  nameEN?: string;

  @ApiPropertyOptional({ example: 'ISK' })
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @ApiPropertyOptional({ example: '冰岛克朗' })
  @IsOptional()
  @IsString()
  currencyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  exchangeRateToCNY?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  exchangeRateToUSD?: number;

  @ApiPropertyOptional({
    enum: ['CASH_HEAVY', 'BALANCED', 'DIGITAL_ONLY', 'HYBRID_DIGITAL_PREFER'],
  })
  @IsOptional()
  @IsString()
  paymentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  paymentInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  powerInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  emergency?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '全球入境要求（按旅客护照国籍 ISO2）' })
  @IsOptional()
  @IsObject()
  entryRequirements?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '@deprecated 请用 entryRequirements.byNationality.CN' })
  @IsOptional()
  @IsObject()
  visaForCN?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  complianceInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  timeBoundaries?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  travelCulture?: Record<string, unknown>;
}

/** PATCH：字段均可选（保存后恒为 schemaVersion 2） */
export class PatchCountryProfileAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 2)
  isoCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameEN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currencyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  exchangeRateToCNY?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  exchangeRateToUSD?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  paymentInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  powerInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  emergency?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '全球入境要求（按旅客护照国籍 ISO2）' })
  @IsOptional()
  @IsObject()
  entryRequirements?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '@deprecated 请用 entryRequirements.byNationality.CN' })
  @IsOptional()
  @IsObject()
  visaForCN?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  complianceInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  timeBoundaries?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  travelCulture?: Record<string, unknown>;
}
