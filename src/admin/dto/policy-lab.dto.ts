import { ApiProperty } from '@nestjs/swagger';

/** Phase A: read-only Physical Domain static policies (Policy Lab / demo transparency). */
export class StaticPolicyOpenWindowDto {
  @ApiProperty({ example: '06-20', description: 'Inclusive MM-DD (UTC) summer corridor start' })
  inclusive_from!: string;

  @ApiProperty({ example: '10-14', description: 'Inclusive MM-DD (UTC) summer corridor end' })
  inclusive_to!: string;

  @ApiProperty({ description: 'Human-readable semantics for operators' })
  description!: string;
}

export class StaticPolicyViewDto {
  @ApiProperty({ example: 'ICELAND_HIGHLAND_DEFAULT' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: [String], example: ['F_ROAD'] })
  segment_types!: string[];

  @ApiProperty({ enum: ['UTC'] })
  timezone!: 'UTC';

  @ApiProperty({ type: StaticPolicyOpenWindowDto })
  open_window_utc!: StaticPolicyOpenWindowDto;

  @ApiProperty({ description: 'Matches PhysicalViolationItem audit key / evidence_marker tail' })
  policy_source_key!: string;

  @ApiProperty({ example: 'policy:iceland_fr_highland_calendar_v1' })
  evidence_marker!: string;

  @ApiProperty({ example: 'https://www.road.is/' })
  official_guidance_url!: string;

  @ApiProperty({ enum: ['ACTIVE_FALLBACK'], description: 'DB/Road.is seasonal rows take precedence when present' })
  status!: 'ACTIVE_FALLBACK';

  @ApiProperty()
  precedence_note!: string;
}

export class StaticPoliciesReadResponseDto {
  @ApiProperty({ description: 'PhysicalValidator one-version policy string' })
  physical_validator_version!: string;

  @ApiProperty({ type: [StaticPolicyViewDto] })
  policies!: StaticPolicyViewDto[];
}
