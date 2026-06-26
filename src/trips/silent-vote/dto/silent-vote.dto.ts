import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SilentVoteOptionDto {
  @ApiPropertyOptional({ description: '选项 ID（不传则自动生成）' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summaryRef?: string;
}

export class CreateSilentVoteDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;

  @ApiProperty({ type: [SilentVoteOptionDto], minItems: 2 })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SilentVoteOptionDto)
  options!: SilentVoteOptionDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoOpen?: boolean;
}

export class CreateSilentVoteFromCompareDto {
  @ApiProperty({ type: [String], minItems: 2 })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  planIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoOpen?: boolean;
}

export class SubmitSilentVoteBallotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  optionId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: '对最终采用该方案的在意程度' })
  @IsInt()
  @Min(1)
  @Max(5)
  intensity!: number;
}
