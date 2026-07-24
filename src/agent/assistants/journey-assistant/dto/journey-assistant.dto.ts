// src/agent/assistants/journey-assistant/dto/journey-assistant.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { EmotionalContextClientDto } from '../../../dto/emotional-context-client.dto';

/**
 * 位置
 */
export class LocationDto {
  @ApiProperty({ description: '纬度' })
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: '经度' })
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional({ description: '位置名称' })
  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * 请求上下文
 */
export class JourneyContextDto {
  @ApiPropertyOptional({ description: '当前位置' })
  @ValidateNested()
  @Type(() => LocationDto)
  @IsOptional()
  currentLocation?: LocationDto;

  @ApiPropertyOptional({ description: '时区' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: '连续驾驶秒数（供疲劳/静默门控）' })
  @IsOptional()
  @IsNumber()
  continuousDrivingSeconds?: number;
}

/**
 * 调整参数
 */
export class AdjustmentParamsDto {
  @ApiProperty({ description: '行程项ID' })
  @IsString()
  itemId!: string;

  @ApiPropertyOptional({ description: '新时间' })
  @IsOptional()
  @IsString()
  newTime?: string;

  @ApiPropertyOptional({ description: '是否取消' })
  @IsOptional()
  @IsBoolean()
  cancel?: boolean;

  @ApiPropertyOptional({ description: '替换内容' })
  @IsOptional()
  @IsObject()
  replace?: {
    type: string;
    details: any;
  };
}

/**
 * 行程助手请求基类
 */
export class JourneyBaseRequestDto {
  @ApiProperty({ description: '行程ID' })
  @IsString()
  tripId!: string;

  @ApiProperty({ description: '用户ID' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: '语言偏好', enum: ['en', 'zh'] })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';

  @ApiPropertyOptional({ description: '请求上下文' })
  @ValidateNested()
  @Type(() => JourneyContextDto)
  @IsOptional()
  context?: JourneyContextDto;
}

/**
 * 行程助手对话请求
 */
export class JourneyChatRequestDto extends JourneyBaseRequestDto {
  @ApiProperty({ description: '用户消息' })
  @IsString()
  message!: string;
}

/**
 * 事件处理请求
 */
export class HandleEventRequestDto extends JourneyBaseRequestDto {
  @ApiProperty({ description: '事件ID' })
  @IsString()
  eventId!: string;

  @ApiPropertyOptional({ description: '选择的方案ID' })
  @IsOptional()
  @IsString()
  selectedOptionId?: string;
}

/**
 * 调整行程请求
 */
export class AdjustScheduleRequestDto extends JourneyBaseRequestDto {
  @ApiProperty({ description: '调整参数' })
  @ValidateNested()
  @Type(() => AdjustmentParamsDto)
  adjustmentParams!: AdjustmentParamsDto;
}

/**
 * 行程项
 */
export class ScheduleItemDto {
  @ApiProperty({ description: '行程项ID' })
  id!: string;

  @ApiProperty({ description: '类型', enum: ['flight', 'hotel', 'activity', 'transport', 'meal', 'rest'] })
  type!: 'flight' | 'hotel' | 'activity' | 'transport' | 'meal' | 'rest';

  @ApiProperty({ description: '标题（英文）' })
  title!: string;

  @ApiProperty({ description: '标题（中文）' })
  titleCN!: string;

  @ApiProperty({ description: '开始时间' })
  startTime!: string;

  @ApiPropertyOptional({ description: '结束时间' })
  endTime?: string;

  @ApiPropertyOptional({ description: '位置' })
  location?: {
    name: string;
    nameCN: string;
    lat: number;
    lng: number;
    address?: string;
  };

  @ApiProperty({ description: '状态', enum: ['upcoming', 'in_progress', 'completed', 'cancelled', 'modified'] })
  status!: 'upcoming' | 'in_progress' | 'completed' | 'cancelled' | 'modified';

