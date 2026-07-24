import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TripConstraintChangeDto } from './trip-constraint.dto';

export const PLANNING_COMMANDS = ['UPDATE_CONSTRAINTS'] as const;
export type PlanningCommandName = (typeof PLANNING_COMMANDS)[number];

export class PlanningConstraintsCommandDto {
  @ApiProperty({ enum: PLANNING_COMMANDS, example: 'UPDATE_CONSTRAINTS' })
  @IsIn(PLANNING_COMMANDS)
  command!: PlanningCommandName;

  @ApiProperty({ type: [TripConstraintChangeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripConstraintChangeDto)
  changes!: TripConstraintChangeDto[];

  @ApiPropertyOptional({ description: '写完后触发 route_and_run 重算' })
  @IsOptional()
  @IsBoolean()
  recalculate?: boolean;

  @ApiPropertyOptional({ description: '乐观锁' })
  @IsOptional()
  @IsNumber()
  constraintsVersion?: number;
}
