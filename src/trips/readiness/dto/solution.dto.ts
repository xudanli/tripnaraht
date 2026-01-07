// src/trips/readiness/dto/solution.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 解决方案变更信息
 */
export class SolutionChangesDto {
  @ApiPropertyOptional({
    description: '时间变化',
    example: '+30min',
  })
  time?: string;

  @ApiPropertyOptional({
    description: '距离变化',
    example: '+12km',
  })
  distance?: string;

  @ApiPropertyOptional({
    description: '费用变化',
    example: '+¥500',
  })
  cost?: string;

  @ApiPropertyOptional({
    description: '风险变化',
    enum: ['increase', 'decrease', 'same'],
    example: 'decrease',
  })
  risk?: 'increase' | 'decrease' | 'same';
}

/**
 * 解决方案预览信息
 */
export class SolutionPreviewDto {
  @ApiPropertyOptional({
    description: '受影响的行程项ID列表',
    example: ['segment-f-1', 'segment-f-2'],
    type: [String],
  })
  affectedItems?: string[];

  @ApiPropertyOptional({
    description: '新计划预览',
    example: {},
  })
  newPlan?: any;
}

/**
 * 解决方案 DTO
 */
export class SolutionDto {
  @ApiProperty({ description: '方案ID', example: 'sol-1' })
  id!: string;

  @ApiProperty({ description: '方案标题', example: '替换为铺装路面路线' })
  title!: string;

  @ApiProperty({
    description: '方案描述',
    example: '将 F 段改为使用铺装路面，绕行距离增加 15km',
  })
  description!: string;

  @ApiProperty({
    description: '方案类型',
    enum: ['replace', 'adjust', 'alternative', 'manual'],
    example: 'alternative',
  })
  type!: 'replace' | 'adjust' | 'alternative' | 'manual';

  @ApiPropertyOptional({
    description: '预期变更',
    type: SolutionChangesDto,
  })
  changes?: SolutionChangesDto;

  @ApiPropertyOptional({
    description: '原因代码',
    example: 'ALTERNATIVE_ROUTE',
  })
  reasonCode?: string;

  @ApiPropertyOptional({
    description: '证据链接',
    example: 'https://example.com/evidence',
  })
  evidenceLink?: string;

  @ApiProperty({
    description: '是否可自动应用',
    example: true,
  })
  autoApplicable!: boolean;

  @ApiPropertyOptional({
    description: '预览数据（如果可自动应用）',
    type: SolutionPreviewDto,
  })
  preview?: SolutionPreviewDto;
}

/**
 * 获取阻塞项修复方案响应 DTO
 */
export class GetSolutionsResponseDto {
  @ApiProperty({ description: '阻塞项ID', example: 'blocker-f-4x4-vehicle' })
  blockerId!: string;

  @ApiProperty({
    description: '阻塞项消息',
    example: 'F - 公路段需租赁 4x4 车辆',
  })
  blockerMessage!: string;

  @ApiProperty({
    description: '解决方案列表',
    type: [SolutionDto],
  })
  solutions!: SolutionDto[];
}

