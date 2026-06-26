// src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts

/**
 * 规划助手智能体 V2 Service
 * 
 * 重新设计后的服务实现
 * 
 * 职责:
 * - 实现所有V2接口的业务逻辑
 * - 集成AI能力（意图识别、智能路由）
 * - 集成基础设施（任务服务、缓存、消息队列）
 * 
 * 参考文档:
 * - API_REDESIGN_IMPLEMENTATION_GUIDE.md - 实现指南
 * - API_REDESIGN_CODE_TEMPLATES.md - 代码模板
 */

import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanningAssistantService } from './planning-assistant.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';
import { PreferenceLearningService } from '../../shared/services/preference-learning.service';
import { PersonaLanguageService } from '../../shared/services/persona-language.service';
import { LlmService } from '../../../../llm/services/llm.service';
import { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import { SmartRouterService, RouterSessionState } from './smart-router.service';
import { McpToolDispatcherService } from './mcp-tool-dispatcher.service';
import { TaskService, TaskStatus } from '../../../infra/task.service';
import { CacheService } from '../../../../common/cache/cache.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { SessionNotFoundException, SessionExpiredException, DestinationRequiredException } from '../exceptions/planning-assistant.exceptions';
import { CreateSessionRequestDto } from '../dto/v2/create-session-request.dto';
import { CreateSessionResponseDto } from '../dto/v2/create-session-response.dto';
import { SessionStateResponseDto } from '../dto/v2/session-state-response.dto';
import { MessageHistoryResponseDto } from '../dto/v2/message-history-response.dto';
import { RecommendationsRequestDto } from '../dto/v2/recommendations-request.dto';
import { RecommendationsResponseDto } from '../dto/v2/recommendations-response.dto';
import { GeneratePlanRequestDto } from '../dto/v2/generate-plan-request.dto';
import { GeneratePlanResponseDto } from '../dto/v2/generate-plan-response.dto';
import { AsyncTaskResponseDto } from '../dto/v2/async-task-response.dto';
import { ComparePlansRequestDto } from '../dto/v2/compare-plans-request.dto';
import { ComparePlansResponseDto, ComparisonRecommendationDto } from '../dto/v2/compare-plans-response.dto';
import { OptimizePlanRequestDto } from '../dto/v2/optimize-plan-request.dto';
import { ConfirmPlanRequestDto } from '../dto/v2/confirm-plan-request.dto';
import { OptimizeTripRequestDto } from '../dto/v2/optimize-trip-request.dto';
import { RefineTripRequestDto } from '../dto/v2/refine-trip-request.dto';
import { TripSuggestionsResponseDto, TripSuggestionDto } from '../dto/v2/trip-suggestions-response.dto';
import { ChatRequestDto } from '../dto/v2/chat-request.dto';
import { ChatResponseDto } from '../dto/v2/chat-response.dto';
import { PlanCandidate, PlanningConversationState } from '../interfaces/planning-assistant.interface';
import { ComparisonDifferenceDto } from '../dto/v2/compare-plans-response.dto';
import { PlanCandidateDto, PersonaEvaluationDto } from '../dto/v2/shared/plan-candidate.dto';
import { AccommodationItemDto } from '../dto/v2/shared/accommodation-item.dto';
import { RailDirectService } from '../../../../mcp/rail-direct.service';
import { TransitousDirectService } from '../../../../mcp/transitous-direct.service';
import { AmadeusDirectService } from '../../../../mcp/amadeus-direct.service';
import { BookingComService } from '../../../../mcp/booking-com.service';
import { ItineraryItemsService } from '../../../../itinerary-items/itinerary-items.service';
import { ItemType } from '../../../../itinerary-items/dto/create-itinerary-item.dto';
import { DateTime } from 'luxon';
import { AgentService } from '../../../services/agent.service';
import { TripSuggestionsService } from '../../../../trips/services/trip-suggestions.service';
import {
  parseExplicitStayWindowFromUserMessage,
  parseExplicitHotelNightScopeIndices,
  countStayNightsBetweenInclusive,
  addDaysYmd,
} from '../../../utils/hotel-mcp-route-run.mapper';

@Injectable()
export class PlanningAssistantV2Service {
  private readonly logger = new Logger(PlanningAssistantV2Service.name);

  // 配置常量（从 ConfigService 获取，带默认值）
  private readonly sessionCacheTTL: number;
  private readonly sessionExpirationHours: number;
  
  // 性能监控：记录方法执行时间
  private readonly performanceMetrics: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();

  constructor(
    private readonly planningAssistantService: PlanningAssistantService,
    @Optional() @Inject(ConfigService) private readonly configService?: ConfigService,
    @Optional() private readonly coreGateway?: CoreGatewayService,
    @Optional() private readonly recommendationEngine?: RecommendationEngineService,
    @Optional() private readonly preferenceLearning?: PreferenceLearningService,
    @Optional() private readonly personaLanguage?: PersonaLanguageService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly smartRouter?: SmartRouterService,
    @Optional() private readonly mcpToolDispatcher?: McpToolDispatcherService,
    @Optional() private readonly taskService?: TaskService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly hotelDirectService?: any, // HotelDirectService
    @Optional() private readonly googleMapsDirectService?: any, // GoogleMapsDirectService
    @Optional() private readonly airbnbService?: any, // AirbnbService
    @Optional() private readonly restaurantDirectService?: any, // RestaurantDirectService
    @Optional() private readonly weatherDirectService?: any, // WeatherDirectService
    @Optional() private readonly exaService?: any, // ExaService
    @Optional() private readonly amadeusService?: any, // AmadeusService (MCP)
    @Optional() private readonly amadeusDirectService?: AmadeusDirectService,
    @Optional() private readonly translationDirectService?: any, // TranslationDirectService
    @Optional() private readonly currencyDirectService?: any, // CurrencyDirectService
    @Optional() private readonly imageDirectService?: any, // ImageDirectService
    @Optional() private readonly visionService?: any, // VisionService
    @Optional() private readonly railService?: any, // RailService (MCP, 需 OAuth)
    @Optional() @Inject(RailDirectService) private readonly railDirectService?: RailDirectService,
    @Optional() private readonly transitousDirectService?: TransitousDirectService,
    @Optional() @Inject(BookingComService) private readonly bookingComService?: BookingComService,
    @Optional() private readonly itineraryItemsService?: ItineraryItemsService,
    @Optional() private readonly agentService?: AgentService,
    @Optional() private readonly tripSuggestionsService?: TripSuggestionsService,
  ) {
    // 从配置服务获取值，如果没有配置服务则使用默认值
    this.sessionCacheTTL = this.configService?.get<number>('PLANNING_ASSISTANT.SESSION_CACHE_TTL', 86400) ?? 86400; // 24小时（秒）
    this.sessionExpirationHours = this.configService?.get<number>('PLANNING_ASSISTANT.SESSION_EXPIRATION_HOURS', 24) ?? 24; // 24小时
    
    this.logger.log('🚀 规划助手智能体 V2 Service 已初始化');
    this.logger.debug(`配置: sessionCacheTTL=${this.sessionCacheTTL}s, sessionExpirationHours=${this.sessionExpirationHours}h`);
    
    // 检查 MCP 服务注入状态
    this.logger.debug(`MCP 服务注入状态: HotelDirect=${!!this.hotelDirectService}, GoogleMaps=${!!this.googleMapsDirectService}, Airbnb=${!!this.airbnbService}, Restaurant=${!!this.restaurantDirectService}, Weather=${!!this.weatherDirectService}, RailDirect=${!!this.railDirectService}, Transitous=${!!this.transitousDirectService}, RailMCP=${!!this.railService}, BookingCom=${!!this.bookingComService}`);
    this.logger.debug(`工具融合服务注入状态: ToolDispatcher=${!!this.mcpToolDispatcher}, SmartRouter=${!!this.smartRouter}`);
    this.logger.debug(`方案 A 编排: AgentService=${!!this.agentService}（generate 时使用 route_and_run 返回 ui_state）`);
  }

  // ==================== 会话管理 ====================

  /**
   * 创建会话
   */
  async createSession(dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
    const startTime = Date.now();
    const traceId = randomUUID();
    
    this.logger.log({
      event: 'create_session_start',
      traceId,
      userId: dto.userId,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.debug(`创建会话: userId=${dto.userId}, traceId=${traceId}`);

    try {
      const sessionId = await this.planningAssistantService.createSession(dto.userId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.sessionExpirationHours * 60 * 60 * 1000);

      const response: CreateSessionResponseDto = {
        sessionId,
        userId: dto.userId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        context: dto.context ? {
          tripId: dto.context.tripId,
          destination: dto.context.destination,
        } : undefined,
      };

      // 缓存会话状态
      if (this.cacheService && sessionId) {
        await this.cacheService.set(`session:${sessionId}`, response, this.sessionCacheTTL).catch((error: any) => {
          this.logger.warn(`会话状态缓存失败: sessionId=${sessionId}`, error);
        });
      }

      const duration = Date.now() - startTime;
      this.recordPerformanceMetric('createSession', duration);
      
      this.logger.log({
        event: 'create_session_success',
        traceId,
        sessionId: response.sessionId,
        userId: dto.userId,
        duration,
        timestamp: new Date().toISOString(),
      });
      
      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.recordPerformanceMetric('createSession', duration);
      
      this.logger.error({
        event: 'create_session_error',
        traceId,
        userId: dto.userId,
        error: error.message,
        stack: error.stack,
        duration,
        timestamp: new Date().toISOString(),
      });
      
      throw new BadRequestException({
        success: false,
        errorCode: '1008',
        message: 'Failed to create session',
        messageCN: '创建会话失败',
        details: { error: error.message, traceId },
      });
    }
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string, requestingUserId?: string): Promise<SessionStateResponseDto> {
    this.logger.debug(`获取会话状态: sessionId=${sessionId}, requestingUserId=${requestingUserId}`);

    // 先从缓存获取
    if (this.cacheService && sessionId) {
      const cached = await this.cacheService.get<SessionStateResponseDto>(`session:${sessionId}`);
      if (cached) {
        // 验证资源所有权（如果提供了 requestingUserId）
        if (requestingUserId && cached.userId && cached.userId !== requestingUserId) {
          throw new ForbiddenException({
            success: false,
            errorCode: '2003',
            message: 'Access denied',
            messageCN: '无权访问此会话',
            details: { sessionId },
          });
        }
        this.logger.debug(`从缓存获取会话状态: sessionId=${sessionId}`);
        return cached;
      }
    }

    let state = await this.planningAssistantService.getSessionState(sessionId);
    
    // 如果会话不存在，且提供了 requestingUserId，自动创建会话
    if (!state && requestingUserId) {
      this.logger.debug(`会话不存在，自动创建: sessionId=${sessionId}, userId=${requestingUserId}`);
      try {
        await this.ensureSessionExists(sessionId, requestingUserId);
        state = await this.planningAssistantService.getSessionState(sessionId);
      } catch (error: any) {
        this.logger.warn(`自动创建会话失败: ${error.message}`);
      }
    }
    
    if (!state) {
      throw new SessionNotFoundException(sessionId);
    }

    // 验证资源所有权（如果提供了 requestingUserId）
    if (requestingUserId && state.userId && state.userId !== requestingUserId) {
      throw new ForbiddenException({
        success: false,
        errorCode: '2003',
        message: 'Access denied',
        messageCN: '无权访问此会话',
        details: { sessionId },
      });
    }

    // 检查是否过期
    const expiresAt = new Date(state.expiresAt);
    if (expiresAt < new Date()) {
      throw new SessionExpiredException(sessionId);
    }

    const result: SessionStateResponseDto = {
      sessionId: state.sessionId,
      userId: state.userId,
      phase: state.phase,
      preferences: state.preferences,
      recommendations: state.recommendations,
      selectedDestination: state.selectedDestination,
      planCandidates: state.planCandidates?.map(p => this.convertPlanCandidateToDto(p)),
      selectedPlanId: state.selectedPlanId,
      confirmedTripId: state.confirmedTripId,
      messageCount: state.messageHistory.length,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      expiresAt: state.expiresAt,
    };

    // 缓存结果（24小时）
    if (this.cacheService && sessionId) {
      await this.cacheService.set(`session:${sessionId}`, result, this.sessionCacheTTL).catch((error: any) => {
        this.logger.warn(`会话状态缓存失败: sessionId=${sessionId}`, error);
      });
    }

    return result;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string, requestingUserId?: string): Promise<void> {
    this.logger.debug(`删除会话: sessionId=${sessionId}, requestingUserId=${requestingUserId}`);

    const state = await this.planningAssistantService.getSessionState(sessionId);
    if (!state) {
      throw new SessionNotFoundException(sessionId);
    }

    // 验证资源所有权（如果提供了 requestingUserId）
    if (requestingUserId && state.userId && state.userId !== requestingUserId) {
      throw new ForbiddenException({
        success: false,
        errorCode: '2004',
        message: 'Access denied',
        messageCN: '无权删除此会话',
        details: { sessionId },
      });
    }

    // 实现删除逻辑
    // 删除会话（PlanningAssistantService使用内存存储，删除操作会自然过期）
    // 如果需要立即删除，可以通过内部方法实现
    // await (this.planningAssistantService as any).sessions?.delete(sessionId);
    if (this.cacheService && sessionId) {
      await this.cacheService.delete(`session:${sessionId}`).catch((error: any) => {
        this.logger.warn(`删除会话状态缓存失败: sessionId=${sessionId}`, error);
      });
    }
  }

  /**
   * 获取对话历史
   */
  async getMessageHistory(sessionId: string, limit = 50, offset = 0, requestingUserId?: string): Promise<MessageHistoryResponseDto> {
    this.logger.debug(`获取对话历史: sessionId=${sessionId}, limit=${limit}, offset=${offset}, requestingUserId=${requestingUserId}`);

    const state = await this.planningAssistantService.getSessionState(sessionId);
    if (!state) {
      throw new SessionNotFoundException(sessionId);
    }

    // 验证资源所有权（如果提供了 requestingUserId）
    if (requestingUserId && state.userId && state.userId !== requestingUserId) {
      throw new ForbiddenException({
        success: false,
        errorCode: '2005',
        message: 'Access denied',
        messageCN: '无权访问此会话的对话历史',
        details: { sessionId },
      });
    }

    const messages = state.messageHistory
      .slice(offset, offset + limit)
      .filter(msg => msg.role === 'user' || msg.role === 'assistant') // 过滤掉system消息
      .map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        intent: (msg as any).intent,
      }));

    return {
      messages,
      total: state.messageHistory.length,
      limit,
      offset,
    };
  }

  // ==================== 对话接口（主要入口） ====================

  /**
   * 智能对话（主要入口，AI增强，支持智能路由）
   */
  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    this.logger.debug(
      `[智能对话] 开始处理请求: sessionId=${dto.sessionId}, ` +
      `message="${dto.message.substring(0, 50)}...", ` +
      `language=${dto.language || 'auto'}, ` +
      `context.tripId=${dto.context?.tripId || 'none'}, ` +
      `context.countryCode=${dto.context?.countryCode || 'none'}`
    );

    // 规划工作台：若 tripId 存在但 countryCode 缺失，从行程 destination 推断
    if (dto.context?.tripId && !dto.context?.countryCode && this.prisma) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: dto.context.tripId },
          select: { destination: true },
        });
        if (trip?.destination) {
          const dest = String(trip.destination).trim().toUpperCase();
          const countryCode = dest.includes('_') ? dest.split('_')[0] : dest;
          if (countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode)) {
            dto.context = { ...dto.context, countryCode };
            this.logger.debug(`[规划工作台] 从行程 destination 推断 countryCode: ${trip.destination} -> ${countryCode}`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`无法从行程 ${dto.context.tripId} 推断 countryCode: ${err?.message}`);
      }
    }

    // 规划工作台场景校验：若 tripId 或 countryCode 任一存在，则两者都必需
    const isPlanningWorkbench = !!(dto.context?.tripId || dto.context?.countryCode);
    if (isPlanningWorkbench) {
      if (!dto.context?.tripId) {
        throw new BadRequestException({
          success: false,
          errorCode: '4001',
          message: 'tripId is required in planning workbench context',
          messageCN: '规划工作台场景下，tripId 是必需参数',
        });
      }
      if (!dto.context?.countryCode) {
        throw new BadRequestException({
          success: false,
          errorCode: '4002',
          message: 'countryCode is required in planning workbench context',
          messageCN: '规划工作台场景下，countryCode 是必需参数',
        });
      }
    }

    // 如果启用了自动路由，尝试智能路由
    if (dto.options?.autoRoute !== false && this.smartRouter) {
      try {
        // 获取会话状态（用于路由决策和上下文感知）
        let sessionState;
        let selectedDestination: string | undefined;
        let state: PlanningConversationState | null = null;
        if (dto.sessionId) {
          try {
            state = await this.planningAssistantService.getSessionState(dto.sessionId);
            if (state) {
              sessionState = {
                phase: state.phase,
                preferences: state.preferences,
                planCandidates: state.planCandidates?.map(p => ({ id: p.id })),
                selectedDestination: state.selectedDestination, // 添加已选定的目的地
                tripId: dto.context?.tripId, // 规划工作台：用户已有行程，应禁止推荐目的地
                countryCode: dto.context?.countryCode,
              };
              selectedDestination = state.selectedDestination;
              this.logger.debug(
                `[会话上下文] phase=${state.phase}, ` +
                `selectedDestination=${selectedDestination || 'none'}, ` +
                `preferences=${JSON.stringify(state.preferences || {}).substring(0, 100)}...`
              );

              // 日期澄清阶段：用户补充了出行日期，执行待定的铁路搜索
              if (state.phase === 'CLARIFYING_RAIL_DATES' && state.pendingRailSearch && (this.railDirectService || this.transitousDirectService || this.railService)) {
                const railDate = this.extractRailDepartureDate(dto.message);
                if (railDate) {
                  const railToUse = this.railDirectService?.isServiceAvailable?.()
                    ? this.railDirectService
                    : this.transitousDirectService?.isServiceAvailable?.()
                      ? this.transitousDirectService
                      : this.railService?.isServiceAvailable?.()
                        ? this.railService
                        : null;
                  if (railToUse) {
                    const { origin, destination } = state.pendingRailSearch.extractedParams;
                    try {
                      let railResult: any;
                      try {
                        railResult = await railToUse.searchRoutes({
                          origin,
                          destination,
                          date: railDate,
                          language: dto.language === 'zh' || this.isChineseMessage(dto.message) ? 'zh' : 'en',
                        });
                      } catch (primaryErr: any) {
                        if (this.transitousDirectService?.isServiceAvailable?.() && railToUse !== this.transitousDirectService) {
                          railResult = await this.transitousDirectService.searchRoutes({
                            origin,
                            destination,
                            date: railDate,
                            language: dto.language === 'zh' || this.isChineseMessage(dto.message) ? 'zh' : 'en',
                          });
                        } else {
                          throw primaryErr;
                        }
                      }
                      const routes = railResult?.routes || railResult?.journeys || [];
                      const enrichedRoutes = this.enrichRailRoutesWithActions(routes);
                      const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                      const messageCN = `我为您找到了${routes.length}条从${origin}到${destination}的铁路路线。`;
                      await this.updateSessionState(dto.sessionId, {
                        phase: 'RECOMMENDING',
                        pendingRailSearch: undefined,
                      });
                      await this.updateSessionAfterBusinessCall(dto.sessionId, {
                        message: dto.message,
                        response: messageCN,
                        phase: 'RECOMMENDING',
                      });
                      return {
                        message: `I found ${routes.length} rail route${routes.length !== 1 ? 's' : ''} from ${origin} to ${destination}.`,
                        messageCN,
                        reply: isChinese ? messageCN : `I found ${routes.length} rail routes.`,
                        replyCN: messageCN,
                        phase: 'RECOMMENDING',
                        sessionId: dto.sessionId,
                        railRoutes: enrichedRoutes,
                        routing: { target: 'rail', reason: 'Rail search', params: { origin, destination, date: railDate } },
                      };
                    } catch (err: any) {
                      this.logger.warn(`[日期澄清] 铁路搜索失败: ${err.message}`);
                      await this.updateSessionState(dto.sessionId, {
                        phase: 'RECOMMENDING',
                        pendingRailSearch: undefined,
                      });
                    }
                  }
                }
              }

              // 航班出发地澄清阶段：用户补充了出发地，执行待定的航班搜索
              if (state.phase === 'CLARIFYING_FLIGHT_ORIGIN' && state.pendingFlightSearch) {
                const flightService = this.amadeusDirectService?.isAvailable
                  ? this.amadeusDirectService
                  : this.amadeusService;
                const searchFn = flightService?.searchFlights ?? flightService?.searchFlightOffers;
                if (!flightService || !searchFn) {
                  this.logger.warn(`[出发地澄清] 航班服务不可用: amadeusDirect=${!!this.amadeusDirectService}, amadeusMCP=${!!this.amadeusService}`);
                  const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                  const errMsg = isChinese
                    ? '抱歉，航班搜索服务暂时不可用，请检查 Amadeus 配置后重试。'
                    : 'Sorry, flight search service is unavailable. Please check Amadeus configuration.';
                  await this.updateSessionState(dto.sessionId, {
                    phase: 'RECOMMENDING',
                    pendingFlightSearch: undefined,
                  });
                  return {
                    message: errMsg,
                    messageCN: errMsg,
                    reply: errMsg,
                    replyCN: errMsg,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    routing: { target: 'flight', reason: 'Flight service unavailable', params: {} },
                  };
                }
                const origin = this.extractOriginFromMessage(dto.message);
                  if (origin) {
                    const { destination, departureDate } = state.pendingFlightSearch.extractedParams;
                    try {
                      const searchParams = {
                        originLocationCode: origin,
                        destinationLocationCode: destination,
                        departureDate,
                        adults: 1,
                        max: 10,
                      };
                      const flightResult = await searchFn.call(flightService, searchParams);
                      const flights =
                        flightResult?.data ||
                        (flightResult?.content?.[0]?.type === 'text'
                          ? (() => {
                              try {
                                const parsed = JSON.parse(flightResult.content[0].text);
                                return parsed?.data || [];
                              } catch {
                                return [];
                              }
                            })()
                          : []);
                      const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                      const messageCN = `我为您找到了${flights.length}个航班选择。`;
                      const enrichedFlights = this.enrichFlightsWithActions(flights, origin, destination, departureDate);
                      await this.updateSessionState(dto.sessionId, {
                        phase: 'RECOMMENDING',
                        pendingFlightSearch: undefined,
                      });
                      await this.updateSessionAfterBusinessCall(dto.sessionId, {
                        message: dto.message,
                        response: messageCN,
                        phase: 'RECOMMENDING',
                      });
                      return {
                        message: `I found ${flights.length} flight${flights.length !== 1 ? 's' : ''} for you.`,
                        messageCN,
                        reply: isChinese ? messageCN : `I found ${flights.length} flights.`,
                        replyCN: messageCN,
                        phase: 'RECOMMENDING',
                        sessionId: dto.sessionId,
                        flights: enrichedFlights,
                        routing: { target: 'flight', reason: 'Flight search', params: { origin, destination, departureDate } },
                      };
                    } catch (flightErr: any) {
                      const { destination, departureDate } = state.pendingFlightSearch.extractedParams;
                      this.logger.warn(`[出发地澄清] 航班搜索失败: ${flightErr.message}, origin=${origin}, destination=${destination}, date=${departureDate}`);
                      await this.updateSessionState(dto.sessionId, {
                        phase: 'RECOMMENDING',
                        pendingFlightSearch: undefined,
                      });
                      const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                      const errMsg = isChinese
                        ? '抱歉，航班搜索暂时不可用，请稍后再试。'
                        : 'Sorry, flight search is temporarily unavailable. Please try again later.';
                      return {
                        message: errMsg,
                        messageCN: errMsg,
                        reply: errMsg,
                        replyCN: errMsg,
                        phase: 'RECOMMENDING',
                        sessionId: dto.sessionId,
                        routing: { target: 'flight', reason: 'Flight search failed', params: { origin, destination, departureDate } },
                      };
                    }
                  }
                }

              // 日期澄清阶段：用户补充了入住/退房日期或确认建议日期，执行待定的酒店搜索
              if (state.phase === 'CLARIFYING_HOTEL_DATES' && state.pendingHotelSearch && this.mcpToolDispatcher) {
                const refDate = state.pendingHotelSearch.extractedParams?.checkIn;
                let dates = this.extractDatesFromMessage(dto.message, refDate);
                if (!dates.checkIn || !dates.checkOut) {
                  const nlOnly = parseExplicitStayWindowFromUserMessage(dto.message, {});
                  if (nlOnly?.checkIn && nlOnly?.checkOut) dates = nlOnly;
                }
                // 若用户未提供新日期，但回复了确认且待定搜索中有建议日期，使用建议日期
                if (!dates.checkIn || !dates.checkOut) {
                  const suggested = state.pendingHotelSearch.extractedParams?.checkIn && state.pendingHotelSearch.extractedParams?.checkOut;
                  if (suggested && this.isDateConfirmation(dto.message)) {
                    dates = {
                      checkIn: state.pendingHotelSearch.extractedParams.checkIn,
                      checkOut: state.pendingHotelSearch.extractedParams.checkOut,
                    };
                    this.logger.debug(`[日期澄清] 用户确认使用建议日期: checkIn=${dates.checkIn}, checkOut=${dates.checkOut}`);
                  }
                }
                if (dates.checkIn && dates.checkOut) {
                  this.logger.debug(`[日期澄清] 从用户消息解析到日期: checkIn=${dates.checkIn}, checkOut=${dates.checkOut}`);
                  const mergedParams = {
                    ...state.pendingHotelSearch.extractedParams,
                    checkIn: dates.checkIn,
                    checkOut: dates.checkOut,
                    ...(dto.context?.tripId && { tripId: dto.context.tripId }),
                    ...(dto.context?.countryCode && { countryCode: dto.context.countryCode }),
                    language: state.pendingHotelSearch.extractedParams?.language || this.getLanguageForAccommodation(dto),
                  };
                  try {
                    const toolResult = await this.mcpToolDispatcher.executeTool('hotel', 'hotel.search', mergedParams);
                    await this.updateSessionState(dto.sessionId, {
                      phase: 'RECOMMENDING',
                      pendingHotelSearch: undefined,
                    });
                    const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                    return await this.formatToolResult(
                      { serviceName: 'hotel', toolName: 'hotel.search', displayName: '搜索酒店', description: '', parameters: [], examples: [], category: 'accommodation', authRequired: false },
                      toolResult,
                      dto,
                      { target: state.pendingHotelSearch.target, confidence: 0.9, reason: '', reasonCN: '', extractedParams: mergedParams },
                      isChinese
                    );
                  } catch (toolError: any) {
                    this.logger.warn(`[日期澄清] 酒店搜索执行失败: ${toolError.message}，清除待定状态`);
                    await this.updateSessionState(dto.sessionId, {
                      phase: 'RECOMMENDING',
                      pendingHotelSearch: undefined,
                    });
                    const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                    const errMsg = isChinese
                      ? '抱歉，酒店搜索暂时不可用，请稍后再试。'
                      : 'Sorry, hotel search is temporarily unavailable. Please try again later.';
                    return {
                      message: errMsg,
                      messageCN: errMsg,
                      reply: errMsg,
                      phase: 'RECOMMENDING',
                      sessionId: dto.sessionId,
                    };
                  }
                }
              }
            }
          } catch (error: any) {
            this.logger.debug(`[会话状态] 获取失败（可能不存在）: ${error.message}`);
          }
        } else {
          this.logger.debug(`[会话状态] 无 sessionId，使用新会话模式`);
        }

        // 规划工作台场景：无 session 时也传递 tripId，让路由知道用户已有行程（禁止推荐目的地）
        if (dto.context?.tripId && !sessionState) {
          sessionState = { tripId: dto.context.tripId, countryCode: dto.context.countryCode } as RouterSessionState;
        }

        // 执行智能路由（带工具选择）
        const routingStartTime = Date.now();
        const routingResult = await this.smartRouter.routeWithTools(dto.message, sessionState as RouterSessionState | undefined);
        const routingDuration = Date.now() - routingStartTime;
        
        this.logger.debug(
          `[智能路由] 路由完成: target=${routingResult.target}, ` +
          `confidence=${routingResult.confidence.toFixed(2)}, ` +
          `reasonCN=${routingResult.reasonCN || routingResult.reason}, ` +
          `duration=${routingDuration}ms, ` +
          `extractedParams=${JSON.stringify(routingResult.extractedParams || {}).substring(0, 100)}...`
        );
        
        // 如果会话中有已选定的目的地，且路由结果中没有明确的目的地，使用会话中的目的地
        if (selectedDestination && routingResult.extractedParams && !routingResult.extractedParams.destination) {
          routingResult.extractedParams.destination = selectedDestination;
          this.logger.debug(`[路由增强] 使用会话中的目的地: ${selectedDestination}`);
        }

        // 调试日志：检查工具选择结果
        this.logger.debug(
          `[路由结果] target=${routingResult.target}, ` +
          `hasSelectedTool=${!!routingResult.selectedTool}, ` +
          `hasToolSelection=${!!routingResult.toolSelection}, ` +
          `hasDispatcher=${!!this.mcpToolDispatcher}, ` +
          `selectedTool=${routingResult.selectedTool?.toolName || 'none'}`
        );
        
        // 如果选择了具体工具，使用工具分发器执行（rail 除外，rail 走专用 switch 分支）
        if (routingResult.selectedTool && routingResult.toolSelection && this.mcpToolDispatcher && routingResult.target !== 'rail') {
          this.logger.debug(`工具选择: ${routingResult.selectedTool.toolName}, confidence=${routingResult.toolSelection.confidence}`);
          
          try {
            await this.ensureSessionExists(dto.sessionId, dto.userId);
            const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
            
            // 合并参数：将 context 中的 tripId、countryCode、语言偏好 添加到工具参数中
            let toolParams: Record<string, any> = {
              ...routingResult.extractedParams,
              ...(dto.context?.tripId && { tripId: dto.context.tripId }),
              ...(dto.context?.countryCode && { countryCode: dto.context.countryCode }),
            };
            // 住宿类工具：按用户偏好国籍/语言传递，使返回数据以对应语言展示
            const isAccommodationTool = routingResult.selectedTool.toolName === 'hotel.search' ||
              routingResult.target === 'hotel' || routingResult.target === 'accommodation' || routingResult.target === 'airbnb';
            if (isAccommodationTool) {
              toolParams.language = this.getLanguageForAccommodation(dto);
            }

            // 酒店/住宿搜索：澄清日期；若有行程日期则附带建议。若 phase 已是 RECOMMENDING 且已有日期，则不再重复澄清（避免用户补充人数等后再次弹出）
            const isHotelTool = routingResult.selectedTool.toolName === 'hotel.search' ||
              (routingResult.target === 'hotel' || routingResult.target === 'accommodation' || routingResult.target === 'airbnb');
            if (isHotelTool) {
              const dates = await this.getHotelDatesFromContext(toolParams, dto);
              const hasDates = !!(dates.checkIn && dates.checkOut);
              const alreadyRecommended = sessionState?.phase === 'RECOMMENDING';
              if (hasDates && alreadyRecommended) {
                toolParams = { ...toolParams, checkIn: dates.checkIn, checkOut: dates.checkOut };
                const guestsFromMsg = this.extractGuestsFromMessage(dto.message);
                if (guestsFromMsg != null) toolParams = { ...toolParams, adults: guestsFromMsg, guests: guestsFromMsg };
                this.logger.debug(`[酒店搜索] phase=RECOMMENDING 且已有日期，跳过日期澄清，直接搜索`);
              } else if (hasDates) {
                toolParams = { ...toolParams, checkIn: dates.checkIn, checkOut: dates.checkOut };
              }
              if (!hasDates || !alreadyRecommended) {
              const hasSuggestedDates = hasDates;
              const clarificationMsg = hasSuggestedDates
                ? (isChinese
                  ? `您的行程是 ${this.formatDateForDisplay(dates.checkIn!, true)} 至 ${this.formatDateForDisplay(dates.checkOut!, true)}，是否用这几天查酒店？回复「好的」或「可以」确认，或直接说其他日期。`
                  : `Your trip is ${this.formatDateForDisplay(dates.checkIn!, false)} to ${this.formatDateForDisplay(dates.checkOut!, false)}. Shall I search hotels for these dates? Reply "yes" or "ok" to confirm, or specify different dates.`)
                : (isChinese
                  ? '好的，请问您计划哪天入住、哪天退房？有了日期可以帮您查价格和可订性。'
                  : 'When do you plan to check in and check out? I can check availability and prices with dates.');
              await this.updateSessionState(dto.sessionId, {
                phase: 'CLARIFYING_HOTEL_DATES',
                pendingHotelSearch: {
                  target: (routingResult.target as 'hotel' | 'accommodation' | 'airbnb') || 'hotel',
                  extractedParams: { ...toolParams },
                },
              });
              return {
                message: clarificationMsg,
                messageCN: clarificationMsg,
                reply: clarificationMsg,
                replyCN: clarificationMsg,
                phase: 'CLARIFYING_HOTEL_DATES',
                sessionId: dto.sessionId,
                clarificationNeeded: {
                  type: 'HOTEL_DATES',
                  message: clarificationMsg,
                  messageCN: clarificationMsg,
                  ...(hasSuggestedDates && { suggestedDates: { checkIn: dates.checkIn!, checkOut: dates.checkOut! } }),
                },
                routing: {
                  target: (routingResult.target || 'hotel') as any,
                  reason: routingResult.reason || 'Clarifying hotel dates',
                  params: toolParams as Record<string, any>,
                },
              };
              }
            }

            // 执行工具调用（带性能监控）
            const toolCallStartTime = Date.now();
            
            const toolResult = await this.mcpToolDispatcher.executeTool(
              routingResult.selectedTool.serviceName,
              routingResult.selectedTool.toolName,
              toolParams
            );
            const toolCallDuration = Date.now() - toolCallStartTime;
            
            // 记录性能指标
            this.recordPerformanceMetric(
              `tool.${routingResult.selectedTool.serviceName}.${routingResult.selectedTool.toolName}`,
              toolCallDuration
            );
            
            this.logger.debug(`工具调用完成: ${routingResult.selectedTool.toolName}, 耗时=${toolCallDuration}ms`);
            
            // 格式化工具结果
            return await this.formatToolResult(
              routingResult.selectedTool,
              toolResult,
              dto,
              routingResult,
              isChinese
            );
          } catch (toolError: any) {
            this.logger.error(`工具调用失败: ${toolError.message}`, toolError.stack);
            // 记录失败指标
            this.recordPerformanceMetric(
              `tool.${routingResult.selectedTool.serviceName}.${routingResult.selectedTool.toolName}.error`,
              0
            );
            // 回退到原有逻辑
          }
        }

        // 如果置信度足够高，路由到业务接口（降低阈值以提高触发率）
        if (routingResult.confidence >= 0.6 && routingResult.target !== 'chat') {
          this.logger.debug(`智能路由: ${routingResult.target} (confidence=${routingResult.confidence})`);

          try {
            // 确保会话存在（如果不存在则创建）
            await this.ensureSessionExists(dto.sessionId, dto.userId);

            let businessResult: any;

            // 检测是否为中文消息
            const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);

            switch (routingResult.target) {
              case 'recommendations': {
                // 路由到推荐接口
                const recParams: RecommendationsRequestDto = {
                  sessionId: dto.sessionId,
                  userId: dto.userId,
                  naturalLanguageDescription: dto.message,
                  ...routingResult.extractedParams,
                };
                businessResult = await this.getRecommendations(recParams);
                
                // 调试日志：检查推荐数据
                this.logger.debug(`推荐结果: count=${businessResult.recommendations?.length || 0}, hasData=${!!businessResult.recommendations}`);
                if (businessResult.recommendations && businessResult.recommendations.length > 0) {
                  this.logger.debug(`第一个推荐: ${JSON.stringify(businessResult.recommendations[0]).substring(0, 200)}...`);
                }
                
                const messageEN = `I found ${businessResult.recommendations?.length || 0} destination recommendations for you.`;
                const messageCN = `我为您找到了${businessResult.recommendations?.length || 0}个目的地推荐。`;
                
                // 更新会话状态：记录消息和推荐结果
                await this.updateSessionAfterBusinessCall(dto.sessionId, {
                  message: dto.message,
                  response: messageCN,
                  phase: 'RECOMMENDING',
                  recommendations: businessResult.recommendations || [],
                });
                
                // 确保推荐数据被包含在响应中
                const response: ChatResponseDto = {
                  message: messageEN,
                  messageCN: messageCN,
                  reply: isChinese ? messageCN : messageEN,
                  replyCN: messageCN,
                  phase: 'RECOMMENDING',
                  sessionId: dto.sessionId,
                  recommendations: businessResult.recommendations || [], // 包含推荐数据（确保不为undefined）
                  routing: {
                    target: routingResult.target,
                    reason: routingResult.reason || 'Routed to recommendations',
                    params: routingResult.extractedParams,
                  },
                };
                
                // 调试日志：验证响应结构
                this.logger.debug(`响应结构: hasRecommendations=${!!response.recommendations}, count=${response.recommendations?.length || 0}`);
                
                return response;
              }

              case 'optimize': {
                // 优化已有行程：需 tripId，调用 optimizeTrip
                const tripId = routingResult.extractedParams?.tripId || dto.context?.tripId;
                if (!tripId) {
                  const errMsg = isChinese ? '优化行程需要指定行程ID，请从行程详情页发起。' : 'Trip ID is required for optimization. Please start from the trip detail page.';
                  return {
                    message: errMsg,
                    messageCN: errMsg,
                    reply: errMsg,
                    replyCN: errMsg,
                    phase: 'ADJUSTING',
                    sessionId: dto.sessionId,
                    routing: { target: 'optimize', reason: 'Missing tripId', params: {} },
                  };
                }
                const optType = this.parseOptimizationTypeFromMessage(dto.message);
                const optDto: OptimizeTripRequestDto = {
                  tripId,
                  optimizationType: optType,
                  language: dto.language === 'zh' ? 'zh' : 'en',
                };
                try {
                  const optResult = await this.optimizeTrip(optDto, dto.userId);
                  const msgCN = '行程已优化完成。';
                  const msgEN = 'Trip optimization completed.';
                  return {
                    message: msgEN,
                    messageCN: msgCN,
                    reply: isChinese ? msgCN : msgEN,
                    replyCN: msgCN,
                    phase: 'ADJUSTING',
                    sessionId: dto.sessionId,
                    routing: { target: 'optimize', reason: 'Trip optimized', params: { tripId: optResult.tripId } },
                  };
                } catch (err: any) {
                  this.logger.warn(`[optimize] 优化失败: ${err?.message}`);
                  const errMsg = isChinese ? `优化失败：${err?.message || '未知错误'}` : `Optimization failed: ${err?.message || 'Unknown error'}`;
                  return {
                    message: errMsg,
                    messageCN: errMsg,
                    reply: errMsg,
                    replyCN: errMsg,
                    phase: 'ADJUSTING',
                    sessionId: dto.sessionId,
                    routing: { target: 'optimize', reason: 'Optimization failed', params: {} },
                  };
                }
              }

              case 'generate': {
                // 方案 A：优先使用 route_and_run 编排，返回 ui_state 和 orchestrationResult
                const genParams: GeneratePlanRequestDto = {
                  sessionId: dto.sessionId,
                  userId: dto.userId,
                  naturalLanguageDescription: dto.message,
                  ...routingResult.extractedParams,
                };
                if (this.agentService) {
                  try {
                    const routeAndRunResponse = await this.generatePlanViaRouteAndRun(
                      genParams,
                      dto.message,
                      dto.context?.tripId,
                    );
                    if (routeAndRunResponse) {
                      return routeAndRunResponse;
                    }
                  } catch (err: any) {
                    this.logger.warn(`[方案 A] route_and_run 失败，降级到 CoreGateway: ${err?.message}`);
                  }
                }
                // 降级：使用 CoreGateway.generatePlan
                businessResult = await this.generatePlan(genParams);
                const messageEN = `I generated ${businessResult.plans.length} travel plan(s) for you.`;
                const messageCN = `我为您生成了${businessResult.plans.length}个旅行方案。`;
                
                await this.updateSessionAfterBusinessCall(dto.sessionId, {
                  message: dto.message,
                  response: messageCN,
                  phase: 'COMPARING_PLANS',
                  planCandidates: businessResult.plans,
                });
                
                return {
                  message: messageEN,
                  messageCN: messageCN,
                  reply: isChinese ? messageCN : messageEN,
                  replyCN: messageCN,
                  phase: 'COMPARING_PLANS',
                  sessionId: dto.sessionId,
                  plans: businessResult.plans,
                  routing: {
                    target: routingResult.target,
                    reason: routingResult.reason || 'Routed to plan generation',
                    params: routingResult.extractedParams,
                  },
                };
              }

              case 'compare': {
                // 路由到方案对比接口
                if (routingResult.extractedParams?.planIds && routingResult.extractedParams.planIds.length >= 2) {
                  const compareParams: ComparePlansRequestDto = {
                    sessionId: dto.sessionId,
                    planIds: routingResult.extractedParams.planIds,
                  };
                  businessResult = await this.comparePlans(compareParams);
                  const messageEN = `I compared ${businessResult.plans.length} plans for you.`;
                  const messageCN = `我为您对比了${businessResult.plans.length}个方案。`;
                  
                  // 更新会话状态：记录消息
                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'COMPARING_PLANS',
                  });
                  
                  return {
                    message: messageEN,
                    messageCN: messageCN,
                    reply: isChinese ? messageCN : messageEN,
                    replyCN: messageCN,
                    phase: 'COMPARING_PLANS',
                    sessionId: dto.sessionId,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to plan comparison',
                      params: routingResult.extractedParams,
                    },
                  };
                }
                // 如果方案ID不足，继续使用对话接口
                break;
              }

              case 'hotel': {
                // 酒店搜索：优先使用 Airbnb，如果 Airbnb 不可用或结果为空，再降级到 HotelDirectService
                try {
                  // 日期澄清：始终澄清；若有行程日期则附带建议，用户可确认或修改
                  const hotelParams: Record<string, any> = {
                    ...routingResult.extractedParams,
                    ...(dto.context?.tripId && { tripId: dto.context.tripId }),
                    ...(dto.context?.countryCode && { countryCode: dto.context.countryCode }),
                    language: this.getLanguageForAccommodation(dto),
                  };
                  const dates = await this.getHotelDatesFromContext(hotelParams, dto);
                  const hasSuggestedDates = !!(dates.checkIn && dates.checkOut);
                  if (hasSuggestedDates) {
                    hotelParams.checkIn = dates.checkIn;
                    hotelParams.checkOut = dates.checkOut;
                  }
                  const clarificationMsg = hasSuggestedDates
                    ? (isChinese
                      ? `您的行程是 ${this.formatDateForDisplay(dates.checkIn!, true)} 至 ${this.formatDateForDisplay(dates.checkOut!, true)}，是否用这几天查酒店？回复「好的」或「可以」确认，或直接说其他日期。`
                      : `Your trip is ${this.formatDateForDisplay(dates.checkIn!, false)} to ${this.formatDateForDisplay(dates.checkOut!, false)}. Shall I search hotels for these dates? Reply "yes" or "ok" to confirm, or specify different dates.`)
                    : (isChinese
                      ? '好的，请问您计划哪天入住、哪天退房？有了日期可以帮您查价格和可订性。'
                      : 'When do you plan to check in and check out? I can check availability and prices with dates.');
                  await this.updateSessionState(dto.sessionId, {
                    phase: 'CLARIFYING_HOTEL_DATES',
                    pendingHotelSearch: {
                      target: 'hotel',
                      extractedParams: hotelParams,
                    },
                  });
                  return {
                    message: clarificationMsg,
                    messageCN: clarificationMsg,
                    reply: clarificationMsg,
                    replyCN: clarificationMsg,
                    phase: 'CLARIFYING_HOTEL_DATES',
                    sessionId: dto.sessionId,
                    clarificationNeeded: {
                      type: 'HOTEL_DATES',
                      message: clarificationMsg,
                      messageCN: clarificationMsg,
                      ...(hasSuggestedDates && { suggestedDates: { checkIn: dates.checkIn!, checkOut: dates.checkOut! } }),
                    },
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Clarifying hotel dates',
                      params: hotelParams,
                    },
                  };
                } catch (hotelError: any) {
                  this.logger.error(`酒店搜索失败: ${hotelError.message}`, hotelError.stack);
                  break;
                }
              }

              case 'airbnb': {
                // 🆕 Airbnb/民宿搜索
                if (!this.airbnbService) {
                  this.logger.warn('AirbnbService not available, falling back to chat');
                  break;
                }

                try {
                  // 日期澄清：始终澄清；若有行程日期则附带建议，用户可确认或修改
                  const airbnbParams: Record<string, any> = {
                    ...routingResult.extractedParams,
                    ...(dto.context?.tripId && { tripId: dto.context.tripId }),
                    ...(dto.context?.countryCode && { countryCode: dto.context.countryCode }),
                    language: this.getLanguageForAccommodation(dto),
                  };
                  const airbnbDates = await this.getHotelDatesFromContext(airbnbParams, dto);
                  const hasSuggestedDates = !!(airbnbDates.checkIn && airbnbDates.checkOut);
                  if (hasSuggestedDates) {
                    airbnbParams.checkIn = airbnbDates.checkIn;
                    airbnbParams.checkOut = airbnbDates.checkOut;
                  }
                  const clarificationMsg = hasSuggestedDates
                    ? (isChinese
                      ? `您的行程是 ${this.formatDateForDisplay(airbnbDates.checkIn!, true)} 至 ${this.formatDateForDisplay(airbnbDates.checkOut!, true)}，是否用这几天查民宿？回复「好的」或「可以」确认，或直接说其他日期。`
                      : `Your trip is ${this.formatDateForDisplay(airbnbDates.checkIn!, false)} to ${this.formatDateForDisplay(airbnbDates.checkOut!, false)}. Shall I search Airbnb for these dates? Reply "yes" or "ok" to confirm, or specify different dates.`)
                    : (isChinese
                      ? '好的，请问您计划哪天入住、哪天退房？有了日期可以帮您查价格和可订性。'
                      : 'When do you plan to check in and check out? I can check availability and prices with dates.');
                  await this.updateSessionState(dto.sessionId, {
                    phase: 'CLARIFYING_HOTEL_DATES',
                    pendingHotelSearch: {
                      target: 'airbnb',
                      extractedParams: airbnbParams,
                    },
                  });
                  return {
                    message: clarificationMsg,
                    messageCN: clarificationMsg,
                    reply: clarificationMsg,
                    replyCN: clarificationMsg,
                    phase: 'CLARIFYING_HOTEL_DATES',
                    sessionId: dto.sessionId,
                    clarificationNeeded: {
                      type: 'HOTEL_DATES',
                      message: clarificationMsg,
                      messageCN: clarificationMsg,
                      ...(hasSuggestedDates && { suggestedDates: { checkIn: airbnbDates.checkIn!, checkOut: airbnbDates.checkOut! } }),
                    },
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Clarifying hotel dates',
                      params: airbnbParams,
                    },
                  };
                } catch (airbnbError: any) {
                  this.logger.error(`Airbnb搜索失败: ${airbnbError.message}`, airbnbError.stack);
                  break;
                }
              }

              case 'accommodation': {
                // 🆕 住宿搜索（酒店 + Airbnb）
                try {
                  // 日期澄清：始终澄清；若有行程日期则附带建议，用户可确认或修改
                  const accParams: Record<string, any> = {
                    ...routingResult.extractedParams,
                    ...(dto.context?.tripId && { tripId: dto.context.tripId }),
                    ...(dto.context?.countryCode && { countryCode: dto.context.countryCode }),
                    language: this.getLanguageForAccommodation(dto),
                  };
                  const accDates = await this.getHotelDatesFromContext(accParams, dto);
                  const hasSuggestedDates = !!(accDates.checkIn && accDates.checkOut);
                  if (hasSuggestedDates) {
                    accParams.checkIn = accDates.checkIn;
                    accParams.checkOut = accDates.checkOut;
                  }
                  const clarificationMsg = hasSuggestedDates
                    ? (isChinese
                      ? `您的行程是 ${this.formatDateForDisplay(accDates.checkIn!, true)} 至 ${this.formatDateForDisplay(accDates.checkOut!, true)}，是否用这几天查住宿？回复「好的」或「可以」确认，或直接说其他日期。`
                      : `Your trip is ${this.formatDateForDisplay(accDates.checkIn!, false)} to ${this.formatDateForDisplay(accDates.checkOut!, false)}. Shall I search accommodations for these dates? Reply "yes" or "ok" to confirm, or specify different dates.`)
                    : (isChinese
                      ? '好的，请问您计划哪天入住、哪天退房？有了日期可以帮您查价格和可订性。'
                      : 'When do you plan to check in and check out? I can check availability and prices with dates.');
                  await this.updateSessionState(dto.sessionId, {
                    phase: 'CLARIFYING_HOTEL_DATES',
                    pendingHotelSearch: {
                      target: 'accommodation',
                      extractedParams: accParams,
                    },
                  });
                  return {
                    message: clarificationMsg,
                    messageCN: clarificationMsg,
                    reply: clarificationMsg,
                    replyCN: clarificationMsg,
                    phase: 'CLARIFYING_HOTEL_DATES',
                    sessionId: dto.sessionId,
                    clarificationNeeded: {
                      type: 'HOTEL_DATES',
                      message: clarificationMsg,
                      messageCN: clarificationMsg,
                      ...(hasSuggestedDates && { suggestedDates: { checkIn: accDates.checkIn!, checkOut: accDates.checkOut! } }),
                    },
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Clarifying hotel dates',
                      params: accParams,
                    },
                  };
                } catch (accommodationError: any) {
                  this.logger.error(`住宿搜索失败: ${accommodationError.message}`, accommodationError.stack);
                  break;
                }
              }

              case 'restaurant': {
                // 🆕 餐厅搜索
                if (!this.restaurantDirectService) {
                  this.logger.warn('RestaurantDirectService not available, falling back to chat');
                  break;
                }

                try {
                  let location = routingResult.extractedParams?.location;
                  const destination = routingResult.extractedParams?.destination || dto.message;

                  // 地理编码
                  if (!location && destination && this.googleMapsDirectService) {
                    try {
                      const geocodeResult = await this.googleMapsDirectService.geocode({
                        address: destination,
                        language: isChinese ? 'zh' : 'en',
                      });
                      if (geocodeResult?.data?.results && geocodeResult.data.results.length > 0) {
                        const firstResult = geocodeResult.data.results[0];
                        location = {
                          lat: firstResult.geometry.location.lat,
                          lng: firstResult.geometry.location.lng,
                        };
                      }
                    } catch (geocodeError: any) {
                      this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                    }
                  }

                  if (!location) {
                    throw new Error('无法确定搜索位置');
                  }

                  // 调用餐厅搜索服务
                  const restaurantResult = await this.restaurantDirectService.searchRestaurants({
                    query: destination || 'restaurant',
                    location,
                    radius: 5000,
                    language: isChinese ? 'zh' : 'en',
                    minRating: 3.5,
                  });

                  const restaurants = (restaurantResult?.results || []).slice(0, 10);
                  const messageCN = `我为您找到了${restaurants.length}家餐厅。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `I found ${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''} for you.`,
                    messageCN,
                    reply: isChinese ? messageCN : `I found ${restaurants.length} restaurants.`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    restaurants: restaurants.map((r: any) => ({
                      placeId: r.placeId,
                      name: r.name,
                      address: r.address,
                      location: r.location,
                      rating: r.rating,
                      userRatingsTotal: r.userRatingsTotal,
                      priceLevel: r.priceLevel,
                      types: r.types,
                    })),
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to restaurant search',
                    },
                  };
                } catch (restaurantError: any) {
                  this.logger.error(`餐厅搜索失败: ${restaurantError.message}`, restaurantError.stack);
                  break;
                }
              }

              case 'weather': {
                // 🆕 天气查询
                if (!this.weatherDirectService) {
                  this.logger.warn('WeatherDirectService not available, falling back to chat');
                  break;
                }

                try {
                  const destination = routingResult.extractedParams?.destination || dto.message;
                  
                  // 调用天气查询服务
                  const weatherResult = await this.weatherDirectService.getCurrentWeather({
                    city: destination,
                    language: isChinese ? 'zh' : 'en',
                  });

                  const messageCN = `${destination}的天气：${weatherResult.condition}，温度 ${weatherResult.temperature}°C。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `Weather in ${destination}: ${weatherResult.condition}, ${weatherResult.temperature}°C.`,
                    messageCN,
                    reply: isChinese ? messageCN : `Weather: ${weatherResult.condition}, ${weatherResult.temperature}°C.`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    weather: weatherResult,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to weather query',
                    },
                  };
                } catch (weatherError: any) {
                  this.logger.error(`天气查询失败: ${weatherError.message}`, weatherError.stack);
                  break;
                }
              }

              case 'search': {
                // 🆕 Web搜索（Exa MCP）
                if (!this.exaService) {
                  this.logger.warn('ExaService not available, falling back to chat');
                  break;
                }

                try {
                  const query = routingResult.extractedParams?.query || dto.message;
                  
                  // 调用 Exa Web 搜索
                  const searchResult = await this.exaService.webSearch({
                    query,
                    numResults: 10,
                  });

                  const results = searchResult?.results || [];
                  const messageCN = `我为您找到了${results.length}条相关信息。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `I found ${results.length} search result${results.length !== 1 ? 's' : ''} for you.`,
                    messageCN,
                    reply: isChinese ? messageCN : `I found ${results.length} results.`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    searchResults: results,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to web search',
                    },
                  };
                } catch (searchError: any) {
                  this.logger.error(`Web搜索失败: ${searchError.message}`, searchError.stack);
                  break;
                }
              }

              case 'flight': {
                // 航班搜索：优先 AmadeusDirectService（直接 API），fallback 到 Amadeus MCP
                const flightService = this.amadeusDirectService?.isAvailable
                  ? this.amadeusDirectService
                  : this.amadeusService;
                if (!flightService) {
                  this.logger.warn('No flight service available (AmadeusDirect or Amadeus MCP), falling back to chat');
                  break;
                }

                try {
                  const origin = routingResult.extractedParams?.origin || '';
                  let destination = routingResult.extractedParams?.destination || '';
                  // 从行程上下文推断目的地（如 countryCode=IS → KEF）
                  if (!destination && dto.context?.countryCode) {
                    destination = this.getMainAirportFromCountryCode(dto.context.countryCode);
                    this.logger.debug(`[航班] 从行程上下文推断目的地: countryCode=${dto.context.countryCode} -> ${destination}`);
                  }
                  // 从行程获取出发日期
                  let departureDate = routingResult.extractedParams?.departureDate || '';
                  if (!departureDate && dto.context?.tripId && this.prisma) {
                    try {
                      const trip = await this.prisma.trip.findUnique({
                        where: { id: dto.context.tripId },
                        select: { startDate: true },
                      });
                      if (trip?.startDate) {
                        departureDate = new Date(trip.startDate).toISOString().split('T')[0];
                        this.logger.debug(`[航班] 从行程获取出发日期: ${departureDate}`);
                      }
                    } catch (_) {}
                  }
                  if (!departureDate) {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    departureDate = d.toISOString().split('T')[0];
                  }

                  if (!origin || !destination) {
                    // 有目的地但缺出发地：进入澄清阶段，询问出发地
                    if (destination && !origin) {
                      const destName = this.getCountryNameFromCodeForFlight(dto.context?.countryCode || '') || destination;
                      const clarificationMsg = isChinese
                        ? `请问您从哪里出发？目的地已根据您的行程设为${destName}(${destination})。`
                        : `Where are you departing from? Destination is set to ${destName} (${destination}) based on your trip.`;
                      await this.updateSessionState(dto.sessionId, {
                        phase: 'CLARIFYING_FLIGHT_ORIGIN',
                        pendingFlightSearch: {
                          target: 'flight',
                          extractedParams: { destination, departureDate },
                        },
                      });
                      return {
                        message: clarificationMsg,
                        messageCN: clarificationMsg,
                        reply: clarificationMsg,
                        replyCN: clarificationMsg,
                        phase: 'CLARIFYING_FLIGHT_ORIGIN',
                        sessionId: dto.sessionId,
                        clarificationNeeded: {
                          type: 'FLIGHT_ORIGIN',
                          message: clarificationMsg,
                          messageCN: clarificationMsg,
                          destination,
                          destinationName: destName,
                        },
                        routing: {
                          target: routingResult.target,
                          reason: routingResult.reason || 'Clarifying flight origin',
                        },
                      };
                    }
                    // 两者都缺
                    throw new Error('请提供出发地和目的地（例如：从北京到上海的航班）');
                  }

                  const searchParams = {
                    originLocationCode: origin,
                    destinationLocationCode: destination,
                    departureDate,
                    adults: 1,
                    max: 10,
                  };
                  const flightResult = await (flightService.searchFlights ?? flightService.searchFlightOffers)?.(
                    searchParams
                  );

                  const flights =
                    flightResult?.data ||
                    (flightResult?.content?.[0]?.type === 'text'
                      ? (() => {
                          try {
                            const parsed = JSON.parse(flightResult.content[0].text);
                            return parsed?.data || [];
                          } catch {
                            return [];
                          }
                        })()
                      : []);
                  const enrichedFlights = this.enrichFlightsWithActions(flights, origin, destination, departureDate);
                  const messageCN = `我为您找到了${flights.length}个航班选择。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `I found ${flights.length} flight${flights.length !== 1 ? 's' : ''} for you.`,
                    messageCN,
                    reply: isChinese ? messageCN : `I found ${flights.length} flights.`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    flights: enrichedFlights,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to flight search',
                    },
                  };
                } catch (flightError: any) {
                  this.logger.error(`航班搜索失败: ${flightError.message}`, flightError.stack);
                  break;
                }
              }

              case 'translate': {
                // 🆕 翻译服务
                if (!this.translationDirectService) {
                  this.logger.warn('TranslationDirectService not available, falling back to chat');
                  break;
                }

                try {
                  const text = routingResult.extractedParams?.text || dto.message;
                  const sourceLanguage = routingResult.extractedParams?.sourceLanguage || 'auto';
                  const targetLanguage = routingResult.extractedParams?.targetLanguage || (isChinese ? 'zh' : 'en');
                  
                  // 调用翻译服务
                  const translateResult = await this.translationDirectService.translate({
                    text,
                    source: sourceLanguage,
                    target: targetLanguage,
                  });

                  const messageCN = `翻译结果：${translateResult.text}`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `Translation: ${translateResult.text}`,
                    messageCN,
                    reply: isChinese ? messageCN : `Translation: ${translateResult.text}`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    translation: translateResult,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to translation',
                    },
                  };
                } catch (translateError: any) {
                  this.logger.error(`翻译失败: ${translateError.message}`, translateError.stack);
                  break;
                }
              }

              case 'currency': {
                // 🆕 货币转换
                if (!this.currencyDirectService) {
                  this.logger.warn('CurrencyDirectService not available, falling back to chat');
                  break;
                }

                try {
                  const amount = routingResult.extractedParams?.amount || 1;
                  const fromCurrency = routingResult.extractedParams?.fromCurrency || 'USD';
                  const toCurrency = routingResult.extractedParams?.toCurrency || 'CNY';
                  
                  // 调用货币转换服务
                  const convertResult = await this.currencyDirectService.convert({
                    amount,
                    from: fromCurrency,
                    to: toCurrency,
                  });

                  const messageCN = `${amount} ${fromCurrency} = ${convertResult.result} ${toCurrency}`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `${amount} ${fromCurrency} = ${convertResult.result} ${toCurrency}`,
                    messageCN,
                    reply: isChinese ? messageCN : `${amount} ${fromCurrency} = ${convertResult.result} ${toCurrency}`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    currencyConversion: convertResult,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to currency conversion',
                    },
                  };
                } catch (currencyError: any) {
                  this.logger.error(`货币转换失败: ${currencyError.message}`, currencyError.stack);
                  break;
                }
              }

              case 'image': {
                // 🆕 图片搜索
                if (!this.imageDirectService) {
                  this.logger.warn('ImageDirectService not available, falling back to chat');
                  break;
                }

                try {
                  const query = routingResult.extractedParams?.query || dto.message;
                  
                  // 调用图片搜索服务
                  const imageResult = await this.imageDirectService.search({
                    query,
                    perPage: 10,
                  });

                  const images = imageResult?.results || [];
                  const messageCN = `我为您找到了${images.length}张相关图片。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `I found ${images.length} image${images.length !== 1 ? 's' : ''} for you.`,
                    messageCN,
                    reply: isChinese ? messageCN : `I found ${images.length} images.`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    images,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to image search',
                    },
                  };
                } catch (imageError: any) {
                  this.logger.error(`图片搜索失败: ${imageError.message}`, imageError.stack);
                  break;
                }
              }

              case 'rail': {
                // 从用户消息中提取出发地、目的地和日期
                const origin = routingResult.extractedParams?.origin || '';
                const destination = routingResult.extractedParams?.destination || '';
                const date = routingResult.extractedParams?.date || '';

                if (!origin || !destination) {
                  return {
                    message: 'Please provide origin and destination (e.g., "trains from Paris to London")',
                    messageCN: '请提供出发地和目的地，例如：「查询从巴黎到伦敦的火车」',
                    reply: isChinese ? '请提供出发地和目的地，例如：查询从巴黎到伦敦的火车' : 'Please provide origin and destination.',
                    replyCN: '请提供出发地和目的地，例如：查询从巴黎到伦敦的火车',
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    routing: {
                      target: routingResult.target,
                      reason: '需要出发地和目的地',
                    },
                  };
                }

                // 未提供出行日期时，追问用户
                if (!date) {
                  const promptCN = `请提供出行日期或时间，例如：「明天」「3月15日」「明天下午」这样我可以为您查询更准确的班次。`;
                  const promptEN = 'Please provide your travel date or time (e.g., "tomorrow", "March 15", "tomorrow afternoon") so I can find more accurate schedules.';
                  await this.updateSessionState(dto.sessionId, {
                    phase: 'CLARIFYING_RAIL_DATES',
                    pendingRailSearch: {
                      target: 'rail',
                      extractedParams: { origin, destination, naturalLanguage: dto.message },
                    },
                  });
                  return {
                    message: promptEN,
                    messageCN: promptCN,
                    reply: isChinese ? promptCN : promptEN,
                    replyCN: promptCN,
                    phase: 'CLARIFYING_RAIL_DATES',
                    sessionId: dto.sessionId,
                    routing: { target: 'rail', reason: 'Awaiting travel date', params: { origin, destination } },
                    suggestedActions: [
                      { action: 'rail_date-tomorrow', label: 'Tomorrow', labelCN: '明天' },
                      { action: 'rail_date-day-after', label: 'Day after tomorrow', labelCN: '后天' },
                    ],
                  };
                }

                // 优先使用 RailDirectService（无需 OAuth），失败时回退到 Rail MCP
                const railToUse = this.railDirectService?.isServiceAvailable?.()
                  ? this.railDirectService
                  : this.railService?.isServiceAvailable?.()
                    ? this.railService
                    : null;

                if (!railToUse) {
                  this.logger.warn('No rail service available');
                  return {
                    message: 'Rail service is not available. Rail Direct API (no auth) or Rail MCP (OAuth) required.',
                    messageCN: '铁路查询功能暂不可用。请确认 Rail Direct 模块已加载，或完成 Rail MCP 的 OAuth 认证。',
                    reply: isChinese ? '铁路查询功能暂不可用。' : 'Rail service not available.',
                    replyCN: '铁路查询功能暂不可用。',
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    routing: {
                      target: routingResult.target,
                      reason: 'Rail 服务未配置',
                    },
                  };
                }

                try {
                  let railResult: any;
                  try {
                    railResult = await railToUse.searchRoutes({
                      origin,
                      destination,
                      date,
                      language: isChinese ? 'zh' : 'en',
                    });
                  } catch (primaryError: any) {
                    // RailDirectService 失败时，fallback 到 Transitous（欧洲 55+ 国 GTFS）
                    if (
                      this.transitousDirectService?.isServiceAvailable?.() &&
                      railToUse !== this.transitousDirectService
                    ) {
                      this.logger.debug(`RailDirect 失败，尝试 Transitous fallback: ${primaryError.message}`);
                      railResult = await this.transitousDirectService.searchRoutes({
                        origin,
                        destination,
                        date,
                        language: isChinese ? 'zh' : 'en',
                      });
                    } else {
                      throw primaryError;
                    }
                  }

                  const routes = railResult?.routes || railResult?.results || railResult?.journeys || [];
                  const enrichedRoutes = this.enrichRailRoutesWithActions(routes);
                  const messageCN = `我为您找到了${routes.length}条从${origin}到${destination}的铁路路线。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: `I found ${routes.length} rail route${routes.length !== 1 ? 's' : ''} from ${origin} to ${destination}.`,
                    messageCN,
                    reply: isChinese ? messageCN : `I found ${routes.length} rail routes.`,
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    railRoutes: enrichedRoutes,
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to rail search',
                    },
                  };
                } catch (railError: any) {
                  this.logger.error(`铁路查询失败: ${railError.message}`, railError.stack);
                  const errMsg = isChinese
                    ? `铁路查询失败：${railError.message}。请检查出发地、目的地是否正确，或稍后重试。`
                    : `Rail search failed: ${railError.message}. Please check origin/destination or try again later.`;
                  return {
                    message: errMsg,
                    messageCN: errMsg,
                    reply: errMsg,
                    replyCN: errMsg,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    routing: {
                      target: routingResult.target,
                      reason: railError.message || 'Rail search failed',
                    },
                  };
                }
              }

              case 'carRental': {
                // 🆕 租车搜索（Booking.com）
                if (!this.bookingComService || !this.bookingComService.isAvailable()) {
                  this.logger.warn('BookingComService not available, falling back to chat');
                  // 返回明确的错误消息
                  return {
                    message: 'Car rental service is not available. Please contact support.',
                    messageCN: '租车服务暂不可用，请联系技术支持。',
                    reply: '租车服务暂不可用，请联系技术支持。',
                    replyCN: '租车服务暂不可用，请联系技术支持。',
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    routing: {
                      target: routingResult.target,
                      reason: 'BookingComService not available',
                    },
                  };
                }

                try {
                  // 优先使用会话中的目的地或 context.countryCode
                  const countryCode = routingResult.extractedParams?.countryCode || dto.context?.countryCode;
                  const destination = selectedDestination || routingResult.extractedParams?.destination || countryCode || '';
                  
                  if (!destination) {
                    throw new Error('请提供目的地（例如："冰岛租车推荐"）');
                  }

                  // 第一步：优先通过 Booking.com Search Car Location 获取认可坐标（两段式流程）
                  let location: { lat: number; lng: number } | undefined;
                  const destTrimmed = String(destination).trim();
                  const countryCodeToQuery: Record<string, string> = {
                    IS: 'Reykjavik', US: 'New York', JP: 'Tokyo', TH: 'Bangkok',
                    NO: 'Oslo', NZ: 'Auckland', GB: 'London', DE: 'Berlin', FR: 'Paris',
                  };
                  const searchQuery = destTrimmed.length === 2 && /^[A-Z]{2}$/i.test(destTrimmed)
                    ? (countryCodeToQuery[destTrimmed.toUpperCase()] ?? destTrimmed)
                    : destTrimmed;

                  try {
                    const locResult = await this.bookingComService.searchCarLocation({ query: searchQuery });
                    const items = locResult?.data;
                    if (Array.isArray(items) && items.length > 0) {
                      const first = items[0];
                      const lat = first.coordinates?.latitude ?? first.latitude;
                      const lng = first.coordinates?.longitude ?? first.longitude;
                      if (lat != null && lng != null) {
                        location = { lat: Number(lat), lng: Number(lng) };
                        this.logger.debug(`租车搜索: Search Car Location 返回坐标 (${location.lat}, ${location.lng})`);
                      }
                    }
                  } catch (locErr: any) {
                    this.logger.debug(`Search Car Location 未返回数据，回退到地理编码: ${locErr.message}`);
                  }

                  // 回退：国家代码使用预定义坐标
                  if (!location) {
                    const destUpper = destTrimmed.toUpperCase();
                    if (destUpper.length === 2 && /^[A-Z]{2}$/.test(destUpper)) {
                      const predefined: Record<string, { lat: number; lng: number }> = {
                        IS: { lat: 64.9631, lng: -19.0208 }, JP: { lat: 35.6762, lng: 139.6503 },
                        US: { lat: 40.7128, lng: -74.0060 }, TH: { lat: 13.7563, lng: 100.5018 },
                        NO: { lat: 59.9139, lng: 10.7522 }, NZ: { lat: -36.8485, lng: 174.7633 },
                      };
                      if (predefined[destUpper]) {
                        location = predefined[destUpper];
                        this.logger.debug(`租车搜索: 国家代码 ${destUpper} 使用预定义坐标`);
                      }
                    }
                  }
                  if (!location && this.googleMapsDirectService) {
                    try {
                      const geocodeResult = await this.googleMapsDirectService.geocode({
                        address: destination,
                        language: isChinese ? 'zh' : 'en',
                      });
                      if (geocodeResult?.data?.results && geocodeResult.data.results.length > 0) {
                        const firstResult = geocodeResult.data.results[0];
                        location = {
                          lat: firstResult.geometry.location.lat,
                          lng: firstResult.geometry.location.lng,
                        };
                        this.logger.debug(`地理编码成功: ${destination} -> (${location.lat}, ${location.lng})`);
                      }
                    } catch (geocodeError: any) {
                      this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                    }
                  }

                  if (!location) {
                    throw new Error('无法确定目的地位置，请提供更具体的地点信息');
                  }

                  // 调用 Booking.com 租车搜索
                  // 使用默认参数：今天取车，明天还车
                  const pickupDate = new Date();
                  const dropoffDate = new Date(pickupDate);
                  dropoffDate.setDate(dropoffDate.getDate() + 1);

                  const carRentalResult = await this.bookingComService.searchCarRentals({
                    pick_up_latitude: location.lat,
                    pick_up_longitude: location.lng,
                    drop_off_latitude: location.lat,
                    drop_off_longitude: location.lng,
                    pick_up_time: '10:00',
                    drop_off_time: '10:00',
                    driver_age: 25,
                    pick_up_date: pickupDate.toISOString().split('T')[0],
                    drop_off_date: dropoffDate.toISOString().split('T')[0],
                    currency_code: 'USD',
                    location: routingResult.extractedParams?.countryCode || dto.context?.countryCode || 'US',
                  });

                  // RapidAPI 可能返回 { data: { status: false, ... } } 或 { data: [...] }，需统一为数组
                  let rentals = carRentalResult?.data;
                  if (!Array.isArray(rentals)) {
                    rentals = [];
                  }
                  const count = rentals.length;
                  const messageCN = count > 0
                    ? `我为您找到了${count}个${destination}的租车选择。`
                    : `暂未找到${destination}的租车选项，请稍后重试或调整搜索条件。`;

                  await this.updateSessionAfterBusinessCall(dto.sessionId, {
                    message: dto.message,
                    response: messageCN,
                    phase: 'RECOMMENDING',
                  });

                  return {
                    message: count > 0 ? `I found ${count} car rental option${count !== 1 ? 's' : ''} in ${destination}.` : `No car rentals found for ${destination}.`,
                    messageCN,
                    reply: isChinese ? messageCN : (count > 0 ? `I found ${count} car rentals.` : 'No car rentals found.'),
                    replyCN: messageCN,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    carRentals: rentals, // 需要添加到 ChatResponseDto
                    routing: {
                      target: routingResult.target,
                      reason: routingResult.reason || 'Routed to car rental search',
                    },
                  };
                } catch (carRentalError: any) {
                  this.logger.error(`租车搜索失败: ${carRentalError.message}`, carRentalError.stack);
                  // 返回明确的错误消息
                  return {
                    message: `Car rental search failed: ${carRentalError.message}`,
                    messageCN: `租车搜索失败: ${carRentalError.message}`,
                    reply: `租车搜索失败: ${carRentalError.message}`,
                    replyCN: `租车搜索失败: ${carRentalError.message}`,
                    phase: 'RECOMMENDING',
                    sessionId: dto.sessionId,
                    routing: {
                      target: routingResult.target,
                      reason: `Car rental search failed: ${carRentalError.message}`,
                    },
                  };
                }
              }
            }
          } catch (error: any) {
            this.logger.warn(`业务接口调用失败: ${error.message}，回退到对话接口`);
            // 继续使用对话接口
          }
        }
      } catch (error: any) {
        this.logger.warn(`智能路由失败: ${error.message}，使用对话接口`);
        // 继续使用对话接口
      }
    }

    // 默认：使用对话接口
    // 获取路由结果和会话状态（如果存在）
    let finalRoutingResult: any = null;
    let finalSelectedDestination: string | undefined = undefined;
    try {
      const sessionStateData = dto.sessionId ? await this.planningAssistantService.getSessionState(dto.sessionId).catch(() => null) : null;

      // 检查「提取攻略中的景点加入行程」意图
      const addAttractionsKeywords = /加入|提取|添加|加入行程|必玩|必去|景点/i;
      if (
        dto.context?.tripId &&
        sessionStateData?.searchResults &&
        sessionStateData.searchResults.length > 0 &&
        addAttractionsKeywords.test(dto.message)
      ) {
        const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
        const result = await this.handleAddAttractionsFromSearch(
          sessionStateData.searchResults,
          dto.context.tripId,
          dto.context.countryCode || 'IS',
          dto,
          isChinese
        );
        if (result) return result;
      }

      if (sessionStateData) {
        finalSelectedDestination = sessionStateData.selectedDestination;
      }
      if (dto.options?.autoRoute !== false && this.smartRouter) {
        const fallbackSessionState: RouterSessionState | undefined = (sessionStateData || dto.context?.tripId) ? {
          phase: sessionStateData?.phase,
          preferences: sessionStateData?.preferences,
          planCandidates: sessionStateData?.planCandidates?.map(p => ({ id: p.id })),
          selectedDestination: sessionStateData?.selectedDestination,
          tripId: dto.context?.tripId, // 规划工作台：用户已有行程，应禁止推荐目的地
          countryCode: dto.context?.countryCode,
        } : undefined;
        finalRoutingResult = await this.smartRouter.route(dto.message, fallbackSessionState);
      }
    } catch (error: any) {
      this.logger.debug(`获取路由结果失败: ${error.message}`);
    }
    
    // 但如果用户已选定目的地，提供更智能的回复，而不是推荐目的地
    let enhancedMessage = dto.message;
    finalSelectedDestination = finalSelectedDestination || finalRoutingResult?.extractedParams?.destination;
    if (finalSelectedDestination) {
      // 如果用户已选定目的地，在消息中添加上下文提示
      enhancedMessage = `[已选定目的地: ${finalSelectedDestination}] ${dto.message}`;
      this.logger.debug(`已选定目的地上下文: ${finalSelectedDestination}, 增强消息: ${enhancedMessage}`);
    }
    
    const response = await this.planningAssistantService.chat({
      sessionId: dto.sessionId,
      userId: dto.userId,
      message: enhancedMessage,
      language: dto.language,
      countryCode: dto.context?.countryCode,
      context: dto.context ? {
        currentLocation: dto.context.currentLocation?.lat !== undefined && dto.context.currentLocation?.lng !== undefined
          ? { lat: dto.context.currentLocation.lat, lng: dto.context.currentLocation.lng }
          : undefined,
        timezone: dto.context.timezone,
        tripId: dto.context.tripId,
        countryCode: dto.context.countryCode,
      } : undefined,
    });

    // 转换PlanningAssistantResponse到ChatResponseDto
    const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
    const chatResponse: ChatResponseDto = {
      message: response.message,
      messageCN: response.messageCN,
      reply: isChinese ? (response.messageCN || response.message) : response.message,
      replyCN: response.messageCN || response.message,
      phase: response.phase,
      sessionId: dto.sessionId,
      // 确保包含路由信息（即使回退到 chat）
      routing: finalRoutingResult ? {
        target: finalRoutingResult.target,
        reason: finalRoutingResult.reason || 'Routed to chat',
        params: finalRoutingResult.extractedParams || {},
      } : {
        target: 'chat',
        reason: 'Fallback to chat',
        params: {},
      },
    };

    // 添加建议操作（如果有）
    if (response.suggestedActions && response.suggestedActions.length > 0) {
      chatResponse.suggestedActions = response.suggestedActions.map(action => ({
        action: action.action,
        label: action.label,
        labelCN: action.labelCN,
        // params字段在PlanningAssistantResponse中不存在，保持为undefined
        params: undefined,
      }));
    }

    if (response.personaEvaluation) {
      chatResponse.personaEvaluation = response.personaEvaluation;
    }

    return chatResponse;
  }

  // ==================== 业务操作（快捷方式） ====================

  /**
   * 获取推荐
   */
  async getRecommendations(params: RecommendationsRequestDto): Promise<RecommendationsResponseDto> {
    this.logger.debug(`获取推荐: naturalLanguageDescription="${params.naturalLanguageDescription?.substring(0, 50)}..."`);

    // 如果提供了自然语言参数，使用SmartRouter提取参数
    if (params.naturalLanguageDescription && this.smartRouter) {
      try {
        const extracted = await this.smartRouter.extractParams(
          params.naturalLanguageDescription,
          'recommendations'
        );
        // 合并提取的参数
        const extractedPrefs = extracted.preferences || {};
        params = {
          ...params,
          preferences: {
            ...params.preferences,
            budget: extractedPrefs.budget ? {
              total: extractedPrefs.budget.total || params.preferences?.budget?.total || 0,
              currency: extractedPrefs.budget.currency || params.preferences?.budget?.currency || 'CNY',
            } : params.preferences?.budget,
            travelers: extractedPrefs.travelers && extractedPrefs.travelers.adults !== undefined
              ? { adults: extractedPrefs.travelers.adults, children: extractedPrefs.travelers.children }
              : params.preferences?.travelers,
            activities: extractedPrefs.activities || params.preferences?.activities,
            travelStyle: extractedPrefs.travelStyle || params.preferences?.travelStyle,
          },
          filters: {
            ...params.filters,
            ...extracted.filters,
          },
        };
        this.logger.debug(`从自然语言提取参数: ${JSON.stringify(extracted).substring(0, 100)}...`);
      } catch (error: any) {
        this.logger.warn(`参数提取失败: ${error.message}`);
      }
    }

    // 检查缓存
    if (this.cacheService) {
      const cacheKey = this.generateRecommendationsCacheKey(params);
      const cached = await this.cacheService.get<RecommendationsResponseDto>(cacheKey);
      if (cached) {
        this.logger.debug(`从缓存获取推荐结果: cacheKey=${cacheKey}`);
        return cached;
      }
    }

    // 合并偏好（转换为UserPreferences格式）
    let mergedPreferences: any = {};
    if (params.preferences) {
      mergedPreferences = {
        budget: params.preferences.budget ? {
          total: params.preferences.budget.total,
          currency: params.preferences.budget.currency || 'CNY',
        } : undefined,
        travelers: params.preferences.travelers,
        activities: params.preferences.activities ? {
          preferred: params.preferences.activities,
        } : undefined,
      };
    }
    
    if (params.sessionId) {
      const state = await this.planningAssistantService.getSessionState(params.sessionId);
      if (state) {
        mergedPreferences = { ...state.preferences, ...mergedPreferences };
      }
    }

    // 获取推荐
    if (this.recommendationEngine) {
      this.logger.debug(`调用推荐引擎: countryCode=${params.filters?.countryCode}, limit=${params.limit || 10}, preferences=${JSON.stringify(mergedPreferences).substring(0, 100)}`);
      
      const scoredDestinations = await this.recommendationEngine.getRecommendations({
        preferences: mergedPreferences,
        countryCode: params.filters?.countryCode,
        limit: params.limit || 10,
      });

      this.logger.debug(`推荐引擎返回: ${scoredDestinations.length} 个推荐`);
      if (scoredDestinations.length > 0) {
        this.logger.debug(`第一个推荐详情: id=${scoredDestinations[0].destination.id}, name=${scoredDestinations[0].destination.name}, countryCode=${scoredDestinations[0].destination.countryCode}`);
      } else {
        this.logger.warn(`推荐引擎返回空数组: countryCode=${params.filters?.countryCode}, 可能需要检查数据源`);
      }

      // 转换ScoredDestination[]为DestinationRecommendationDto[]
      const recommendations = scoredDestinations.map(sd => {
        const rec = {
          id: sd.destination.id,
          countryCode: sd.destination.countryCode,
          name: sd.destination.name || 'Unknown',
          nameCN: sd.destination.nameCN || '未知',
          description: sd.destination.description || '',
          descriptionCN: sd.destination.descriptionCN || '',
          highlights: sd.destination.highlights || [],
          highlightsCN: sd.destination.highlightsCN || [],
          matchScore: sd.destination.matchScore || sd.scores?.total || 0,
          matchReasons: sd.matchReasons || sd.destination.matchReasons || [],
          matchReasonsCN: sd.matchReasonsCN || sd.destination.matchReasonsCN || [],
          estimatedBudget: sd.destination.estimatedBudget || { min: 0, max: 0, currency: 'CNY' },
          bestSeasons: sd.destination.bestSeasons || [],
          imageUrl: sd.destination.imageUrl,
          tags: sd.destination.tags || [],
        };
        return rec;
      });

      this.logger.debug(`转换后的推荐数量: ${recommendations.length}`);
      if (recommendations.length > 0) {
        this.logger.debug(`转换后第一个推荐: ${JSON.stringify(recommendations[0]).substring(0, 200)}...`);
      }

      const response: RecommendationsResponseDto = {
        recommendations,
        sessionId: params.sessionId,
        preferencesUsed: params.preferences || {},
        generatedAt: new Date().toISOString(),
      };

      // 缓存结果（5分钟）
      if (this.cacheService) {
        const cacheKey = this.generateRecommendationsCacheKey(params);
        await this.cacheService.set(cacheKey, response, 300).catch((error: any) => {
          this.logger.warn(`推荐结果缓存失败: cacheKey=${cacheKey}`, error);
        });
      }

      return response;
    } else {
      this.logger.error(`推荐引擎不可用: recommendationEngine=${!!this.recommendationEngine}`);
    }

    throw new BadRequestException({
      success: false,
      errorCode: '5001',
      message: 'Recommendation engine not available',
      messageCN: '推荐引擎不可用',
    });
  }

  /**
   * 生成方案（同步）
   */
  async generatePlan(dto: GeneratePlanRequestDto): Promise<GeneratePlanResponseDto> {
    const startTime = Date.now();
    const traceId = randomUUID();
    
    this.logger.log({
      event: 'generate_plan_start',
      traceId,
      destination: dto.destination,
      sessionId: dto.sessionId,
      userId: dto.userId,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.debug(`生成方案: destination=${dto.destination}, traceId=${traceId}`);

    // 验证目的地
    if (!dto.destination && !dto.naturalLanguageDescription) {
      throw new DestinationRequiredException();
    }

    // 如果提供了自然语言描述，使用SmartRouter提取参数
    if (dto.naturalLanguageDescription && !dto.destination && this.smartRouter) {
      try {
        const extracted = await this.smartRouter.extractParams(
          dto.naturalLanguageDescription,
          'generate'
        );
        if (extracted.destination) {
          dto.destination = extracted.destination;
        }
        if (extracted.preferences) {
          const extractedPrefs = extracted.preferences;
          dto.preferences = {
            ...dto.preferences,
            budget: extractedPrefs.budget ? {
              total: extractedPrefs.budget.total || dto.preferences?.budget?.total || 0,
              currency: extractedPrefs.budget.currency || dto.preferences?.budget?.currency || 'CNY',
            } : dto.preferences?.budget,
            travelers: extractedPrefs.travelers && extractedPrefs.travelers.adults !== undefined
              ? { adults: extractedPrefs.travelers.adults, children: extractedPrefs.travelers.children }
              : dto.preferences?.travelers,
            activities: extractedPrefs.activities || dto.preferences?.activities,
            travelStyle: extractedPrefs.travelStyle || dto.preferences?.travelStyle,
          };
        }
        if (extracted.constraints) {
          dto.constraints = {
            ...dto.constraints,
            ...extracted.constraints,
          };
        }
        this.logger.debug(`从自然语言提取参数: ${JSON.stringify(extracted).substring(0, 100)}...`);
      } catch (error: any) {
        this.logger.warn(`参数提取失败: ${error.message}`);
      }
    }

    // 合并偏好（转换为UserPreferences格式）
    let mergedPreferences: any = {};
    if (dto.preferences) {
      mergedPreferences = {
        budget: dto.preferences.budget ? {
          total: dto.preferences.budget.total,
          currency: dto.preferences.budget.currency || 'CNY',
        } : undefined,
        travelers: dto.preferences.travelers && dto.preferences.travelers.adults !== undefined
          ? { adults: dto.preferences.travelers.adults || 1, children: dto.preferences.travelers.children }
          : undefined,
        activities: dto.preferences.activities ? {
          preferred: dto.preferences.activities,
        } : undefined,
      };
    }
    
    if (dto.sessionId) {
      const state = await this.planningAssistantService.getSessionState(dto.sessionId);
      if (state) {
        mergedPreferences = { ...state.preferences, ...mergedPreferences };
      }
    }

    // 调用CoreGateway
    if (this.coreGateway) {
      const coreResult = await this.coreGateway.generatePlan({
        userId: dto.userId || 'anonymous',
        sessionId: dto.sessionId || '',
        destination: dto.destination!,
        preferences: mergedPreferences as Record<string, unknown>,
        constraints: dto.constraints as Record<string, unknown> | undefined,
        tripId: dto.tripId,
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
      // CoreGateway返回的data是PlanningWorkbenchResponse类型
      // 需要从planState和uiOutput中提取信息转换为PlanCandidateDto[]
      const workbenchResponse = coreResult.data as any; // PlanningWorkbenchResponse
      
      let plans: PlanCandidateDto[] = [];
      
      if (workbenchResponse) {
        // 方法1: 从uiOutput.skeletonOptions提取多个方案候选
        if (workbenchResponse.uiOutput?.skeletonOptions) {
          plans = this.convertSkeletonOptionsToPlanCandidates(
            workbenchResponse.uiOutput.skeletonOptions,
            workbenchResponse.planState,
            workbenchResponse.uiOutput.personas
          );
        }
        // 方法2: 如果只有一个planState，转换为单个方案候选
        else if (workbenchResponse.planState) {
          plans = [this.convertPlanStateToPlanCandidate(
            workbenchResponse.planState,
            workbenchResponse.uiOutput?.personas
          )];
        }
      }

      // 如果转换后没有方案，记录警告但返回空列表（而不是抛出错误）
      if (plans.length === 0) {
        this.logger.warn(`方案生成成功但转换后无方案: traceId=${coreResult.meta?.traceId}`);
      }

      // 更新会话状态（如果提供了sessionId）
      if (dto.sessionId && plans.length > 0) {
        try {
          const state = await this.planningAssistantService.getSessionState(dto.sessionId);
          if (state) {
            // 将生成的方案添加到会话状态
            const planCandidates = this.convertPlanCandidatesDtoToPlanCandidates(plans);
            
            // 更新会话状态
            await this.updateSessionState(dto.sessionId, {
              planCandidates,
              phase: 'COMPARING',
            });
          }
        } catch (error: any) {
          this.logger.warn(`更新会话状态失败: ${error.message}`);
        }
      }
      
      const duration = Date.now() - startTime;
      this.recordPerformanceMetric('generatePlan', duration);
      
      this.logger.log({
        event: 'generate_plan_success',
        traceId,
        destination: dto.destination,
        planCount: plans.length,
        duration,
        coreTraceId: coreResult.meta?.traceId,
        timestamp: new Date().toISOString(),
      });
      
      return {
        plans,
        sessionId: dto.sessionId,
        generatedAt: new Date().toISOString(),
        traceId: coreResult.meta?.traceId || traceId,
      };
    }

    const duration = Date.now() - startTime;
    this.recordPerformanceMetric('generatePlan', duration);
    
    this.logger.error({
      event: 'generate_plan_error',
      traceId,
      destination: dto.destination,
      error: 'CoreGateway not available',
      duration,
      timestamp: new Date().toISOString(),
    });
    
    throw new BadRequestException({
      success: false,
      errorCode: '1009',
      message: 'CoreGateway not available',
      messageCN: '核心网关不可用',
      details: { traceId },
    });
  }

  /**
   * 方案 A：通过 route_and_run 编排生成方案，返回 ui_state 和 orchestrationResult
   * 供前端展示可折叠「编排进度」卡片
   * @param tripId 规划工作台场景下的行程 ID，传入时编排会关联已有行程
   */
  private async generatePlanViaRouteAndRun(
    dto: GeneratePlanRequestDto,
    userMessage: string,
    tripId?: string,
  ): Promise<ChatResponseDto | null> {
    if (!this.agentService) return null;

    const destination = dto.destination || (dto as any).naturalLanguageDescription;
    if (!destination) return null;

    const message = userMessage || this.buildPlanMessageFromParams(dto);
    const requestId = `pa-gen-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const routeAndRunRequest = {
      request_id: requestId,
      user_id: dto.userId || 'anonymous',
      trip_id: tripId as string | undefined,
      message,
      options: {
        entry_point: 'planning_workbench' as const,
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        max_seconds: 60,
        max_steps: 8,
      },
    };

    this.logger.debug(`[方案 A] 调用 route_and_run: request_id=${requestId}, message=${message.substring(0, 50)}...`);

    const response = await this.agentService.routeAndRun(routeAndRunRequest);

    if (response.result?.status === 'REDIRECT_REQUIRED') {
      this.logger.warn('[方案 A] route_and_run 返回 REDIRECT_REQUIRED，降级');
      return null;
    }

    const payload = response.result?.payload;
    const orchestrationResult = payload?.orchestrationResult;
    const itinerary = orchestrationResult?.itinerary;
    const state = orchestrationResult?.state;

    const plans: PlanCandidateDto[] = [];
    if (itinerary || state) {
      plans.push(this.convertOrchestrationResultToPlanCandidate(state, itinerary, destination));
    }

    const answerText = response.result?.answer_text || '';
    const isChinese = /[\u4e00-\u9fa5]/.test(answerText);

    if (dto.sessionId && plans.length > 0) {
      await this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: userMessage,
        response: answerText,
        phase: 'COMPARING_PLANS',
        planCandidates: this.convertPlanCandidatesDtoToPlanCandidates(plans),
      });
    }

    return {
      message: answerText || `I generated ${plans.length} travel plan(s) for you.`,
      messageCN: answerText || `我为您生成了${plans.length}个旅行方案。`,
      reply: isChinese ? (answerText || `我为您生成了${plans.length}个旅行方案。`) : (answerText || `I generated ${plans.length} travel plan(s) for you.`),
      replyCN: answerText || `我为您生成了${plans.length}个旅行方案。`,
      phase: 'COMPARING_PLANS',
      sessionId: dto.sessionId,
      plans,
      ui_state: response.ui_state ? {
        phase: response.ui_state.phase,
        ui_status: response.ui_state.ui_status,
        progress_percent: response.ui_state.progress_percent,
        message: response.ui_state.message,
        requires_user_action: response.ui_state.requires_user_action,
        estimated_time_remaining_ms: response.ui_state.estimated_time_remaining_ms,
        current_step_detail: response.ui_state.current_step_detail,
      } : undefined,
      orchestrationResult: orchestrationResult ? {
        state: state as unknown as Record<string, unknown>,
        gate_result: orchestrationResult.gate_result as unknown as Record<string, unknown>,
        decision_log: orchestrationResult.decision_log as unknown[],
        itinerary: orchestrationResult.itinerary as { days?: unknown[] },
        decisionState: (payload as any)?.orchestrationResult?.decisionState as Record<string, unknown> | undefined,
      } : undefined,
      routing: {
        target: 'generate' as const,
        reason: 'Routed via route_and_run (方案 A)',
        params: (dto as any),
      },
    };
  }

  private buildPlanMessageFromParams(dto: GeneratePlanRequestDto): string {
    const dest = dto.destination || '旅行';
    const days = (dto as any).days ?? 5;
    return `帮我规划${days}天${dest}的行程`;
  }

  private convertOrchestrationResultToPlanCandidate(
    state: any,
    itinerary: any,
    destination: string,
  ): PlanCandidateDto {
    const days = itinerary?.days?.length || state?.trip_plan_request?.days || 5;
    const dest = destination || state?.trip_plan_request?.destination || 'Unknown';
    const planId = state?.plan_id || `plan-orch-${Date.now()}`;

    const highlights: string[] = [];
    if (itinerary?.days) {
      for (const day of itinerary.days.slice(0, 3)) {
        const items = day.items || [];
        for (const item of items.slice(0, 2)) {
          if (item.location_ref?.name) highlights.push(item.location_ref.name);
          else if (item.type === 'POI' && item.title) highlights.push(item.title);
        }
      }
    }
    if (highlights.length === 0) highlights.push(`${dest}精华行程`);

    return {
      id: planId,
      name: `${dest} ${days}-Day Itinerary`,
      nameCN: `${dest} ${days}天行程`,
      description: `AI-generated ${days}-day itinerary for ${dest}`,
      descriptionCN: `AI 生成的${dest}${days}天行程`,
      destination: typeof dest === 'string' ? dest : (dest as any)?.city || 'Unknown',
      duration: days,
      highlights,
      estimatedBudget: {
        total: 0,
        breakdown: { flight: 0, accommodation: 0, activities: 0, food: 0, other: 0 },
        currency: 'CNY',
      },
      pace: 'moderate',
      suitability: { score: 0.8, reasons: ['编排生成'] },
    };
  }

  /**
   * 生成方案（异步）
   */
  async generatePlanAsync(dto: GeneratePlanRequestDto): Promise<AsyncTaskResponseDto> {
    this.logger.debug(`异步生成方案: destination=${dto.destination}`);

    if (!this.taskService) {
      throw new BadRequestException({
        success: false,
        errorCode: '5002',
        message: 'Task service not available',
        messageCN: '任务服务不可用',
      });
    }

    // 创建异步任务
    const taskId = this.taskService.createTask('generate_plan', dto);
    
    // 异步执行
    this.executeGeneratePlanAsync(taskId, dto).catch(error => {
      this.logger.error(`异步生成方案失败: taskId=${taskId}`, error);
      this.taskService?.markFailed(taskId, error).catch(() => {});
    });

    // 获取初始任务状态
    const task = await this.taskService.getTaskStatus(taskId);
    if (!task) {
      throw new BadRequestException({
        success: false,
        errorCode: '5004',
        message: 'Failed to create task',
        messageCN: '创建任务失败',
      });
    }

    // 转换状态（AsyncTaskResponseDto不支持CANCELLED，转换为FAILED）
    const status = task.status === 'CANCELLED' ? 'FAILED' : 
                   task.status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

    return {
      taskId: task.taskId,
      status,
      progress: task.progress,
      currentStage: task.currentStage,
      estimatedTimeRemaining: task.estimatedTimeRemaining,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      result: task.status === 'COMPLETED' && task.result ? { plans: task.result.plans || [] } : undefined,
      error: task.status === 'FAILED' || task.status === 'CANCELLED' ? {
        code: 'TASK_FAILED',
        message: task.error || 'Task failed',
        messageCN: task.error || '任务失败',
      } : undefined,
    };
  }

  /**
   * 查询生成任务状态
   */
  async getGenerateTaskStatus(taskId: string, requestingUserId?: string): Promise<AsyncTaskResponseDto> {
    this.logger.debug(`查询任务状态: taskId=${taskId}, requestingUserId=${requestingUserId}`);

    if (!this.taskService) {
      throw new BadRequestException({
        success: false,
        errorCode: '5002',
        message: 'Task service not available',
        messageCN: '任务服务不可用',
      });
    }

    const task = await this.taskService.getTaskStatus(taskId);
    if (!task) {
      throw new NotFoundException({
        success: false,
        errorCode: '4001',
        message: 'Task not found',
        messageCN: '任务不存在',
        details: { taskId },
      });
    }

    // 验证资源所有权（如果提供了 requestingUserId 且任务有 userId）
    // 注意：TaskService 可能不存储 userId，这里先检查 metadata
    if (requestingUserId && (task as any).metadata?.userId && (task as any).metadata.userId !== requestingUserId) {
      throw new ForbiddenException({
        success: false,
        errorCode: '4002',
        message: 'Access denied',
        messageCN: '无权访问此任务',
        details: { taskId },
      });
    }

    // 转换TaskInfo为AsyncTaskResponseDto
    // 转换状态（AsyncTaskResponseDto不支持CANCELLED，转换为FAILED）
    const status = task.status === 'CANCELLED' ? 'FAILED' : 
                   task.status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

    const response: AsyncTaskResponseDto = {
      taskId: task.taskId,
      status,
      progress: task.progress,
      currentStage: task.currentStage,
      estimatedTimeRemaining: task.estimatedTimeRemaining,
      result: task.status === TaskStatus.COMPLETED && task.result ? { plans: task.result.plans || [] } : undefined,
      error: (task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) && task.error ? {
        code: 'TASK_FAILED',
        message: task.error,
        messageCN: task.error,
      } : undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };

    return response;
  }

  /**
   * 对比方案
   */
  async comparePlans(dto: ComparePlansRequestDto, requestingUserId?: string): Promise<ComparePlansResponseDto> {
    this.logger.debug(`对比方案: planIds=${dto.planIds.join(',')}, requestingUserId=${requestingUserId}`);

    // 验证输入
    if (!dto.planIds || dto.planIds.length < 2) {
      throw new BadRequestException({
        success: false,
        errorCode: '3003',
        message: 'At least 2 plan IDs are required for comparison',
        messageCN: '至少需要2个方案ID进行对比',
        details: { planIds: dto.planIds },
      });
    }

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

    // 从会话状态获取方案（如果提供了sessionId）
    let planCandidates: PlanCandidate[] = [];
    if (dto.sessionId) {
      const state = await this.planningAssistantService.getSessionState(dto.sessionId);
      
      // 验证资源所有权（如果提供了 requestingUserId）
      if (state && requestingUserId && state.userId && state.userId !== requestingUserId) {
        throw new ForbiddenException({
          success: false,
          errorCode: '2006',
          message: 'Access denied',
          messageCN: '无权访问此会话的方案',
          details: { sessionId: dto.sessionId },
        });
      }
      
      if (state && state.planCandidates) {
        planCandidates = state.planCandidates.filter(p => dto.planIds.includes(p.id));
      }
    }

    // 如果从会话状态获取不到足够的方案，尝试调用CoreGateway
    if (planCandidates.length < dto.planIds.length && this.coreGateway) {
      try {
        const coreResult = await this.coreGateway.execute({
          type: 'comparePlans',
          payload: {
            planIds: dto.planIds,
            compareFields: dto.compareFields,
          },
          context: {
            userId: 'anonymous',
            sessionId: dto.sessionId || '',
          },
        });

        if (coreResult.success && coreResult.data) {
          // CoreGateway返回的数据格式已在generatePlan方法中处理
          // 这里可以记录日志或进行额外处理
          this.logger.debug(`CoreGateway对比方案成功: traceId=${coreResult.meta?.traceId}`);
        }
      } catch (error: any) {
        this.logger.warn(`CoreGateway对比方案失败: ${error.message}`);
      }
    }

    // 如果仍然没有足够的方案，返回错误
    if (planCandidates.length < 2) {
      throw new BadRequestException({
        success: false,
        errorCode: '3005',
        message: 'Plans not found for comparison',
        messageCN: '未找到可对比的方案',
        details: {
          requested: dto.planIds,
          found: planCandidates.length,
        },
      });
    }

    // 对比维度
    const dimensions = dto.compareFields || ['budget', 'duration', 'pace', 'suitability'];
    
    // 构建对比数据
    const plans = planCandidates.map(plan => ({
      id: plan.id,
      name: plan.name,
      nameCN: plan.nameCN,
      scores: {
        budget: plan.estimatedBudget.total,
        duration: plan.duration,
        pace: this.paceToScore(plan.pace),
        suitability: plan.suitability.score,
      },
    }));

    // 计算差异
    const differences = this.calculateDifferences(planCandidates, dimensions);

    // 生成推荐
    const recommendation = this.generateComparisonRecommendation(planCandidates);

    return {
      plans,
      dimensions,
      differences,
      recommendation,
    };
  }

  /**
   * 将节奏转换为分数（用于对比）
   */
  private paceToScore(pace: 'relaxed' | 'moderate' | 'intensive'): number {
    const paceMap = { relaxed: 1, moderate: 2, intensive: 3 };
    return paceMap[pace] || 2;
  }

  /**
   * 计算方案差异
   */
  private calculateDifferences(
    plans: PlanCandidate[],
    dimensions: string[]
  ): ComparisonDifferenceDto[] {
    const differences: ComparisonDifferenceDto[] = [];
    
    if (plans.length < 2) return differences;

    const plan1 = plans[0];
    const plan2 = plans[1];

    dimensions.forEach(field => {
      let plan1Value: any;
      let plan2Value: any;
      let impact: 'low' | 'medium' | 'high' = 'low';

      switch (field) {
        case 'budget':
          plan1Value = plan1.estimatedBudget.total;
          plan2Value = plan2.estimatedBudget.total;
          const budgetDiff = Math.abs(plan1Value - plan2Value) / Math.max(plan1Value, plan2Value);
          impact = budgetDiff > 0.3 ? 'high' : budgetDiff > 0.15 ? 'medium' : 'low';
          break;
        case 'duration':
          plan1Value = plan1.duration;
          plan2Value = plan2.duration;
          const durationDiff = Math.abs(plan1Value - plan2Value) / Math.max(plan1Value, plan2Value);
          impact = durationDiff > 0.3 ? 'high' : durationDiff > 0.15 ? 'medium' : 'low';
          break;
        case 'pace':
          plan1Value = plan1.pace;
          plan2Value = plan2.pace;
          impact = plan1Value !== plan2Value ? 'medium' : 'low';
          break;
        case 'suitability':
          plan1Value = plan1.suitability.score;
          plan2Value = plan2.suitability.score;
          const suitabilityDiff = Math.abs(plan1Value - plan2Value);
          impact = suitabilityDiff > 20 ? 'high' : suitabilityDiff > 10 ? 'medium' : 'low';
          break;
        default:
          return; // 跳过未知维度
      }

      differences.push({
        field,
        plan1Value,
        plan2Value,
        impact,
        description: this.generateDifferenceDescription(field, plan1Value, plan2Value),
        descriptionCN: this.generateDifferenceDescriptionCN(field, plan1Value, plan2Value),
      });
    });

    return differences;
  }

  /**
   * 生成差异描述（英文）
   */
  private generateDifferenceDescription(field: string, value1: any, value2: any): string {
    switch (field) {
      case 'budget':
        return `Budget difference: ${Math.abs(value1 - value2).toLocaleString()}`;
      case 'duration':
        return `Duration difference: ${Math.abs(value1 - value2)} days`;
      case 'pace':
        return `Pace: ${value1} vs ${value2}`;
      case 'suitability':
        return `Suitability score difference: ${Math.abs(value1 - value2)} points`;
      default:
        return `${field}: ${value1} vs ${value2}`;
    }
  }

  /**
   * 生成差异描述（中文）
   */
  private generateDifferenceDescriptionCN(field: string, value1: any, value2: any): string {
    switch (field) {
      case 'budget':
        return `预算差异：${Math.abs(value1 - value2).toLocaleString()}`;
      case 'duration':
        return `时长差异：${Math.abs(value1 - value2)} 天`;
      case 'pace':
        return `节奏：${this.translatePace(value1)} vs ${this.translatePace(value2)}`;
      case 'suitability':
        return `匹配度差异：${Math.abs(value1 - value2)} 分`;
      default:
        return `${field}：${value1} vs ${value2}`;
    }
  }

  /**
   * 翻译节奏
   */
  private translatePace(pace: string): string {
    const paceMap: Record<string, string> = {
      relaxed: '轻松',
      moderate: '适中',
      intensive: '紧凑',
    };
    return paceMap[pace] || pace;
  }

  /**
   * 生成对比推荐
   */
  private generateComparisonRecommendation(
    plans: PlanCandidate[]
  ): ComparisonRecommendationDto {
    if (plans.length < 2) {
      return {};
    }

    // 找出最佳预算方案
    const bestBudget = plans.reduce((best, current) =>
      current.estimatedBudget.total < best.estimatedBudget.total ? current : best
    ).id;

    // 找出最佳匹配度方案
    const bestSuitability = plans.reduce((best, current) =>
      current.suitability.score > best.suitability.score ? current : best
    ).id;

    // 生成总结
    const summary = `Plan comparison completed. Best budget option: ${bestBudget}, Best match: ${bestSuitability}`;
    const summaryCN = `方案对比完成。最佳预算方案：${bestBudget}，最佳匹配方案：${bestSuitability}`;

    return {
      bestBudget,
      bestRoute: bestSuitability, // 使用最佳匹配度作为最佳路线
      summary,
      summaryCN,
    };
  }

  /**
   * 优化方案
   */
  async optimizePlan(dto: OptimizePlanRequestDto, requestingUserId?: string): Promise<GeneratePlanResponseDto> {
    this.logger.debug(`优化方案: planId=${dto.planId}, type=${dto.optimizationType}, requestingUserId=${requestingUserId}`);

    // 验证输入
    if (!dto.planId) {
      throw new BadRequestException({
        success: false,
        errorCode: '3002',
        message: 'Plan ID is required',
        messageCN: '方案ID必填',
      });
    }

    if (!dto.sessionId) {
      throw new BadRequestException({
        success: false,
        errorCode: '2003',
        message: 'Session ID is required',
        messageCN: '会话ID必填',
      });
    }

    // 从会话状态获取原始方案
    let originalPlan: PlanCandidate | undefined;
    if (dto.sessionId) {
      const state = await this.planningAssistantService.getSessionState(dto.sessionId);
      
      if (state) {
        // 验证资源所有权（如果提供了 requestingUserId）
        if (requestingUserId && state.userId && state.userId !== requestingUserId) {
          throw new ForbiddenException({
            success: false,
            errorCode: '2007',
            message: 'Access denied',
            messageCN: '无权优化此会话的方案',
            details: { sessionId: dto.sessionId },
          });
        }
        
        if (state.planCandidates) {
          originalPlan = state.planCandidates.find(p => p.id === dto.planId);
        }
      }
    }

    if (!originalPlan) {
      throw new BadRequestException({
        success: false,
        errorCode: '3006',
        message: 'Plan not found',
        messageCN: '方案不存在',
        details: { planId: dto.planId },
      });
    }

    // 获取会话状态以获取更多上下文
    const sessionState = dto.sessionId ? 
      await this.planningAssistantService.getSessionState(dto.sessionId) : 
      null;

    // 构建优化参数
    const optimizationParams: any = {
      destination: originalPlan.destination,
      duration: originalPlan.duration,
      budget: originalPlan.estimatedBudget.total,
      pace: originalPlan.pace,
    };

    // 根据优化类型和要求调整参数
    if (dto.requirements) {
      if (dto.requirements.slowerPace) {
        // 放慢节奏：relaxed < moderate < intensive
        if (optimizationParams.pace === 'intensive') {
          optimizationParams.pace = 'moderate';
        } else if (optimizationParams.pace === 'moderate') {
          optimizationParams.pace = 'relaxed';
        }
      }

      if (dto.requirements.reduceBudget !== undefined) {
        optimizationParams.budget = Math.max(0, optimizationParams.budget - dto.requirements.reduceBudget);
      }

      if (dto.requirements.addActivities && dto.requirements.addActivities.length > 0) {
        optimizationParams.addActivities = dto.requirements.addActivities;
      }

      if (dto.requirements.removeActivities && dto.requirements.removeActivities.length > 0) {
        optimizationParams.removeActivities = dto.requirements.removeActivities;
      }
    }

    // 调用CoreGateway生成优化后的方案
    let optimizedPlans: PlanCandidateDto[] = [];
    
    if (this.coreGateway) {
      try {
        const coreResult = await this.coreGateway.execute({
          type: 'generatePlan',
          payload: {
            destination: optimizationParams.destination,
            days: optimizationParams.duration,
            constraints: {
              budget: {
                total: optimizationParams.budget,
                currency: (originalPlan.estimatedBudget as any).currency || 'CNY',
              },
              time: {
                days: optimizationParams.duration,
              },
            },
            preferences: {
              pace: optimizationParams.pace,
              activities: optimizationParams.addActivities || [],
            },
          },
          context: {
            userId: sessionState?.userId || 'anonymous',
            sessionId: dto.sessionId || '',
          },
        });

        if (coreResult.success && coreResult.data) {
          // 转换CoreGateway返回的数据格式
          const workbenchResponse = coreResult.data as any; // PlanningWorkbenchResponse
          if (workbenchResponse.planState) {
            optimizedPlans = [
              this.convertPlanStateToPlanCandidate(
                workbenchResponse.planState,
                workbenchResponse.uiOutput?.personas
              ),
            ];
          } else if (workbenchResponse.uiOutput?.skeletonOptions) {
            optimizedPlans = this.convertSkeletonOptionsToPlanCandidates(
              workbenchResponse.uiOutput.skeletonOptions,
              workbenchResponse.planState
            );
          }
        }
      } catch (error: any) {
        this.logger.warn(`CoreGateway优化方案失败: ${error.message}`);
        // 如果CoreGateway失败，返回基于原始方案的简单调整版本
        optimizedPlans = [this.createOptimizedPlanFromOriginal(originalPlan, dto)];
      }
    } else {
      // 如果没有CoreGateway，返回基于原始方案的简单调整版本
      optimizedPlans = [this.createOptimizedPlanFromOriginal(originalPlan, dto)];
    }

    return {
      plans: optimizedPlans,
      generatedAt: new Date().toISOString(),
      sessionId: dto.sessionId,
    };
  }

  /**
   * 确认方案
   */
  async confirmPlan(dto: ConfirmPlanRequestDto): Promise<{ success: boolean; tripId: string }> {
    const startTime = Date.now();
    const traceId = randomUUID();
    
    this.logger.log({
      event: 'confirm_plan_start',
      traceId,
      planId: dto.planId,
      userId: dto.userId,
      sessionId: dto.sessionId,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.debug(`确认方案: planId=${dto.planId}, userId=${dto.userId}, traceId=${traceId}`);

    // 验证输入
    if (!dto.planId) {
      throw new BadRequestException({
        success: false,
        errorCode: '3002',
        message: 'Plan ID is required',
        messageCN: '方案ID必填',
      });
    }

    // 性能优化：并行获取会话状态和验证方案（如果提供了sessionId）
    let sessionState: PlanningConversationState | null = null;
    let selectedPlan: PlanCandidate | undefined;
    
    if (dto.sessionId) {
      try {
        sessionState = await this.planningAssistantService.getSessionState(dto.sessionId);
        if (sessionState && sessionState.planCandidates) {
          selectedPlan = sessionState.planCandidates.find(p => p.id === dto.planId);
        }
      } catch (error: any) {
        this.logger.warn(`获取会话状态失败: ${error.message}`);
      }
    }

    // 验证方案是否存在
    if (!selectedPlan) {
      throw new BadRequestException({
        success: false,
        errorCode: '3006',
        message: 'Plan not found',
        messageCN: '方案不存在',
        details: { planId: dto.planId },
      });
    }

    // 1. 创建行程（Trip）记录和TripCollaborator（使用事务确保原子性）
    let tripId: string;
    if (this.prisma) {
      try {
        // 生成默认行程名称
        const { generateDefaultTripName } = require('../../../../trips/utils/trip-name.util');
        const destination = sessionState?.selectedDestination || selectedPlan.destination;
        const startDate = sessionState?.preferences?.dateRange?.startDate || this.getDefaultStartDate();
        const endDate = sessionState?.preferences?.dateRange?.endDate || this.getDefaultEndDate(selectedPlan.duration);
        const tripName = generateDefaultTripName({
          destination,
          startDate: new Date(startDate),
        });

        tripId = randomUUID();

        // 使用事务确保 Trip 和 TripCollaborator 要么全部创建成功，要么全部失败
        await this.prisma.$transaction(async (tx) => {
          // 创建 Trip 主记录
          const createdTrip = await tx.trip.create({
            data: {
              id: tripId,
              name: tripName,
              destination: destination,
              startDate: new Date(startDate),
              endDate: new Date(endDate),
              status: 'PLANNING',
              updatedAt: new Date(),
              budgetConfig: {
                total: selectedPlan.estimatedBudget.total,
                breakdown: selectedPlan.estimatedBudget.breakdown,
                currency: (selectedPlan.estimatedBudget as any).currency || 'CNY',
              },
              pacingConfig: {
                pacePreference: selectedPlan.pace === 'relaxed' ? 'RELAXED' : 
                               selectedPlan.pace === 'intensive' ? 'INTENSIVE' : 'BALANCED',
              },
              metadata: {
                userId: dto.userId || sessionState?.userId || 'anonymous',
                travelers: sessionState?.preferences?.travelers?.adults || 2,
                planId: selectedPlan.id,
                sessionId: dto.sessionId,
                confirmedAt: new Date().toISOString(),
              },
            },
          });

          // 创建TripCollaborator（如果提供了userId）
          if (dto.userId) {
            await tx.tripCollaborator.create({
              data: {
                id: randomUUID(),
                tripId: createdTrip.id,
                userId: dto.userId,
                role: 'OWNER',
                updatedAt: new Date(),
              },
            });
          }

          return createdTrip;
        });

        this.logger.debug(`行程已创建（事务完成）: tripId=${tripId}, planId=${dto.planId}`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        this.recordPerformanceMetric('confirmPlan', duration);
        
        this.logger.error({
          event: 'confirm_plan_error',
          traceId,
          planId: dto.planId,
          userId: dto.userId,
          error: error.message,
          stack: error.stack,
          duration,
          timestamp: new Date().toISOString(),
        });
        
        throw new BadRequestException({
          success: false,
          errorCode: '3007',
          message: 'Failed to create trip',
          messageCN: '创建行程失败',
          details: { error: error.message, traceId },
        });
      }
    } else {
      // 如果没有Prisma服务，生成临时ID
      tripId = `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.logger.warn(`PrismaService不可用，使用临时tripId: ${tripId}`);
    }

    // 2. 性能优化：并行执行会话状态更新和偏好学习（如果适用）
    const parallelTasks: Promise<any>[] = [];

    // 更新会话状态（confirmedTripId和selectedPlanId）
    if (dto.sessionId) {
      parallelTasks.push(
        this.updateSessionState(dto.sessionId, {
          confirmedTripId: tripId,
          selectedPlanId: dto.planId,
          phase: 'COMPLETED',
        }).catch((error: any) => {
          this.logger.warn(`更新会话状态失败: ${error.message}`);
        })
      );
    }

    // 学习用户偏好（PreferenceLearningService）
    if (this.preferenceLearning && dto.userId && sessionState) {
      parallelTasks.push(
        this.preferenceLearning.learnFromAction({
          userId: dto.userId,
          action: 'plan_confirmed',
          data: {
            destination: selectedPlan.destination,
            budget: selectedPlan.estimatedBudget.total,
            days: selectedPlan.duration,
            travelers: sessionState.preferences?.travelers,
            pace: selectedPlan.pace,
          },
        }).catch((error: any) => {
          this.logger.warn(`偏好学习失败: ${error.message}`);
        })
      );
    }

    // 并行执行所有任务
    if (parallelTasks.length > 0) {
      await Promise.all(parallelTasks);
    }

    // 4. 如果saveToCalendar为true，添加到日历（需要集成日历服务）
    if (dto.saveToCalendar) {
      this.logger.debug(`日历集成功能待实现: tripId=${tripId}`);
      // TODO: 集成日历服务（Google Calendar, iCal等）
      // await this.calendarService.addEvent(tripId, selectedPlan);
    }
    
    // 5. 如果sendReminders为true，设置提醒（需要集成提醒服务）
    if (dto.sendReminders) {
      this.logger.debug(`提醒功能待实现: tripId=${tripId}`);
      // TODO: 集成提醒服务（邮件、短信、推送通知等）
      // await this.notificationService.scheduleReminders(tripId, selectedPlan);
    }

    const duration = Date.now() - startTime;
    this.recordPerformanceMetric('confirmPlan', duration);
    
    this.logger.log({
      event: 'confirm_plan_success',
      traceId,
      planId: dto.planId,
      tripId,
      userId: dto.userId,
      duration,
      timestamp: new Date().toISOString(),
    });
    
    return {
      success: true,
      tripId,
    };
  }

  // ==================== 行程操作 ====================

  /**
   * 优化已创建行程
   */
  async optimizeTrip(dto: OptimizeTripRequestDto, requestingUserId?: string): Promise<{ success: boolean; tripId: string }> {
    this.logger.debug(`优化行程: tripId=${dto.tripId}, type=${dto.optimizationType}`);

    // 验证输入
    if (!dto.tripId) {
      throw new BadRequestException({
        success: false,
        errorCode: '4003',
        message: 'Trip ID is required',
        messageCN: '行程ID必填',
      });
    }

    // 1. 从数据库获取行程数据
    let trip;
    if (this.prisma) {
      trip = await this.prisma.trip.findUnique({
        where: { id: dto.tripId },
        include: {
          TripCollaborator: true, // 包含协作者信息用于验证所有权
        },
      });

      if (!trip) {
        throw new NotFoundException({
          success: false,
          errorCode: '4002',
          message: 'Trip not found',
          messageCN: '行程不存在',
          details: { tripId: dto.tripId },
        });
      }

      // 验证资源所有权（如果提供了 requestingUserId）
      if (requestingUserId) {
        const isOwner = trip.TripCollaborator?.some(
          (collab: any) => collab.userId === requestingUserId && collab.role === 'OWNER'
        );
        const metadataUserId = (trip.metadata as any)?.userId;
        const hasAccess = isOwner || metadataUserId === requestingUserId;
        
        if (!hasAccess) {
          throw new ForbiddenException({
            success: false,
            errorCode: '4005',
            message: 'Access denied',
            messageCN: '无权优化此行程',
            details: { tripId: dto.tripId },
          });
        }
      }
    } else {
      throw new BadRequestException({
        success: false,
        errorCode: '5003',
        message: 'PrismaService not available',
        messageCN: '数据库服务不可用',
      });
    }

    // 2. 构建变更意图
    const changeIntent: any = {
      intentId: `optimize_${Date.now()}`,
      type: this.mapOptimizationTypeToChangeIntentType(dto.optimizationType || 'route'),
      target: {
        tripId: dto.tripId,
      },
      to: {},
      constraints: {},
      reason: `Optimize trip: ${dto.optimizationType || 'general'}`,
      urgency: 'normal' as const,
      userConfirmed: true,
    };

    // 根据优化类型和要求设置变更内容
    if (dto.requirements) {
      if (dto.optimizationType === 'budget' && dto.requirements.reduceBudget) {
        changeIntent.to = {
          budget: {
            total: (trip.budgetConfig as any)?.total - dto.requirements.reduceBudget,
          },
        };
      } else if (dto.optimizationType === 'pace' && dto.requirements.slowerPace) {
        const currentPace = (trip.pacingConfig as any)?.pacePreference || 'BALANCED';
        changeIntent.to = {
          pace: currentPace === 'INTENSIVE' ? 'BALANCED' : 'RELAXED',
        };
      } else if (dto.optimizationType === 'activities') {
        changeIntent.to = {
          addActivities: dto.requirements.addActivities || [],
          removeActivities: dto.requirements.removeActivities || [],
        };
      }
    }

    // 3. 调用CoreGateway.applyChangeIntent应用变更
    if (this.coreGateway) {
      try {
        const userId = (trip.metadata as any)?.userId || 'anonymous';
        const coreResult = await this.coreGateway.applyChangeIntent({
          userId,
          tripId: dto.tripId,
          intent: changeIntent,
        });

        if (!coreResult.success) {
          this.logger.warn(`CoreGateway优化行程失败: ${coreResult.error?.message || 'Unknown error'}`);
          throw new BadRequestException({
            success: false,
            errorCode: '4006',
            message: coreResult.error?.message || 'Optimization service failed',
            messageCN: `${coreResult.error?.message || '优化服务失败'}，请稍后重试。`,
          });
        }
        // ExecutionAgent 不可用时 CoreGateway 返回 success:true 但 data.degraded=true
        // 方案2：降级到 TripSuggestionsService.applyHighPrioritySuggestions（应用高优先级建议）
        const data = coreResult.data as { success?: boolean; degraded?: boolean; message?: string } | undefined;
        if (data?.degraded || data?.success === false) {
          this.logger.warn(`CoreGateway 降级响应，尝试方案2: TripSuggestionsService.applyHighPrioritySuggestions`);
          if (this.tripSuggestionsService) {
            try {
              const fallbackResult = await this.tripSuggestionsService.applyHighPrioritySuggestions(
                dto.tripId,
                { preview: false, limit: 10 }
              );
              this.logger.debug(`[方案2] 高优先级建议应用: appliedCount=${fallbackResult.appliedCount}`);
              // 无论 appliedCount 多少，都视为优化完成（已尝试应用建议）
              return { success: true, tripId: dto.tripId };
            } catch (fallbackErr: any) {
              this.logger.warn(`[方案2] 降级优化失败: ${fallbackErr?.message}`);
            }
          }
          const msg = data?.message || '执行服务暂时不可用';
          throw new BadRequestException({
            success: false,
            errorCode: '4007',
            message: msg,
            messageCN: '优化服务暂时不可用，请稍后重试。',
          });
        }
      } catch (error: any) {
        if (error instanceof BadRequestException) throw error;
        this.logger.warn(`CoreGateway优化行程异常: ${error.message}`);
        throw new BadRequestException({
          success: false,
          errorCode: '4008',
          message: error.message || 'Optimization failed',
          messageCN: `优化失败：${error.message || '未知错误'}，请稍后重试。`,
        });
      }
    }

    // 4. 直接更新数据库（如果CoreGateway不可用或失败）
    if (this.prisma && changeIntent.to) {
      try {
        const updateData: any = {};
        
        if (changeIntent.to.budget) {
          updateData.budgetConfig = {
            ...(trip.budgetConfig as any),
            total: changeIntent.to.budget.total,
          };
        }

        if (changeIntent.to.pace) {
          updateData.pacingConfig = {
            ...(trip.pacingConfig as any),
            pacePreference: changeIntent.to.pace,
          };
        }

        if (Object.keys(updateData).length > 0) {
          updateData.updatedAt = new Date();
          await this.prisma.trip.update({
            where: { id: dto.tripId },
            data: updateData,
          });
          this.logger.debug(`行程已优化: tripId=${dto.tripId}, type=${dto.optimizationType}`);
        }
      } catch (error: any) {
        this.logger.error(`更新行程失败: ${error.message}`, error.stack);
        throw new BadRequestException({
          success: false,
          errorCode: '3008',
          message: 'Failed to update trip',
          messageCN: '更新行程失败',
          details: { error: error.message },
        });
      }
    }

    return {
      success: true,
      tripId: dto.tripId,
    };
  }

  /**
   * 检测消息是否为中文
   */
  private isChineseMessage(message: string): boolean {
    if (!message || message.length === 0) {
      return false;
    }
    // 检测中文字符（CJK统一汉字、中文标点等）
    const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
    return chineseRegex.test(message);
  }

  /**
   * 确保会话存在（如果不存在则创建）
   */
  private async ensureSessionExists(sessionId: string, userId?: string): Promise<void> {
    try {
      const state = await this.planningAssistantService.getSessionState(sessionId);
      if (!state) {
        // 会话不存在，手动创建会话状态（使用指定的 sessionId）
        this.logger.debug(`会话不存在，自动创建: sessionId=${sessionId}`);
        const now = new Date().toISOString();
        const newState: any = {
          sessionId,
          userId,
          phase: 'INITIAL',
          preferences: {},
          messageHistory: [],
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
        await (this.planningAssistantService as any).saveSession(newState);
      }
    } catch (error: any) {
      this.logger.warn(`确保会话存在失败: sessionId=${sessionId}, error=${error.message}`);
      // 如果失败，尝试手动创建会话状态
      try {
        const now = new Date().toISOString();
        const newState: any = {
          sessionId,
          userId,
          phase: 'INITIAL',
          preferences: {},
          messageHistory: [],
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
        await (this.planningAssistantService as any).saveSession(newState);
      } catch (createError: any) {
        this.logger.error(`创建会话失败: ${createError.message}`);
      }
    }
  }

  /**
   * 在业务接口调用后更新会话状态
   */
  private async updateSessionAfterBusinessCall(
    sessionId: string,
    updates: {
      message: string;
      response: string;
      phase: string;
      recommendations?: any[];
      planCandidates?: any[];
      searchResults?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string }>;
    }
  ): Promise<void> {
    try {
      // 加载会话状态
      let state = await this.planningAssistantService.getSessionState(sessionId);
      
      if (!state) {
        // 如果会话不存在，创建一个新的
        this.logger.debug(`会话不存在，创建新会话: sessionId=${sessionId}`);
        const userId = updates.recommendations?.[0]?.userId || updates.planCandidates?.[0]?.userId;
        await this.ensureSessionExists(sessionId, userId);
        state = await this.planningAssistantService.getSessionState(sessionId);
      }

      if (!state) {
        this.logger.warn(`无法获取或创建会话: sessionId=${sessionId}`);
        return;
      }

      // 添加用户消息
      const stateAfterUserMessage = (this.planningAssistantService as any).addMessage(state, {
        id: randomUUID(),
        role: 'user',
        content: updates.message,
        timestamp: new Date().toISOString(),
      });

      if (!stateAfterUserMessage) {
        this.logger.warn(`添加用户消息失败: sessionId=${sessionId}`);
        return;
      }

      // 添加助手回复
      const stateAfterAssistantMessage = (this.planningAssistantService as any).addMessage(stateAfterUserMessage, {
        id: randomUUID(),
        role: 'assistant',
        content: updates.response,
        timestamp: new Date().toISOString(),
      });

      if (!stateAfterAssistantMessage) {
        this.logger.warn(`添加助手回复失败: sessionId=${sessionId}`);
        return;
      }

      const finalState = stateAfterAssistantMessage as PlanningConversationState;

      // 更新阶段和推荐/方案
      finalState.phase = updates.phase as any;
      finalState.updatedAt = new Date().toISOString();
      
      if (updates.recommendations) {
        finalState.recommendations = updates.recommendations.map((rec: any) => ({
          id: rec.id || rec.countryCode,
          countryCode: rec.countryCode,
          name: rec.name,
          nameCN: rec.nameCN,
          description: rec.description,
          descriptionCN: rec.descriptionCN,
          highlights: rec.highlights,
          highlightsCN: rec.highlightsCN,
          matchScore: rec.matchScore || 0,
          matchReasons: rec.matchReasons || [],
          matchReasonsCN: rec.matchReasonsCN || [],
          estimatedBudget: rec.estimatedBudget,
          bestSeasons: rec.bestSeasons,
          imageUrl: rec.imageUrl,
          tags: rec.tags || [],
        }));
      }

      if (updates.planCandidates) {
        // 使用转换方法确保类型正确
        finalState.planCandidates = this.convertPlanCandidatesDtoToPlanCandidates(updates.planCandidates);
      }

      if (updates.searchResults && updates.searchResults.length > 0) {
        finalState.searchResults = updates.searchResults.map((r: any) => ({
          title: r.title,
          url: r.url,
          text: r.text,
          publishedDate: r.publishedDate,
        }));
      }

      // 保存会话状态
      await (this.planningAssistantService as any).saveSession(finalState);

      // 清除缓存，强制下次从源获取最新状态
      if (this.cacheService) {
        await this.cacheService.delete(`session:${sessionId}`).catch(() => {});
      }

      this.logger.debug(`会话状态已更新: sessionId=${sessionId}, phase=${updates.phase}`);
    } catch (error: any) {
      this.logger.warn(`更新会话状态失败: sessionId=${sessionId}, error=${error.message}`);
    }
  }

  /**
   * 细化行程
   */
  async refineTrip(dto: RefineTripRequestDto, requestingUserId?: string): Promise<{ success: boolean; tripId: string }> {
    this.logger.debug(`细化行程: tripId=${dto.tripId}, days=${dto.days?.join(',')}`);

    // 验证输入
    if (!dto.tripId) {
      throw new BadRequestException({
        success: false,
        errorCode: '4003',
        message: 'Trip ID is required',
        messageCN: '行程ID必填',
      });
    }

    // 1. 从数据库获取行程数据
    let trip;
    if (this.prisma) {
      trip = await this.prisma.trip.findUnique({
        where: { id: dto.tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: true,
            },
            orderBy: {
              date: 'asc',
            },
          },
          TripCollaborator: true, // 包含协作者信息用于验证所有权
        },
      });

      if (!trip) {
        throw new NotFoundException({
          success: false,
          errorCode: '4002',
          message: 'Trip not found',
          messageCN: '行程不存在',
          details: { tripId: dto.tripId },
        });
      }

      // 验证资源所有权（如果提供了 requestingUserId）
      if (requestingUserId) {
        const isOwner = trip.TripCollaborator?.some(
          (collab: any) => collab.userId === requestingUserId && collab.role === 'OWNER'
        );
        const metadataUserId = (trip.metadata as any)?.userId;
        const hasAccess = isOwner || metadataUserId === requestingUserId;
        
        if (!hasAccess) {
          throw new ForbiddenException({
            success: false,
            errorCode: '4006',
            message: 'Access denied',
            messageCN: '无权细化此行程',
            details: { tripId: dto.tripId },
          });
        }
      }
    } else {
      throw new BadRequestException({
        success: false,
        errorCode: '5003',
        message: 'PrismaService not available',
        messageCN: '数据库服务不可用',
      });
    }

    // 2. 确定要细化的天数
    const totalDays = trip.TripDay.length;
    const daysToRefine = dto.days && dto.days.length > 0
      ? dto.days.filter(day => day >= 1 && day <= totalDays)
      : Array.from({ length: totalDays }, (_, i) => i + 1); // 默认细化所有天数

    if (daysToRefine.length === 0) {
      throw new BadRequestException({
        success: false,
        errorCode: '3009',
        message: 'No valid days to refine',
        messageCN: '没有有效的天数可以细化',
        details: { requestedDays: dto.days, totalDays },
      });
    }

    // 3. 构建变更意图，添加详细信息
    const userId = (trip.metadata as any)?.userId || 'anonymous';
    const changesApplied: string[] = [];

    for (const dayNumber of daysToRefine) {
      const tripDay = trip.TripDay[dayNumber - 1];
      if (!tripDay) continue;

      const changeIntent: any = {
        intentId: `refine_day_${dayNumber}_${Date.now()}`,
        type: 'activity' as const,
        target: {
          tripId: dto.tripId,
          dayIndex: dayNumber - 1,
        },
        to: {
          addDetails: {},
        },
        constraints: {},
        reason: `Refine trip day ${dayNumber}`,
        urgency: 'normal' as const,
        userConfirmed: true,
      };

      // 根据参数添加详细信息
      if (dto.includeRestaurants !== false) {
        changeIntent.to.addDetails.restaurants = true;
        changesApplied.push(`Day ${dayNumber}: Added restaurant recommendations`);
      }

      if (dto.includeTransport !== false) {
        changeIntent.to.addDetails.transport = true;
        changesApplied.push(`Day ${dayNumber}: Added transport details`);
      }

      if (dto.includeActivities !== false) {
        changeIntent.to.addDetails.activities = true;
        changesApplied.push(`Day ${dayNumber}: Added activity details`);
      }

      // 4. 调用CoreGateway应用变更（如果可用）
      if (this.coreGateway && Object.keys(changeIntent.to.addDetails).length > 0) {
        try {
          const coreResult = await this.coreGateway.applyChangeIntent({
            userId,
            tripId: dto.tripId,
            intent: changeIntent,
          });

          if (!coreResult.success) {
            this.logger.warn(`CoreGateway细化行程失败（Day ${dayNumber}）: ${coreResult.error?.message || 'Unknown error'}`);
          }
        } catch (error: any) {
          this.logger.warn(`CoreGateway细化行程异常（Day ${dayNumber}）: ${error.message}`);
        }
      }
    }

    // 5. 更新行程的updatedAt时间戳
    if (this.prisma && changesApplied.length > 0) {
      try {
        await this.prisma.trip.update({
          where: { id: dto.tripId },
          data: {
            updatedAt: new Date(),
            metadata: {
              ...(trip.metadata as any || {}),
              lastRefinedAt: new Date().toISOString(),
              refinedDays: daysToRefine,
            },
          },
        });
        this.logger.debug(`行程已细化: tripId=${dto.tripId}, days=${daysToRefine.join(',')}`);
      } catch (error: any) {
        this.logger.warn(`更新行程元数据失败: ${error.message}`);
      }
    }

    return {
      success: true,
      tripId: dto.tripId,
    };
  }

  /**
   * 获取优化建议
   */
  async getTripSuggestions(tripId: string, requestingUserId?: string): Promise<TripSuggestionsResponseDto> {
    this.logger.debug(`获取优化建议: tripId=${tripId}, requestingUserId=${requestingUserId}`);

    // 验证输入
    if (!tripId) {
      throw new BadRequestException({
        success: false,
        errorCode: '4003',
        message: 'Trip ID is required',
        messageCN: '行程ID必填',
      });
    }

    // 1. 从数据库获取行程数据
    let trip;
    if (this.prisma) {
      trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: true,
            },
            orderBy: {
              date: 'asc',
            },
          },
          TripCollaborator: true, // 包含协作者信息用于验证所有权
        },
      });

      if (!trip) {
        throw new NotFoundException({
          success: false,
          errorCode: '4002',
          message: 'Trip not found',
          messageCN: '行程不存在',
          details: { tripId },
        });
      }

      // 验证资源所有权（如果提供了 requestingUserId）
      if (requestingUserId) {
        const isOwner = trip.TripCollaborator?.some(
          (collab: any) => collab.userId === requestingUserId && collab.role === 'OWNER'
        );
        const metadataUserId = (trip.metadata as any)?.userId;
        const hasAccess = isOwner || metadataUserId === requestingUserId;
        
        if (!hasAccess) {
          throw new ForbiddenException({
            success: false,
            errorCode: '4004',
            message: 'Access denied',
            messageCN: '无权访问此行程',
            details: { tripId },
          });
        }
      }
    } else {
      throw new BadRequestException({
        success: false,
        errorCode: '5003',
        message: 'PrismaService not available',
        messageCN: '数据库服务不可用',
      });
    }

    const suggestions: TripSuggestionDto[] = [];

    // 2. 分析行程的健康度
    const budgetConfig = trip.budgetConfig as any;
    const totalDays = trip.TripDay.length;
    const totalItems = trip.TripDay.reduce((sum, day) => sum + day.ItineraryItem.length, 0);
    const avgItemsPerDay = totalDays > 0 ? totalItems / totalDays : 0;

    // 3. 调用CoreGateway.diagnose诊断行程状态（如果可用）
    let diagnosisResult: any = null;
    if (this.coreGateway) {
      try {
        const userId = (trip.metadata as any)?.userId || 'anonymous';
        const coreResult = await this.coreGateway.getTripStatus({
          userId,
          tripId,
        });

        if (coreResult.success && coreResult.data) {
          diagnosisResult = coreResult.data;
        }
      } catch (error: any) {
        this.logger.warn(`CoreGateway诊断行程失败: ${error.message}`);
      }
    }

    // 4. 生成优化建议

    // 预算相关建议
    if (budgetConfig?.total) {
      // 检查是否有预算超支风险
      if (diagnosisResult?.budget?.overrun) {
        suggestions.push({
          type: 'budget',
          title: 'Budget Overrun Risk',
          titleCN: '预算超支风险',
          description: `Your trip budget may exceed the planned amount. Consider reviewing expenses.`,
          descriptionCN: `您的行程预算可能超出计划金额。建议检查支出。`,
          priority: 'high',
          action: {
            type: 'optimize',
            label: 'Optimize Budget',
            labelCN: '优化预算',
            params: { tripId, optimizationType: 'budget' },
          },
        });
      }

      // 检查预算分配是否合理
      if (!budgetConfig.breakdown || Object.keys(budgetConfig.breakdown).length === 0) {
        suggestions.push({
          type: 'budget',
          title: 'Budget Breakdown Missing',
          titleCN: '缺少预算明细',
          description: `Consider adding a detailed budget breakdown for better planning.`,
          descriptionCN: `建议添加详细的预算明细以便更好地规划。`,
          priority: 'medium',
          action: {
            type: 'refine',
            label: 'Add Budget Details',
            labelCN: '添加预算明细',
            params: { tripId },
          },
        });
      }
    }

    // 节奏相关建议
    if (avgItemsPerDay > 6) {
      suggestions.push({
        type: 'pace',
        title: 'Intensive Schedule',
        titleCN: '行程较紧凑',
        description: `Your trip has an average of ${avgItemsPerDay.toFixed(1)} activities per day, which may be too intensive. Consider slowing down the pace.`,
        descriptionCN: `您的行程平均每天有${avgItemsPerDay.toFixed(1)}个活动，可能过于紧凑。建议放慢节奏。`,
        priority: 'medium',
        action: {
          type: 'optimize',
          label: 'Slow Down Pace',
          labelCN: '放慢节奏',
          params: { tripId, optimizationType: 'pace', requirements: { slowerPace: true } },
        },
      });
    } else if (avgItemsPerDay < 2 && totalDays > 3) {
      suggestions.push({
        type: 'pace',
        title: 'Relaxed Schedule',
        titleCN: '行程较轻松',
        description: `Your trip has an average of ${avgItemsPerDay.toFixed(1)} activities per day. Consider adding more activities to make the most of your trip.`,
        descriptionCN: `您的行程平均每天有${avgItemsPerDay.toFixed(1)}个活动。建议添加更多活动以充分利用行程。`,
        priority: 'low',
        action: {
          type: 'refine',
          label: 'Add Activities',
          labelCN: '添加活动',
          params: { tripId, includeActivities: true },
        },
      });
    }

    // 活动详情建议
    if (totalItems === 0) {
      suggestions.push({
        type: 'activities',
        title: 'No Activities Added',
        titleCN: '尚未添加活动',
        description: `Your trip doesn't have any activities yet. Consider refining the trip to add detailed activities.`,
        descriptionCN: `您的行程尚未添加任何活动。建议细化行程以添加详细活动。`,
        priority: 'high',
        action: {
          type: 'refine',
          label: 'Refine Trip',
          labelCN: '细化行程',
          params: { tripId, includeActivities: true },
        },
      });
    } else {
      // 检查是否有天数缺少活动
      const daysWithoutActivities = trip.TripDay.filter(day => day.ItineraryItem.length === 0);
      if (daysWithoutActivities.length > 0) {
        suggestions.push({
          type: 'activities',
          title: 'Some Days Missing Activities',
          titleCN: '部分天数缺少活动',
          description: `${daysWithoutActivities.length} day(s) don't have any activities. Consider refining those days.`,
          descriptionCN: `有${daysWithoutActivities.length}天没有活动。建议细化这些天数。`,
          priority: 'medium',
          action: {
            type: 'refine',
            label: 'Refine Empty Days',
            labelCN: '细化空白天数',
            params: {
              tripId,
              days: daysWithoutActivities.map((_, index) => trip.TripDay.indexOf(daysWithoutActivities[index]) + 1),
              includeActivities: true,
            },
          },
        });
      }
    }

    // 餐厅建议
    const hasRestaurants = trip.TripDay.some(day =>
      day.ItineraryItem.some(item => item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING')
    );
    if (!hasRestaurants) {
      suggestions.push({
        type: 'restaurants',
        title: 'No Restaurants Added',
        titleCN: '尚未添加餐厅',
        description: `Consider adding restaurant recommendations to your trip for better meal planning.`,
        descriptionCN: `建议添加餐厅推荐以便更好地规划用餐。`,
        priority: 'low',
        action: {
          type: 'refine',
          label: 'Add Restaurants',
          labelCN: '添加餐厅',
          params: { tripId, includeRestaurants: true },
        },
      });
    }

    // 交通建议
    const hasTransport = trip.TripDay.some(day =>
      day.ItineraryItem.some(item => item.type === 'TRANSIT')
    );
    if (!hasTransport && totalDays > 1) {
      suggestions.push({
        type: 'transport',
        title: 'Transport Details Missing',
        titleCN: '缺少交通信息',
        description: `Consider adding transport details between locations for better route planning.`,
        descriptionCN: `建议添加地点之间的交通信息以便更好地规划路线。`,
        priority: 'medium',
        action: {
          type: 'refine',
          label: 'Add Transport',
          labelCN: '添加交通',
          params: { tripId, includeTransport: true },
        },
      });
    }

    return {
      suggestions,
      generatedAt: new Date().toISOString(),
    };
  }

  // ==================== 数据转换辅助方法 ====================

  /**
   * 将SkeletonOptions转换为PlanCandidateDto[]
   * 当有多个方案选项时使用此方法
   * PlanSkeletonSet结构: { options: PlanSkeleton[], recommendation?: { optionId, reason } }
   */
  private convertSkeletonOptionsToPlanCandidates(
    skeletonOptions: any, // PlanSkeletonSet
    planState: any, // PlanState
    personas?: any // PersonaShellOutput
  ): PlanCandidateDto[] {
    if (!skeletonOptions || !skeletonOptions.options || !Array.isArray(skeletonOptions.options)) {
      this.logger.warn('SkeletonOptions格式不正确或为空');
      return [];
    }
    
    const options = skeletonOptions.options;
    const recommendation = skeletonOptions.recommendation;
    
    this.logger.debug(`转换SkeletonOptions: optionsCount=${options.length}, recommendation=${recommendation?.optionId || 'none'}`);
    
    // 从planState提取共享信息
    const destination = this.extractDestination(planState);
    const duration = planState.constraints?.time?.days || 7;
    const baseBudget = this.extractBudget(planState);
    
    // 遍历每个skeleton选项并转换
    const planCandidates: PlanCandidateDto[] = options.map((skeleton: any, index: number) => {
      // 从skeleton提取信息
      const skeletonId = skeleton.id || `skeleton_${index}`;
      const skeletonName = skeleton.name || `方案 ${index + 1}`;
      
      // 从skeleton的rationale提取描述
      const description = skeleton.rationale?.philosophy || `A ${skeletonName.toLowerCase()} travel plan`;
      const descriptionCN = skeleton.rationale?.philosophy || `${skeletonName}旅行方案`;
      
      // 从skeleton的anchors和dayThemes提取亮点
      const highlights: string[] = [];
      if (skeleton.anchors && Array.isArray(skeleton.anchors)) {
        skeleton.anchors
          .filter((a: any) => a.priority === 'anchor')
          .forEach((a: any) => {
            highlights.push(`${a.location}: ${a.activity}`);
          });
      }
      if (skeleton.dayThemes && Array.isArray(skeleton.dayThemes)) {
        skeleton.dayThemes.slice(0, 3).forEach((theme: any) => {
          if (theme.theme) {
            highlights.push(`Day ${theme.day}: ${theme.theme}`);
          }
        });
      }
      
      // 从skeleton的rationale提取strengths和weaknesses
      const strengths = skeleton.rationale?.strengths || [];
      const weaknesses = skeleton.rationale?.weaknesses || [];
      
      // 从skeleton名称推断节奏（如果名称包含相关关键词）
      const pace = this.inferPaceFromSkeletonName(skeletonName);
      
      // 构建PlanCandidateDto
      const planCandidate: PlanCandidateDto = {
        id: skeletonId,
        name: skeletonName,
        nameCN: this.translateSkeletonName(skeletonName),
        description,
        descriptionCN,
        destination,
        duration,
        highlights: highlights.length > 0 ? highlights : ['精心规划的行程', '丰富的活动安排'],
        estimatedBudget: baseBudget, // 使用planState的预算（skeleton本身不包含预算）
        pace,
        suitability: {
          score: this.calculateSuitabilityFromSkeleton(skeleton, recommendation),
          reasons: strengths.length > 0 ? strengths : ['方案设计合理'],
        },
      };
      
      // 添加AI解释（从rationale提取）
      if (skeleton.rationale) {
        planCandidate.explanation = {
          whyRecommended: recommendation?.optionId === skeletonId 
            ? recommendation.reason 
            : skeleton.rationale.philosophy || 'Well-designed travel plan',
          whyRecommendedCN: recommendation?.optionId === skeletonId
            ? recommendation.reason
            : skeleton.rationale.philosophy || '精心设计的旅行方案',
          strengths: strengths,
          strengthsCN: strengths,
          considerations: weaknesses,
          considerationsCN: weaknesses,
        };
      }
      
      // 添加优化建议（如果有weaknesses）
      if (weaknesses.length > 0) {
        planCandidate.optimizationTips = weaknesses.slice(0, 3).map((weakness: string) => ({
          tip: `Consider: ${weakness}`,
          tipCN: `建议：${weakness}`,
          impact: 'medium' as const,
        }));
      }
      
      // 转换personas（如果提供）
      if (personas) {
        planCandidate.personas = this.convertPersonasToEvaluation(personas);
      }
      
      return planCandidate;
    });
    
    return planCandidates;
  }

  /**
   * 从skeleton名称推断节奏
   */
  private inferPaceFromSkeletonName(name: string): 'relaxed' | 'moderate' | 'intensive' {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('relaxed') || nameLower.includes('轻松') || nameLower.includes('slow')) {
      return 'relaxed';
    }
    if (nameLower.includes('intensive') || nameLower.includes('紧凑') || nameLower.includes('fast') || nameLower.includes('packed')) {
      return 'intensive';
    }
    return 'moderate';
  }

  /**
   * 翻译skeleton名称
   */
  private translateSkeletonName(name: string): string {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('relaxed')) return name.replace(/relaxed/gi, '轻松');
    if (nameLower.includes('intensive')) return name.replace(/intensive/gi, '紧凑');
    if (nameLower.includes('balanced')) return name.replace(/balanced/gi, '均衡');
    if (nameLower.includes('compact')) return name.replace(/compact/gi, '紧凑');
    return name;
  }

  /**
   * 从skeleton计算适合度分数
   */
  private calculateSuitabilityFromSkeleton(
    skeleton: any,
    recommendation?: { optionId: string; reason: string }
  ): number {
    let score = 70; // 基础分数
    
    // 如果这是推荐方案，加分
    if (recommendation && recommendation.optionId === skeleton.id) {
      score += 20;
    }
    
    // 根据strengths和weaknesses调整分数
    const strengths = skeleton.rationale?.strengths || [];
    const weaknesses = skeleton.rationale?.weaknesses || [];
    
    score += strengths.length * 5;
    score -= weaknesses.length * 5;
    
    // 确保分数在合理范围内
    return Math.max(50, Math.min(100, score));
  }

  /**
   * 将PlanState转换为PlanCandidateDto
   * 当只有一个方案时使用此方法
   */
  private convertPlanStateToPlanCandidate(
    planState: any, // PlanState
    personas?: any // PersonaShellOutput
  ): PlanCandidateDto {
    this.logger.debug(`转换PlanState: planId=${planState.plan_id || 'unknown'}`);
    
    // 从constraints提取目的地和天数
    const destination = this.extractDestination(planState);
    const duration = planState.constraints?.time?.days || 7;
    
    // 从budget提取预算信息
    const budget = this.extractBudget(planState);
    
    // 从pace提取节奏信息
    const pace = this.determinePaceFromPlanState(planState.pace);
    
    // 从itinerary和metadata提取亮点
    const highlights = this.extractHighlights(planState);
    
    // 从gate和metadata提取警告
    const warnings = this.extractWarnings(planState);
    
    // 构建方案名称和描述
    const { name, nameCN, description, descriptionCN } = this.generatePlanNameAndDescription(
      planState,
      destination,
      duration
    );
    
    // 计算适合度分数（基于gate状态、预算超支情况等）
    const suitability = this.calculateSuitability(planState);
    
    const planCandidate: PlanCandidateDto = {
      id: planState.plan_id || `plan_${Date.now()}`,
      name,
      nameCN,
      description,
      descriptionCN,
      destination,
      duration,
      highlights,
      estimatedBudget: budget,
      pace,
      suitability,
    };

    // 添加警告
    if (warnings.length > 0) {
      planCandidate.warnings = warnings;
    }

    // 转换personas
    if (personas) {
      planCandidate.personas = this.convertPersonasToEvaluation(personas);
    }

    return planCandidate;
  }

  /**
   * 从PlanState提取目的地信息
   */
  private extractDestination(planState: any): string {
    // 优先从world上下文获取
    if (planState.world?.destination) {
      return planState.world.destination.city || planState.world.destination.country || 'Unknown';
    }
    
    // 从metadata获取
    if (planState.metadata?.destination) {
      return planState.metadata.destination;
    }
    
    // 从itinerary的第一个segment获取
    if (planState.itinerary?.segments?.length > 0) {
      const firstSegment = planState.itinerary.segments[0];
      return firstSegment.from?.city || firstSegment.from?.name || 'Unknown';
    }
    
    return 'Unknown';
  }

  /**
   * 从PlanState提取预算信息
   */
  private extractBudget(planState: any): {
    total: number;
    breakdown: {
      flight: number;
      accommodation: number;
      activities: number;
      food: number;
      other: number;
    };
    currency: string;
  } {
    const currency = planState.constraints?.budget?.currency || 'USD';
    
    // 从budget.breakdown提取（BudgetBreakdown有categories数组）
    if (planState.budget?.breakdown?.categories) {
      const categories = planState.budget.breakdown.categories;
      const breakdown = {
        flight: 0,
        accommodation: 0,
        activities: 0,
        food: 0,
        other: 0,
      };
      
      categories.forEach((cat: any) => {
        const estimated = cat.estimated || 0;
        switch (cat.category) {
          case 'transportation':
            breakdown.flight = estimated;
            break;
          case 'accommodation':
            breakdown.accommodation = estimated;
            break;
          case 'tickets':
          case 'experiences':
            breakdown.activities += estimated;
            break;
          case 'food':
            breakdown.food = estimated;
            break;
          case 'buffer':
            breakdown.other = estimated;
            break;
        }
      });
      
      const total = breakdown.flight + breakdown.accommodation + breakdown.activities + breakdown.food + breakdown.other;
      
      return {
        total,
        breakdown,
        currency,
      };
    }
    
    // 从constraints.budget提取
    if (planState.constraints?.budget) {
      const total = planState.constraints.budget.total || 0;
      const categories = planState.constraints.budget.categories || {};
      return {
        total,
        breakdown: {
          flight: categories.transportation || 0,
          accommodation: categories.accommodation || 0,
          activities: (categories.tickets || 0) + (categories.experiences || 0),
          food: categories.food || 0,
          other: categories.buffer || 0,
        },
        currency,
      };
    }
    
    // 默认值
    return {
      total: 0,
      breakdown: {
        flight: 0,
        accommodation: 0,
        activities: 0,
        food: 0,
        other: 0,
      },
      currency,
    };
  }

  /**
   * 从PlanState的pace信息确定节奏
   */
  private determinePaceFromPlanState(paceData: any): 'relaxed' | 'moderate' | 'intensive' {
    if (!paceData) return 'moderate';
    
    // 从fatigueScore推断
    if (paceData.fatigueScore) {
      const score = paceData.fatigueScore.average || paceData.fatigueScore.total || 0;
      if (score > 70) return 'intensive';
      if (score < 40) return 'relaxed';
      return 'moderate';
    }
    
    // 从restPoints推断
    if (paceData.restPoints && Array.isArray(paceData.restPoints)) {
      const restDayRatio = paceData.restPoints.length / (paceData.timeWindows?.length || 7);
      if (restDayRatio > 0.2) return 'relaxed';
      if (restDayRatio < 0.1) return 'intensive';
      return 'moderate';
    }
    
    // 从timeWindows推断
    if (paceData.timeWindows && Array.isArray(paceData.timeWindows)) {
      const avgHours = paceData.timeWindows.reduce((sum: number, tw: any) => {
        return sum + (tw.availableHours || 8);
      }, 0) / paceData.timeWindows.length;
      
      if (avgHours > 10) return 'intensive';
      if (avgHours < 6) return 'relaxed';
      return 'moderate';
    }
    
    return 'moderate';
  }

  /**
   * 从PlanState提取亮点
   */
  private extractHighlights(planState: any): string[] {
    const highlights: string[] = [];
    
    // 从metadata提取
    if (planState.metadata?.highlights && Array.isArray(planState.metadata.highlights)) {
      highlights.push(...planState.metadata.highlights);
    }
    
    // 从itinerary的anchors提取
    if (planState.itinerary?.anchors && Array.isArray(planState.itinerary.anchors)) {
      const anchorHighlights = planState.itinerary.anchors
        .filter((a: any) => a.priority === 'anchor')
        .map((a: any) => `${a.location}: ${a.activity}`);
      highlights.push(...anchorHighlights);
    }
    
    // 从skeleton的rationale提取strengths
    if (planState.metadata?.selectedSkeleton) {
      // 如果有skeleton数据，可以从rationale.strengths提取亮点
      // 当前实现已从planState和skeleton中提取，这里可以添加额外的亮点提取逻辑
    }
    
    return highlights.length > 0 ? highlights : ['精心规划的行程', '丰富的活动安排'];
  }

  /**
   * 从PlanState提取警告
   */
  private extractWarnings(planState: any): string[] {
    const warnings: string[] = [];
    
    // 从gate状态提取警告
    if (planState.gate) {
      if (planState.gate.status === 'BLOCKED') {
        warnings.push(`方案被阻止: ${planState.gate.reason || '未知原因'}`);
      }
      if (planState.gate.status === 'NEEDS_CONFIRM') {
        warnings.push(`需要确认: ${planState.gate.confirmationPoints?.join(', ') || '某些事项'}`);
      }
    }
    
    // 从budget.overrun提取预算警告
    if (planState.budget?.overrun) {
      const overrun = planState.budget.overrun;
      if (overrun.overrunAmount && overrun.overrunAmount > 0) {
        warnings.push(`预算超支: ${overrun.overrunAmount || 0} ${planState.constraints?.budget?.currency || 'USD'}`);
      }
    }
    
    // 从mobility的transferSegments提取交通警告
    if (planState.mobility?.transferSegments) {
      planState.mobility.transferSegments.forEach((segment: any) => {
        if (segment.feasibility === 'needs_confirmation' || segment.feasibility === 'infeasible') {
          warnings.push(`交通段需要确认: ${segment.from.city} → ${segment.to.city}`);
        }
        if (segment.riskFlags && segment.riskFlags.length > 0) {
          segment.riskFlags.forEach((flag: any) => {
            if (flag.severity === 'high') {
              warnings.push(`高风险: ${flag.description}`);
            }
          });
        }
      });
    }
    
    return warnings;
  }

  /**
   * 生成方案名称和描述
   */
  private generatePlanNameAndDescription(
    planState: any,
    destination: string,
    duration: number
  ): { name: string; nameCN: string; description: string; descriptionCN: string } {
    const pace = this.determinePaceFromPlanState(planState.pace);
    const paceName = pace === 'relaxed' ? 'Relaxed' : pace === 'intensive' ? 'Intensive' : 'Balanced';
    const paceNameCN = pace === 'relaxed' ? '轻松' : pace === 'intensive' ? '紧凑' : '均衡';
    
    const name = `${destination} ${duration}-Day ${paceName} Plan`;
    const nameCN = `${destination} ${duration}天${paceNameCN}方案`;
    
    const description = `A ${duration}-day ${pace} travel plan to ${destination}, carefully crafted to balance activities and rest.`;
    const descriptionCN = `一个精心规划的${duration}天${paceNameCN}旅行方案，目的地为${destination}，平衡了活动安排和休息时间。`;
    
    return { name, nameCN, description, descriptionCN };
  }

  /**
   * 计算适合度分数
   */
  private calculateSuitability(planState: any): { score: number; reasons: string[] } {
    let score = 100;
    const reasons: string[] = [];
    
    // 根据gate状态扣分
    if (planState.gate) {
      if (planState.gate.status === 'BLOCKED') {
        score -= 50;
        reasons.push('方案存在阻塞问题');
      } else if (planState.gate.status === 'NEEDS_CONFIRM') {
        score -= 20;
        reasons.push('需要用户确认');
      } else if (planState.gate.status === 'PASSED') {
        reasons.push('方案已通过门控检查');
      }
    }
    
    // 根据预算超支扣分
    if (planState.budget?.overrun?.overrunAmount && planState.budget.overrun.overrunAmount > 0) {
      const totalBudget = planState.constraints?.budget?.total || 1;
      const overrunRatio = planState.budget.overrun.overrunAmount / totalBudget;
      if (overrunRatio > 0.2) {
        score -= 30;
        reasons.push('预算严重超支');
      } else if (overrunRatio > 0.1) {
        score -= 15;
        reasons.push('预算略有超支');
      }
    }
    
    // 根据疲劳评分扣分
    if (planState.pace?.fatigueScore) {
      const fatigueScore = planState.pace.fatigueScore.paceScore || 0;
      if (fatigueScore > 80) {
        score -= 20;
        reasons.push('行程节奏较紧张');
      } else if (fatigueScore < 30) {
        reasons.push('行程节奏轻松');
      }
    }
    
    // 确保分数在合理范围内
    score = Math.max(0, Math.min(100, score));
    
    if (reasons.length === 0) {
      reasons.push('方案质量良好');
    }
    
    return { score, reasons };
  }

  /**
   * 确定节奏（从planState的pace或time_windows推断）
   * 保留此方法以兼容旧的调用方式
   */
  private determinePace(paceData: any): 'relaxed' | 'moderate' | 'intensive' {
    return this.determinePaceFromPlanState(paceData);
  }

  /**
   * 将PersonaShellOutput转换为PersonaEvaluationDto
   */
  private convertPersonasToEvaluation(personas: any): PersonaEvaluationDto | undefined {
    if (!personas) return undefined;

    // 根据PersonaShellOutput的实际结构转换
    // 支持多种可能的PersonaShellOutput结构（已在实现中处理）
    
    return {
      adventurer: {
        score: personas.adventurer?.score || 0,
        comment: personas.adventurer?.comment || '',
        commentCN: personas.adventurer?.commentCN || '',
      },
      planner: {
        score: personas.planner?.score || 0,
        comment: personas.planner?.comment || '',
        commentCN: personas.planner?.commentCN || '',
      },
      relaxer: {
        score: personas.relaxer?.score || 0,
        comment: personas.relaxer?.comment || '',
        commentCN: personas.relaxer?.commentCN || '',
      },
    };
  }

  /**
   * 生成推荐缓存键
   */
  private generateRecommendationsCacheKey(params: RecommendationsRequestDto): string {
    const parts = [
      'recommendations',
      params.filters?.countryCode || 'all',
      params.preferences?.budget?.total || '0',
      params.preferences?.travelers?.adults || '0',
      params.limit || '10',
    ];
    if (params.naturalLanguageDescription) {
      // 使用自然语言描述的哈希值
      const hash = createHash('md5')
        .update(params.naturalLanguageDescription)
        .digest('hex')
        .substring(0, 8);
      parts.push(hash);
    }
    return parts.join(':');
  }

  /**
   * 异步执行方案生成任务
   */
  private async executeGeneratePlanAsync(taskId: string, dto: GeneratePlanRequestDto): Promise<void> {
    if (!this.taskService) {
      this.logger.error('TaskService不可用，无法执行异步任务');
      return;
    }

    try {
      await this.taskService.markProcessing(taskId, '正在生成方案...');
      await this.taskService.updateProgress(taskId, 10, '正在分析需求...');

      // 执行方案生成
      const result = await this.generatePlan({
        ...dto,
        options: dto.options ? { ...dto.options } : undefined, // 移除async选项，避免递归
      });

      await this.taskService.updateProgress(taskId, 90, '正在完成方案...');
      
      // 存储结果
      await this.taskService.markCompleted(taskId, {
        plans: result.plans || [],
        sessionId: result.sessionId,
        generatedAt: result.generatedAt,
        traceId: result.traceId,
      });
      
      this.logger.debug(`异步方案生成完成: taskId=${taskId}, plansCount=${result.plans?.length || 0}`);
    } catch (error: any) {
      this.logger.error(`异步方案生成失败: taskId=${taskId}`, error.stack || error);
      
      // 记录详细的错误信息
      const errorMessage = error instanceof Error 
        ? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
        : String(error);
      
      await this.taskService.markFailed(taskId, errorMessage).catch((markError: any) => {
        this.logger.error(`标记任务失败状态时出错: taskId=${taskId}`, markError);
      });
      
      // 不重新抛出错误，因为这是异步任务，错误已经被记录
    }
  }

  /**
   * 获取默认开始日期（7天后）
   */
  private getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  }

  /**
   * 获取默认结束日期（基于开始日期和天数）
   */
  private getDefaultEndDate(durationDays: number): string {
    const startDate = new Date(this.getDefaultStartDate());
    startDate.setDate(startDate.getDate() + durationDays);
    return startDate.toISOString().split('T')[0];
  }

  /**
   * 从原始方案创建优化后的方案（简单版本，不调用CoreGateway）
   */
  private createOptimizedPlanFromOriginal(
    originalPlan: PlanCandidate,
    dto: OptimizePlanRequestDto
  ): PlanCandidateDto {
    const optimizedPlan: PlanCandidateDto = {
      id: `${originalPlan.id}_optimized_${Date.now()}`,
      name: `${originalPlan.name} (Optimized)`,
      nameCN: `${originalPlan.nameCN} (已优化)`,
      description: originalPlan.description,
      descriptionCN: originalPlan.descriptionCN,
      destination: originalPlan.destination,
      duration: originalPlan.duration,
      estimatedBudget: {
        ...originalPlan.estimatedBudget,
        currency: (originalPlan.estimatedBudget as any).currency || 'CNY',
      },
      pace: originalPlan.pace,
      suitability: { ...originalPlan.suitability },
      highlights: [...(originalPlan.highlights || [])],
      warnings: originalPlan.warnings,
      personas: (originalPlan as any).personas,
    };

    // 应用优化要求
    if (dto.requirements) {
      if (dto.requirements.slowerPace) {
        if (optimizedPlan.pace === 'intensive') {
          optimizedPlan.pace = 'moderate';
        } else if (optimizedPlan.pace === 'moderate') {
          optimizedPlan.pace = 'relaxed';
        }
      }

      if (dto.requirements.reduceBudget !== undefined) {
        optimizedPlan.estimatedBudget.total = Math.max(0, 
          optimizedPlan.estimatedBudget.total - dto.requirements.reduceBudget
        );
        // 按比例调整各分类预算
        const reductionRatio = optimizedPlan.estimatedBudget.total / originalPlan.estimatedBudget.total;
        if (optimizedPlan.estimatedBudget.breakdown) {
          const categories: Array<keyof typeof optimizedPlan.estimatedBudget.breakdown> = 
            ['flight', 'accommodation', 'activities', 'food', 'other'];
          categories.forEach(category => {
            if (originalPlan.estimatedBudget.breakdown[category] !== undefined) {
              optimizedPlan.estimatedBudget.breakdown[category] = 
                Math.round(originalPlan.estimatedBudget.breakdown[category] * reductionRatio);
            }
          });
        }
      }

      if (dto.requirements.addActivities && dto.requirements.addActivities.length > 0) {
        optimizedPlan.highlights = [
          ...(optimizedPlan.highlights || []),
          ...dto.requirements.addActivities,
        ];
      }

      if (dto.requirements.removeActivities && dto.requirements.removeActivities.length > 0) {
        optimizedPlan.highlights = (optimizedPlan.highlights || []).filter(
          h => !dto.requirements!.removeActivities!.includes(h)
        );
      }
    }

    // 更新描述
    optimizedPlan.description = `Optimized version of ${originalPlan.name}. ${dto.optimizationType ? `Optimized for ${dto.optimizationType}.` : ''}`;
    optimizedPlan.descriptionCN = `${originalPlan.nameCN}的优化版本。${dto.optimizationType ? `针对${dto.optimizationType}进行了优化。` : ''}`;

    return optimizedPlan;
  }

  /**
   * 从用户消息解析优化类型
   */
  private parseOptimizationTypeFromMessage(message: string): 'pace' | 'budget' | 'route' | 'activities' {
    const lower = message.toLowerCase();
    if (lower.includes('节奏') || lower.includes('pace') || lower.includes('慢一点') || lower.includes('轻松')) return 'pace';
    if (lower.includes('预算') || lower.includes('budget') || lower.includes('省钱') || lower.includes('便宜')) return 'budget';
    if (lower.includes('活动') || lower.includes('activities') || lower.includes('景点') || lower.includes('行程安排')) return 'activities';
    return 'route'; // 默认：路线/行程优化
  }

  /**
   * 将优化类型映射到变更意图类型
   */
  private mapOptimizationTypeToChangeIntentType(
    optimizationType: 'pace' | 'budget' | 'route' | 'activities'
  ): 'destination' | 'schedule' | 'activity' | 'accommodation' | 'transport' {
    switch (optimizationType) {
      case 'pace':
      case 'route':
        return 'schedule';
      case 'budget':
        return 'accommodation'; // 预算优化通常涉及住宿
      case 'activities':
        return 'activity';
      default:
        return 'schedule';
    }
  }

  /**
   * 将PlanCandidate转换为PlanCandidateDto
   */
  private convertPlanCandidateToDto(plan: PlanCandidate): PlanCandidateDto {
    return {
      id: plan.id,
      name: plan.name,
      nameCN: plan.nameCN,
      description: plan.description,
      descriptionCN: plan.descriptionCN,
      destination: plan.destination,
      duration: plan.duration,
      highlights: plan.highlights || [],
      estimatedBudget: {
        total: plan.estimatedBudget.total,
        breakdown: plan.estimatedBudget.breakdown,
        currency: (plan.estimatedBudget as any).currency || 'CNY',
      },
      pace: plan.pace,
      suitability: plan.suitability,
      warnings: plan.warnings,
      personas: (plan as any).personas,
    };
  }

  /**
   * 更新会话状态的辅助方法
   * 统一处理会话状态更新逻辑，包括保存和缓存清理
   */
  private async updateSessionState(
    sessionId: string,
    updates: Partial<PlanningConversationState>
  ): Promise<void> {
    try {
      const state = await this.planningAssistantService.getSessionState(sessionId);
      if (!state) {
        this.logger.warn(`会话不存在，无法更新: sessionId=${sessionId}`);
        return;
      }

      const updatedState: PlanningConversationState = {
        ...state,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // 保存更新后的状态（通过内部方法）
      await (this.planningAssistantService as any).saveSession(updatedState);

      // 清除缓存，强制下次从源获取最新状态
      if (this.cacheService) {
        await this.cacheService.delete(`session:${sessionId}`).catch(() => {});
      }

      this.logger.debug(`会话状态已更新: sessionId=${sessionId}, updates=${Object.keys(updates).join(',')}`);
    } catch (error: any) {
      this.logger.warn(`更新会话状态失败: sessionId=${sessionId}, error=${error.message}`);
    }
  }

  /**
   * 从参数和行程上下文获取酒店入住/退房日期
   * 优先级：extractedParams > 消息内日历日期 > 话术限定「第 N 晚/第 N 天住」推导间夜 > extractDatesFromMessage > trip 整段
   */
  private async getHotelDatesFromContext(
    params: Record<string, any>,
    dto: ChatRequestDto
  ): Promise<{ checkIn?: string; checkOut?: string }> {
    const checkIn = params.checkIn || params.checkin;
    const checkOut = params.checkOut || params.checkout;
    if (checkIn && checkOut) {
      return {
        checkIn: typeof checkIn === 'string' ? checkIn.split('T')[0] : String(checkIn).split('T')[0],
        checkOut: typeof checkOut === 'string' ? checkOut.split('T')[0] : String(checkOut).split('T')[0],
      };
    }
    let tripStart: string | undefined;
    let tripEnd: string | undefined;
    if (dto.context?.tripId && this.prisma) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: dto.context.tripId },
          select: { startDate: true, endDate: true },
        });
        if (trip?.startDate && trip?.endDate) {
          tripStart = new Date(trip.startDate).toISOString().split('T')[0];
          tripEnd = new Date(trip.endDate).toISOString().split('T')[0];
        }
      } catch (e: any) {
        this.logger.debug(`获取行程日期失败: ${e?.message}`);
      }
    }

    const msg = dto.message ?? '';
    const fromNl = parseExplicitStayWindowFromUserMessage(msg, {
      tripStartYmd: tripStart,
      tripEndYmd: tripEnd,
    });
    if (fromNl?.checkIn && fromNl?.checkOut) {
      this.logger.debug(`从用户消息解析入住窗口: checkIn=${fromNl.checkIn}, checkOut=${fromNl.checkOut}`);
      return { checkIn: fromNl.checkIn, checkOut: fromNl.checkOut };
    }

    /** 「第1天住哪」「第2晚酒店」等：无具体数字日期时仍应从行程锚点推导该间夜的 checkIn/checkOut，避免澄清卡默认整段行程 */
    if (tripStart && tripEnd) {
      const totalNights = countStayNightsBetweenInclusive(tripStart, tripEnd);
      const scope = parseExplicitHotelNightScopeIndices(msg, totalNights);
      if (scope && scope.length > 0) {
        const sorted = [...scope].sort((a, b) => a - b);
        const contiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
        if (sorted.length === 1 || contiguous) {
          const minN = sorted[0];
          const maxN = sorted[sorted.length - 1];
          const ci = addDaysYmd(tripStart, minN);
          const co = addDaysYmd(tripStart, maxN + 1);
          if (co > ci) {
            this.logger.debug(
              `从话术限定间夜推导入住窗口: nights=${sorted.map((i) => i + 1).join(',')} -> ${ci} ~ ${co}`,
            );
            return { checkIn: ci, checkOut: co };
          }
        }
      }
    }

    const refForExtract = tripStart || tripEnd;
    const fromLegacy = this.extractDatesFromMessage(msg, refForExtract);
    if (fromLegacy.checkIn && fromLegacy.checkOut) {
      return { checkIn: fromLegacy.checkIn, checkOut: fromLegacy.checkOut };
    }

    if (tripStart && tripEnd) {
      this.logger.debug(`从行程获取日期: checkIn=${tripStart}, checkOut=${tripEnd}`);
      return { checkIn: tripStart, checkOut: tripEnd };
    }

    return {};
  }

  /**
   * 判断用户消息是否为确认（好的/是/可以/确认/yes/ok 等）
   * 用于日期澄清阶段：当有建议日期时，用户回复确认即可使用建议日期
   */
  private isDateConfirmation(message: string): boolean {
    const s = message.trim().toLowerCase();
    const confirmPatterns = [
      /^(好的|可以|是的|确认|用这个|就用这个|用行程的|就用行程|行|好|成)$/,
      /^(ok|yes|sure|confirm|use these|use trip|sounds good|go ahead)$/,
    ];
    return confirmPatterns.some((p) => p.test(s));
  }

  /**
   * 格式化日期用于展示（如澄清话术）
   * 2026-02-22 -> 2026年2月22日（中文）或 Feb 22, 2026（英文）
   */
  private formatDateForDisplay(isoDate: string, isChinese: boolean): string {
    try {
      const d = new Date(isoDate);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      if (isChinese) return `${y}年${m}月${day}日`;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[m - 1]} ${day}, ${y}`;
    } catch {
      return isoDate;
    }
  }

  /**
   * 从用户消息中解析人数（如「2人」「3人」）
   */
  private extractGuestsFromMessage(message: string): number | null {
    const m = message.trim().match(/(\d+)\s*人/);
    if (m) {
      const n = parseInt(m[1], 10);
      return n >= 1 && n <= 20 ? n : null;
    }
    return null;
  }

  /** 国家代码 → 主要机场 IATA 映射（用于从行程推断航班目的地） */
  private static readonly COUNTRY_TO_MAIN_AIRPORT: Record<string, string> = {
    IS: 'KEF', // 冰岛
    JP: 'NRT', // 日本
    CN: 'PEK', // 中国
    TH: 'BKK', // 泰国
    AU: 'SYD', // 澳大利亚
    GB: 'LHR', // 英国
    FR: 'CDG', // 法国
    US: 'JFK', // 美国
    SG: 'SIN', // 新加坡
    KR: 'ICN', // 韩国
    HK: 'HKG', // 香港
    NO: 'OSL', // 挪威
    IT: 'FCO', // 意大利
    ES: 'MAD', // 西班牙
    DE: 'FRA', // 德国
  };

  private getMainAirportFromCountryCode(countryCode: string): string {
    return (
      PlanningAssistantV2Service.COUNTRY_TO_MAIN_AIRPORT[countryCode?.toUpperCase() || ''] ||
      countryCode?.toUpperCase() ||
      ''
    );
  }

  private getCountryNameFromCodeForFlight(countryCode: string): string {
    const names: Record<string, string> = {
      IS: '冰岛雷克雅未克',
      JP: '日本',
      CN: '中国',
      TH: '泰国曼谷',
      AU: '澳大利亚悉尼',
      GB: '英国伦敦',
      FR: '法国巴黎',
      US: '美国',
      SG: '新加坡',
      KR: '韩国首尔',
    };
    return names[countryCode?.toUpperCase() || ''] || '';
  }

  /**
   * 根据用户偏好确定住宿数据的展示语言
   * 优先级：dto.language > userCountryCode 映射 > 消息语言推断
   */
  private getLanguageForAccommodation(dto: ChatRequestDto): string {
    if (dto.language === 'zh' || dto.language === 'en') return dto.language;
    const cc = dto.context?.userCountryCode?.toUpperCase();
    if (cc) {
      const langMap: Record<string, string> = {
        CN: 'zh', TW: 'zh-TW', HK: 'zh-TW', MO: 'zh-TW',
        JP: 'ja', KR: 'ko',
        DE: 'de', FR: 'fr', ES: 'es', IT: 'it', PT: 'pt',
        TH: 'th', VI: 'vi', ID: 'id', MY: 'ms',
      };
      const lang = langMap[cc];
      if (lang) return lang;
    }
    return this.isChineseMessage(dto.message) ? 'zh' : 'en';
  }

  /**
   * 从用户消息中解析出发地（航班澄清阶段）
   * 支持：北京、上海、PEK、从北京出发、从上海、中国杭州
   */
  private extractOriginFromMessage(message: string): string | null {
    const s = message.trim();
    if (!s || s.length < 2) return null;
    // 去除常见前缀（包括国家名称）
    const cleaned = s
      .replace(/^(从|出发地|自|由)\s*/i, '')
      .replace(/^(中国|日本|韩国|美国|英国|法国|德国|澳大利亚|新加坡|泰国|马来西亚|印度尼西亚|越南|菲律宾|印度)\s*/i, '')
      .replace(/\s*(出发|出发地)$/i, '')
      .trim();
    if (cleaned.length < 2) return null;
    // 3 位大写字母视为 IATA 代码
    if (/^[A-Z]{3}$/i.test(cleaned)) return cleaned.toUpperCase();
    return cleaned;
  }

  /**
   * 生成航班预订/比价链接（Google Flights）
   */
  private getFlightBookingUrl(origin: string, destination: string, departureDate: string): string {
    const o = this.resolveFlightLocationToIata(origin);
    const d = this.resolveFlightLocationToIata(destination);
    const date = departureDate.split('T')[0];
    return `https://www.google.com/travel/flights?q=Flights%20from%20${encodeURIComponent(o)}%20to%20${encodeURIComponent(d)}%20on%20${date}`;
  }

  /** 城市名 → IATA 代码（用于航班预订链接） */
  private static readonly FLIGHT_LOCATION_IATA: Record<string, string> = {
    北京: 'PEK', 上海: 'PVG', 广州: 'CAN', 深圳: 'SZX', 成都: 'CTU', 杭州: 'HGH', 西安: 'XIY',
    悉尼: 'SYD', 曼谷: 'BKK', 东京: 'NRT', 大阪: 'KIX', 首尔: 'ICN', 新加坡: 'SIN', 香港: 'HKG',
    伦敦: 'LHR', 巴黎: 'CDG', 纽约: 'JFK', 洛杉矶: 'LAX', 旧金山: 'SFO', 雷克雅未克: 'KEF',
  };

  private resolveFlightLocationToIata(input: string): string {
    const s = input?.trim() || '';
    if (s.length === 3 && /^[A-Z]{3}$/i.test(s)) return s.toUpperCase();
    return PlanningAssistantV2Service.FLIGHT_LOCATION_IATA[s] || s.toUpperCase();
  }

  /**
   * 航班去重（按 id 保留首次出现；无 id 时用行程+价格生成指纹）
   */
  private deduplicateFlights(flights: any[]): any[] {
    const seen = new Set<string>();
    return flights.filter((f) => {
      let key = f?.id;
      if (!key) {
        const seg0 = f?.itineraries?.[0]?.segments?.[0];
        const dep = seg0?.departure;
        key = [dep?.iataCode, seg0?.carrierCode, seg0?.number, dep?.at, f?.price?.total]
          .filter(Boolean)
          .join('|') || `fallback_${seen.size}`;
      }
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 为航班结果添加预订链接和卡片操作
   */
  private enrichFlightsWithActions(
    flights: any[],
    origin: string,
    destination: string,
    departureDate: string
  ): any[] {
    const deduped = this.deduplicateFlights(flights);
    const bookingUrl = this.getFlightBookingUrl(origin, destination, departureDate);
    return deduped.map((f, i) => ({
      ...f,
      bookingUrl,
      actions: [
        { action: 'view_flight_detail', label: 'View Details', labelCN: '查看详情', params: { flightIndex: i } },
        { action: 'add_flight_to_itinerary', label: 'Add to Trip', labelCN: '加入行程', params: { flightIndex: i } },
        { action: 'book_flight', label: 'Book', labelCN: '预订', params: { flightIndex: i, bookingUrl } },
      ],
    }));
  }

  /**
   * 为铁路路线添加卡片操作（查看详情、加入行程、预订）
   */
  private enrichRailRoutesWithActions(routes: any[]): any[] {
    return routes.map((r, i) => {
      const actions: any[] = [
        { action: 'view_rail_detail', label: 'View Details', labelCN: '查看详情', params: { routeIndex: i } },
        { action: 'add_rail_to_itinerary', label: 'Add to Trip', labelCN: '加入行程', params: { routeIndex: i } },
      ];
      if (r.bookingUrl) {
        actions.push({
          action: 'book_rail',
          label: 'Book',
          labelCN: '预订',
          params: { routeIndex: i, bookingUrl: r.bookingUrl },
        });
      }
      return { ...r, actions };
    });
  }

  /**
   * 从用户消息中解析铁路出行日期（单日）
   * 支持：明天、后天、3月15日、3/15、2026-03-15、March 15、tomorrow、rail_date-tomorrow
   */
  private extractRailDepartureDate(message: string): string | null {
    const s = message.trim();
    const now = new Date();
    if (s === 'rail_date-tomorrow' || s === '明天') {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    if (s === 'rail_date-day-after' || s === '后天') {
      const d = new Date(now); d.setDate(d.getDate() + 2);
      return d.toISOString().split('T')[0];
    }
    const y = now.getFullYear();
    const iso = s.match(/(\d{4}-\d{2}-\d{2})(?:\s*[T\s](\d{1,2}):?(\d{2})?)?/);
    if (iso) return iso[2] ? `${iso[1]}T${iso[2].padStart(2, '0')}:${(iso[3] || '00').padStart(2, '0')}:00` : iso[1];
    const cn = s.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (cn) return `${y}-${cn[1].padStart(2, '0')}-${cn[2].padStart(2, '0')}`;
    const slash = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (slash) return `${slash[3] || y}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
    const tomorrowZh = /\b(明天|后天|大后天)\b/.exec(s);
    if (tomorrowZh) {
      const days: Record<string, number> = { 明天: 1, 后天: 2, 大后天: 3 };
      const d = new Date(now); d.setDate(d.getDate() + (days[tomorrowZh[1]] || 1));
      return d.toISOString().split('T')[0];
    }
    const tomorrowEn = /\b(tomorrow|day after tomorrow)\b/i.exec(s);
    if (tomorrowEn) {
      const days = tomorrowEn[1].toLowerCase() === 'tomorrow' ? 1 : 2;
      const d = new Date(now); d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    }
    const monthEn = s.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
    if (monthEn) {
      const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
      const m = months[monthEn[1].toLowerCase()];
      if (m) return `${y}-${String(m).padStart(2, '0')}-${monthEn[2].padStart(2, '0')}`;
    }
    return null;
  }

  /**
   * 从用户消息中解析入住/退房日期
   * 支持：YYYY-MM-DD、3月15日、3/15、3月15号 等格式
   * @param referenceDate 参考日期（如 YYYY-MM-DD），用于无年份时的年份推断，优先与行程一致
   */
  private extractDatesFromMessage(message: string, referenceDate?: string): { checkIn?: string; checkOut?: string } {
    const s = message.trim();
    const refYear = referenceDate ? new Date(referenceDate.split('T')[0]).getFullYear() : null;
    const fallbackYear = refYear ?? new Date().getFullYear();
    // ISO: 2026-03-15 或 2026-03-15 到 2026-03-20
    const isoRange = s.match(/(\d{4}-\d{2}-\d{2})\s*(?:到|至|-|~)\s*(\d{4}-\d{2}-\d{2})/);
    if (isoRange) return { checkIn: isoRange[1], checkOut: isoRange[2] };
    const isoSingle = s.match(/(\d{4}-\d{2}-\d{2})/g);
    if (isoSingle && isoSingle.length >= 2) return { checkIn: isoSingle[0], checkOut: isoSingle[1] };
    // 中文: 3月15日 到 3月20日（无年份时使用 referenceDate 或当前年，保证与行程一致）
    const cnRange = s.match(/(\d{1,2})月(\d{1,2})[日号]?\s*(?:到|至|-|~)\s*(\d{1,2})月(\d{1,2})[日号]?/);
    if (cnRange) {
      const y = fallbackYear;
      const c1 = `${y}-${cnRange[1].padStart(2, '0')}-${cnRange[2].padStart(2, '0')}`;
      const c2 = `${y}-${cnRange[3].padStart(2, '0')}-${cnRange[4].padStart(2, '0')}`;
      return { checkIn: c1, checkOut: c2 };
    }
    // 斜杠: 3/15 - 3/20
    const slashRange = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:到|至|-|~)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (slashRange) {
      const y = slashRange[3] || slashRange[6] || String(fallbackYear);
      const c1 = `${y}-${slashRange[1].padStart(2, '0')}-${slashRange[2].padStart(2, '0')}`;
      const c2 = `${y}-${slashRange[4].padStart(2, '0')}-${slashRange[5].padStart(2, '0')}`;
      return { checkIn: c1, checkOut: c2 };
    }
    return {};
  }

  /**
   * 将PlanCandidateDto[]转换为PlanCandidate[]
   */
  private convertPlanCandidatesDtoToPlanCandidates(plans: PlanCandidateDto[]): PlanCandidate[] {
    return plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      nameCN: plan.nameCN,
      description: plan.description,
      descriptionCN: plan.descriptionCN,
      destination: plan.destination,
      duration: plan.duration,
      highlights: plan.highlights || [],
      estimatedBudget: {
        total: plan.estimatedBudget.total,
        breakdown: plan.estimatedBudget.breakdown,
      },
      pace: plan.pace,
      suitability: plan.suitability,
      warnings: plan.warnings,
    }));
  }

  /**
   * 记录性能指标
   */
  private recordPerformanceMetric(methodName: string, duration: number): void {
    const metric = this.performanceMetrics.get(methodName) || { count: 0, totalTime: 0, avgTime: 0 };
    metric.count++;
    metric.totalTime += duration;
    metric.avgTime = metric.totalTime / metric.count;
    this.performanceMetrics.set(methodName, metric);
    
    // 记录慢查询（超过1秒）
    if (duration > 1000) {
      this.logger.warn({
        event: 'slow_operation',
        method: methodName,
        duration,
        avgTime: metric.avgTime,
        count: metric.count,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 获取性能指标（用于监控和调试）
   */
  getPerformanceMetrics(): Record<string, { count: number; totalTime: number; avgTime: number }> {
    const result: Record<string, { count: number; totalTime: number; avgTime: number }> = {};
    this.performanceMetrics.forEach((value, key) => {
      result[key] = { ...value };
    });
    return result;
  }

  /**
   * 重置性能指标
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics.clear();
  }

  /**
   * 将酒店结果映射为标准 AccommodationItemDto
   */
  private mapHotelToAccommodation(item: any): AccommodationItemDto {
    const placeId = item.placeId || item.id || String(item.id);
    return {
      id: placeId,
      source: 'hotel',
      name: item.name || '',
      address: item.address,
      location: item.location ? { lat: item.location.lat, lng: item.location.lng } : undefined,
      rating: item.rating,
      ratingCount: item.userRatingsTotal,
      priceLevel: item.priceLevel,
      url: placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : undefined,
      photoUrl: typeof item.photos?.[0] === 'string' ? item.photos[0] : undefined,
    };
  }

  /**
   * 将 Airbnb 原始结果映射为标准 AccommodationItemDto
   */
  private mapAirbnbToAccommodation(listing: any): AccommodationItemDto {
    const id = listing.id || listing.listingId || String(listing.id);
    const name =
      listing.demandStayListing?.description?.name?.localizedStringWithTranslationPreference ||
      listing.name ||
      '';
    const coord = listing.demandStayListing?.location?.coordinate;
    const lat = coord?.latitude ?? listing.location?.lat;
    const lng = coord?.longitude ?? listing.location?.lng;
    const price =
      listing.structuredDisplayPrice?.primaryLine?.accessibilityLabel ||
      listing.structuredDisplayPrice?.primaryLine?.text;
    // 支持多种 Airbnb 图片字段：geobio MCP (contextualPictures)、SearchAPI (images)、photos 等
    const photoUrl =
      listing.contextualPictures?.[0]?.picture ||
      listing.contextualPictures?.[0]?.url ||
      (Array.isArray(listing.images) && listing.images[0] ? listing.images[0] : undefined) ||
      listing.photos?.[0]?.url ||
      (typeof listing.photos?.[0] === 'string' ? listing.photos[0] : undefined) ||
      listing.demandStayListing?.photos?.[0]?.url ||
      listing.demandStayListing?.photos?.[0]?.picture;
    const photos: string[] | undefined = Array.isArray(listing.images)
      ? listing.images.filter((u: any) => typeof u === 'string')
      : listing.photos?.map((p: any) => (typeof p === 'string' ? p : p?.url || p?.picture)).filter(Boolean);
    // 地址：优先用详情接口返回的真实地址，不用 room specs（如 "1 bedroom, 1 queen bed"）
    const rawAddr =
      listing._enrichedAddress ||
      listing.demandStayListing?.location?.address ||
      listing.address;
    const isRoomSpecs = (s: string) => /^\d+\s*(bedroom|bed|bath|room)s?/i.test(s) || /^\d+\s*[bB]ed/.test(s);
    const address = rawAddr && !isRoomSpecs(String(rawAddr)) ? rawAddr : undefined;
    const roomSpecs = listing.structuredContent?.primaryLine;

    return {
      id,
      source: 'airbnb',
      name,
      address,
      roomSpecs,
      location: lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : undefined,
      rating: listing.avgRating != null ? Number(listing.avgRating) : undefined,
      ratingCount: listing.reviewsCount,
      price,
      url: listing.url,
      photoUrl: photoUrl || (photos?.length ? photos[0] : undefined),
      photos: photos?.length ? photos : undefined,
    };
  }

  /**
   * 解析 Exa MCP 返回的 Markdown 格式（当 content.text 非 JSON 时）
   * 格式示例:
   *   Title: 冰岛十大必去景点
   *   Published Date: 2026-02-19T15:09:39.989Z
   *   URL: https://...
   *   Text: 内容...
   */
  private parseExaMarkdownResults(rawText: string): Array<{ title?: string; url?: string; publishedDate?: string; text?: string }> {
    if (!rawText || typeof rawText !== 'string') return [];
    const blocks = rawText.split(/\n(?=Title:)/i).filter((b) => b.trim().length > 0 && /Title:/i.test(b));
    const results: Array<{ title?: string; url?: string; publishedDate?: string; text?: string }> = [];
    for (const block of blocks) {
      const titleMatch = block.match(/Title:\s*(.+?)(?=\n|$)/s);
      const urlMatch = block.match(/URL:\s*(.+?)(?=\n|$)/s);
      const dateMatch = block.match(/Published Date:\s*(.+?)(?=\n|$)/s);
      const textMatch = block.match(/Text:\s*([\s\S]+?)(?=\n(?:Title:)|$)/s);
      if (titleMatch || urlMatch || textMatch) {
        results.push({
          title: titleMatch?.[1]?.trim(),
          url: urlMatch?.[1]?.trim(),
          publishedDate: dateMatch?.[1]?.trim(),
          text: textMatch?.[1]?.trim(),
        });
      }
    }
    return results;
  }

  /**
   * 从攻略搜索结果中提取景点并加入行程
   */
  private async handleAddAttractionsFromSearch(
    searchResults: Array<{ title?: string; url?: string; text?: string }>,
    tripId: string,
    countryCode: string,
    dto: ChatRequestDto,
    isChinese: boolean
  ): Promise<ChatResponseDto | null> {
    if (!this.itineraryItemsService || !this.prisma || !this.llmService) return null;
    const combinedText = searchResults
      .map((r) => `${r.title || ''}\n${r.text || ''}`)
      .join('\n\n')
      .slice(0, 4000);
    if (!combinedText.trim()) return null;

    let attractionNames: string[] = [];
    try {
      const prompt = `你是一个旅游攻略解析助手。从攻略内容中提取景点/必去地点名称（中英文均可）。只输出景点名，每行一个，不要编号、不要解释、不要其他文字。最多提取10个。

攻略内容：
${combinedText}`;
      const text = (await this.llmService.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt)).trim();
      attractionNames = text
        .split(/[\n,，、;；]/)
        .map((s) => s.replace(/^\d+[.．\s]*/, '').trim())
        .filter((s) => s.length >= 2 && s.length <= 50);
      attractionNames = [...new Set(attractionNames)].slice(0, 8);
    } catch (err: any) {
      this.logger.warn(`LLM 提取景点失败: ${err.message}`);
      return null;
    }

    if (attractionNames.length === 0) {
      return {
        message: 'Could not extract attractions from the guides',
        messageCN: '未能从攻略中提取到景点信息',
        reply: isChinese ? '未能从攻略中提取到景点信息' : 'Could not extract attractions',
        replyCN: '未能从攻略中提取到景点信息',
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        routing: { target: 'chat', reason: 'Extraction failed', params: {} },
      };
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripDay: { orderBy: { date: 'asc' } } },
    });
    if (!trip || !trip.TripDay?.length) {
      return {
        message: 'Trip not found or has no days',
        messageCN: '行程不存在或没有行程日',
        reply: isChinese ? '行程不存在或没有行程日' : 'Trip not found',
        replyCN: '行程不存在或没有行程日',
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        routing: { target: 'chat', reason: 'Trip not found', params: {} },
      };
    }

    const firstDay = trip.TripDay[0];
    const baseDate = DateTime.fromJSDate(firstDay.date, { zone: 'utc' });
    let added = 0;
    let lastEnd = baseDate.set({ hour: 9, minute: 0, second: 0 });

    for (const name of attractionNames) {
      try {
        const startTime = lastEnd.toISO()!;
        const endTime = lastEnd.plus({ hours: 2 }).toISO()!;
        lastEnd = lastEnd.plus({ hours: 2, minutes: 30 });

        await this.itineraryItemsService.create({
          tripDayId: firstDay.id,
          placeName: name,
          type: ItemType.ACTIVITY,
          startTime,
          endTime,
          forceCreate: true,
        });
        added++;
      } catch (e: any) {
        this.logger.warn(`添加行程项失败: ${name}, ${e.message}`);
      }
    }

    const messageCN = added > 0
      ? `已从攻略中提取 ${attractionNames.length} 个景点，成功加入 ${added} 个到行程第1天。`
      : '提取到景点但加入行程失败，请稍后重试。';
    await this.updateSessionAfterBusinessCall(dto.sessionId, {
      message: dto.message,
      response: messageCN,
      phase: 'RECOMMENDING',
    }).catch((err) => this.logger.warn(`更新会话状态失败: ${err.message}`));
    return {
      message: added > 0 ? `Added ${added} attractions from guides to Day 1` : 'Failed to add attractions',
      messageCN,
      reply: messageCN,
      replyCN: messageCN,
      phase: 'RECOMMENDING',
      sessionId: dto.sessionId,
      routing: { target: 'chat', reason: 'Added attractions from search', params: {} },
    };
  }

  /**
   * 将酒店/Airbnb 混合结果统一映射为 accommodations
   */
  private mapToAccommodations(results: any[], source: 'hotel' | 'airbnb'): AccommodationItemDto[] {
    if (!results || !Array.isArray(results)) return [];
    return results.map((item) =>
      source === 'hotel' ? this.mapHotelToAccommodation(item) : this.mapAirbnbToAccommodation(item)
    );
  }

  /**
   * 获取入住日当天行程项及其坐标（用于计算酒店距离）
   */
  private async getItineraryPlacesWithCoords(
    tripId: string,
    dateStr: string
  ): Promise<Array<{ lat: number; lng: number; placeName: string }>> {
    if (!this.prisma) return [];
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ nameEN: string | null; nameCN: string; lat: number; lng: number }>
      >`
        SELECT p."nameEN", p."nameCN",
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng
        FROM "ItineraryItem" ii
        JOIN "TripDay" td ON ii."tripDayId" = td.id
        JOIN "Place" p ON ii."placeId" = p.id
        WHERE td."tripId" = ${tripId}
          AND td.date::date = ${dateStr}::date
          AND p.location IS NOT NULL
        ORDER BY ii."order" ASC NULLS LAST, ii."startTime" ASC NULLS LAST
      `;
      return rows
        .filter((r) => r.lat != null && r.lng != null && !Number.isNaN(Number(r.lat)) && !Number.isNaN(Number(r.lng)))
        .map((r) => ({
          lat: Number(r.lat),
          lng: Number(r.lng),
          placeName: (r.nameEN || r.nameCN || '').trim() || '行程点',
        }));
    } catch (e: any) {
      this.logger.debug(`获取行程项坐标失败: ${e?.message}`);
      return [];
    }
  }

  /**
   * Haversine 公式计算两点距离（公里）
   */
  private haversineDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // 地球半径 km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 为住宿项补充距最近行程点的距离
   */
  private enrichAccommodationsWithDistance(
    accommodations: AccommodationItemDto[],
    itineraryPlaces: Array<{ lat: number; lng: number; placeName: string }>
  ): AccommodationItemDto[] {
    return accommodations.map((acc) => {
      const loc = acc.location;
      if (!loc || loc.lat == null || loc.lng == null) return acc;
      let minDist = Infinity;
      let nearestName = '';
      for (const p of itineraryPlaces) {
        const d = this.haversineDistanceKm(loc.lat, loc.lng, p.lat, p.lng);
        if (d < minDist) {
          minDist = d;
          nearestName = p.placeName;
        }
      }
      if (minDist < Infinity) {
        return { ...acc, distanceKm: Math.round(minDist * 10) / 10, nearestPlaceName: nearestName || undefined };
      }
      return acc;
    });
  }

  /**
   * 格式化工具调用结果
   */
  private async formatToolResult(
    tool: any, // McpToolDefinition
    toolResult: any,
    dto: ChatRequestDto,
    routingResult: any,
    isChinese: boolean
  ): Promise<ChatResponseDto> {
    const toolName = tool.toolName;

    // 解析 MCP 工具返回结果（可能是 MCP 格式：{ content: [{ type: 'text', text: '...' }] }）
    let parsedResult = toolResult;
    if (toolResult?.content && Array.isArray(toolResult.content) && toolResult.content.length > 0) {
      const content = toolResult.content[0];
      if (content.type === 'text') {
        try {
          parsedResult = JSON.parse(content.text);
        } catch {
          parsedResult = { raw: content.text };
        }
      }
    }

    // 根据工具类型格式化结果
    if (toolName === 'hotel.search') {
      const results = parsedResult?.results || [];
      const source = (parsedResult?.source as 'hotel' | 'airbnb') || 'hotel';
      let accommodations = this.mapToAccommodations(results, source);
      const tripId = routingResult?.extractedParams?.tripId ?? dto.context?.tripId;
      const checkIn = routingResult?.extractedParams?.checkIn ?? routingResult?.extractedParams?.checkin;
      if (tripId && checkIn && this.prisma && accommodations.length > 0) {
        const dateStr = typeof checkIn === 'string' ? checkIn.split('T')[0] : String(checkIn).split('T')[0];
        const itineraryPlaces = await this.getItineraryPlacesWithCoords(tripId, dateStr);
        if (itineraryPlaces.length > 0) {
          accommodations = this.enrichAccommodationsWithDistance(accommodations, itineraryPlaces);
        }
      }
      const count = accommodations.length;
      const messageCN = count > 0
        ? `我为您找到了${count}个住宿选择。`
        : '未找到符合条件的住宿。';
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));
      return {
        message: count > 0 ? `Found ${count} accommodation(s).` : 'No accommodations found.',
        messageCN,
        reply: isChinese ? messageCN : `Found ${count} accommodation(s).`,
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        accommodations,
        hotels: source === 'hotel' ? results : undefined,
        airbnbListings: source === 'airbnb' ? results : undefined,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to hotel search',
          params: { ...routingResult.extractedParams, toolName },
        },
      };
    } else if (toolName === 'airbnb.listingDetails') {
      // Airbnb 房源详情
      const listing = parsedResult?.listing || parsedResult?.data || parsedResult;
      const listingName = listing?.demandStayListing?.description?.name?.localizedStringWithTranslationPreference 
        || listing?.name 
        || '未知房源';
      const messageCN = listing 
        ? `我为您找到了房源详情：${listingName}`
        : '未找到房源详情';
      
      // 异步更新会话状态（不等待）
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      const accommodations = listing ? [this.mapAirbnbToAccommodation(listing)] : [];
      return {
        message: listing ? `Found listing details: ${listingName}` : 'Listing details not found',
        messageCN,
        reply: isChinese ? messageCN : `Found listing details`,
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        accommodations,
        airbnbListings: listing ? [listing] : [],
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to Airbnb listing details',
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    } else if (toolName === 'weather.getCurrentWeather') {
      // 当前天气（与 getWeatherByDatetimeRange 区分：当前天气 vs 预报）
      const weatherData = parsedResult?.current ? parsedResult : (parsedResult?.data || parsedResult);
      const location = weatherData?.city || routingResult.extractedParams?.destination || routingResult.extractedParams?.location || '该位置';
      const temp = weatherData?.current?.temperature;
      const desc = weatherData?.current?.weather_description;
      const hasData = temp != null && desc;
      const messageCN = hasData
        ? `${location}的天气：${desc}，温度 ${temp}°C。`
        : '未获取到天气数据，请稍后重试。';

      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      return {
        message: hasData ? `Weather in ${location}: ${desc}, ${temp}°C.` : 'Weather data not available.',
        messageCN,
        reply: isChinese ? messageCN : (hasData ? `Weather: ${desc}, ${temp}°C.` : 'Weather data not available'),
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        weather: weatherData,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to current weather',
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    } else if (toolName === 'weather.getWeatherByDatetimeRange') {
      // 天气预报
      const forecast = parsedResult?.forecast || parsedResult?.data || parsedResult;
      const location = forecast?.city || routingResult.extractedParams?.destination || '该位置';
      const messageCN = forecast 
        ? `我为您找到了${location}的天气预报信息`
        : '未找到天气预报信息';
      
      // 异步更新会话状态（不等待）
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      return {
        message: forecast ? `Found weather forecast for ${location}` : 'Weather forecast not found',
        messageCN,
        reply: isChinese ? messageCN : 'Found weather forecast',
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        weather: forecast,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to weather forecast',
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    } else if (toolName === 'exa.webSearch') {
      // Web 搜索。Exa MCP 可能返回: JSON { results: [...] } 或 Markdown 格式（Title/URL/Text）
      const rawResults =
        parsedResult?.results ??
        parsedResult?.data?.results ??
        (Array.isArray(parsedResult?.data) ? parsedResult.data : parsedResult?.data) ??
        parsedResult;
      let results = Array.isArray(rawResults) ? rawResults : [];
      if (results.length === 0 && parsedResult?.raw) {
        results = this.parseExaMarkdownResults(parsedResult.raw);
      }
      const count = results.length;
      const messageCN = `我为您找到了${count}条搜索结果`;
      
      // 异步更新会话状态（含 searchResults，供后续「提取攻略中的景点加入行程」使用）
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
        searchResults: results,
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      return {
        message: `Found ${count} search result${count !== 1 ? 's' : ''}`,
        messageCN,
        reply: isChinese ? messageCN : `Found ${count} results`,
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        searchResults: results,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to web search',
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    } else if (toolName.startsWith('google-calendar.')) {
      // Google Calendar 工具
      const calendarResult = parsedResult?.event || parsedResult?.events || parsedResult?.data || parsedResult;
      let messageCN = '';
      
      if (toolName === 'google-calendar.createEvent' || toolName === 'google-calendar.quickAdd') {
        messageCN = calendarResult 
          ? `已成功创建日历事件：${calendarResult.summary || '事件'}`
          : '创建日历事件失败';
      } else if (toolName === 'google-calendar.findFreeSlots') {
        const slots = calendarResult?.freeSlots || calendarResult || [];
        messageCN = `找到了${slots.length}个空闲时间段`;
      } else if (toolName === 'google-calendar.listEvents') {
        const events = Array.isArray(calendarResult) ? calendarResult : (calendarResult?.events || []);
        messageCN = `找到了${events.length}个日历事件`;
      } else {
        messageCN = '日历操作完成';
      }
      
      // 异步更新会话状态（不等待）
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      return {
        message: messageCN || 'Calendar operation completed',
        messageCN,
        reply: isChinese ? messageCN : 'Calendar operation completed',
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || `Executed calendar tool: ${toolName}`,
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    } else if (toolName === 'exa.webSearchAdvanced' || toolName === 'exa.deepSearch') {
      // Exa 高级搜索（与 exa.webSearch 相同的结果提取逻辑，含 Markdown 回退）
      const rawResults =
        parsedResult?.results ??
        parsedResult?.data?.results ??
        (Array.isArray(parsedResult?.data) ? parsedResult.data : parsedResult?.data) ??
        parsedResult;
      let results = Array.isArray(rawResults) ? rawResults : [];
      if (results.length === 0 && parsedResult?.raw) {
        results = this.parseExaMarkdownResults(parsedResult.raw);
      }
      const count = results.length;
      const messageCN = `我为您找到了${count}条搜索结果`;
      
      // 异步更新会话状态（含 searchResults，供后续「提取攻略中的景点加入行程」使用）
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
        searchResults: results,
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      return {
        message: `Found ${count} search result${count !== 1 ? 's' : ''}`,
        messageCN,
        reply: isChinese ? messageCN : `Found ${count} results`,
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        searchResults: results,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to advanced search',
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    } else if (toolName === 'exa.crawlUrl') {
      // Exa 网页爬取
      const content = parsedResult?.content || parsedResult?.data || parsedResult;
      const messageCN = content ? '网页内容已成功爬取' : '网页爬取失败';
      
      // 异步更新会话状态（不等待）
      this.updateSessionAfterBusinessCall(dto.sessionId, {
        message: dto.message,
        response: messageCN,
        phase: 'RECOMMENDING',
      }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));

      return {
        message: content ? 'Web page crawled successfully' : 'Web page crawl failed',
        messageCN,
        reply: isChinese ? messageCN : 'Web page crawled',
        replyCN: messageCN,
        phase: 'RECOMMENDING',
        sessionId: dto.sessionId,
        routing: {
          target: routingResult.target,
          reason: routingResult.toolSelection?.reason || 'Routed to web crawl',
          params: {
            ...routingResult.extractedParams,
            toolName: toolName,
          },
        },
      };
    }

    // 默认格式化
    const messageCN = `工具调用成功: ${tool.displayName}`;
    return {
      message: `Tool executed: ${tool.displayName}`,
      messageCN,
      reply: isChinese ? messageCN : `Tool executed`,
      replyCN: messageCN,
      phase: 'RECOMMENDING',
      sessionId: dto.sessionId,
      routing: {
        target: routingResult.target,
        reason: routingResult.toolSelection?.reason || `Executed tool: ${toolName}`,
        params: {
          ...routingResult.extractedParams,
          toolName: toolName,
        },
      },
    };
  }
}
