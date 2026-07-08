import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ItemType } from '../../../itinerary-items/dto/create-itinerary-item.dto';
import { PlanProposalCommitModeDto } from './plan-proposal.dto';

export class PlaceAttractionExploreCandidateDto extends PlanProposalCommitModeDto {
  @ApiProperty({ description: '1-based 行程日序号（与 UI Day 1 对齐）', example: 3 })
  @IsInt()
  @Min(1)
  dayIndex!: number;

  @ApiPropertyOptional({ description: 'HH:mm', example: '10:30' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @ApiPropertyOptional({ description: 'HH:mm', example: '12:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @ApiPropertyOptional({ enum: ['append', 'before', 'after'], default: 'append' })
  @IsOptional()
  @IsIn(['append', 'before', 'after'])
  insertMode?: 'append' | 'before' | 'after';

  @ApiPropertyOptional({ description: 'insertMode=before|after 时必填' })
  @IsOptional()
  @IsString()
  anchorItemId?: string;

  @ApiPropertyOptional({ description: '放置后是否从候选清单移除', default: true })
  @IsOptional()
  removeFromCandidates?: boolean;
}

export class ArrangeItineraryItemDto extends PlanProposalCommitModeDto {
  @ApiProperty({ description: '1-based 行程日序号', example: 2 })
  @IsInt()
  @Min(1)
  dayIndex!: number;

  @ApiProperty({ enum: ItemType, example: ItemType.ACTIVITY })
  @IsEnum(ItemType)
  type!: ItemType;

  @ApiProperty({ description: 'HH:mm', example: '10:30' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({ description: 'HH:mm', example: '12:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  placeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeName?: string;

  @ApiPropertyOptional({ enum: ['append', 'before', 'after'], default: 'append' })
  @IsOptional()
  @IsIn(['append', 'before', 'after'])
  insertMode?: 'append' | 'before' | 'after';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  anchorItemId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  forceCreate?: boolean;
}

export class ArrangeItineraryGapDto extends PlanProposalCommitModeDto {
  @ApiProperty({ description: '1-based 行程日序号', example: 2 })
  @IsInt()
  @Min(1)
  dayIndex!: number;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({ example: '15:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @ApiPropertyOptional({ example: '休息 / 咖啡' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

export class AttractionExploreAiActionDto extends PlanProposalCommitModeDto {
  @ApiProperty({
    enum: ['fill_gaps', 'optimize_route', 'arrange_lunch', 'reduce_intensity'],
  })
  @IsIn(['fill_gaps', 'optimize_route', 'arrange_lunch', 'reduce_intensity'])
  action!: 'fill_gaps' | 'optimize_route' | 'arrange_lunch' | 'reduce_intensity';

  @ApiPropertyOptional({ description: '1-based 目标日（arrange_lunch 等）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayIndex?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  candidateIds?: string[];
}
