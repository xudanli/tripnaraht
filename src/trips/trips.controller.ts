// src/trips/trips.controller.ts
import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { TripsService } from './trips.service';
import { TripExtendedService } from './services/trip-extended.service';
import { TripRecapService } from './services/trip-recap.service';
import { TripEmergencyService, EmergencySOSRequest } from './services/trip-emergency.service';
import { TripBudgetService } from './services/trip-budget.service';
import { TripAdjustmentService, TripModificationRequest } from './services/trip-adjustment.service';
import { LlmService } from '../llm/services/llm.service';
import { LlmResponseTransformerService } from '../llm/services/llm-response-transformer.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { CreateTripFromNaturalLanguageDto } from './dto/create-trip-from-nl.dto';
import { SelectGateAlternativeDto } from './dto/select-gate-alternative.dto';
import { GetConversationContextDto, UpdateConversationContextDto, DeleteConversationDto } from './dto/nl-conversation-context.dto';
import { TripStateDto } from './dto/trip-state.dto';
import { ScheduleResponseDto, SaveScheduleDto } from './dto/schedule.dto';
import { CreateTripShareDto } from './dto/trip-share.dto';
import { AddCollaboratorDto } from './dto/trip-collaborator.dto';
import { DeleteTripDto } from './dto/delete-trip.dto';
import { PersonaAlertDto } from './dto/persona-alerts.dto';
import { DecisionLogResponseDto } from './dto/decision-log.dto';
import { TaskDto, UpdateTaskStatusDto } from './dto/tasks.dto';
import { PipelineStatusResponseDto } from './dto/pipeline-status.dto';
import { CreateTripDraftDto, TripDraftResponseDto, SaveTripDraftDto, ReplaceItineraryItemDto, ReplaceItineraryItemResponseDto, RegenerateTripDto, RegenerateTripResponseDto } from './dto/trip-draft.dto';
import { TripDraftService } from './services/trip-draft.service';
import { 
  GetEvidenceQueryDto, 
  EvidenceListResponseDto,
  UpdateEvidenceRequestDto,
  UpdateEvidenceResponseDto,
  BatchUpdateEvidenceRequestDto,
  BatchUpdateEvidenceResponseDto
} from './dto/evidence.dto';
import { GetAttentionQueueQueryDto, AttentionQueueResponseDto } from './dto/attention-queue.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { DayMetricsResponseDto, TripMetricsResponseDto } from './dto/trip-metrics.dto';
import { ConflictsResponseDto, ConflictSeverity } from './dto/trip-conflicts.dto';
import { UpdateIntentRequestDto, UpdateIntentResponseDto, IntentResponseDto } from './dto/trip-intent.dto';
import { ApplyOptimizationRequestDto, ApplyOptimizationResponseDto } from './dto/trip-optimization.dto';
import { BatchUpdateItemsRequestDto, BatchUpdateItemsResponseDto } from './dto/trip-items.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripMetricsService } from './services/trip-metrics.service';
import { TripConflictsService } from './services/trip-conflicts.service';
import { TripIntentService } from './services/trip-intent.service';
import { TripOptimizationService } from './services/trip-optimization.service';
import { HotelRecommendationService } from '../places/services/hotel-recommendation.service';
import { TripSuggestionsService } from './services/trip-suggestions.service';
import { TripInsightService } from './services/trip-insight.service';
import { 
  SuggestionListResponseDto, 
  SuggestionStatsDto,
  SuggestionPersona,
  SuggestionScope,
  SuggestionSeverity,
  SuggestionStatus,
  ApplySuggestionRequestDto,
  ApplySuggestionResponseDto
} from './dto/suggestions.dto';
import { TripInsightResponseDto } from './dto/trip-insight.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { AdminTripListQueryDto, AdminTripStatsQueryDto, BatchOperationRequestDto } from './dto/admin-trip.dto';
import { TokenService } from '../auth/services/token.service';
import { JwtService } from '@nestjs/jwt';
import { Req } from '@nestjs/common';
import { Request } from 'express';
import { ContextEngineerService } from '../agent/context-engine/services/context-engineer.service';
import { SkillsRegistryService } from '../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../skills/services/skills-registry.token';
import { Inject, Optional } from '@nestjs/common';
import { ContextBlock } from '../agent/context-engine/types/context-package.types';
import { DecisionDraftGeneratorService } from '../decision-draft/services/decision-draft-generator.service';
import { DecisionDraftStorageService } from '../decision-draft/storage/decision-draft-storage.service';
import { TripPlanRequest } from '../agent/interfaces/trip-plan.interface';
import { randomUUID } from 'crypto';
import { DestinationClarificationConfigService } from './nl-clarification/services/destination-clarification-config.service';
import { GatePrecheckService } from './nl-clarification/services/gate-precheck.service';
import { AiDecisionLogicService } from './nl-clarification/services/ai-decision-logic.service';
import { NLConversationContextService, ConversationMessage } from './services/nl-conversation-context.service';

@ApiTags('trips')
@Public() // 临时开放测试，生产环境应移除
@Controller('trips')
export class TripsController {
  private readonly logger = new Logger(TripsController.name);

  /**
   * 标准化问题文本（用于与历史问题比较）
   * 与 LlmResponseTransformerService.normalizeQuestionText 保持一致
   */
  private normalizeQuestionTextForComparison(text: string): string {
    return text
      // 去除所有标点符号（包括中文和英文标点）
      .replace(/[，。！？；：、,\.!?;:]/g, '')
      // 统一空格（多个空格合并为一个）
      .replace(/\s+/g, ' ')
      // 去除首尾空格
      .trim()
      // 转换为小写（仅对英文，中文不受影响）
      .toLowerCase();
  }

  constructor(
    private readonly tripsService: TripsService,
    private readonly tripExtendedService: TripExtendedService,
    private readonly tripRecapService: TripRecapService,
    private readonly tripEmergencyService: TripEmergencyService,
    private readonly tripBudgetService: TripBudgetService,
    private readonly tripAdjustmentService: TripAdjustmentService,
    private readonly tripDraftService: TripDraftService,
    private readonly llmService: LlmService,
    private readonly llmResponseTransformer: LlmResponseTransformerService,
    private readonly tripMetricsService: TripMetricsService,
    private readonly tripConflictsService: TripConflictsService,
    private readonly tripIntentService: TripIntentService,
    private readonly tripOptimizationService: TripOptimizationService,
    private readonly tripSuggestionsService: TripSuggestionsService,
    private readonly tripInsightService: TripInsightService,
    private readonly nlConversationContextService: NLConversationContextService,
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    @Optional() private readonly hotelRecommendationService?: HotelRecommendationService,
    @Optional() private readonly contextEngineerService?: ContextEngineerService,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly decisionDraftGenerator?: DecisionDraftGeneratorService,
    @Optional() private readonly decisionDraftStorage?: DecisionDraftStorageService,
    @Optional() private readonly destinationClarificationConfigService?: DestinationClarificationConfigService,
    @Optional() private readonly gatePrecheckService?: GatePrecheckService,
    @Optional() private readonly aiDecisionLogicService?: AiDecisionLogicService
  ) {}

