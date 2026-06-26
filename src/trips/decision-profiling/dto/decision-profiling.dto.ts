import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SplitMechanismMode } from '../types/decision-profiling.types';

class QuizAnswerDto {
  @ApiProperty()
  @IsString()
  questionId!: string;

  @ApiProperty()
  @IsString()
  optionId!: string;
}

export class SubmitQuizDto {
  @ApiProperty({ type: [QuizAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];

  @ApiPropertyOptional({ description: '用户微调备注' })
  @IsOptional()
  @IsString()
  userNote?: string;
}

export class PatchTravelStyleNoteDto {
  @ApiProperty()
  @IsString()
  userNote!: string;
}

export class SelectSplitModeDto {
  @ApiProperty({ enum: ['split_aa', 'rotating_treat', 'proportional', 'hybrid'] })
  @IsIn(['split_aa', 'rotating_treat', 'proportional', 'hybrid'])
  mode!: SplitMechanismMode;
}

export class SimulateSplitDto {
  @ApiProperty({ example: 50000 })
  @IsNumber()
  totalEstimate!: number;

  @ApiPropertyOptional({ default: 'CNY' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class ConfirmSplitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acknowledge?: string;
}

export class ReuseProfileDto {
  @ApiPropertyOptional({
    description: 'P0 固定两段一起沿用',
    example: ['travel_style', 'money_dna'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['travel_style', 'money_dna'], { each: true })
  sections?: Array<'travel_style' | 'money_dna'>;

  @ApiPropertyOptional({ description: '可选，写入 Travel Style userNote' })
  @IsOptional()
  @IsString()
  userNote?: string;
}
