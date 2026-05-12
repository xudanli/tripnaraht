// src/agent/dto/router-output.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';

/**
 * Budget DTO for Swagger
 */
export class BudgetDto {
  @ApiProperty({ description: '最大执行时间（秒）', example: 60 })
  max_seconds!: number;

  @ApiProperty({ description: '最大执行步数', example: 8 })
  max_steps!: number;

  @ApiProperty({ description: '最大浏览器操作步数', example: 12 })
  max_browser_steps!: number;
}

/**
 * UI Hint DTO for Swagger
 */
export class UIHintDto {
  @ApiProperty({ description: '模式', enum: ['fast', 'slow'], example: 'fast' })
  mode!: 'fast' | 'slow';

  @ApiProperty({ 
    description: '状态', 
    enum: UIStatus,
    example: UIStatus.DONE,
  })
  status!: UIStatus;

  @ApiProperty({ description: '提示消息', example: '查询完成' })
  message!: string;
}

/**
 * Router Output DTO for Swagger
 */
export class RouterOutputDto {
  @ApiProperty({ 
    description: '路由类型',
    enum: RouteType,
    example: RouteType.SYSTEM1_RAG,
  })
  route!: RouteType;

  @ApiPropertyOptional({
    description:
      '路径标签（与 `route` 对照）：如 FAST≈System1、DEEP≈System2；可由路由 LLM 下发，缺失时由响应组装层按 `route` 推导',
    example: 'DEEP',
  })
  selected_path?: string;

  @ApiProperty({ description: '置信度（0-1）', example: 0.85 })
  confidence!: number;

  @ApiProperty({ 
    description: '路由原因',
    type: [String],
    enum: RouterReason,
    example: [RouterReason.MULTI_CONSTRAINT],
  })
  reasons!: RouterReason[];

  @ApiProperty({ 
    description: '所需能力',
    type: [String],
    example: ['places', 'transport'],
  })
  required_capabilities!: string[];

  @ApiProperty({ description: '是否需要用户授权', example: false })
  consent_required!: boolean;

  @ApiProperty({ description: '执行预算', type: BudgetDto })
  budget!: BudgetDto;

  @ApiProperty({ description: 'UI 提示信息', type: UIHintDto })
  ui_hint!: UIHintDto;
}

