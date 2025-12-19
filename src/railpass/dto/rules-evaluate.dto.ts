// src/railpass/dto/rules-evaluate.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class RulesEvaluateRequestDto {
  @ApiProperty({
    description: 'Rail segments',
    type: Array,
  })
  @IsNotEmpty()
  @IsArray()
  segments!: any[];

  @ApiProperty({
    description: 'Pass profile',
    type: Object,
  })
  @IsNotEmpty()
  @IsObject()
  passProfile!: any;

  @ApiProperty({
    description: 'Reservation tasks (optional)',
    type: Array,
    required: false,
  })
  @IsOptional()
  @IsArray()
  reservationTasks?: any[];

  @ApiProperty({
    description: 'Travel day calculation result (optional)',
    type: Object,
    required: false,
  })
  @IsOptional()
  @IsObject()
  travelDayResult?: {
    totalDaysUsed: number;
    daysByDate: Record<string, any>;
  };
}

