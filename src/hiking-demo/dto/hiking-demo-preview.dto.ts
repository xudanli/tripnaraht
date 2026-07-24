import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HikingDemoPreviewQueryDto {
  @ApiPropertyOptional({
    description: '最长单日徒步距离问卷档位 0–4（与 v1/fitness 问卷一致）',
    minimum: 0,
    maximum: 4,
    example: 2,
  })
  longestHike?: number;

  @ApiPropertyOptional({
    description: '若 DEM 实时计算失败，是否使用 docs/DEMO_LAUGAVEGUR.json 兜底剖面',
    default: true,
  })
  useCachedProfileFallback?: boolean;
}

export type HikingDemoComputeStepDto = {
  id: string;
  labelZh: string;
  labelEn: string;
  service: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  summary?: string;
};

export class TrailPlanPreviewBodyDto {
  @ApiProperty({ example: 'IS_LAUGAVEGUR' })
  routeDirectionName!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 4, example: 2 })
  longestHike?: number;

  @ApiPropertyOptional({ type: [Number], example: [] })
  placeIds?: number[];
}
