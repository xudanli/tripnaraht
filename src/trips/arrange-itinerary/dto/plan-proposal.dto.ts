import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import type { PlanningIntent } from '../types/plan-proposal.types';

export class PlanProposalCommitModeDto {
  @ApiPropertyOptional({
    enum: ['proposal', 'direct'],
    default: 'proposal',
    description: 'proposal=生成草案待确认；direct=兼容旧行为直接写入',
  })
  @IsOptional()
  @IsIn(['proposal', 'direct'])
  commitMode?: 'proposal' | 'direct';
}

export class CreatePlanProposalDto {
  @ApiProperty({
    enum: [
      'PLACE_CANDIDATE',
      'ADD_ITEM',
      'INSERT_REST_GAP',
      'AUTO_ARRANGE',
      'FILL_GAP',
      'OPTIMIZE_ROUTE',
      'ARRANGE_LUNCH',
      'REDUCE_INTENSITY',
    ],
  })
  @IsIn([
    'PLACE_CANDIDATE',
    'ADD_ITEM',
    'INSERT_REST_GAP',
    'AUTO_ARRANGE',
    'FILL_GAP',
    'OPTIMIZE_ROUTE',
    'ARRANGE_LUNCH',
    'REDUCE_INTENSITY',
  ])
  intent!: PlanningIntent;

  @ApiProperty({ description: '与 intent 对应的请求体' })
  payload!: Record<string, unknown>;
}

export class ApplyPlanProposalDto {
  @ApiPropertyOptional({ description: '客户端持有的 contextVersion，用于过期检测' })
  @IsOptional()
  @IsInt()
  contextVersion?: number;

  @ApiPropertyOptional({ description: '强制应用（忽略 WARN）', default: false })
  @IsOptional()
  force?: boolean;
}

export class UpdatePlanningModeDto {
  @ApiProperty({ enum: ['manual', 'copilot'] })
  @IsIn(['manual', 'copilot'])
  mode!: 'manual' | 'copilot';
}

export class AnalyzeItineraryItemMoveDto extends PlanProposalCommitModeDto {
  @ApiProperty({ description: '1-based 目标日', example: 2 })
  @IsInt()
  @Min(1)
  dayIndex!: number;

  @ApiProperty({ example: '15:30' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;
}

export class CopilotActionDto {
  @ApiProperty({
    enum: ['draft_for_candidate', 'draft_all_must_go', 'fill_gaps', 'execute_suggestion'],
  })
  @IsIn(['draft_for_candidate', 'draft_all_must_go', 'fill_gaps', 'execute_suggestion'])
  action!:
    | 'draft_for_candidate'
    | 'draft_all_must_go'
    | 'fill_gaps'
    | 'execute_suggestion';

  @ApiPropertyOptional({ description: 'draft_for_candidate 时必填' })
  @IsOptional()
  @IsString()
  candidateId?: string;

  @ApiPropertyOptional({ description: 'execute_suggestion 时必填' })
  @IsOptional()
  @IsString()
  suggestionId?: string;

  @ApiPropertyOptional({ description: '1-based 目标日' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayIndex?: number;
}
