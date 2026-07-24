import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenWorldVerificationPayloadDto {
  @ApiProperty({ description: 'provisional stub id，如 provisional_disco_kayak_gl' })
  @IsString()
  stub_id!: string;

  @ApiPropertyOptional({ description: 'mark_verified 时可选：匹配到的真实 placeId' })
  @IsOptional()
  @IsNumber()
  promoted_place_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note_zh?: string;
}

export class OpenWorldDiscoveryUiDto {
  @ApiProperty({ example: 'tripnara.open_world_discovery@v1' })
  @IsString()
  schema!: 'tripnara.open_world_discovery@v1';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sparse_profile_id?: string;

  @ApiProperty()
  mention_count!: number;

  @ApiProperty()
  stub_count!: number;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  verification_tasks!: Array<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  intentional_slack_summary_zh?: string;

  @ApiProperty()
  @IsString()
  computed_at!: string;
}

export class ApplyOpenWorldVerificationRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  request_id?: string;

  @ApiProperty({ description: '来自 result.payload.ui_display.open_world_discovery' })
  @IsObject()
  open_world_discovery!: OpenWorldDiscoveryUiDto;

  @ApiProperty({ enum: ['mark_verified', 'discard_stub'] })
  @IsString()
  @IsIn(['mark_verified', 'discard_stub'])
  action!: 'mark_verified' | 'discard_stub';

  @ApiProperty({ type: OpenWorldVerificationPayloadDto })
  @ValidateNested()
  @Type(() => OpenWorldVerificationPayloadDto)
  payload!: OpenWorldVerificationPayloadDto;
}

export class ApplyOpenWorldVerificationResponseDto {
  @ApiProperty({ enum: ['OK', 'REJECTED'] })
  status!: 'OK' | 'REJECTED';

  @ApiProperty({ type: OpenWorldDiscoveryUiDto })
  open_world_discovery!: OpenWorldDiscoveryUiDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejection_reason_zh?: string;

  @ApiPropertyOptional({ description: '更新后的 stub 状态（promoted / discarded）' })
  @IsOptional()
  @IsObject()
  updated_stub?: Record<string, unknown>;
}
