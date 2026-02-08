# 规划智能体接口重新设计 - 实现指南

**文档版本**: 1.0  
**设计日期**: 2026-02-08  
**关联文档**: 
- [API_REDESIGN_PRODUCT_MANAGER.md](./API_REDESIGN_PRODUCT_MANAGER.md)
- [API_REDESIGN_DTO_DEFINITIONS.md](./API_REDESIGN_DTO_DEFINITIONS.md)
- [API_REDESIGN_ERROR_HANDLING.md](./API_REDESIGN_ERROR_HANDLING.md)

---

## 📋 目录

- [实现步骤](#实现步骤)
- [代码结构](#代码结构)
- [实现示例](#实现示例)
- [测试指南](#测试指南)
- [部署检查清单](#部署检查清单)

---

## 🚀 实现步骤

### 阶段1: 准备工作（1-2天）

1. ✅ **创建新的 DTO 文件**
   - 创建 `dto/v2/` 目录
   - 将所有新 DTO 放入该目录
   - 保持现有 DTO 不变（向后兼容）

2. ✅ **创建新的 Controller**
   - 创建 `planning-assistant-v2.controller.ts`
   - 或使用路由版本控制：`@Controller('agent/planning-assistant/v2')`

3. ✅ **更新 Service 层**
   - 在现有 Service 中添加新方法
   - 或创建新的 Service 方法

### 阶段2: 实现核心接口（1周）

**优先级顺序**:
1. 会话管理接口（P0）
2. 推荐接口（P0）
3. 方案生成接口（P0）
4. 方案对比接口（P1）
5. 方案优化接口（P1）
6. 行程操作接口（P1）

### 阶段3: 测试和文档（3-5天）

1. ✅ 单元测试
2. ✅ 集成测试
3. ✅ API 文档更新
4. ✅ 前端对接文档

### 阶段4: 灰度发布（1周）

1. ✅ 内部测试
2. ✅ 小范围用户测试
3. ✅ 监控和优化
4. ✅ 全量发布

---

## 📁 代码结构

```
src/agent/assistants/planning-assistant/
├── dto/
│   ├── planning-assistant.dto.ts          # 现有 DTO（保留）
│   └── v2/                                # 新 DTO
│       ├── create-session-request.dto.ts
│       ├── create-session-response.dto.ts
│       ├── recommendations-request.dto.ts
│       ├── recommendations-response.dto.ts
│       ├── generate-plan-request.dto.ts
│       ├── generate-plan-response.dto.ts
│       ├── compare-plans-request.dto.ts
│       ├── compare-plans-response.dto.ts
│       ├── optimize-plan-request.dto.ts
│       ├── confirm-plan-request.dto.ts
│       ├── optimize-trip-request.dto.ts
│       ├── refine-trip-request.dto.ts
│       ├── chat-request.dto.ts
│       ├── chat-response.dto.ts
│       ├── error-response.dto.ts
│       └── shared/                        # 共享类型
│           ├── destination-recommendation.dto.ts
│           ├── plan-candidate.dto.ts
│           └── suggested-action.dto.ts
│
├── controllers/
│   ├── planning-assistant.controller.ts    # 现有 Controller（保留）
│   └── planning-assistant-v2.controller.ts # 新 Controller
│
├── services/
│   ├── planning-assistant.service.ts      # 现有 Service（扩展）
│   └── planning-assistant-v2.service.ts   # 新 Service（可选）
│
└── exceptions/
    └── planning-assistant.exceptions.ts   # 自定义异常
```

---

## 💻 实现示例

### 1. Controller 实现示例

```typescript
// controllers/planning-assistant-v2.controller.ts

import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { PlanningAssistantV2Service } from '../services/planning-assistant-v2.service';
import { CreateSessionRequestDto, CreateSessionResponseDto } from '../dto/v2/create-session-request.dto';
import { SessionStateResponseDto } from '../dto/v2/session-state-response.dto';
import { RecommendationsRequestDto, RecommendationsResponseDto } from '../dto/v2/recommendations-request.dto';
import { GeneratePlanRequestDto, GeneratePlanResponseDto } from '../dto/v2/generate-plan-request.dto';
import { ComparePlansRequestDto, ComparePlansResponseDto } from '../dto/v2/compare-plans-request.dto';
import { ErrorResponseDto } from '../dto/v2/error-response.dto';

@ApiTags('规划助手智能体 V2')
@Controller('agent/planning-assistant/v2')
export class PlanningAssistantV2Controller {
  constructor(
    private readonly planningAssistantV2Service: PlanningAssistantV2Service
  ) {}

  /**
   * 创建会话
   */
  @Public()
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建新的规划会话' })
  @ApiResponse({
    status: 201,
    description: '会话创建成功',
    type: CreateSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ErrorResponseDto,
  })
  async createSession(
    @Body() dto: CreateSessionRequestDto
  ): Promise<CreateSessionResponseDto> {
    return await this.planningAssistantV2Service.createSession(dto);
  }

  /**
   * 获取会话状态
   */
  @Public()
  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '获取会话状态' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: SessionStateResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '会话不存在',
    type: ErrorResponseDto,
  })
  async getSessionState(
    @Param('sessionId') sessionId: string
  ): Promise<SessionStateResponseDto> {
    return await this.planningAssistantV2Service.getSessionState(sessionId);
  }

  /**
   * 删除会话
   */
  @Public()
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除会话' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({
    status: 200,
    description: '删除成功',
  })
  @ApiResponse({
    status: 404,
    description: '会话不存在',
    type: ErrorResponseDto,
  })
  async deleteSession(
    @Param('sessionId') sessionId: string
  ): Promise<{ success: boolean; sessionId: string }> {
    await this.planningAssistantV2Service.deleteSession(sessionId);
    return { success: true, sessionId };
  }

  /**
   * 获取目的地推荐
   */
  @Public()
  @Post('recommendations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取目的地推荐' })
  @ApiResponse({
    status: 200,
    description: '推荐成功',
    type: RecommendationsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ErrorResponseDto,
  })
  async getRecommendations(
    @Body() dto: RecommendationsRequestDto
  ): Promise<RecommendationsResponseDto> {
    return await this.planningAssistantV2Service.getRecommendations(dto);
  }

  /**
   * 生成方案（同步）
   */
  @Public()
  @Post('plans/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成方案（同步）' })
  @ApiResponse({
    status: 200,
    description: '生成成功',
    type: GeneratePlanResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ErrorResponseDto,
  })
  async generatePlan(
    @Body() dto: GeneratePlanRequestDto
  ): Promise<GeneratePlanResponseDto> {
    return await this.planningAssistantV2Service.generatePlan(dto);
  }

  /**
   * 生成方案（异步）
   */
  @Public()
  @Post('plans/generate-async')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '生成方案（异步）' })
  @ApiResponse({
    status: 202,
    description: '任务已创建',
  })
  async generatePlanAsync(
    @Body() dto: GeneratePlanRequestDto
  ): Promise<{ taskId: string; status: string; estimatedDuration: number }> {
    return await this.planningAssistantV2Service.generatePlanAsync(dto);
  }

  /**
   * 查询生成任务状态
   */
  @Public()
  @Get('plans/generate/:taskId')
  @ApiOperation({ summary: '查询生成任务状态' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  async getGenerateTaskStatus(
    @Param('taskId') taskId: string
  ) {
    return await this.planningAssistantV2Service.getGenerateTaskStatus(taskId);
  }

  /**
   * 对比方案
   */
  @Public()
  @Post('plans/compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '对比方案' })
  @ApiResponse({
    status: 200,
    description: '对比成功',
    type: ComparePlansResponseDto,
  })
  async comparePlans(
    @Body() dto: ComparePlansRequestDto
  ): Promise<ComparePlansResponseDto> {
    return await this.planningAssistantV2Service.comparePlans(dto);
  }

  // ... 其他接口
}
```

### 2. Service 实现示例

```typescript
// services/planning-assistant-v2.service.ts

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateSessionRequestDto, CreateSessionResponseDto } from '../dto/v2/create-session-request.dto';
import { RecommendationsRequestDto, RecommendationsResponseDto } from '../dto/v2/recommendations-request.dto';
import { GeneratePlanRequestDto, GeneratePlanResponseDto } from '../dto/v2/generate-plan-request.dto';
import { PlanningAssistantService } from './planning-assistant.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';

@Injectable()
export class PlanningAssistantV2Service {
  private readonly logger = new Logger(PlanningAssistantV2Service.name);

  constructor(
    private readonly planningAssistantService: PlanningAssistantService,
    private readonly coreGateway: CoreGatewayService,
    private readonly recommendationEngine: RecommendationEngineService,
  ) {}

  /**
   * 创建会话
   */
  async createSession(dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
    this.logger.debug(`创建会话: userId=${dto.userId}`);

    const sessionId = await this.planningAssistantService.createSession(dto.userId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24小时

    return {
      sessionId,
      userId: dto.userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      context: dto.context,
    };
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string): Promise<SessionStateResponseDto> {
    this.logger.debug(`获取会话状态: sessionId=${sessionId}`);

    const state = await this.planningAssistantService.getSessionState(sessionId);
    
    if (!state) {
      throw new NotFoundException({
        success: false,
        errorCode: '2001',
        message: 'Session not found',
        messageCN: '会话不存在',
        details: { sessionId },
      });
    }

    // 检查是否过期
    const expiresAt = new Date(state.expiresAt);
    if (expiresAt < new Date()) {
      throw new NotFoundException({
        success: false,
        errorCode: '2002',
        message: 'Session expired',
        messageCN: '会话已过期',
        details: { sessionId, expiresAt: expiresAt.toISOString() },
      });
    }

    return {
      sessionId: state.sessionId,
      userId: state.userId,
      phase: state.phase,
      preferences: state.preferences,
      recommendations: state.recommendations,
      selectedDestination: state.selectedDestination,
      planCandidates: state.planCandidates,
      selectedPlanId: state.selectedPlanId,
      confirmedTripId: state.confirmedTripId,
      messageCount: state.messageHistory.length,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      expiresAt: state.expiresAt,
    };
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.logger.debug(`删除会话: sessionId=${sessionId}`);

    const state = await this.planningAssistantService.getSessionState(sessionId);
    if (!state) {
      throw new NotFoundException({
        success: false,
        errorCode: '2001',
        message: 'Session not found',
        messageCN: '会话不存在',
        details: { sessionId },
      });
    }

    // 实现删除逻辑（需要添加到 PlanningAssistantService）
    // await this.planningAssistantService.deleteSession(sessionId);
  }

  /**
   * 获取目的地推荐
   */
  async getRecommendations(dto: RecommendationsRequestDto): Promise<RecommendationsResponseDto> {
    this.logger.debug(`获取推荐: sessionId=${dto.sessionId}, filters=${JSON.stringify(dto.filters)}`);

    // 验证 limit
    const limit = dto.limit || 10;
    if (limit < 1 || limit > 50) {
      throw new BadRequestException({
        success: false,
        errorCode: '1001',
        message: 'Invalid limit parameter',
        messageCN: 'limit 参数无效',
        details: {
          field: 'limit',
          reason: 'Limit must be between 1 and 50',
          provided: limit,
        },
      });
    }

    // 合并偏好（如果提供了 sessionId）
    let mergedPreferences = dto.preferences || {};
    if (dto.sessionId) {
      const state = await this.planningAssistantService.getSessionState(dto.sessionId);
      if (state) {
        mergedPreferences = { ...state.preferences, ...mergedPreferences };
      }
    }

    // 调用推荐引擎
    const scoredDestinations = await this.recommendationEngine.getRecommendations({
      preferences: mergedPreferences,
      countryCode: dto.filters?.countryCode,
      limit,
    });

    // 转换为响应格式
    const recommendations = scoredDestinations.map(dest => ({
      id: dest.id,
      countryCode: dest.countryCode,
      name: dest.name,
      nameCN: dest.nameCN,
      description: dest.description,
      descriptionCN: dest.descriptionCN,
      highlights: dest.highlights,
      highlightsCN: dest.highlightsCN,
      matchScore: dest.matchScore,
      matchReasons: dest.matchReasons,
      matchReasonsCN: dest.matchReasonsCN,
      estimatedBudget: dest.estimatedBudget,
      bestSeasons: dest.bestSeasons,
      imageUrl: dest.imageUrl,
      tags: dest.tags,
    }));

    return {
      recommendations,
      sessionId: dto.sessionId,
      preferencesUsed: mergedPreferences,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成方案（同步）
   */
  async generatePlan(dto: GeneratePlanRequestDto): Promise<GeneratePlanResponseDto> {
    this.logger.debug(`生成方案: destination=${dto.destination}`);

    // 验证目的地
    if (!dto.destination || dto.destination.trim() === '') {
      throw new BadRequestException({
        success: false,
        errorCode: '3001',
        message: 'Destination is required',
        messageCN: '目的地必填',
        details: {
          field: 'destination',
          suggestion: 'Please provide a destination',
        },
      });
    }

    // 合并偏好
    let mergedPreferences = dto.preferences || {};
    if (dto.sessionId) {
      const state = await this.planningAssistantService.getSessionState(dto.sessionId);
      if (state) {
        mergedPreferences = { ...state.preferences, ...mergedPreferences };
      }
    }

    // 调用 CoreGateway
    const coreResult = await this.coreGateway.generatePlan({
      userId: dto.userId || 'anonymous',
      sessionId: dto.sessionId || '',
      destination: dto.destination,
      preferences: mergedPreferences,
      constraints: dto.constraints,
    });

    if (!coreResult.success || !coreResult.data) {
      throw new BadRequestException({
        success: false,
        errorCode: '3004',
        message: 'Plan generation failed',
        messageCN: '方案生成失败',
        details: coreResult.error,
        traceId: coreResult.meta?.traceId,
      });
    }

    // 转换响应格式
    const workbenchResponse = coreResult.data as any;
    const plans = workbenchResponse.uiOutput?.skeletonOptions?.options?.map((opt: any, index: number) => ({
      id: `plan_${index}`,
      name: opt.name || `Option ${index + 1}`,
      nameCN: `方案 ${index + 1}`,
      description: opt.description || '',
      descriptionCN: opt.descriptionCN || '',
      destination: dto.destination,
      duration: dto.constraints?.maxDays || 10,
      highlights: opt.highlights || [],
      estimatedBudget: opt.budget || {
        total: 5000,
        breakdown: { flight: 1500, accommodation: 2000, activities: 1000, food: 500, other: 0 },
        currency: 'USD',
      },
      pace: opt.pace || 'moderate',
      suitability: {
        score: 90 - index * 5,
        reasons: [],
      },
      personas: dto.options?.includePersonas ? workbenchResponse.uiOutput?.personas : undefined,
      warnings: opt.warnings || [],
    })) || [];

    return {
      plans,
      sessionId: dto.sessionId,
      generatedAt: new Date().toISOString(),
      traceId: coreResult.meta?.traceId,
    };
  }

  /**
   * 生成方案（异步）
   */
  async generatePlanAsync(dto: GeneratePlanRequestDto): Promise<{ taskId: string; status: string; estimatedDuration: number }> {
    // 创建异步任务
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 保存任务状态（需要实现任务管理服务）
    // await this.taskService.createTask(taskId, dto);
    
    // 异步执行（后台任务）
    this.generatePlanAsyncInternal(taskId, dto).catch(error => {
      this.logger.error(`异步生成方案失败: taskId=${taskId}`, error);
    });

    return {
      taskId,
      status: 'PENDING',
      estimatedDuration: 30, // 预估30秒
    };
  }

  private async generatePlanAsyncInternal(taskId: string, dto: GeneratePlanRequestDto): Promise<void> {
    try {
      // 更新任务状态为 PROCESSING
      // await this.taskService.updateTaskStatus(taskId, 'PROCESSING');
      
      // 生成方案
      const result = await this.generatePlan(dto);
      
      // 更新任务状态为 COMPLETED
      // await this.taskService.updateTaskStatus(taskId, 'COMPLETED', result);
    } catch (error) {
      // 更新任务状态为 FAILED
      // await this.taskService.updateTaskStatus(taskId, 'FAILED', null, error);
      throw error;
    }
  }

  /**
   * 查询生成任务状态
   */
  async getGenerateTaskStatus(taskId: string) {
    // 查询任务状态（需要实现任务管理服务）
    // const task = await this.taskService.getTask(taskId);
    // if (!task) {
    //   throw new NotFoundException({
    //     success: false,
    //     errorCode: '4001',
    //     message: 'Task not found',
    //     messageCN: '任务不存在',
    //     details: { taskId },
    //   });
    // }
    // return task;
    
    // 临时实现
    return {
      taskId,
      status: 'COMPLETED',
      progress: 100,
      result: { plans: [] },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * 对比方案
   */
  async comparePlans(dto: ComparePlansRequestDto): Promise<ComparePlansResponseDto> {
    this.logger.debug(`对比方案: planIds=${dto.planIds.join(',')}`);

    // 验证方案数量
    if (dto.planIds.length < 2) {
      throw new BadRequestException({
        success: false,
        errorCode: '3003',
        message: 'At least 2 plans are required for comparison',
        messageCN: '至少需要2个方案进行对比',
        details: {
          provided: dto.planIds.length,
          required: 2,
        },
      });
    }

    // 获取所有方案（需要实现方案存储和查询）
    // const plans = await Promise.all(
    //   dto.planIds.map(id => this.planService.getPlan(id))
    // );

    // 对比逻辑（简化实现）
    const plans = dto.planIds.map((id, index) => ({
      id,
      name: `Plan ${index + 1}`,
      scores: {
        budget: 80 + index * 5,
        duration: 85 - index * 3,
        pace: 75 + index * 2,
        activities: 90 - index * 5,
      },
    }));

    const dimensions = dto.compareFields || ['budget', 'duration', 'pace', 'activities'];
    const differences: any[] = [];
    const recommendation = {
      bestBudget: plans[0].id,
      bestRoute: plans[1]?.id,
      bestTime: plans[0].id,
      summary: '方案1在预算和时间上更优，方案2在路线安排上更合理',
    };

    return {
      plans,
      dimensions,
      differences,
      recommendation,
    };
  }
}
```

### 3. 异常定义

```typescript
// exceptions/planning-assistant.exceptions.ts

import { HttpException, HttpStatus } from '@nestjs/common';

export class SessionNotFoundException extends HttpException {
  constructor(sessionId: string) {
    super(
      {
        success: false,
        errorCode: '2001',
        message: 'Session not found',
        messageCN: '会话不存在',
        details: { sessionId },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class SessionExpiredException extends HttpException {
  constructor(sessionId: string) {
    super(
      {
        success: false,
        errorCode: '2002',
        message: 'Session expired',
        messageCN: '会话已过期',
        details: { sessionId },
      },
      HttpStatus.GONE,
    );
  }
}

export class DestinationRequiredException extends HttpException {
  constructor() {
    super(
      {
        success: false,
        errorCode: '3001',
        message: 'Destination is required',
        messageCN: '目的地必填',
        details: {
          field: 'destination',
          suggestion: 'Please provide a destination',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class PlanNotFoundException extends HttpException {
  constructor(planId: string) {
    super(
      {
        success: false,
        errorCode: '3002',
        message: 'Plan not found',
        messageCN: '方案不存在',
        details: { planId },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InsufficientPlansException extends HttpException {
  constructor(provided: number) {
    super(
      {
        success: false,
        errorCode: '3003',
        message: 'At least 2 plans are required for comparison',
        messageCN: '至少需要2个方案进行对比',
        details: {
          provided,
          required: 2,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
```

---

## 🧪 测试指南

### 单元测试示例

```typescript
// planning-assistant-v2.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { PlanningAssistantV2Service } from './planning-assistant-v2.service';
import { PlanningAssistantService } from './planning-assistant.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';
import { SessionNotFoundException } from '../exceptions/planning-assistant.exceptions';

describe('PlanningAssistantV2Service', () => {
  let service: PlanningAssistantV2Service;
  let planningAssistantService: jest.Mocked<PlanningAssistantService>;
  let coreGateway: jest.Mocked<CoreGatewayService>;
  let recommendationEngine: jest.Mocked<RecommendationEngineService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningAssistantV2Service,
        {
          provide: PlanningAssistantService,
          useValue: {
            createSession: jest.fn(),
            getSessionState: jest.fn(),
          },
        },
        {
          provide: CoreGatewayService,
          useValue: {
            generatePlan: jest.fn(),
          },
        },
        {
          provide: RecommendationEngineService,
          useValue: {
            getRecommendations: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlanningAssistantV2Service>(PlanningAssistantV2Service);
    planningAssistantService = module.get(PlanningAssistantService);
    coreGateway = module.get(CoreGatewayService);
    recommendationEngine = module.get(RecommendationEngineService);
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const dto = { userId: 'user_123' };
      planningAssistantService.createSession.mockResolvedValue('session_789');

      const result = await service.createSession(dto);

      expect(result.sessionId).toBe('session_789');
      expect(result.userId).toBe('user_123');
      expect(result.createdAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('getSessionState', () => {
    it('should throw SessionNotFoundException when session not found', async () => {
      planningAssistantService.getSessionState.mockResolvedValue(null);

      await expect(
        service.getSessionState('session_789')
      ).rejects.toThrow(SessionNotFoundException);
    });

    it('should return session state when session exists', async () => {
      const mockState = {
        sessionId: 'session_789',
        userId: 'user_123',
        phase: 'RECOMMENDING',
        preferences: {},
        recommendations: [],
        planCandidates: [],
        messageHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      planningAssistantService.getSessionState.mockResolvedValue(mockState);

      const result = await service.getSessionState('session_789');

      expect(result.sessionId).toBe('session_789');
      expect(result.phase).toBe('RECOMMENDING');
    });
  });

  describe('getRecommendations', () => {
    it('should throw error when limit is out of range', async () => {
      const dto = { limit: 100 };

      await expect(
        service.getRecommendations(dto)
      ).rejects.toThrow();
    });

    it('should return recommendations successfully', async () => {
      const dto = { limit: 10 };
      const mockRecommendations = [
        {
          id: 'dest_1',
          countryCode: 'IS',
          name: 'Iceland',
          nameCN: '冰岛',
          matchScore: 95,
          // ... 其他字段
        },
      ];

      recommendationEngine.getRecommendations.mockResolvedValue(mockRecommendations);

      const result = await service.getRecommendations(dto);

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].id).toBe('dest_1');
    });
  });
});
```

---

## ✅ 部署检查清单

### 代码检查

- [ ] 所有新 DTO 已创建并验证
- [ ] Controller 已实现所有接口
- [ ] Service 已实现所有业务逻辑
- [ ] 异常处理已实现
- [ ] 错误响应格式统一

### 测试检查

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试已通过
- [ ] 错误场景测试已覆盖
- [ ] 性能测试已通过

### 文档检查

- [ ] API 文档已更新
- [ ] 前端对接文档已更新
- [ ] 错误处理文档已更新
- [ ] 迁移指南已更新

### 部署检查

- [ ] 数据库迁移脚本已准备
- [ ] 环境变量已配置
- [ ] 监控告警已配置
- [ ] 日志记录已配置

---

**文档维护**: 后端开发团队  
**最后更新**: 2026-02-08
