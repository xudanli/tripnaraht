import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TRAVEL_MOTIVATIONS,
  type TravelMotivation,
} from '../types/narrative-arc.types';

export class NarrativeIntakeDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recentState?: string;

  @ApiPropertyOptional({ enum: TRAVEL_MOTIVATIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...TRAVEL_MOTIVATIONS], { each: true })
  motivations?: TravelMotivation[];

  @ApiPropertyOptional({ maxLength: 3 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  moodKeywords?: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  freeText?: string;
}

export class NarrativeIntakeRequestDto {
  @ValidateNested()
  @Type(() => NarrativeIntakeDto)
  intake!: NarrativeIntakeDto;

  @ApiPropertyOptional({ default: 'zh-CN' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class SelectThemeRequestDto {
  @IsString()
  themeId!: string;

  @IsString()
  generationRequestId!: string;
}

export class RegenerateThemeRequestDto {
  @IsString()
  generationRequestId!: string;
}
