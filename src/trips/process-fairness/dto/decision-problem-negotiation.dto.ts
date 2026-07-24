import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { StartDecisionProblemNegotiationBody } from '../types/decision-problem-negotiation.types';

export class StartDecisionProblemNegotiationDto implements StartDecisionProblemNegotiationBody {
  @ApiPropertyOptional({ description: '决策检查器焦点冲突 ID（与 evidence 投影一致）' })
  @IsOptional()
  @IsString()
  focusConflictId?: string;

  @ApiPropertyOptional({ description: '发起人当前倾向方案 ID' })
  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @ApiPropertyOptional({ description: '发起说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: '讨论截止 ISO8601' })
  @IsOptional()
  @IsString()
  closesAt?: string;

  @ApiPropertyOptional({
    description: '中/高交叉领域未认领时自动为发起人认领',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoClaimDomain?: boolean;
}
