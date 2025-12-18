// src/agent/dto/route-and-run.dto.ts
import { IsString, IsOptional, IsObject, IsBoolean, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouterOutputDto } from './router-output.dto';

export class ConversationContextDto {
  @ApiPropertyOptional({ 
    description: '最近的对话消息历史',
    type: [String],
    example: ['用户: 推荐新宿拉面', '助手: 我为您推荐...'],
  })
  @IsOptional()
  recent_messages?: string[];

  @ApiPropertyOptional({ 
    description: '用户语言环境',
    example: 'zh-CN',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ 
    description: '用户时区',
    example: 'Asia/Tokyo',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class AgentOptionsDto {
  @ApiPropertyOptional({ 
    description: '是否仅执行 dry-run（不实际执行操作）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @ApiPropertyOptional({ 
    description: '是否允许使用浏览器（需要用户授权）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allow_webbrowse?: boolean;

  @ApiPropertyOptional({ 
    description: 'System 2 最大执行时间（秒）',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsNumber()
  max_seconds?: number;

  @ApiPropertyOptional({ 
    description: 'System 2 最大执行步数',
    example: 8,
    default: 8,
  })
  @IsOptional()
  @IsNumber()
  max_steps?: number;

  @ApiPropertyOptional({ 
    description: '浏览器操作最大步数',
    example: 12,
    default: 12,
  })
  @IsOptional()
  @IsNumber()
  max_browser_steps?: number;

  @ApiPropertyOptional({ 
    description: '成本预算（美元）',
    example: 0.1,
  })
  @IsOptional()
  @IsNumber()
  cost_budget_usd?: number;
}

export class RouteAndRunRequestDto {
  @ApiProperty({ 
    description: '请求唯一标识符',
    example: 'req-001',
  })
  @IsString()
  request_id!: string;

  @ApiProperty({ 
    description: '用户 ID',
    example: 'user-123',
  })
  @IsString()
  user_id!: string;

  @ApiPropertyOptional({ 
    description: '关联的行程 ID（可选）',
    example: 'trip-456',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  trip_id?: string | null;

  @ApiProperty({ 
    description: '用户输入消息',
    example: '推荐新宿拉面',
  })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ 
    description: '对话上下文',
    type: ConversationContextDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationContextDto)
  conversation_context?: ConversationContextDto;

  @ApiPropertyOptional({ 
    description: '智能体执行选项',
    type: AgentOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentOptionsDto)
  options?: AgentOptionsDto;
}

export class RouteAndRunResponseDto {
  @ApiProperty({ 
    description: '请求 ID（与请求中的 request_id 相同）',
    example: 'req-001',
  })
  request_id!: string;

  @ApiProperty({ 
    description: '路由决策信息',
    type: RouterOutputDto,
  })
  route!: RouterOutputDto;

  @ApiProperty({ 
    description: '执行结果',
    example: {
      status: 'OK',
      answer_text: '我为您推荐以下新宿拉面店...',
      payload: {
        timeline: [],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
      },
    },
  })
  result!: {
    status: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT';
    answer_text: string;
    payload: {
      timeline: any[];
      dropped_items: any[];
      candidates: any[];
      evidence: any[];
      robustness: any;
    };
  };

  @ApiProperty({ 
    description: '决策解释（决策日志）',
    example: {
      decision_log: [
        {
          step: 0,
          chosen_action: 'places.resolve_entities',
          reason_code: 'MISSING_POI_FACTS',
          facts: {},
          policy_id: 'FACTS_FIRST',
        },
      ],
    },
  })
  explain!: {
    decision_log: any[];
  };

  @ApiProperty({ 
    description: '可观测性指标',
    example: {
      latency_ms: 190,
      router_ms: 2,
      system_mode: 'SYSTEM1',
      tool_calls: 1,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0.0,
      fallback_used: false,
    },
  })
  observability!: {
    latency_ms: number;
    router_ms: number;
    system_mode: 'SYSTEM1' | 'SYSTEM2';
    tool_calls: number;
    browser_steps: number;
    tokens_est: number;
    cost_est_usd: number;
    fallback_used: boolean;
  };
}