  @ApiPropertyOptional({ description: '备注（英文）' })
  notes?: string;

  @ApiPropertyOptional({ description: '备注（中文）' })
  notesCN?: string;
}

/**
 * 提醒
 */
export class ReminderDto {
  @ApiProperty({ description: '提醒ID' })
  id!: string;

  @ApiProperty({ description: '类型' })
  type!: string;

  @ApiProperty({ description: '标题（英文）' })
  title!: string;

  @ApiProperty({ description: '标题（中文）' })
  titleCN!: string;

  @ApiProperty({ description: '消息（英文）' })
  message!: string;

  @ApiProperty({ description: '消息（中文）' })
  messageCN!: string;

  @ApiProperty({ description: '优先级', enum: ['low', 'medium', 'high', 'urgent'] })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @ApiProperty({ description: '计划时间' })
  scheduledAt!: string;

  @ApiPropertyOptional({ description: '关联项目ID' })
  relatedItemId?: string;

  @ApiPropertyOptional({ description: '是否需要操作' })
  actionRequired?: boolean;

  @ApiPropertyOptional({ description: '可用操作' })
  actions?: {
    action: string;
    label: string;
    labelCN: string;
  }[];
}

/**
 * 事件
 */
export class TripEventDto {
  @ApiProperty({ description: '事件ID' })
  id!: string;

  @ApiProperty({ description: '事件类型' })
  type!: string;

  @ApiProperty({ description: '标题（英文）' })
  title!: string;

  @ApiProperty({ description: '标题（中文）' })
  titleCN!: string;

  @ApiProperty({ description: '描述（英文）' })
  description!: string;

  @ApiProperty({ description: '描述（中文）' })
  descriptionCN!: string;

  @ApiProperty({ description: '严重程度', enum: ['info', 'warning', 'critical'] })
  severity!: 'info' | 'warning' | 'critical';

  @ApiProperty({ description: '发生时间' })
  occurredAt!: string;

  @ApiProperty({ description: '影响的项目', type: [String] })
  affectedItems!: string[];

  @ApiPropertyOptional({ description: '来源' })
  source?: string;
}

/**
 * 应急方案
 */
export class EmergencyOptionDto {
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

  @ApiProperty({ description: '影响（英文）' })
  impact!: {
    time: string;
    cost: string;
    experience: string;
  };

  @ApiProperty({ description: '影响（中文）' })
  impactCN!: {
    time: string;
    cost: string;
    experience: string;
  };

  @ApiProperty({ description: '是否推荐' })
  recommended!: boolean;

  @ApiProperty({ description: '可用操作' })
  actions!: {
    action: string;
    label: string;
    labelCN: string;
    autoExecutable: boolean;
  }[];
}

/**
 * 行程统计
 */
export class JourneyStatsDto {
  @ApiProperty({ description: '已完成活动数' })
  completedActivities!: number;

  @ApiProperty({ description: '总活动数' })
  totalActivities!: number;

  @ApiProperty({ description: '已花费预算' })
  spentBudget!: number;

  @ApiProperty({ description: '总预算' })
  totalBudget!: number;
}

/**
 * 行程状态
 */
export class JourneyStateDto {
  @ApiProperty({ description: '行程ID' })
  tripId!: string;

  @ApiProperty({ description: '用户ID' })
  userId!: string;

  @ApiProperty({ description: '当前阶段', enum: ['PRE_TRIP', 'DEPARTURE_DAY', 'ON_TRIP', 'RETURN_DAY', 'POST_TRIP'] })
  phase!: string;

  @ApiProperty({ description: '当前天数' })
  currentDay!: number;

  @ApiProperty({ description: '总天数' })
  totalDays!: number;

  @ApiProperty({ description: '当前日期' })
  currentDate!: string;

  @ApiPropertyOptional({ description: '当前位置' })
  currentLocation?: LocationDto;

  @ApiProperty({ description: '今日行程', type: [ScheduleItemDto] })
  todaySchedule!: ScheduleItemDto[];

