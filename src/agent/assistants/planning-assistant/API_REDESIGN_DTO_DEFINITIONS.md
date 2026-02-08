# 规划智能体接口重新设计 - DTO 定义

**文档版本**: 1.0  
**设计日期**: 2026-02-08  
**关联文档**: [API_REDESIGN_PRODUCT_MANAGER.md](./API_REDESIGN_PRODUCT_MANAGER.md)

---

## 📋 目录

- [DTO 设计原则](#dto-设计原则)
- [会话管理 DTO](#会话管理-dto)
- [业务操作 DTO](#业务操作-dto)
- [对话接口 DTO](#对话接口-dto)
- [行程操作 DTO](#行程操作-dto)
- [共享类型定义](#共享类型定义)

---

## 🎯 DTO 设计原则

1. **类型安全**: 使用 TypeScript 严格类型
2. **验证完整**: 使用 class-validator 进行参数验证
3. **文档清晰**: 使用 Swagger 注解提供 API 文档
4. **向后兼容**: 保留现有 DTO，新增 DTO 不破坏现有结构
5. **可扩展性**: 使用可选字段支持未来扩展

---

## 📦 会话管理 DTO

### 创建会话请求

```typescript
// dto/create-session-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class SessionContextDto {
  @ApiPropertyOptional({ description: '关联已创建行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '初始目的地' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: '初始偏好' })
  @IsOptional()
  @IsObject()
  preferences?: {
    budget?: { total: number; currency: string };
    travelers?: { adults: number; children?: number };
    dateRange?: { startDate: string; endDate: string };
    activities?: string[];
    travelStyle?: string;
  };
}

export class CreateSessionRequestDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '初始上下文' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionContextDto)
  context?: SessionContextDto;
}
```

### 创建会话响应

```typescript
// dto/create-session-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionResponseDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  userId?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '过期时间' })
  expiresAt!: string;

  @ApiPropertyOptional({ description: '上下文信息' })
  context?: {
    tripId?: string;
    destination?: string;
  };
}
```

### 会话状态响应

```typescript
// dto/session-state-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DestinationRecommendationDto } from './destination-recommendation.dto';
import { PlanCandidateDto } from './plan-candidate.dto';

export class SessionStateResponseDto {
  @ApiProperty({ description: '会话ID' })
  sessionId!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  userId?: string;

  @ApiProperty({ 
    description: '当前阶段',
    enum: ['INITIAL', 'COLLECTING_PREFERENCES', 'RECOMMENDING', 'COMPARING_PLANS', 'CONFIRMING', 'COMPLETED']
  })
  phase!: string;

  @ApiProperty({ description: '用户偏好' })
  preferences!: Record<string, any>;

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

  @ApiProperty({ description: '过期时间' })
  expiresAt!: string;
}
```

### 对话历史响应

```typescript
// dto/message-history-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({ description: '消息ID' })
  id!: string;

  @ApiProperty({ description: '角色', enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @ApiProperty({ description: '消息内容' })
  content!: string;

  @ApiProperty({ description: '时间戳' })
  timestamp!: string;

  @ApiPropertyOptional({ description: '意图' })
  intent?: string;

  @ApiPropertyOptional({ description: '关联数据' })
  data?: Record<string, any>;
}

export class MessageHistoryResponseDto {
  @ApiProperty({ description: '消息列表', type: [MessageDto] })
  messages!: MessageDto[];

  @ApiProperty({ description: '总数量' })
  total!: number;

  @ApiProperty({ description: '限制数量' })
  limit!: number;

  @ApiProperty({ description: '偏移量' })
  offset!: number;
}
```

---

## 📦 业务操作 DTO

### 推荐请求

```typescript
// dto/recommendations-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber, IsEnum, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class PreferencesDto {
  @ApiPropertyOptional({ description: '预算' })
  @IsOptional()
  @IsObject()
  budget?: { total: number; currency: string };

  @ApiPropertyOptional({ description: '出行人数' })
  @IsOptional()
  @IsObject()
  travelers?: { adults: number; children?: number };

  @ApiPropertyOptional({ description: '活动偏好', type: [String] })
  @IsOptional()
  @IsArray()
  activities?: string[];

  @ApiPropertyOptional({ description: '旅行风格' })
  @IsOptional()
  @IsString()
  travelStyle?: string;
}

export class RecommendationFiltersDto {
  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '地区' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: '排除国家', type: [String] })
  @IsOptional()
  @IsArray()
  excludeCountries?: string[];
}

export class RecommendationsRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '偏好' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @ApiPropertyOptional({ description: '过滤条件' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationFiltersDto)
  filters?: RecommendationFiltersDto;

  @ApiPropertyOptional({ description: '返回数量', default: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
```

### 推荐响应

```typescript
// dto/recommendations-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { DestinationRecommendationDto } from './destination-recommendation.dto';

export class RecommendationsResponseDto {
  @ApiProperty({ description: '推荐列表', type: [DestinationRecommendationDto] })
  recommendations!: DestinationRecommendationDto[];

  @ApiPropertyOptional({ description: '会话ID' })
  sessionId?: string;

  @ApiPropertyOptional({ description: '使用的偏好' })
  preferencesUsed?: Record<string, any>;

  @ApiProperty({ description: '生成时间' })
  generatedAt!: string;
}
```

### 生成方案请求

```typescript
// dto/generate-plan-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, ValidateNested, IsObject, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PreferencesDto } from './recommendations-request.dto';

export class PlanConstraintsDto {
  @ApiPropertyOptional({ description: '最大天数' })
  @IsOptional()
  @IsNumber()
  maxDays?: number;

  @ApiPropertyOptional({ description: '必须包含的地点', type: [String] })
  @IsOptional()
  @IsArray()
  mustInclude?: string[];

  @ApiPropertyOptional({ description: '排除的地点', type: [String] })
  @IsOptional()
  @IsArray()
  exclude?: string[];
}

export class PlanOptionsDto {
  @ApiPropertyOptional({ description: '生成方案数量', default: 3 })
  @IsOptional()
  @IsNumber()
  count?: number;

  @ApiPropertyOptional({ description: '是否包含预算估算', default: true })
  @IsOptional()
  @IsBoolean()
  includeBudget?: boolean;

  @ApiPropertyOptional({ description: '是否包含三人格评价', default: true })
  @IsOptional()
  @IsBoolean()
  includePersonas?: boolean;
}

export class GeneratePlanRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: '目的地' })
  @IsString()
  destination!: string;

  @ApiPropertyOptional({ description: '偏好' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @ApiPropertyOptional({ description: '约束条件' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanConstraintsDto)
  constraints?: PlanConstraintsDto;

  @ApiPropertyOptional({ description: '生成选项' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanOptionsDto)
  options?: PlanOptionsDto;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
```

### 生成方案响应

```typescript
// dto/generate-plan-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { PlanCandidateDto } from './plan-candidate.dto';

export class GeneratePlanResponseDto {
  @ApiProperty({ description: '方案列表', type: [PlanCandidateDto] })
  plans!: PlanCandidateDto[];

  @ApiPropertyOptional({ description: '会话ID' })
  sessionId?: string;

  @ApiProperty({ description: '生成时间' })
  generatedAt!: string;

  @ApiPropertyOptional({ description: '追踪ID' })
  traceId?: string;
}
```

### 异步生成任务状态响应

```typescript
// dto/async-task-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCandidateDto } from './plan-candidate.dto';

export class AsyncTaskResponseDto {
  @ApiProperty({ description: '任务ID' })
  taskId!: string;

  @ApiProperty({ 
    description: '任务状态',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
  })
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @ApiPropertyOptional({ description: '进度百分比' })
  progress?: number;

  @ApiPropertyOptional({ description: '结果（完成时）', type: [PlanCandidateDto] })
  result?: {
    plans: PlanCandidateDto[];
  };

  @ApiPropertyOptional({ description: '错误信息（失败时）' })
  error?: {
    code: string;
    message: string;
    details?: any;
  };

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiPropertyOptional({ description: '完成时间' })
  completedAt?: string;

  @ApiPropertyOptional({ description: '预估耗时（秒）' })
  estimatedDuration?: number;
}
```

### 对比方案请求

```typescript
// dto/compare-plans-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, MinLength } from 'class-validator';

export class ComparePlansRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ 
    description: '方案ID列表（至少2个）',
    type: [String],
    minLength: 2
  })
  @IsArray()
  @MinLength(2, { message: '至少需要2个方案进行对比' })
  planIds!: string[];

  @ApiPropertyOptional({ 
    description: '对比维度',
    type: [String],
    example: ['budget', 'duration', 'pace', 'activities']
  })
  @IsOptional()
  @IsArray()
  compareFields?: string[];

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
```

### 对比方案响应

```typescript
// dto/compare-plans-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class PlanComparisonDto {
  @ApiProperty({ description: '方案ID' })
  id!: string;

  @ApiProperty({ description: '方案名称' })
  name!: string;

  @ApiProperty({ description: '各维度分数' })
  scores!: Record<string, number>;
}

export class ComparisonDifferenceDto {
  @ApiProperty({ description: '对比字段' })
  field!: string;

  @ApiProperty({ description: '方案1的值' })
  plan1Value!: any;

  @ApiProperty({ description: '方案2的值' })
  plan2Value!: any;

  @ApiProperty({ description: '影响程度', enum: ['low', 'medium', 'high'] })
  impact!: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({ description: '描述' })
  description?: string;
}

export class ComparisonRecommendationDto {
  @ApiPropertyOptional({ description: '最佳预算方案ID' })
  bestBudget?: string;

  @ApiPropertyOptional({ description: '最佳路线方案ID' })
  bestRoute?: string;

  @ApiPropertyOptional({ description: '最佳时间方案ID' })
  bestTime?: string;

  @ApiPropertyOptional({ description: '总结' })
  summary?: string;
}

export class ComparePlansResponseDto {
  @ApiProperty({ description: '方案列表', type: [PlanComparisonDto] })
  plans!: PlanComparisonDto[];

  @ApiProperty({ description: '对比维度', type: [String] })
  dimensions!: string[];

  @ApiProperty({ description: '差异列表', type: [ComparisonDifferenceDto] })
  differences!: ComparisonDifferenceDto[];

  @ApiProperty({ description: '推荐', type: ComparisonRecommendationDto })
  recommendation!: ComparisonRecommendationDto;
}
```

### 优化方案请求

```typescript
// dto/optimize-plan-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsEnum, IsObject } from 'class-validator';

export class OptimizationRequirementsDto {
  @ApiPropertyOptional({ description: '放慢节奏' })
  @IsOptional()
  @IsBoolean()
  slowerPace?: boolean;

  @ApiPropertyOptional({ description: '减少预算（金额）' })
  @IsOptional()
  @IsNumber()
  reduceBudget?: number;

  @ApiPropertyOptional({ description: '添加活动', type: [String] })
  @IsOptional()
  @IsArray()
  addActivities?: string[];

  @ApiPropertyOptional({ description: '移除活动', type: [String] })
  @IsOptional()
  @IsArray()
  removeActivities?: string[];
}

export class OptimizePlanRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ 
    description: '优化类型',
    enum: ['pace', 'budget', 'route', 'activities']
  })
  @IsOptional()
  @IsEnum(['pace', 'budget', 'route', 'activities'])
  optimizationType?: 'pace' | 'budget' | 'route' | 'activities';

  @ApiPropertyOptional({ description: '优化要求' })
  @IsOptional()
  requirements?: OptimizationRequirementsDto;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
```

### 确认方案请求

```typescript
// dto/confirm-plan-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class ConfirmPlanRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '保存到日历', default: false })
  @IsOptional()
  @IsBoolean()
  saveToCalendar?: boolean;

  @ApiPropertyOptional({ description: '发送提醒', default: false })
  @IsOptional()
  @IsBoolean()
  sendReminders?: boolean;
}
```

---

## 📦 对话接口 DTO

### 对话请求（保留现有）

```typescript
// dto/chat-request.dto.ts
// 使用现有的 PlanningChatRequestDto，保持不变
```

### 对话响应（增强）

```typescript
// dto/chat-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuggestedActionDto } from './suggested-action.dto';

export class ChatResponseDto {
  @ApiProperty({ description: '回复消息（英文）' })
  message!: string;

  @ApiProperty({ description: '回复消息（中文）' })
  messageCN!: string;

  @ApiProperty({ 
    description: '当前阶段',
    enum: ['INITIAL', 'COLLECTING_PREFERENCES', 'RECOMMENDING', 'COMPARING_PLANS', 'CONFIRMING', 'COMPLETED', 'ADJUSTING']
  })
  phase!: string;

  @ApiPropertyOptional({ description: '建议操作', type: [SuggestedActionDto] })
  suggestedActions?: SuggestedActionDto[];

  @ApiPropertyOptional({ description: '会话ID' })
  sessionId?: string;
}
```

---

## 📦 行程操作 DTO

### 优化行程请求

```typescript
// dto/optimize-trip-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { OptimizationRequirementsDto } from './optimize-plan-request.dto';

export class OptimizeTripRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ 
    description: '优化类型',
    enum: ['pace', 'budget', 'route', 'activities']
  })
  @IsOptional()
  @IsEnum(['pace', 'budget', 'route', 'activities'])
  optimizationType?: 'pace' | 'budget' | 'route' | 'activities';

  @ApiPropertyOptional({ description: '优化要求' })
  @IsOptional()
  requirements?: OptimizationRequirementsDto;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
```

### 细化行程请求

```typescript
// dto/refine-trip-request.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean, IsNumber, IsEnum } from 'class-validator';

export class RefineTripRequestDto {
  @ApiPropertyOptional({ description: '会话ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '要细化的天数（1-based）', type: [Number] })
  @IsOptional()
  @IsArray()
  days?: number[];

  @ApiPropertyOptional({ description: '包含餐厅', default: true })
  @IsOptional()
  @IsBoolean()
  includeRestaurants?: boolean;

  @ApiPropertyOptional({ description: '包含交通', default: true })
  @IsOptional()
  @IsBoolean()
  includeTransport?: boolean;

  @ApiPropertyOptional({ description: '包含活动', default: true })
  @IsOptional()
  @IsBoolean()
  includeActivities?: boolean;

  @ApiPropertyOptional({ description: '语言', enum: ['en', 'zh'], default: 'zh' })
  @IsOptional()
  @IsEnum(['en', 'zh'])
  language?: 'en' | 'zh';
}
```

### 优化建议响应

```typescript
// dto/trip-suggestions-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class TripSuggestionDto {
  @ApiProperty({ description: '建议类型' })
  type!: string;

  @ApiProperty({ description: '标题（英文）' })
  title!: string;

  @ApiProperty({ description: '标题（中文）' })
  titleCN!: string;

  @ApiProperty({ description: '描述（英文）' })
  description!: string;

  @ApiProperty({ description: '描述（中文）' })
  descriptionCN!: string;

  @ApiProperty({ description: '优先级', enum: ['low', 'medium', 'high'] })
  priority!: 'low' | 'medium' | 'high';

  @ApiProperty({ description: '操作建议' })
  action!: {
    type: string;
    params: Record<string, any>;
  };
}

export class TripSuggestionsResponseDto {
  @ApiProperty({ description: '建议列表', type: [TripSuggestionDto] })
  suggestions!: TripSuggestionDto[];

  @ApiProperty({ description: '生成时间' })
  generatedAt!: string;
}
```

---

## 📦 共享类型定义

### 目的地推荐

```typescript
// dto/destination-recommendation.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
```

### 方案候选

```typescript
// dto/plan-candidate.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PersonaEvaluationDto {
  @ApiProperty({ description: '冒险者评价' })
  adventurer!: {
    score: number;
    comment: string;
    commentCN: string;
  };

  @ApiProperty({ description: '规划者评价' })
  planner!: {
    score: number;
    comment: string;
    commentCN: string;
  };

  @ApiProperty({ description: '放松者评价' })
  relaxer!: {
    score: number;
    comment: string;
    commentCN: string;
  };
}

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
    currency: string;
  };

  @ApiProperty({ description: '节奏', enum: ['relaxed', 'moderate', 'intensive'] })
  pace!: 'relaxed' | 'moderate' | 'intensive';

  @ApiProperty({ description: '适合度' })
  suitability!: {
    score: number;
    reasons: string[];
  };

  @ApiPropertyOptional({ description: '三人格评价' })
  personas?: PersonaEvaluationDto;

  @ApiPropertyOptional({ description: '警告', type: [String] })
  warnings?: string[];
}
```

### 建议操作

```typescript
// dto/suggested-action.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class SuggestedActionDto {
  @ApiProperty({ description: '操作标识' })
  action!: string;

  @ApiProperty({ description: '标签（英文）' })
  label!: string;

  @ApiProperty({ description: '标签（中文）' })
  labelCN!: string;

  @ApiPropertyOptional({ description: '参数' })
  params?: Record<string, any>;
}
```

---

## 📝 使用示例

### 在 Controller 中使用

```typescript
// planning-assistant.controller.ts

import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreateSessionRequestDto, CreateSessionResponseDto } from './dto/create-session-request.dto';
import { RecommendationsRequestDto, RecommendationsResponseDto } from './dto/recommendations-request.dto';

@ApiTags('规划助手智能体')
@Controller('agent/planning-assistant')
export class PlanningAssistantController {
  
  @Post('sessions')
  @ApiOperation({ summary: '创建会话' })
  async createSession(
    @Body() dto: CreateSessionRequestDto
  ): Promise<CreateSessionResponseDto> {
    // 实现逻辑
  }

  @Post('recommendations')
  @ApiOperation({ summary: '获取目的地推荐' })
  async getRecommendations(
    @Body() dto: RecommendationsRequestDto
  ): Promise<RecommendationsResponseDto> {
    // 实现逻辑
  }
}
```

---

**文档维护**: 后端开发团队  
**最后更新**: 2026-02-08
