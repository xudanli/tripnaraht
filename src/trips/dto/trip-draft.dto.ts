// src/trips/dto/trip-draft.dto.ts
import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsBoolean, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 旅行风格
 */
export enum TravelStyle {
  NATURE = 'nature',
  CULTURE = 'culture',
  FOOD = 'food',
  CITYWALK = 'citywalk',
  PHOTOGRAPHY = 'photography',
  ADVENTURE = 'adventure',
}

/**
 * 强度等级
 */
export enum IntensityLevel {
  RELAXED = 'relaxed',
  BALANCED = 'balanced',
  INTENSE = 'intense',
}

/**
 * 交通方式
 */
export enum TransportMode {
  WALK = 'walk',
  TRANSIT = 'transit',
  CAR = 'car',
}

/**
 * 住宿类型
 */
export enum AccommodationBase {
  FIXED = 'fixed',
  MOVING = 'moving',
}

/**
 * 徒步等级
 */
export enum HikingLevel {
  NONE = 'none',
  LIGHT = 'light',
  HIKING_HEAVY = 'hiking-heavy',
}

/**
 * 时段类型
 */
export enum TimeSlot {
  MORNING = 'morning',
  LUNCH = 'lunch',
  AFTERNOON = 'afternoon',
  DINNER = 'dinner',
  EVENING = 'evening',
}

/**
 * 约束条件 DTO
 */
export class TripConstraintsDto {
  @ApiPropertyOptional({ description: '是否有儿童' })
  @IsBoolean()
  @IsOptional()
  withChildren?: boolean;

  @ApiPropertyOptional({ description: '是否有老人' })
  @IsBoolean()
  @IsOptional()
  withElderly?: boolean;

  @ApiPropertyOptional({ description: '是否早起' })
  @IsBoolean()
  @IsOptional()
  earlyRiser?: boolean;

