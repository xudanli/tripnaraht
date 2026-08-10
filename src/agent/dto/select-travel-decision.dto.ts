import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SelectTravelDecisionRequestDto {
  @ApiProperty({ description: '方案 optionId，如 SOUTH_COAST / 4WD' })
  @IsString()
  @MinLength(1)
  option_id!: string;

  @ApiPropertyOptional({ description: '选择者 user_id' })
  @IsOptional()
  @IsString()
  selected_by?: string;

  @ApiPropertyOptional({ description: '关联 trip（校验用，可选）' })
  @IsOptional()
  @IsString()
  trip_id?: string;
}

export class SelectTravelDecisionResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiPropertyOptional()
  reason?: string;

  @ApiPropertyOptional()
  decision_id?: string;

  @ApiPropertyOptional()
  decision_key?: string;

  @ApiPropertyOptional()
  option_id?: string;

  @ApiPropertyOptional()
  state?: string;

  @ApiPropertyOptional({ description: '是否已写入 trip.metadata' })
  persisted_to_trip_metadata?: boolean;

  @ApiPropertyOptional()
  contract_patch?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '已合并进 trip.metadata.travelDecisionContract' })
  travel_decision_contract?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '可用于 route_and_run 的草案桥接消息（不静默 Apply）',
  })
  draft_bridge_message?: string | null;

  @ApiPropertyOptional({
    description: '建议下一步：用 route_and_run 发送 draft_bridge_message',
  })
  next?: { suggested_route_and_run_message?: string };
}
