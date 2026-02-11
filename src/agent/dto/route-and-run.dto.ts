// src/agent/dto/route-and-run.dto.ts
import { IsString, IsOptional, IsObject, IsBoolean, IsNumber, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouterOutputDto } from './router-output.dto';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { ItineraryDay, DecisionLogEntry, OrchestratorState, Itinerary, GateResult, ItineraryItem, EvidenceRef, SimplifiedExplanation, AICapabilityDisplay } from '../interfaces/trip-plan.interface';
import { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import { ErrorType } from '../interfaces/error-types.interface';
import { ClarificationQuestion } from '../interfaces/clarification.interface';

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

  @ApiPropertyOptional({ 
    description: 'LLM 提供商（auto/openai/deepseek/gemini/anthropic），auto 表示使用系统推荐的模型',
    example: 'auto',
    enum: ['auto', 'openai', 'deepseek', 'gemini', 'anthropic'],
    default: 'auto',
  })
  @IsOptional()
  @IsEnum(['auto', 'openai', 'deepseek', 'gemini', 'anthropic'])
  llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';

  @ApiPropertyOptional({ 
    description: '是否使用 Claude 编排（Feature Flag）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  use_claude_orchestration?: boolean;

  @ApiPropertyOptional({ 
    description: '是否使用状态机编排（默认 true，仅在 use_claude_orchestration=true 时生效）',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  use_state_machine_orchestration?: boolean;

  @ApiPropertyOptional({ 
    description: '入口来源标识（用于权限控制和操作限制）',
    example: 'trip_detail_page',
    enum: ['trip_detail_page', 'trip_list_page', 'dashboard', 'planning_workbench'],
  })
  @IsOptional()
  @IsEnum(['trip_detail_page', 'trip_list_page', 'dashboard', 'planning_workbench'])
  entry_point?: 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench';

  @ApiPropertyOptional({ 
    description: '只读模式标志（true 时限制为查询类操作）',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly_mode?: boolean;
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

  @ApiPropertyOptional({ 
    description: '关联的路线方向 ID（可选，用于护城河扩展的失败风险预测）',
    example: 'route-dir-789',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  route_direction_id?: string | null;

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

  @ApiPropertyOptional({ 
    description: 'UI 状态（P1 改进：状态机步骤到 UI 状态的映射，用于前端加载状态显示）',
    example: {
      phase: 'GATE_EVAL',
      ui_status: 'verifying',
      progress_percent: 37.5,
      message: '正在评估行程可行性...',
      requires_user_action: false,
      estimated_time_remaining_ms: 15000,
      current_step_detail: '评估路线安全性、可达性和可行性（三人格评审）',
    },
  })
  ui_state?: {
    /** 当前状态机步骤（10步完整流程） */
    phase: 'INTAKE' | 'RESEARCH' | 'GATE_EVAL' | 'PLAN_GEN' | 'VERIFY' | 'COMPLIANCE' | 'REPAIR' | 'NARRATE' | 'FEEDBACK' | 'DONE' | 'FAILED' | 'TIMEOUT' | 'HALLUCINATION_DETECTION';
    /** UI 状态（映射自状态机步骤） */
    ui_status: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 'awaiting_consent' | 'awaiting_confirmation' | 'done' | 'failed';
    /** 进度百分比（0-100） */
    progress_percent?: number;
    /** 用户友好的消息 */
    message?: string;
    /** 是否需要用户操作 */
    requires_user_action?: boolean;
    /** 🆕 预计剩余时间（毫秒） */
    estimated_time_remaining_ms?: number;
    /** 🆕 当前步骤详细说明 */
    current_step_detail?: string;
  };

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
        orchestrationResult: {
          state: {
            request_id: 'req-001',
            current_step: 'DONE',
            itinerary: {
              request_id: 'req-001',
              days: [],
            },
            gate_result: {
              gate_result: 'ALLOW',
              violations: [],
              required_adjustments: [],
              confidence: 0.8,
              evidence_refs: [],
            },
            narration: {
              user_friendly_summary: '已为您生成行程安排',
              day_by_day_narrative: [],
              highlights: [],
              tips: [],
            },
            decision_log: [],
          },
        },
      },
    },
  })
  result!: {
    status: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT' | 'REDIRECT_REQUIRED';
    answer_text: string;
    payload: {
      timeline: ItineraryDay[];
      dropped_items: ItineraryItem[];
      candidates: any[]; // TODO: 定义明确的 Candidate 类型
      evidence: EvidenceRef[];
      robustness: number | null;
      orchestrationResult?: {
        state?: OrchestratorState;
        itinerary?: Itinerary;
        gate_result?: GateResult;
        decision_log?: DecisionLogEntry[];
      };
      // 重定向信息（仅在 REDIRECT_REQUIRED 时存在）
      redirectInfo?: {
        redirect_to: string;
        redirect_reason: 'READONLY_MODE_RESTRICTION' | 'PLANNING_REQUEST_DETECTED' | 'INSUFFICIENT_PERMISSIONS' | 'FEATURE_MIGRATED' | 'MISSING_TRIP_ID';
        original_request: {
          message: string; // 已脱敏，最多 200 字符
          user_id: string;
          trip_id?: string;
        };
      };
      // 澄清消息相关字段（仅在 NEED_MORE_INFO 且需要澄清时存在）
      needsUserConfirmation?: boolean;
      clarificationMessage?: string; // 向后兼容：简单字符串格式
      clarificationQuestions?: ClarificationQuestion[]; // 新增：结构化问题数组
      missingServices?: string[];
      solutions?: string[];
      errorType?: ErrorType;
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
      simplified_explanation: {
        summary: '行程已通过，进行了3项关键检查',
        key_decisions: [
          { step: 'GATE_EVAL', decision: '已通过', impact: 'HIGH' },
        ],
        evidence_count: 5,
        has_details: true,
      },
    },
  })
  explain!: {
    decision_log: DecisionLogEntry[];
    simplified_explanation?: SimplifiedExplanation; // 🆕 简化版解释（减少认知负荷）
    ai_capability_display?: AICapabilityDisplay; // 🆕 AI能力展示（信任建立机制）
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
      trace: {
        orchestration: {
          mode: 'LEGACY',
          reason: 'Claude orchestration disabled',
          flags: {},
        },
        timestamp: '2024-01-13T10:00:00.000Z',
      },
    },
  })
  observability!: {
    latency_ms: number;
    router_ms: number;
    system_mode: 'SYSTEM1' | 'SYSTEM2' | 'REDIRECT';
    tool_calls: number;
    browser_steps: number;
    tokens_est: number;
    cost_est_usd: number;
    fallback_used: boolean;
    trace?: {
      orchestration: {
        // 实际执行的路径（强制，不可变）
        resolved: {
          mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
          reason: string;
          matchedRules: string[];
        };
        // 建议（不影响执行，可选）
        recommended?: {
          useStateMachine?: boolean;
          enableAudit?: boolean;
          requireConsent?: boolean;
          reason?: string;
        };
        // 路由信号
        signals?: {
          taskType: string;
          risk: string;
          complexity: string;
          needsAudit: boolean;
          requiresStructuredOutput: boolean;
          expectsToolCalls: boolean;
          legacyWellSupported: boolean;
          latencyBudgetMs: number;
        };
        // 标志位
        flags?: {
          env?: Record<string, any>;
          options?: Record<string, any>;
          derived?: Record<string, any>;
        };
      };
      timestamp: string;
      // 结构化日志字段（固定化，用于打点/聚合）
      orchestration_mode?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
      orchestration_recommended_sm?: boolean;
      risk?: string;
      task_type?: string;
      requires_consent?: boolean;
      max_seconds?: number;
      latency_budget_ms?: number;
      // 执行步骤（可选）
      steps?: Array<{
        step_id: string;
        step_name: string;
        skill_name?: string;
        action_name?: string;
        success: boolean;
        duration_ms: number;
        evidence_refs?: string[];
      }>;
      // 证据（可选）
      evidence?: Array<{
        evidence_id: string;
        source: string;
        type: string;
        timestamp: string;
      }>;
    };
  };
}

