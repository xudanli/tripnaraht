import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WISH_CATEGORIES,
  WISH_INPUT_MODES,
  WISH_VISIBILITIES,
  type WishCategory,
  type WishInputMode,
  type WishSourceRef,
  type WishStructuredHints,
  type WishVisibility,
} from '../types/trip-wish.types';

export class WishSourceRefDto implements WishSourceRef {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inspirationAssetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voiceTranscriptId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assistantSessionId?: string;
}

export class CreateTripWishDto {
  @ApiProperty({ enum: WISH_CATEGORIES })
  @IsIn([...WISH_CATEGORIES])
  category!: WishCategory;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  importance?: number;

  @ApiProperty({ enum: WISH_INPUT_MODES })
  @IsIn([...WISH_INPUT_MODES])
  inputMode!: WishInputMode;

  @ApiPropertyOptional({ enum: WISH_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn([...WISH_VISIBILITIES])
  visibility?: WishVisibility;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  agentEligible?: boolean;

  @ApiPropertyOptional({ type: WishSourceRefDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WishSourceRefDto)
  sourceRef?: WishSourceRefDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  structuredHints?: WishStructuredHints;
}

export class UpdateTripWishDto {
  @ApiPropertyOptional({ enum: WISH_CATEGORIES })
  @IsOptional()
  @IsIn([...WISH_CATEGORIES])
  category?: WishCategory;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  importance?: number;

  @ApiPropertyOptional({ enum: WISH_VISIBILITIES })
  @IsOptional()
  @IsIn([...WISH_VISIBILITIES])
  visibility?: WishVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  agentEligible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  structuredHints?: WishStructuredHints;
}

export class CreateWishFromInspirationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  inspirationAssetId!: string;

  @ApiPropertyOptional({ enum: WISH_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn([...WISH_VISIBILITIES])
  visibility?: WishVisibility;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  importance?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  textOverride?: string;
}

export class WishAssistantChatDto {
  @ApiProperty({ description: '用户问题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ description: '已有会话 ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '客户端携带的历史（最近若干轮）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  recentMessages?: string[];

  @ApiPropertyOptional({ default: 'zh-CN' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class ConvertAssistantToWishDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  aiMessageId!: string;

  @ApiPropertyOptional({ enum: WISH_CATEGORIES })
  @IsOptional()
  @IsIn([...WISH_CATEGORIES])
  category?: WishCategory;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  importance?: number;

  @ApiPropertyOptional({ enum: WISH_VISIBILITIES })
  @IsOptional()
  @IsIn([...WISH_VISIBILITIES])
  visibility?: WishVisibility;
}

export class CreateWishFromVoiceDto {
  @ApiProperty({ description: '转写会话 ID（来自 voice/transcribe）' })
  @IsString()
  @IsNotEmpty()
  voiceTranscriptId!: string;

  @ApiProperty({ maxLength: 2000, description: '用户确认或编辑后的文本' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({ enum: WISH_CATEGORIES })
  @IsOptional()
  @IsIn([...WISH_CATEGORIES])
  category?: WishCategory;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  importance?: number;

  @ApiPropertyOptional({ enum: WISH_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn([...WISH_VISIBILITIES])
  visibility?: WishVisibility;
}
