import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeasibilityApplyRepairBodyDto } from '../../trips/trip-constraint-solver/dto/feasibility-report.dto';

export class StartReadinessRepairLoopDto {
  @ApiPropertyOptional({ description: '触发本 loop 的事件 ID（Travel Event Store）' })
  @IsOptional()
  @IsString()
  triggerEventId?: string;

  @ApiPropertyOptional({ description: '运行前是否刷新证据并 validate（默认 true）' })
  @IsOptional()
  @IsBoolean()
  forceRefreshEvidence?: boolean;

  @ApiPropertyOptional({ description: '是否运行 Monte Carlo 评估' })
  @IsOptional()
  @IsBoolean()
  runMonteCarlo?: boolean;
}

export class ApplyLoopPatchesDto {
  @ApiProperty({
    description: '待应用的修复 patch 列表（通常来自 recommendedPatches）',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        optionId: { type: 'string' },
      },
    },
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoopPatchItemDto)
  patches!: LoopPatchItemDto[];
}

export class LoopPatchItemDto extends FeasibilityApplyRepairBodyDto {
  @ApiProperty({ description: 'feasibility issue id' })
  @IsString()
  issueId!: string;
}
