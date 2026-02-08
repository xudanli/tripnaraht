# 规划智能体接口重新设计 - 代码模板

**版本**: 1.0  
**创建日期**: 2026-02-08  
**用途**: 提供代码模板，加速开发

---

## 📋 目录

- [Controller模板](#controller模板)
- [Service模板](#service模板)
- [DTO模板](#dto模板)
- [异常定义模板](#异常定义模板)
- [测试模板](#测试模板)

---

## 🎯 Controller模板

### 基础Controller模板

```typescript
// src/agent/assistants/planning-assistant/controllers/planning-assistant-v2.controller.ts

import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { PlanningAssistantV2Service } from '../services/planning-assistant-v2.service';
import { CreateSessionRequestDto, CreateSessionResponseDto } from '../dto/v2/create-session-request.dto';
import { ErrorResponseDto } from '../dto/v2/error-response.dto';

@ApiTags('规划助手智能体 V2')
@Controller('agent/planning-assistant/v2')
export class PlanningAssistantV2Controller {
  constructor(
    private readonly planningAssistantV2Service: PlanningAssistantV2Service
  ) {}

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

  // ... 其他接口
}
```

---

## 🔧 Service模板

### 基础Service模板

```typescript
// src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateSessionRequestDto, CreateSessionResponseDto } from '../dto/v2/create-session-request.dto';
import { PlanningAssistantService } from './planning-assistant.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';
import { CacheService } from '../../../common/cache/cache.service';

@Injectable()
export class PlanningAssistantV2Service {
  private readonly logger = new Logger(PlanningAssistantV2Service.name);

  constructor(
    private readonly planningAssistantService: PlanningAssistantService,
    private readonly coreGateway: CoreGatewayService,
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 创建会话
   */
  async createSession(dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
    this.logger.debug(`创建会话: userId=${dto.userId}`);

    try {
      const sessionId = await this.planningAssistantService.createSession(dto.userId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const response: CreateSessionResponseDto = {
        sessionId,
        userId: dto.userId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        context: dto.context,
      };

      // 缓存会话状态
      await this.cacheService.set(
        `session:${sessionId}`,
        response,
        86400 // 24小时
      );

      return response;
    } catch (error: any) {
      this.logger.error(`创建会话失败: ${error.message}`, error.stack);
      throw new BadRequestException({
        success: false,
        errorCode: '1008',
        message: 'Failed to create session',
        messageCN: '创建会话失败',
        details: { error: error.message },
      });
    }
  }

  // ... 其他方法
}
```

---

## 📦 DTO模板

### 请求DTO模板

```typescript
// src/agent/assistants/planning-assistant/dto/v2/create-session-request.dto.ts

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
  preferences?: Record<string, any>;
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

### 响应DTO模板

```typescript
// src/agent/assistants/planning-assistant/dto/v2/create-session-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

---

## ⚠️ 异常定义模板

```typescript
// src/agent/assistants/planning-assistant/exceptions/planning-assistant.exceptions.ts

import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorResponseDto } from '../dto/v2/error-response.dto';

export class SessionNotFoundException extends HttpException {
  constructor(sessionId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '2001',
      message: 'Session not found',
      messageCN: '会话不存在',
      details: { sessionId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.NOT_FOUND);
  }
}

export class SessionExpiredException extends HttpException {
  constructor(sessionId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '2002',
      message: 'Session expired',
      messageCN: '会话已过期',
      details: { sessionId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.GONE);
  }
}

export class DestinationRequiredException extends HttpException {
  constructor() {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3001',
      message: 'Destination is required',
      messageCN: '目的地必填',
      details: {
        field: 'destination',
        suggestion: 'Please provide a destination',
      },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.BAD_REQUEST);
  }
}

// ... 其他异常
```

---

## 🧪 测试模板

### Controller测试模板

```typescript
// src/agent/assistants/planning-assistant/controllers/planning-assistant-v2.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { PlanningAssistantV2Controller } from './planning-assistant-v2.controller';
import { PlanningAssistantV2Service } from '../services/planning-assistant-v2.service';
import { SessionNotFoundException } from '../exceptions/planning-assistant.exceptions';

describe('PlanningAssistantV2Controller', () => {
  let controller: PlanningAssistantV2Controller;
  let service: jest.Mocked<PlanningAssistantV2Service>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanningAssistantV2Controller],
      providers: [
        {
          provide: PlanningAssistantV2Service,
          useValue: {
            createSession: jest.fn(),
            getSessionState: jest.fn(),
            deleteSession: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PlanningAssistantV2Controller>(PlanningAssistantV2Controller);
    service = module.get(PlanningAssistantV2Service);
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const dto = { userId: 'user_123' };
      const expectedResponse = {
        sessionId: 'session_789',
        userId: 'user_123',
        createdAt: '2026-02-08T10:00:00Z',
        expiresAt: '2026-02-09T10:00:00Z',
      };

      service.createSession.mockResolvedValue(expectedResponse);

      const result = await controller.createSession(dto);

      expect(result).toEqual(expectedResponse);
      expect(service.createSession).toHaveBeenCalledWith(dto);
    });
  });

  describe('getSessionState', () => {
    it('should throw SessionNotFoundException when session not found', async () => {
      service.getSessionState.mockRejectedValue(
        new SessionNotFoundException('session_789')
      );

      await expect(
        controller.getSessionState('session_789')
      ).rejects.toThrow(SessionNotFoundException);
    });
  });
});
```

### Service测试模板

```typescript
// src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { PlanningAssistantV2Service } from './planning-assistant-v2.service';
import { PlanningAssistantService } from './planning-assistant.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';
import { CacheService } from '../../../common/cache/cache.service';
import { SessionNotFoundException } from '../exceptions/planning-assistant.exceptions';

describe('PlanningAssistantV2Service', () => {
  let service: PlanningAssistantV2Service;
  let planningAssistantService: jest.Mocked<PlanningAssistantService>;
  let cacheService: jest.Mocked<CacheService>;

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
          useValue: {},
        },
        {
          provide: RecommendationEngineService,
          useValue: {},
        },
        {
          provide: CacheService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlanningAssistantV2Service>(PlanningAssistantV2Service);
    planningAssistantService = module.get(PlanningAssistantService);
    cacheService = module.get(CacheService);
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const dto = { userId: 'user_123' };
      planningAssistantService.createSession.mockResolvedValue('session_789');
      cacheService.set.mockResolvedValue(undefined);

      const result = await service.createSession(dto);

      expect(result.sessionId).toBe('session_789');
      expect(result.userId).toBe('user_123');
      expect(cacheService.set).toHaveBeenCalled();
    });
  });
});
```

---

## 🔄 智能路由模板

```typescript
// src/agent/assistants/planning-assistant/services/smart-router.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../../../llm/services/llm.service';

@Injectable()
export class SmartRouterService {
  private readonly logger = new Logger(SmartRouterService.name);

  constructor(
    private readonly llmService: LlmService,
  ) {}

  /**
   * 智能路由：分析用户消息，路由到合适的业务接口
   */
  async route(message: string, sessionId?: string): Promise<{
    target: 'recommendations' | 'generate' | 'compare' | 'chat';
    confidence: number;
    extractedParams?: Record<string, any>;
  }> {
    const prompt = `分析用户消息，判断应该路由到哪个接口。

用户消息: "${message}"

可选接口:
- recommendations: 用户想要推荐目的地
- generate: 用户想要生成方案
- compare: 用户想要对比方案
- chat: 其他对话

返回JSON格式:
{
  "target": "recommendations" | "generate" | "compare" | "chat",
  "confidence": 0.0-1.0,
  "extractedParams": { ... }
}`;

    try {
      const result = await this.llmService.callLlmWithSchema(
        'DEEPSEEK',
        prompt
      );
      
      const parsed = JSON.parse(result);
      
      this.logger.debug(`智能路由: message="${message.substring(0, 50)}..." -> ${parsed.target} (confidence=${parsed.confidence})`);
      
      return parsed;
    } catch (error: any) {
      this.logger.warn(`智能路由失败: ${error.message}，使用默认路由`);
      return {
        target: 'chat',
        confidence: 0.5,
      };
    }
  }
}
```

---

## 💾 缓存服务模板

```typescript
// src/common/cache/cache.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error: any) {
      this.logger.error(`缓存获取失败: key=${key}`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error: any) {
      this.logger.error(`缓存设置失败: key=${key}`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error: any) {
      this.logger.error(`缓存删除失败: key=${key}`, error);
    }
  }
}
```

---

## 📝 使用示例

### 完整示例：推荐接口实现

```typescript
// Controller
@Get('recommendations')
@ApiOperation({ summary: '获取目的地推荐' })
async getRecommendations(
  @Query('q') naturalLanguage?: string,
  @Query() structuredParams?: RecommendationsQueryDto,
): Promise<RecommendationsResponseDto> {
  // 如果提供了自然语言参数，使用AI提取参数
  if (naturalLanguage) {
    const extracted = await this.intentRecognizer.extractParams(naturalLanguage);
    return this.planningAssistantV2Service.getRecommendations({
      ...extracted,
      naturalLanguage,
    });
  }
  
  // 否则使用结构化参数
  return this.planningAssistantV2Service.getRecommendations(structuredParams);
}

// Service
async getRecommendations(dto: RecommendationsRequestDto): Promise<RecommendationsResponseDto> {
  // 1. 检查缓存
  const cacheKey = `recommendations:${hashParams(dto)}`;
  const cached = await this.cacheService.get<RecommendationsResponseDto>(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. 合并偏好
  let mergedPreferences = dto.preferences || {};
  if (dto.sessionId) {
    const state = await this.planningAssistantService.getSessionState(dto.sessionId);
    if (state) {
      mergedPreferences = { ...state.preferences, ...mergedPreferences };
    }
  }

  // 3. 获取推荐
  const recommendations = await this.recommendationEngine.getRecommendations({
    preferences: mergedPreferences,
    filters: dto.filters,
    limit: dto.limit || 10,
  });

  // 4. 生成响应
  const response: RecommendationsResponseDto = {
    recommendations,
    sessionId: dto.sessionId,
    preferencesUsed: mergedPreferences,
    generatedAt: new Date().toISOString(),
  };

  // 5. 缓存结果（5分钟）
  await this.cacheService.set(cacheKey, response, 300);

  return response;
}
```

---

**文档维护**: 后端开发团队  
**最后更新**: 2026-02-08
