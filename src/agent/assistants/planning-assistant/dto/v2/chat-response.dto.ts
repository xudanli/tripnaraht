// src/agent/assistants/planning-assistant/dto/v2/chat-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuggestedActionDto } from './shared/suggested-action.dto';
import { DestinationRecommendationDto } from './shared/destination-recommendation.dto';
import { PlanCandidateDto } from './shared/plan-candidate.dto';
import { HotelDto } from './shared/hotel.dto';
import { AccommodationItemDto } from './shared/accommodation-item.dto';

/**
 * 路由目标类型（支持所有 MCP 服务）
 */
export type RoutingTarget = 
  | 'recommendations' 
  | 'generate' 
  | 'compare' 
  | 'optimize'
  | 'hotel' 
  | 'airbnb' 
  | 'accommodation'
  | 'restaurant' 
  | 'flight' 
  | 'rail'
  | 'carRental'
  | 'weather' 
  | 'search' 
  | 'translate' 
  | 'currency' 
  | 'image'
  | 'chat';

/**
 * 智能路由信息
 */
export class RoutingInfoDto {
  @ApiProperty({ 
    description: '目标接口',
    enum: [
      'recommendations', 'generate', 'compare', 'optimize',
      'hotel', 'airbnb', 'accommodation',
      'restaurant', 'flight', 'rail', 'carRental',
      'weather', 'search', 'translate', 'currency', 'image',
      'chat'
    ]
  })
  target!: RoutingTarget;

  @ApiProperty({ description: '路由原因' })
  reason!: string;

  @ApiPropertyOptional({
    description: '交付模式：`SYNC` 默认；`ASYNC_POLLING` 表示需轮询 `GET /api/agent/task/status/:taskId`',
    enum: ['SYNC', 'ASYNC_POLLING'],
  })
  mode?: 'SYNC' | 'ASYNC_POLLING';

  @ApiPropertyOptional({ description: '提取的参数' })
  params?: Record<string, any>;
}

/**
 * 对话响应DTO
 */
export class ChatResponseDto {
  @ApiProperty({ description: '回复消息（英文）' })
  message!: string;

  @ApiProperty({ description: '回复消息（中文）' })
  messageCN!: string;

  @ApiPropertyOptional({ description: '主要回复消息（根据语言参数自动选择）' })
  reply?: string;

  @ApiPropertyOptional({ description: '主要回复消息（中文）' })
  replyCN?: string;

  @ApiProperty({ 
    description: '当前阶段',
    enum: ['INITIAL', 'COLLECTING_PREFERENCES', 'RECOMMENDING', 'COMPARING_PLANS', 'CONFIRMING', 'COMPLETED', 'ADJUSTING', 'CLARIFYING_HOTEL_DATES', 'CLARIFYING_RAIL_DATES', 'CLARIFYING_FLIGHT_ORIGIN']
  })
  phase!: string;

  @ApiPropertyOptional({ description: '需要用户澄清的信息（如入住退房日期、航班出发地）' })
  clarificationNeeded?: {
    type: string;
    message: string;
    messageCN: string;
    /** 建议日期（从行程自动带出时包含，用户可确认或修改） */
    suggestedDates?: { checkIn: string; checkOut: string };
    /** 航班澄清：目的地 IATA 代码 */
    destination?: string;
    /** 航班澄清：目的地显示名称 */
    destinationName?: string;
  };

  @ApiPropertyOptional({ description: '智能路由信息（如果路由到业务接口）' })
  routing?: RoutingInfoDto;

  @ApiPropertyOptional({ description: '建议操作', type: [SuggestedActionDto] })
  suggestedActions?: SuggestedActionDto[];

