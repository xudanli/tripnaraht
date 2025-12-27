// src/route-directions/dto/route-direction-interaction.dto.ts
/**
 * RouteDirection 前端交互 DTO
 * 
 * PART 1.2: RouteDirection 前端交互
 * 
 * 用户流程：
 * 1. 用户输入目的地 + 月份 + 偏好
 * 2. 系统先不出行程，而是展示路线方向卡片
 * 3. 用户切换卡片 → 行程实时重算
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteDirectionCardDto } from './route-direction-card.dto';
import { ScoreBreakdown } from '../interfaces/route-direction-explanation.interface';

/**
 * 路线方向交互响应
 */
export class RouteDirectionInteractionDto {
  @ApiProperty({ 
    description: '路线方向卡片',
    type: RouteDirectionCardDto
  })
  direction!: RouteDirectionCardDto;

  @ApiProperty({ 
    description: '匹配分数（0-100）',
    example: 85.5
  })
  score!: number;

  @ApiProperty({ 
    description: '分数分解',
    type: Object
  })
  scoreBreakdown!: ScoreBreakdown;

  @ApiProperty({ 
    description: '推荐解释（为什么推荐这条路线）',
    example: '这条路线完美匹配您的偏好：摄影、自然探索，且当前月份为最佳旅行时间。'
  })
  explanation!: string;

  @ApiPropertyOptional({ 
    description: '为什么没有选择其他路线',
    type: Object
  })
  whyNotOthers?: {
    topAlternative?: {
      routeDirectionId: number;
      routeDirectionName: string;
      whyNot: string;
      scoreDifference: number;
    };
    commonReasons?: string[];
  };
}

/**
 * 路线方向列表交互响应
 */
export class RouteDirectionInteractionListDto {
  @ApiProperty({ 
    description: '路线方向列表',
    type: [RouteDirectionInteractionDto]
  })
  directions!: RouteDirectionInteractionDto[];

  @ApiProperty({ 
    description: '国家代码',
    example: 'IS'
  })
  countryCode!: string;

  @ApiPropertyOptional({ 
    description: '当前月份',
    example: 7
  })
  month?: number;

  @ApiProperty({ 
    description: '用户偏好',
    type: [String],
    example: ['photography', 'nature']
  })
  preferences!: string[];
}