  @ApiProperty({ description: '即将到来的提醒', type: [ReminderDto] })
  upcomingReminders!: ReminderDto[];

  @ApiProperty({ description: '活跃事件', type: [TripEventDto] })
  activeEvents!: TripEventDto[];

  @ApiProperty({ description: '行程统计' })
  stats!: JourneyStatsDto;

  @ApiProperty({ description: '最后更新时间' })
  lastUpdated!: string;

  @ApiPropertyOptional({ description: '行程是否已完成' })
  isCompleted?: boolean;

  @ApiPropertyOptional({
    type: EmotionalContextClientDto,
    description: '行中情绪矩阵（proactivityGate / voiceTone；驱动静默与 TTS）',
  })
  @ValidateNested()
  @Type(() => EmotionalContextClientDto)
  @IsOptional()
  emotionalContext?: EmotionalContextClientDto;
}

/**
 * 建议操作
 */
export class JourneySuggestedActionDto {
  @ApiProperty({ description: '操作标识' })
  action!: string;

  @ApiProperty({ description: '标签（英文）' })
  label!: string;

  @ApiProperty({ description: '标签（中文）' })
  labelCN!: string;
}

/**
 * 调整结果
 */
export class AdjustmentResultDto {
  @ApiProperty({ description: '是否成功' })
  success!: boolean;

  @ApiProperty({ description: '消息（英文）' })
  message!: string;

  @ApiProperty({ description: '消息（中文）' })
  messageCN!: string;

  @ApiPropertyOptional({ description: '更新后的行程', type: [ScheduleItemDto] })
  updatedSchedule?: ScheduleItemDto[];
}

/**
 * 搜索结果
 */
export class SearchResultsDto {
  @ApiProperty({ description: '搜索类型' })
  type!: string;

  @ApiProperty({ description: '搜索结果' })
  items!: any[];
}

/**
 * 快捷操作项
 */
export class QuickActionItemDto {
  @ApiProperty({ description: '唯一标识' })
  id!: string;

  @ApiProperty({ description: '按钮显示文案' })
  label!: string;

  @ApiProperty({ description: '点击后发送给助手的提示词' })
  prompt!: string;

  @ApiPropertyOptional({ description: '图标名', enum: ['utensils', 'coffee', 'shopping', 'hospital'] })
  @IsOptional()
  @IsString()
  icon?: string;
}

/**
 * 快捷操作列表响应
 */
export class QuickActionsResponseDto {
  @ApiProperty({ description: '快捷操作列表', type: [QuickActionItemDto] })
  items!: QuickActionItemDto[];
}

/**
 * 行程助手响应
 */
export class JourneyAssistantResponseDto {
  @ApiPropertyOptional({ description: '回复消息（英文）' })
  message?: string;

  @ApiPropertyOptional({ description: '回复消息（中文）' })
  messageCN?: string;

  @ApiPropertyOptional({ description: '行程状态' })
  journeyState?: JourneyStateDto;

  @ApiPropertyOptional({ description: '提醒列表', type: [ReminderDto] })
  reminders?: ReminderDto[];

  @ApiPropertyOptional({ description: '事件信息' })
  event?: TripEventDto;

  @ApiPropertyOptional({ description: '应急方案', type: [EmergencyOptionDto] })
  options?: EmergencyOptionDto[];

  @ApiPropertyOptional({ description: '调整结果' })
  adjustmentResult?: AdjustmentResultDto;

  @ApiPropertyOptional({ description: '搜索结果' })
  searchResults?: SearchResultsDto;

  @ApiPropertyOptional({ description: '建议操作', type: [JourneySuggestedActionDto] })
  suggestedActions?: JourneySuggestedActionDto[];

  @ApiPropertyOptional({ description: '是否需要用户位置（找医院/药店时若未提供坐标则返回，前端应请求定位后重试）' })
  needsLocation?: boolean;
}