  @ApiPropertyOptional({ description: '饮食限制', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dietaryRestrictions?: string[];

  @ApiPropertyOptional({ description: '避免的类别', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  avoidCategories?: string[];
}

/**
 * 生成行程草案请求 DTO
 */
export class CreateTripDraftDto {
  @ApiProperty({ description: '目的地国家代码（ISO 3166-1 alpha-2）', example: 'JP' })
  @IsString()
  destination!: string;

  @ApiProperty({ description: '行程天数（1-14）', example: 3, minimum: 1, maximum: 14 })
  @IsNumber()
  days!: number;

  @ApiPropertyOptional({ enum: TravelStyle, description: '旅行风格' })
  @IsEnum(TravelStyle)
  @IsOptional()
  style?: TravelStyle;

  @ApiPropertyOptional({ enum: IntensityLevel, description: '强度等级' })
  @IsEnum(IntensityLevel)
  @IsOptional()
  intensity?: IntensityLevel;

  @ApiPropertyOptional({ enum: TransportMode, description: '交通方式' })
  @IsEnum(TransportMode)
  @IsOptional()
  transport?: TransportMode;

  @ApiPropertyOptional({ enum: AccommodationBase, description: '住宿类型' })
  @IsEnum(AccommodationBase)
  @IsOptional()
  accommodationBase?: AccommodationBase;

  @ApiPropertyOptional({ enum: HikingLevel, description: '徒步等级' })
  @IsEnum(HikingLevel)
  @IsOptional()
  hikingLevel?: HikingLevel;

  @ApiPropertyOptional({ type: TripConstraintsDto, description: '约束条件' })
  @ValidateNested()
  @Type(() => TripConstraintsDto)
  @IsOptional()
  constraints?: TripConstraintsDto;

  @ApiPropertyOptional({ description: '开始日期（ISO 8601）', example: '2024-06-01' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期（ISO 8601）', example: '2024-06-03' })
  @IsString()
  @IsOptional()
  endDate?: string;

  /** TripNara Phase 4+5: 使用算法编排替代 LLM 选点，LLM 仅负责解释/风格化。默认 false 保持兼容 */
  @ApiPropertyOptional({ description: '使用算法编排（路径优化引擎）替代 LLM 选点' })
  @IsBoolean()
  @IsOptional()
  useAlgorithmicDraft?: boolean;

  /** Travel World Model Phase 4: 路线方向 ID（uuid 或数字），用于候选检索优先 signaturePois / RouteTemplate */
  @ApiPropertyOptional({ description: '路线方向 ID，优先检索该路线的代表性 POI' })
  @IsString()
  @IsOptional()
  routeDirectionId?: string;

  /** 用户指定的城市列表（如杭州、千岛湖），用于候选检索按城市过滤 */
  @ApiPropertyOptional({ description: '城市列表', type: [String], example: ['杭州', '千岛湖'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  cities?: string[];

  /** 必含 POI/景点（如苏堤、灵隐、茶园），编排时优先包含 */
  @ApiPropertyOptional({ description: '必含景点/POI 列表', type: [String], example: ['苏堤', '灵隐寺'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mustHavePois?: string[];

  /** 按天的城市分配（如杭州2天、千岛湖1天），编排时按天分配城市 */
  @ApiPropertyOptional({
    description: '城市天数分配',
    type: 'array',
    items: { type: 'object', properties: { city: { type: 'string' }, days: { type: 'number' } } },
  })
  @IsArray()
  @IsOptional()
  dayAllocation?: Array<{ city: string; days: number }>;

  /** 用户原始输入（供 LLM 编排时参考） */
  @ApiPropertyOptional({ description: '用户原始输入' })
  @IsString()
  @IsOptional()
  userInput?: string;

  /** Phase 1：区域线路 ID（如 golden_circle），与 DSO / RegionIntent 对齐 */
  @ApiPropertyOptional({ description: '区域线路 ID（如 golden_circle）' })
  @IsString()
  @IsOptional()
  region_id?: string;

  @ApiPropertyOptional({ description: '必含 POI slug（与 RegionIntent id 对齐）', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  must_include_poi_ids?: string[];

  @ApiPropertyOptional({ description: '排除 POI slug', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  exclude_poi_ids?: string[];

  @ApiPropertyOptional({ description: '当日可用总时长（分钟）' })
  @IsNumber()
  @IsOptional()
  total_budget_minutes?: number;

  @ApiPropertyOptional({ description: '节奏 relaxed/normal/dense' })
  @IsString()
  @IsOptional()
  pace?: 'relaxed' | 'normal' | 'dense';
}

/**
 * 行程项证据
 */
export class DraftItineraryItemEvidence {
  @ApiPropertyOptional({ description: '营业时间', example: '09:00-18:00' })
  openingHours?: string;

  @ApiPropertyOptional({ description: '距离（米）' })
  distance?: number;

  @ApiPropertyOptional({ description: '评分' })
  rating?: number;

  @ApiPropertyOptional({ description: '数据来源' })
  source?: string;
}

/**
 * 行程草案项
 */
export class DraftItineraryItem {
  @ApiProperty({ description: '地点 ID' })
  placeId!: number;

  @ApiProperty({ enum: TimeSlot, description: '时段' })
  slot!: TimeSlot;

  @ApiProperty({ description: '开始时间（ISO 8601）' })
  startTime!: string;

  @ApiProperty({ description: '结束时间（ISO 8601）' })
  endTime!: string;

  @ApiProperty({ description: '选择原因' })
  reason!: string;

  @ApiPropertyOptional({ description: '备选地点 ID 列表', type: [Number] })
  alternatives?: number[];

  @ApiPropertyOptional({ type: DraftItineraryItemEvidence, description: '证据信息' })
  evidence?: DraftItineraryItemEvidence;
}

/**
 * 行程草案一天的时段
 */
export class DraftDaySlots {
  @ApiPropertyOptional({ type: DraftItineraryItem, description: '上午时段（9:00-12:00）' })
  morning?: DraftItineraryItem;

  @ApiPropertyOptional({ type: DraftItineraryItem, description: '午餐时段（12:00-13:30）' })
  lunch?: DraftItineraryItem;

  @ApiPropertyOptional({ type: DraftItineraryItem, description: '下午时段（13:30-17:30）' })
  afternoon?: DraftItineraryItem;

  @ApiPropertyOptional({ type: DraftItineraryItem, description: '晚餐时段（18:00-20:00）' })
  dinner?: DraftItineraryItem;

  @ApiPropertyOptional({ type: DraftItineraryItem, description: '晚上时段（可选）' })
  evening?: DraftItineraryItem;
}

/**
 * 行程草案一天
 */
export class DraftDay {
  @ApiProperty({ description: '第几天（1, 2, 3...）' })
  day!: number;

  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  date!: string;

  @ApiProperty({ type: DraftDaySlots, description: '时段安排' })
  slots!: DraftDaySlots;
}

/**
 * 行程草案元数据
 */
export class TripDraftMetadata {
  @ApiPropertyOptional({ description: '生成耗时（毫秒）' })
  generationTime?: number;

  @ApiPropertyOptional({ description: 'LLM 提供商' })
  llmProvider?: string;
}

/**
 * 行程草案响应 DTO
 */
export class TripDraftResponseDto {
  @ApiProperty({ description: '目的地国家代码' })
  destination!: string;

  @ApiProperty({ description: '行程天数' })
  days!: number;

  @ApiPropertyOptional({ description: '开始日期（YYYY-MM-DD）' })
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期（YYYY-MM-DD）' })
  endDate?: string;

  @ApiProperty({ type: [DraftDay], description: '每天的行程安排' })
  draftDays!: DraftDay[];

  @ApiProperty({ description: '候选地点总数' })
  candidatesCount!: number;

  @ApiPropertyOptional({ description: '校验警告', type: [String] })
  validationWarnings?: string[];

  @ApiPropertyOptional({ type: TripDraftMetadata, description: '元数据' })
  metadata?: TripDraftMetadata;
}

/**
 * 保存行程草案请求 DTO
 */
export class SaveTripDraftDto {
  @ApiProperty({ type: TripDraftResponseDto, description: '行程草案（来自 /trips/draft 的响应）' })
  @ValidateNested()
  @Type(() => TripDraftResponseDto)
  draft!: TripDraftResponseDto;

  @ApiPropertyOptional({ description: '用户编辑（锁定项、移除项、新增项）' })
  @IsObject()
  @IsOptional()
  userEdits?: {
    lockedItemIds?: string[];
    removedItems?: string[];
    addedItems?: DraftItineraryItem[];
  };
}

/**
 * 替换行程项请求 DTO
 */
export class ReplaceItineraryItemDto {
  @ApiProperty({ 
    enum: ['too_tired', 'weather_change', 'change_style', 'too_far', 'closed', 'other'],
    description: '替换原因' 
  })
  @IsEnum(['too_tired', 'weather_change', 'change_style', 'too_far', 'closed', 'other'])
  reason!: 'too_tired' | 'weather_change' | 'change_style' | 'too_far' | 'closed' | 'other';

  @ApiPropertyOptional({ enum: TravelStyle, description: '偏好的风格' })
  @IsEnum(TravelStyle)
  @IsOptional()
  preferredStyle?: TravelStyle;

  @ApiPropertyOptional({ description: '约束条件' })
  @IsObject()
  @IsOptional()
  constraints?: {
    maxDistance?: number;
    mustBeOpen?: boolean;
    avoidCategories?: string[];
  };
}

/**
 * 替换行程项响应 DTO
 */
export class ReplaceItineraryItemResponseDto {
  @ApiProperty({ type: DraftItineraryItem, description: '新的行程项' })
  newItem!: DraftItineraryItem;

  @ApiProperty({ description: '备选方案列表' })
  alternatives!: Array<{
    placeId: number;
    placeName: string;
    reason: string;
    score: number;
  }>;

  @ApiProperty({ description: '被替换的项' })
  replacedItem!: {
    placeId: number;
    reason: string;
  };
}

/**
 * 重生成行程请求 DTO
 */
export class RegenerateTripDto {
  @ApiPropertyOptional({ description: '锁定的行程项 ID 列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  lockedItemIds?: string[];

  @ApiPropertyOptional({ description: '新的偏好设置' })
  @IsObject()
  @IsOptional()
  newPreferences?: {
    style?: TravelStyle;
    intensity?: IntensityLevel;
    transport?: TransportMode;
    constraints?: TripConstraintsDto;
  };
}

/**
 * 重生成行程变更项
 */
export class RegenerateChangeItem {
  @ApiProperty({ enum: ['added', 'removed', 'replaced', 'moved'], description: '变更类型' })
  type!: 'added' | 'removed' | 'replaced' | 'moved';

  @ApiPropertyOptional({ description: '行程项 ID' })
  itemId?: string;

  @ApiProperty({ description: '地点 ID' })
  placeId!: number;

  @ApiProperty({ description: '地点名称' })
  placeName!: string;

  @ApiProperty({ description: '第几天' })
  day!: number;

  @ApiProperty({ enum: TimeSlot, description: '时段' })
  slot!: TimeSlot;

  @ApiProperty({ description: '变更原因' })
  reason!: string;
}

/**
 * 重生成行程响应 DTO
 */
export class RegenerateTripResponseDto {
  @ApiProperty({ type: TripDraftResponseDto, description: '更新后的草案' })
  updatedDraft!: TripDraftResponseDto;

  @ApiProperty({ type: [RegenerateChangeItem], description: '变更列表' })
  changes!: RegenerateChangeItem[];
}
