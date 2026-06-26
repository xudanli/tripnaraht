import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RunDecisionLearningDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loopRunId?: string;

  @ApiPropertyOptional({ description: '最多物化最近 N 条 loop run' })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: '物化后抽样 replay（最多 3 条）' })
  @IsOptional()
  @IsBoolean()
  runReplay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}
