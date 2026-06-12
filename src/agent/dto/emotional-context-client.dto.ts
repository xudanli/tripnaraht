import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EmotionalAudioProsodyClientDto {
  @ApiProperty({ enum: ['low', 'medium', 'high'] })
  @IsString()
  pitch!: 'low' | 'medium' | 'high';

  @ApiProperty({ description: 'TTS 语速因子，<1 表示放慢' })
  @IsNumber()
  speedFactor!: number;
}

export class EmotionalAmbienceSignalsClientDto {
  @ApiProperty()
  @IsBoolean()
  isGoldenHour!: boolean;

  @ApiProperty()
  @IsBoolean()
  isRomancePacingActive!: boolean;

  @ApiProperty()
  @IsBoolean()
  weatherWindLockActive!: boolean;
}

export class SharedMilestoneAnchorClientDto {
  @ApiProperty()
  @IsString()
  pastTripId!: string;

  @ApiProperty()
  @IsString()
  locationName!: string;

  @ApiProperty()
  @IsString()
  legacyPreferenceToken!: string;

  @ApiProperty({ enum: ['POSITIVE_HIGH', 'NEGATIVE_TRAUMA', 'NEUTRAL'] })
  @IsString()
  emotionalPolarity!: 'POSITIVE_HIGH' | 'NEGATIVE_TRAUMA' | 'NEUTRAL';
}

export class SharedMilestoneUiCardDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsString()
  locationName!: string;

  @ApiProperty()
  @IsString()
  headlineZh!: string;

  @ApiProperty()
  @IsString()
  bodyZh!: string;

  @ApiProperty({ enum: ['POSITIVE_HIGH', 'NEGATIVE_TRAUMA', 'NEUTRAL'] })
  @IsString()
  polarity!: 'POSITIVE_HIGH' | 'NEGATIVE_TRAUMA' | 'NEUTRAL';
}

/** BFF：tripnara.emotional_context.client@v1 */
export class EmotionalContextClientDto {
  @ApiProperty({ example: 'tripnara.emotional_context.client@v1' })
  @IsString()
  schemaVersion!: 'tripnara.emotional_context.client@v1';

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  fatigueIndex!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  anxietyLevel!: number;

  @ApiProperty()
  @IsBoolean()
  anxietyTriggered!: boolean;

  @ApiProperty({ enum: ['SILENT', 'GENTLE', 'ACTIVE'] })
  @IsString()
  proactivityGate!: 'SILENT' | 'GENTLE' | 'ACTIVE';

  @ApiProperty()
  @IsString()
  voiceToneModifier!: string;

  @ApiProperty({ type: EmotionalAudioProsodyClientDto })
  @ValidateNested()
  @Type(() => EmotionalAudioProsodyClientDto)
  audioProsody!: EmotionalAudioProsodyClientDto;

  @ApiProperty({ type: EmotionalAmbienceSignalsClientDto })
  @ValidateNested()
  @Type(() => EmotionalAmbienceSignalsClientDto)
  ambienceSignals!: EmotionalAmbienceSignalsClientDto;

  @ApiPropertyOptional({ type: [SharedMilestoneAnchorClientDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SharedMilestoneAnchorClientDto)
  sharedMilestones?: SharedMilestoneAnchorClientDto[];
}
