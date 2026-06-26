// src/trips/dto/create-trip-from-nl-response.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsNumber, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClarificationQuestion } from '../../agent/interfaces/clarification.interface';

/**
 * 规划师回复内容块类型
 */
export type PlannerResponseBlockType =
  | 'paragraph'        // 普通段落文本
  | 'heading'          // 标题
  | 'list'             // 列表（有序/无序）
  | 'summary_card'     // 摘要卡片（目的地、天数、预算等）
  | 'question_card'    // 澄清问题卡片（独立组件）
  | 'highlight'        // 高亮信息（重要提示）
  | 'budget_summary'   // 预算摘要
  | 'itinerary_overview'; // 行程概览

/**
 * 摘要卡片数据
 */
export class SummaryCardDto {
  @ApiPropertyOptional({ description: '目的地' })
  @IsString()
  @IsOptional()
  destination?: string;

  @ApiPropertyOptional({ description: '行程天数或日期范围，如"10天"或"2026-03-20 至 2026-03-25"' })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ description: '出行时间（开始日期），供前端展示「出行时间」' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '返程时间（结束日期），供前端展示「返程时间」' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: '旅行者信息，如"双人"' })
  @IsString()
  @IsOptional()
  travelers?: string;

  @ApiPropertyOptional({ description: '预算信息' })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetInfoDto)
  budget?: BudgetInfoDto;

  @ApiPropertyOptional({ description: '城市列表（LLM 解析结果）', type: [String] })
  @IsArray()
  @IsOptional()
  cities?: string[];

  @ApiPropertyOptional({ description: '城市天数分配（LLM 解析结果）', type: [Object] })
  @IsArray()
  @IsOptional()
  dayAllocation?: Array<{ city: string; days: number }>;

  /** 预格式化的天数分配文案，供前端直接展示，避免 [object Object]，如 "杭州 3 天、千岛湖 1 天" */
  @ApiPropertyOptional({ description: '天数分配可读文案（供前端直接展示）' })
  @IsString()
  @IsOptional()
  dayAllocationDisplay?: string;

  @ApiPropertyOptional({ description: '必含景点（LLM 解析结果）', type: [String] })
  @IsArray()
  @IsOptional()
  mustHavePois?: string[];
}

/**
 * 预算信息
 */
export class BudgetInfoDto {
  @ApiProperty({ description: '预算金额' })
  @IsNumber()
  amount!: number;

  @ApiProperty({ description: '货币单位' })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: '预算详情列表', type: [String] })
  @IsArray()
  @IsOptional()
  details?: string[];
}

/**
 * 预算摘要数据
 */
export class BudgetSummaryDto {
  @ApiProperty({ description: '估算总金额' })
  @IsNumber()
  estimatedAmount!: number;

  @ApiProperty({ description: '货币单位' })
  @IsString()
  currency!: string;

  @ApiProperty({ description: '行程天数' })
  @IsString()
  duration!: string;

  @ApiProperty({ description: '旅行者信息' })
  @IsString()
  travelers!: string;

  @ApiPropertyOptional({ description: '预算分类明细' })
  @IsArray()
  @IsOptional()
  breakdown?: Array<{
    category: string;
    amount: number;
    percentage?: number;
  }>;
}

/**
 * 行程概览数据
 */
export class ItineraryOverviewDto {
  @ApiPropertyOptional({ description: '行程主题' })
  @IsString()
  @IsOptional()
  theme?: string;

  @ApiPropertyOptional({ description: '路线描述' })
  @IsString()
  @IsOptional()
  route?: string;

  @ApiPropertyOptional({ description: '每日结构描述' })
  @IsString()
  @IsOptional()
  dailyStructure?: string;
}

/**
 * 规划师回复内容块
 */
export class PlannerResponseBlockDto {
  @ApiProperty({
    description: '内容块类型',
    enum: ['paragraph', 'heading', 'list', 'summary_card', 'question_card', 'highlight', 'budget_summary', 'itinerary_overview'],
  })
  @IsEnum(['paragraph', 'heading', 'list', 'summary_card', 'question_card', 'highlight', 'budget_summary', 'itinerary_overview'])
  type!: PlannerResponseBlockType;

