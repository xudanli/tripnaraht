// src/trips/trips.controller.ts
import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, Req, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
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
import { CreateTripDto, MobilityTag, TripPace } from './dto/create-trip.dto';
import { CreateTripFromNaturalLanguageDto } from './dto/create-trip-from-nl.dto';
import { nlDiscussionDraftGuidance } from './constants/nl-discussion-draft-guidance';
import { SelectGateAlternativeDto } from './dto/select-gate-alternative.dto';
import { UpdateConversationContextDto } from './dto/nl-conversation-context.dto';
import { SaveScheduleDto } from './dto/schedule.dto';
import { CreateTripShareDto } from './dto/trip-share.dto';
import { AddCollaboratorDto } from './dto/trip-collaborator.dto';
import { DeleteTripDto } from './dto/delete-trip.dto';
import { UpdateTaskStatusDto } from './dto/tasks.dto';
import {
  CreateTripDraftDto,
  SaveTripDraftDto,
  ReplaceItineraryItemDto,
  RegenerateTripDto,
} from './dto/trip-draft.dto';
import { UnifiedBootstrapTripDto } from './dto/unified-bootstrap-trip.dto';
import { EnrichTripDto } from './dto/enrich-trip.dto';
import { buildTripDraftContract } from './draft-synthesis/contract';
import { TripDraftService } from './services/trip-draft.service';
import { WorldBusService } from './services/world-bus.service';
import { buildTripCreatedEvent } from './draft-synthesis/autonomous-world';
import { UserIntentStateService } from './services/user-intent-state.service';
import {
  GetEvidenceQueryDto,
  UpdateEvidenceRequestDto,
  BatchUpdateEvidenceRequestDto,
} from './dto/evidence.dto';
import { GetAttentionQueueQueryDto } from './dto/attention-queue.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AssessTripRequestDto } from './dto/trip-metrics.dto';
import { ConflictSeverity, ResolveConflictsRequestDto } from './dto/trip-conflicts.dto';
import { UpdateIntentRequestDto } from './dto/trip-intent.dto';
import { ApplyOptimizationRequestDto } from './dto/trip-optimization.dto';
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
  SuggestionPersona,
  SuggestionScope,
  SuggestionSeverity,
  SuggestionStatus,
  ApplySuggestionRequestDto,
} from './dto/suggestions.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { TokenService } from '../auth/services/token.service';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ContextEngineerService } from '../agent/context-engine/services/context-engineer.service';
import { SkillsRegistryService } from '../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../skills/services/skills-registry.token';
import { Inject, Optional } from '@nestjs/common';
import { ContextBlock } from '../agent/context-engine/types/context-package.types';
import { DecisionDraftGeneratorService } from '../decision-draft/services/decision-draft-generator.service';
import { DecisionDraftStorageService } from '../decision-draft/storage/decision-draft-storage.service';
import { TripPlanRequest } from '../agent/interfaces/trip-plan.interface';
import { DestinationClarificationConfigService } from './nl-clarification/services/destination-clarification-config.service';
import { compileRoundClarification } from './nl-clarification/clarification-dsl-compiler';
import { GatePrecheckService } from './nl-clarification/services/gate-precheck.service';
import { AiDecisionLogicService } from './nl-clarification/services/ai-decision-logic.service';
import { NLConversationContextService } from './services/nl-conversation-context.service';
import { FeedbackEngineAdapterService } from '../decision/kernel/feedback-engine-adapter.service';
import { DSO_FEEDBACK_PERSISTENCE } from '../decision/kernel/dso-feedback-persistence.interface';
import type { IDsoFeedbackPersistence } from '../decision/kernel/dso-feedback-persistence.interface';
import { ConfigService } from '@nestjs/config';
import { SolverService } from './solver/solver.service';
import type { OntologyConstraints } from './nl-clarification/ontology-constraints.types';
import { DecisionParamsInjectorService } from '../agent/memory/services/decision-params-injector.service';
import { FitnessAssessmentService } from './decision/services/fitness-assessment.service';
import { sanitizeNlInferredDates } from './nl-clarification/utils/nl-date-inference.util';
import { applyNlPersonalizationToParams } from './nl-clarification/utils/nl-draft-personalization.util';

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

  /**
   * 判断当前问题是否与历史问题重复（语义相似）
   * 修复重复澄清：LLM 可能用不同表述问同一问题（如「出发日期？」vs「请提供出发日期」）
   * 1. 精确匹配：标准化后完全相同
   * 2. 包含匹配：一方包含另一方（处理简写）
   * 3. 关键词重叠：共享同一组字段关键词（出发/日期、预算、人数等）
   */
  private isQuestionDuplicateOfHistory(questionText: string, historicalQuestions: string[]): boolean {
    const normalized = this.normalizeQuestionTextForComparison(questionText);
    if (!normalized || normalized.length < 2) return false;

    const fieldKeywords: Record<string, string[]> = {
      startDate: ['出发', '日期', '时间', 'start', 'date'],
      totalBudget: ['预算', '花费', 'budget', '费用'],
      currency: ['货币', '币种', 'currency', '元', '美元', '欧元'],
      partyCount: ['人数', '几位', '同行', '人'],
      destination: ['目的地', '去哪', '哪里'],
      preferences: ['偏好', '风格', '兴趣', '节奏'],
      safety: ['安全', '健康', '户外', '经验'],
    };

    const extractFieldHints = (t: string): string[] => {
      const hints: string[] = [];
      for (const kws of Object.values(fieldKeywords)) {
        if (kws.some((kw) => t.includes(kw))) hints.push(...kws);
      }
      return hints;
    };

    const currentHints = extractFieldHints(normalized);

    for (const historicalQ of historicalQuestions) {
      const normHist = this.normalizeQuestionTextForComparison(historicalQ);
      if (!normHist) continue;

      // 1. 精确匹配
      if (normalized === normHist) return true;

      // 2. 包含匹配（短串包含在长串中，或反之）
      if (normalized.includes(normHist) || normHist.includes(normalized)) return true;

      // 3. 关键词重叠：若当前问题与历史问题共享同一组字段关键词，视为重复
      const histHints = extractFieldHints(normHist);
      if (currentHints.length > 0 && histHints.length > 0) {
        const overlap = currentHints.filter((h) => histHints.includes(h));
        if (overlap.length >= 2) return true; // 至少 2 个关键词重叠
      }
    }
    return false;
  }

  /**
   * 判断问题是否在询问用户已提供的字段
   * 若 params 已有 startDate，且问题包含「出发」「日期」等关键词，则视为重复
   */
  private isQuestionAboutAlreadyAnsweredField(questionText: string, params: Record<string, any>): boolean {
    const normalized = this.normalizeQuestionTextForComparison(questionText);
    if (!normalized) return false;

    const fieldChecks: Array<{ field: string; keywords: string[] }> = [
      { field: 'startDate', keywords: ['出发', '日期', '时间', '何时'] },
      { field: 'totalBudget', keywords: ['预算', '花费', '费用'] },
      { field: 'currency', keywords: ['货币', '币种', 'currency'] },
      { field: 'destination', keywords: ['目的地', '去哪', '哪里'] },
      { field: 'days', keywords: ['几天', '天数', '多少天'] },
    ];

    for (const { field, keywords } of fieldChecks) {
      const hasValue = params[field] != null && String(params[field]).trim() !== '';
      if (hasValue && keywords.some((kw) => normalized.includes(kw))) {
        return true;
      }
    }
    return false;
  }

  /**
   * 判断是否为目的地选择类问题（选项为「去日本」「去泰国」「去欧洲」「其他目的地」等）
   * 当地址已确认时，应过滤此类问题
   */
  private isDestinationSelectionQuestion(q: any): boolean {
    const options = q.options || [];
    const optValues = options.map((o: any) => (typeof o === 'string' ? o : o?.value ?? o?.label ?? '')).filter(Boolean);
    const destinationSelectionPatterns = ['去日本', '去泰国', '去欧洲', '其他目的地', '日本', '泰国', '欧洲'];
    const hasDestinationOptions = optValues.some((v: string) =>
      destinationSelectionPatterns.some((p) => v.includes(p))
    );
    if (hasDestinationOptions) return true;
    const questionText = (q.question || q.text || '').toLowerCase();
    if ((questionText.includes('目的地') || questionText.includes('去哪')) && optValues.length >= 3) {
      return true;
    }
    return false;
  }

  constructor(
    private readonly tripsService: TripsService,
    private readonly tripExtendedService: TripExtendedService,
    private readonly tripRecapService: TripRecapService,
    private readonly tripEmergencyService: TripEmergencyService,
    private readonly tripBudgetService: TripBudgetService,
    private readonly tripAdjustmentService: TripAdjustmentService,
    private readonly tripDraftService: TripDraftService,
    private readonly userIntentStateService: UserIntentStateService,
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
    @Optional() private readonly aiDecisionLogicService?: AiDecisionLogicService,
    @Optional() private readonly feedbackEngineAdapter?: FeedbackEngineAdapterService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly dsoFeedbackPersistence?: IDsoFeedbackPersistence,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly solverService?: SolverService,
    @Optional() private readonly worldBus?: WorldBusService,
    @Optional() private readonly decisionParamsInjector?: DecisionParamsInjectorService,
    @Optional() private readonly fitnessAssessmentService?: FitnessAssessmentService,
  ) {}

  private emitTripCreatedWorldBus(
    trip: { id: string; destination?: string | null },
    userId?: string,
  ): void {
    if (!this.worldBus) return;
    try {
      const cityKey = String(trip.destination ?? '').toUpperCase().trim();
      if (!cityKey) return;
      this.worldBus.emit(
        buildTripCreatedEvent({
          tripId: trip.id,
          cityKey,
          userId,
        }),
      );
    } catch (e: any) {
      this.logger.warn(`WorldBus TRIP_CREATED emit failed: ${e?.message}`);
    }
  }

  private buildOntologyConstraintsSummary(constraints: OntologyConstraints | undefined | null): string {
    if (!constraints || typeof constraints !== 'object') return '';
    // v0: keep it compact and human-readable; avoid dumping huge JSON into prompt.
    const lines: string[] = [];
    const budgetFloor = (constraints as any).budgetFloor;
    if (typeof budgetFloor === 'number') lines.push(`- Budget floor (per day): >= ${budgetFloor}`);
    const timeDensity = (constraints as any).timeDensity;
    if (timeDensity && typeof timeDensity === 'object') {
      const min = typeof (timeDensity as any).min === 'number' ? (timeDensity as any).min : undefined;
      const max = typeof (timeDensity as any).max === 'number' ? (timeDensity as any).max : undefined;
      if (min !== undefined || max !== undefined) {
        lines.push(`- Time density (POIs/day): ${min ?? '?'}–${max ?? '?'}`);
      }
    }
    const transportationLogic = (constraints as any).transportationLogic;
    if (Array.isArray(transportationLogic) && transportationLogic.length) {
      lines.push(`- Transportation logic: ${transportationLogic.slice(0, 5).join('; ')}${transportationLogic.length > 5 ? '...' : ''}`);
    }
    const seasonality = (constraints as any).seasonality;
    if (Array.isArray(seasonality) && seasonality.length) {
      const ex = seasonality.slice(0, 3).map((s: any) => `m${s?.month}:${Array.isArray(s?.blockedRegions) ? s.blockedRegions.join('/') : ''}`);
      lines.push(`- Seasonality blocks: ${ex.join('; ')}${seasonality.length > 3 ? '...' : ''}`);
    }
    if (lines.length === 0) return '';
    return `\n\n【Destination physical boundaries (constraints)】\n${lines.join('\n')}\n\nIf the user request violates these boundaries, set needsClarification=true and ask targeted questions.\n`;
  }

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
        this.emitTripCreatedWorldBus(trip, userId);
        return successResponse(trip);
      } else {
        const trip = await this.tripsService.create(body as CreateTripDto, userId);
        this.emitTripCreatedWorldBus(trip, userId);
        return successResponse(trip);
      }
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  /**
   * 统一 Bootstrap：Trip + 同步 Draft Runtime（落 itinerary）。
   * 与 POST /trips（纯创建）及 NL 创建互补。
   */
  @Post('bootstrap')
  @ApiOperation({
    summary: 'Bootstrap：创建 Trip 并同步生成草案',
    description:
      '参数化创建行程并立即跑统一 Draft Runtime（runDraftPipeline），写入行程项。非 NL；需登录。',
  })
  @ApiBody({ type: UnifiedBootstrapTripDto })
  @ApiResponse({ status: 200, description: '创建成功', type: ApiSuccessResponseDto })
  async bootstrapUnified(
    @Body() body: UnifiedBootstrapTripDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request,
  ) {
    try {
      let userId = user?.userId;
      if (!userId && req?.headers?.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          try {
            const payload = await this.jwtService.verifyAsync(authHeader.substring(7));
            userId = payload.sub;
          } catch {
            /* ignore */
          }
        }
      }
      if (!userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
      }

      const travelers =
        body.travelers?.length && body.travelers.length > 0
          ? body.travelers
          : [{ type: 'ADULT' as const, mobilityTag: MobilityTag.CITY_POTATO }];

      const createTripDto: CreateTripDto = {
        destination: body.destination.toUpperCase().trim(),
        startDate: body.startDate,
        endDate: body.endDate,
        totalBudget: body.totalBudget,
        travelers: travelers as any,
        currency: body.currency || 'CNY',
        pace: TripPace.STANDARD,
      };

      const trip = await this.tripsService.create(createTripDto, userId);
      this.emitTripCreatedWorldBus(trip, userId);

      try {
        await this.tripBudgetService.setBudgetConstraint(trip.id, {
          total: body.totalBudget,
          currency: body.currency || 'CNY',
        });
      } catch (e: any) {
        this.logger.warn(`bootstrap setBudgetConstraint: ${e?.message}`);
      }

      const start = DateTime.fromISO(body.startDate);
      const end = DateTime.fromISO(body.endDate);
      const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
      const rt = body.draftRuntimeMode ?? 'HYBRID';

      const seedFromTripId = (id: string): number => {
        let h = 0x811c9dc5;
        for (let i = 0; i < id.length; i++) {
          h ^= id.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
      };

      const draftDto: CreateTripDraftDto = {
        destination: body.destination.toUpperCase().trim(),
        days: durationDays,
        startDate: body.startDate,
        endDate: body.endDate,
        draftRuntimeMode: rt,
        useAlgorithmicDraft: rt === 'ALGO',
        userInput: body.userInput,
      };
      (draftDto as any).seed = seedFromTripId(trip.id);

      const contract = buildTripDraftContract({
        dto: draftDto,
        tripId: trip.id,
        mode: 'BOOTSTRAP',
        userIntent: this.userIntentStateService.getOrCreate(userId),
      });

      const pipeline = await this.tripDraftService.runDraftPipeline(contract);
      const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(trip.id, pipeline.response);

      return successResponse({
        tripId: trip.id,
        status: 'CREATED' as const,
        draft: pipeline.tripDraftState,
        simulation: pipeline.simulation,
        decisionTrace: pipeline.decisionTrace,
        itemsCount,
        draftId: pipeline.draftId,
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`bootstrapUnified failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error?.message || 'bootstrap 失败');
    }
  }

  @Post(':tripId/enrich')
  @ApiOperation({
    summary: 'Enrich：对已有 Trip 做增量增强（占位 API）',
    description: '后续可接局部仿真、个性化、weather/pricing 等插件；当前仅校验 Trip 存在并回执。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({ type: EnrichTripDto })
  async enrichTrip(@Param('tripId') tripId: string, @Body() body: EnrichTripDto) {
    try {
      const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
      if (!trip) {
        return errorResponse(ErrorCode.NOT_FOUND, '行程不存在');
      }
      return successResponse({
        tripId,
        accepted: true,
        hintsReceived: body.hints?.length ?? 0,
        message:
          'Enrich hook registered — attach partial engines (simulation, personalization) without full regeneration.',
      });
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message || 'enrich 失败');
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
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request
  ) {
    try {
      // 🆕 测试模式：如果没有 userId，使用临时 userId（仅用于测试）
      let userId = user?.userId;
      if (!userId) {
        // 支持 X-Test-User-Id 请求头（测试脚本可传，无需重启服务）
        const testUserId = (req?.headers?.['x-test-user-id'] as string)?.trim();
        if (testUserId) {
          userId = testUserId;
          this.logger.warn(`[测试模式] 使用 X-Test-User-Id: ${userId}`);
        } else if (process.env.NODE_ENV === 'development' || process.env.ALLOW_TEST_MODE === 'true') {
          userId = dto.sessionId ? `temp_${dto.sessionId.split('_').pop()}` : `temp_${Date.now()}`;
          this.logger.warn(`[测试模式] 使用临时 userId: ${userId}`);
        } else {
          return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
        }
      }

      // 1. 🆕 自动判断：如果 sessionId 为空或会话不存在，自动清空旧会话并创建新会话
      // 这样前端不需要传递 isNewConversation，点击"创建对话"时自动清空
      let shouldClearOldSessions = false;
      
      if (dto.isNewConversation) {
        // 显式标记为新对话
        shouldClearOldSessions = true;
        this.logger.debug(`显式标记为新对话，将清空旧会话`);
      } else if (!dto.sessionId) {
        // sessionId 为空，说明是创建新对话
        shouldClearOldSessions = true;
        this.logger.debug(`sessionId 为空，自动判断为创建新对话，将清空旧会话`);
      } else {
        // 检查会话是否存在
        const sessionExists = await this.nlConversationContextService.sessionExists(dto.sessionId, userId);
        if (!sessionExists) {
          // 会话不存在，说明是创建新对话
          shouldClearOldSessions = true;
          this.logger.debug(`会话 ${dto.sessionId} 不存在，自动判断为创建新对话，将清空旧会话`);
        } else {
          // 会话存在，继续对话
          this.logger.debug(`会话 ${dto.sessionId} 存在，继续对话`);
        }
      }
      
      // 2. 如果需要清空旧会话，删除用户的所有旧会话
      if (shouldClearOldSessions) {
        this.logger.debug(`开始新对话，清空用户 ${userId} 的所有旧会话上下文`);
        try {
          // 🆕 删除用户的所有会话（包括指定的 sessionId 和其他会话）
          const deletedCount = await this.nlConversationContextService.deleteAllUserSessions(userId);
          this.logger.debug(`已删除 ${deletedCount} 个旧会话`);
          
          // 兼容旧格式：如果未登录用户，也尝试删除旧格式的会话
          if (!user?.userId && dto.sessionId) {
            await this.nlConversationContextService.deleteSession(dto.sessionId, dto.sessionId);
          }
        } catch (error: any) {
          this.logger.warn(`删除旧会话失败（继续创建新会话）: ${error.message}`);
        }
        // 清空 sessionId，强制创建新会话
        dto.sessionId = undefined;
        this.logger.debug(`开始新对话，已清空所有旧上下文`);
      }

      // 3. 获取或创建会话
      const sessionId = await this.nlConversationContextService.getOrCreateSession(dto.sessionId, userId);
      
      // 4. 加载历史对话上下文（如果有）
      const existingContext = await this.nlConversationContextService.getContext(sessionId, userId);
      
      // 🆕 修复：如果这是新会话（messages 为空），不应该加载历史上下文
      // 只有在会话已存在且有消息时才加载历史
      const conversationHistory = (existingContext && existingContext.messages && existingContext.messages.length > 0) 
        ? existingContext.messages 
        : [];
      
      // 5. 添加用户消息到会话
      await this.nlConversationContextService.addMessage(sessionId, userId, 'user', dto.text);

      // 6. 构建包含历史上下文的提示（如果有历史对话）
      let promptText = dto.text;
      if (conversationHistory.length > 0) {
        // 🆕 确保只使用用户实际发送的消息（排除可能的系统消息）
        const userMessages = conversationHistory.filter(msg => msg.role === 'user' || msg.role === 'assistant');
        if (userMessages.length > 0) {
          const historyContext = userMessages
            .slice(-6) // 只使用最近 6 条消息
            .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
            .join('\n');
          promptText = `历史对话上下文：\n${historyContext}\n\n当前用户输入：${dto.text}`;
        }
      }

      // 7. 检测目的地并构建 Context Package（如果可用）
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
      
      // 5.3 并行：Context Package 构建 + 目的地特化配置（减少串行等待）
      const beforeContextMs = Date.now();
      const [contextResult, configResult] = await Promise.allSettled([
        detectedCountryCode && this.contextEngineerService && process.env.SKIP_CONTEXT_FOR_NL_PARSE !== 'true'
          ? this.contextEngineerService.build(
              {
                phase: 'planning',
                agent: 'nl-parser',
                userQuery: promptText,
                destinationCountryCode: detectedCountryCode,
                requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY', 'WEATHER_WINDOWS'],
                userId,
                includeToolSelection: false,
              },
              true,
            )
          : Promise.resolve(null),
        detectedCountryCode && this.destinationClarificationConfigService
          ? this.destinationClarificationConfigService.getConfig(detectedCountryCode)
          : Promise.resolve(null),
      ]);
      if (contextResult.status === 'fulfilled' && contextResult.value?.blocks?.length) {
        contextBlocks = contextResult.value.blocks.filter((b: any) => b.visibility === 'public');
        this.logger.debug(`Context Package 构建完成: ${contextBlocks.length} 块, ${Date.now() - beforeContextMs}ms`);
      } else if (contextResult.status === 'rejected') {
        this.logger.warn(`Context Package 构建失败: ${contextResult.reason?.message || contextResult.reason}`);
      }
      const destinationConfig = configResult.status === 'fulfilled' ? configResult.value : null;

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

      // 🆕 Step 7: 使用特化配置或通用流程（destinationConfig 已由上方并行获取）
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

      // 6.4 🆕 短路径：创建意图 / 确认卡片 / 补充偏好（已抽取为 tryShortPaths）
      const trimmedText = dto.text.trim();
      const pp = existingContext?.partialParams || {};
      const shortPathResult = await this.tryShortPaths({
        dto,
        userId: userId!,
        sessionId,
        existingContext,
        trimmedText,
        pp,
        detectedCountryCode,
        destinationConfig,
      });
      if (shortPathResult.handled) return shortPathResult.result;

      // 7. 使用 LLM 解析自然语言（传入历史上下文和 Context Package）
      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: promptText,
        provider: dto.llmProvider,
        contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
        destinationCode: detectedCountryCode,
        destinationConfig: destinationConfig,
        dslClarificationContext: this.pickLatestDslLlmPromptContextFromMessages(existingContext?.messages),
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
          if (structuredResponse.clarificationQuestions) {
            const params = parseResult.params || {};
            const originalCount = structuredResponse.clarificationQuestions.length;
            structuredResponse.clarificationQuestions = structuredResponse.clarificationQuestions.filter((q: any) => {
              const questionText = (q.question || q.text || '').trim();
              if (!questionText) return false;

              // 1. 与历史问题重复（语义相似）
              if (historicalQuestions.length > 0 && this.isQuestionDuplicateOfHistory(questionText, historicalQuestions)) {
                this.logger.debug(`Filtering duplicate question from history: "${questionText.substring(0, 50)}..."`);
                return false;
              }

              // 2. 用户已答字段：若问题涉及某字段且 params 已有值，过滤（避免重复问已答问题）
              if (this.isQuestionAboutAlreadyAnsweredField(questionText, params)) {
                this.logger.debug(`Filtering question about already-answered field: "${questionText.substring(0, 50)}..."`);
                return false;
              }

              return true;
            });

            if (structuredResponse.clarificationQuestions.length < originalCount) {
              this.logger.debug(`Filtered ${originalCount - structuredResponse.clarificationQuestions.length} duplicate questions based on history/answered fields`);
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
          
          // 🆕 修复：确保clarificationQuestions不为空
          const fallbackQuestions = parseResult.clarificationQuestions && parseResult.clarificationQuestions.length > 0
            ? parseResult.clarificationQuestions.map((q: string, i: number) => ({
                id: `fallback_q_${i}_${Date.now()}`,
                question: q,
                type: 'text' as const,
                required: false,
              }))
            : this.generateDefaultClarificationQuestions(
                'general',
                detectedCountryCode,
                parseResult.params
              );
          
          structuredResponse = {
            plannerReply: parseResult.plannerReply,
            clarificationQuestions: fallbackQuestions,
          };
        }

        // 添加助手回复到会话（使用文本回复，用于历史记录）
        const assistantReply = structuredResponse.plannerReply || parseResult.plannerReply || parseResult.clarificationQuestions?.join('\n') || '需要更多信息';
        const mergedParamsForFallback = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) };
        const qCountFallback = structuredResponse.clarificationQuestions?.length ?? 0;
        const destNameForFallback = detectedCountryCode
          ? this.getDestinationName(detectedCountryCode, destinationConfig)
          : (parseResult.params?.destination || existingContext?.partialParams?.destination || '未指定');
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
          thinkingProcess: this.buildEvolvedThinkingContent(mergedParamsForFallback, destNameForFallback, qCountFallback, 'clarify'),
          progressSteps: [
            { id: 'parse', label: '已解析自然语言', status: 'completed' },
            { id: 'clarify', label: '需要澄清', status: 'running' },
          ],
        });
        
        // 🆕 获取最后一条消息的ID（用于前端更新答案）
        const lastMessage = savedContext.messages[savedContext.messages.length - 1];
        
        // 🆕 记录过滤统计（用于监控）
        if (structuredResponse.clarificationQuestions) {
          this.logger.debug(`Final clarification questions count: ${structuredResponse.clarificationQuestions.length} (after history filtering)`);
        }
        
        // 🆕 合并 partialParams：保留 PUT 更新的值（如 confirm_inferred_info_total_budget），避免 POST 时被 parseResult 覆盖
        const mergedParams = { ...(existingContext?.partialParams || {}) };
        const pp = existingContext?.partialParams || {};
        const alreadyConfirmed = pp.confirmInferred === 'confirm' || pp.confirmInferred === '确认无误';
        for (const [k, v] of Object.entries(parseResult.params || {})) {
          if (v !== null && v !== undefined) {
            if (k === 'confirmInferred' && alreadyConfirmed) continue; // 保留已确认，防止阶段回跳
            mergedParams[k] = v;
          }
        }
        // 🆕 首次解析时保存用户原始输入，供行程编排（userInput/cities/mustHavePois）使用
        if (!mergedParams.originalUserInput && dto.text?.trim()) {
          mergedParams.originalUserInput = dto.text.trim();
        }

        const sourceTextsGeneral = this.collectNlSourceTexts(dto.text, existingContext, mergedParams);
        Object.assign(
          mergedParams,
          await this.postProcessNlMergedParams(mergedParams, userId, sourceTextsGeneral),
        );

        // 更新对话上下文
        await this.nlConversationContextService.updateContext(sessionId, userId, {
          conversationContext: parseResult.conversationContext,
          partialParams: mergedParams,
        });
        
        // 🆕 获取目的地中文名称（用于前端显示）
        let destinationName = detectedCountryCode || parseResult.params.destination;
        if (detectedCountryCode) {
          destinationName = this.getDestinationName(detectedCountryCode, destinationConfig);
        }
        // 若 LLM 返回的 destination 为城市/区域名（如杭州、杭州和千岛湖），优先用于可读展示
        const destFromParams = (parseResult.params as Record<string, any>)?.destination;
        if (destFromParams && typeof destFromParams === 'string' && /[\u4e00-\u9fa5]/.test(destFromParams)) {
          destinationName = destFromParams.trim();
        }
        
        // 🆕 合并 partialParams（提前以便过滤使用）
        const mergedParamsForFilter = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) };
        const knownDestination = mergedParamsForFilter.destination || detectedCountryCode;

        // 🆕 修复：确保clarificationQuestions不为空
        let clarificationQuestions = structuredResponse.clarificationQuestions || [];
        if (clarificationQuestions.length === 0) {
          // 如果没有澄清问题，生成默认问题（传入 inferredFields 以便在基础信息完整时生成确认类问题）
          clarificationQuestions = this.generateDefaultClarificationQuestions(
            'general',
            detectedCountryCode,
            mergedParamsForFilter,
            undefined,
            (parseResult.params as Record<string, any>)?.inferredFields
          );
          this.logger.warn(`needsClarification=true但clarificationQuestions为空，已生成默认问题: ${clarificationQuestions.length}个`);
        }

        // 🆕 当地址已确认时，过滤掉目的地选择类问题（避免「明明是新西兰还要选去日本/泰国/欧洲」）
        if (knownDestination && clarificationQuestions.length > 0) {
          const beforeCount = clarificationQuestions.length;
          clarificationQuestions = clarificationQuestions.filter((q: any) => !this.isDestinationSelectionQuestion(q));
          if (clarificationQuestions.length < beforeCount) {
            this.logger.debug(`已过滤 ${beforeCount - clarificationQuestions.length} 个目的地选择类问题（目的地已确认: ${knownDestination}）`);
          }
        }

        // 🆕 通用流程阶段 1 门：有推断的硬约束字段且未确认时，必须先展示确认问题；同时保留 LLM 的其余澄清问题作为可选
        const { hasUnconfirmedPhase1Inferred } = await import('./nl-clarification/config/planning-phases.config');
        const mergedForPhaseCheck = { ...mergedParamsForFilter, ...mergedParams };
        if (hasUnconfirmedPhase1Inferred(mergedForPhaseCheck)) {
          const phase1Questions = this.generateDefaultClarificationQuestions(
            'general',
            detectedCountryCode,
            mergedForPhaseCheck,
            undefined,
            ((mergedForPhaseCheck as Record<string, any>).inferredFields || (parseResult.params as Record<string, any>)?.inferredFields) as string[] | undefined
          );
          const confirmQ = phase1Questions.find((q: any) => q.id === 'confirm_inferred_info');
          if (confirmQ) {
            // 阶段 1：confirm_inferred_info 置顶（required），其余 LLM 问题保留为 optional
            const beforeCount = clarificationQuestions.length;
            clarificationQuestions = [
              { ...confirmQ, group: 'required' },
              ...clarificationQuestions.map((q: any) => ({ ...q, group: q.group || 'optional' })),
            ];
            this.logger.debug(`[通用流程] 阶段 1 推断未确认，confirm_inferred_info 置顶，保留 ${beforeCount} 个 LLM 问题为可选（共 ${clarificationQuestions.length} 个）`);
          }
        }

        // 🆕 P0优化：标记必需问题（澄清问题）为 'required' 分组
        clarificationQuestions = clarificationQuestions.map((q: any) => ({
          ...q,
          group: q.group || 'required', // 默认为必需问题
        }));
        
        // 🆕 添加偏好细化入口：即使阶段 1 强制时也展示「是否需要补充偏好」，与文案「确认后还可进一步细化」一致
        const hasBasicInfo = mergedParams.destination || mergedParams.startDate || mergedParams.totalBudget;
        if (hasBasicInfo) {
          // 添加补充问题，询问是否需要进一步补充信息
          const supplementaryQuestions = this.generateSupplementaryQuestions(mergedParams, detectedCountryCode);
          if (supplementaryQuestions.length > 0) {
            // 🆕 P0优化：标记补充问题为 'optional' 分组
            const optionalQuestions = supplementaryQuestions.map((q: any) => ({
              ...q,
              group: 'optional', // 标记为可选问题
            }));
            // 🆕 修复重复澄清：补充问题也需过滤历史已问过的、以及已答字段，避免每轮重复添加「是否需要补充偏好？」等
            // 🆕 若 LLM 已返回「补充偏好」类问题，则不再追加 supplement_preferences（避免内容重复）
            const hasSupplementPrefInExisting = clarificationQuestions.some(
              (q: any) =>
                (q.id && /supplement_preferences|supplementPreferences|preferences_supplement|q\d+_preferences/i.test(q.id)) ||
                /补充.*偏好|是否需要补充.*偏好/.test((q.question || q.text || '').toString())
            );
            const filteredOptional = optionalQuestions.filter((q: any) => {
              const questionText = (q.question || q.text || '').trim();
              if (!questionText) return false;
              if (hasSupplementPrefInExisting && (q.id === 'supplement_preferences' || /补充.*偏好/.test(questionText))) return false;
              if (historicalQuestions.length > 0 && this.isQuestionDuplicateOfHistory(questionText, historicalQuestions)) return false;
              if (this.isQuestionAboutAlreadyAnsweredField(questionText, mergedParams)) return false;
              return true;
            });
            if (filteredOptional.length > 0) {
              clarificationQuestions = [...clarificationQuestions, ...filteredOptional];
              this.logger.debug(`在澄清过程中添加了 ${filteredOptional.length} 个补充问题（已过滤 ${optionalQuestions.length - filteredOptional.length} 个历史重复）`);
            }
          }
        }
        
        // 🆕 移除引用已过滤问题的 question_card，避免前端显示空卡片
        const validQuestionIds = new Set(clarificationQuestions.map((q: any) => q.id));
        let blocksToReturn = (structuredResponse.plannerResponseBlocks || []).filter((b: any) => {
          if (b.type === 'question_card' && b.questionId && !validQuestionIds.has(b.questionId)) {
            this.logger.debug(`移除孤立的 question_card: questionId=${b.questionId}`);
            return false;
          }
          return true;
        });
        const hasConfirmInferred = clarificationQuestions.some((q: any) => q.id === 'confirm_inferred_info');
        const params = mergedParams as Record<string, any>;
        const hasSummaryData = params?.destination || params?.startDate || params?.totalBudget;
        // 🆕 有已解析的基础信息时始终注入 summary_card，确保用户能看到目的地/日期/预算等（即使 LLM 未返回 confirm_inferred_info）
        if (hasSummaryData) {
          const hasExistingSummary = blocksToReturn.some((b: any) => b.type === 'summary_card');
          if (!hasExistingSummary) {
            let sd = params.startDate;
            let ed = params.endDate;
            if (sd?.includes('T')) sd = sd.split('T')[0];
            if (ed?.includes('T')) ed = ed.split('T')[0];
            const durationStr = sd && ed ? `${sd} 至 ${ed}` : (params.days ? `${params.days}天` : '未指定');
            const travelersArray = params.travelers;
            let travelersInfo = '未指定';
            if (Array.isArray(travelersArray) && travelersArray.length > 0) {
              travelersInfo = `${travelersArray.length}人`;
            } else if (params.hasChildren || params.hasElderly) {
              const parts: string[] = [];
              if (params.hasChildren) parts.push('儿童');
              if (params.hasElderly) parts.push('老人');
              travelersInfo = parts.length ? parts.join('、') : '2人';
            } else if (params.travelerCount) {
              travelersInfo = `${params.travelerCount}人`;
            }
            const summaryBlock = {
              type: 'summary_card',
              summary: {
                destination: destinationName || params.destination || '未指定',
                duration: durationStr,
                startDate: sd || undefined,
                endDate: ed || undefined,
                travelers: travelersInfo,
                budget: params.totalBudget != null
                  ? { amount: params.totalBudget, currency: params.currency || 'CNY' }
                  : undefined,
                // 🆕 将 LLM 解析的 cities/dayAllocation/mustHavePois 一并返回前端展示
                ...(params.cities?.length ? { cities: params.cities } : {}),
                ...(params.dayAllocation?.length
                  ? {
                      dayAllocation: params.dayAllocation,
                      dayAllocationDisplay: this.formatDayAllocationDisplay(params.dayAllocation),
                    }
                  : {}),
                ...(params.mustHavePois?.length ? { mustHavePois: params.mustHavePois } : {}),
              },
            };
            const highlightText = hasConfirmInferred
              ? '📋 第一阶段：请确认以下基础信息'
              : '📋 行程基础信息';
            // 🆕 避免重复：若紧随 summary_card 后有 paragraph/list 重复解释 目的地、出行时间、预算，则移除
            const restBlocks = blocksToReturn;
            const isRedundantPlanningBasis = (b: any): boolean => {
              if (b?.type !== 'paragraph' && b?.type !== 'list') return false;
              const content = (b.content || (b.items || []).join('')).toString();
              const hasDest = /目的地|规划基础/.test(content);
              const hasTimeOrBudget = /出行时间|预算|出发日期|返程/.test(content);
              return hasDest && hasTimeOrBudget;
            };
            const trimmedRest = restBlocks.length > 0 && isRedundantPlanningBasis(restBlocks[0])
              ? restBlocks.slice(1)
              : restBlocks;
            blocksToReturn = [
              { type: 'highlight', highlightType: 'info', highlightText },
              summaryBlock,
              ...trimmedRest,
            ];
            if (trimmedRest.length < restBlocks.length) {
              this.logger.debug('已移除与 summary_card 重复的规划基础段落');
            }
            this.logger.debug(`已注入 summary_card${hasConfirmInferred ? ' + 阶段 1 确认' : ''}`);
          }
        }
        
        // 🆕 持久化完整 metadata（clarificationQuestions、plannerResponseBlocks），供 GET 恢复会话时使用
        const { buildPhaseIndicator } = await import('./nl-clarification/config/planning-phases.config');
        const genericPhase = hasConfirmInferred ? 1 : 2; // 有 confirm_inferred 则阶段 1，否则阶段 2
        await this.nlConversationContextService.updateMessageMetadata(
          sessionId,
          userId,
          lastMessage.id,
          {
            clarificationQuestions,
            plannerResponseBlocks: blocksToReturn,
            phaseIndicator: buildPhaseIndicator(genericPhase),
          }
        );
        
        this.logger.debug(`Returning planner-style clarification: ${structuredResponse.plannerReply?.substring(0, 100) || parseResult.plannerReply?.substring(0, 100)}...`);
        const genericProgressSteps =
          genericPhase === 1
            ? [
                { id: 'phase1', label: '第一阶段：硬约束确认', status: 'running' as const, detail: `${clarificationQuestions.length} 个问题待确认` },
                { id: 'phase2', label: '第二阶段：风格选择', status: 'pending' as const },
                { id: 'phase3', label: '第三阶段：节奏校准', status: 'pending' as const },
                { id: 'phase4', label: '第四阶段：风险偏好', status: 'pending' as const },
              ]
            : [
                { id: 'phase1', label: '第一阶段：硬约束确认', status: 'completed' as const },
                { id: 'phase2', label: '第二阶段：风格选择', status: 'running' as const, detail: `${clarificationQuestions.length} 个问题待确认` },
                { id: 'phase3', label: '第三阶段：节奏校准', status: 'pending' as const },
                { id: 'phase4', label: '第四阶段：风险偏好', status: 'pending' as const },
              ];
        return successResponse({
          sessionId, // 返回会话 ID，前端需要保存
          needsClarification: true,
          // 🆕 结构化响应（含 confirm_inferred_info 时的 summary_card）
          plannerResponseBlocks: blocksToReturn,
          clarificationQuestions,
          // 向后兼容
          plannerReply: structuredResponse.plannerReply || parseResult.plannerReply,
          suggestedQuestions: parseResult.suggestedQuestions,
          conversationContext: parseResult.conversationContext,
          partialParams: this.normalizePartialParams(mergedParams),
          destination: detectedCountryCode || parseResult.params.destination, // 🆕 添加国家代码
          destinationName, // 🆕 添加中文目的地名称
          lastMessageId: lastMessage.id, // 🆕 添加最后一条消息的ID（用于前端更新答案）
          thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, destinationName, clarificationQuestions.length, 'clarify'),
          progressSteps: genericProgressSteps,
          phaseIndicator: buildPhaseIndicator(genericPhase),
        });
      }

      // 🆕 严格控制：即使所有必需字段都有了，也要先显示确认卡片，询问用户是否需要补充信息
      // 只有在用户明确确认后才创建行程
      this.logger.debug(`所有必需字段已齐全，但需要用户确认后才能创建行程`);

      // 🆕 构建确认卡片前，先检查 Critical 字段（如货币 currency），缺失时优先澄清
      const mergedParamsForConfirm = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) } as Record<string, any>;
      const destCodeForConfirm = this.extractCountryCode(mergedParamsForConfirm.destination) || detectedCountryCode;
      if (destCodeForConfirm && this.destinationClarificationConfigService) {
        const criticalFieldsForConfirm = await this.destinationClarificationConfigService.getCriticalFields(destCodeForConfirm);
        if (criticalFieldsForConfirm.length > 0) {
          const missingForConfirm = criticalFieldsForConfirm.filter(
            (field) =>
              !mergedParamsForConfirm[field.fieldName] ||
              mergedParamsForConfirm[field.fieldName] === null ||
              mergedParamsForConfirm[field.fieldName] === undefined ||
              String(mergedParamsForConfirm[field.fieldName] ?? '').trim() === ''
          );
          if (missingForConfirm.length > 0) {
            const missingNames = missingForConfirm.map((f) => f.fieldName);
            const criticalQuestions = await this.destinationClarificationConfigService.getQuestionsForFields(
              destCodeForConfirm,
              missingNames
            );
            const totalC = criticalFieldsForConfirm.length;
            const completedC = totalC - missingForConfirm.length;
            const destNameForBlock = this.getDestinationName(destCodeForConfirm, destinationConfig);
            this.logger.debug(`[主流程] Critical 字段未齐（缺: ${missingNames.join(',')}），先澄清再确认`);
            // 🆕 必须添加助手消息，否则 confirm-create 会读取上一轮 showConfirmCard 而误放行
            const criticalReply = `请先确认以下信息：${missingForConfirm.map((f) => f.question).join('、')}`;
            const criticalClarificationObjs = criticalQuestions.map((q) => ({
              id: q.id,
              question: q.question,
              type: q.type,
              options:
                q.type === 'boolean' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)
                  ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
                  : q.options,
              required: q.required,
              hint: q.hint,
              placeholder: q.placeholder,
              metadata: q.metadata,
            }));
            await this.nlConversationContextService.addMessage(sessionId, userId!, 'assistant', criticalReply, {
              needsClarification: true,
              blockedByCriticalFields: true,
              showConfirmCard: false,
              clarificationQuestions: criticalClarificationObjs,
              plannerResponseBlocks: [
                { type: 'highlight', highlightType: 'warning', highlightText: `请先确认以下信息：${missingForConfirm.map((f) => f.question).join('、')}` },
                { type: 'paragraph', content: `已完成 ${completedC}/${totalC} 项` },
              ],
            });
            return successResponse({
              sessionId,
              needsClarification: true,
              blockedByCriticalFields: true,
              destination: destCodeForConfirm,
              destinationName: destNameForBlock,
              criticalFieldsProgress: { completed: completedC, total: totalC, percent: Math.round((completedC / totalC) * 100) },
              plannerResponseBlocks: [
                {
                  type: 'highlight',
                  highlightType: 'warning',
                  highlightText: `请先确认以下信息：${missingForConfirm.map((f) => f.question).join('、')}`,
                },
                { type: 'paragraph', content: `已完成 ${completedC}/${totalC} 项` },
              ],
              clarificationQuestions: criticalQuestions.map((q) => ({
                id: q.id,
                question: q.question,
                type: q.type,
                options:
                  q.type === 'boolean' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)
                    ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
                    : q.options,
                required: q.required,
                hint: q.hint,
                placeholder: q.placeholder,
                metadata: q.metadata,
              })),
              partialParams: this.normalizePartialParams(mergedParamsForConfirm),
            });
          }
        }
      }
      
      // 确保日期格式正确（用于显示）
      let startDate = parseResult.params.startDate;
      let endDate = parseResult.params.endDate;
      
      // 如果是 ISO 格式，转换为日期格式
      if (startDate && startDate.includes('T')) {
        startDate = startDate.split('T')[0];
      }
      if (endDate && endDate.includes('T')) {
        endDate = endDate.split('T')[0];
      }

      // 🆕 获取目的地中文名称
      let destinationName = detectedCountryCode || parseResult.params.destination;
      if (detectedCountryCode) {
        destinationName = this.getDestinationName(detectedCountryCode, destinationConfig);
      }

      // 🆕 构建确认卡片内容
      // 🆕 P4优化：使用summary_card类型整合信息，减少信息块数量
      // 🆕 HCI P1优化：增强信息展示，提升用户确认信心
      
      // 计算旅行者详细信息
      const travelersArray = (parseResult.params as any).travelers;
      const travelerCount = Array.isArray(travelersArray) ? travelersArray.length : 
        (parseResult.params.hasChildren ? 3 : parseResult.params.hasElderly ? 2 : 2); // 默认2人
      const travelerTypes: string[] = [];
      if (parseResult.params.hasChildren) {
        travelerTypes.push('儿童');
      }
      if (parseResult.params.hasElderly) {
        travelerTypes.push('老人');
      }
      const adultCount = travelerCount - (parseResult.params.hasChildren ? 1 : 0) - (parseResult.params.hasElderly ? 1 : 0);
      if (adultCount > 0) {
        travelerTypes.unshift(`${adultCount}位成人`);
      }
      
      // 构建旅行者信息字符串
      let travelersInfo = travelerTypes.join('、');
      if (travelerTypes.length === 0) {
        travelersInfo = '2位成人'; // 默认值
      }
      
      // 🆕 HCI P1优化：检测旅行目的
      const travelPurpose = this.detectTravelPurpose(parseResult.params, dto.text, existingContext);
      if (travelPurpose) {
        travelersInfo += `（${travelPurpose}）`;
      }
      
      // 🆕 HCI P1优化：检查是否有偏好信息
      const paramsAny = parseResult.params as any;
      const hasPreferences = paramsAny.preferences?.interests || 
        paramsAny.preferences?.style || 
        paramsAny.preferences?.pace ||
        paramsAny.pace;
      
      const confirmationBlocks: any[] = [
        {
          type: 'highlight',
          highlightType: 'info',
          highlightText: '✅ 已收集到所有必需信息，准备创建行程',
        },
        {
          type: 'summary_card',
          summary: {
            destination: destinationName || '未指定',
            duration: startDate && endDate ? `${startDate} 至 ${endDate}` : '未指定',
            travelers: travelersInfo, // 🆕 HCI P1优化：显示详细旅行者信息
            budget: {
              amount: parseResult.params.totalBudget || 0,
              currency: parseResult.params.currency || 'CNY',
            },
            ...(paramsAny.cities?.length ? { cities: paramsAny.cities } : {}),
            ...(paramsAny.dayAllocation?.length ? { dayAllocation: paramsAny.dayAllocation } : {}),
            ...(paramsAny.dayAllocation?.length ? { dayAllocationDisplay: this.formatDayAllocationDisplay(paramsAny.dayAllocation) } : {}),
            ...(paramsAny.mustHavePois?.length ? { mustHavePois: paramsAny.mustHavePois } : {}),
          },
        },
      ];
      
      // 🆕 HCI P1优化：如果没有偏好信息，添加偏好信息入口提示
      if (!hasPreferences) {
        confirmationBlocks.push({
          type: 'paragraph',
          content: '⚙️ 偏好设置：未设置\n如需补充偏好信息（如旅行风格、兴趣点、节奏等），请告诉我。',
        });
      }
      
      confirmationBlocks.push({
        type: 'paragraph',
        content: '在创建行程前，请确认以上信息是否正确，或者告诉我是否需要补充其他信息。',
      });

      // 🆕 生成补充信息问题（可选）
      // 🆕 P0优化：标记补充问题为 'optional' 分组
      // 🆕 修复重复澄清：确认卡片阶段的补充问题也需过滤历史重复和已答字段
      const rawSupplementary = this.generateSupplementaryQuestions(parseResult.params, detectedCountryCode).map((q: any) => ({
        ...q,
        group: 'optional', // 标记为可选问题
      }));
      const supplementaryQuestions = rawSupplementary.filter((q: any) => {
        const questionText = (q.question || q.text || '').trim();
        if (!questionText) return false;
        if (historicalQuestions.length > 0 && this.isQuestionDuplicateOfHistory(questionText, historicalQuestions)) return false;
        if (this.isQuestionAboutAlreadyAnsweredField(questionText, parseResult.params || {})) return false;
        return true;
      });

      // 添加助手回复到会话（含 thinkingProcess/progressSteps 以便会话恢复时正确展示）
      const assistantReply = `我已经收集到创建行程所需的基本信息。请确认以下信息是否正确，或者告诉我是否需要补充其他信息。`;
      const mergedParamsForConfirmCard = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) };
      const savedContext = await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
        needsClarification: false, // 不需要澄清，但需要确认
        needsConfirmation: true, // 🆕 标记需要用户确认
        plannerResponseBlocks: confirmationBlocks,
        clarificationQuestions: supplementaryQuestions, // 可选补充问题
        parsedParams: parseResult.params,
        showConfirmCard: true, // 🆕 显示确认卡片
        questionAnswers: {},
        thinkingProcess: this.buildEvolvedThinkingContent(mergedParamsForConfirmCard, destinationName, 0, 'confirm'),
        progressSteps: [
          { id: 'collect', label: '已收集必需信息', status: 'completed' },
          { id: 'confirm', label: '等待用户确认', detail: '请确认以上信息无误后创建行程', status: 'running' },
        ],
      });

      // 🆕 获取最后一条消息的ID
      const lastMessage = savedContext.messages[savedContext.messages.length - 1];

      this.logger.debug(`返回确认卡片，等待用户确认创建行程`);
      return successResponse({
        sessionId,
        needsClarification: false,
        needsConfirmation: true, // 🆕 标记需要用户确认
        plannerResponseBlocks: confirmationBlocks,
        clarificationQuestions: supplementaryQuestions, // 可选补充问题
        plannerReply: assistantReply,
        conversationContext: parseResult.conversationContext,
        partialParams: this.normalizePartialParams(parseResult.params || {}),
        destination: detectedCountryCode || parseResult.params.destination,
        destinationName,
        lastMessageId: lastMessage.id,
        showConfirmCard: true, // 🆕 前端应显示确认卡片
        thinkingProcess: this.buildEvolvedThinkingContent(mergedParamsForConfirmCard, destinationName, 0, 'confirm'),
        progressSteps: [
          { id: 'collect', label: '已收集必需信息', status: 'completed' },
          { id: 'confirm', label: '等待用户确认', detail: '请确认以上信息无误后创建行程', status: 'running' },
        ],
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

  @Post('from-natural-language/v2')
  @ApiOperation({
    summary: '自然语言创建行程（v2: Ontology + Solver）',
    description:
      'v2：在自然语言解析阶段注入目的地物理边界约束，并引入 Solver feasibility 预检；不可行时直接 needsClarification。创建成功后返回 **可执行讨论稿** 定位（`discussionDraft`），完整门控与证据由同 trip 后续规划链路接续。',
  })
  @ApiBody({ type: CreateTripFromNaturalLanguageDto })
  @ApiResponse({
    status: 200,
    description: '成功创建行程或需要澄清（统一响应格式，含 feasibility 字段）',
    type: ApiSuccessResponseDto,
  })
  async createFromNaturalLanguageV2(
    @Body() dto: CreateTripFromNaturalLanguageDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request,
  ) {
    try {
      // Align userId handling with v1
      let userId = user?.userId;
      if (!userId) {
        const testUserId = (req?.headers?.['x-test-user-id'] as string)?.trim();
        if (testUserId) {
          userId = testUserId;
          this.logger.warn(`[测试模式] [v2] 使用 X-Test-User-Id: ${userId}`);
        } else if (process.env.NODE_ENV === 'development' || process.env.ALLOW_TEST_MODE === 'true') {
          userId = dto.sessionId ? `temp_${dto.sessionId.split('_').pop()}` : `temp_${Date.now()}`;
          this.logger.warn(`[测试模式] [v2] 使用临时 userId: ${userId}`);
        } else {
          return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
        }
      }

      // Session lifecycle: reuse v1 semantics
      let shouldClearOldSessions = false;
      if (dto.isNewConversation) {
        shouldClearOldSessions = true;
      } else if (!dto.sessionId) {
        shouldClearOldSessions = true;
      } else {
        const sessionExists = await this.nlConversationContextService.sessionExists(dto.sessionId, userId);
        if (!sessionExists) shouldClearOldSessions = true;
      }
      if (shouldClearOldSessions) {
        try {
          await this.nlConversationContextService.deleteAllUserSessions(userId);
        } catch {}
        dto.sessionId = undefined;
      }

      const sessionId = await this.nlConversationContextService.getOrCreateSession(dto.sessionId, userId);
      const existingContext = await this.nlConversationContextService.getContext(sessionId, userId);
      const conversationHistory =
        existingContext && existingContext.messages && existingContext.messages.length > 0 ? existingContext.messages : [];
      await this.nlConversationContextService.addMessage(sessionId, userId, 'user', dto.text);

      const confirmedSnapshot = (existingContext as any)?.currentIntentSnapshot?.confirmedParams as Record<string, any> | undefined;

      // Build prompt with history
      let promptText = dto.text;
      if (conversationHistory.length > 0) {
        const userMessages = conversationHistory.filter((msg) => msg.role === 'user' || msg.role === 'assistant');
        if (userMessages.length > 0) {
          const historyContext = userMessages
            .slice(-6)
            .map((msg) => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
            .join('\n');
          promptText = `历史对话上下文：\n${historyContext}\n\n当前用户输入：${dto.text}`;
        }
      }

      // Destination detection + context blocks + destination config
      let contextBlocks: ContextBlock[] = [];
      let detectedCountryCode: string | undefined;
      // 优先使用“已确认快照”的目的地（防跑偏）
      if (confirmedSnapshot?.destination) {
        detectedCountryCode = this.extractCountryCode(confirmedSnapshot.destination);
      }
      if (!detectedCountryCode && existingContext?.partialParams?.destination) {
        detectedCountryCode = this.extractCountryCode(existingContext.partialParams.destination);
      }
      if (!detectedCountryCode) {
        detectedCountryCode = this.extractCountryCodeFromText(dto.text);
      }

      // v2 强制：目的地不明确时先澄清（destinationConfig 作为解析输入）
      if (!detectedCountryCode) {
        const assistantReply = '为了确保行程可行性，请先确认目的地（国家/地区）。例如：日本（JP）、冰岛（IS）。';
        await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
          needsClarification: true,
          showConfirmCard: false,
        });
        return successResponse({
          sessionId,
          needsClarification: true,
          plannerReply: assistantReply,
          clarificationQuestions: [
            {
              id: `need_destination_${Date.now()}`,
              question: '你这次想去哪里？（国家/地区或城市名）',
              type: 'text',
              required: true,
              metadata: { fieldName: 'destination' },
            },
          ],
          partialParams: this.normalizePartialParams({ ...(existingContext?.partialParams || {}) }),
          destination: null,
          feasibility: { isPossible: false, conflictReason: { code: 'DESTINATION_REQUIRED', message: '目的地不明确，无法注入本体约束进行解析。' } },
        });
      }

      const [contextResult, configResult] = await Promise.allSettled([
        detectedCountryCode && this.contextEngineerService && process.env.SKIP_CONTEXT_FOR_NL_PARSE !== 'true'
          ? this.contextEngineerService.build(
              {
                phase: 'planning',
                agent: 'nl-parser-v2',
                userQuery: promptText,
                destinationCountryCode: detectedCountryCode,
                requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY', 'WEATHER_WINDOWS'],
                userId,
                includeToolSelection: false,
              },
              true,
            )
          : Promise.resolve(null),
        detectedCountryCode && this.destinationClarificationConfigService
          ? this.destinationClarificationConfigService.getConfig(detectedCountryCode)
          : Promise.resolve(null),
      ]);
      if (contextResult.status === 'fulfilled' && contextResult.value?.blocks?.length) {
        contextBlocks = contextResult.value.blocks.filter((b: any) => b.visibility === 'public');
      }
      const destinationConfig = configResult.status === 'fulfilled' ? configResult.value : null;

      // If destination-specific flow is enabled, delegate to existing handler (v2 parity not guaranteed)
      if (destinationConfig && destinationConfig.enabled && detectedCountryCode) {
        return await this.handleDestinationSpecificClarification(
          dto,
          userId,
          sessionId,
          existingContext,
          destinationConfig,
          detectedCountryCode,
          contextBlocks,
          promptText,
        );
      }

      // Short paths (reuse)
      const trimmedText = dto.text.trim();
      const pp = existingContext?.partialParams || {};
      const shortPathResult = await this.tryShortPaths({
        dto,
        userId,
        sessionId,
        existingContext,
        trimmedText,
        pp,
        detectedCountryCode,
        destinationConfig,
      });
      if (shortPathResult.handled) return shortPathResult.result;

      // Inject ontology constraints summary into prompt (LLM guardrails)
      const constraintsSummary = this.buildOntologyConstraintsSummary((destinationConfig as any)?.constraints);
      const snapshotBlock =
        confirmedSnapshot && Object.keys(confirmedSnapshot).length > 0
          ? `\n\n【Confirmed facts (intent snapshot)】\n${JSON.stringify(confirmedSnapshot, null, 2)}\n\nDo NOT lose or override these confirmed facts unless the user explicitly changes them.\n`
          : '';
      const guardedPrompt = `${promptText}${snapshotBlock}${constraintsSummary}`;

      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: guardedPrompt,
        provider: dto.llmProvider,
        contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
        destinationCode: detectedCountryCode,
        destinationConfig: destinationConfig,
        dslClarificationContext: this.pickLatestDslLlmPromptContextFromMessages(existingContext?.messages),
      });

      // Solver pre-check (minimal)
      const feasibility =
        this.solverService && detectedCountryCode
          ? await this.solverService.checkFeasibility(parseResult.params || {}, {
              destinationCode: detectedCountryCode,
              constraints: (destinationConfig as any)?.constraints,
            })
          : { isPossible: true };

      // Force clarification when solver says impossible
      if (feasibility && feasibility.isPossible === false) {
        const mergedParams = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) };
        await this.nlConversationContextService.updateContext(sessionId, userId, {
          conversationContext: parseResult.conversationContext,
          partialParams: mergedParams,
        });
        const assistantReply =
          feasibility.conflictReason?.message ||
          '当前输入与目的地物理边界/交通耗时存在冲突，需要您调整天数/目的地或偏好。';
        await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
          needsClarification: true,
          feasibility,
          parsedParams: parseResult.params,
          showConfirmCard: false,
        });
        return successResponse({
          sessionId,
          needsClarification: true,
          plannerReply: assistantReply,
          clarificationQuestions:
            feasibility.suggestedClarifications?.map((q, i) => ({
              id: `solver_q_${i}_${Date.now()}`,
              question: q.question,
              type: q.options && q.options.length > 0 ? 'single_choice' : 'text',
              options: q.options,
              required: false,
              metadata: { fieldName: q.field },
            })) ?? [],
          partialParams: this.normalizePartialParams(mergedParams),
          destination: detectedCountryCode,
          feasibility,
        });
      }

      // LLM clarification path (minimal v2 response; keep it lightweight)
      if (parseResult.needsClarification) {
        const mergedParams = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) };
        await this.nlConversationContextService.updateContext(sessionId, userId, {
          conversationContext: parseResult.conversationContext,
          partialParams: mergedParams,
        });
        const assistantReply =
          parseResult.plannerReply ||
          (Array.isArray(parseResult.clarificationQuestions) ? parseResult.clarificationQuestions.join('\n') : '需要更多信息');
        await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
          needsClarification: true,
          feasibility,
          parsedParams: parseResult.params,
          showConfirmCard: false,
        });
        return successResponse({
          sessionId,
          needsClarification: true,
          plannerReply: assistantReply,
          clarificationQuestions:
            (parseResult.clarificationQuestions || []).map((q: any, i: number) => ({
              id: `llm_q_${i}_${Date.now()}`,
              question: String(q),
              type: 'text',
              required: false,
            })) ?? [],
          partialParams: this.normalizePartialParams(mergedParams),
          destination: detectedCountryCode,
          feasibility,
        });
      }

      // Create trip when required fields are present; otherwise clarify missing fields
      let params = { ...(existingContext?.partialParams || {}), ...(parseResult.params || {}) };
      const sourceTextsV2 = this.collectNlSourceTexts(dto.text, existingContext, params);
      params = await this.postProcessNlMergedParams(params, userId, sourceTextsV2);
      const missing: string[] = [];
      if (!params.destination && !detectedCountryCode) missing.push('destination');
      if (!params.startDate) missing.push('startDate');
      if (!params.endDate) missing.push('endDate');
      if (!params.totalBudget) missing.push('totalBudget');

      if (missing.length > 0) {
        const assistantReply = `我还需要补充信息才能创建行程：${missing.join('、')}。`;
        await this.nlConversationContextService.updateContext(sessionId, userId, {
          conversationContext: parseResult.conversationContext,
          partialParams: params,
        });
        await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
          needsClarification: true,
          feasibility,
          parsedParams: parseResult.params,
          showConfirmCard: false,
        });
        return successResponse({
          sessionId,
          needsClarification: true,
          plannerReply: assistantReply,
          clarificationQuestions: missing.map((f, i) => ({
            id: `missing_${f}_${i}_${Date.now()}`,
            question: `请提供 ${f}（用于创建行程）`,
            type: 'text',
            required: true,
            metadata: { fieldName: f },
          })),
          partialParams: this.normalizePartialParams(params),
          destination: detectedCountryCode,
          feasibility,
        });
      }

      const destCode = detectedCountryCode || this.extractCountryCode(params.destination);
      const result = await this.createTripFromParams(params, userId, sessionId, destCode ?? undefined);
      // attach v2 engine tag if possible
      if (result && typeof result === 'object' && (result as any).success === true) {
        (result as any).data = { ...(result as any).data, feasibility, generationEngine: 'SOLVER' };
      }
      return result;
    } catch (error: any) {
      this.logger.error(`[v2] 自然语言创建行程失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `自然语言创建行程失败: ${error.message}`);
    }
  }

  /**
   * 🆕 确认创建行程
   */
  @Post('nl-conversation/:sessionId/confirm-create')
  @Public()
  @ApiOperation({
    summary: '确认创建行程',
    description: '用户确认创建行程，系统将根据已收集的参数创建行程',
  })
  @ApiParam({ name: 'sessionId', description: '会话 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: '是否确认创建',
        },
        additionalParams: {
          type: 'object',
          description: '额外的参数（可选）',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '行程创建成功',
    type: ApiSuccessResponseDto,
  })
  async confirmCreateTrip(
    @Param('sessionId') sessionId: string,
    @Body() body: { confirm: boolean; additionalParams?: Record<string, any> },
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request
  ) {
    try {
      // 优先: JWT user > X-Test-User-Id（测试脚本）> temp_${sessionId}
      let userId = user?.userId;
      if (!userId) {
        const testUserId = (req?.headers?.['x-test-user-id'] as string)?.trim();
        userId = testUserId || `temp_${sessionId}`;
        if (testUserId) this.logger.warn(`[测试模式] confirm-create 使用 X-Test-User-Id: ${testUserId}`);
      }
      
      if (!body.confirm) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '用户未确认创建行程');
      }

      // 1. 获取会话上下文
      const context = await this.nlConversationContextService.getContext(sessionId, userId);
      if (!context) {
        return errorResponse(ErrorCode.NOT_FOUND, '会话不存在或已过期');
      }

      // 1.5 🆕 状态校验：仅在「等待确认」阶段允许 confirm-create，避免澄清中途误创建
      // 规则：仅当 lastAssistant.metadata.showConfirmCard === true 时允许；否则拒绝
      const lastAssistant = context.messages?.filter((m) => m.role === 'assistant').pop();
      const inConfirmPhase = lastAssistant?.metadata?.showConfirmCard === true;
      if (!inConfirmPhase) {
        const reason =
          lastAssistant?.metadata?.showConfirmCard === false
            ? 'lastMsg.showConfirmCard=false'
            : lastAssistant?.metadata?.showConfirmCard === undefined
              ? 'lastMsg.showConfirmCard=undefined (未进入确认阶段)'
              : 'no assistant message';
        this.logger.warn(`[confirm-create] 拒绝：${reason}`);
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          '当前处于信息填写阶段，请先完成澄清问题后再确认创建。'
        );
      }

      // 2. 获取已收集的参数（归一化展示结构，使 preferences 与用户输入一致）
      const params = this.normalizePartialParams({
        ...(context.partialParams || {}),
        ...(body.additionalParams || {}),
      });

      // 3. 验证必需字段
      if (!params.destination || !params.startDate || !params.endDate || !params.totalBudget) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '缺少必需字段：destination、startDate、endDate、totalBudget');
      }

      // 4. 检测目的地代码（使用 extractCountryCode 支持中文/城市名）
      const detectedCountryCode = this.extractCountryCode(params.destination) || params.destination?.toUpperCase().trim() || null;
      
      // 🆕 写入 intent snapshot：一旦用户确认创建，即锚定这些已确认事实
      await this.nlConversationContextService.updateContext(sessionId, userId, {
        currentIntentSnapshot: {
          confirmedParams: {
            destination: params.destination,
            destinationCode: detectedCountryCode,
            startDate: params.startDate,
            endDate: params.endDate,
            totalBudget: params.totalBudget,
            currency: params.currency,
            hasChildren: params.hasChildren,
            hasElderly: params.hasElderly,
            preferences: params.preferences,
            pace: params.pace,
          },
          lastConfirmedAt: new Date().toISOString(),
        },
      });

      // 5. 调用 createTripFromParams 创建行程
      const result = await this.createTripFromParams(
        params,
        userId,
        sessionId,
        detectedCountryCode
      );

      this.logger.log(`用户确认创建行程成功: sessionId=${sessionId}, tripId=${result.data?.trip?.id}`);
      return result;
    } catch (error: any) {
      this.logger.error(`确认创建行程失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `确认创建行程失败: ${error.message}`);
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
      
      // 🆕 用户明确选择后，将该字段从 inferredFields 中移除
      // 这样后续的 Gate 检查可以正常触发（因为字段不再是推断的）
      if (updatedParams.inferredFields && Array.isArray(updatedParams.inferredFields)) {
        updatedParams.inferredFields = updatedParams.inferredFields.filter(
          (f: string) => f !== fieldName && f !== 'totalBudget' // 用户选择增加预算时也移除 totalBudget
        );
        this.logger.debug(`用户确认字段 ${fieldName}，从 inferredFields 移除，剩余: ${JSON.stringify(updatedParams.inferredFields)}`);
      }

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
      
      // 1.5 短路径：用户点击「补充偏好信息」时直接返回偏好追问
      const suppPattern = /^(补充偏好|补充偏好信息|我想补充|补充其他偏好|yes)$/i;
      const suppLoose = /^补充偏好信息\s*[（(]?如?.+[）)]?\s*$/i;
      const suppContains = /[：:;]\s*补充偏好信息\s*[（(]?[^）)]*[）)]?\s*$/i;
      const suppVal = currentParams.supplementPreferences;
      const txt = dto.text.trim();
      const isSupp = suppPattern.test(txt) || suppLoose.test(txt) || suppContains.test(txt) || (txt.includes('补充偏好信息') && txt.length <= 150) || ((suppVal === 'yes' || suppVal?.includes?.('补充偏好信息')) && txt.length <= 80);
      if (isSupp && (currentParams.destination || currentParams.startDate)) {
        const merged = { ...currentParams, supplementPreferences: 'yes' };
        const prefQs = this.generatePreferenceSupplementQuestions(merged, destinationCode);
        if (prefQs.length > 0) {
          const reply = '好的，请告诉我您在住宿、餐饮和旅行节奏方面的偏好，这样我能更好地为您规划行程。';
          const destNamePref = this.getDestinationName(destinationCode, config);
          await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', reply, {
            needsClarification: true,
            plannerResponseBlocks: [{ type: 'paragraph', content: reply }, { type: 'highlight', highlightType: 'info', highlightText: '请选择或填写以下信息，也可直接文字描述您的偏好' }],
            clarificationQuestions: prefQs,
            parsedParams: merged,
            showConfirmCard: false,
            questionAnswers: {},
            thinkingProcess: this.buildEvolvedThinkingContent(merged, destNamePref, prefQs.length, 'supplement_preference'),
            progressSteps: [
              { id: 'parse', label: '已解析用户意图', detail: '补充偏好', status: 'completed' },
              { id: 'clarify', label: '正在询问偏好', detail: `${prefQs.length} 个偏好问题`, status: 'running' },
            ],
          });
          await this.nlConversationContextService.updateContext(sessionId, userId, { partialParams: merged });
          const ctx = await this.nlConversationContextService.getContext(sessionId, userId);
          const lastMsg = ctx?.messages?.filter((m: any) => m.role === 'assistant').pop();
          return successResponse({
            sessionId,
            needsClarification: true,
            plannerResponseBlocks: [{ type: 'paragraph', content: reply }, { type: 'highlight', highlightType: 'info', highlightText: '请选择或填写以下信息，也可直接文字描述您的偏好' }],
            clarificationQuestions: prefQs,
            plannerReply: reply,
            partialParams: merged,
            destination: destinationCode,
            destinationName: destNamePref,
            lastMessageId: lastMsg?.id,
            thinkingProcess: this.buildEvolvedThinkingContent(merged, destNamePref, prefQs.length, 'supplement_preference'),
            progressSteps: [
              { id: 'parse', label: '已解析用户意图', detail: '补充偏好', status: 'completed' },
              { id: 'clarify', label: '正在询问偏好', detail: `${prefQs.length} 个偏好问题`, status: 'running' },
            ],
          });
        }
      }

      // 2. 使用 LLM 提取参数（带特化规则）
      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: promptText,
        provider: dto.llmProvider,
        contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
        destinationCode,
        destinationConfig: config,
        dslClarificationContext: this.pickLatestDslLlmPromptContextFromMessages(existingContext?.messages),
      });
      
      // 3. 合并参数（🆕 仅用 parseResult 中非空值覆盖，保留 PUT 更新的 totalBudget 等）
      const mergedParams: Record<string, any> = { ...currentParams };
      const alreadyConfirmed =
        currentParams.confirmInferred === 'confirm' || currentParams.confirmInferred === '确认无误';
      for (const [k, v] of Object.entries(parseResult.params || {})) {
        if (v !== null && v !== undefined) {
          // 🆕 保护：用户已确认的 confirmInferred 不能被覆盖，防止从阶段 2 跳回阶段 1
          if (k === 'confirmInferred' && alreadyConfirmed) {
            this.logger.debug(`[分层] 保留已确认的 confirmInferred，跳过覆盖`);
            continue;
          }
          mergedParams[k] = v;
        }
      }
      
      // 🆕 确保 inferredFields 被正确保留和累积
      // 这对于 Gate 预检查跳过推断字段的逻辑非常重要
      const paramsWithInferred = parseResult.params as Record<string, any>;
      if (paramsWithInferred?.inferredFields) {
        const existingInferred = currentParams.inferredFields || [];
        const newInferred = paramsWithInferred.inferredFields || [];
        // 合并并去重
        mergedParams.inferredFields = [...new Set([...existingInferred, ...newInferred])];
        this.logger.debug(`累积推断字段: ${JSON.stringify(mergedParams.inferredFields)}`);
      }
      
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

      const sourceTextsDest = this.collectNlSourceTexts(dto.text, existingContext, mergedParams);
      Object.assign(
        mergedParams,
        await this.postProcessNlMergedParams(mergedParams, userId, sourceTextsDest),
      );

      // 🆕 阶段 1 推断确认门：有推断的硬约束字段且未确认时，必须先确认再进入后续轮次
      const { hasUnconfirmedPhase1Inferred, buildPhaseIndicator, ROUND_TO_PHASE } = await import(
        './nl-clarification/config/planning-phases.config'
      );
      if (hasUnconfirmedPhase1Inferred(mergedParams)) {
        this.logger.debug(`[分层] 阶段 1 推断未确认，强制返回确认问题`);
        const phase1Questions = this.generateDefaultClarificationQuestions(
          'general',
          destinationCode,
          mergedParams,
          undefined,
          mergedParams.inferredFields
        );
        const hasConfirmQ = phase1Questions.some((q: any) => q.id === 'confirm_inferred_info');
        if (hasConfirmQ) {
          // 注入 summary_card + 阶段指示；同时添加偏好细化入口，与文案「确认后还可进一步细化」一致
          const params = mergedParams as Record<string, any>;
          const suppQs = this.generateSupplementaryQuestions(mergedParams, destinationCode);
          const questionsForPhase1 = [
            ...phase1Questions.filter((q: any) => q.id === 'confirm_inferred_info'),
            ...suppQs.map((q: any) => ({ ...q, group: q.group || 'optional' })),
          ];
          let sd = params.startDate,
            ed = params.endDate;
          if (sd?.includes('T')) sd = sd.split('T')[0];
          if (ed?.includes('T')) ed = ed.split('T')[0];
          const destName = config?.destinationName || destinationCode;
          const blocksForPhase1: any[] = [
            { type: 'highlight', highlightType: 'info', highlightText: '📋 第一阶段：请确认以下基础信息' },
            {
              type: 'summary_card',
              summary: {
                destination: destName,
                duration: sd && ed ? `${sd} 至 ${ed}` : '未指定',
                startDate: sd || undefined,
                endDate: ed || undefined,
                travelers: params.travelGroup || params.travelerCount ? `${params.travelerCount || params.travelGroup}人` : '未指定',
                budget: params.totalBudget != null ? { amount: params.totalBudget, currency: params.currency || 'CNY' } : undefined,
                ...(params.cities?.length ? { cities: params.cities } : {}),
                ...(params.dayAllocation?.length ? { dayAllocation: params.dayAllocation } : {}),
                ...(params.dayAllocation?.length ? { dayAllocationDisplay: this.formatDayAllocationDisplay(params.dayAllocation) } : {}),
                ...(params.mustHavePois?.length ? { mustHavePois: params.mustHavePois } : {}),
              },
            },
            { type: 'paragraph', content: '以下信息由系统根据您的描述推断，请确认是否正确。' },
          ];
          questionsForPhase1.forEach((q: any) => {
            blocksForPhase1.push({ type: 'question_card', questionId: q.id });
          });
          const savedCtx = await this.nlConversationContextService.addMessage(
            sessionId,
            userId,
            'assistant',
            (parseResult as any).plannerReply || '请确认以上信息是否正确。',
            {
              needsClarification: true,
              plannerResponseBlocks: blocksForPhase1,
              clarificationQuestions: questionsForPhase1,
              parsedParams: mergedParams,
              showConfirmCard: false,
              questionAnswers: {},
              thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, config?.destinationName || destinationCode, questionsForPhase1.length, 'clarify'),
              progressSteps: [
                { id: 'phase1', label: '第一阶段：硬约束确认', status: 'running' },
                { id: 'phase2', label: '第二阶段：风格选择', status: 'pending' },
                { id: 'phase3', label: '第三阶段：节奏校准', status: 'pending' },
                { id: 'phase4', label: '第四阶段：风险偏好', status: 'pending' },
              ],
              phaseIndicator: buildPhaseIndicator(1),
            }
          );
          // 🆕 关键修复：阶段 1 “推断未确认” 仍需持久化已解析到的基础参数
          // 否则下一轮用户只输入「confirm」类短句时，无法从上下文恢复 destination/startDate/endDate，导致重复追问目的地。
          await this.nlConversationContextService.updateContext(sessionId, userId, {
            partialParams: mergedParams,
            currentIntentSnapshot: {
              confirmedParams: {
                // 仅锚定“用户已明确给出/高度确定”的事实（目的地/日期等），避免把推断字段误当已确认
                destination: mergedParams.destination ?? config?.destinationName ?? destinationCode,
                destinationCode,
                startDate: mergedParams.startDate,
                endDate: mergedParams.endDate,
              },
              lastConfirmedAt: new Date().toISOString(),
            },
          });
          const lastMsg = savedCtx?.messages?.filter((m: any) => m.role === 'assistant').pop();
          return successResponse({
            sessionId,
            needsClarification: true,
            plannerResponseBlocks: blocksForPhase1,
            clarificationQuestions: questionsForPhase1,
            plannerReply: (parseResult as any).plannerReply,
            partialParams: this.normalizePartialParams(mergedParams),
            destination: destinationCode,
            destinationName: config?.destinationName || destinationCode,
            lastMessageId: lastMsg?.id,
            thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, config?.destinationName || destinationCode, questionsForPhase1.length, 'clarify'),
            progressSteps: [
              { id: 'phase1', label: '第一阶段：硬约束确认', status: 'running' },
              { id: 'phase2', label: '第二阶段：风格选择', status: 'pending' },
              { id: 'phase3', label: '第三阶段：节奏校准', status: 'pending' },
              { id: 'phase4', label: '第四阶段：风险偏好', status: 'pending' },
            ],
            phaseIndicator: buildPhaseIndicator(1),
          });
        }
      }

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
            // 🆕 修复：生成默认澄清问题，确保needsClarification=true时clarificationQuestions不为空
            const defaultQuestions = this.generateDefaultClarificationQuestions(
              'decision_matrix_blocked',
              destinationCode,
              mergedParams
            );
            
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
              clarificationQuestions: defaultQuestions,
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
          const destinationName = this.getDestinationName(destinationCode, config);
          
          // 🆕 修复：确保clarificationQuestions不为空
          let clarificationQuestions = gateResult.additionalQuestions || [];
          if (clarificationQuestions.length === 0) {
            // 如果没有additionalQuestions，生成默认问题
            clarificationQuestions = this.generateDefaultClarificationQuestions(
              'gate_blocked',
              destinationCode,
              mergedParams
            );
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
            clarificationQuestions,
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
                // 🆕 修复：生成默认澄清问题，确保needsClarification=true时clarificationQuestions不为空
                const defaultQuestions = this.generateDefaultClarificationQuestions(
                  'safety_principle_blocked',
                  destinationCode,
                  mergedParams
                );
                
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
                  clarificationQuestions: defaultQuestions,
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
      
      // 8. 保存到会话（含 thinkingProcess/progressSteps 以便会话恢复时正确展示）
      const destNameForThinking = config?.destinationName || destinationCode;
      const qCountForThinking = structuredResponse.clarificationQuestions?.length || 0;
      const savedContext = await this.nlConversationContextService.addMessage(
        sessionId,
        userId,
        'assistant',
        structuredResponse.plannerReply,
        {
          needsClarification: true,
          plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
          clarificationQuestions: structuredResponse.clarificationQuestions,
          suggestedQuestions: structuredResponse.suggestedQuestions,
          parsedParams: mergedParams,
          showConfirmCard: false,
          questionAnswers: {},
          personaInfo: structuredResponse.personaInfo,
          recommendedRoutes: structuredResponse.recommendedRoutes,
          thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, destNameForThinking, qCountForThinking, 'clarify'),
          progressSteps: this.buildPhaseProgressSteps(roundInfo.round.roundId, ROUND_TO_PHASE, destNameForThinking, qCountForThinking),
          phaseIndicator: buildPhaseIndicator(ROUND_TO_PHASE[roundInfo.round.roundId] ?? 2),
          ...(structuredResponse.dslLlmPromptContext
            ? { dslLlmPromptContext: structuredResponse.dslLlmPromptContext }
            : {}),
        }
      );
      
      // 🆕 获取最后一条消息的ID（用于前端更新答案）
      const lastMessage = savedContext.messages[savedContext.messages.length - 1];
      
      // 8. 更新部分参数
      await this.nlConversationContextService.updateContext(sessionId, userId, {
        conversationContext: parseResult.conversationContext,
        partialParams: this.normalizePartialParams({
          ...mergedParams,
          suggestedQuestions: structuredResponse.suggestedQuestions,
          reply: structuredResponse.plannerReply,
        }),
      });
      
      // 🆕 获取目的地中文名称（用于前端显示）
      const destinationName = this.getDestinationName(destinationCode, config);
      
      // 🆕 修复：确保clarificationQuestions不为空
      let clarificationQuestions = structuredResponse.clarificationQuestions || [];
      if (clarificationQuestions.length === 0) {
        // 优先：从当前轮次的完成条件中获取缺失字段，用 getQuestionsForFields 生成问题
        const completionFields = roundInfo.round.completionConditions?.requiredFields || [];
        const missingRequiredFields = completionFields.filter(
          (f: string) =>
            mergedParams[f] === undefined ||
            mergedParams[f] === null ||
            mergedParams[f] === ''
        );
        if (
          missingRequiredFields.length > 0 &&
          this.destinationClarificationConfigService
        ) {
          const questionsForFields =
            await this.destinationClarificationConfigService.getQuestionsForFields(
              destinationCode,
              missingRequiredFields
            );
          if (questionsForFields.length > 0) {
            clarificationQuestions = questionsForFields.map((q: any) => ({
              ...q,
              group: q.group || 'required',
            }));
            this.logger.debug(
              `从缺失字段生成澄清问题: ${missingRequiredFields.join(', ')}, 共 ${clarificationQuestions.length} 个`
            );
          }
        }
        // 兜底：通用默认问题
        if (clarificationQuestions.length === 0) {
          clarificationQuestions = this.generateDefaultClarificationQuestions(
            'general',
            destinationCode,
            mergedParams,
            missingRequiredFields
          );
          this.logger.warn(
            `needsClarification=true但clarificationQuestions为空，已生成默认问题: ${clarificationQuestions.length}个`
          );
        }
      }
      
      // 🆕 持久化完整 metadata，供 GET 恢复会话时使用（澄清问题可能被 fallback 替换）
      await this.nlConversationContextService.updateMessageMetadata(
        sessionId,
        userId,
        lastMessage.id,
        { clarificationQuestions, plannerResponseBlocks: structuredResponse.plannerResponseBlocks }
      );
      
      const response = {
        sessionId,
        needsClarification: true,
        plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
        clarificationQuestions,
        plannerReply: structuredResponse.plannerReply,
        suggestedQuestions: structuredResponse.suggestedQuestions,
        partialParams: this.normalizePartialParams({
          ...mergedParams,
          suggestedQuestions: structuredResponse.suggestedQuestions,
          reply: structuredResponse.plannerReply,
        }),
        destination: destinationCode,
        destinationName,
        personaInfo: structuredResponse.personaInfo,
        recommendedRoutes: structuredResponse.recommendedRoutes,
        lastMessageId: lastMessage.id,
        thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, destinationName, clarificationQuestions.length, 'clarify'),
        progressSteps: this.buildPhaseProgressSteps(roundInfo.round.roundId, ROUND_TO_PHASE, destinationName, clarificationQuestions.length),
        phaseIndicator: buildPhaseIndicator(ROUND_TO_PHASE[roundInfo.round.roundId] ?? 2),
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
  private collectNlSourceTexts(
    dtoText: string | undefined,
    existingContext: { messages?: Array<{ role: string; content: string }> } | null | undefined,
    params?: Record<string, any>,
  ): string[] {
    const texts: string[] = [];
    if (dtoText?.trim()) texts.push(dtoText.trim());
    if (params?.originalUserInput) texts.push(String(params.originalUserInput));
    if (params?.userInput) texts.push(String(params.userInput));
    for (const m of existingContext?.messages || []) {
      if (m.role === 'user' && m.content) texts.push(String(m.content));
    }
    return texts;
  }

  private applyNlDateSanitization(
    params: Record<string, any>,
    sourceTexts: string[],
  ): Record<string, any> {
    const result = sanitizeNlInferredDates(params, sourceTexts);
    if (result.datesRejected) {
      this.logger.warn(
        `[NL日期校验] 清除可疑推断日期: reason=${result.reason}, explicitMonths=${JSON.stringify(result.explicitMonths)}`,
      );
    }
    return result.params;
  }

  private async enrichNlParamsWithUserContext(
    userId: string,
    params: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (!userId || userId.startsWith('temp_')) return params;
    try {
      const profile = this.decisionParamsInjector
        ? await this.decisionParamsInjector.getUserTravelProfileForRuntime(userId)
        : null;
      const fitnessModel = this.fitnessAssessmentService
        ? await this.fitnessAssessmentService.loadUserModel(userId)
        : null;
      return applyNlPersonalizationToParams(params, { profile, fitnessModel });
    } catch (error: any) {
      this.logger.warn(`NL 参数个性化失败: ${error?.message}`);
      return params;
    }
  }

  private async postProcessNlMergedParams(
    params: Record<string, any>,
    userId: string,
    sourceTexts: string[],
  ): Promise<Record<string, any>> {
    const sanitized = this.applyNlDateSanitization(params, sourceTexts);
    return this.enrichNlParamsWithUserContext(userId, sanitized);
  }

  private async createTripFromParams(
    params: Record<string, any>,
    userId: string,
    sessionId: string,
    destinationCode?: string
  ): Promise<any> {
    params = await this.enrichNlParamsWithUserContext(userId, params);

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
          const criticalFieldNameZhMap: Record<string, string> = {
            travelSeason: '旅行季节',
            riskTolerance: '风险偏好',
            hasInsurance: '保险情况',
            understandsWeather: '天气风险认知',
            emergencyPrepared: '应急准备',
            currency: '货币',
          };
          const missingFieldDisplayNames = missingCriticalFields.map((f) => {
            // 优先：配置里该字段对应的问题本身通常就是中文（如“你希望用什么货币来规划预算？”）
            // 这里用于“关键问题清单”展示时更短更清晰，因此用中文字段名映射兜底。
            return criticalFieldNameZhMap[f.fieldName] || f.fieldName;
          });
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
          const destinationName = this.getDestinationName(
            destinationCode,
            destinationCode ? await this.destinationClarificationConfigService?.getConfig(destinationCode) : null
          );
          
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
                highlightText: `为了您的安全，请先回答以下 ${missingCriticalFields.length} 个关键问题：${missingFieldDisplayNames.join('、')}`,
              },
              {
                type: 'paragraph',
                content: `已完成 ${completedCritical}/${totalCritical} 个关键问题（${progressPercent}%）`,
              },
            ],
            clarificationQuestions: questions.map(q => {
              const opts = q.type === 'boolean' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)
                ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
                : q.options;
              return {
                id: q.id,
                question: q.question,
                type: q.type,
                options: opts,
                required: q.required,
                hint: q.hint,
                placeholder: q.placeholder,
                metadata: q.metadata,
              };
            }),
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

    const currency = params.currency || 'CNY';

    // 🆕 映射规划师框架：节奏 2-3/3-5/5+ -> TripPace
    const paceMap: Record<string, string> = {
      '2-3': 'relaxed',
      relaxed: 'relaxed',
      '3-5': 'standard',
      moderate: 'standard',
      '5+': 'tight',
      intensive: 'tight',
    };
    const tripPace = paceMap[params.pace || params.preferences?.pace || params.preferencePace || ''] || 'standard';

    // 🆕 构建 preferences 标签（旅行风格、兴趣等，供下游优化使用）
    const prefTags: string[] = [];
    if (params.travelStyle) prefTags.push(params.travelStyle);
    if (params.preferences?.style) prefTags.push(params.preferences.style);
    if (params.preferences?.interests && Array.isArray(params.preferences.interests)) {
      prefTags.push(...params.preferences.interests);
    } else if (params.preferences?.interests && typeof params.preferences.interests === 'string') {
      prefTags.push(params.preferences.interests);
    }
    const activityPreferences = this.normalizeActivityPreferences(params);
    prefTags.push(...activityPreferences);
    if (params.riskTolerance) prefTags.push(`risk_${params.riskTolerance}`);
    const uniquePrefTags = [...new Set(prefTags.filter(Boolean))];

    // 🆕 P0修复：优先使用 destinationCode（ISO），避免 params.destination 为「东京」「杭州」等导致创建失败
    const isoDestination = destinationCode || this.extractCountryCode(params.destination) || params.destination;
    const tripMetadata: Record<string, any> = {};
    if (params.origin) tripMetadata.origin = params.origin;
    if (params.drivingFatiguePreferences) {
      tripMetadata.drivingFatiguePreferences = params.drivingFatiguePreferences;
    }
    if (activityPreferences.length > 0) {
      tripMetadata.activityPreferences = activityPreferences;
    }
    if (params._nlPersonalization) {
      tripMetadata.nlPersonalization = params._nlPersonalization;
    }

    const createTripDto = {
      destination: isoDestination,
      startDate,
      endDate,
      totalBudget: params.totalBudget,
      travelers: travelers as any,
      currency,
      pace: tripPace as any,
      preferences: uniquePrefTags.length > 0 ? uniquePrefTags : undefined,
      metadata: Object.keys(tripMetadata).length > 0 ? tripMetadata : undefined,
    } as CreateTripDto;

    // 创建行程（TripsService.create 会写入初始 DSO 到 Trip.metadata）
    const trip = await this.tripsService.create(createTripDto, userId);
    this.emitTripCreatedWorldBus(trip, userId);

    // 设置预算约束
    try {
      await this.tripBudgetService.setBudgetConstraint(trip.id, {
        total: params.totalBudget,
        currency,
        dailyBudget: undefined, // 让系统自动计算
      });
    } catch (error: any) {
      this.logger.warn(`设置预算约束失败: ${error.message}`);
    }

    const currencyLabels: Record<string, string> = { CNY: '元', USD: '美元', EUR: '欧元', JPY: '日元', ISK: '冰岛克朗', NOK: '挪威克朗' };
    const currencyLabel = currencyLabels[currency] || currency;
    // 添加成功消息到会话（含 thinkingProcess/progressSteps 以便会话恢复时正确展示）
    await this.nlConversationContextService.addMessage(
      sessionId,
      userId,
      'assistant',
      `行程已创建成功！目的地：${params.destination}，日期：${startDate} 至 ${endDate}，预算：${params.totalBudget} ${currencyLabel}\n\n${nlDiscussionDraftGuidance.shortHint}`,
      {
        tripId: trip.id,
        success: true,
        parsedParams: params,
        showConfirmCard: false, // 行程已创建，不需要确认卡片
        thinkingProcess: {
          summary: '正在准备可讨论草案',
          content: `用户希望创建前往 ${params.destination} 的行程。我已解析目的地、日期、预算和出行人数并创建行程；随后会生成一版可讨论的行程草案，可在同一条行程里继续调整。`,
        },
        progressSteps: [
          { id: 'parse', label: '已解析自然语言需求', detail: `目的地：${params.destination}，${startDate} 至 ${endDate}`, status: 'completed' },
          { id: 'create', label: '已创建行程', detail: `行程 ID: ${trip.id}`, status: 'completed' },
          { id: 'items', label: nlDiscussionDraftGuidance.progressItemsLabel, detail: nlDiscussionDraftGuidance.progressItemsDetail, status: 'running' },
        ],
        discussionDraft: {
          intent: nlDiscussionDraftGuidance.intent,
          headline: nlDiscussionDraftGuidance.headline,
          body: nlDiscussionDraftGuidance.body,
        },
      }
    );
    
    // 🆕 获取目的地中文名称
    const tripDestinationName = destinationCode
      ? this.getDestinationName(destinationCode, await this.destinationClarificationConfigService?.getConfig(destinationCode))
      : (params.destination || '未指定');
    
    // 异步生成行程规划点（不阻塞响应）
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
    
    // USE_LLM_DRAFT=true 时使用 LLM 编排（质量更好，Token 约 40k）；否则使用算法编排（Token ~3k）
    const useAlgorithmicDraft = this.configService?.get<string>('USE_LLM_DRAFT') !== 'true';
    this.logger.debug(`行程编排模式: ${useAlgorithmicDraft ? '算法' : 'LLM'}`);
    const personalization = params._nlPersonalization as Record<string, any> | undefined;
    this.generateDraftAsync(trip.id, {
      destination: isoDestination, // 使用 ISO 国家代码
      days: durationDays,
      startDate: startDate,
      endDate: endDate,
      style: params.preferences?.style || personalization?.draftStyle || 'balanced',
      intensity: params.preferences?.intensity || personalization?.draftIntensity || 'balanced',
      pace: personalization?.draftPace,
      useAlgorithmicDraft,
      draftRuntimeMode: useAlgorithmicDraft ? 'ALGO' : 'HYBRID',
      cities: params.cities,
      mustHavePois: params.mustHavePois,
      activityPreferences,
      dayAllocation: params.dayAllocation,
      userInput: params.userInput || params.originalUserInput,
    }).catch((error: any) => {
      this.logger.error(`后台生成行程规划点失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
    });
    
    // 🆕 异步生成决策草案（记录 AI 决策过程，支持回放和 RLHF）
    this.generateDecisionDraftAsync(
      trip.id,
      params.userInput || `创建${params.destination}行程`,
      params,
      {
        destination: params.destination,
        startDate: startDate,
        endDate: endDate,
        days: durationDays,
        totalBudget: params.totalBudget,
        hasChildren: params.hasChildren,
        hasElderly: params.hasElderly,
        preferences: params.preferences,
      }
    ).catch((error: any) => {
      this.logger.error(`后台生成决策草案失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
    });
    
    // 尝试推荐酒店（异步，不阻塞响应）
    if (this.hotelRecommendationService) {
      this.recommendHotelsAsync(trip.id, params.totalBudget).catch((error: any) => {
        this.logger.debug(`首次酒店推荐失败（可能因为还没有景点数据）: ${error.message}`);
      });
    }

    // 🆕 写入 intent snapshot：创建成功后将本次创建参数固化为已确认事实
    await this.nlConversationContextService.updateContext(sessionId, userId, {
      currentIntentSnapshot: {
        confirmedParams: {
          destination: params.destination,
          destinationCode: destinationCode || this.extractCountryCode(params.destination),
          startDate,
          endDate,
          totalBudget: params.totalBudget,
          currency,
          hasChildren: params.hasChildren,
          hasElderly: params.hasElderly,
          preferences: params.preferences,
          pace: params.pace,
        },
        lastConfirmedAt: new Date().toISOString(),
      },
    });
    
    return successResponse({
      sessionId,
      trip,
      parsedParams: params,
      destination: destinationCode || params.destination,
      destinationName: tripDestinationName,
      generatingItems: true, // 标记正在生成规划点
      message: nlDiscussionDraftGuidance.headline,
      discussionDraft: {
        intent: nlDiscussionDraftGuidance.intent,
        headline: nlDiscussionDraftGuidance.headline,
        body: nlDiscussionDraftGuidance.body,
        shortHint: nlDiscussionDraftGuidance.shortHint,
      },
      // 🆕 思考过程和进展（前端可折叠展示）
      thinkingProcess: {
        summary: '正在准备可讨论草案',
        content: `用户希望创建前往 ${params.destination} 的行程。我已解析目的地、日期、预算和出行人数并创建行程；随后会生成一版可讨论的行程草案，可在同一条行程里继续调整。`,
      },
      progressSteps: [
        { id: 'parse', label: '已解析自然语言需求', detail: `目的地：${params.destination}，${startDate} 至 ${endDate}`, status: 'completed' },
        { id: 'create', label: '已创建行程', detail: `行程 ID: ${trip.id}`, status: 'completed' },
        { id: 'items', label: nlDiscussionDraftGuidance.progressItemsLabel, detail: nlDiscussionDraftGuidance.progressItemsDetail, status: 'running' },
      ],
    });
  }

  /**
   * 🆕 生成默认澄清问题（当needsClarification=true但没有具体问题时使用）
   * 🆕 P0优化：标记为 'required' 分组
   * 🆕 P1优化：限制必需问题组不超过5个
   * @param missingFields 可选，从轮次完成条件传入的缺失字段名，用于生成针对性问题
   * @param inferredFields 可选，LLM 推断的字段（如 startDate、totalBudget），需要用户确认时生成确认类问题
   */
  private generateDefaultClarificationQuestions(
    reason: string,
    destinationCode?: string,
    currentParams?: Record<string, any>,
    missingFields?: string[],
    inferredFields?: string[]
  ): any[] {
    const questions: any[] = [];
    const MAX_REQUIRED_QUESTIONS = 5; // 🆕 P1优化：限制必需问题数量

    // 🆕 通用兜底（仅 reason=general）：根据缺失字段生成问题（如 travelGroup、hasWinterDrivingExperience 等）
    const fieldToQuestion: Record<string, { question: string; type: string; options?: Array<{ value: string; label: string }> }> = {
      travelGroup: {
        question: '你和谁一起旅行？',
        type: 'single_choice',
        options: [
          { value: 'solo', label: '独旅' },
          { value: 'couple', label: '情侣' },
          { value: 'friends', label: '朋友小队' },
          { value: 'family', label: '家庭（含儿童）' },
          { value: 'group', label: '团队或小组' },
        ],
      },
      hasWinterDrivingExperience: {
        question: '你有冬季驾驶经验吗？',
        type: 'boolean',
      },
      hasInsurance: {
        question: '你是否已购买旅行保险？',
        type: 'boolean',
      },
      currency: {
        question: '你希望用什么货币来规划预算？',
        type: 'single_choice',
        options: [
          { value: 'CNY', label: '人民币' },
          { value: 'USD', label: '美元' },
          { value: 'EUR', label: '欧元' },
          { value: 'ISK', label: '冰岛克朗' },
        ],
      },
    };
    if (reason === 'general' && missingFields && missingFields.length > 0) {
      for (const field of missingFields.slice(0, MAX_REQUIRED_QUESTIONS)) {
        const def = fieldToQuestion[field];
        if (def) {
          questions.push({
            id: `default_${field}`,
            question: def.question,
            type: def.type,
            ...(def.options && { options: def.options }),
            required: true,
            metadata: { category: 'basic', priority: 'high', fieldName: field },
          });
        }
      }
    }

    // 根据原因生成相应的问题
    if (reason === 'decision_matrix_blocked') {
      // 决策矩阵阻止：询问用户是否要调整计划
      questions.push({
        id: 'confirm_adjust_plan',
        question: '您是否希望调整计划以符合安全要求？',
        type: 'single_choice',
        options: [
          { value: 'yes', label: '是，帮我调整' },
          { value: 'no', label: '否，我了解风险' },
        ],
        required: true,
        metadata: {
          category: 'safety',
          priority: 'high',
          fieldName: 'confirmAdjustPlan',
        },
      });
    } else if (reason === 'gate_blocked') {
      // Gate阻止：询问用户选择替代方案
      questions.push({
        id: 'select_alternative',
        question: '请选择您希望采取的替代方案',
        type: 'single_choice',
        options: [
          { value: 'increase_budget', label: '增加预算' },
          { value: 'adjust_dates', label: '调整日期' },
          { value: 'modify_preferences', label: '修改偏好' },
        ],
        required: true,
        metadata: {
          category: 'constraint',
          priority: 'high',
          fieldName: 'alternativeAction',
        },
      });
    } else if (reason === 'safety_principle_blocked') {
      // 安全第一原则阻止：询问用户是否接受风险
      questions.push({
        id: 'accept_risk',
        question: '您是否了解并接受相关风险？',
        type: 'single_choice',
        options: [
          { value: 'yes_understand', label: '是，我了解风险并愿意继续' },
          { value: 'no_modify', label: '否，请帮我调整计划' },
        ],
        required: true,
        metadata: {
          category: 'safety',
          priority: 'high',
          fieldName: 'acceptRisk',
        },
      });
    } else {
      // 通用默认问题：询问缺失的关键信息
      const missingFields: string[] = [];
      
      if (!currentParams?.destination) {
        missingFields.push('目的地');
      }
      if (!currentParams?.startDate) {
        missingFields.push('出发日期');
      }
      if (!currentParams?.totalBudget) {
        missingFields.push('预算');
      }
      
      if (missingFields.length > 0) {
        questions.push({
          id: 'provide_missing_info',
          question: `请提供以下信息：${missingFields.join('、')}`,
          type: 'text',
          required: true,
          placeholder: `请输入${missingFields[0]}`,
          metadata: {
            category: 'basic',
            priority: 'high',
            fieldName: 'missingInfo',
          },
        });
      } else if (inferredFields && inferredFields.length > 0 && questions.length === 0) {
        // 🆕 基础信息都有但存在推断字段：生成确认类问题（结构化选项 + conditionalInputs）
        const inferredLabels: Record<string, string> = {
          startDate: '出行时间',
          endDate: '返程时间',
          totalBudget: '预算',
          hasChildren: '是否带儿童',
          hasElderly: '是否有长辈同行',
          'preferences.style': '旅行风格',
          'preferences.pace': '旅行节奏',
        };
        const labels = inferredFields
          .map((f) => inferredLabels[f] || f)
          .filter(Boolean)
          .slice(0, 3);
        const hasDate = inferredFields.some((f) => f === 'startDate' || f === 'endDate');
        const hasBudget = inferredFields.includes('totalBudget');
        const condInputs: any[] = [];
        if (hasDate) {
          condInputs.push({
            triggerValue: '不准确，需要修改日期',
            inputType: 'date_range',
            label: '请选择行程日期范围',
            paramKey: 'date_range',
            required: true,
          });
        }
        if (hasBudget) {
          condInputs.push({
            triggerValue: '预算需要调整',
            inputType: 'number',
            label: '请输入总预算（元）',
            placeholder: '例如：15000',
            paramKey: 'total_budget',
            required: true,
            validation: { min: 1, max: 10000000 },
          });
        }
        condInputs.push({
          triggerValue: '其他需要修改',
          inputType: 'text',
          label: '请描述您想调整的内容',
          placeholder: '例如：出行时间改为3月、预算增加到2万',
          paramKey: 'other',
          required: false,
        });
        const options: { value: string; label: string }[] = [
          { value: 'confirm', label: '确认无误' },
          ...(hasDate ? [{ value: '不准确，需要修改日期', label: '不准确，需要修改日期' }] : []),
          ...(hasBudget ? [{ value: '预算需要调整', label: '预算需要调整' }] : []),
          { value: '其他需要修改', label: '其他需要修改' },
        ];
        questions.push({
          id: 'confirm_inferred_info',
          question: labels.length > 0
            ? `请确认以上${labels.join('、')}等信息是否正确，或选择需要调整的项`
            : '请确认以上信息是否正确，或补充其他偏好',
          type: 'single_choice',
          options,
          required: false,
          metadata: {
            category: 'confirmation',
            priority: 'medium',
            fieldName: 'confirmInferred',
          },
          conditionalInputs: condInputs,
        });
      }
    }
    
    // 🆕 P0优化：标记所有问题为 'required' 分组
    // 🆕 P1优化：如果超过限制，只返回前MAX_REQUIRED_QUESTIONS个问题
    return questions.slice(0, MAX_REQUIRED_QUESTIONS).map((q: any) => ({
      ...q,
      group: 'required', // 标记为必需问题
    }));
  }

  /**
   * 🆕 HCI P1优化：检测旅行目的
   * 从用户输入、参数或对话上下文中检测旅行目的（蜜月、家庭、商务等）
   */
  private detectTravelPurpose(
    params: Record<string, any>,
    userInput?: string,
    context?: any
  ): string | null {
    // 从用户输入中检测
    if (userInput) {
      const inputLower = userInput.toLowerCase();
      if (inputLower.includes('蜜月') || inputLower.includes('honeymoon') || inputLower.includes('新婚')) {
        return '蜜月旅行';
      }
      if (inputLower.includes('带娃') || inputLower.includes('带孩子') || inputLower.includes('亲子')) {
        return '家庭旅行';
      }
      if (inputLower.includes('商务') || inputLower.includes('business')) {
        return '商务旅行';
      }
      if (inputLower.includes('毕业') || inputLower.includes('毕业旅行')) {
        return '毕业旅行';
      }
    }
    
    // 从参数中检测
    if (params.hasChildren) {
      return '家庭旅行';
    }
    
    // 从对话上下文中检测
    if (context?.conversationContext?.travelStyle) {
      const style = context.conversationContext.travelStyle.toLowerCase();
      if (style.includes('honeymoon') || style.includes('蜜月')) {
        return '蜜月旅行';
      }
      if (style.includes('family') || style.includes('家庭')) {
        return '家庭旅行';
      }
    }
    
    return null;
  }

  /**
   * 🆕 生成偏好补充追问（当用户点击「补充偏好信息」时直接返回）
   */
  private generatePreferenceSupplementQuestions(
    params: Record<string, any>,
    _destinationCode?: string
  ): any[] {
    const questions: any[] = [];
    const prefs = params.preferences || {};
    if (!prefs.accommodation && !params.preferenceAccommodation) {
      questions.push({
        id: 'pref_accommodation',
        question: '您偏好的住宿类型是？',
        type: 'single_choice',
        options: [
          { value: 'hotel', label: '酒店' },
          { value: 'bnb', label: '民宿/公寓' },
          { value: 'camping', label: '露营/房车' },
          { value: 'mix', label: '混合（根据路线灵活选择）' },
        ],
        required: false,
        metadata: { category: 'preferences', priority: 'medium', fieldName: 'preferenceAccommodation' },
        group: 'optional',
      });
    }
    if (!prefs.dining && !params.preferenceDining && questions.length < 3) {
      questions.push({
        id: 'pref_dining',
        question: '餐饮方面您的偏好是？',
        type: 'single_choice',
        options: [
          { value: 'local', label: '多体验当地特色餐厅' },
          { value: 'flexible', label: '随性探索或自己烹饪' },
          { value: 'budget', label: '经济实惠为主' },
          { value: 'fine', label: '精选品质餐厅' },
        ],
        required: false,
        metadata: { category: 'preferences', priority: 'medium', fieldName: 'preferenceDining' },
        group: 'optional',
      });
    }
    if (!prefs.pace && !params.preferencePace && questions.length < 3) {
      const paceHint = params._fitnessAssessmentMissing
        ? '尚未完成体能评估；填写问卷后我们能更准确推荐节奏（可在个人中心完成）'
        : params._nlPaceSource === 'profile'
          ? '已根据您的旅行偏好预填建议节奏，可直接确认或调整'
          : params._nlPaceSource === 'fitness'
            ? '已根据体能画像预填建议节奏，可直接确认或调整'
            : undefined;
      questions.push({
        id: 'pref_pace',
        question: '旅行节奏您更偏向？',
        type: 'single_choice',
        options: [
          { value: 'relaxed', label: '宽松悠闲' },
          { value: 'moderate', label: '适中' },
          { value: 'intensive', label: '紧凑充实' },
        ],
        required: false,
        ...(paceHint ? { hint: paceHint } : {}),
        metadata: { category: 'preferences', priority: 'medium', fieldName: 'preferencePace' },
        group: 'optional',
      });
    }
    if (questions.length === 0) {
      questions.push({
        id: 'pref_free_text',
        question: '请用文字简单描述您的其他偏好（如住宿、餐饮、节奏等）',
        type: 'text',
        required: false,
        placeholder: '例如：希望住民宿、喜欢当地小吃、节奏不要太赶',
        metadata: { category: 'preferences', priority: 'low', fieldName: 'preferences.freeText' },
        group: 'optional',
      });
    }
    return questions.map((q) => ({ ...q, group: q.group || 'optional' }));
  }

  /**
   * 🆕 生成补充信息问题（在澄清过程中或所有必需字段都有时，询问用户是否需要补充其他信息）
   * 🆕 P0优化：限制问题数量，符合Miller's Law（7±2限制）
   * 🆕 P1优化：限制补充问题组不超过3个
   */
  private generateSupplementaryQuestions(
    params: Record<string, any>,
    destinationCode?: string
  ): any[] {
    const questions: any[] = [];
    const MAX_SUPPLEMENTARY_QUESTIONS = 3; // 🆕 P1优化：限制补充问题数量
    
    // 🆕 移除：不再询问"是否需要进一步澄清其他信息"
    // 直接生成其他补充问题（偏好、安全等）
    
    // 检查是否有可选的补充信息
    const hasOptionalInfo = params.preferences?.interests || params.preferences?.style || params.preferences?.pace;
    
    // 如果没有偏好信息，询问是否需要补充偏好信息
    // 🆕 使用 conditionalInputs 提供结构化表单（单选、多选、文本）
    if (!hasOptionalInfo && questions.length < MAX_SUPPLEMENTARY_QUESTIONS) {
      // 选项值；triggerValue 用「补充偏好信息」支持包含匹配（兼容 补充偏好信息(节奏/活动) 等变体）
      const supplementYesValue = '补充偏好信息（如徒步强度、美食、住宿风格）';
      const triggerValue = '补充偏好信息';
      questions.push({
        id: 'supplement_preferences',
        question: '是否需要补充旅行偏好信息？',
        type: 'single_choice',
        options: [
          { value: supplementYesValue, label: supplementYesValue },
          { value: 'no', label: '暂不补充，先确认核心信息' },
        ],
        required: false,
        group: 'optional',
        metadata: {
          category: 'preferences',
          priority: 'low',
          fieldName: 'supplementPreferences',
        },
        conditionalInputs: [
          {
            triggerValue,
            inputType: 'single_choice',
            label: '这次旅行更接近哪种风格？',
            paramKey: 'travelStyle',
            options: [
              { value: 'relaxed', label: 'A 放松度假' },
              { value: 'deep', label: 'B 深度探索' },
              { value: 'dense', label: 'C 高效打卡' },
              { value: 'photo', label: 'D 摄影创作' },
              { value: 'food', label: 'E 美食巡礼' },
            ],
            required: false,
          },
          {
            triggerValue,
            inputType: 'single_choice',
            label: '每天希望安排几个核心点？',
            paramKey: 'pace',
            options: [
              { value: '2-3', label: '2-3 个（轻松）' },
              { value: '3-5', label: '3-5 个（平衡）' },
              { value: '5+', label: '5+ 个（密集）' },
            ],
            required: false,
          },
          {
            triggerValue,
            inputType: 'multi_choice',
            label: '可以接受哪些？',
            paramKey: 'riskAccepted',
            options: [
              { value: 'night_driving', label: '夜间自驾' },
              { value: 'mountain_roads', label: '山路' },
              { value: 'remote_areas', label: '小众地区' },
              { value: 'complex_transfer', label: '复杂换乘' },
              { value: 'weather_unstable', label: '天气不稳定' },
            ],
            required: false,
          },
          {
            triggerValue,
            inputType: 'multi_choice',
            label: '请选择美食偏好',
            paramKey: 'cuisine',
            options: ['中餐', '西餐', '海鲜', '当地特色', '无特别要求'],
            required: false,
          },
          {
            triggerValue,
            inputType: 'multi_choice',
            label: '请选择住宿风格',
            paramKey: 'accommodation_style',
            options: ['经济型', '舒适型', '精品酒店', '民宿', '青旅'],
            required: false,
          },
          {
            triggerValue,
            inputType: 'single_choice',
            label: '请选择徒步强度',
            paramKey: 'hiking_intensity',
            options: ['轻松', '中等', '高强度', '不涉及徒步'],
            required: false,
          },
          {
            triggerValue,
            inputType: 'text',
            label: '其他偏好描述',
            placeholder: '例如：户外徒步、观星、节奏悠闲、偏好美食',
            hint: '您的偏好将帮助筛选活动和住宿，让行程更个性化。',
            paramKey: 'other',
            required: false,
          },
        ],
      });
    }
    
    // 🆕 P1优化：如果已达到限制，不再添加安全问题
    if (questions.length >= MAX_SUPPLEMENTARY_QUESTIONS) {
      return questions;
    }
    
    // 如果目的地是高风险地区，询问是否需要补充安全相关信息
    // 🆕 P2优化：使用更具体的选项，减少决策时间
    // 🆕 使用 conditionalInputs 提供安全信息描述输入
    const highRiskDestinations = ['GL', 'SJ', 'AR']; // 格陵兰、斯瓦尔巴、阿根廷（部分区域）
    if (destinationCode && highRiskDestinations.includes(destinationCode) && questions.length < MAX_SUPPLEMENTARY_QUESTIONS) {
      const safetyYesValue = '补充安全信息（如健康状况、户外经验等）';
      questions.push({
        id: 'supplement_safety_info',
        question: '是否需要补充安全相关信息？（如健康状况、户外经验等）',
        type: 'single_choice',
        options: [
          { value: safetyYesValue, label: safetyYesValue },
          { value: 'no', label: '暂不补充' },
        ],
        required: false,
        group: 'optional',
        metadata: {
          category: 'safety',
          priority: 'medium',
          fieldName: 'supplementSafetyInfo',
        },
        conditionalInputs: [
          {
            triggerValue: safetyYesValue,
            inputType: 'text',
            label: '请描述您的安全相关信息',
            placeholder: '例如：无心脏病史、有高海拔经验、需携带药物',
            required: false,
            paramKey: 'freeText',
          },
        ],
      });
    }
    
    return questions;
  }

  /**
   * 🆕 构建分层进展步骤（4 阶段，当前阶段 running）
   */
  private buildPhaseProgressSteps(
    roundId: string,
    roundToPhase: Record<string, number>,
    destName: string,
    qCount: number
  ): Array<{ id: string; label: string; detail?: string; status: 'completed' | 'running' | 'pending' }> {
    const currentPhase = roundToPhase[roundId] ?? 2;
    const phases: Array<{ id: string; label: string; detail?: string; status: 'completed' | 'running' | 'pending' }> = [
      { id: 'phase1', label: '第一阶段：硬约束确认', status: 'pending' },
      { id: 'phase2', label: '第二阶段：风格选择', status: 'pending' },
      { id: 'phase3', label: '第三阶段：节奏校准', status: 'pending' },
      { id: 'phase4', label: '第四阶段：风险偏好', status: 'pending' },
    ];
    for (let i = 0; i < phases.length; i++) {
      if (i + 1 < currentPhase) phases[i].status = 'completed';
      else if (i + 1 === currentPhase) {
        phases[i].status = 'running';
        phases[i].detail = i === 0 ? `已识别：${destName}` : `${qCount} 个问题待确认`;
      }
    }
    return phases;
  }

  /**
   * 🆕 根据已收集的 partialParams 生成演进的思考内容
   * 避免多轮澄清时始终显示「识别到目的地，还需确认」的静态文案，让用户感知对话在推进
   */
  private buildEvolvedThinkingContent(
    params: Record<string, any> | null | undefined,
    destName: string | undefined,
    qCount: number,
    phase: 'clarify' | 'confirm' | 'supplement_preference'
  ): { summary: string; content: string } {
    const p = params || {};
    const confirmed: string[] = [];

    if (destName || p.destination) {
      confirmed.push(`目的地：${destName || p.destination}`);
    }
    if (p.startDate && p.endDate) {
      confirmed.push(`日期 ${p.startDate} 至 ${p.endDate}`);
    } else if (p.startDate) {
      confirmed.push('出发日期');
    }
    if (p.totalBudget != null && p.totalBudget !== '') {
      confirmed.push(`预算 ${p.totalBudget}${p.currency ? ` ${p.currency}` : ''}`);
    }
    const tc = p.travelerCount ?? p.travelGroup;
    if (tc != null && tc !== '') {
      const tcLabel = typeof tc === 'number' ? `${tc} 人` : String(tc);
      confirmed.push(`出行人数：${tcLabel}`);
    }
    const hasPref =
      p.preferences?.accommodation ||
      p.preferences?.dining ||
      p.preferences?.pace ||
      p.preferenceAccommodation ||
      p.preferenceDining ||
      p.preferencePace ||
      p.preferences?.interests ||
      p.preferences?.style ||
      p.preferences?.activityType ||
      p.travelStyle ||
      p.pace ||
      p.riskTolerance ||
      p.riskAccepted;
    if (hasPref) {
      confirmed.push('偏好');
    }

    if (phase === 'confirm') {
      return {
        summary: '思考了一会儿',
        content:
          confirmed.length > 0
            ? `已确认：${confirmed.join('、')}。准备创建行程，请用户确认。`
            : '已收集到所有必需信息。准备创建行程，请用户确认。',
      };
    }
    if (phase === 'supplement_preference') {
      return {
        summary: '思考了一会儿',
        content:
          confirmed.length > 0
            ? `已确认：${confirmed.join('、')}。用户希望补充偏好，正在询问住宿、餐饮和节奏。`
            : '用户希望补充偏好信息。我将询问住宿、餐饮和旅行节奏方面的偏好。',
      };
    }
    // phase === 'clarify'
    if (confirmed.length > 0) {
      return {
        summary: '思考了一会儿',
        content: `已确认：${confirmed.join('、')}。${qCount > 0 ? `还需确认 ${qCount} 个问题即可创建行程。` : '即将准备创建行程。'}`,
      };
    }
    return {
      summary: '思考了一会儿',
      content: `用户发送了创建行程的请求。我已解析自然语言，识别到${destName ? `目的地：${destName}` : '部分信息'}，但还需要确认或补充一些关键信息才能创建行程。`,
    };
  }

  /**
   * 将 dayAllocation 数组格式化为可读字符串，避免前端直接渲染对象导致 [object Object]
   * 例如 [{ city: "杭州", days: 3 }, { city: "千岛湖", days: 1 }] → "杭州 3 天、千岛湖 1 天"
   */
  private formatDayAllocationDisplay(dayAllocation: Array<{ city?: string; days?: number }> | undefined): string | undefined {
    if (!dayAllocation?.length) return undefined;
    return dayAllocation
      .map((a) => (a?.city != null && a?.days != null ? `${a.city} ${a.days} 天` : null))
      .filter(Boolean)
      .join('、') || undefined;
  }

  /**
   * 🆕 归一化 partialParams：将 LLM 生成的 qN_preferences 合并到 preferences，
   * 确保页面展示与创建行程下游使用的结构一致
   */
  private normalizePartialParams(params: Record<string, any>): Record<string, any> {
    if (!params || typeof params !== 'object') return params;
    const out = { ...params };
    for (const key of Object.keys(out)) {
      if (/^q\d+_preferences$/i.test(key) && typeof out[key] === 'object') {
        if (!out.preferences) out.preferences = {};
        for (const [k, v] of Object.entries(out[key])) {
          if (v !== null && v !== undefined) {
            out.preferences[k] = v; // 直接覆盖，确保用户输入优先
          }
        }
        delete out[key]; // 移除冗余的 qN_preferences
      }
    }
    return out;
  }

  /** 目的地代码 -> 中文名称映射（集中维护，避免多处重复） */
  private static readonly DESTINATION_NAME_MAP: Record<string, string> = {
    GL: '格陵兰',
    IS: '冰岛',
    SJ: '斯瓦尔巴',
    AR: '阿根廷',
    JP: '日本',
    CN: '中国',
    US: '美国',
    TH: '泰国',
    NZ: '新西兰',
  };

  /** 内置的常见问题 value->label 映射（pref_* 等来自 nextClarificationQuestions，可能不在消息的 clarificationQuestions 中） */
  private static readonly BUILTIN_VALUE_LABELS: Record<string, Record<string, string>> = {
    pref_accommodation: { hotel: '酒店', bnb: '民宿/公寓', camping: '露营/房车', mix: '混合（根据路线灵活选择）' },
    pref_dining: { local: '多体验当地特色餐厅', flexible: '随性探索或自己烹饪', budget: '经济实惠为主', fine: '精选品质餐厅' },
    pref_pace: { relaxed: '宽松悠闲', moderate: '适中', intensive: '紧凑充实' },
    // 常见全局枚举（即使前端直接提交英文 value，也能展示中文）
    riskTolerance: { low: '低', medium: '中', high: '高' },
    travelGroup: {
      solo: '独自旅行',
      couple: '情侣/两人同行',
      friends: '朋友结伴',
      family: '家庭出行',
      business: '商务出行',
    },
    activityPreferences: {
      aurora_hunting: '极光追踪',
      glacier_hiking: '冰川徒步',
      scenic_photography: '风景摄影',
      nature_exploration: '自然探索',
      hot_springs: '温泉体验',
      adventure_activities: '冒险活动',
      city_walk: '城市漫步',
    },
    // 部分目的地配置使用 activityTypes 字段名
    activityTypes: {
      aurora_hunting: '极光追踪',
      glacier_hiking: '冰川徒步',
      scenic_photography: '风景摄影',
      nature_exploration: '自然探索',
      hot_springs: '温泉体验',
      adventure_activities: '冒险活动',
      city_walk: '城市漫步',
    },
  };

  /** 获取目的地中文名称（优先使用 config，否则查表） */
  private getDestinationName(destinationCode: string | undefined, config?: { destinationName?: string } | null): string {
    if (!destinationCode) return '未指定';
    if (config?.destinationName) return config.destinationName;
    return TripsController.DESTINATION_NAME_MAP[destinationCode] || destinationCode;
  }

  /**
   * 短路径上下文（供 createFromNaturalLanguage 短路径复用）
   */
  private async tryShortPaths(ctx: {
    dto: CreateTripFromNaturalLanguageDto;
    userId: string;
    sessionId: string;
    existingContext: Awaited<ReturnType<NLConversationContextService['getContext']>>;
    trimmedText: string;
    pp: Record<string, any>;
    detectedCountryCode: string | undefined;
    destinationConfig: any;
  }): Promise<{ handled: boolean; result?: any }> {
    const r1 = await this.handleShortPathCreateIntent(ctx);
    if (r1.handled) return r1;
    const r2 = await this.handleShortPathConfirm(ctx);
    if (r2.handled) return r2;
    const r3 = await this.handleShortPathSupplementPref(ctx);
    if (r3.handled) return r3;
    return { handled: false };
  }

  /** 短路径 1：用户明确「创建」意图，且已在确认阶段 -> 直接创建行程 */
  private async handleShortPathCreateIntent(ctx: {
    dto: CreateTripFromNaturalLanguageDto;
    userId: string;
    sessionId: string;
    existingContext: Awaited<ReturnType<NLConversationContextService['getContext']>>;
    trimmedText: string;
    pp: Record<string, any>;
    detectedCountryCode: string | undefined;
    destinationConfig: any;
  }): Promise<{ handled: boolean; result?: any }> {
    const { pp, trimmedText, detectedCountryCode } = ctx;
    const hasRequiredForConfirm = pp.destination && pp.startDate && pp.endDate && pp.totalBudget != null;
    const isCreateNowIntent =
      /明确\s*confirm|确认\s*创建|创建\s*行程|开始\s*创建|立即\s*创建|马上\s*创建|确认出行|明确confirm/i.test(trimmedText) ||
      /^(create|创建|confirm)$/i.test(trimmedText);
    const lastAssistantMsg = ctx.existingContext?.messages?.filter((m) => m.role === 'assistant').pop();
    const wasInConfirmPhase = lastAssistantMsg?.metadata?.showConfirmCard === true;
    if (!hasRequiredForConfirm || !isCreateNowIntent || !wasInConfirmPhase) return { handled: false };
    const params = this.normalizePartialParams({ ...pp }) as Record<string, any>;
    const destCode = this.extractCountryCode(params.destination) || detectedCountryCode;
    this.logger.debug(`[创建意图] 用户在确认阶段发送「${trimmedText}」，直接创建行程`);
    const result = await this.createTripFromParams(params, ctx.userId, ctx.sessionId, destCode ?? undefined);
    return { handled: true, result };
  }

  /** 短路径 2：用户「已确认」或 confirmInferred=confirm -> 返回确认卡片（或直接创建若 isCreateNowIntent） */
  private async handleShortPathConfirm(ctx: {
    dto: CreateTripFromNaturalLanguageDto;
    userId: string;
    sessionId: string;
    existingContext: Awaited<ReturnType<NLConversationContextService['getContext']>>;
    trimmedText: string;
    pp: Record<string, any>;
    detectedCountryCode: string | undefined;
    destinationConfig: any;
  }): Promise<{ handled: boolean; result?: any }> {
    const { pp, trimmedText, detectedCountryCode, destinationConfig } = ctx;
    const hasRequiredForConfirm = pp.destination && pp.startDate && pp.endDate && pp.totalBudget != null;
    const isCreateNowIntent =
      /明确\s*confirm|确认\s*创建|创建\s*行程|开始\s*创建|立即\s*创建|马上\s*创建|确认出行|明确confirm/i.test(trimmedText) ||
      /^(create|创建|confirm)$/i.test(trimmedText);
    const isShortConfirm = /^(已确认|确认|确认无误|好的|ok)$/i.test(trimmedText) && trimmedText.length <= 10;
    const hasConfirmInferredConfirm =
      hasRequiredForConfirm && (pp.confirmInferred === 'confirm' || pp.confirmInferred === '确认无误');
    const ppNorm = this.normalizePartialParams(pp);
    const hasPrefData =
      ppNorm.preferences?.accommodation ||
      ppNorm.preferences?.dining ||
      ppNorm.preferences?.pace ||
      ppNorm.preferenceAccommodation ||
      ppNorm.preferenceDining ||
      ppNorm.preferencePace;
    const looksLikePrefSummary =
      /您偏好的住宿类型|餐饮方面您的偏好|pref_accommodation|pref_dining/i.test(trimmedText) ||
      /\b(camping|hotel|bnb|flex|flexible|local|budget|fine|relaxed|moderate|intensive)\b/i.test(trimmedText);
    const isConfirmWithPrefSummary =
      hasRequiredForConfirm && hasPrefData && looksLikePrefSummary && trimmedText.length <= 120;
    if (!(isShortConfirm || isConfirmWithPrefSummary || hasConfirmInferredConfirm) || !hasRequiredForConfirm) {
      return { handled: false };
    }
    if (isCreateNowIntent) {
      const params = this.normalizePartialParams({ ...pp }) as Record<string, any>;
      const destCode = this.extractCountryCode(params.destination) || detectedCountryCode;
      this.logger.debug(`[创建意图] 用户文本「${trimmedText}」触发直接创建行程`);
      const result = await this.createTripFromParams(params, ctx.userId, ctx.sessionId, destCode ?? undefined);
      return { handled: true, result };
    }
    const params = { ...pp };
    const destCode = this.extractCountryCode(params.destination) || detectedCountryCode;
    if (destCode && this.destinationClarificationConfigService) {
      const criticalFields = await this.destinationClarificationConfigService.getCriticalFields(destCode);
      if (criticalFields.length > 0) {
        const missingCriticalFields = criticalFields.filter(
          (field) =>
            !params[field.fieldName] ||
            params[field.fieldName] === null ||
            params[field.fieldName] === undefined ||
            String(params[field.fieldName]).trim() === ''
        );
        if (missingCriticalFields.length > 0) {
          const missingFieldNames = missingCriticalFields.map((f) => f.fieldName);
          const questions = await this.destinationClarificationConfigService.getQuestionsForFields(destCode, missingFieldNames);
          const totalCritical = criticalFields.length;
          const completedCritical = totalCritical - missingCriticalFields.length;
          const progressPercent = Math.round((completedCritical / totalCritical) * 100);
          const destName = this.getDestinationName(destCode, destinationConfig);
          this.logger.debug(`[短路径] Critical 字段未齐（缺: ${missingFieldNames.join(',')}），先澄清再确认`);
          // 🆕 必须添加助手消息，否则 confirm-create 会读取上一轮 showConfirmCard:true 而误放行
          const reply = `请先确认以下信息：${missingCriticalFields.map((f) => f.question).join('、')}`;
          const clarificationObjs = questions.map((q) => ({
            id: q.id,
            question: q.question,
            type: q.type,
            options: q.type === 'boolean' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)
              ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
              : q.options,
            required: q.required,
            hint: q.hint,
            placeholder: q.placeholder,
            metadata: q.metadata,
          }));
          await this.nlConversationContextService.addMessage(ctx.sessionId, ctx.userId, 'assistant', reply, {
            needsClarification: true,
            blockedByCriticalFields: true,
            showConfirmCard: false,
            clarificationQuestions: clarificationObjs,
            plannerResponseBlocks: [
              { type: 'highlight', highlightType: 'warning', highlightText: `请先确认以下信息：${missingCriticalFields.map((f) => f.question).join('、')}` },
              { type: 'paragraph', content: `已完成 ${completedCritical}/${totalCritical} 项（${progressPercent}%）` },
            ],
          });
          return {
            handled: true,
            result: successResponse({
              sessionId: ctx.sessionId,
              needsClarification: true,
              blockedByCriticalFields: true,
              destination: destCode,
              destinationName: destName,
              criticalFieldsProgress: { completed: completedCritical, total: totalCritical, percent: progressPercent },
              plannerResponseBlocks: [
                { type: 'highlight', highlightType: 'warning', highlightText: `请先确认以下信息：${missingCriticalFields.map((f) => f.question).join('、')}` },
                { type: 'paragraph', content: `已完成 ${completedCritical}/${totalCritical} 项（${progressPercent}%）` },
              ],
              clarificationQuestions: questions.map((q) => ({
                id: q.id,
                question: q.question,
                type: q.type,
                options: q.type === 'boolean' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)
                  ? [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
                  : q.options,
                required: q.required,
                hint: q.hint,
                placeholder: q.placeholder,
                metadata: q.metadata,
              })),
              partialParams: params,
            }),
          };
        }
      }
    }
    let sd = params.startDate;
    let ed = params.endDate;
    if (sd?.includes('T')) sd = sd.split('T')[0];
    if (ed?.includes('T')) ed = ed.split('T')[0];
    const destName = this.getDestinationName(detectedCountryCode ?? '', destinationConfig);
    const travelersArray = params.travelers;
    let travelersInfo = '2位成人';
    if (Array.isArray(travelersArray) && travelersArray.length > 0) {
      travelersInfo = `${travelersArray.length}人`;
    } else if (params.hasChildren || params.hasElderly) {
      const parts: string[] = [];
      if (params.hasChildren) parts.push('儿童');
      if (params.hasElderly) parts.push('老人');
      if (parts.length) travelersInfo = parts.join('、');
    }
    const paramsAny = this.normalizePartialParams(params || {}) as Record<string, any>;
    const hasPreferences =
      paramsAny.preferences?.interests ||
      paramsAny.preferences?.style ||
      paramsAny.preferences?.pace ||
      paramsAny.preferences?.accommodation ||
      paramsAny.preferences?.dining ||
      paramsAny.pace ||
      paramsAny.preferenceAccommodation ||
      paramsAny.preferenceDining ||
      paramsAny.preferencePace;
    const confirmationBlocks: any[] = [
      { type: 'highlight', highlightType: 'info', highlightText: '✅ 已收集到所有必需信息，准备创建行程' },
      {
        type: 'summary_card',
        summary: {
          destination: destName || '未指定',
          duration: sd && ed ? `${sd} 至 ${ed}` : '未指定',
          travelers: travelersInfo,
          budget: { amount: params.totalBudget ?? 0, currency: params.currency || 'CNY' },
          ...(paramsAny.cities?.length ? { cities: paramsAny.cities } : {}),
          ...(paramsAny.dayAllocation?.length ? { dayAllocation: paramsAny.dayAllocation } : {}),
          ...(paramsAny.dayAllocation?.length ? { dayAllocationDisplay: this.formatDayAllocationDisplay(paramsAny.dayAllocation) } : {}),
          ...(paramsAny.mustHavePois?.length ? { mustHavePois: paramsAny.mustHavePois } : {}),
        },
      },
    ];
    if (!hasPreferences) {
      confirmationBlocks.push({
        type: 'paragraph',
        content: '⚙️ 偏好设置：未设置\n如需补充偏好信息（如旅行风格、兴趣点、节奏等），请告诉我。',
      });
    }
    confirmationBlocks.push({
      type: 'paragraph',
      content: '在创建行程前，请确认以上信息是否正确，或者告诉我是否需要补充其他信息。',
    });
    const rawSupplementary = this.generateSupplementaryQuestions(params, ctx.detectedCountryCode).map((q: any) => ({
      ...q,
      group: 'optional',
    }));
    const assistantReply = '我已经收集到创建行程所需的基本信息。请确认以下信息是否正确，或者告诉我是否需要补充其他信息。';
    await this.nlConversationContextService.addMessage(ctx.sessionId, ctx.userId, 'assistant', assistantReply, {
      needsClarification: false,
      needsConfirmation: true,
      plannerResponseBlocks: confirmationBlocks,
      clarificationQuestions: rawSupplementary,
      parsedParams: params,
      showConfirmCard: true,
      questionAnswers: {},
      thinkingProcess: this.buildEvolvedThinkingContent(pp, destName, 0, 'confirm'),
      progressSteps: [
        { id: 'collect', label: '已收集必需信息', status: 'completed' },
        { id: 'confirm', label: '等待用户确认', status: 'running' },
      ],
    });
    const savedCtx = await this.nlConversationContextService.getContext(ctx.sessionId, ctx.userId);
    const lastMsg = savedCtx?.messages?.filter((m) => m.role === 'assistant').pop();
    this.logger.debug(`[已确认] 短路径返回确认卡片${hasConfirmInferredConfirm ? '（来自 confirmInferred=confirm）' : ''}`);
    return {
      handled: true,
      result: successResponse({
        sessionId: ctx.sessionId,
        needsClarification: false,
        needsConfirmation: true,
        plannerResponseBlocks: confirmationBlocks,
        clarificationQuestions: rawSupplementary,
        plannerReply: assistantReply,
        partialParams: params,
        destination: ctx.detectedCountryCode || params.destination,
        destinationName: destName,
        lastMessageId: lastMsg?.id,
        showConfirmCard: true,
        thinkingProcess: this.buildEvolvedThinkingContent(pp, destName, 0, 'confirm'),
        progressSteps: [
          { id: 'collect', label: '已收集必需信息', status: 'completed' },
          { id: 'confirm', label: '等待用户确认', detail: '请确认以上信息无误后创建行程', status: 'running' },
        ],
      }),
    };
  }

  /** 短路径 3：用户点击「补充偏好信息」-> 返回偏好追问 */
  private async handleShortPathSupplementPref(ctx: {
    dto: CreateTripFromNaturalLanguageDto;
    userId: string;
    sessionId: string;
    existingContext: Awaited<ReturnType<NLConversationContextService['getContext']>>;
    trimmedText: string;
    pp: Record<string, any>;
    detectedCountryCode: string | undefined;
    destinationConfig: any;
  }): Promise<{ handled: boolean; result?: any }> {
    const { trimmedText, detectedCountryCode, destinationConfig } = ctx;
    const supplementPreferencePattern = /^(补充偏好|补充偏好信息|我想补充|补充其他偏好|yes)$/i;
    const supplementPreferenceLoose = /^补充偏好信息\s*[（(]?如?.+[）)]?\s*$/i;
    const supplementPreferenceContains = /[：:;]\s*补充偏好信息\s*[（(]?[^）)]*[）)]?\s*$/i;
    const supplementPrefValue = ctx.existingContext?.partialParams?.supplementPreferences;
    const looksLikePreferenceAnswer =
      /您偏好的住宿类型|餐饮方面您的偏好|请用文字简单描述您的其他偏好/i.test(trimmedText) ||
      /\b(camping|hotel|bnb|flex|flexible|local|budget|fine|relaxed|moderate|intensive)\b/i.test(trimmedText) ||
      /\b(pref_accommodation|pref_dining|pref_pace)[=:]/i.test(trimmedText);
    const isSupplementPreferenceIntent =
      !looksLikePreferenceAnswer &&
      (supplementPreferencePattern.test(trimmedText) ||
        supplementPreferenceLoose.test(trimmedText) ||
        supplementPreferenceContains.test(trimmedText) ||
        (trimmedText.includes('补充偏好信息') && trimmedText.length <= 150) ||
        ((supplementPrefValue === 'yes' || supplementPrefValue?.includes?.('补充偏好信息')) && trimmedText.length <= 80));
    const ppNorm = this.normalizePartialParams(ctx.existingContext?.partialParams || {});
    const hasPrefAnswers =
      ppNorm.preferences?.accommodation ||
      ppNorm.preferences?.dining ||
      ppNorm.preferences?.pace ||
      ppNorm.preferenceAccommodation ||
      ppNorm.preferenceDining ||
      ppNorm.preferencePace;
    if (
      !isSupplementPreferenceIntent ||
      hasPrefAnswers ||
      !ctx.existingContext?.partialParams ||
      (!ctx.existingContext.partialParams.destination && !ctx.existingContext.partialParams.startDate)
    ) {
      return { handled: false };
    }
    const mergedParams = { ...ctx.existingContext.partialParams, supplementPreferences: 'yes' };
    const prefQuestions = this.generatePreferenceSupplementQuestions(mergedParams, detectedCountryCode);
    const destNameForPref = this.getDestinationName(detectedCountryCode, destinationConfig);
    if (prefQuestions.length === 0) return { handled: false };
    const assistantReply = '好的，请告诉我您在住宿、餐饮和旅行节奏方面的偏好，这样我能更好地为您规划行程。';
    await this.nlConversationContextService.addMessage(ctx.sessionId, ctx.userId, 'assistant', assistantReply, {
      needsClarification: true,
      plannerResponseBlocks: [
        { type: 'paragraph', content: assistantReply },
        { type: 'highlight', highlightType: 'info', highlightText: '请选择或填写以下信息，也可直接文字描述您的偏好' },
      ],
      clarificationQuestions: prefQuestions,
      parsedParams: mergedParams,
      showConfirmCard: false,
      questionAnswers: {},
      thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, destNameForPref, prefQuestions.length, 'supplement_preference'),
      progressSteps: [
        { id: 'parse', label: '已解析用户意图', detail: '补充偏好', status: 'completed' },
        { id: 'clarify', label: '正在询问偏好', detail: `${prefQuestions.length} 个偏好问题`, status: 'running' },
      ],
    });
    await this.nlConversationContextService.updateContext(ctx.sessionId, ctx.userId, { partialParams: mergedParams });
    const savedCtx = await this.nlConversationContextService.getContext(ctx.sessionId, ctx.userId);
    const lastMsg = savedCtx?.messages?.filter((m) => m.role === 'assistant').pop();
    this.logger.debug(`[补充偏好] 短路径返回 ${prefQuestions.length} 个偏好问题`);
    return {
      handled: true,
      result: successResponse({
        sessionId: ctx.sessionId,
        needsClarification: true,
        plannerResponseBlocks: [
          { type: 'paragraph', content: assistantReply },
          { type: 'highlight', highlightType: 'info', highlightText: '请选择或填写以下信息，也可直接文字描述您的偏好' },
        ],
        clarificationQuestions: prefQuestions,
        plannerReply: assistantReply,
        partialParams: this.normalizePartialParams(mergedParams),
        destination: detectedCountryCode,
        destinationName: destNameForPref,
        lastMessageId: lastMsg?.id,
        thinkingProcess: this.buildEvolvedThinkingContent(mergedParams, destNameForPref, prefQuestions.length, 'supplement_preference'),
        progressSteps: [
          { id: 'parse', label: '已解析用户意图', detail: '补充偏好', status: 'completed' },
          { id: 'clarify', label: '正在询问偏好', detail: `${prefQuestions.length} 个偏好问题`, status: 'running' },
        ],
      }),
    };
  }

  /**
   * 🆕 将 questionAnswers 的 value 映射为 options 中的中文 label，供「已收集所有答案」展示
   */
  private buildQuestionAnswerLabels(
    questionAnswers: Record<string, string | string[] | number | boolean | null>,
    clarificationQuestions: any[]
  ): Record<string, { value: string | string[]; label: string }> {
    const out: Record<string, { value: string | string[]; label: string }> = {};
    const getLabel = (opts: any[], val: any): string => {
      if (val == null) return '';
      const v = Array.isArray(val) ? val : [val];
      const parts: string[] = [];
      for (const item of v) {
        const s = String(item).trim();
        if (!opts?.length) {
          parts.push(s);
          continue;
        }
        const opt = opts.find((o: any) => {
          const oVal = (typeof o === 'string' ? o : o?.value ?? o?.label ?? '').toString().trim();
          return oVal === s;
        });
        parts.push(opt != null ? (typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? s)) : s);
      }
      return parts.join('、');
    };
    for (const q of clarificationQuestions || []) {
      const qid = q?.id;
      if (!qid) continue;
      const opts = Array.isArray(q.options) ? q.options : [];
      // 1) 标准：按 questionId 映射（前端若用 questionId 作为 key）
      if (opts.length && qid in questionAnswers) {
        const ans = questionAnswers[qid];
        const label = getLabel(opts, ans);
        if (label) out[qid] = { value: Array.isArray(ans) ? (ans as string[]) : String(ans), label };
      }
      // 2) 兼容：按 fieldName 映射（前端常用 fieldName 作为 key，例如 travelSeason/riskTolerance）
      const fieldName = q?.metadata?.fieldName;
      if (opts.length && fieldName && fieldName in questionAnswers && !(fieldName in out)) {
        const ans = questionAnswers[fieldName];
        const label = getLabel(opts, ans);
        if (label) out[fieldName] = { value: Array.isArray(ans) ? (ans as string[]) : String(ans), label };
      }
      for (const inp of (q.conditionalInputs as any[]) || []) {
        const pk = inp?.paramKey;
        const key = pk ? `${qid}_${pk}` : `${qid}_${(inp?.triggerValue || '').toString().trim()}`;
        if (key in questionAnswers) {
          const inOpts = Array.isArray(inp?.options) ? inp.options : [];
          const ans = questionAnswers[key];
          const label = inOpts.length ? getLabel(inOpts, ans) : String(ans ?? '');
          if (label) out[key] = { value: Array.isArray(ans) ? (ans as string[]) : String(ans), label };
        }
      }
    }
    // 兜底：使用内置映射（pref_accommodation、pref_dining、pref_pace 等）
    for (const [key, ans] of Object.entries(questionAnswers)) {
      if (key in out) continue;
      const builtin = TripsController.BUILTIN_VALUE_LABELS[key];
      if (builtin) {
        const v = Array.isArray(ans) ? ans : [ans];
        const labels = (v as string[]).map((x) => builtin[String(x).trim()] ?? x);
        if (labels.some((l) => l)) out[key] = { value: v.length === 1 ? String(v[0]) : (v as string[]), label: labels.join('、') };
      }
    }
    return out;
  }

  /**
   * 从会话中取最近一次助手下发的 Clarification DSL 编译上下文，供下一轮 {@link LlmService.naturalLanguageToTripParams} 注入。
   * 自尾向前扫描，命中第一条含 metadata.dslLlmPromptContext 的 assistant 消息。
   */
  private pickLatestDslLlmPromptContextFromMessages(
    messages?: Array<{ role?: string; metadata?: { dslLlmPromptContext?: string } }>,
  ): string | undefined {
    if (!messages?.length) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant') continue;
      const raw = m.metadata?.dslLlmPromptContext;
      if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
    }
    return undefined;
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
    /** 与 DSL 卡片同源的快充 pill 文案（唯一权威） */
    suggestedQuestions: string[];
    /** Compiler v0：供后续注入 NL / LLM 上下文的片段（当前仅 debug 日志） */
    dslLlmPromptContext?: string;
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
      // 🆕 修复：type 为 boolean 时若未配置 options，补充默认「是/否」选项，否则前端无法显示可点击按钮
      if (q.type === 'boolean' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)) {
        question.options = [
          { value: 'true', label: '是' },
          { value: 'false', label: '否' },
        ];
      } else if (q.options && Array.isArray(q.options)) {
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
      
      // 🆕 HCI优化：保留条件输入字段（支持 snake_case、paramKey、options）
      if (q.conditionalInputs && Array.isArray(q.conditionalInputs)) {
        question.conditionalInputs = q.conditionalInputs.map((input: any) => {
          const raw = { ...input, ...(input.trigger_value !== undefined && { triggerValue: input.trigger_value }), ...(input.input_type !== undefined && { inputType: input.input_type }), ...(input.param_key !== undefined && { paramKey: input.param_key }) };
          let inputType = (raw.inputType || raw.input_type || 'text').toString().trim();
          if (inputType === 'multiple_choice') inputType = 'multi_choice';
          return {
            triggerValue: (raw.triggerValue || raw.trigger_value || '').toString().trim(),
            inputType,
            label: (raw.label || '').toString().trim() || undefined,
            options: raw.options,
            placeholder: (raw.placeholder || '').toString().trim() || undefined,
            hint: (raw.hint || '').toString().trim() || undefined,
            required: raw.required !== undefined ? !!raw.required : true,
            validation: raw.validation,
            paramKey: (raw.paramKey || raw.param_key || '').toString().trim() || undefined,
          };
        });
      }
      
      // 🆕 HCI优化：标准化选项值（确保与conditionalInputs的triggerValue匹配）
      if (question.options && Array.isArray(question.options)) {
        question.options = question.options.map((opt: any) => {
          if (typeof opt === 'string') {
            return opt.trim(); // 标准化选项值
          }
          // 如果是对象格式，标准化value和label
          const normalizedOpt = {
            ...opt,
            value: (opt.value || opt.label || opt).toString().trim(),
            label: (opt.label || opt.value || opt).toString().trim(),
          };
          return normalizedOpt;
        });
      }
      
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

    // Clarification DSL Compiler v0：叙述与 pill 均来自 compileRoundClarification，不用 LLM 问题清单
    let dslLlmPromptContext: string | undefined;
    let suggestedQuestions: string[] = [];
    let textReply =
      structuredQuestions.length > 0
        ? ''
        : fallbackText || `让我来帮您完善${round.name || '行程'}的信息。`;

    if (structuredQuestions.length > 0) {
      const compiled = compileRoundClarification(round, structuredQuestions);
      textReply = compiled.transitionText;
      suggestedQuestions = compiled.suggestedPills;
      dslLlmPromptContext = compiled.llmPromptContext;
      this.logger.debug(`DSL Compiler LLM context:\n${compiled.llmPromptContext}`);
    }

    if (personaInfo) {
      textReply = `根据您的回答，我们识别您可能是：**${personaInfo.personaName}**。${textReply}`;
    }

    if (safetyCheckResult?.shouldWarn && !safetyCheckResult.shouldBlock) {
      textReply = `${safetyCheckResult.warningMessage}\n\n${textReply}`;
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
      suggestedQuestions,
      dslLlmPromptContext,
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
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request
  ) {
    try {
      // 优先: JWT user > X-Test-User-Id（测试脚本）> temp_${sessionId}
      let userId = user?.userId;
      if (!userId) {
        const testUserId = (req?.headers?.['x-test-user-id'] as string)?.trim();
        userId = testUserId || `temp_${sessionId}`;
        if (testUserId) this.logger.warn(`[测试模式] GET 使用 X-Test-User-Id: ${testUserId}`);
      }
      
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

      // 🆕 归一化 partialParams，使 preferences 与用户输入一致（qN_preferences → preferences）
      const normalized = {
        ...context,
        partialParams: context.partialParams ? this.normalizePartialParams(context.partialParams) : context.partialParams,
      };
      return successResponse(normalized);
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
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request
  ) {
    try {
      // 优先: JWT user > X-Test-User-Id（测试脚本）> temp_${sessionId}
      let userId = user?.userId;
      if (!userId) {
        const testUserId = (req?.headers?.['x-test-user-id'] as string)?.trim();
        userId = testUserId || `temp_${sessionId}`;
        if (testUserId) this.logger.warn(`[测试模式] PUT messages 使用 X-Test-User-Id: ${testUserId}`);
      }
      
      const message = await this.nlConversationContextService.updateMessageQuestionAnswers(
        sessionId,
        userId,
        messageId,
        body.questionAnswers
      );
      
      // 🆕 6.1 适配：点击「补充偏好信息」时仅发 PUT 不发 POST，在此返回偏好追问供前端渲染
      const qa = body.questionAnswers || {};
      const isSupplementChoice = (v: any) => {
        if (v == null) return false;
        const s = Array.isArray(v) ? (v[0] ?? '') : String(v);
        return /补充偏好|yes/i.test(s) && s.length <= 200;
      };
      // 匹配问题 id：supplement_preferences、supplementPreferences，或 LLM 生成的变体（如 q2_preferences）
      const suppKey = Object.keys(qa).find(
        k => /supplement_preferences|supplementPreferences|preferences_supplement|need_preferences/i.test(k)
      );
      const suppVal = suppKey ? qa[suppKey] : null;
      const hasSupplementByKey = suppKey && isSupplementChoice(suppVal);
      // 兜底：任一问答案包含「补充偏好」也触发（兼容 LLM 生成的不同 question id）
      const hasSupplementByValue = Object.values(qa).some(v => isSupplementChoice(v));
      let nextClarificationQuestions: any[] | undefined;
      if (hasSupplementByKey || hasSupplementByValue) {
        const ctx = await this.nlConversationContextService.getContext(sessionId, userId);
        const merged = { ...ctx?.partialParams };
        const destCode = merged?.destination ? this.extractCountryCode(merged.destination) : undefined;
        if (merged?.destination || merged?.startDate) {
          const prefQs = this.generatePreferenceSupplementQuestions(merged, destCode);
          if (prefQs.length > 0) {
            nextClarificationQuestions = prefQs;
            this.logger.debug(`[PUT 补充偏好] 返回 ${prefQs.length} 个偏好追问`);
          }
        }
      }
      // 🆕 6.1 适配：点击「其他需要修改」时，返回文本输入追问供用户描述调整内容（conditionalInput 可能未展开即提交）
      const confirmKey = Object.keys(qa).find(k => /confirm_inferred_info$/i.test(k));
      const confirmVal = confirmKey ? qa[confirmKey] : null;
      const otherKey = 'confirm_inferred_info_other';
      const hasOtherAnswer = otherKey in qa && qa[otherKey] != null && String(qa[otherKey]).trim() !== '';
      const isOtherModifyChoice = (v: any) => {
        if (v == null) return false;
        const s = Array.isArray(v) ? (v[0] ?? '') : String(v);
        return /其他需要修改|其他需要调整/i.test(s);
      };
      if (!nextClarificationQuestions && confirmKey && isOtherModifyChoice(confirmVal) && !hasOtherAnswer) {
        nextClarificationQuestions = [{
          id: otherKey,
          question: '请描述您想调整的内容',
          type: 'text',
          required: false,
          placeholder: '例如：出行时间改为3月、预算增加到2万',
          metadata: { category: 'confirmation', fieldName: 'confirmInferredOther' },
          group: 'required',
        }];
        this.logger.debug('[PUT 其他需要修改] 返回文本输入追问');
      }
      
      // 🆕 根据 clarificationQuestions 的 options 将 value 映射为中文 label，供「已收集所有答案」展示
      const qaFinal = message.metadata?.questionAnswers || {};
      const questions = (message.metadata?.clarificationQuestions as any[]) || [];
      const questionAnswerLabels = this.buildQuestionAnswerLabels(qaFinal, questions);
      if (Object.keys(questionAnswerLabels).length > 0) {
        // 持久化：便于会话恢复/确认卡片等场景直接用“用户所见 label”回显
        await this.nlConversationContextService.updateMessageMetadata(sessionId, userId, message.id, {
          questionAnswerLabels,
        });
      }
      
      // 🆕 点击「补充偏好信息」时，同时返回 plannerResponseBlocks 供前端渲染（与 POST 响应结构一致）
      const responsePayload: Record<string, any> = {
        messageId: message.id,
        questionAnswers: qaFinal,
        ...(Object.keys(questionAnswerLabels).length > 0 && { questionAnswerLabels }),
        ...(nextClarificationQuestions && { nextClarificationQuestions }),
      };
      if (nextClarificationQuestions && nextClarificationQuestions.length > 0) {
        responsePayload.plannerResponseBlocks = [
          { type: 'highlight', highlightType: 'info', highlightText: '请选择或填写以下信息，也可直接文字描述您的偏好' },
        ];
        responsePayload.needsClarification = true;
      }
      
      return successResponse(responsePayload);
    } catch (error: any) {
      // 如果消息不存在，记录警告而不是错误（可能是前端重复请求或使用了错误的ID）
      if (error.message.includes('不存在')) {
        this.logger.warn(`更新消息问题答案失败: ${error.message}`, error.stack);
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`更新消息问题答案失败: ${error.message}`, error.stack);
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
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const trip = await this.tripsService.update(id, dto, user?.userId);
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
    description: '获取行程的预算约束配置。如果未设置预算约束，会从准备度接口获取 budgetLevel 并提供默认预算建议。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'userId', description: '用户 ID（可选，用于从准备度接口获取 budgetLevel）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回预算约束',
    type: ApiSuccessResponseDto,
  })
  async getBudgetConstraint(
    @Param('id') id: string,
    @Query('userId') userId?: string,
    @CurrentUser() currentUser?: CurrentUserPayload
  ) {
    try {
      // 优先使用 currentUser，其次使用 query 参数
      const effectiveUserId = currentUser?.userId || userId;
      const constraint = await this.tripBudgetService.getBudgetConstraint(id, effectiveUserId);
      if (!constraint) {
        return successResponse({ budgetConstraint: null });
      }
      
      // 检查是否为推荐预算（非用户设置）
      const isRecommended = (constraint as any)._isRecommended === true;
      
      return successResponse({
        budgetConstraint: {
          ...constraint,
          _isRecommended: isRecommended, // 标记是否为推荐预算
        },
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
    @Query('startDate') _startDate?: string,
    @Query('endDate') _endDate?: string,
    @Query('category') _category?: string
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
    @Query('realtime') _realtime?: boolean
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

  @Post(':id/assess')
  @ApiOperation({
    summary: '评估行程每日安排是否合理',
    description: `对行程的每一天进行多维度评估，判断安排是否合理。

评估维度包括：
- **时间安排** (TIMING): 开始/结束时间是否合理，活动时间跨度
- **活动密度** (DENSITY): 活动数量和总时长是否适中
- **用餐安排** (MEALS): 是否安排了午餐和晚餐
- **体力负荷** (PHYSICAL): 疲劳指数、爬升高度、步行距离
- **交通效率** (TRANSPORT): 交通时间占比、长途移动次数
- **地理分布** (GEOGRAPHY): 路线是否顺畅、是否存在折返
- **缓冲时间** (BUFFER): 活动间缓冲是否充足

评估等级：
- EXCELLENT (90-100): 非常合理
- GOOD (75-89): 良好
- FAIR (60-74): 基本合理
- POOR (40-59): 存在问题
- BAD (0-39): 不合理`,
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: AssessTripRequestDto, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回评估结果（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async assessTrip(
    @Param('id') id: string,
    @Body() dto: AssessTripRequestDto = {}
  ) {
    try {
      const assessment = await this.tripMetricsService.assessTrip(id, dto);
      return successResponse(assessment);
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

  @Post(':id/conflicts/resolve')
  @ApiOperation({
    summary: '一键解决冲突列表',
    description: `自动检测并解决行程中的冲突。支持解决的冲突类型包括：
    - TIME_CONFLICT: 时间重叠（将后一个活动延后）
    - TRANSPORT_INSUFFICIENT: 交通时间不足（延后活动）
    - BUFFER_INSUFFICIENT: 缓冲时间不足（延后活动）
    - DUPLICATE_ITEM: 重复行程项（移除后出现的重复项）
    - CLOSURE_RISK: 闭园风险（将活动提前）
    
    不支持自动解决的冲突类型（需人工处理）：
    - FATIGUE_EXCEEDED: 体力超标
    - ACCESSIBILITY_MISMATCH: 无障碍设施不匹配`,
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: ResolveConflictsRequestDto })
  @ApiResponse({
    status: 200,
    description: '冲突解决结果（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async resolveConflicts(
    @Param('id') id: string,
    @Body() dto: ResolveConflictsRequestDto
  ) {
    try {
      const result = await this.tripConflictsService.resolveConflicts(id, dto);
      return successResponse(result);
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
      '新西兰': 'NZ',
      'New Zealand': 'NZ',
      'new zealand': 'NZ',
      'NZ': 'NZ',
      '大溪地': 'PF',
      'Tahiti': 'PF',
      'tahiti': 'PF',
      '法属波利尼西亚': 'PF',
      'French Polynesia': 'PF',
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
    const destStr = destination.trim();
    const countryNames: Record<string, string> = { 新西兰: 'NZ', 'New Zealand': 'NZ', 'new zealand': 'NZ', NZ: 'NZ', 冰岛: 'IS', 日本: 'JP', 基督城: 'NZ' };
    for (const [name, code] of Object.entries(countryNames)) {
      if (destStr.includes(name) || destStr.toLowerCase().includes(name.toLowerCase())) return code;
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
          fitness_level: (() => {
            const fl = parsedParams?._nlPersonalization?.fitnessLevel;
            if (fl === 'LOW' || fl === 'MEDIUM_LOW') return 'low';
            if (fl === 'MEDIUM_HIGH' || fl === 'HIGH') return 'high';
            const intensity = tripParams.preferences?.intensity;
            if (intensity === 'intense' || intensity === 'high') return 'high';
            if (intensity === 'relaxed' || intensity === 'low') return 'low';
            return 'medium';
          })(),
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

        // 5. 记录决策日志到反馈学习模块（四层飞轮 Layer 1，专利要求）
        if (this.feedbackEngineAdapter) {
          this.feedbackEngineAdapter.recordCreateTripDecisionLog({
            tripRunId: requestId,
            tripId,
            userInput,
            parsedParams: parsedParams || {},
            tripParams,
            decisionDraftId: decisionDraft.draft_id,
            decisionStepsCount: decisionDraft.decision_steps?.length ?? 0,
          }).catch((err: any) => {
            this.logger.warn(`记录创建行程决策日志失败: ${err?.message}`);
          });
        }
      } else {
        this.logger.warn(`行程 ${tripId} 不存在，无法关联决策草案`);
      }
    } catch (error: any) {
      this.logger.error(`后台生成决策草案失败 (tripId: ${tripId}): ${error.message}`, error.stack);
      // 不抛出错误，避免影响主流程
    }
  }

  private normalizeActivityPreferences(params: Record<string, any>): string[] {
    const rawValues = [
      params.activityPreferences,
      params.activityTypes,
      params.preferences?.activityPreferences,
      params.preferences?.activityTypes,
      params.preferences?.activityType,
    ];
    const values = rawValues.flatMap((value) => {
      if (!value) return [];
      return Array.isArray(value) ? value : [value];
    });
    const activityMap: Record<string, string> = {
      冰川徒步: 'glacier_hiking',
      冰川: 'glacier_hiking',
      冰洞探险: 'glacier_hiking',
      冰洞: 'glacier_hiking',
      glacier: 'glacier_hiking',
      'glacier walk': 'glacier_hiking',
      'ice cave': 'glacier_hiking',
      冒险活动: 'adventure_activities',
      冒险: 'adventure_activities',
      火山: 'adventure_activities',
      峡谷漂流: 'adventure_activities',
      峡谷: 'adventure_activities',
      漂流: 'adventure_activities',
      volcano: 'adventure_activities',
      canyon: 'adventure_activities',
      rafting: 'adventure_activities',
    };
    return [
      ...new Set(
        values
          .map((value) => String(value).trim())
          .filter(Boolean)
          .map((value) => activityMap[value] ?? activityMap[value.toLowerCase()] ?? value),
      ),
    ];
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

      // 方案 C 可选增强：候选编排前构建 Context Package，注入 LLM 以增强编排质量
      let contextBlocks: ContextBlock[] = [];
      if (this.contextEngineerService) {
        try {
          const contextPackage = await this.contextEngineerService.build(
            {
              tripId,
              phase: 'planning',
              agent: 'draft-orchestrator',
              userQuery: `编排${draftDto.destination}${draftDto.days}天行程，风格${draftDto.style || 'balanced'}`,
              requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY', 'WEATHER_WINDOWS'],
              includeToolSelection: false,
            },
            true,
          );
          if (contextPackage.blocks?.length) {
            contextBlocks = contextPackage.blocks.filter((b) => b.visibility === 'public');
            this.logger.debug(`为行程 ${tripId} 构建 Context Package: ${contextBlocks.length} 个块`);
          }
        } catch (err: any) {
          this.logger.warn(`构建 Context Package 失败（继续无上下文编排）: ${err?.message}`);
        }
      }

      // v2 (optional): solver skeleton pre-pass → inject as CONSTRAINTS block for orchestrator
      const useSolverDraftEngine =
        (this.configService?.get<string>('USE_SOLVER_DRAFT_ENGINE_FOR_NL_V2') || process.env.USE_SOLVER_DRAFT_ENGINE_FOR_NL_V2) === 'true';
      if (useSolverDraftEngine && this.solverService) {
        try {
          await this.updateGenerationProgress(tripId, {
            status: 'generating',
            stage: 'solving_skeleton',
            message: '正在进行物理可行骨架求解...',
          });
          const destCode = String(draftDto.destination ?? '').toUpperCase().trim();
          const destCfg = this.destinationClarificationConfigService
            ? await this.destinationClarificationConfigService.getConfig(destCode)
            : null;
          const skeleton = await this.solverService.solveSkeleton({
            destinationCode: destCode,
            days: draftDto.days,
            constraints: (destCfg as any)?.constraints,
            params: draftDto as any,
          });
          const nowIso = new Date().toISOString();
          contextBlocks = [
            ...contextBlocks,
            {
              key: `solver_skeleton_v0:${tripId}`,
              type: 'CONSTRAINTS',
              text: `Solver skeleton (v0) computed for ${destCode}, days=${draftDto.days}. Use it as hard feasibility scaffold; do not violate physical boundaries.`,
              data: { skeleton },
              priority: 95,
              visibility: 'public',
              provenance: { source: 'computed', identifier: 'SolverService.solveSkeleton', version: '0', timestamp: nowIso },
              dataSource: 'COMPUTED',
              lastVerifiedAt: nowIso,
            } as ContextBlock,
          ];
          this.logger.debug(`为行程 ${tripId} 注入 Solver skeleton block`);
        } catch (err: any) {
          this.logger.warn(`Solver skeleton 求解失败（继续走现有 draft 引擎）: ${err?.message}`);
        }
      }
      
      // 生成草案（包含 LLM 编排，可选注入上下文）
      // 🆕 deterministic seed：从 tripId 派生，确保可回放
      const seedFromTripId = (id: string): number => {
        // FNV-1a 32-bit
        let h = 0x811c9dc5;
        for (let i = 0; i < id.length; i++) {
          h ^= id.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
      };
      (draftDto as any).seed = seedFromTripId(tripId);
      const draft = await this.tripDraftService.generateDraft(
        draftDto,
        (progress) => this.updateGenerationProgress(tripId, progress),
        contextBlocks.length > 0 ? contextBlocks : undefined,
        { tripId, mode: 'BOOTSTRAP' },
      );
      
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

  @Post(':id/suggestions/:suggestionId/seen')
  @ApiOperation({
    summary: '标记建议已读',
    description: '将建议状态从 new 标记为 seen（不覆盖已应用/已忽略）。用于 AssistantCenter 初次展示后消除“new”角标。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'suggestionId', description: '建议 ID' })
  @ApiResponse({
    status: 200,
    description: '成功标记已读（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async markSuggestionSeen(
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string,
  ) {
    try {
      await this.tripSuggestionsService.markSuggestionSeen(id, suggestionId);
      return successResponse(null);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/suggestions/seen')
  @ApiOperation({
    summary: '批量标记建议已读',
    description: '批量将建议状态从 new 标记为 seen（不覆盖已应用/已忽略）。推荐用于 AssistantCenter 首次渲染后一次性上报。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        suggestionIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['suggestionIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功批量标记已读（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async markSuggestionsSeenBulk(
    @Param('id') id: string,
    @Body() body: { suggestionIds: string[] },
  ) {
    try {
      await this.tripSuggestionsService.markSuggestionsSeen(id, body?.suggestionIds || []);
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
