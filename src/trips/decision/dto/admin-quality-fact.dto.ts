import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { HardRuleFact } from '../shared/hard-rule-snapshot.types';

class HardRuleFactDto implements HardRuleFact {
  @ApiProperty({ example: 'temp_wind_speed_drive_limit_v1' })
  @IsString()
  @IsNotEmpty()
  rule_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rule_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  actual_value?: any;

  @ApiPropertyOptional()
  @IsOptional()
  threshold?: any;

  @ApiPropertyOptional({ example: 'm/s' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_violated!: boolean;

  @ApiPropertyOptional({ enum: ['HARD', 'SOFT'] })
  @IsOptional()
  @IsString()
  severity?: 'HARD' | 'SOFT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'ISO timestamp when captured' })
  @IsOptional()
  @IsString()
  at?: string;
}

export class AdminDecisionLogFactAppendDto {
  @ApiProperty({ type: [HardRuleFactDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HardRuleFactDto)
  assertions_triggered!: HardRuleFactDto[];
}

