// src/trips/decision/dto/constraint-dsl.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstraintDSL } from '../constraints/constraint-dsl.types';

export class ConstraintDSLDto implements ConstraintDSL {
  @ApiPropertyOptional({ description: '硬约束' })
  hard_constraints?: {
    date_window?: {
      start: string;
      end: string;
      flexible: boolean;
    };
    budget?: {
      max: number;
      currency: string;
      flexible: boolean;
    };
    physical_limitations?: {
      no_long_hiking?: boolean;
      daily_activity_hours_max?: number;
      wheelchair_accessible?: boolean;
      no_stairs?: boolean;
    };
    travel_mode?: {
      allow_self_drive?: boolean;
      allow_public_transit?: boolean;
      max_transfers?: number;
      no_early_morning?: boolean;
      no_late_night?: boolean;
    };
  };

  @ApiPropertyOptional({ description: '软约束' })
  soft_constraints?: {
    pace?: {
      preference: 'relaxed' | 'moderate' | 'intense';
      weight: number;
    };
    scenery?: {
      nature_vs_city: 'nature' | 'city' | 'balanced';
      weight: number;
    };
    photography?: {
      importance: number;
    };
    comfort_level?: {
      hotel_quality: 'low' | 'medium' | 'high';
      weight: number;
    };
  };
}

export class DetectConflictsRequestDto {
  @ApiProperty({ description: '约束DSL' })
  constraints!: ConstraintDSLDto;

  @ApiPropertyOptional({ description: '行程计划（可选，用于更精确的冲突检测）' })
  plan?: any;

  @ApiPropertyOptional({ description: '世界状态（可选，用于更精确的冲突检测）' })
  state?: any;
}

export class GenerateMultiplePlansRequestDto {
  @ApiProperty({ description: '世界状态' })
  state!: any;

  @ApiProperty({ description: '约束DSL' })
  constraints!: ConstraintDSLDto;
}