  @ApiPropertyOptional({ description: '内容块ID（用于前端渲染key）' })
  @IsString()
  @IsOptional()
  id?: string;

  // paragraph 类型字段
  @ApiPropertyOptional({ description: '段落文本内容（paragraph类型）' })
  @IsString()
  @IsOptional()
  content?: string;

  // heading 类型字段
  @ApiPropertyOptional({ description: '标题级别（heading类型）', enum: [1, 2, 3] })
  @IsNumber()
  @IsOptional()
  level?: 1 | 2 | 3;

  @ApiPropertyOptional({ description: '标题文本（heading类型）' })
  @IsString()
  @IsOptional()
  text?: string;

  // list 类型字段
  @ApiPropertyOptional({ description: '列表标题（list类型）' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '列表项（list类型）', type: [String] })
  @IsArray()
  @IsOptional()
  items?: string[];

  @ApiPropertyOptional({ description: '是否有序列表（list类型）' })
  @IsBoolean()
  @IsOptional()
  ordered?: boolean;

  // summary_card 类型字段
  @ApiPropertyOptional({ description: '摘要信息（summary_card类型）', type: SummaryCardDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SummaryCardDto)
  summary?: SummaryCardDto;

  // question_card 类型字段
  @ApiPropertyOptional({ description: '关联的问题ID（question_card类型，关联到clarificationQuestions）' })
  @IsString()
  @IsOptional()
  questionId?: string;

  // highlight 类型字段
  @ApiPropertyOptional({ description: '高亮文本（highlight类型）' })
  @IsString()
  @IsOptional()
  highlightText?: string;

  @ApiPropertyOptional({
    description: '高亮类型（highlight类型）',
    enum: ['info', 'warning', 'success'],
  })
  @IsEnum(['info', 'warning', 'success'])
  @IsOptional()
  highlightType?: 'info' | 'warning' | 'success';

  // budget_summary 类型字段
  @ApiPropertyOptional({ description: '预算摘要（budget_summary类型）', type: BudgetSummaryDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetSummaryDto)
  budget?: BudgetSummaryDto;

  // itinerary_overview 类型字段
  @ApiPropertyOptional({ description: '行程概览（itinerary_overview类型）', type: ItineraryOverviewDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ItineraryOverviewDto)
  itinerary?: ItineraryOverviewDto;
}

/**
 * 结构化澄清问题（兼容ClarificationQuestion接口）
 */
export class ClarificationQuestionDto implements ClarificationQuestion {
  @ApiProperty({ description: '问题ID（唯一标识）' })
  @IsString()
  id!: string;

  @ApiProperty({ description: '问题文本（用户看到的问题）' })
  @IsString()
  question!: string;

  @ApiProperty({
    description: '问题类型',
    enum: ['text', 'single_choice', 'multi_choice', 'date', 'number'],
  })
  @IsEnum(['text', 'single_choice', 'multi_choice', 'date', 'number'])
  type!: 'text' | 'single_choice' | 'multi_choice' | 'date' | 'number';

  @ApiPropertyOptional({ description: '选项列表（用于single_choice和multi_choice）', type: [String] })
  @IsArray()
  @IsOptional()
  options?: string[];

  @ApiProperty({ description: '是否必填' })
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional({ description: '占位符（用于text和number）' })
  @IsString()
  @IsOptional()
  placeholder?: string;

  @ApiPropertyOptional({ description: '提示文本（帮助用户理解问题）' })
  @IsString()
  @IsOptional()
  hint?: string;

  @ApiPropertyOptional({ description: '默认值' })
  @IsOptional()
  default?: string | string[];

  @ApiPropertyOptional({ description: '元数据（category, priority等）' })
  @IsObject()
  @IsOptional()
  metadata?: {
    category?: string;
    priority?: 'high' | 'medium' | 'low';
  };

  /**
   * 🆕 问题分组（用于前端分组展示）
   * - 'required': 必需问题（澄清问题）
   * - 'optional': 可选问题（补充问题）
   */
  @ApiPropertyOptional({
    description: '问题分组（required=必需问题，optional=可选问题）',
    enum: ['required', 'optional'],
  })
  @IsEnum(['required', 'optional'])
  @IsOptional()
  group?: 'required' | 'optional';

  /**
   * 🆕 HCI优化：条件输入字段（当用户选择特定选项时显示后续输入字段）
   * 例如：选择"不准确，需要修改"后显示日期选择框
   */
  @ApiPropertyOptional({
    description: '条件输入字段配置',
    type: [Object],
  })
  @IsArray()
  @IsOptional()
  conditionalInputs?: Array<{
    triggerValue: string;
    inputType: 'text' | 'single_choice' | 'multi_choice' | 'multiple_choice' | 'number' | 'date' | 'date_range';
    label?: string;
    options?: (string | { value: string; label: string })[];
    placeholder?: string;
    hint?: string;
    required?: boolean;
    paramKey?: string;
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
    };
  }>;
}

/**
 * 阶段指示器（分层可见，前端展示「第一阶段」「第二阶段」等）
 */
export class PhaseIndicatorDto {
  @ApiProperty({ description: '当前阶段 1-4', example: 1 })
  phase!: number;

  @ApiProperty({ description: '阶段名称', example: '硬约束确认' })
  phaseName!: string;

  @ApiProperty({ description: '进度如 1/4', example: '1/4' })
  progress!: string;

  @ApiPropertyOptional({ description: '总阶段数', example: 4 })
  @IsOptional()
  totalPhases?: number;
}

/**
 * 思考过程（用于前端可折叠展示，参考「思考了一会儿」样式）
 */
export class ThinkingProcessDto {
  @ApiProperty({ description: '简要标题，如「思考了一会儿」' })
  @IsString()
  summary!: string;

  @ApiProperty({ description: '详细推理内容（可折叠）' })
  @IsString()
  content!: string;
}

/**
 * 进展步骤（用于前端展示当前执行状态）
 */
export class ProgressStepDto {
  @ApiPropertyOptional({ description: '步骤唯一ID' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ description: '步骤描述，如「已解析目的地」' })
  @IsString()
  label!: string;

  @ApiPropertyOptional({ description: '步骤详情，如「11个内容」' })
  @IsString()
  @IsOptional()
  detail?: string;

  @ApiPropertyOptional({
    description: '步骤状态',
    enum: ['pending', 'running', 'completed', 'failed'],
  })
  @IsEnum(['pending', 'running', 'completed', 'failed'])
  @IsOptional()
  status?: 'pending' | 'running' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: '图标类型（前端可选：search/check/loading 等）' })
  @IsString()
  @IsOptional()
  icon?: string;
}

