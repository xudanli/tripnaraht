import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RobustnessDualCurvePointDto {
  @ApiProperty()
  node_id!: string;

  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ description: 'Physical robustness at node [0, 1]' })
  physical!: number;

  @ApiProperty({ description: 'Organizational robustness at node (1 − social stress) [0, 1]' })
  organizational!: number;

  @ApiPropertyOptional({ type: [String] })
  active_perturbations?: string[];
}

export class AlignmentTupleSummaryDto {
  @ApiProperty()
  tuple_id!: string;

  @ApiProperty()
  captured_at!: string;

  @ApiProperty()
  discard_reason!: string;

  @ApiProperty()
  organizational_penalty!: number;

  @ApiProperty()
  physical_penalty!: number;

  @ApiProperty({ type: [String] })
  affected_node_ids!: string[];

  @ApiPropertyOptional()
  revision_id?: string;

  @ApiPropertyOptional()
  resolution_type?: string;
}

export class AlignmentTier3DashboardSliceDto {
  @ApiPropertyOptional()
  organizational_weight?: number;

  @ApiPropertyOptional()
  physical_weight?: number;

  @ApiPropertyOptional()
  tuple_count?: number;

  @ApiPropertyOptional()
  last_discard_reason?: string;

  @ApiProperty({ type: AlignmentTupleSummaryDto, isArray: true })
  recent_tuples!: AlignmentTupleSummaryDto[];

  @ApiPropertyOptional({ description: 'Trip.metadata.alignmentTier3Revision' })
  metadata_revision?: number;
}

export class TripRobustnessDashboardResponseDto {
  @ApiProperty()
  trip_id!: string;

  @ApiProperty({ example: 'tripnara.trip_robustness_dashboard@v1' })
  schema!: 'tripnara.trip_robustness_dashboard@v1';

  @ApiProperty({
    enum: ['ready', 'cached', 'empty_itinerary', 'computation_failed', 'trip_not_found'],
  })
  status!: 'ready' | 'cached' | 'empty_itinerary' | 'computation_failed' | 'trip_not_found';

  @ApiPropertyOptional({ description: 'Rollout payload (schema tripnara.robustness_dashboard@v1)' })
  rollout?: Record<string, unknown>;

  @ApiPropertyOptional()
  cached_at?: string;

  @ApiProperty({ type: RobustnessDualCurvePointDto, isArray: true })
  dual_curves!: RobustnessDualCurvePointDto[];

  @ApiProperty({ type: AlignmentTier3DashboardSliceDto })
  alignment!: AlignmentTier3DashboardSliceDto;

  @ApiProperty()
  computed_at!: string;
}
