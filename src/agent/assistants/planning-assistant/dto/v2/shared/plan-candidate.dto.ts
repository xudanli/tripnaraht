// src/agent/assistants/planning-assistant/dto/v2/shared/plan-candidate.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 三人格评价DTO
 */
export class PersonaEvaluationDto {
  @ApiProperty({ description: '冒险者评价' })
  adventurer!: {
    score: number;
    comment: string;
    commentCN: string;
  };

  @ApiProperty({ description: '规划者评价' })
  planner!: {
    score: number;
    comment: string;
    commentCN: string;
  };

  @ApiProperty({ description: '放松者评价' })
  relaxer!: {
    score: number;
    comment: string;
    commentCN: string;
  };
}

/**
 * 方案候选DTO（共享类型）
 */
export class PlanCandidateDto {
  @ApiProperty({ description: '方案ID' })
  id!: string;

  @ApiProperty({ description: '方案名称（英文）' })
  name!: string;

  @ApiProperty({ description: '方案名称（中文）' })
  nameCN!: string;

  @ApiProperty({ description: '方案描述（英文）' })
  description!: string;

  @ApiProperty({ description: '方案描述（中文）' })
  descriptionCN!: string;

  @ApiProperty({ description: '目的地' })
  destination!: string;

  @ApiProperty({ description: '天数' })
  duration!: number;

  @ApiProperty({ description: '亮点', type: [String] })
  highlights!: string[];

  @ApiProperty({ description: '预估预算' })
  estimatedBudget!: {
    total: number;
    breakdown: {
      flight: number;
      accommodation: number;
      activities: number;
      food: number;
      other: number;
    };
    currency: string;
  };

  @ApiProperty({ description: '节奏', enum: ['relaxed', 'moderate', 'intensive'] })
  pace!: 'relaxed' | 'moderate' | 'intensive';

  @ApiProperty({ description: '适合度' })
  suitability!: {
    score: number;
    reasons: string[];
  };

  @ApiPropertyOptional({ description: '三人格评价' })
  personas?: PersonaEvaluationDto;

  @ApiPropertyOptional({ description: 'AI解释（AI增强）' })
  explanation?: {
    whyRecommended: string;
    whyRecommendedCN: string;
    strengths: string[];
    strengthsCN: string[];
    considerations: string[];
    considerationsCN: string[];
  };

  @ApiPropertyOptional({ description: '优化建议（AI增强）' })
  optimizationTips?: {
    tip: string;
    tipCN: string;
    impact: 'low' | 'medium' | 'high';
  }[];

  @ApiPropertyOptional({ description: '警告', type: [String] })
  warnings?: string[];
}