/**
 * 自然语言创建行程响应DTO
 */
export class CreateTripFromNLResponseDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({ description: '是否需要澄清' })
  @IsBoolean()
  @IsOptional()
  needsClarification?: boolean;

  // 🆕 结构化回复内容（替代或补充plannerReply）
  @ApiPropertyOptional({
    description: '结构化回复内容块数组',
    type: [PlannerResponseBlockDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PlannerResponseBlockDto)
  plannerResponseBlocks?: PlannerResponseBlockDto[];

  // 保留原有字段（向后兼容）
  @ApiPropertyOptional({
    description: '简单文本回复（向后兼容，如果未提供plannerResponseBlocks则使用此字段）',
  })
  @IsString()
  @IsOptional()
  plannerReply?: string;

  // 🆕 结构化澄清问题
  @ApiPropertyOptional({
    description: '结构化澄清问题数组',
    type: [ClarificationQuestionDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ClarificationQuestionDto)
  clarificationQuestions?: ClarificationQuestionDto[];

  // 原有字段保持不变
  @ApiPropertyOptional({ description: '建议问题（向后兼容）', type: [String] })
  @IsArray()
  @IsOptional()
  suggestedQuestions?: string[];

  @ApiPropertyOptional({ description: '对话上下文' })
  @IsObject()
  @IsOptional()
  conversationContext?: Record<string, any>;

  @ApiPropertyOptional({ description: '部分参数' })
  @IsObject()
  @IsOptional()
  partialParams?: any;

  @ApiPropertyOptional({ description: '行程对象（如果创建成功）' })
  @IsObject()
  @IsOptional()
  trip?: any;

  @ApiPropertyOptional({ description: '是否正在生成规划点' })
  @IsBoolean()
  @IsOptional()
  generatingItems?: boolean;

  @ApiPropertyOptional({ description: '消息提示' })
  @IsString()
  @IsOptional()
  message?: string;

  /**
   * 🆕 阶段指示器（分层可见，前端展示当前阶段与进度）
   */
  @ApiPropertyOptional({
    description: '当前采集阶段（1=硬约束 2=风格 3=节奏 4=风险）',
    type: PhaseIndicatorDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PhaseIndicatorDto)
  phaseIndicator?: PhaseIndicatorDto;

  /**
   * 🆕 思考过程（用于前端可折叠展示，如「思考了一会儿」）
   */
  @ApiPropertyOptional({
    description: '思考过程（可折叠展示）',
    type: ThinkingProcessDto,
  })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThinkingProcessDto)
  thinkingProcess?: ThinkingProcessDto;

  /**
   * 🆕 进展步骤（按执行顺序，前端展示当前进度）
   */
  @ApiPropertyOptional({
    description: '进展步骤数组',
    type: [ProgressStepDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProgressStepDto)
  progressSteps?: ProgressStepDto[];

  // 🆕 酒店推荐信息
  @ApiPropertyOptional({
    description: '酒店推荐列表',
    type: [Object],
  })
  @IsArray()
  @IsOptional()
  hotelRecommendations?: Array<{
    hotelId: number;
    name: string;
    roomRate: number;
    tier: number;
    locationScore?: {
      center_distance_km?: number;
      nearest_station_walk_min?: number;
      is_transport_hub?: boolean;
      avg_distance_to_attractions_km?: number;
      transport_convenience_score?: number;
    };
    totalCost?: number;
    costBreakdown?: {
      roomRate: number;
      transportCost: number;
      timeCost: number;
      hiddenCost: number;
      totalCost: number;
    };
    recommendationReason: string;
    distanceToCenter?: number;
  }>;

  // 🆕 AI 决策逻辑相关字段
  @ApiPropertyOptional({
    description: '用户画像信息（AI识别结果）',
    type: Object,
  })
  @IsObject()
  @IsOptional()
  personaInfo?: {
    personaId: string;
    personaName: string;
    personaNameEn?: string;
    confidence: number;
    matchReasons: string[];
  };

  @ApiPropertyOptional({
    description: '推荐路线列表（基于用户画像）',
    type: [Object],
  })
  @IsArray()
  @IsOptional()
  recommendedRoutes?: Array<{
    route: string;
    reason: string;
    difficultyMatch: string;
    season?: string;
    prerequisites?: string[];
  }>;

  @ApiPropertyOptional({
    description: '是否被安全第一原则阻止',
  })
  @IsBoolean()
  @IsOptional()
  blockedBySafetyPrinciple?: boolean;

  @ApiPropertyOptional({
    description: '决策矩阵结果（所有澄清轮次完成后）',
    type: Object,
  })
  @IsObject()
  @IsOptional()
  decisionResult?: {
    decision: 'GO_FULLY_SUPPORTED' | 'GO_WITH_STRONG_CAUTION' | 'GO_ALTERNATIVE_PLAN' | 'STRONGLY_RECONSIDER' | 'NOT_RECOMMENDED';
    reason: string;
    recommendations: string[];
  };

  @ApiPropertyOptional({
    description: '是否被决策矩阵阻止',
  })
  @IsBoolean()
  @IsOptional()
  blockedByDecisionMatrix?: boolean;

  @ApiPropertyOptional({
    description: '最后一条消息的ID（用于前端更新问题答案）',
  })
  @IsString()
  @IsOptional()
  lastMessageId?: string;

  @ApiPropertyOptional({
    description: 'PRD §9.2 旅行理解卡（体验原子 + 结构化摘要）',
  })
  @IsObject()
  @IsOptional()
  experienceUnderstanding?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'PRD §13.5 四级确定性表达（路线/体验/变化因素）',
  })
  @IsObject()
  @IsOptional()
  experienceExplanation?: Record<string, unknown>;
}
