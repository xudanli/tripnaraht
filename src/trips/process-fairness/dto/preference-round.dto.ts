import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WISH_CATEGORIES, type WishCategory } from '../../wishlist/types/trip-wish.types';
import {
  DECISION_NODES,
  type DecisionNode,
  UTTERANCE_MODALITIES,
  type UtteranceModality,
} from '../types/preference-round.types';

export class CreatePreferenceRoundDto {
  @ApiProperty({ enum: DECISION_NODES, description: '关键决策节点' })
  @IsEnum(DECISION_NODES)
  decisionNode!: DecisionNode;

  @ApiPropertyOptional({
    description: '协作任务领域（与 decisionNode 默认映射不一致时使用，如 dining）',
    enum: WISH_CATEGORIES,
  })
  @IsOptional()
  @IsEnum(WISH_CATEGORIES)
  domain?: WishCategory;

  @ApiPropertyOptional({ description: '自定义发言顺序（默认随机）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  turnOrder?: string[];

  @ApiPropertyOptional({ description: '讨论截止 ISO8601；默认 2 小时' })
  @IsOptional()
  @IsString()
  closesAt?: string;
}

export class SubmitUtteranceDto {
  @ApiProperty({ enum: UTTERANCE_MODALITIES, default: 'text' })
  @IsEnum(UTTERANCE_MODALITIES)
  modality!: UtteranceModality;

  @ApiProperty({ description: '偏好内容（文字、语音 URL、图片 URL 等）' })
  @IsString()
  @MaxLength(8000)
  content!: string;

  @ApiPropertyOptional({ description: '理由说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({ description: '是否通过 AI 代述（F3.3）' })
  @IsOptional()
  @IsBoolean()
  viaProxy?: boolean;
}

export class HeardVoteItemDto {
  @ApiProperty()
  @IsString()
  targetUserId!: string;

  @ApiProperty({ description: '是否感到对方被充分听取' })
  @IsBoolean()
  heard!: boolean;
}

export class SubmitHeardVotesDto {
  @ApiProperty({ type: [HeardVoteItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeardVoteItemDto)
  votes!: HeardVoteItemDto[];
}