  @ApiPropertyOptional({ description: '会话ID' })
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'route_and_run 异步任务 ID（routing.mode=ASYNC_POLLING 时由前端轮询）',
    example: 'task_trip_xxx_1716000000000',
  })
  task_id?: string;

  @ApiPropertyOptional({
    description: '异步任务状态（与 RouteAndRunTaskStatusResponseDto.status 对齐）',
    enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED'],
  })
  task_status?: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

  @ApiPropertyOptional({
    description: '轮询路径（相对 API 根；默认 `/api/agent/task/status/{task_id}`）',
    example: '/api/agent/task/status/task_trip_xxx_1716000000000',
  })
  task_poll_path?: string;

  @ApiPropertyOptional({ 
    description: '目的地推荐列表（当路由到推荐接口时包含）', 
    type: [DestinationRecommendationDto] 
  })
  recommendations?: DestinationRecommendationDto[];

  @ApiPropertyOptional({ 
    description: '方案候选列表（当路由到方案生成接口时包含）', 
    type: [PlanCandidateDto] 
  })
  plans?: PlanCandidateDto[];

  @ApiPropertyOptional({ 
    description: '统一住宿列表（酒店+Airbnb 标准化结构，推荐使用）', 
    type: [AccommodationItemDto] 
  })
  accommodations?: AccommodationItemDto[];

  @ApiPropertyOptional({ 
    description: '酒店列表（兼容旧版，建议使用 accommodations）', 
    type: [HotelDto] 
  })
  hotels?: HotelDto[];

  @ApiPropertyOptional({ 
    description: 'Airbnb 房源列表（兼容旧版，建议使用 accommodations）'
  })
  airbnbListings?: any[];

  @ApiPropertyOptional({ 
    description: '餐厅列表（当路由到餐厅搜索接口时包含）'
  })
  restaurants?: any[];

  @ApiPropertyOptional({ 
    description: '天气信息（当路由到天气查询接口时包含）'
  })
  weather?: any;

  @ApiPropertyOptional({ 
    description: '搜索结果（当路由到 Web 搜索接口时包含）'
  })
  searchResults?: any[];

  @ApiPropertyOptional({ 
    description: '航班列表（当路由到航班搜索接口时包含）'
  })
  flights?: any[];

  @ApiPropertyOptional({ 
    description: '铁路路线列表（当路由到铁路查询接口时包含）'
  })
  railRoutes?: any[];

  @ApiPropertyOptional({ 
    description: '租车列表（当路由到租车搜索接口时包含）'
  })
  carRentals?: any[];

  @ApiPropertyOptional({ 
    description: '翻译结果（当路由到翻译接口时包含）'
  })
  translation?: any;

  @ApiPropertyOptional({ 
    description: '货币转换结果（当路由到货币转换接口时包含）'
  })
  currencyConversion?: any;

  @ApiPropertyOptional({ 
    description: '图片列表（当路由到图片搜索接口时包含）'
  })
  images?: any[];

  /** 编排进度（用于展示可折叠「编排进度」卡片，方案 A：来自 route_and_run） */
  @ApiPropertyOptional({
    description: '编排进度（用于展示可折叠进度卡片）',
    example: {
      phase: 'PLAN_GEN',
      progress_percent: 75,
      message: '正在生成行程...',
      requires_user_action: false,
      current_step_detail: '生成详细的行程安排，包括时间、地点、交通方式',
    },
  })
  ui_state?: {
    phase?: string;
    ui_status?: string;
    progress_percent?: number;
    message?: string;
    requires_user_action?: boolean;
    estimated_time_remaining_ms?: number;
    current_step_detail?: string;
  };

  /** 编排结果（gate_result、state、decision_log 等，用于 RLHF/分析/调试） */
  @ApiPropertyOptional({
    description: '编排结果（gate_result、decision_log 等）',
  })
  orchestrationResult?: {
    state?: Record<string, unknown>;
    gate_result?: Record<string, unknown>;
    decision_log?: unknown[];
    itinerary?: { days?: unknown[] };
    decisionState?: Record<string, unknown>;
  };

  /**
   * 与左侧时间轴应对齐的日历日块（`route_and_run` payload.timeline，已与 Trip 草案对齐时优先库内）。
   */
  @ApiPropertyOptional({ description: '出站时间轴（与 feasibility 同源）' })
  timeline?: unknown[];

  /** 可执行性 / VERIFY 摘要（与 timeline 同一 itinerary 过滤） */
  @ApiPropertyOptional({ description: 'safety_surface（verify_issues 等）' })
  safety_surface?: Record<string, unknown>;

  /** ITINERARY_ADJUST：草案待确认卡片（含 draft_schedule_zh / apply_confirmation_lines） */
  @ApiPropertyOptional({ description: '改排优化结果（与 timeline 同源）' })
  itinerary_adjust_result?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '改排应用执行态（ADVICE_ONLY / AUTO）' })
  actionExecution?: Record<string, unknown>;

  /** 经 BFF 清洗的门控（violations 唯一权威来源；勿再读 state.gate_result.violations） */
  @ApiPropertyOptional({ description: '清洗后的 gate_result（可执行性卡片）' })
  gate_result?: Record<string, unknown>;

  /**
   * ITINERARY_ADJUST：可执行性唯一列表（已去重；改排草案待确认时不含 VERIFY 合成 POI_CLOSED）
   */
  @ApiPropertyOptional({ description: '工作台可执行性（改排场景优先读此字段）' })
  workbench_feasibility?: {
    violations?: unknown[];
    verify_synthetic_suppressed?: boolean;
  };

  /**
   * 展示源说明：`timeline_source` / `feasibility_source` 为 orchestration | trip_persisted；
   * `drift_detected` 为 true 时表示曾出现编排内存与 Trip 库不一致，已按 Trip 收敛。
   */
  @ApiPropertyOptional({ description: '工作台时间轴与可执行性对齐元数据' })
  workbench_display?: {
    timeline_source?: string;
    feasibility_source?: string;
    aligned?: boolean;
    drift_detected?: boolean;
    trip_id?: string;
  };
}
