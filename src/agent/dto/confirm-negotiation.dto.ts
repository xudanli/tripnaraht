import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class NegotiationResolutionDto {
  @ApiProperty({ example: 'neg:req-003' })
  @IsString()
  @MinLength(3)
  session_id!: string;

  @ApiProperty({ enum: ['UPGRADE_TO_DRIVE', 'POSTPONE_SCHEDULE'] as const, example: 'UPGRADE_TO_DRIVE' })
  @IsString()
  @IsIn(['UPGRADE_TO_DRIVE', 'POSTPONE_SCHEDULE'] as const)
  alternative_id!: 'UPGRADE_TO_DRIVE' | 'POSTPONE_SCHEDULE';

  @ApiProperty({ example: 'sha256:7e3c4b...' })
  @IsString()
  @MinLength(8)
  expected_negotiation_hash!: string;
}

export class ItineraryRevisionAuditDto {
  @ApiPropertyOptional({ description: 'Cost delta vs parent snapshot (USD)' })
  @IsOptional()
  delta_cost_usd?: number | null;

  @ApiPropertyOptional({ description: 'Schedule shift (minutes); POSTPONE uses negotiation alternative value' })
  @IsOptional()
  delta_time_minutes?: number | null;

  @ApiPropertyOptional({ description: 'Items whose start/end changed vs parent', type: 'array', items: { type: 'object' } })
  @IsOptional()
  interrupted_items?: Array<{ item_id: string; field: string }>;

  @ApiPropertyOptional({ example: 'POSTPONE_SCHEDULE' })
  @IsOptional()
  @IsString()
  resolution_type?: string;
}

export class ItineraryRevisionPointersDto {
  @ApiPropertyOptional({ description: 'BASELINE revision id (only on first confirm chain for this trip)' })
  @IsOptional()
  @IsString()
  baseline_revision_id?: string | null;

  @ApiProperty({ description: 'Head revision for this confirm' })
  @IsString()
  confirmed_revision_id!: string;

  @ApiPropertyOptional({ description: 'Parent revision (BASELINE or prior CONFIRMED)' })
  @IsOptional()
  @IsString()
  parent_revision_id?: string | null;

  @ApiPropertyOptional({ type: ItineraryRevisionAuditDto })
  @IsOptional()
  @IsObject()
  audit?: ItineraryRevisionAuditDto;
}

export class ConfirmNegotiationResponseDto {
  @ApiProperty({ enum: ['CONFIRMED'] as const, example: 'CONFIRMED' })
  @IsString()
  status!: 'CONFIRMED';

  @ApiProperty({ description: 'Human-readable patch summary', example: 'UPGRADE_TO_DRIVE: seg_pt_1 TRANSIT -> DRIVE; recompute end_time' })
  @IsString()
  resolution_patch_summary!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Updated itinerary' })
  itinerary!: any;

  @ApiPropertyOptional({ type: ItineraryRevisionPointersDto, description: 'Persisted revision chain (when DB + trip_id available)' })
  @IsOptional()
  @IsObject()
  itinerary_revision?: ItineraryRevisionPointersDto;
}

