// src/agent/assistants/planning-assistant/dto/planning-assistant.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 位置上下文
 */
export class LocationContextDto {
  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  lng?: number;
}

/**
 * 请求上下文
 */
export class RequestContextDto {
  @ApiPropertyOptional({ description: '当前位置' })
  @ValidateNested()
  @Type(() => LocationContextDto)
  @IsOptional()
  currentLocation?: LocationContextDto;

  @ApiPropertyOptional({ description: '时区' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

/**
 * 规划助手对话请求
 */
export class PlanningChatRequestDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: '用户消息' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: '语言偏好', enum: ['en', 'zh'] })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';

  @ApiPropertyOptional({ description: '请求上下文' })
  @ValidateNested()
  @Type(() => RequestContextDto)
  @IsOptional()
  context?: RequestContextDto;
}

/**
 * 创建会话请求
 */
export class CreateSessionRequestDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}

/**
 * 创建会话响应
 */
export class CreateSessionResponseDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;
}

/**
 * 引导问题选项
 */
export class GuidingQuestionDto {
  @ApiProperty({ description: '问题（英文）' })
  question!: string;

  @ApiProperty({ description: '问题（中文）' })
  questionCN!: string;

  @ApiPropertyOptional({ description: '选项（英文）' })
  options?: string[];

  @ApiPropertyOptional({ description: '选项（中文）' })
  optionsCN?: string[];

  @ApiProperty({ description: '输入类型', enum: ['single', 'multiple', 'text', 'date', 'number'] })
  type!: 'single' | 'multiple' | 'text' | 'date' | 'number';
}

/**
 * 目的地推荐
 */
export class DestinationRecommendationDto {
  @ApiProperty({ description: '目的地ID' })
  id!: string;

  @ApiProperty({ description: '国家代码' })
  countryCode!: string;

  @ApiProperty({ description: '名称（英文）' })
  name!: string;

  @ApiProperty({ description: '名称（中文）' })
  nameCN!: string;

  @ApiProperty({ description: '描述（英文）' })
  description!: string;

  @ApiProperty({ description: '描述（中文）' })
  descriptionCN!: string;

  @ApiProperty({ description: '亮点（英文）', type: [String] })
  highlights!: string[];

  @ApiProperty({ description: '亮点（中文）', type: [String] })
  highlightsCN!: string[];

  @ApiProperty({ description: '匹配分数 (0-100)' })
  matchScore!: number;

  @ApiProperty({ description: '匹配原因（英文）', type: [String] })
  matchReasons!: string[];

  @ApiProperty({ description: '匹配原因（中文）', type: [String] })
  matchReasonsCN!: string[];

  @ApiProperty({ description: '预估预算' })
  estimatedBudget!: {
    min: number;
    max: number;
    currency: string;
  };

  @ApiProperty({ description: '最佳季节', type: [String] })
  bestSeasons!: string[];

  @ApiPropertyOptional({ description: '图片URL' })
  imageUrl?: string;

  @ApiProperty({ description: '标签', type: [String] })
  tags!: string[];
}

/**
 * 方案候选
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
  };

  @ApiProperty({ description: '节奏', enum: ['relaxed', 'moderate', 'intensive'] })
  pace!: 'relaxed' | 'moderate' | 'intensive';

  @ApiProperty({ description: '适合度' })
  suitability!: {
    score: number;
    reasons: string[];
  };

  @ApiPropertyOptional({ description: '警告', type: [String] })
  warnings?: string[];
}

/**
 * 建议操作
 */
export class SuggestedActionDto {
  @ApiProperty({ description: '操作标识' })
  action!: string;

  @ApiProperty({ description: '标签（英文）' })
  label!: string;

  @ApiProperty({ description: '标签（中文）' })
  labelCN!: string;
}

/**
 * 规划助手对话响应
 */
export class PlanningChatResponseDto {
  @ApiProperty({ description: '回复消息（英文）' })
  message!: string;

  @ApiProperty({ description: '回复消息（中文）' })
  messageCN!: string;

  @ApiProperty({ description: '当前对话阶段' })
  phase!: string;

  @ApiPropertyOptional({ description: '引导问题', type: [GuidingQuestionDto] })
  guidingQuestions?: GuidingQuestionDto[];

  @ApiPropertyOptional({ description: '目的地推荐', type: [DestinationRecommendationDto] })
  recommendations?: DestinationRecommendationDto[];

  @ApiPropertyOptional({ description: '方案候选', type: [PlanCandidateDto] })
  planCandidates?: PlanCandidateDto[];

  @ApiPropertyOptional({ description: '方案对比' })
  comparison?: {
    dimensions: string[];
    candidates: {
      id: string;
      name: string;
      scores: Record<string, number>;
    }[];
    recommendation: string;
    recommendationCN: string;
  };

  @ApiPropertyOptional({ description: '确认的行程ID' })
  confirmedTripId?: string;

  @ApiPropertyOptional({ description: '建议操作', type: [SuggestedActionDto] })
  suggestedActions?: SuggestedActionDto[];
}

/**
 * 会话状态响应
 */
export class SessionStateResponseDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  userId?: string;

  @ApiProperty({ description: '当前阶段' })
  phase!: string;

  @ApiProperty({ description: '用户偏好' })
  preferences: any;

  @ApiPropertyOptional({ description: '目的地推荐', type: [DestinationRecommendationDto] })
  recommendations?: DestinationRecommendationDto[];

  @ApiPropertyOptional({ description: '选中的目的地' })
  selectedDestination?: string;

  @ApiPropertyOptional({ description: '方案候选', type: [PlanCandidateDto] })
  planCandidates?: PlanCandidateDto[];

  @ApiPropertyOptional({ description: '选中的方案ID' })
  selectedPlanId?: string;

  @ApiPropertyOptional({ description: '确认的行程ID' })
  confirmedTripId?: string;

  @ApiProperty({ description: '消息历史数量' })
  messageCount!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}
