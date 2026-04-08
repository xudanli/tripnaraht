// src/agent/dto/route-and-run.dto.ts
import { IsString, IsOptional, IsBoolean, IsNumber, ValidateNested, IsEnum, IsNotEmpty, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouterOutputDto } from './router-output.dto';
import { ItineraryDay, DecisionLogEntry, OrchestratorState, Itinerary, GateResult, ItineraryItem, EvidenceRef, SimplifiedExplanation, AICapabilityDisplay, OrchestrationStep, JepaPayload } from '../interfaces/trip-plan.interface';
import { ErrorType } from '../interfaces/error-types.interface';
import { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { TravelActionType } from '../constants/action-execution.constants';

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
    enum: ['auto', 'openai', 'deepseek', 'gemini', 'anthropic', 'vllm'],
    default: 'auto',
  })
  @IsOptional()
  @IsEnum(['auto', 'openai', 'deepseek', 'gemini', 'anthropic', 'vllm'])
  llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic' | 'vllm';

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
    description: 'Fallback 策略提示（POI 缺失时优先使用）',
    example: 'CLASSIC',
    enum: ['CITY_WALK', 'CLASSIC', 'HOT_SPOTS', 'BALANCED'],
  })
  @IsOptional()
  @IsEnum(['CITY_WALK', 'CLASSIC', 'HOT_SPOTS', 'BALANCED'])
  fallback_strategy?: 'CITY_WALK' | 'CLASSIC' | 'HOT_SPOTS' | 'BALANCED' | 'ROAD_TRIP';

  @ApiPropertyOptional({
    description: '是否返回 fallback 的候选打分明细（调试用途）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  show_debug_scores?: boolean;

  @ApiPropertyOptional({
    description: '是否返回 fallback 通勤矩阵（调试用途）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  show_commute_matrix?: boolean;

  @ApiPropertyOptional({
    description: '是否强制要求命中 POI 数据（true 时 POI 为空直接澄清，不走 fallback）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  require_poi_data?: boolean;

  @ApiPropertyOptional({
    description: '允许带缺口继续执行（先出草案，再补澄清）',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allow_partial?: boolean;

  @ApiPropertyOptional({
    description: 'POI 策略：strict=必须命中，fallback=可降级，explore=自动探索',
    example: 'fallback',
    enum: ['strict', 'fallback', 'explore'],
    default: 'fallback',
  })
  @IsOptional()
  @IsEnum(['strict', 'fallback', 'explore'])
  poi_policy?: 'strict' | 'fallback' | 'explore';

  @ApiPropertyOptional({
    description: 'POI 数据来源偏好',
    example: 'vector',
    enum: ['vector', 'google', 'foursquare', 'auto'],
    default: 'auto',
  })
  @IsOptional()
  @IsEnum(['vector', 'google', 'foursquare', 'auto'])
  poi_source?: 'vector' | 'google' | 'foursquare' | 'auto';

  @ApiPropertyOptional({
    description: '是否在结果中返回 POI trace 调试信息',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  show_poi_trace?: boolean;

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

  @ApiPropertyOptional({
    description: 'Action 执行模式（建议/半自动/自动）',
    example: 'SEMI_AUTO',
    enum: ['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'],
    default: 'ADVICE_ONLY',
  })
  @IsOptional()
  @IsEnum(['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'])
  execution_mode?: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';
}

export class RouteAndRunRequestDto {
  @ApiProperty({ 
    description: '请求唯一标识符',
    example: 'req-001',
  })
  @IsString()
  request_id!: string;

  @ApiProperty({ 
    description: '用户 ID（战略收敛：全局强制字段，不允许空；匿名用户请传 "anonymous"）',
    example: 'user-123',
  })
  @IsNotEmpty({ message: 'user_id 是必需字段，缺失将导致个性化能力不可用。匿名用户请传 "anonymous"' })
  @IsString()
  @MinLength(1, { message: 'user_id 不能为空字符串' })
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
    phase: OrchestrationStep;
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
        jepa: {
          version: '1.0',
          latent_contract: {
            z_env: {
              terrain_risk: [null, null, null],
              weather_state: [null, null, null],
              accessibility: [null, null],
              temporal_factor: [null, null],
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            z_user: {
              risk_tolerance: 0.5,
              delay_sensitivity: null,
              fatigue_limit: 0.6,
              experience_level: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            z_state: {
              continuity: 0.9,
              risk_score: 0.5,
              cost: 0.2,
              fatigue: 0.3,
              satisfaction_estimate: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
          },
          predictor_outputs: {
            risk_head: { risk_increase_prob: 0.65 },
            continuity_head: { continuity_break_prob: 0.1 },
            fatigue_head: { fatigue_increase_prob: 0.3 },
            cost_head: { cost_overrun_prob: 0.2 },
          },
          decision_trace: {
            z_pred: {
              continuity: 0.88,
              risk_score: 0.65,
              cost: 0.23,
              fatigue: 0.33,
              satisfaction_estimate: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            z_real: {
              continuity: 0.9,
              risk_score: 0.5,
              cost: 0.2,
              fatigue: 0.3,
              satisfaction_estimate: null,
              missing_fields: [],
              fill_strategy: 'NULL',
            },
            delta: {
              continuity: 0.02,
              risk_score: -0.15,
              cost: -0.03,
              fatigue: -0.03,
              satisfaction_estimate: null,
            },
            at: '2026-01-13T10:00:00.000Z',
          },
          prediction_errors: {
            world_error: {
              magnitude: 0.15,
              details: ['pred_avg_risk=0.65', 'real_risk=0.50'],
            },
          },
          trigger_reasons: ['WEATHER_SPIKE', 'CONSTRAINT_CONFLICT'],
          arbitration: {
            selected_candidate_id: 'cand_2',
            rejected_count: 2,
            conflict_detected: true,
            fallback_used: false,
          },
          risk_trajectory: [
            { at: '2026-01-13T10:00:00.000Z', risk_score: 0.5, reason: 'route_difficulty' },
            { at: '2026-01-14T10:00:00.000Z', risk_score: 0.8, reason: 'weather' },
          ],
        },
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
        jepa?: JepaPayload;
      orchestrationResult?: {
        state?: OrchestratorState;
        itinerary?: Itinerary;
        gate_result?: GateResult;
        decision_log?: DecisionLogEntry[];
      };
      actionExecution?: {
        mode: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';
        status: 'NOT_STARTED' | 'PENDING_CONFIRM' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'ROLLED_BACK';
        requires_confirmation_count?: number;
        pendingActions?: Array<{
          action_id: string;
          action_type: TravelActionType;
          target_type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
          requires_confirmation: boolean;
          risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
        }>;
      };
      /** DSO 旅行本体子状态投影（与 Kernel STATE_UPDATE 对齐；无 Kernel 时由编排 state 推导） */
      travelOntologyState?: DecisionState['travelOntologyState'];
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
      fallbackPlan?: {
        type?: string;
        strategy?: string;
        name?: string;
        timeline?: Array<{
          time?: string;
          action?: string;
          type?: string;
        }>;
        confidence?: number;
        selected_pois?: string[];
        plan_score?: number;
        source_confidence?: number;
        pacing_mode?: 'normal' | 'conservative';
        buffer_minutes?: number;
        debug_scores?: Array<{
          slot: string;
          desiredType: string;
          poiName: string;
          typeScore: number;
          timeScore: number;
          ratingScore: number;
          affordabilityScore: number;
          nameHintScore: number;
          commuteDistanceKm?: number;
          commuteMinutes?: number;
          commutePenalty?: number;
          timeWindowPenalty?: number;
          totalScore: number;
        }>;
        commute_matrix?: {
          mode?: 'walk' | 'drive' | 'transit' | 'mixed';
          from_start?: boolean;
          nodes?: string[];
          minutes?: number[][];
        };
      };
      fallbackExplain?: {
        summary?: string;
        reasoning?: string[];
        objective?: string;
        planScore?: number;
        dataSource?: string;
        sourceConfidence?: number;
        pacingMode?: 'normal' | 'conservative';
      };
      fallbackPlans?: Array<{
        type?: string;
        strategy?: string;
        name?: string;
        timeline?: Array<{
          time?: string;
          action?: string;
          type?: string;
        }>;
        confidence?: number;
      }>;
      fallbackSelectedStrategy?: string;
      fallbackTemplateVersion?: string;
      fallbackPacingMode?: 'normal' | 'conservative';
      poiTrace?: {
        policy?: 'strict' | 'fallback' | 'explore';
        sourceHint?: string;
        provider?: string;
        inputCount?: number;
        selectedCount?: number;
        /** 与 observability 对齐（CLI --show-poi-trace） */
        orchestration_mode_final?: string;
        received_route_direction_id?: string;
        requestRouteDirectionId?: string;
        selected_region?: string;
        destination_country?: string | null;
        recall_raw_research?: number;
        recall_after_route_augment?: number;
        after_dedupe?: number;
        after_hard_guards?: number;
        selected_after_rank?: number;
        country_filter_applied?: boolean;
        route_direction_id?: string;
        route_signature_pois_added?: number;
        route_corridor_pois_added?: number;
        commute_budget_minutes?: number;
        estimated_commute_minutes?: number;
        over_budget?: boolean;
        debug_scores?: Array<{
          slot?: string;
          desiredType?: string;
          poiName?: string;
          typeScore?: number;
          timeScore?: number;
          ratingScore?: number;
          affordabilityScore?: number;
          nameHintScore?: number;
          commuteDistanceKm?: number;
          commuteMinutes?: number;
          commutePenalty?: number;
          timeWindowPenalty?: number;
          totalScore?: number;
        }>;
        commute_matrix?: {
          mode?: 'walk' | 'drive' | 'transit' | 'mixed';
          from_start?: boolean;
          nodes?: string[];
          minutes?: number[][];
        };
      };
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
    fallback_template_version?: string;
    fallback_data_source?: string;
    fallback_source_confidence?: number;
    fallback_pacing_mode?: 'normal' | 'conservative';
    /** P4: 每步骤耗时（step → ms），便于聚合分析 */
    step_latency_ms?: Record<string, number>;
    /** P4: 本请求 Gate 是否 BLOCK（0=未阻止，1=阻止），可聚合为 gate_block_rate */
    gate_block_rate?: number;
    /** P4: 本请求 Skills 成功率（0–1），可聚合为 skill_success_rate */
    skill_success_rate?: number;
    /** AO-05：与编排 state 对齐，便于日志/网关按 request 关联 */
    orchestration_request_id?: string;
    /** AO-05：状态机当前步骤（OrchestratorState.current_step） */
    current_step?: string;
    orchestration_mode_final?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM' | 'DEDUP';
    received_route_direction_id?: string;
    mode_final?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM' | 'DEDUP';
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