  @Post()
  @ApiOperation({ 
    summary: '创建新行程',
    description: '创建新行程并自动计算节奏策略（木桶效应）和预算切分。系统会根据旅行者信息自动计算体力限制和地形限制，并根据预算推荐酒店档次。也可以从草案创建行程（传入 SaveTripDraftDto）。'
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程创建成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async create(
    @Body() body: CreateTripDto | SaveTripDraftDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request
  ) {
    try {
      // Try to get userId from @CurrentUser() decorator first
      let userId = user?.userId;
      
      // If not available, try to extract from Authorization header manually
      if (!userId && req?.headers?.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          try {
            // Use JwtService to verify token
            const payload = await this.jwtService.verifyAsync(token);
            userId = payload.sub;
            this.logger.debug(`Successfully extracted userId from token: ${userId}`);
          } catch (error: any) {
            // Token invalid, continue to return error
            this.logger.debug(`Failed to verify token: ${error?.message || error}`);
          }
        }
      }
      
      if (!userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
      }
      
      // 检查是否是草案保存请求（包含 draft 字段）
      if ('draft' in body) {
        const trip = await this.tripsService.createFromDraft(body as SaveTripDraftDto, userId);
        return successResponse(trip);
      } else {
        const trip = await this.tripsService.create(body as CreateTripDto, userId);
        return successResponse(trip);
      }
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Post('from-natural-language')
  @ApiOperation({
    summary: '自然语言创建行程',
    description: '使用自然语言描述创建行程，大模型会自动解析需求并转换为接口参数。例如："帮我规划带娃去东京5天的行程，预算2万"',
  })
  @ApiBody({ type: CreateTripFromNaturalLanguageDto })
  @ApiResponse({
    status: 200,
    description: '成功创建行程或需要澄清（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async createFromNaturalLanguage(
    @Body() dto: CreateTripFromNaturalLanguageDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      if (!userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
      }

      // 1. 获取或创建会话
      const sessionId = await this.nlConversationContextService.getOrCreateSession(dto.sessionId, userId);
      
      // 2. 加载历史对话上下文（如果有）
      const existingContext = await this.nlConversationContextService.getContext(sessionId, userId);
      const conversationHistory = existingContext?.messages || [];
      
      // 3. 添加用户消息到会话
      await this.nlConversationContextService.addMessage(sessionId, userId, 'user', dto.text);

      // 4. 构建包含历史上下文的提示（如果有历史对话）
      let promptText = dto.text;
      if (conversationHistory.length > 0) {
        const historyContext = conversationHistory
          .slice(-6) // 只使用最近 6 条消息
          .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
          .join('\n');
        promptText = `历史对话上下文：\n${historyContext}\n\n当前用户输入：${dto.text}`;
      }

      // 5. 检测目的地并构建 Context Package（如果可用）
      let contextBlocks: ContextBlock[] = [];
      let detectedCountryCode: string | undefined;
      
      // 5.1 尝试从已解析参数中获取目的地（如果有历史对话）
      if (existingContext?.partialParams?.destination) {
        detectedCountryCode = this.extractCountryCode(existingContext.partialParams.destination);
      }
      
      // 5.2 如果还没有检测到，从当前文本中提取
      if (!detectedCountryCode) {
        detectedCountryCode = this.extractCountryCodeFromText(dto.text);
      }
      
      // 5.3 如果检测到目的地，构建 Context Package
      if (detectedCountryCode && this.contextEngineerService && this.skillsRegistry) {
        try {
          this.logger.debug(`检测到目的地国家代码: ${detectedCountryCode}，开始构建 Context Package`);
          const countryPackSkill = this.skillsRegistry.getSkill('countryPack.getBlocks');
          if (countryPackSkill) {
            const countryPackResult = await countryPackSkill.execute({
              packId: detectedCountryCode,
              topics: ['VISA', 'ROAD_RULES', 'SAFETY', 'WEATHER_WINDOWS'], // 需要的主题块
              phase: 'planning',
            });
            if (countryPackResult.blocks && countryPackResult.blocks.length > 0) {
              contextBlocks = countryPackResult.blocks;
              this.logger.debug(`成功构建 Context Package，包含 ${contextBlocks.length} 个块`);
            }
          }
        } catch (error: any) {
          // Context Package 构建失败不影响主流程，只记录警告
          this.logger.warn(`构建 Context Package 失败: ${error.message}`, error.stack);
        }
      }

      // 6. 提取历史澄清问题（用于过滤重复）
      const historicalQuestions: string[] = [];
      if (existingContext?.messages) {
        for (const msg of existingContext.messages) {
          if (msg.role === 'assistant' && msg.metadata?.clarificationQuestions) {
            const questions = msg.metadata.clarificationQuestions as any[];
            questions.forEach((q: any) => {
              if (q.question || q.text) {
                historicalQuestions.push((q.question || q.text).trim());
              }
            });
          }
        }
      }
      this.logger.debug(`Found ${historicalQuestions.length} historical clarification questions`);

      // 🆕 Step 6: 获取目的地特化配置
      let destinationConfig: any = null;
      if (detectedCountryCode && this.destinationClarificationConfigService) {
        destinationConfig = await this.destinationClarificationConfigService.getConfig(
          detectedCountryCode
        );
      }
      
      // 🆕 Step 7: 使用特化配置或通用流程
      if (destinationConfig && destinationConfig.enabled && detectedCountryCode) {
        // 使用特化澄清流程（此时 detectedCountryCode 已确认不为 undefined）
        return await this.handleDestinationSpecificClarification(
          dto,
          userId,
          sessionId,
          existingContext,
          destinationConfig,
          detectedCountryCode!, // 非空断言：已在上面的条件中检查
          contextBlocks,
          promptText
        );
      }

      // 7. 使用 LLM 解析自然语言（传入历史上下文和 Context Package）
      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: promptText,
        provider: dto.llmProvider,
        contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
        destinationCode: detectedCountryCode,
        destinationConfig: destinationConfig,
      });

      // 8. 如果需要澄清，返回旅行规划师风格的对话
      this.logger.debug(`Parse result needsClarification: ${parseResult.needsClarification}`);
      if (parseResult.needsClarification) {
        // 🆕 转换结构化响应
        let structuredResponse: {
          plannerResponseBlocks?: any[];
          clarificationQuestions?: any[];
          plannerReply?: string;
        };

        try {
          structuredResponse = await this.llmResponseTransformer.transformToStructuredResponse(
            parseResult.llmRawOutput || {},
            parseResult.plannerReply
          );
          
          // 🆕 过滤历史澄清问题（避免重复询问）
          if (structuredResponse.clarificationQuestions && historicalQuestions.length > 0) {
            const originalCount = structuredResponse.clarificationQuestions.length;
            structuredResponse.clarificationQuestions = structuredResponse.clarificationQuestions.filter((q: any) => {
              const questionText = (q.question || q.text || '').trim();
              if (!questionText) return false;
              
              // 检查是否与历史问题相似（标准化后比较）
              const isDuplicate = historicalQuestions.some((historicalQ: string) => {
                const normalizedCurrent = this.normalizeQuestionTextForComparison(questionText);
                const normalizedHistorical = this.normalizeQuestionTextForComparison(historicalQ);
                return normalizedCurrent === normalizedHistorical;
              });
              
              if (isDuplicate) {
                this.logger.debug(`Filtering duplicate question from history: "${questionText.substring(0, 50)}..."`);
              }
              
              return !isDuplicate;
            });
            
            if (structuredResponse.clarificationQuestions.length < originalCount) {
              this.logger.debug(`Filtered ${originalCount - structuredResponse.clarificationQuestions.length} duplicate questions based on history`);
            }
          }
          this.logger.debug(`Successfully transformed structured response: ${structuredResponse.plannerResponseBlocks?.length || 0} blocks, ${structuredResponse.clarificationQuestions?.length || 0} questions`);
          
          // 记录转换成功的指标（用于监控）
          if (structuredResponse.plannerResponseBlocks && structuredResponse.plannerResponseBlocks.length > 0) {
            this.logger.debug(`Structured response contains ${structuredResponse.plannerResponseBlocks.length} blocks`);
          }
        } catch (error: any) {
          // 如果转换失败，降级到文本模式
          this.logger.warn(`Structured response transformation failed: ${error.message}`, error.stack);
          
          // 记录降级指标（用于监控）
          this.logger.warn(`Falling back to text mode due to transformation failure`);
          
          structuredResponse = {
            plannerReply: parseResult.plannerReply,
            clarificationQuestions: parseResult.clarificationQuestions?.map((q: string, i: number) => ({
              id: `fallback_q_${i}_${Date.now()}`,
              question: q,
              type: 'text' as const,
              required: false,
            })),
          };
        }

        // 添加助手回复到会话（使用文本回复，用于历史记录）
        const assistantReply = structuredResponse.plannerReply || parseResult.plannerReply || parseResult.clarificationQuestions?.join('\n') || '需要更多信息';
        const savedContext = await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
          needsClarification: true,
          suggestedQuestions: parseResult.suggestedQuestions,
          // 🆕 存储结构化响应数据（用于前端恢复和调试）
          plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
          clarificationQuestions: structuredResponse.clarificationQuestions,
          // 🆕 添加解析出的参数和确认卡片标记
          parsedParams: parseResult.params,
          showConfirmCard: false, // 需要澄清时不显示确认卡片
          questionAnswers: {}, // 初始为空，用户回答后更新
        });
        
        // 🆕 获取最后一条消息的ID（用于前端更新答案）
        const lastMessage = savedContext.messages[savedContext.messages.length - 1];
        
        // 🆕 记录过滤统计（用于监控）
        if (structuredResponse.clarificationQuestions) {
          this.logger.debug(`Final clarification questions count: ${structuredResponse.clarificationQuestions.length} (after history filtering)`);
        }
        
        // 更新对话上下文
        await this.nlConversationContextService.updateContext(sessionId, userId, {
          conversationContext: parseResult.conversationContext,
          partialParams: parseResult.params,
        });
        
        // 🆕 获取目的地中文名称（用于前端显示）
        let destinationName = detectedCountryCode || parseResult.params.destination;
        if (detectedCountryCode) {
          if (destinationConfig && destinationConfig.destinationName) {
            destinationName = destinationConfig.destinationName;
          } else {
            const countryNameMap: Record<string, string> = {
              'GL': '格陵兰',
              'IS': '冰岛',
              'SJ': '斯瓦尔巴',
              'AR': '阿根廷',
              'JP': '日本',
              'CN': '中国',
              'US': '美国',
              'TH': '泰国',
            };
            destinationName = countryNameMap[detectedCountryCode] || detectedCountryCode;
          }
        }
        
        this.logger.debug(`Returning planner-style clarification: ${structuredResponse.plannerReply?.substring(0, 100) || parseResult.plannerReply?.substring(0, 100)}...`);
        return successResponse({
          sessionId, // 返回会话 ID，前端需要保存
          needsClarification: true,
          // 🆕 结构化响应
          plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
          clarificationQuestions: structuredResponse.clarificationQuestions,
          // 向后兼容
          plannerReply: structuredResponse.plannerReply || parseResult.plannerReply,
          suggestedQuestions: parseResult.suggestedQuestions,
          conversationContext: parseResult.conversationContext,
          partialParams: parseResult.params,
          destination: detectedCountryCode || parseResult.params.destination, // 🆕 添加国家代码
          destinationName, // 🆕 添加中文目的地名称
          lastMessageId: lastMessage.id, // 🆕 添加最后一条消息的ID（用于前端更新答案）
        });
      }

      // 转换为 CreateTripDto
      const travelers: Array<{ type: 'ADULT' | 'ELDERLY' | 'CHILD'; mobilityTag: MobilityTag }> = [];
      
      if (parseResult.params.hasChildren) {
        travelers.push({ type: 'CHILD', mobilityTag: MobilityTag.CITY_POTATO });
      }
      if (parseResult.params.hasElderly) {
        travelers.push({ type: 'ELDERLY', mobilityTag: MobilityTag.ACTIVE_SENIOR });
      }
      // 默认至少一个成人
      if (travelers.length === 0 || !travelers.some(t => t.type === 'ADULT' && t.mobilityTag !== MobilityTag.LIMITED)) {
        travelers.push({ type: 'ADULT', mobilityTag: MobilityTag.CITY_POTATO });
      }

      // 确保日期格式正确（YYYY-MM-DD）
      let startDate = parseResult.params.startDate;
      let endDate = parseResult.params.endDate;
      
      // 如果是 ISO 格式，转换为日期格式
      if (startDate && startDate.includes('T')) {
        startDate = startDate.split('T')[0];
      }
      if (endDate && endDate.includes('T')) {
        endDate = endDate.split('T')[0];
      }

      this.logger.debug(`Creating trip with params: ${JSON.stringify({ destination: parseResult.params.destination, startDate, endDate, totalBudget: parseResult.params.totalBudget, travelersCount: travelers.length })}`);

      const createTripDto: CreateTripDto = {
        destination: parseResult.params.destination,
        startDate: startDate,
        endDate: endDate,
        totalBudget: parseResult.params.totalBudget,
        travelers: travelers as any,
      };

      // 8. 创建行程
      const trip = await this.tripsService.create(createTripDto, userId);
      
      // 8.1 设置预算约束（确保预算约束功能完整可用）
      // 从 budgetConfig 中提取已计算的每日预算
      const budgetConfig = (trip.budgetConfig as any) || {};
      const calculatedDailyBudget = budgetConfig.daily_budget || budgetConfig.dailyBudget;
      
      try {
        await this.tripBudgetService.setBudgetConstraint(trip.id, {
          total: parseResult.params.totalBudget,
          currency: 'CNY',
          dailyBudget: calculatedDailyBudget,
          // 不设置 categoryLimits，让用户后续可以自定义
        });
        this.logger.debug(`已为行程 ${trip.id} 设置预算约束: 总预算 ${parseResult.params.totalBudget} 元`);
      } catch (error: any) {
        // 预算约束设置失败不影响主流程，只记录警告
        this.logger.warn(`设置预算约束失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
      }
      
      // 8.2 添加成功消息到会话
      await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', `行程已创建成功！目的地：${parseResult.params.destination}，日期：${startDate} 至 ${endDate}，预算：${parseResult.params.totalBudget}元`, {
        tripId: trip.id,
        success: true,
        parsedParams: parseResult.params,
        showConfirmCard: true, // 行程创建成功时显示确认卡片
        questionAnswers: {}, // 所有问题已回答
      });
      
      // 10. 清理会话上下文（行程创建成功后，可以清理或保留用于后续对话）
      // 这里选择保留，以便用户后续可以继续对话
      
      // 11. 异步生成行程规划点（不阻塞响应）
      // 计算行程天数
      const start = DateTime.fromISO(startDate);
      const end = DateTime.fromISO(endDate);
      const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
      
      // 在后台异步生成规划点，不等待完成
      this.generateDraftAsync(trip.id, {
        destination: parseResult.params.destination,
        days: durationDays,
        startDate: startDate,
        endDate: endDate,
        style: parseResult.params.preferences?.style || 'balanced',
        intensity: parseResult.params.preferences?.intensity || 'balanced',
      }).catch((error: any) => {
        this.logger.error(`后台生成行程规划点失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
      });
      
      // 11.1 尝试推荐酒店（异步，不阻塞响应）
      // 注意：此时可能还没有景点数据，推荐可能失败，但会在行程项生成完成后再次推荐
      let hotelRecommendations: any[] | undefined = undefined;
      if (this.hotelRecommendationService) {
        this.recommendHotelsAsync(trip.id, parseResult.params.totalBudget).then((recommendations: any[] | undefined) => {
          if (recommendations && recommendations.length > 0) {
            this.logger.debug(`为行程 ${trip.id} 推荐了 ${recommendations.length} 个酒店`);
          }
        }).catch((error: any) => {
          // 此时可能还没有景点数据，失败是正常的，会在行程项生成完成后再次推荐
          this.logger.debug(`首次酒店推荐失败（可能因为还没有景点数据）: ${error.message}`);
        });
      }
      
      // 🆕 获取目的地中文名称
      let destinationName = parseResult.params.destination;
      if (detectedCountryCode) {
        if (destinationConfig && destinationConfig.destinationName) {
          destinationName = destinationConfig.destinationName;
        } else {
          const countryNameMap: Record<string, string> = {
            'GL': '格陵兰',
            'IS': '冰岛',
            'SJ': '斯瓦尔巴',
            'AR': '阿根廷',
            'JP': '日本',
            'CN': '中国',
            'US': '美国',
            'TH': '泰国',
          };
          destinationName = countryNameMap[detectedCountryCode] || detectedCountryCode;
        }
      }
      
      // 12. 立即返回行程（不包含规划点，规划点会在后台生成）
      return successResponse({
        sessionId, // 返回会话 ID
        trip,
        parsedParams: parseResult.params,
        generatingItems: true, // 标记正在生成规划点
        message: '行程已创建，正在后台生成行程规划点，请稍后刷新查看',
        hotelRecommendations, // 如果有推荐则返回，否则为 undefined
        destination: detectedCountryCode || parseResult.params.destination, // 🆕 添加国家代码
        destinationName, // 🆕 添加中文目的地名称
      });
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      this.logger.error(`Failed to create trip from natural language: ${errorMessage}`, error?.stack);
      
      // 尝试使用 LLM 处理错误并生成友好的错误信息
      try {
        const errorHandling = await this.llmService.handleErrorAndClarify(error, `创建行程: ${dto.text}`);
        const message = errorHandling?.message || errorMessage || '处理您的请求时遇到了问题。请检查输入参数是否正确。';
        const details = {
          clarificationQuestions: errorHandling?.clarificationQuestions || ['请提供更详细的行程信息'],
          suggestedActions: errorHandling?.suggestedActions || ['重试', '联系客服'],
          originalError: errorMessage,
        };
        this.logger.debug(`Error handling response: ${JSON.stringify({ message, details })}`);
        return errorResponse(ErrorCode.BUSINESS_ERROR, message, details);
      } catch (llmError: any) {
        // 如果 LLM 错误处理也失败，返回默认错误信息
        this.logger.warn(`LLM error handling failed: ${llmError?.message || llmError}`);
        const defaultMessage = errorMessage || '处理您的请求时遇到了问题。请检查输入参数是否正确，或稍后重试。';
        const defaultDetails = {
          originalError: errorMessage,
          errorType: error?.constructor?.name || 'Error',
          clarificationQuestions: ['请提供更详细的行程信息（目的地、日期、预算等）'],
          suggestedActions: ['重试', '使用标准创建行程接口'],
        };
        this.logger.debug(`Default error response: ${JSON.stringify({ message: defaultMessage, details: defaultDetails })}`);
        return errorResponse(ErrorCode.BUSINESS_ERROR, defaultMessage, defaultDetails);
      }
    }
  }

  /**
   * 🆕 P1: 处理 Gate 替代方案选择
   */
  @Post('gate-alternative/select')
  @ApiOperation({ summary: '选择 Gate 替代方案' })
  @ApiBody({ type: SelectGateAlternativeDto })
  @ApiResponse({
    status: 200,
    description: '成功应用替代方案，继续澄清流程',
    type: ApiSuccessResponseDto,
  })
  async selectGateAlternative(
    @Body() dto: SelectGateAlternativeDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      if (!userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能选择替代方案');
      }

      // 1. 获取会话上下文
      const existingContext = await this.nlConversationContextService.getContext(dto.sessionId, userId);
      if (!existingContext) {
        return errorResponse(ErrorCode.NOT_FOUND, '会话不存在或已过期');
      }

      // 2. 解析 action（如 "set_risk_tolerance:medium"）
      const actionParts = dto.action.split(':');
      if (actionParts.length !== 2) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, `无效的 action 格式: ${dto.action}`);
      }

      const [actionType, actionValue] = actionParts;
      if (actionType !== 'set_risk_tolerance' && !actionType.startsWith('set_')) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, `不支持的 action 类型: ${actionType}`);
      }

      // 3. 提取字段名（如 "set_risk_tolerance" -> "riskTolerance"）
      const fieldName = actionType.replace('set_', '').replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase());

      // 4. 更新会话参数
      const updatedParams: Record<string, any> = {
        ...(existingContext.partialParams || {}),
        [fieldName]: actionValue,
      };

      await this.nlConversationContextService.updateContext(dto.sessionId, userId, {
        partialParams: updatedParams,
      });

      // 5. 检测目的地代码
      const detectedCountryCode = updatedParams.destination?.toUpperCase() || null;
      if (!detectedCountryCode) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '无法检测目的地代码');
      }

      // 6. 获取目的地配置
      let destinationConfig: any = null;
      if (detectedCountryCode && this.destinationClarificationConfigService) {
        destinationConfig = await this.destinationClarificationConfigService.getConfig(detectedCountryCode);
      }

      // 7. 继续澄清流程（使用更新后的参数）
      if (destinationConfig && destinationConfig.enabled && detectedCountryCode) {
        // 构建用户输入（如果有）
        const userInput = dto.userInput || `我已选择替代方案：${dto.action}`;
        
        // 获取上下文块（简化处理，不构建完整的 Context Package）
        // 注意：这里不需要完整的 Context Package，因为澄清流程主要依赖配置和 LLM
        const contextBlocks: ContextBlock[] = [];

        // 调用特化澄清流程
        return await this.handleDestinationSpecificClarification(
          {
            text: userInput,
            sessionId: dto.sessionId,
            llmProvider: undefined,
          } as CreateTripFromNaturalLanguageDto,
          userId,
          dto.sessionId,
          existingContext,
          destinationConfig,
          detectedCountryCode,
          contextBlocks,
          userInput
        );
      } else {
        // 降级到通用流程
        return errorResponse(ErrorCode.BUSINESS_ERROR, '目的地未启用特化澄清配置，无法应用替代方案');
      }
    } catch (error: any) {
      this.logger.error(`选择 Gate 替代方案失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `选择替代方案失败: ${error.message}`);
    }
  }

  /**
   * 🆕 处理目的地特化澄清流程
   */
  private async handleDestinationSpecificClarification(
    dto: CreateTripFromNaturalLanguageDto,
    userId: string,
    sessionId: string,
    existingContext: any,
    config: any,
    destinationCode: string,
    contextBlocks: ContextBlock[],
    promptText: string
  ): Promise<any> {
    try {
      // 1. 获取当前参数（从历史对话中累积）
      const currentParams = existingContext?.partialParams || {};
      
      // 2. 使用 LLM 提取参数（带特化规则）
      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: promptText,
        provider: dto.llmProvider,
        contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
        destinationCode,
        destinationConfig: config,
      });
      
      // 3. 合并参数
      const mergedParams = {
        ...currentParams,
        ...parseResult.params,
      };
      
      // 🆕 修复：将 preferences.activityType 或 preferences.activityTypes 转换为根级别的 activityTypes 数组
      // LLM 可能返回 preferences.activityType（字符串）或 preferences.activityTypes（数组），但配置需要根级别的 activityTypes（数组）
      if (!mergedParams.activityTypes) {
        let activityTypes: string[] = [];
        
        // 情况1: preferences.activityType（字符串）
        if (mergedParams.preferences?.activityType) {
          activityTypes = [mergedParams.preferences.activityType];
        }
        // 情况2: preferences.activityTypes（数组）
        else if (mergedParams.preferences?.activityTypes && Array.isArray(mergedParams.preferences.activityTypes)) {
          activityTypes = mergedParams.preferences.activityTypes;
        }
        
        // 将中文活动名称映射到配置中的英文值
        if (activityTypes.length > 0) {
          const activityTypeMap: Record<string, string> = {
            // 格陵兰活动
            '东格陵兰远征': 'east_greenland_expedition',
            '冰川徒步': 'glacier_hiking',
            '皮划艇': 'kayaking',
            '船游': 'boat_tour',
            '冰盖远征': 'ice_sheet_expedition',
            '低风险户外活动': 'boat_tour', // 默认映射到船游
            // 冰岛活动
            '极光追踪': 'aurora_hunting',
            '极光摄影': 'aurora_hunting',
            '极光': 'aurora_hunting',
            '冰川': 'glacier_hiking',
            '冰洞': 'glacier_hiking',
            '风景摄影': 'scenic_photography',
            '摄影': 'scenic_photography',
            '温泉': 'hot_springs',
            '蓝泻湖': 'hot_springs',
            '自然探索': 'nature_exploration',
            '冒险': 'adventure_activities',
            '火山': 'adventure_activities',
            '峡谷漂流': 'adventure_activities',
          };
          
          const mappedTypes = activityTypes.map(type => {
            const mapped = activityTypeMap[type] || type;
            if (mapped !== type) {
              this.logger.debug(`映射活动类型: ${type} -> ${mapped}`);
            }
            return mapped;
          });
          
          mergedParams.activityTypes = mappedTypes;
          this.logger.debug(`转换 activityTypes: ${JSON.stringify(activityTypes)} -> ${JSON.stringify(mappedTypes)}`);
        }
      }
      
      // 🆕 添加调试日志
      this.logger.debug(`合并后的参数: ${JSON.stringify(mergedParams, null, 2)}`);
      
      // 4. 获取当前轮次的问题
      if (!this.destinationClarificationConfigService) {
        // 降级到通用流程
        this.logger.warn('DestinationClarificationConfigService 未注入，降级到通用流程');
        // 继续使用通用流程（这里简化处理，实际应该调用通用流程）
        return errorResponse(ErrorCode.INTERNAL_ERROR, '配置服务不可用');
      }
      
      let roundInfo = await this.destinationClarificationConfigService.getCurrentRoundQuestions(
        destinationCode,
        mergedParams,
        existingContext?.messages || []
      );
      
      this.logger.debug(`当前轮次信息: ${roundInfo ? `roundId=${roundInfo.round.roundId}, questions=${roundInfo.questions.length}` : 'null（所有轮次已完成）'}`);
      
      if (!roundInfo) {
        // 所有轮次已完成，应用决策矩阵（支持所有目的地）
        if (this.aiDecisionLogicService && ['SJ', 'GL', 'AL'].includes(destinationCode)) {
          try {
            const decisionResult = await this.aiDecisionLogicService.applyDecisionMatrix(
              destinationCode,
              mergedParams
            );
            
            this.logger.debug(`决策矩阵结果: ${decisionResult.decision}, 原因: ${decisionResult.reason}`);
            
            // 如果决策是 NOT_RECOMMENDED 或 STRONGLY_RECONSIDER，阻止创建
            if (decisionResult.decision === 'NOT_RECOMMENDED' || decisionResult.decision === 'STRONGLY_RECONSIDER') {
              const destinationName = config?.destinationName || '斯瓦尔巴';
              return successResponse({
                sessionId,
                needsClarification: true,
                blockedByDecisionMatrix: true,
                decisionResult,
                plannerResponseBlocks: [
                  {
                    type: 'highlight',
                    highlightType: 'warning',
                    highlightText: `⚠️ ${decisionResult.reason}`,
                  },
                  {
                    type: 'paragraph',
                    content: `**建议**：\n${decisionResult.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
                  },
                ],
                clarificationQuestions: [],
                destination: destinationCode,
                destinationName,
              });
            }
          } catch (error: any) {
            this.logger.warn(`决策矩阵执行失败: ${error.message}`);
            // 不影响主流程，继续创建
          }
        }
        
        // 检查 Critical 字段后再创建行程
        return await this.createTripFromParams(mergedParams, userId, sessionId, destinationCode);
      }
      
      if (roundInfo.questions.length === 0) {
        this.logger.warn(`当前轮次 ${roundInfo.round.roundId} 没有需要问的问题，可能所有问题都已问过或被过滤`);
        
        // 🆕 检查当前轮次的完成条件
        const round = roundInfo.round;
        const completionConditions = round.completionConditions;
        const allRequiredFieldsPresent = completionConditions.requiredFields.every(
          field => mergedParams[field] !== undefined && mergedParams[field] !== null && mergedParams[field] !== ''
        );
        
        if (allRequiredFieldsPresent) {
          // 当前轮次已完成，重新获取下一轮（使用服务的方法）
          const nextRoundInfo = await this.destinationClarificationConfigService.getCurrentRoundQuestions(
            destinationCode,
            mergedParams,
            existingContext?.messages || []
          );
          
          if (!nextRoundInfo) {
            // 没有下一轮了，所有轮次已完成
            this.logger.debug(`所有轮次已完成，尝试创建行程`);
            return await this.createTripFromParams(mergedParams, userId, sessionId, destinationCode);
          } else {
            // 有下一轮，继续处理
            this.logger.debug(`进入下一轮: ${nextRoundInfo.round.roundId}`);
            roundInfo = nextRoundInfo;
          }
        } else {
          // 🆕 当前轮次未完成（如round_1_basic缺少基础字段），继续使用通用流程提取字段
          // 这种情况通常发生在round_1_basic，questions为空，但完成条件需要更多字段
          this.logger.debug(`当前轮次 ${roundInfo.round.roundId} 未完成（缺少字段: ${completionConditions.requiredFields.filter(f => !mergedParams[f]).join(', ')}），继续使用通用流程提取字段`);
          // 继续执行，使用通用流程生成澄清问题
        }
      }
      
      // 5. 检查是否需要触发 Gate 预检查（在任何轮次完成后都可能触发）
      // 🆕 修复：Gate 预检查应该在满足触发条件时立即执行，而不是只在 Round 4
      // Gate 预检查会根据 triggerConditions 自动判断是否应该执行
      if (config.gatePrechecks && this.gatePrecheckService) {
        const gateResult = await this.gatePrecheckService.executePrechecks(
          config.gatePrechecks,
          mergedParams,
          destinationCode
        );
        
        if (gateResult.blocked) {
          // 🆕 P1: Gate 阻止，返回警告和明确的替代方案选择按钮
          const alternativeActions = gateResult.alternatives?.map((alt, index) => ({
            id: `gate_alternative_${gateResult.checkId}_${index}`,
            label: alt.label,
            description: alt.description,
            action: alt.action || `set_alternative_${index}`,
            type: 'button' as const,
          })) || [];
          
          this.logger.warn(
            `Gate 预检查阻止创建: checkId=${gateResult.checkId}, sessionId=${sessionId}, params=${JSON.stringify(mergedParams)}`
          );
          
          // 🆕 获取目的地中文名称
          let destinationName = destinationCode;
          if (config && config.destinationName) {
            destinationName = config.destinationName;
          } else {
            const countryNameMap: Record<string, string> = {
              'GL': '格陵兰',
              'IS': '冰岛',
              'SJ': '斯瓦尔巴',
              'AR': '阿根廷',
            };
            destinationName = countryNameMap[destinationCode] || destinationCode;
          }
          
          return successResponse({
            sessionId,
            needsClarification: true,
            blockedByGate: true, // 🆕 标记被 Gate 阻止
            gateCheckId: gateResult.checkId, // 🆕 记录 Gate 检查ID
            destination: destinationCode, // 🆕 添加国家代码
            destinationName, // 🆕 添加中文目的地名称
            plannerResponseBlocks: [
              {
                type: 'highlight',
                highlightType: 'warning',
                highlightText: gateResult.warningMessage || '⚠️ 检测到潜在风险，请选择替代方案',
              },
              ...(alternativeActions.length > 0 ? [{
                type: 'action_buttons', // 🆕 新增 action_buttons 类型
                buttons: alternativeActions,
              }] : []),
            ],
            clarificationQuestions: gateResult.additionalQuestions || [],
            alternativeActions, // 🆕 同时提供 alternativeActions 字段供前端使用
          });
        }
      }
      
      // 6. 🆕 AI 决策逻辑：识别用户画像和应用安全第一原则
      let personaInfo: any = null;
      let safetyCheckResult: any = null;
      
      if (this.aiDecisionLogicService) {
        try {
          // 识别用户画像
          personaInfo = await this.aiDecisionLogicService.identifyPersona(
            destinationCode,
            mergedParams
          );
          
          if (personaInfo) {
            this.logger.debug(`识别到用户画像: ${personaInfo.personaName} (${personaInfo.personaId}), 置信度: ${personaInfo.confidence.toFixed(2)}`);
            
            // 应用安全第一原则检查
            const activityTypes = mergedParams.activityTypes || mergedParams.activityPreferences || [];
            if (activityTypes.length > 0 || mergedParams.activityTypes) {
              safetyCheckResult = await this.aiDecisionLogicService.applySafetyFirstPrinciple(
                destinationCode,
                personaInfo.personaId,
                activityTypes,
                mergedParams
              );
              
              if (safetyCheckResult.shouldBlock) {
                this.logger.warn(`安全第一原则阻止: ${safetyCheckResult.blockReason}`);
                // 如果被阻止，返回警告而不是继续澄清
                return successResponse({
                  sessionId,
                  needsClarification: true,
                  blockedBySafetyPrinciple: true,
                  personaInfo,
                  plannerResponseBlocks: [
                    {
                      type: 'highlight',
                      highlightType: 'warning',
                      highlightText: safetyCheckResult.warningMessage || '⚠️ 检测到安全风险',
                    },
                    ...(safetyCheckResult.alternatives && safetyCheckResult.alternatives.length > 0 ? [{
                      type: 'action_buttons',
                      buttons: (safetyCheckResult.alternatives as Array<{ label: string; description: string; action?: string }>).map((alt, idx) => ({
                        id: `safety_alternative_${idx}`,
                        label: alt.label,
                        description: alt.description,
                        action: alt.action || `set_alternative_${idx}`,
                        type: 'button' as const,
                      })),
                    }] : []),
                  ],
                  clarificationQuestions: [],
                  destination: destinationCode,
                  destinationName: config?.destinationName || destinationCode,
                });
              } else if (safetyCheckResult.shouldWarn) {
                this.logger.debug(`安全第一原则警告: ${safetyCheckResult.warningMessage}`);
              }
            }
          }
        } catch (error: any) {
          this.logger.warn(`AI 决策逻辑执行失败: ${error.message}`, error.stack);
          // 不影响主流程，继续执行
        }
      }
      
      // 7. 生成结构化澄清响应（增强版：包含画像信息）
      const structuredResponse = await this.generateStructuredClarificationResponseForRound(
        roundInfo.round,
        roundInfo.questions,
        mergedParams,
        parseResult.plannerReply,
        personaInfo,
        safetyCheckResult
      );
      
      // 8. 保存到会话
      const savedContext = await this.nlConversationContextService.addMessage(
        sessionId,
        userId,
        'assistant',
        structuredResponse.plannerReply,
        {
          needsClarification: true,
          plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
          clarificationQuestions: structuredResponse.clarificationQuestions,
          // 🆕 添加解析出的参数和确认卡片标记
          parsedParams: mergedParams,
          showConfirmCard: false, // 需要澄清时不显示确认卡片
          questionAnswers: {}, // 初始为空，用户回答后更新
          personaInfo: structuredResponse.personaInfo, // 🆕 添加画像信息到metadata
          recommendedRoutes: structuredResponse.recommendedRoutes, // 🆕 添加推荐路线到metadata
        }
      );
      
      // 🆕 获取最后一条消息的ID（用于前端更新答案）
      const lastMessage = savedContext.messages[savedContext.messages.length - 1];
      
      // 8. 更新部分参数
      await this.nlConversationContextService.updateContext(sessionId, userId, {
        conversationContext: parseResult.conversationContext,
        partialParams: mergedParams,
      });
      
      // 🆕 获取目的地中文名称（用于前端显示）
      let destinationName = destinationCode;
      if (config && config.destinationName) {
        destinationName = config.destinationName;
      } else {
        // 如果没有配置，使用默认映射
        const countryNameMap: Record<string, string> = {
          'GL': '格陵兰',
          'IS': '冰岛',
          'SJ': '斯瓦尔巴',
          'AR': '阿根廷',
          'JP': '日本',
          'CN': '中国',
          'US': '美国',
          'TH': '泰国',
        };
        destinationName = countryNameMap[destinationCode] || destinationCode;
      }
      
      const response = {
        sessionId,
        needsClarification: true,
        plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
        clarificationQuestions: structuredResponse.clarificationQuestions,
        plannerReply: structuredResponse.plannerReply,
        partialParams: mergedParams,
        destination: destinationCode, // 保留国家代码
        destinationName, // 🆕 添加中文目的地名称
        personaInfo: structuredResponse.personaInfo, // 🆕 添加画像信息
        recommendedRoutes: structuredResponse.recommendedRoutes, // 🆕 添加推荐路线
        lastMessageId: lastMessage.id, // 🆕 添加最后一条消息的ID（用于前端更新答案）
      };
      
      this.logger.debug(`特化澄清流程返回响应: ${JSON.stringify(response, null, 2)}`);
      
      return successResponse(response);
    } catch (error: any) {
      this.logger.error(`特化澄清流程失败: ${error.message}`, error.stack);
      // 降级到通用流程或返回错误
      return errorResponse(ErrorCode.INTERNAL_ERROR, `特化澄清流程失败: ${error.message}`);
    }
  }

  /**
   * 🆕 从参数创建行程（辅助方法）
   */
  private async createTripFromParams(
    params: Record<string, any>,
    userId: string,
    sessionId: string,
    destinationCode?: string
  ): Promise<any> {
    // 🆕 P0: 检查 Critical 字段（如果启用了目的地特化配置）
    if (destinationCode && this.destinationClarificationConfigService) {
      const criticalFields = await this.destinationClarificationConfigService.getCriticalFields(destinationCode);
      
      if (criticalFields.length > 0) {
        const missingCriticalFields = criticalFields.filter(
          field => !params[field.fieldName] || params[field.fieldName] === null || params[field.fieldName] === undefined
        );
        
        if (missingCriticalFields.length > 0) {
          // Critical 字段缺失，阻止创建
          const missingFieldNames = missingCriticalFields.map(f => f.fieldName);
          const questions = await this.destinationClarificationConfigService.getQuestionsForFields(
            destinationCode,
            missingFieldNames
          );
          
          // 计算进度
          const totalCritical = criticalFields.length;
          const completedCritical = totalCritical - missingCriticalFields.length;
          const progressPercent = Math.round((completedCritical / totalCritical) * 100);
          
          this.logger.warn(
            `Critical 字段阻止创建行程: destination=${destinationCode}, missingFields=${missingFieldNames.join(',')}, sessionId=${sessionId}`
          );
          
          // 🆕 获取目的地中文名称
          let destinationName = destinationCode;
          if (destinationCode && this.destinationClarificationConfigService) {
            const destConfig = await this.destinationClarificationConfigService.getConfig(destinationCode);
            if (destConfig && destConfig.destinationName) {
              destinationName = destConfig.destinationName;
            } else {
              const countryNameMap: Record<string, string> = {
                'GL': '格陵兰',
                'IS': '冰岛',
                'SJ': '斯瓦尔巴',
                'AR': '阿根廷',
              };
              destinationName = countryNameMap[destinationCode] || destinationCode;
            }
          }
          
          return successResponse({
            sessionId,
            needsClarification: true,
            blockedByCriticalFields: true, // 🆕 标记被 Critical 字段阻止
            destination: destinationCode, // 🆕 添加国家代码
            destinationName, // 🆕 添加中文目的地名称
            criticalFieldsProgress: {
              completed: completedCritical,
              total: totalCritical,
              percent: progressPercent,
            },
            plannerResponseBlocks: [
              {
                type: 'highlight',
                highlightType: 'warning',
                highlightText: `为了您的安全，请先回答以下 ${missingCriticalFields.length} 个关键问题：${missingCriticalFields.map(f => f.fieldName).join('、')}`,
              },
              {
                type: 'paragraph',
                content: `已完成 ${completedCritical}/${totalCritical} 个关键问题（${progressPercent}%）`,
              },
            ],
            clarificationQuestions: questions.map(q => ({
              id: q.id,
              question: q.question,
              type: q.type,
              options: q.options,
              required: q.required,
              hint: q.hint,
              placeholder: q.placeholder,
              metadata: q.metadata,
            })),
          });
        }
      }
    }
    
    // 转换参数为 CreateTripDto
    const travelers: Array<{ type: 'ADULT' | 'ELDERLY' | 'CHILD'; mobilityTag: MobilityTag }> = [];
    
    if (params.hasChildren) {
      travelers.push({ type: 'CHILD', mobilityTag: MobilityTag.CITY_POTATO });
    }
    if (params.hasElderly) {
      travelers.push({ type: 'ELDERLY', mobilityTag: MobilityTag.ACTIVE_SENIOR });
    }
    // 默认至少一个成人
    if (travelers.length === 0 || !travelers.some(t => t.type === 'ADULT')) {
      travelers.push({ type: 'ADULT', mobilityTag: MobilityTag.CITY_POTATO });
    }

    // 确保日期格式正确
    let startDate = params.startDate;
    let endDate = params.endDate;
    if (startDate && startDate.includes('T')) {
      startDate = startDate.split('T')[0];
    }
    if (endDate && endDate.includes('T')) {
      endDate = endDate.split('T')[0];
    }

    const createTripDto: CreateTripDto = {
      destination: params.destination,
      startDate,
      endDate,
      totalBudget: params.totalBudget,
      travelers: travelers as any,
    };
    
    // 创建行程
    const trip = await this.tripsService.create(createTripDto, userId);
    
    // 设置预算约束
    try {
      await this.tripBudgetService.setBudgetConstraint(trip.id, {
        total: params.totalBudget,
        currency: 'CNY',
        dailyBudget: undefined, // 让系统自动计算
      });
    } catch (error: any) {
      this.logger.warn(`设置预算约束失败: ${error.message}`);
    }
    
    // 添加成功消息到会话
    await this.nlConversationContextService.addMessage(
      sessionId,
      userId,
      'assistant',
      `行程已创建成功！目的地：${params.destination}，日期：${startDate} 至 ${endDate}，预算：${params.totalBudget}元`,
      {
        tripId: trip.id,
        success: true,
      }
    );
    
    // 🆕 获取目的地中文名称
    let destinationName = params.destination;
    if (destinationCode) {
      if (this.destinationClarificationConfigService) {
        const destConfig = await this.destinationClarificationConfigService.getConfig(destinationCode);
        if (destConfig && destConfig.destinationName) {
          destinationName = destConfig.destinationName;
        } else {
          const countryNameMap: Record<string, string> = {
            'GL': '格陵兰',
            'IS': '冰岛',
            'SJ': '斯瓦尔巴',
            'AR': '阿根廷',
            'JP': '日本',
            'CN': '中国',
            'US': '美国',
            'TH': '泰国',
          };
          destinationName = countryNameMap[destinationCode] || destinationCode;
        }
      }
    }
    
    return successResponse({
      sessionId,
      trip,
      parsedParams: params,
      destination: destinationCode || params.destination, // 🆕 添加国家代码
      destinationName, // 🆕 添加中文目的地名称
    });
  }

  /**
   * 🆕 为特化轮次生成结构化澄清响应（增强版：包含 AI 决策逻辑）
   */
  private async generateStructuredClarificationResponseForRound(
    round: any,
    questions: any[],
    currentParams: Record<string, any>,
    fallbackText?: string,
    personaInfo?: any,
    safetyCheckResult?: any
  ): Promise<{
    plannerResponseBlocks: any[];
    clarificationQuestions: any[];
    plannerReply: string;
    personaInfo?: any;
    recommendedRoutes?: any[];
  }> {
    // 构建响应块
    const blocks: any[] = [];
    
    // 🆕 添加画像信息（如果已识别）
    if (personaInfo) {
      blocks.push({
        type: 'paragraph',
        content: `根据您的回答，我们识别您可能是：**${personaInfo.personaName}**${personaInfo.personaNameEn ? ` (${personaInfo.personaNameEn})` : ''}`,
      });
      
      if (personaInfo.matchReasons && personaInfo.matchReasons.length > 0) {
        blocks.push({
          type: 'paragraph',
          content: `匹配原因：${personaInfo.matchReasons.join('；')}`,
        });
      }
    }
    
    // 🆕 添加安全警告（如果有）
    if (safetyCheckResult?.shouldWarn && !safetyCheckResult.shouldBlock) {
      blocks.push({
        type: 'highlight',
        highlightType: 'warning',
        highlightText: safetyCheckResult.warningMessage,
      });
    }
    
    // 添加轮次描述
    if (round.description) {
      blocks.push({
        type: 'paragraph',
        content: round.description,
      });
    }
    
    // 添加问题卡片
    for (const question of questions) {
      blocks.push({
        type: 'question_card',
        questionId: question.id,
      });
    }
    
    // 🆕 生成增强的文本回复（包含画像信息）
    let textReply = fallbackText || `让我来帮您完善${round.name}的信息。`;
    
    if (personaInfo) {
      textReply = `根据您的回答，我们识别您可能是：**${personaInfo.personaName}**。${textReply}`;
    }
    
    if (safetyCheckResult?.shouldWarn && !safetyCheckResult.shouldBlock) {
      textReply = `${safetyCheckResult.warningMessage}\n\n${textReply}`;
    }
    
    // 🆕 修复：生成结构化的 clarificationQuestions 数组
    // 确保每个问题都有完整的字段，包括 options 的完整结构
    const structuredQuestions = questions.map(q => {
      const question: any = {
        id: q.id,
        question: q.question,
        type: q.type,
        required: q.required || false,
      };
      
      // 添加选项（保持完整结构，包括 value 和 label）
      if (q.options && Array.isArray(q.options)) {
        question.options = q.options.map((opt: any) => {
          if (typeof opt === 'string') {
            return { value: opt, label: opt };
          }
          return {
            value: opt.value || opt.label || opt,
            label: opt.label || opt.value || opt,
            ...(opt.actions && { actions: opt.actions }),
          };
        });
      }
      
      // 添加其他可选字段
      if (q.hint) question.hint = q.hint;
      if (q.placeholder) question.placeholder = q.placeholder;
      if (q.default !== undefined) question.default = q.default;
      if (q.validation) question.validation = q.validation;
      if (q.dependencies) question.dependencies = q.dependencies;
      
      // 添加元数据（包括 isCritical 标记）
      question.metadata = {
        ...q.metadata,
        category: q.metadata?.category,
        priority: q.metadata?.priority || 'medium',
        isCritical: q.metadata?.isCritical || false,
        fieldName: q.metadata?.fieldName,
      };
      
      return question;
    });
    
    this.logger.debug(`生成结构化澄清问题: ${structuredQuestions.length} 个问题`);
    if (structuredQuestions.length > 0) {
      this.logger.debug(`问题列表: ${structuredQuestions.map(q => q.id).join(', ')}`);
    }
    
    // 🆕 获取推荐路线（如果已识别画像）
    let recommendedRoutes: any[] = [];
    if (personaInfo && this.aiDecisionLogicService) {
      try {
        recommendedRoutes = await this.aiDecisionLogicService.getRecommendedRoutes(
          currentParams.destination || '',
          personaInfo.personaId,
          currentParams
        );
        
        if (recommendedRoutes.length > 0) {
          blocks.push({
            type: 'paragraph',
            content: `\n**推荐路线**：\n${recommendedRoutes.map((r, i) => `${i + 1}. ${r.route} - ${r.reason}`).join('\n')}`,
          });
        }
      } catch (error: any) {
        this.logger.warn(`获取推荐路线失败: ${error.message}`);
      }
    }
    
    return {
      plannerResponseBlocks: blocks,
      clarificationQuestions: structuredQuestions,
      plannerReply: textReply,
      personaInfo,
      recommendedRoutes,
    };
  }

  // ==================== 自然语言对话上下文管理接口 ====================

  @Get('nl-conversation/:sessionId')
  @Public() // 🆕 修复：允许未登录用户恢复会话（与创建行程接口保持一致）
  @ApiOperation({
    summary: '获取对话上下文',
    description: '根据会话 ID 获取自然语言创建行程时的对话历史记录',
  })
  @ApiParam({ name: 'sessionId', description: '会话 ID' })
  @ApiResponse({
    status: 200,
    description: '成功获取对话上下文',
    type: ApiSuccessResponseDto,
  })
  async getConversationContext(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      // 🆕 修复：如果没有 userId，使用 sessionId 作为临时 userId（允许未登录用户恢复会话）
      const userId = user?.userId || `temp_${sessionId}`;
      
      // 🆕 修复：允许通过 sessionId 恢复会话，即使没有认证
      // 先尝试使用原始 userId，如果失败则尝试使用 sessionId 作为 userId
      let context = await this.nlConversationContextService.getContext(sessionId, userId);
      
      // 如果使用 temp userId 找不到，尝试直接通过 sessionId 查找（兼容旧会话）
      if (!context && !user?.userId) {
        // 尝试使用 sessionId 作为 userId 查找
        context = await this.nlConversationContextService.getContext(sessionId, sessionId);
      }
      
      if (!context) {
        return errorResponse(ErrorCode.NOT_FOUND, '会话不存在或已过期');
      }

      return successResponse(context);
    } catch (error: any) {
      this.logger.error(`获取对话上下文失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '获取对话上下文失败');
    }
  }

  @Get('nl-conversation')
  @Public() // 🆕 允许未登录用户获取会话列表（与创建行程接口保持一致）
  @ApiOperation({
    summary: '获取用户的所有对话会话',
    description: '获取当前用户的所有自然语言创建行程对话会话列表（只返回最后一条消息用于预览）',
  })
  @ApiResponse({
    status: 200,
    description: '成功获取会话列表',
    type: ApiSuccessResponseDto,
  })
  async getUserConversations(
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      // 🆕 如果没有 userId，返回空列表（未登录用户没有会话）
      const userId = user?.userId;
      if (!userId) {
        return successResponse({ sessions: [] });
      }

      const sessions = await this.nlConversationContextService.getUserSessions(userId);
      return successResponse({ sessions });
    } catch (error: any) {
      this.logger.error(`获取用户会话列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '获取会话列表失败');
    }
  }

  @Put('nl-conversation/:sessionId')
  @Public() // 🆕 允许未登录用户更新会话（与创建行程接口保持一致）
  @ApiOperation({
    summary: '更新对话上下文',
    description: '更新会话的对话上下文数据或部分参数',
  })
  @ApiParam({ name: 'sessionId', description: '会话 ID' })
  @ApiBody({ type: UpdateConversationContextDto })
  @ApiResponse({
    status: 200,
    description: '成功更新对话上下文',
    type: ApiSuccessResponseDto,
  })
  async updateConversationContext(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateConversationContextDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      // 🆕 如果没有 userId，使用 sessionId 作为临时 userId
      const userId = user?.userId || `temp_${sessionId}`;

      if (dto.sessionId !== sessionId) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '会话 ID 不匹配');
      }

      const context = await this.nlConversationContextService.updateContext(sessionId, userId, {
        conversationContext: dto.conversationContext,
        partialParams: dto.partialParams,
      });

      return successResponse(context);
    } catch (error: any) {
      this.logger.error(`更新对话上下文失败: ${error.message}`, error.stack);
      if (error.message.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, '更新对话上下文失败');
    }
  }

  @Put('nl-conversation/:sessionId/messages/:messageId')
  @Public() // 🆕 允许未登录用户更新消息（与创建行程接口保持一致）
  @ApiOperation({
    summary: '更新消息的问题答案',
    description: '更新特定消息的 questionAnswers 字段',
  })
  @ApiParam({ name: 'sessionId', description: '会话 ID' })
  @ApiParam({ name: 'messageId', description: '消息 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        questionAnswers: {
          type: 'object',
          description: '问题答案映射',
          additionalProperties: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功更新消息',
    type: ApiSuccessResponseDto,
  })
  async updateMessageQuestionAnswers(
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Body() body: { questionAnswers: Record<string, string | string[] | number | boolean | null> },
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      // 🆕 如果没有 userId，使用 sessionId 作为临时 userId
      const userId = user?.userId || `temp_${sessionId}`;
      
      const message = await this.nlConversationContextService.updateMessageQuestionAnswers(
        sessionId,
        userId,
        messageId,
        body.questionAnswers
      );
      
      return successResponse({
        messageId: message.id,
        questionAnswers: message.metadata?.questionAnswers || {},
      });
    } catch (error: any) {
      this.logger.error(`更新消息问题答案失败: ${error.message}`, error.stack);
      if (error.message.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, '更新消息问题答案失败');
    }
  }

  @Delete('nl-conversation/:sessionId')
  @Public() // 🆕 允许未登录用户删除会话（与创建行程接口保持一致）
  @ApiOperation({
    summary: '删除对话会话',
    description: '删除指定的对话会话及其所有历史记录。如果会话不存在，会静默返回成功（前端会处理）。',
  })
  @ApiParam({ name: 'sessionId', description: '会话 ID' })
  @ApiResponse({
    status: 200,
    description: '成功删除会话（或会话不存在）',
    type: ApiSuccessResponseDto,
  })
  async deleteConversation(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      // 🆕 如果没有 userId，使用 sessionId 作为临时 userId
      const userId = user?.userId || `temp_${sessionId}`;

      this.logger.debug(`删除会话: sessionId=${sessionId}, userId=${userId}`);

      // 删除会话（如果不存在也不会抛出错误，静默处理）
      await this.nlConversationContextService.deleteSession(sessionId, userId);
      
      // 🆕 修复：如果未登录用户，还需要尝试删除旧格式的会话（兼容旧会话）
      // 因为 getConversationContext 会尝试使用 sessionId 作为 userId 查找
      if (!user?.userId) {
        this.logger.debug(`尝试删除旧格式会话: sessionId=${sessionId}, userId=${sessionId}`);
        await this.nlConversationContextService.deleteSession(sessionId, sessionId);
      }
      
      // 返回 null，符合前端要求
      return successResponse(null);
    } catch (error: any) {
      // 即使删除失败，也返回成功（前端会记录警告但继续清空本地数据）
      this.logger.warn(`删除会话失败（静默处理）: ${error.message}`, error.stack);
      return successResponse(null);
    }
  }

  @Get()
  @ApiOperation({ 
    summary: '获取所有行程',
    description: '返回所有行程列表，包含每个行程的基本信息和关联的 TripDay'
  })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@CurrentUser() user?: CurrentUserPayload) {
    const userId = user?.userId;
    const trips = await this.tripsService.findAll(userId);
    return successResponse(trips);
  }

  @Get('attention-queue')
  @ApiOperation({
    summary: '获取关注队列',
    description: '获取需要用户关注的队列列表，用于 Dashboard 页面的 Attention Queue 显示。支持全局查询（所有行程）或按 tripId 过滤。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回关注队列（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAttentionQueue(@Query() query: GetAttentionQueueQueryDto) {
    try {
      const result = await this.tripsService.getAttentionQueue(query);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 后台管理接口 ====================
  // 注意：admin 路由必须放在 :id 路由之前，避免路由冲突

  @Get('admin')
  @ApiOperation({
    summary: '获取行程列表（管理接口）',
    description: '获取所有行程列表，支持分页、筛选、排序、搜索。用于后台管理系统。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回行程列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAllAdmin(@Query() query: any) {
    try {
      const result = await this.tripsService.findAllAdmin(query);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取行程列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('admin/stats')
  @ApiOperation({
    summary: '获取行程统计信息（管理接口）',
    description: '获取行程相关的统计数据，包括总体统计、分类统计、趋势分析等。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回行程统计信息（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminStats(@Query() query: any) {
    try {
      const stats = await this.tripsService.getAdminStats(query);
      return successResponse(stats);
    } catch (error: any) {
      this.logger.error(`获取行程统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('admin/:id')
  @ApiOperation({
    summary: '获取行程详情（管理视图）',
    description: '获取单个行程的完整信息，包括所有关联数据。用于后台管理系统。',
  })
  @ApiParam({ name: 'id', description: '行程ID（UUID）' })
  @ApiResponse({
    status: 200,
    description: '成功返回行程详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOneAdmin(@Param('id') id: string) {
    try {
      const trip = await this.tripsService.findOneAdmin(id);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`获取行程详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('admin/batch')
  @ApiOperation({
    summary: '批量操作（管理接口）',
    description: '批量执行操作（删除、状态更新等）。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['DELETE', 'UPDATE_STATUS'] },
        tripIds: { type: 'array', items: { type: 'string' } },
        params: { type: 'object' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功执行批量操作（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async batchOperation(@Body() body: any) {
    try {
      const result = await this.tripsService.batchOperation(body);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`批量操作失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('admin/:id/export')
  @ApiOperation({
    summary: '导出行程数据（管理接口）',
    description: '导出单个行程的完整数据（JSON/CSV格式）。',
  })
  @ApiParam({ name: 'id', description: '行程ID（UUID）' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'], description: '导出格式', example: 'json' })
  @ApiResponse({
    status: 200,
    description: '成功导出数据',
  })
  async exportTrip(@Param('id') id: string, @Query('format') format: string = 'json') {
    try {
      const result = await this.tripsService.exportTrip(id, format);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`导出行程数据失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: '获取单个行程详情（全景视图）',
    description: '根据行程 ID 获取完整的行程树形结构，包括：\n' +
                 '- 所有 TripDay（按日期排序）\n' +
                 '- 每个 Day 下的所有 ItineraryItem（按时间排序）\n' +
                 '- 每个 Item 关联的 Place 详情（包含中英文名称、位置、营业时间等）\n' +
                 '- 统计信息（总天数、总活动数、行程状态等）'
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      const trip = await this.tripsService.findOne(id, userId);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get(':id/insight')
  @ApiOperation({
    summary: '获取行程洞察摘要',
    description: '获取行程的 AI 洞察摘要，包括行程基本信息、AI 发现的问题/建议、准备度摘要和整体状态。用于前端展示行程健康度和优化建议。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({
    status: 200,
    description: '成功返回行程洞察摘要（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getInsight(@Param('id') id: string) {
    try {
      const insight = await this.tripInsightService.getInsight(id);
      return successResponse(insight);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`获取行程洞察失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: '更新行程基本信息',
    description: '更新行程的基本信息，包括目的地、日期、预算、旅行者、状态等。支持部分更新（只更新提供的字段）。状态更新会进行合法性验证：已取消的行程不能修改状态，已完成的行程不能改回规划中或进行中。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({ type: UpdateTripDto })
  @ApiResponse({
    status: 200,
    description: '更新成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async update(@Param('id') id: string, @Body() dto: UpdateTripDto) {
    try {
      const trip = await this.tripsService.update(id, dto);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`更新行程失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除行程',
    description: '删除指定的行程及其所有关联数据，包括：\n' +
                 '- 所有行程日期（TripDay）\n' +
                 '- 所有行程项（ItineraryItem）\n' +
                 '- 所有协作者（TripCollaborator）\n' +
                 '- 所有收藏（TripCollection）\n' +
                 '- 所有点赞（TripLike）\n' +
                 '- 所有分享（TripShare）\n\n' +
                 '**安全确认**：为防止误删，需要输入目的地国家代码（如：JP、IS）来确认删除。\n\n' +
                 '**警告**：此操作不可恢复，请谨慎使用。'
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({ type: DeleteTripDto })
  @ApiResponse({
    status: 200,
    description: '删除成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '行程不存在或确认文字不匹配（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async remove(@Param('id') id: string, @Body() dto: DeleteTripDto) {
    try {
      const result = await this.tripsService.remove(id, dto.confirmText);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get(':id/state')
  @ApiOperation({
    summary: '获取行程当前状态',
    description: '返回行程的当前状态，包括当前日期、当前行程项、下一站信息等。用于语音问"下一站"和按钮操作。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'now', description: '当前时间（ISO 格式，可选）', example: '2024-05-01T10:30:00.000Z', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回行程当前状态',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getTripState(
    @Param('id') id: string,
    @Query('now') nowISO?: string,
  ) {
    try {
      const state = await this.tripsService.getTripState(id, nowISO);
      return successResponse(state);
    } catch (error: any) {
      if (error.status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get(':id/schedule')
  @ApiOperation({
    summary: '获取指定日期的 Schedule',
    description: '从数据库读取指定日期的 Schedule（DayScheduleResult 格式）。如果该日期没有 Schedule，返回 null。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'date', description: '日期（YYYY-MM-DD）', example: '2024-05-01', required: true })
  @ApiResponse({
    status: 200,
    description: '成功返回 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getSchedule(
    @Param('id') id: string,
    @Query('date') dateISO: string,
  ) {
    try {
      const result = await this.tripsService.getSchedule(id, dateISO);
      return successResponse(result);
    } catch (error: any) {
      if (error.status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Put(':id/schedule')
  @ApiOperation({
    summary: '保存指定日期的 Schedule',
    description: '将 Schedule（DayScheduleResult）保存到数据库，转换为 ItineraryItem。用于保存 apply-action、what-if apply 后的新 schedule。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'date', description: '日期（YYYY-MM-DD）', example: '2024-05-01', required: true })
  @ApiResponse({
    status: 200,
    description: '成功保存 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async saveSchedule(
    @Param('id') id: string,
    @Query('date') dateISO: string,
    @Body() body: SaveScheduleDto,
  ) {
    try {
      const result = await this.tripsService.saveSchedule(id, dateISO, body.schedule);
      return successResponse(result);
    } catch (error: any) {
      if (error.status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get(':id/actions')
  @ApiOperation({
    summary: '获取操作历史',
    description: '获取行程的操作历史记录，支持按日期筛选。用于审计回放和撤销功能。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'date', description: '日期（YYYY-MM-DD，可选）', example: '2024-05-01', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回操作历史列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getActionHistory(
    @Param('id') id: string,
    @Query('date') dateISO?: string,
  ) {
    try {
      const history = await this.tripsService.getActionHistory(id, dateISO);
      return successResponse(history);
    } catch (error: any) {
      if (error.message?.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post(':id/actions/undo')
  @ApiOperation({
    summary: '撤销操作',
    description: '撤销最后一次操作，返回操作前的 Schedule。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: '日期（YYYY-MM-DD）',
          example: '2024-05-01',
        },
      },
      required: ['date'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回撤销后的 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在或没有可撤销的操作' })
  async undoAction(
    @Param('id') id: string,
    @Body() body: { date: string },
  ) {
    try {
      const schedule = await this.tripsService.undoAction(id, body.date);
      if (!schedule) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, '没有可撤销的操作');
      }
      return successResponse({ schedule });
    } catch (error: any) {
      if (error.message?.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post(':id/actions/redo')
  @ApiOperation({
    summary: '重做操作',
    description: '重做最后一次撤销的操作，返回操作后的 Schedule。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: '日期（YYYY-MM-DD）',
          example: '2024-05-01',
        },
      },
      required: ['date'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回重做后的 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在或没有可重做的操作' })
  async redoAction(
    @Param('id') id: string,
    @Body() body: { date: string },
  ) {
    try {
      const schedule = await this.tripsService.redoAction(id, body.date);
      if (!schedule) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, '没有可重做的操作');
      }
      return successResponse({ schedule });
    } catch (error: any) {
      if (error.message?.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post(':id/share')
  @ApiOperation({
    summary: '生成行程分享链接',
    description: '生成行程分享链接/二维码，设置查看/编辑权限。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: CreateTripShareDto })
  @ApiResponse({
    status: 200,
    description: '成功生成分享链接（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async createShare(
    @Param('id') id: string,
    @Body() dto: CreateTripShareDto
  ) {
    try {
      const share = await this.tripExtendedService.createShare(id, dto);
      return successResponse(share);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/collaborators')
  @ApiOperation({
    summary: '添加行程协作者',
    description: '通过邮箱添加行程协作者，设置查看/编辑权限。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: AddCollaboratorDto })
  @ApiResponse({
    status: 200,
    description: '成功添加协作者（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async addCollaborator(
    @Param('id') id: string,
    @Body() dto: AddCollaboratorDto
  ) {
    try {
      const collaborator = await this.tripExtendedService.addCollaborator(id, dto);
      return successResponse(collaborator);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/collaborators')
  @ApiOperation({
    summary: '获取协作者列表',
    description: '获取行程的所有协作者列表。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回协作者列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getCollaborators(@Param('id') id: string) {
    try {
      const collaborators = await this.tripExtendedService.getCollaborators(id);
      return successResponse(collaborators);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/collaborators/:userId')
  @ApiOperation({
    summary: '移除协作者',
    description: '移除行程的指定协作者。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({
    status: 200,
    description: '成功移除协作者（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async removeCollaborator(
    @Param('id') id: string,
    @Param('userId') userId: string
  ) {
    try {
      const result = await this.tripExtendedService.removeCollaborator(id, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/collect')
  @ApiOperation({
    summary: '收藏行程',
    description: '收藏行程，用于后续参考。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功收藏行程（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async collectTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.collectTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/collect')
  @ApiOperation({
    summary: '取消收藏行程',
    description: '取消收藏行程。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功取消收藏（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async uncollectTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.uncollectTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/like')
  @ApiOperation({
    summary: '点赞行程',
    description: '点赞行程，用于热门行程推荐。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功点赞行程（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async likeTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.likeTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/like')
  @ApiOperation({
    summary: '取消点赞行程',
    description: '取消点赞行程。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功取消点赞（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async unlikeTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.unlikeTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('featured')
  @ApiOperation({
    summary: '获取热门推荐行程',
    description: '根据点赞数和收藏数获取热门推荐行程列表。',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回数量限制', example: 10 })
  @ApiResponse({
    status: 200,
    description: '成功返回热门行程列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getFeaturedTrips(@Query('limit') limit?: number) {
    try {
      const trips = await this.tripExtendedService.getFeaturedTrips(limit ? parseInt(limit.toString()) : 10);
      return successResponse(trips);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/offline-pack')
  @ApiOperation({
    summary: '导出行程离线数据包',
    description: '导出行程离线数据包（包含地点详情、路线、Schedule），用于离线查看和编辑。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功导出离线数据包（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async exportOfflinePack(@Param('id') id: string) {
    try {
      const pack = await this.tripExtendedService.exportOfflinePack(id);
      return successResponse(pack);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/offline-status')
  @ApiOperation({
    summary: '查询离线数据包状态',
    description: '查询行程的离线数据包是否存在及其版本信息。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回离线数据包状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getOfflinePackStatus(@Param('id') id: string) {
    try {
      const status = await this.tripExtendedService.getOfflinePackStatus(id);
      return successResponse(status);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/offline-sync')
  @ApiOperation({
    summary: '同步离线修改',
    description: '联网后同步离线修改的内容。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      description: '离线数据',
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功同步离线数据（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async syncOfflineChanges(
    @Param('id') id: string,
    @Body() offlineData: any
  ) {
    try {
      const result = await this.tripExtendedService.syncOfflineChanges(id, offlineData);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/recap')
  @ApiOperation({ 
    summary: '生成行程复盘报告',
    description: '生成包含景点打卡顺序、徒步总里程、海拔变化等数据的完整复盘报告'
  })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generateRecap(@Param('id') id: string) {
    try {
      const recap = await this.tripRecapService.generateRecap(id);
      return successResponse(recap);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/recap/export')
  @ApiOperation({ 
    summary: '导出行程复盘报告（用于分享）',
    description: '导出为可分享的格式，包含完整的景点和徒步轨迹数据'
  })
  @ApiResponse({ status: 200, description: '导出成功' })
  async exportRecap(@Param('id') id: string) {
    try {
      const exportData = await this.tripRecapService.exportForSharing(id);
      return successResponse(exportData);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/trail-video-data')
  @ApiOperation({ 
    summary: '生成3D轨迹视频数据',
    description: '返回GPX和关键点信息，前端可据此生成3D轨迹视频'
  })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generateTrailVideoData(@Param('id') id: string) {
    try {
      const videoData = await this.tripRecapService.generateTrailVideoData(id);
      return successResponse(videoData);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('shared/:shareToken')
  @ApiOperation({ 
    summary: '根据分享令牌获取行程',
    description: '获取分享的行程数据，包括所有Trail信息、行程项、景点等完整数据。可用于预览分享的行程。'
  })
  @ApiParam({ name: 'shareToken', description: '分享令牌', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({ status: 200, description: '获取成功，返回完整的行程数据（包括Trail）' })
  @ApiResponse({ status: 404, description: '分享链接不存在或已失效' })
  @ApiResponse({ status: 400, description: '分享链接已过期' })
  async getTripByShareToken(@Param('shareToken') shareToken: string) {
    try {
      const tripData = await this.tripExtendedService.getTripByShareToken(shareToken);
      return successResponse(tripData);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('shared/:shareToken/import')
  @ApiOperation({ 
    summary: '导入分享的行程',
    description: '从分享链接导入行程，包括所有Trail数据，创建新的行程副本。会完整复制所有行程项、Trail关联、GPX数据等。'
  })
  @ApiParam({ name: 'shareToken', description: '分享令牌', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({
    description: '导入行程请求',
    schema: {
      type: 'object',
      required: ['destination', 'startDate', 'endDate'],
      properties: {
        destination: { type: 'string', description: '目的地', example: '武功山' },
        startDate: { type: 'string', description: '开始日期（ISO 8601）', example: '2024-05-01' },
        endDate: { type: 'string', description: '结束日期（ISO 8601）', example: '2024-05-03' },
        userId: { type: 'string', description: '用户ID（可选）', example: 'user123' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '导入成功，返回新创建的行程ID' })
  @ApiResponse({ status: 404, description: '分享链接不存在或已失效' })
  @ApiResponse({ status: 400, description: '分享链接已过期或数据验证失败' })
  async importTripFromShare(
    @Param('shareToken') shareToken: string,
    @Body() body: {
      destination: string;
      startDate: string;
      endDate: string;
      userId?: string;
    }
  ) {
    try {
      const result = await this.tripExtendedService.importTripFromShare(shareToken, body);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/emergency/sos')
  @ApiOperation({
    summary: '发送紧急求救信号',
    description: '在行程中遇到危险时一键发送求救信号，包含精准经纬度和行程相关背景',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number', description: '纬度', example: 64.1283 },
        longitude: { type: 'number', description: '经度', example: -21.8278 },
        message: { type: 'string', description: '求救消息（可选）', example: '迷路，需要救援' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '求救信号发送成功',
    type: ApiSuccessResponseDto,
  })
  async sendEmergencySOS(
    @Param('id') id: string,
    @Body() body: { latitude: number; longitude: number; message?: string }
  ) {
    try {
      const request: EmergencySOSRequest = {
        tripId: id,
        latitude: body.latitude,
        longitude: body.longitude,
        message: body.message,
      };
      const response = await this.tripEmergencyService.sendSOS(request);
      return successResponse(response);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/emergency/history')
  @ApiOperation({
    summary: '获取求救记录',
    description: '获取行程的所有求救记录',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回求救记录列表',
    type: ApiSuccessResponseDto,
  })
  async getSOSHistory(@Param('id') id: string) {
    try {
      const history = await this.tripEmergencyService.getSOSHistory(id);
      return successResponse(history);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/budget/constraint')
  @ApiOperation({
    summary: '设置行程预算约束',
    description: '为行程设置或更新预算约束（总预算、货币单位、日均预算、分类预算限制等）',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: '总预算（必填，单位：CNY）', minimum: 100, maximum: 1000000 },
        currency: { type: 'string', description: '货币单位（默认 "CNY"）', enum: ['CNY', 'USD', 'EUR', 'JPY'] },
        dailyBudget: { type: 'number', description: '日均预算（可选，自动计算或手动设置）' },
        categoryLimits: {
          type: 'object',
          properties: {
            accommodation: { type: 'number' },
            transportation: { type: 'number' },
            food: { type: 'number' },
            activities: { type: 'number' },
            other: { type: 'number' },
          },
        },
        alertThreshold: { type: 'number', description: '预警阈值（默认 0.8，即 80%）', minimum: 0, maximum: 1 },
      },
      required: ['total'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功设置预算约束',
    type: ApiSuccessResponseDto,
  })
  async setBudgetConstraint(
    @Param('id') id: string,
    @Body() body: {
      total?: number;
      currency?: string;
      dailyBudget?: number;
      categoryLimits?: {
        accommodation?: number;
        transportation?: number;
        food?: number;
        activities?: number;
        other?: number;
      };
      alertThreshold?: number;
    }
  ) {
    try {
      const constraint = await this.tripBudgetService.setBudgetConstraint(id, body);
      return successResponse({ tripId: id, budgetConstraint: constraint, updatedAt: constraint.updatedAt });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/constraint')
  @ApiOperation({
    summary: '获取预算约束',
    description: '获取行程的预算约束配置',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回预算约束',
    type: ApiSuccessResponseDto,
  })
  async getBudgetConstraint(@Param('id') id: string) {
    try {
      const constraint = await this.tripBudgetService.getBudgetConstraint(id);
      if (!constraint) {
        return successResponse({ budgetConstraint: null });
      }
      return successResponse({
        budgetConstraint: constraint,
        createdAt: constraint.createdAt,
        updatedAt: constraint.updatedAt,
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/budget/constraint')
  @ApiOperation({
    summary: '删除预算约束',
    description: '删除行程的预算约束（恢复为无预算限制）',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功删除预算约束',
    type: ApiSuccessResponseDto,
  })
  async deleteBudgetConstraint(@Param('id') id: string) {
    try {
      await this.tripBudgetService.deleteBudgetConstraint(id);
      return successResponse({ tripId: id, deletedAt: new Date().toISOString() });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/summary')
  @ApiOperation({
    summary: '获取行程预算摘要',
    description: '实时查看行程消费和预算情况，包含各类消费明细分类。支持时间范围和分类筛选。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'startDate', description: '开始日期（ISO 8601）', required: false })
  @ApiQuery({ name: 'endDate', description: '结束日期（ISO 8601）', required: false })
  @ApiQuery({ name: 'category', description: '分类筛选（accommodation/transportation/food/activities/other）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回预算摘要',
    type: ApiSuccessResponseDto,
  })
  async getBudgetSummary(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string
  ) {
    try {
      const summary = await this.tripBudgetService.getBudgetSummary(id);
      // TODO: 实现时间范围和分类筛选（当前返回完整摘要）
      return successResponse(summary);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/alert')
  @ApiOperation({
    summary: '检查预算预警',
    description: '添加新活动前检查是否会触发预算预警',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'cost', description: '新增项的成本', type: Number, required: true })
  @ApiResponse({
    status: 200,
    description: '返回预算预警（如果有）',
    type: ApiSuccessResponseDto,
  })
  async checkBudgetAlert(
    @Param('id') id: string,
    @Query('cost') cost: string
  ) {
    try {
      const alert = await this.tripBudgetService.checkBudgetAlert(id, parseFloat(cost));
      return successResponse(alert);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/optimization')
  @ApiOperation({
    summary: '获取预算优化建议',
    description: '提供合理的预算优化建议，包括替换、移除、调整等方案',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'category', description: '消费类别（可选）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回优化建议',
    type: ApiSuccessResponseDto,
  })
  async getBudgetOptimization(
    @Param('id') id: string,
    @Query('category') category?: string
  ) {
    try {
      const suggestions = await this.tripBudgetService.getBudgetOptimizationSuggestions(id, category);
      return successResponse(suggestions);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/details')
  @ApiOperation({
    summary: '获取预算明细',
    description: '获取预算的详细支出明细（按日期、分类、项目），支持时间范围、分类筛选和分页',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'startDate', description: '开始日期（ISO 8601）', required: false })
  @ApiQuery({ name: 'endDate', description: '结束日期（ISO 8601）', required: false })
  @ApiQuery({ name: 'category', description: '分类筛选（accommodation/transportation/food/activities/other）', required: false })
  @ApiQuery({ name: 'limit', description: '分页限制（默认 50）', required: false, type: Number })
  @ApiQuery({ name: 'offset', description: '分页偏移（默认 0）', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: '成功返回预算明细',
    type: ApiSuccessResponseDto,
  })
  async getBudgetDetails(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    try {
      const details = await this.tripBudgetService.getBudgetDetails(id, {
        startDate,
        endDate,
        category,
        limit: limit ? parseInt(limit.toString(), 10) : undefined,
        offset: offset ? parseInt(offset.toString(), 10) : undefined,
      });
      return successResponse(details);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/trends')
  @ApiOperation({
    summary: '获取预算趋势',
    description: '获取预算执行趋势（每日支出趋势、分类分布趋势），支持时间范围和粒度设置',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'startDate', description: '开始日期（ISO 8601）', required: false })
  @ApiQuery({ name: 'endDate', description: '结束日期（ISO 8601）', required: false })
  @ApiQuery({ name: 'granularity', description: '粒度（daily/weekly/monthly）', required: false, enum: ['daily', 'weekly', 'monthly'] })
  @ApiResponse({
    status: 200,
    description: '成功返回预算趋势',
    type: ApiSuccessResponseDto,
  })
  async getBudgetTrends(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: 'daily' | 'weekly' | 'monthly'
  ) {
    try {
      const trends = await this.tripBudgetService.getBudgetTrends(id, {
        startDate,
        endDate,
        granularity,
      });
      return successResponse(trends);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/report')
  @ApiOperation({
    summary: '生成预算执行分析报告',
    description: '行程结束后生成预算执行分析报告，包含消费趋势和优化建议',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功生成预算报告',
    type: ApiSuccessResponseDto,
  })
  async generateBudgetReport(@Param('id') id: string) {
    try {
      const report = await this.tripBudgetService.generateBudgetReport(id);
      return successResponse(report);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/monitor')
  @ApiOperation({
    summary: '实时预算监控',
    description: '获取实时预算监控数据（当前支出、剩余预算、每日支出、预警信息）',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'realtime', description: '是否启用实时推送（WebSocket，暂未实现）', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: '成功返回监控数据',
    type: ApiSuccessResponseDto,
  })
  async getBudgetMonitor(
    @Param('id') id: string,
    @Query('realtime') realtime?: boolean
  ) {
    try {
      const monitor = await this.tripBudgetService.getBudgetMonitor(id);
      return successResponse(monitor);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/statistics')
  @ApiOperation({
    summary: '预算执行统计',
    description: '获取预算执行的统计信息（完成度、超支率、分类占比、日均支出、风险等级等）',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回统计信息',
    type: ApiSuccessResponseDto,
  })
  async getBudgetStatistics(@Param('id') id: string) {
    try {
      const statistics = await this.tripBudgetService.getBudgetStatistics(id);
      return successResponse(statistics);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/adjust')
  @ApiOperation({
    summary: '修改行程并自动适配调整',
    description: '修改行程中的日期或活动安排，系统自动触发节奏修复机制，调整关联服务并更新预算',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['modifications'],
      properties: {
        modifications: {
          type: 'array',
          description: '修改列表',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['CHANGE_DATE', 'MOVE_ACTIVITY', 'ADD_ACTIVITY', 'REMOVE_ACTIVITY', 'ADD_BUFFERS'],
              },
              options: {
                type: 'object',
                description: '选项（用于 ADD_BUFFERS）',
                properties: {
                  bufferDuration: { type: 'number', description: '缓冲时长（分钟），默认 30' },
                  applyToAllDays: { type: 'boolean', description: '是否应用到所有日期，默认 false' },
                  dayId: { type: 'string', description: '如果 applyToAllDays 为 false，指定日期 ID' },
                },
              },
              itemId: { type: 'string', description: '行程项 ID（修改/删除时必填）' },
              newDate: { type: 'string', description: '新日期（YYYY-MM-DD）' },
              newStartTime: { type: 'string', description: '新开始时间（HH:mm）' },
              activityData: { type: 'object', description: '活动数据（添加时必填）' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '行程调整成功',
    type: ApiSuccessResponseDto,
  })
  async adjustTrip(
    @Param('id') id: string,
    @Body() body: { modifications: TripModificationRequest['modifications'] }
  ) {
    try {
      const request: TripModificationRequest = {
        tripId: id,
        modifications: body.modifications,
      };
      const result = await this.tripAdjustmentService.adjustTrip(request);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/persona-alerts')
  @ApiOperation({
    summary: '获取三人格提醒（Persona Alerts）',
    description: '获取当前行程的三人格（Abu、Dr.Dre、Neptune）提醒列表',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回提醒列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getPersonaAlerts(@Param('id') id: string) {
    try {
      const alerts = await this.tripsService.getPersonaAlerts(id);
      return successResponse(alerts);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/decision-log')
  @ApiOperation({
    summary: '获取决策记录/透明日志（Decision Log）',
    description: '获取行程的决策记录，用于透明日志展示',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回记录数量，默认 10' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '偏移量，默认 0' })
  @ApiResponse({
    status: 200,
    description: '成功返回决策记录（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getDecisionLog(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 10;
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      const log = await this.tripsService.getDecisionLog(id, limitNum, offsetNum);
      return successResponse(log);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // 🆕 P1功能：更具体的路由必须放在通用路由之前
  @Get(':id/evidence/completeness')
  @ApiOperation({
    summary: '检查行程的证据完整性',
    description: '检查行程中所有POI的期望证据类型，识别缺失的证据，并提供补充建议（P1功能）',
  })
  @ApiParam({ name: 'id', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功获取完整性检查结果',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async checkEvidenceCompleteness(@Param('id') id: string) {
    try {
      const result = await this.tripsService.checkEvidenceCompleteness(id);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`检查证据完整性失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '检查证据完整性失败', { originalError: error.message });
    }
  }

  @Get(':id/evidence/suggestions')
  @ApiOperation({
    summary: '获取证据获取建议（智能触发）',
    description: '自动检测缺失证据并生成获取建议，支持一键批量获取（P1功能）',
  })
  @ApiParam({ name: 'id', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功获取建议',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getEvidenceFetchSuggestions(@Param('id') id: string) {
    try {
      const result = await this.tripsService.getEvidenceFetchSuggestions(id);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`获取证据获取建议失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '获取证据获取建议失败', { originalError: error.message });
    }
  }

  // 通用路由放在最后
  @Get(':id/evidence')
  @ApiOperation({
    summary: '获取行程证据列表',
    description: '获取指定行程的所有证据项列表，用于 EvidenceDrawer 组件的证据标签页显示',
  })
  @ApiParam({ name: 'id', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功获取证据列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getEvidence(
    @Param('id') id: string,
    @Query() query: GetEvidenceQueryDto
  ) {
    try {
      const result = await this.tripsService.getEvidence(id, query);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`获取证据列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '获取证据列表失败', { originalError: error.message });
    }
  }

  @Patch(':id/evidence/:evidenceId')
  @ApiOperation({
    summary: '更新单个证据项的状态和备注',
    description: '更新指定证据项的状态（已读/已解决/已忽略）和用户备注。只有OWNER和EDITOR可以修改。',
  })
  @ApiParam({ name: 'id', description: '行程 ID' })
  @ApiParam({ name: 'evidenceId', description: '证据项 ID' })
  @ApiBody({ type: UpdateEvidenceRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功更新证据项',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数验证失败或状态转换不合法',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: '无权修改该行程的证据',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或证据项不存在',
    type: ApiErrorResponseDto,
  })
  async updateEvidence(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Body() dto: UpdateEvidenceRequestDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      const result = await this.tripsService.updateEvidence(id, evidenceId, dto, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      this.logger.error(`更新证据失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '更新证据失败', { originalError: error.message });
    }
  }

  @Put(':id/evidence/batch-update')
  @ApiOperation({
    summary: '批量更新证据项的状态和备注',
    description: '批量更新多个证据项的状态和备注。最多支持100个证据项。只有OWNER和EDITOR可以修改。',
  })
  @ApiParam({ name: 'id', description: '行程 ID' })
  @ApiBody({ type: BatchUpdateEvidenceRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功批量更新证据项',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数验证失败或批量数量超限',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: '无权修改该行程的证据',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async batchUpdateEvidence(
    @Param('id') id: string,
    @Body() dto: BatchUpdateEvidenceRequestDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      const result = await this.tripsService.batchUpdateEvidence(id, dto, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      this.logger.error(`批量更新证据失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '批量更新证据失败', { originalError: error.message });
    }
  }

  @Get(':id/tasks')
  @ApiOperation({
    summary: '获取今日重点任务（Today\'s Tasks）',
    description: '获取系统推荐的今日重点任务列表',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回任务列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getTasks(@Param('id') id: string) {
    try {
      const tasks = await this.tripsService.getTasks(id);
      return successResponse(tasks);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Patch(':id/tasks/:taskId')
  @ApiOperation({
    summary: '更新任务状态',
    description: '更新指定任务的完成状态',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'taskId', description: '任务 ID' })
  @ApiBody({ type: UpdateTaskStatusDto })
  @ApiResponse({
    status: 200,
    description: '成功更新任务状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或任务不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async updateTaskStatus(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() updateTaskStatusDto: UpdateTaskStatusDto,
  ) {
    try {
      const task = await this.tripsService.updateTaskStatus(id, taskId, updateTaskStatusDto.completed);
      return successResponse(task);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/pipeline-status')
  @ApiOperation({
    summary: '获取工作流 Pipeline 状态',
    description: '获取行程的工作流 Pipeline 各阶段状态',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回Pipeline状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getPipelineStatus(@Param('id') id: string) {
    try {
      const status = await this.tripsService.getPipelineStatus(id);
      return successResponse(status);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('draft')
  @ApiOperation({
    summary: '生成行程草案',
    description: '生成一个可预览的行程草案（不落库）。LLM 只负责选择与编排，所有行程项必须来自 place 表。',
  })
  @ApiBody({ type: CreateTripDraftDto })
  @ApiResponse({
    status: 200,
    description: '行程草案生成成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async createDraft(@Body() dto: CreateTripDraftDto) {
    try {
      const draft = await this.tripDraftService.generateDraft(dto);
      return successResponse(draft);
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`生成行程草案失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message || '生成行程草案失败');
    }
  }

  @Post(':tripId/items/:itemId/replace')
  @ApiOperation({
    summary: '替换单个行程项',
    description: 'Neptune 修复机制：替换单个行程项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'itemId', description: '行程项 ID' })
  @ApiBody({ type: ReplaceItineraryItemDto })
  @ApiResponse({
    status: 200,
    description: '替换成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async replaceItem(
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReplaceItineraryItemDto
  ) {
    try {
      const result = await this.tripDraftService.replaceItem(tripId, itemId, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`替换行程项失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message || '替换行程项失败');
    }
  }

  @Post(':tripId/regenerate')
  @ApiOperation({
    summary: '全局重生成行程',
    description: '重生成整个行程，但保持用户已锁定的项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({ type: RegenerateTripDto })
  @ApiResponse({
    status: 200,
    description: '重生成成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async regenerateTrip(
    @Param('tripId') tripId: string,
    @Body() dto: RegenerateTripDto
  ) {
    try {
      const result = await this.tripDraftService.regenerateTrip(tripId, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`重生成行程失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message || '重生成行程失败');
    }
  }

  @Get(':id/days/:dayId/metrics')
  @ApiOperation({
    summary: '获取每日行程指标',
    description: '获取指定日期的行程指标，包括步行距离、车程、缓冲时间、疲劳指数等',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'dayId', description: '日期 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回每日指标（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或日期不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getDayMetrics(
    @Param('id') id: string,
    @Param('dayId') dayId: string
  ) {
    try {
      const metrics = await this.tripMetricsService.getDayMetrics(id, dayId);
      return successResponse(metrics);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/metrics')
  @ApiOperation({
    summary: '批量获取多日指标',
    description: '获取行程的多日指标，支持按日期过滤',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'dates', description: '日期数组（可选）', type: [String], required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回指标（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getTripMetrics(
    @Param('id') id: string,
    @Query('dates') dates?: string | string[]
  ) {
    try {
      const dateArray = Array.isArray(dates) ? dates : dates ? [dates] : undefined;
      const metrics = await this.tripMetricsService.getTripMetrics(id, dateArray);
      return successResponse(metrics);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/conflicts')
  @ApiOperation({
    summary: '获取行程冲突列表',
    description: '获取行程的冲突列表，包括时间冲突、午餐时间窗、疲劳超标等',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'date', description: '指定日期（可选）', required: false })
  @ApiQuery({ name: 'severity', description: '过滤严重程度（可选）', enum: ConflictSeverity, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回冲突列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getConflicts(
    @Param('id') id: string,
    @Query('date') date?: string,
    @Query('severity') severity?: ConflictSeverity
  ) {
    try {
      const conflicts = await this.tripConflictsService.getConflicts(id, date, severity);
      return successResponse(conflicts);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Put(':id/intent')
  @ApiOperation({
    summary: '更新行程意图与约束',
    description: '更新行程的意图与约束，包括节奏配置、偏好设置、约束条件、规划策略等',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: UpdateIntentRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功更新意图（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async updateIntent(
    @Param('id') id: string,
    @Body() dto: UpdateIntentRequestDto
  ) {
    try {
      const result = await this.tripIntentService.updateIntent(id, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/intent')
  @ApiOperation({
    summary: '获取行程意图与约束',
    description: '获取行程的意图与约束配置',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回意图（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getIntent(@Param('id') id: string) {
    try {
      const intent = await this.tripIntentService.getIntent(id);
      return successResponse(intent);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/apply-optimization')
  @ApiOperation({
    summary: '应用优化结果到行程',
    description: '将优化结果应用到实际行程，支持预览模式',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: ApplyOptimizationRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功应用优化结果（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async applyOptimization(
    @Param('id') id: string,
    @Body() dto: ApplyOptimizationRequestDto
  ) {
    try {
      const result = await this.tripOptimizationService.applyOptimization(id, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/items/:itemId/detail')
  @ApiOperation({
    summary: '获取行程项详细信息',
    description: '获取行程项的详细信息，包括完整的 Place metadata 和 physicalMetadata',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'itemId', description: '行程项 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回详细信息（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getItemDetail(
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    try {
      const item = await this.prisma.itineraryItem.findUnique({
        where: { id: itemId },
        include: {
          Place: true,
          TripDay: {
            include: {
              Trip: true,
            },
          },
        },
      });

      if (!item) {
        throw new NotFoundException(`行程项 ID ${itemId} 不存在`);
      }

      // 验证行程项属于指定行程
      if (item.TripDay?.tripId !== id) {
        throw new NotFoundException(`行程项不属于指定行程`);
      }

      return successResponse(item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/items/batch-update')
  @ApiOperation({
    summary: '批量更新行程项',
    description: '批量更新多个行程项的时间、地点等信息',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: BatchUpdateItemsRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功批量更新（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async batchUpdateItems(
    @Param('id') id: string,
    @Body() dto: BatchUpdateItemsRequestDto
  ) {
    try {
      const errors: Array<{ itemId: string; error: string }> = [];
      let updatedCount = 0;

      for (const update of dto.updates) {
        try {
          // 验证行程项属于指定行程
          const item = await this.prisma.itineraryItem.findUnique({
            where: { id: update.itemId },
            include: {
              TripDay: true,
            },
          });

          if (!item) {
            errors.push({ itemId: update.itemId, error: '行程项不存在' });
            continue;
          }

          if (item.TripDay?.tripId !== id) {
            errors.push({ itemId: update.itemId, error: '行程项不属于指定行程' });
            continue;
          }

          // 更新行程项
          const updateData: any = {};
          if (update.startTime) {
            updateData.startTime = DateTime.fromISO(update.startTime).toJSDate();
          }
          if (update.endTime) {
            updateData.endTime = DateTime.fromISO(update.endTime).toJSDate();
          }
          if (update.placeId) {
            updateData.placeId = update.placeId;
          }
          if (update.note !== undefined) {
            updateData.note = update.note;
          }

          await this.prisma.itineraryItem.update({
            where: { id: update.itemId },
            data: updateData,
          });

          updatedCount++;
        } catch (error: any) {
          errors.push({ itemId: update.itemId, error: error.message || '更新失败' });
        }
      }

      const result: BatchUpdateItemsResponseDto = {
        success: errors.length === 0,
        updatedCount,
        failedCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      };

      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 从文本中提取国家代码（简单规则）
   * 支持国家名和城市名映射
   */
  private extractCountryCodeFromText(text: string): string | undefined {
    const countryMap: Record<string, string> = {
      // 国家名
      '冰岛': 'IS',
      'Iceland': 'IS',
      'iceland': 'IS',
      '中国': 'CN',
      'China': 'CN',
      'china': 'CN',
      '日本': 'JP',
      'Japan': 'JP',
      'japan': 'JP',
      '美国': 'US',
      'United States': 'US',
      'USA': 'US',
      '泰国': 'TH',
      'Thailand': 'TH',
      'thailand': 'TH',
      '新加坡': 'SG',
      'Singapore': 'SG',
      'singapore': 'SG',
      '韩国': 'KR',
      'Korea': 'KR',
      'korea': 'KR',
      '马来西亚': 'MY',
      'Malaysia': 'MY',
      'malaysia': 'MY',
      '越南': 'VN',
      'Vietnam': 'VN',
      'vietnam': 'VN',
      '格陵兰': 'GL',
      'Greenland': 'GL',
      'greenland': 'GL',
      'GL': 'GL',
      'gl': 'GL',
      '斯瓦尔巴': 'SJ',
      'Svalbard': 'SJ',
      'svalbard': 'SJ',
      'SJ': 'SJ',
      'sj': 'SJ',
      '阿根廷': 'AR',
      'Argentina': 'AR',
      'argentina': 'AR',
      'AR': 'AR',
      'ar': 'AR',
      // 阿尔卑斯（跨越多国）
      '阿尔卑斯': 'AL',
      '阿尔卑斯山': 'AL',
      'Alps': 'AL',
      'alps': 'AL',
      'AL': 'AL',
      'al': 'AL',
      // 西藏
      '西藏': 'XZ',
      'Tibet': 'XZ',
      'tibet': 'XZ',
      'XZ': 'XZ',
      'xz': 'XZ',
      '拉萨': 'XZ',
      'Lhasa': 'XZ',
      'lhasa': 'XZ',
      // 罗弗敦
      '罗弗敦': 'LF',
      'Lofoten': 'LF',
      'lofoten': 'LF',
      'LF': 'LF',
      'lf': 'LF',
      '罗弗敦群岛': 'LF',
      'Lofoten Islands': 'LF',
      'lofoten islands': 'LF',
      // 城市名映射到国家
      '东京': 'JP',
      'Tokyo': 'JP',
      'tokyo': 'JP',
      '大阪': 'JP',
      'Osaka': 'JP',
      'osaka': 'JP',
      '京都': 'JP',
      'Kyoto': 'JP',
      'kyoto': 'JP',
      '北京': 'CN',
      'Beijing': 'CN',
      'beijing': 'CN',
      '上海': 'CN',
      'Shanghai': 'CN',
      'shanghai': 'CN',
      '雷克雅未克': 'IS',
      'Reykjavik': 'IS',
      'reykjavik': 'IS',
      '曼谷': 'TH',
      'Bangkok': 'TH',
      'bangkok': 'TH',
      '清迈': 'TH',
      'Chiang Mai': 'TH',
      'chiang mai': 'TH',
      '普吉岛': 'TH',
      'Phuket': 'TH',
      'phuket': 'TH',
      '伊卢利萨特': 'GL',
      'Ilulissat': 'GL',
      'ilulissat': 'GL',
      '努克': 'GL',
      'Nuuk': 'GL',
      'nuuk': 'GL',
      '朗伊尔城': 'SJ',
      'Longyearbyen': 'SJ',
      'longyearbyen': 'SJ',
      '乌斯怀亚': 'AR',
      'Ushuaia': 'AR',
      'ushuaia': 'AR',
      // 阿尔卑斯地区城市/山峰（映射到 AL）
      '霞慕尼': 'AL',
      'Chamonix': 'AL',
      'chamonix': 'AL',
      '因特拉肯': 'AL',
      'Interlaken': 'AL',
      'interlaken': 'AL',
      '采尔马特': 'AL',
      'Zermatt': 'AL',
      'zermatt': 'AL',
      '勃朗峰': 'AL',
      'Mont Blanc': 'AL',
      'mont blanc': 'AL',
      '马特洪峰': 'AL',
      'Matterhorn': 'AL',
      'matterhorn': 'AL',
      '少女峰': 'AL',
      'Jungfrau': 'AL',
      'jungfrau': 'AL',
      'TMB': 'AL',
      'tmb': 'AL',
      '环勃朗峰': 'AL',
      'Tour du Mont Blanc': 'AL',
      'tour du mont blanc': 'AL',
      // K2（乔戈里峰）
      'K2': 'K2',
      'k2': 'K2',
      '乔戈里峰': 'K2',
      '乔戈里': 'K2',
      'K2峰': 'K2',
      'K2山峰': 'K2',
      'K2 mountain': 'K2',
      'Mount K2': 'K2',
      'Chogori': 'K2',
      'chogori': 'K2',
      'Qogir': 'K2',
      'qogir': 'K2',
      'Godwin-Austen': 'K2',
      'godwin-austen': 'K2',
    };
    
    const lowerText = text.toLowerCase();
    for (const [key, code] of Object.entries(countryMap)) {
      if (lowerText.includes(key.toLowerCase())) {
        return code;
      }
    }
    
    return undefined;
  }

  /**
   * 从目的地字符串提取国家代码
   * 支持格式：JP, IS, CN_XZ, IS-REYKJAVIK, SVALBARD_LONGYEARBYEN, XZ, LF, K2
   */
  private extractCountryCode(destination: string): string | undefined {
    if (!destination) {
      return undefined;
    }
    
    const upperDest = destination.toUpperCase();
    
    // 🆕 特殊目的地代码映射（优先检查）
    const specialDestinations: Record<string, string> = {
      'XZ': 'XZ',
      'CN_XZ': 'XZ',
      'CN-XZ': 'XZ',
      'TIBET': 'XZ',
      'LF': 'LF',
      'NO_LF': 'LF',
      'NO-LF': 'LF',
      'LOFOTEN': 'LF',
      'K2': 'K2',
      'SJ': 'SJ',
      'SVALBARD': 'SJ',
      'GL': 'GL',
      'GREENLAND': 'GL',
      'AL': 'AL',
      'ALPS': 'AL',
    };
    
    // 检查特殊目的地
    if (specialDestinations[upperDest]) {
      return specialDestinations[upperDest];
    }
    
    // 检查包含特殊目的地的格式（如 CN_XZ, NO_LF）
    for (const [key, code] of Object.entries(specialDestinations)) {
      if (upperDest.includes(key)) {
        return code;
      }
    }
    
    // 如果包含下划线，提取第一部分（如 'IS_WINTER' -> 'IS'）
    if (destination.includes('_')) {
      const parts = destination.split('_');
      const code = parts[0].toUpperCase();
      // 验证格式（应该是2个大写字母）
      if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
        return code;
      }
    }
    
    // 如果包含连字符，提取第一部分（如 'IS-REYKJAVIK' -> 'IS'）
    if (destination.includes('-')) {
      const parts = destination.split('-');
      const code = parts[0].toUpperCase();
      if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
        return code;
      }
    }
    
    // 否则直接使用前2个字符
    const code = destination.substring(0, 2).toUpperCase();
    if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
      return code;
    }
    
    return undefined;
  }

  /**
   * 🆕 异步生成决策草案（后台任务）
   * 自然语言创建行程时必须生成决策草案，记录AI的决策过程
   */
  private async generateDecisionDraftAsync(
    tripId: string,
    userInput: string,
    parsedParams: any,
    tripParams: {
      destination: string;
      startDate: string;
      endDate: string;
      days: number;
      totalBudget: number;
      hasChildren?: boolean;
      hasElderly?: boolean;
      preferences?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      if (!this.decisionDraftGenerator || !this.decisionDraftStorage) {
        this.logger.warn(`DecisionDraftGeneratorService 或 DecisionDraftStorageService 不可用，跳过决策草案生成`);
        return;
      }

      this.logger.log(`开始为行程 ${tripId} 生成决策草案（后台任务）`);

      // 1. 构建 TripPlanRequest
      const requestId = `trip_${tripId}_${Date.now()}`;
      const tripPlanRequest: TripPlanRequest = {
        request_id: requestId,
        origin: tripParams.destination, // 使用目的地作为起点（自然语言创建时通常不指定起点）
        destination: tripParams.destination,
        date_range: {
          start_date: tripParams.startDate,
          end_date: tripParams.endDate,
        },
        start_date: tripParams.startDate,
        days: tripParams.days,
        mode: 'mixed', // 默认混合模式
        party: {
          count: 1 + (tripParams.hasChildren ? 1 : 0) + (tripParams.hasElderly ? 1 : 0),
          has_children: tripParams.hasChildren,
          has_elderly: tripParams.hasElderly,
          fitness_level: tripParams.preferences?.intensity === 'high' ? 'high' : 
                         tripParams.preferences?.intensity === 'low' ? 'low' : 'medium',
        },
        constraints: {
          budget: {
            total: tripParams.totalBudget,
            currency: 'CNY',
          },
        },
        preferences: {
          scenic_priority: tripParams.preferences?.style === 'nature' || tripParams.preferences?.style === 'adventure',
          efficiency_priority: tripParams.preferences?.style === 'citywalk',
        },
      };

      // 2. 生成决策草案
      const decisionDraft = await this.decisionDraftGenerator.generateDecisionDraft(
        userInput,
        tripPlanRequest,
        {
          user_mode: 'toc', // 默认 ToC 模式
        }
      );

      // 3. 保存决策草案
      await this.decisionDraftStorage.saveDecisionDraft(decisionDraft);

      // 4. 将决策草案关联到 Trip（通过 metadata）
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (trip) {
        const metadata = (trip.metadata as any) || {};
        await this.prisma.trip.update({
          where: { id: tripId },
          data: {
            metadata: {
              ...metadata,
              decisionDraftId: decisionDraft.draft_id,
              decisionDraftWorkflowId: decisionDraft.plan_id,
              createdFromNaturalLanguage: true, // 标记为自然语言创建
            } as any,
            updatedAt: new Date(),
          },
        });

        this.logger.log(`成功为行程 ${tripId} 生成并保存决策草案: ${decisionDraft.draft_id}`);
      } else {
        this.logger.warn(`行程 ${tripId} 不存在，无法关联决策草案`);
      }
    } catch (error: any) {
      this.logger.error(`后台生成决策草案失败 (tripId: ${tripId}): ${error.message}`, error.stack);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 异步生成行程规划点（后台任务）
   * 不阻塞主请求，在后台执行
   */
  private async generateDraftAsync(tripId: string, draftDto: CreateTripDraftDto): Promise<void> {
    try {
      this.logger.log(`开始为行程 ${tripId} 生成行程规划点（后台任务）`);
      
      // 更新进度：开始生成
      await this.updateGenerationProgress(tripId, {
        status: 'generating',
        stage: 'retrieving_candidates',
        message: '正在检索候选地点...',
      });
      
      // 生成草案（包含 LLM 编排）
      const draft = await this.tripDraftService.generateDraft(draftDto, (progress) => {
        // LLM 编排完成回调
        return this.updateGenerationProgress(tripId, progress);
      });
      
      // 更新进度：LLM 编排完成，开始保存
      await this.updateGenerationProgress(tripId, {
        status: 'generating',
        stage: 'saving_items',
        message: 'LLM 编排完成，正在保存行程项...',
      });
      
      // 将草案保存为行程项
      const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(
        tripId,
        draft
      );
      
      // 更新进度：全部完成
      await this.updateGenerationProgress(tripId, {
        status: 'completed',
        stage: 'completed',
        message: `成功生成 ${itemsCount} 个行程项`,
        itemsCount,
      });
      
      this.logger.log(`成功为行程 ${tripId} 生成 ${itemsCount} 个行程项（后台任务完成）`);
      
      // 🆕 行程项生成完成后，推荐酒店（此时应该有景点数据了）
      if (this.hotelRecommendationService && itemsCount > 0) {
        this.recommendHotelsAsync(tripId).then((recommendations: any[] | undefined) => {
          if (recommendations && recommendations.length > 0) {
            this.logger.log(`为行程 ${tripId} 推荐了 ${recommendations.length} 个酒店（行程项生成后）`);
            // 可选：将酒店推荐信息存储到行程的 metadata 中，或通过 WebSocket 推送给前端
          }
        }).catch((error: any) => {
          this.logger.warn(`酒店推荐失败 (tripId: ${tripId}): ${error.message}`, error.stack);
        });
      }
    } catch (error: any) {
      this.logger.error(`后台生成行程规划点失败 (tripId: ${tripId}): ${error.message}`, error.stack);
      
      // 更新进度：失败
      await this.updateGenerationProgress(tripId, {
        status: 'failed',
        stage: 'error',
        message: `生成失败: ${error.message}`,
      }).catch((updateError: any) => {
        this.logger.error(`更新进度失败: ${updateError.message}`);
      });
    }
  }

  /**
   * 更新行程生成进度
   */
  private async updateGenerationProgress(
    tripId: string,
    progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }
  ): Promise<void> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        this.logger.warn(`行程 ${tripId} 不存在，无法更新进度`);
        return;
      }

      const metadata = (trip.metadata as any) || {};
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...metadata,
            generationProgress: {
              ...progress,
              updatedAt: new Date().toISOString(),
            },
          } as any,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error(`更新行程生成进度失败: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  @Get(':id/suggestions')
  @ApiOperation({
    summary: '获取建议列表',
    description: '获取指定行程的建议列表，支持多种过滤条件。整合了三人格（Abu/Dr.Dre/Neptune）的输出和冲突检测结果。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'persona', description: '过滤人格类型', enum: SuggestionPersona, required: false })
  @ApiQuery({ name: 'scope', description: '过滤作用范围', enum: SuggestionScope, required: false })
  @ApiQuery({ name: 'scopeId', description: '过滤作用范围ID', required: false })
  @ApiQuery({ name: 'severity', description: '过滤严重级别', enum: SuggestionSeverity, required: false })
  @ApiQuery({ name: 'status', description: '过滤状态', enum: SuggestionStatus, required: false })
  @ApiQuery({ name: 'limit', description: '返回数量限制', type: Number, required: false })
  @ApiQuery({ name: 'offset', description: '偏移量', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回建议列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getSuggestions(
    @Param('id') id: string,
    @Query('persona') persona?: SuggestionPersona,
    @Query('scope') scope?: SuggestionScope,
    @Query('scopeId') scopeId?: string,
    @Query('severity') severity?: SuggestionSeverity,
    @Query('status') status?: SuggestionStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const result = await this.tripSuggestionsService.getSuggestions(id, {
        persona,
        scope,
        scopeId,
        severity,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/suggestions/stats')
  @ApiOperation({
    summary: '获取建议统计',
    description: '获取建议的统计数据，用于角标显示和汇总。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回建议统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getSuggestionStats(@Param('id') id: string) {
    try {
      const stats = await this.tripSuggestionsService.getSuggestionStats(id);
      return successResponse(stats);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/suggestions/:suggestionId/apply')
  @ApiOperation({
    summary: '应用建议',
    description: '应用一个建议，执行对应的操作（如应用替代路线、调整节奏等）。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'suggestionId', description: '建议 ID' })
  @ApiBody({ type: ApplySuggestionRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功应用建议（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或建议不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async applySuggestion(
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ApplySuggestionRequestDto
  ) {
    try {
      const result = await this.tripSuggestionsService.applySuggestion(id, suggestionId, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/suggestions/:suggestionId/dismiss')
  @ApiOperation({
    summary: '忽略建议',
    description: '忽略一个建议，标记为已忽略状态。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'suggestionId', description: '建议 ID' })
  @ApiResponse({
    status: 200,
    description: '成功忽略建议（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或建议不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async dismissSuggestion(
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string
  ) {
    try {
      await this.tripSuggestionsService.dismissSuggestion(id, suggestionId);
      return successResponse(null);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 异步推荐酒店（不阻塞主流程）
   * @param tripId 行程 ID
   * @param totalBudget 总预算（可选，用于计算酒店预算上限）
   * @returns 酒店推荐列表
   */
  private async recommendHotelsAsync(tripId: string, totalBudget?: number): Promise<any[] | undefined> {
    if (!this.hotelRecommendationService) {
      return undefined;
    }

    try {
      // 计算酒店预算上限（如果提供了总预算）
      // 假设酒店预算占总预算的 30-40%（根据行程天数调整）
      let maxBudget: number | undefined = undefined;
      if (totalBudget) {
        // 获取行程天数
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { startDate: true, endDate: true },
        });
        
        if (trip) {
          const start = DateTime.fromISO(trip.startDate.toISOString());
          const end = DateTime.fromISO(trip.endDate.toISOString());
          const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
          
          // 酒店预算 = 总预算 * 35% / 天数（每晚预算）
          const hotelBudgetRatio = 0.35;
          const totalHotelBudget = totalBudget * hotelBudgetRatio;
          maxBudget = Math.floor(totalHotelBudget / durationDays);
        }
      }

      // 调用酒店推荐服务
      const recommendations = await this.hotelRecommendationService.recommendHotels({
        tripId,
        maxBudget,
        // 不指定策略，让服务根据行程密度自动选择
        includeHiddenCost: true, // 考虑隐形成本（交通、时间等）
      });

      return recommendations.map((rec) => ({
        hotelId: rec.hotelId,
        name: rec.name,
        roomRate: rec.roomRate,
        tier: rec.tier,
        locationScore: rec.locationScore,
        totalCost: rec.totalCost,
        costBreakdown: rec.costBreakdown,
        recommendationReason: rec.recommendationReason,
        distanceToCenter: rec.distanceToCenter,
      }));
    } catch (error: any) {
      // 如果推荐失败（例如没有景点数据），返回 undefined
      // 错误已在调用处记录日志
      return undefined;
    }
  }
}
