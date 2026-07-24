import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import type { RecruitmentPostStatus, TravelMode, TripMoodTag } from '../types/match-square.types';

const TRIP_MOOD_VALUES = ['relax', 'adventure', 'healing', 'social'] as const;
const TRAVEL_MODE_VALUES = ['self_drive', 'public_transit', 'mixed', 'other'] as const;
const STATUS_VALUES = ['active', 'hidden', 'closed'] as const;
const PLANNING_STYLE_VALUES = ['full_managed', 'co_planning', 'casual_play'] as const;

export class CreateRecruitmentPostDto {
  @ApiPropertyOptional({
    example: '西北环线',
    description: '目的地；传 vibeFreeText 且留空时，服务端尝试从愿景文本推断',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @ApiPropertyOptional({ example: '杭州出发' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  departureLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationPoiId?: string;

  @ApiProperty({ example: '2026-06-20' })
  @IsString()
  startDate!: string;

  @ApiProperty({ example: '2026-06-28' })
  @IsString()
  endDate!: string;

  @ApiPropertyOptional({
    description: '行程概述（≤500字）；若同时传 vibeFreeText 可留空，由解析结果 suggestedItinerarySummary 自动填充',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  itinerarySummary?: string;

  @ApiPropertyOptional({ description: '人均预算下限（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMinCents?: number;

  @ApiPropertyOptional({ description: '人均预算上限（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMaxCents?: number;

  @ApiProperty({ minimum: 1, maximum: 6 })
  @IsInt()
  @Min(1)
  @Max(6)
  slotsNeeded!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preferenceNotes?: string;

  @ApiPropertyOptional({ enum: TRIP_MOOD_VALUES, description: '本次状态：放松/冒险/疗愈/社交' })
  @IsOptional()
  @IsIn([...TRIP_MOOD_VALUES])
  tripMoodTag?: TripMoodTag;

  @ApiProperty({
    enum: PLANNING_STYLE_VALUES,
    description: '策划协作三档：full_managed=全托管, co_planning=一起策划, casual_play=一起随便玩',
    example: 'co_planning',
  })
  @IsIn([...PLANNING_STYLE_VALUES])
  planningStyle!: (typeof PLANNING_STYLE_VALUES)[number];

  @ApiPropertyOptional({ enum: PLANNING_STYLE_VALUES, description: 'snake_case 别名' })
  @IsOptional()
  @IsIn([...PLANNING_STYLE_VALUES])
  planning_style?: (typeof PLANNING_STYLE_VALUES)[number];

  @ApiPropertyOptional({ enum: TRAVEL_MODE_VALUES })
  @IsOptional()
  @IsIn([...TRAVEL_MODE_VALUES])
  travelMode?: TravelMode;

  @ApiPropertyOptional({ description: 'travelMode=self_drive 时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  vehicleInfo?: string;

  @ApiPropertyOptional({ example: '希望搭子对人文历史有兴趣，不赶路' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  captainMessage?: string;

  @ApiPropertyOptional({
    description: 'PRD 4.3 — 自由文本愿景（发布页小作文），触发 Vibe LLM 解析',
    example: '打算自驾环游中国，想搞个做饭穷游组…',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vibeFreeText?: string;

  @ApiPropertyOptional({
    description: 'PRD 4.3 — 发布页 parse 快照（与 POST /vibe-llm/parse 响应同构），优先于服务端重算',
  })
  @IsOptional()
  vibeParse?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  vibe_parse?: Record<string, unknown>;
}

export class UpdateRecruitmentPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  destination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  departureLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationPoiId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  itinerarySummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMinCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMaxCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  slotsNeeded?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preferenceNotes?: string;

  @ApiPropertyOptional({ enum: TRIP_MOOD_VALUES })
  @IsOptional()
  @IsIn([...TRIP_MOOD_VALUES])
  tripMoodTag?: TripMoodTag;

  @ApiPropertyOptional({ enum: PLANNING_STYLE_VALUES })
  @IsOptional()
  @IsIn([...PLANNING_STYLE_VALUES])
  planningStyle?: (typeof PLANNING_STYLE_VALUES)[number];

  @ApiPropertyOptional({ enum: PLANNING_STYLE_VALUES })
  @IsOptional()
  @IsIn([...PLANNING_STYLE_VALUES])
  planning_style?: (typeof PLANNING_STYLE_VALUES)[number];

  @ApiPropertyOptional({ enum: TRAVEL_MODE_VALUES })
  @IsOptional()
  @IsIn([...TRAVEL_MODE_VALUES])
  travelMode?: TravelMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  vehicleInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  captainMessage?: string;
}

export class UpdateRecruitmentPostStatusDto {
  @ApiProperty({ enum: STATUS_VALUES })
  @IsIn([...STATUS_VALUES])
  status!: RecruitmentPostStatus;
}

export class ListRecruitmentPostsQueryDto {
  @ApiPropertyOptional({ description: '目的地模糊匹配' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: '逗号分隔 MBTI，如 INTJ,ENFP' })
  @IsOptional()
  @IsString()
  personaTypes?: string;

  @ApiPropertyOptional({ description: '逗号分隔象限 NT,NF,SP,SJ' })
  @IsOptional()
  @IsString()
  personaQuadrants?: string;

  @ApiPropertyOptional({ description: '逗号分隔相处模式 id' })
  @IsOptional()
  @IsString()
  interactionModes?: string;

  @ApiPropertyOptional({
    description: '逗号分隔策划协作模式：full_managed,co_planning,casual_play',
  })
  @IsOptional()
  @IsString()
  planningStyles?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListMyRecruitmentPostsQueryDto {
  @ApiPropertyOptional({ enum: [...STATUS_VALUES, 'all'] })
  @IsOptional()
  @IsIn([...STATUS_VALUES, 'all'])
  status?: RecruitmentPostStatus | 'all';

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

const APPLICATION_STATUS_VALUES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

export class CreateRecruitmentApplicationDto {
  @ApiProperty({ maxLength: 200, description: '申请留言，必填，≤200 字' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  message!: string;

  @ApiPropertyOptional({
    description: '计划硬度冲突弹窗确认后传 true（PRD 4.3）',
  })
  @IsOptional()
  planningCommitmentAccepted?: boolean;

  @ApiPropertyOptional({
    description: '组队风格契约弹窗确认后传 true（PRD 3.4.4）',
  })
  @IsOptional()
  teamworkCommitmentAccepted?: boolean;

  @ApiPropertyOptional({
    description: '目标拼图槽位序号（1..slotsNeeded；0 为队长位不可申请）',
    minimum: 1,
    maximum: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  targetSlotIndex?: number;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  target_slot_index?: number;

  @ApiPropertyOptional({
    description: '目标槽位 id — `puzzle-slot-{n}` 或 Vibe `vibe-slot-{slot_id}`，与详情 teamPuzzle.slots[].slotId 对齐',
    example: 'puzzle-slot-1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetSlotId?: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  target_slot_id?: string;

  @ApiPropertyOptional({
    description: '目标槽位展示文案 — 通常传 teamPuzzle.slots[].roleLabel',
    example: '建议补位 · 会开车的摄影师',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetSlotLabel?: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  target_slot_label?: string;

  @ApiPropertyOptional({
    description: 'PRD 3.14 — Level 4+ 徒步生存博弈题答案 { [questionId]: optionId }',
  })
  @IsOptional()
  physicalSurvivalQuizAnswers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  physical_survival_quiz_answers?: Record<string, string>;
}

export class DecideRecruitmentApplicationDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';
}

export class ListPostApplicationsQueryDto {
  @ApiPropertyOptional({ enum: APPLICATION_STATUS_VALUES, default: 'pending' })
  @IsOptional()
  @IsIn([...APPLICATION_STATUS_VALUES])
  status?: (typeof APPLICATION_STATUS_VALUES)[number];

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListMyApplicationsQueryDto {
  @ApiPropertyOptional({ enum: [...APPLICATION_STATUS_VALUES, 'all'] })
  @IsOptional()
  @IsIn([...APPLICATION_STATUS_VALUES, 'all'])
  status?: (typeof APPLICATION_STATUS_VALUES)[number] | 'all';

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

const TRAVEL_INTENT_STATUS_VALUES = ['active', 'paused'] as const;
const BUDGET_FLEX_VALUES = ['flexible', 'budget', 'comfort'] as const;

export class UpsertTravelIntentDto {
  @ApiPropertyOptional({ example: '西北或新疆', description: '推荐字段' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationScope?: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination_scope?: string;

  @ApiPropertyOptional({ description: '前端常用别名' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  intentDestination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  intent_destination?: string;

  @ApiPropertyOptional({ example: '2026-06-20' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'snake_case 别名' })
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiPropertyOptional({ enum: BUDGET_FLEX_VALUES, default: 'flexible' })
  @IsOptional()
  @IsIn([...BUDGET_FLEX_VALUES])
  budgetFlex?: (typeof BUDGET_FLEX_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...BUDGET_FLEX_VALUES])
  budget_flex?: (typeof BUDGET_FLEX_VALUES)[number];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  openToCarpool?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  open_to_carpool?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateTravelIntentStatusDto {
  @ApiProperty({ enum: TRAVEL_INTENT_STATUS_VALUES })
  @IsIn([...TRAVEL_INTENT_STATUS_VALUES])
  status!: (typeof TRAVEL_INTENT_STATUS_VALUES)[number];
}

export class SendOliveBranchDto {
  @ApiProperty({ description: '被邀请队员 userId' })
  @IsString()
  @MinLength(1)
  inviteeUserId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteMessage?: string;
}

export class GetUserCredentialsQueryDto {
  @ApiPropertyOptional({
    description: '招募帖 id；当 target 为该帖队长时，trustAssetLine 附带组队风格胶囊',
  })
  @IsOptional()
  @IsString()
  postId?: string;
}

export class RespondOliveBranchDto {
  @ApiProperty({ enum: ['accept', 'decline'] })
  @IsIn(['accept', 'decline'])
  action!: 'accept' | 'decline';
}

export class ParseVibeFreeTextDto {
  @ApiProperty({
    description: '用户自由输入的旅行愿景小作文',
    example: '打算自驾环游中国，想搞个做饭穷游组，路上可以一起露营…',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  freeText!: string;
}

export class SpawnTrekTripDto {
  @ApiPropertyOptional({
    description: '复用已有 Trip；省略则自动创建最小 Trip + TripDay + OWNER 协作关系',
  })
  @IsOptional()
  @IsString()
  tripId?: string;
}

export class InstantiateTripDto {
  @ApiPropertyOptional({
    description: '若已实例化则直接返回已有结果，不抛错（成团自动触发时使用）',
    default: false,
  })
  @IsOptional()
  skipIfExists?: boolean;
}

export class SovereignForceLockDto {
  @ApiPropertyOptional({ description: '队长备注（可选）' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: '仅锁团不自动实例化 Active Trip',
    default: false,
  })
  @IsOptional()
  skipInstantiate?: boolean;
}

export class CollaborativeTaskEventDto {
  @ApiProperty({
    enum: ['confirm', 'rollback', 'ack_timeout'],
    description: '任务行为：确认 / 回滚修订 / 队长标记超时',
  })
  @IsIn(['confirm', 'rollback', 'ack_timeout'])
  action!: 'confirm' | 'rollback' | 'ack_timeout';

  @ApiPropertyOptional({ description: '备注或回滚说明', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: '证据引用（装备清单、截图等）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefs?: string[];

  @ApiPropertyOptional({
    description: 'rollback 时若归因队员体能崩溃，填写被降权 userId → 触发 Layer 0 负反馈',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fitnessSubjectUserId?: string;
}

export class AuthorizeRouteContractDto {
  @ApiPropertyOptional({ description: '指定里程碑；省略则授权全部待签项' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  milestoneId?: string;
}

export class ReorderRouteContractDto {
  @ApiProperty({ description: '新的里程碑顺序（id 全量排列）', type: [String] })
  @IsArray()
  @IsString({ each: true })
  milestoneIds!: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class TripDecisionEventDto {
  @ApiProperty({ enum: ['route_rollback'], description: '决策事件类型' })
  @IsIn(['route_rollback'])
  type!: 'route_rollback';

  @ApiProperty({
    enum: ['propose', 'confirm', 'protest'],
    description: 'propose=队长提案；confirm=队员确认；protest=队员异议',
  })
  @IsIn(['propose', 'confirm', 'protest'])
  action!: 'propose' | 'confirm' | 'protest';

  @ApiPropertyOptional({ description: 'Plan B 引用（propose 必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  planBRef?: string;

  @ApiPropertyOptional({ description: '关联里程碑 id' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  milestoneId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefs?: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CommitTemplateBackflowDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: '若已提交则返回已有结果，不抛错' })
  @IsOptional()
  skipIfExists?: boolean;
}

export class PhysicalFitnessEventDto {
  @ApiProperty({
    enum: ['route_rollback', 'mid_trip_evacuation', 'rescue_called', 'member_fitness_collapse'],
    description: '行后体能风控事件类型',
  })
  @IsIn(['route_rollback', 'mid_trip_evacuation', 'rescue_called', 'member_fitness_collapse'])
  eventType!:
    | 'route_rollback'
    | 'mid_trip_evacuation'
    | 'rescue_called'
    | 'member_fitness_collapse';

  @ApiProperty({ description: '被降权队员 userId' })
  @IsString()
  @MaxLength(64)
  subjectUserId!: string;

  @ApiPropertyOptional({ description: '脱敏实证标签', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  evidenceLabel?: string;
}

const emptyQueryValueToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' || trimmed === 'undefined' || trimmed === 'null'
    ? undefined
    : trimmed;
};

/** Master MatchSquareService (recruiting runtime) DTOs — kept alongside recruitment API DTOs above. */
export class ListPostsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional()
  @Transform(emptyQueryValueToUndefined)
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @Transform(emptyQueryValueToUndefined)
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Comma-separated MBTI types' })
  @IsOptional()
  @IsString()
  personaTypes?: string;

  @ApiPropertyOptional({ description: 'Comma-separated quadrants NT,NF,SP,SJ' })
  @IsOptional()
  @IsString()
  personaQuadrants?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interactionModes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planningStyles?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreatePostDto {
  @ApiProperty()
  @IsString()
  destination!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departureLabel?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itinerarySummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetMinCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  budgetMaxCents?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  slotsNeeded!: number;

  @ApiProperty({ enum: ['full_managed', 'co_planning', 'casual_play'] })
  @IsEnum(['full_managed', 'co_planning', 'casual_play'])
  planningStyle!: 'full_managed' | 'co_planning' | 'casual_play';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferences?: string;

  @ApiPropertyOptional({ enum: ['relax', 'adventure', 'healing', 'social'] })
  @IsOptional()
  @IsEnum(['relax', 'adventure', 'healing', 'social'])
  tripMoodTag?: 'relax' | 'adventure' | 'healing' | 'social';

  @ApiPropertyOptional({ enum: ['self_drive', 'public_transit', 'mixed', 'other'] })
  @IsOptional()
  @IsEnum(['self_drive', 'public_transit', 'mixed', 'other'])
  travelMode?: 'self_drive' | 'public_transit' | 'mixed' | 'other';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleInfo?: string;

  @ApiProperty()
  @IsString()
  captainMessage!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vibeFreeText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  vibeParse?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  routeDirectionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  routeDirectionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  coordinates?: { lat?: number; lng?: number };
}

export class UpdatePostStatusDto {
  @ApiProperty({ enum: ['active', 'hidden', 'closed'] })
  @IsEnum(['active', 'hidden', 'closed'])
  status!: 'active' | 'hidden' | 'closed';
}

export class SubmitApplicationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  planningCommitmentAccepted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  teamworkCommitmentAccepted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetSlotIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetSlotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetSlotLabel?: string;
}

export class ReviewApplicationDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  compatibilityScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['high', 'medium', 'low'])
  mbtiCompatibility?: 'high' | 'medium' | 'low';

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicantSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  scheduleConflict?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['excellent', 'good', 'poor'])
  timeAvailability?: 'excellent' | 'good' | 'poor';

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['perfect', 'acceptable', 'poor'])
  budgetFit?: 'perfect' | 'acceptable' | 'poor';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captainPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slotRequirement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  teamBalance?: {
    genderBalance?: number;
    ageBalance?: number;
    roleBalance?: number;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pastCollaboration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ each: true })
  governanceFlags?: string[];
}
