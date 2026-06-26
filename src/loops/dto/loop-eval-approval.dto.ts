import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewLoopEvalCaseDto {
  @ApiPropertyOptional({ description: '审批备注' })
  @IsOptional()
  @IsString()
  note?: string;
}
