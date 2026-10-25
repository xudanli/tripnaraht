import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TripRunBehaviorDto {
  @ApiPropertyOptional({ description: '是否点击了推荐' })
  @IsOptional()
  @IsBoolean()
  clickedRecommend?: boolean;

  @ApiPropertyOptional({ description: '是否重新生成' })
  @IsOptional()
  @IsBoolean()
  regenerated?: boolean;

  @ApiPropertyOptional({ description: '是否手动改路线' })
  @IsOptional()
  @IsBoolean()
  editedRoute?: boolean;

  @ApiPropertyOptional({ description: '是否放弃本轮建议' })
  @IsOptional()
  @IsBoolean()
  abandoned?: boolean;
}

export class RecordTripRunFeedbackDto {
  @ApiPropertyOptional({
    description:
      'M1 Outcome 强信号：accept|edit|reject|regenerate|abandon|delete_day|bypass_ai（优先于星级）',
    enum: ['accept', 'edit', 'reject', 'regenerate', 'abandon', 'delete_day', 'bypass_ai'],
  })
  @IsOptional()
  @IsIn(['accept', 'edit', 'reject', 'regenerate', 'abandon', 'delete_day', 'bypass_ai'])
  outcomeEvent?: 'accept' | 'edit' | 'reject' | 'regenerate' | 'abandon' | 'delete_day' | 'bypass_ai';

  @ApiPropertyOptional({ description: 'outcome 附加说明，如删除了哪一天' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  outcomeDetail?: string;

  @ApiPropertyOptional({ description: 'delete_day 时的日序' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dayIndex?: number;

  @ApiPropertyOptional({ description: '1-5 星评分', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: '是否接受 Agent 方案' })
  @IsOptional()
  @IsBoolean()
  accepted?: boolean;

  @ApiPropertyOptional({ description: '是否修改了方案' })
  @IsOptional()
  @IsBoolean()
  modified?: boolean;

  @ApiPropertyOptional({ description: '用户纠正内容' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  userCorrection?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: TripRunBehaviorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripRunBehaviorDto)
  behavior?: TripRunBehaviorDto;

  @ApiPropertyOptional({ description: '来源标识，如 mobile / admin / rlhf' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @ApiPropertyOptional({ description: '透传 RLHF decision_point_id（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  decisionPointId?: string;

  @ApiPropertyOptional({ description: '附加上下文' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
