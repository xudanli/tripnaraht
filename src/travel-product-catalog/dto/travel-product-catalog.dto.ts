import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  OperatorTrustLevel,
  ProductOfferingStatus,
  ProductPlaceSpatialRole,
  ProductSessionStatus,
  TravelProductType,
} from '@prisma/client';

export class CreateExperienceDefinitionDto {
  @ApiProperty({ example: 'EXP_GLACIER_HIKING' })
  @IsString()
  code!: string;

  @ApiProperty({ enum: TravelProductType })
  @IsEnum(TravelProductType)
  productType!: TravelProductType;

  @ApiProperty({ example: 'OUTDOOR_ADVENTURE' })
  @IsString()
  categoryCode!: string;

  @ApiProperty({ example: 'GLACIER_HIKING' })
  @IsString()
  subtypeCode!: string;

  @ApiProperty({ example: '冰川徒步' })
  @IsString()
  displayNameZh!: string;

  @ApiProperty({ example: 'Glacier Hiking' })
  @IsString()
  displayNameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  typicalDurationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fitnessLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  recommendedMinAge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  recommendedMaxAge?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipmentTypical?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seasonalityNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weatherDependency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commonCancelReasons?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresGuide?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresLicense?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedExperienceAtomCodes?: string[];

  @ApiPropertyOptional({ type: [String], example: ['IS'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countryCodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateExperienceDefinitionDto extends PartialType(CreateExperienceDefinitionDto) {}

export class CreateOperatorDto {
  @ApiProperty({ example: 'Arctic Adventures' })
  @IsString()
  brandName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'IS' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  operatingRegions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  licenses?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceSummary?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancellationPolicySummary?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dataSources?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  distributionChannels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalOperatorId?: string;

  @ApiPropertyOptional({ enum: OperatorTrustLevel })
  @IsOptional()
  @IsEnum(OperatorTrustLevel)
  trustLevel?: OperatorTrustLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateOperatorDto extends PartialType(CreateOperatorDto) {}

export class CreateProductOfferingDto {
  @ApiProperty()
  @IsString()
  experienceDefinitionId!: string;

  @ApiProperty()
  @IsString()
  operatorId!: string;

  @ApiProperty({ example: 'Sólheimajökull Glacier Discovery' })
  @IsString()
  nameEN!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TravelProductType })
  @IsEnum(TravelProductType)
  productType!: TravelProductType;

  @ApiProperty()
  @IsString()
  categoryCode!: string;

  @ApiProperty()
  @IsString()
  subtypeCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  defaultDurationMin?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  included?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excluded?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  minAge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxAge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  minHeightCm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fitnessRequirement?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipmentRequired?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancellationPolicy?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  safetyRules?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bookingChannels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalProductId?: string;

  @ApiPropertyOptional({ enum: ProductOfferingStatus })
  @IsOptional()
  @IsEnum(ProductOfferingStatus)
  status?: ProductOfferingStatus;

  @ApiPropertyOptional({ example: 'IS' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateProductOfferingDto extends PartialType(CreateProductOfferingDto) {}

export class ProductPlaceLinkItemDto {
  @ApiProperty()
  @IsInt()
  placeId!: number;

  @ApiProperty({ enum: ProductPlaceSpatialRole })
  @IsEnum(ProductPlaceSpatialRole)
  role!: ProductPlaceSpatialRole;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  geometry?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReplaceProductPlaceLinksDto {
  @ApiProperty({ type: [ProductPlaceLinkItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPlaceLinkItemDto)
  links!: ProductPlaceLinkItemDto[];
}

export class CreateProductSessionDto {
  @ApiProperty({ example: '2026-07-18', description: '当地日历日 YYYY-MM-DD' })
  @IsString()
  localDate!: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  startTimeLocal?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  endTimeLocal?: string;

  @ApiPropertyOptional({ example: '08:30' })
  @IsOptional()
  @IsString()
  meetTimeLocal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  latestCheckInLocal?: string;

  @ApiPropertyOptional({ example: 'Atlantic/Reykjavik' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  capacityTotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  capacityRemaining?: number;

  @ApiPropertyOptional({ enum: ProductSessionStatus })
  @IsOptional()
  @IsEnum(ProductSessionStatus)
  status?: ProductSessionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  minParticipants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isGuaranteedDeparture?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weatherStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postponementOrCancelStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalSessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateProductSessionDto extends PartialType(CreateProductSessionDto) {}

export class CreateRatePlanDto {
  @ApiProperty({ example: 'ADULT_STD' })
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  nameEN!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiProperty({ example: 'ISK' })
  @IsString()
  currency!: string;

  @ApiProperty({ example: 14990 })
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({ description: '绑定具体班次；空则 offering 默认价' })
  @IsOptional()
  @IsString()
  sessionId?: string | null;

  @ApiPropertyOptional({ example: 'ADULT' })
  @IsOptional()
  @IsString()
  travelerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesTransfer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  inventoryCap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  bookingRules?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateRatePlanDto extends PartialType(CreateRatePlanDto) {}

export class ListOfferingsQueryDto {
  @ApiPropertyOptional({ example: 'IS' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '按体验定义筛（规划项选完后再找供应商 SKU）' })
  @IsOptional()
  @IsString()
  experienceDefinitionId?: string;

  @ApiPropertyOptional({
    description: '按地点筛：仅返回 placeLinks 挂过该 Place 的 Offering',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  placeId?: number;

  @ApiPropertyOptional({ enum: TravelProductType })
  @IsOptional()
  @IsEnum(TravelProductType)
  productType?: TravelProductType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtypeCode?: string;

  @ApiPropertyOptional({ enum: ProductOfferingStatus })
  @IsOptional()
  @IsEnum(ProductOfferingStatus)
  status?: ProductOfferingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class PlaceExperienceLinkItemDto {
  @ApiProperty({ description: 'ExperienceDefinition.id' })
  @IsString()
  experienceDefinitionId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '地点语境展示名覆盖' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReplacePlaceExperienceLinksDto {
  @ApiProperty({ type: [PlaceExperienceLinkItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceExperienceLinkItemDto)
  links!: PlaceExperienceLinkItemDto[];
}

export class ListSessionsQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: '2026-07-18' })
  @IsOptional()
  @IsString()
  date?: string;
}
