import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum EvidenceReliability {
  STABLE = 'STABLE',
  VOLATILE = 'VOLATILE',
  DEGRADED = 'DEGRADED',
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE',
}

export enum EvidenceLineageSourceType {
  L1_CACHE_HIT = 'L1_CACHE_HIT',
  L1B_NEIGHBOR_HIT = 'L1B_NEIGHBOR_HIT',
  L2_REALTIME_COMPUTED = 'L2_REALTIME_COMPUTED',
  L3_FALLBACK = 'L3_FALLBACK',
}

export enum EvidenceInvalidationReason {
  EXPIRED_TRUST_NEIGHBORHOOD = 'EXPIRED_TRUST_NEIGHBORHOOD',
  PEAK_STRICT_REMEASURE = 'PEAK_STRICT_REMEASURE',
  PEAK_VOLATILE_CONTEXT = 'PEAK_VOLATILE_CONTEXT',
}

export class BaseEvidenceLineageDto {
  @ApiProperty({ enum: EvidenceReliability })
  @IsEnum(EvidenceReliability)
  reliability!: EvidenceReliability;

  @ApiProperty({ enum: EvidenceLineageSourceType })
  @IsEnum(EvidenceLineageSourceType)
  source_type!: EvidenceLineageSourceType;

  @ApiPropertyOptional({ enum: EvidenceInvalidationReason })
  @IsOptional()
  @IsEnum(EvidenceInvalidationReason)
  invalidation_reason?: EvidenceInvalidationReason;
}

export class TravelTimeCapturedContextDto {
  @ApiProperty({ example: true })
  is_peak!: boolean;

  @ApiProperty({ example: 'DRIVE' })
  @IsString()
  mode!: string;

  @ApiProperty({ example: '2026-06-01T17:00:00.000Z' })
  @IsString()
  bucket!: string;
}

export class TravelTimeEvidenceLineageDto extends BaseEvidenceLineageDto {
  @ApiProperty({ type: TravelTimeCapturedContextDto })
  @ValidateNested()
  @Type(() => TravelTimeCapturedContextDto)
  captured_context!: TravelTimeCapturedContextDto;

  @ApiPropertyOptional({ example: '2026-06-01T16:00:00.000Z' })
  @IsOptional()
  @IsString()
  matched_bucket?: string;

  @ApiPropertyOptional({ example: '2026-06-01T16:00:00.000Z' })
  @IsOptional()
  @IsString()
  ignored_bucket?: string;
}

export class PublicTransportCapturedContextDto {
  @ApiProperty({ example: 'CANCELLED' })
  @IsString()
  trip_status!: string;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @IsNumber()
  delay_seconds?: number;

  @ApiPropertyOptional({ example: 'stub_gtfs:2026-06-01T17:30:00.000Z' })
  @IsOptional()
  @IsString()
  gtfs_snapshot_id?: string;
}

export class PublicTransportEvidenceLineageDto extends BaseEvidenceLineageDto {
  @ApiProperty({ type: PublicTransportCapturedContextDto })
  @ValidateNested()
  @Type(() => PublicTransportCapturedContextDto)
  captured_context!: PublicTransportCapturedContextDto;
}

export class EvidenceLineageDto {
  @ApiPropertyOptional({ type: TravelTimeEvidenceLineageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TravelTimeEvidenceLineageDto)
  travel_time_v1?: TravelTimeEvidenceLineageDto;

  @ApiPropertyOptional({ type: PublicTransportEvidenceLineageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicTransportEvidenceLineageDto)
  public_transport_v1?: PublicTransportEvidenceLineageDto;
}

