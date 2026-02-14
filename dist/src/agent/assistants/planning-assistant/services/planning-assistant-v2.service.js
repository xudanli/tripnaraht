"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PlanningAssistantV2Service_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningAssistantV2Service = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const planning_assistant_service_1 = require("./planning-assistant.service");
const core_gateway_service_1 = require("../../../infra/core-gateway.service");
const recommendation_engine_service_1 = require("../../shared/services/recommendation-engine.service");
const preference_learning_service_1 = require("../../shared/services/preference-learning.service");
const persona_language_service_1 = require("../../shared/services/persona-language.service");
const llm_service_1 = require("../../../../llm/services/llm.service");
const smart_router_service_1 = require("./smart-router.service");
const mcp_tool_dispatcher_service_1 = require("./mcp-tool-dispatcher.service");
const task_service_1 = require("../../../infra/task.service");
const cache_service_1 = require("../../../../common/cache/cache.service");
const prisma_service_1 = require("../../../../prisma/prisma.service");
const crypto_1 = require("crypto");
const crypto_2 = require("crypto");
const planning_assistant_exceptions_1 = require("../exceptions/planning-assistant.exceptions");
let PlanningAssistantV2Service = PlanningAssistantV2Service_1 = class PlanningAssistantV2Service {
    constructor(planningAssistantService, configService, coreGateway, recommendationEngine, preferenceLearning, personaLanguage, llmService, smartRouter, mcpToolDispatcher, taskService, cacheService, prisma, hotelDirectService, googleMapsDirectService, airbnbService, restaurantDirectService, weatherDirectService, exaService, amadeusService, translationDirectService, currencyDirectService, imageDirectService, visionService, railService, bookingComService) {
        var _a, _b, _c, _d;
        this.planningAssistantService = planningAssistantService;
        this.configService = configService;
        this.coreGateway = coreGateway;
        this.recommendationEngine = recommendationEngine;
        this.preferenceLearning = preferenceLearning;
        this.personaLanguage = personaLanguage;
        this.llmService = llmService;
        this.smartRouter = smartRouter;
        this.mcpToolDispatcher = mcpToolDispatcher;
        this.taskService = taskService;
        this.cacheService = cacheService;
        this.prisma = prisma;
        this.hotelDirectService = hotelDirectService;
        this.googleMapsDirectService = googleMapsDirectService;
        this.airbnbService = airbnbService;
        this.restaurantDirectService = restaurantDirectService;
        this.weatherDirectService = weatherDirectService;
        this.exaService = exaService;
        this.amadeusService = amadeusService;
        this.translationDirectService = translationDirectService;
        this.currencyDirectService = currencyDirectService;
        this.imageDirectService = imageDirectService;
        this.visionService = visionService;
        this.railService = railService;
        this.bookingComService = bookingComService;
        this.logger = new common_1.Logger(PlanningAssistantV2Service_1.name);
        this.performanceMetrics = new Map();
        this.sessionCacheTTL = (_b = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('PLANNING_ASSISTANT.SESSION_CACHE_TTL', 86400)) !== null && _b !== void 0 ? _b : 86400;
        this.sessionExpirationHours = (_d = (_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('PLANNING_ASSISTANT.SESSION_EXPIRATION_HOURS', 24)) !== null && _d !== void 0 ? _d : 24;
        this.logger.log('🚀 规划助手智能体 V2 Service 已初始化');
        this.logger.debug(`配置: sessionCacheTTL=${this.sessionCacheTTL}s, sessionExpirationHours=${this.sessionExpirationHours}h`);
        this.logger.debug(`MCP 服务注入状态: HotelDirect=${!!this.hotelDirectService}, GoogleMaps=${!!this.googleMapsDirectService}, Airbnb=${!!this.airbnbService}, Restaurant=${!!this.restaurantDirectService}, Weather=${!!this.weatherDirectService}`);
        this.logger.debug(`工具融合服务注入状态: ToolDispatcher=${!!this.mcpToolDispatcher}, SmartRouter=${!!this.smartRouter}`);
    }
    async createSession(dto) {
        const startTime = Date.now();
        const traceId = (0, crypto_1.randomUUID)();
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
            const response = {
                sessionId,
                userId: dto.userId,
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                context: dto.context ? {
                    tripId: dto.context.tripId,
                    destination: dto.context.destination,
                } : undefined,
            };
            if (this.cacheService && sessionId) {
                await this.cacheService.set(`session:${sessionId}`, response, this.sessionCacheTTL).catch((error) => {
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
        }
        catch (error) {
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
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '1008',
                message: 'Failed to create session',
                messageCN: '创建会话失败',
                details: { error: error.message, traceId },
            });
        }
    }
    async getSessionState(sessionId, requestingUserId) {
        var _a;
        this.logger.debug(`获取会话状态: sessionId=${sessionId}, requestingUserId=${requestingUserId}`);
        if (this.cacheService && sessionId) {
            const cached = await this.cacheService.get(`session:${sessionId}`);
            if (cached) {
                if (requestingUserId && cached.userId && cached.userId !== requestingUserId) {
                    throw new common_1.ForbiddenException({
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
        if (!state && requestingUserId) {
            this.logger.debug(`会话不存在，自动创建: sessionId=${sessionId}, userId=${requestingUserId}`);
            try {
                await this.ensureSessionExists(sessionId, requestingUserId);
                state = await this.planningAssistantService.getSessionState(sessionId);
            }
            catch (error) {
                this.logger.warn(`自动创建会话失败: ${error.message}`);
            }
        }
        if (!state) {
            throw new planning_assistant_exceptions_1.SessionNotFoundException(sessionId);
        }
        if (requestingUserId && state.userId && state.userId !== requestingUserId) {
            throw new common_1.ForbiddenException({
                success: false,
                errorCode: '2003',
                message: 'Access denied',
                messageCN: '无权访问此会话',
                details: { sessionId },
            });
        }
        const expiresAt = new Date(state.expiresAt);
        if (expiresAt < new Date()) {
            throw new planning_assistant_exceptions_1.SessionExpiredException(sessionId);
        }
        const result = {
            sessionId: state.sessionId,
            userId: state.userId,
            phase: state.phase,
            preferences: state.preferences,
            recommendations: state.recommendations,
            selectedDestination: state.selectedDestination,
            planCandidates: (_a = state.planCandidates) === null || _a === void 0 ? void 0 : _a.map(p => this.convertPlanCandidateToDto(p)),
            selectedPlanId: state.selectedPlanId,
            confirmedTripId: state.confirmedTripId,
            messageCount: state.messageHistory.length,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            expiresAt: state.expiresAt,
        };
        if (this.cacheService && sessionId) {
            await this.cacheService.set(`session:${sessionId}`, result, this.sessionCacheTTL).catch((error) => {
                this.logger.warn(`会话状态缓存失败: sessionId=${sessionId}`, error);
            });
        }
        return result;
    }
    async deleteSession(sessionId, requestingUserId) {
        this.logger.debug(`删除会话: sessionId=${sessionId}, requestingUserId=${requestingUserId}`);
        const state = await this.planningAssistantService.getSessionState(sessionId);
        if (!state) {
            throw new planning_assistant_exceptions_1.SessionNotFoundException(sessionId);
        }
        if (requestingUserId && state.userId && state.userId !== requestingUserId) {
            throw new common_1.ForbiddenException({
                success: false,
                errorCode: '2004',
                message: 'Access denied',
                messageCN: '无权删除此会话',
                details: { sessionId },
            });
        }
        if (this.cacheService && sessionId) {
            await this.cacheService.delete(`session:${sessionId}`).catch((error) => {
                this.logger.warn(`删除会话状态缓存失败: sessionId=${sessionId}`, error);
            });
        }
    }
    async getMessageHistory(sessionId, limit = 50, offset = 0, requestingUserId) {
        this.logger.debug(`获取对话历史: sessionId=${sessionId}, limit=${limit}, offset=${offset}, requestingUserId=${requestingUserId}`);
        const state = await this.planningAssistantService.getSessionState(sessionId);
        if (!state) {
            throw new planning_assistant_exceptions_1.SessionNotFoundException(sessionId);
        }
        if (requestingUserId && state.userId && state.userId !== requestingUserId) {
            throw new common_1.ForbiddenException({
                success: false,
                errorCode: '2005',
                message: 'Access denied',
                messageCN: '无权访问此会话的对话历史',
                details: { sessionId },
            });
        }
        const messages = state.messageHistory
            .slice(offset, offset + limit)
            .filter(msg => msg.role === 'user' || msg.role === 'assistant')
            .map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            intent: msg.intent,
        }));
        return {
            messages,
            total: state.messageHistory.length,
            limit,
            offset,
        };
    }
    async chat(dto) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40;
        const requestStartTime = Date.now();
        this.logger.debug(`[智能对话] 开始处理请求: sessionId=${dto.sessionId}, ` +
            `message="${dto.message.substring(0, 50)}...", ` +
            `language=${dto.language || 'auto'}, ` +
            `context.tripId=${((_a = dto.context) === null || _a === void 0 ? void 0 : _a.tripId) || 'none'}, ` +
            `context.countryCode=${((_b = dto.context) === null || _b === void 0 ? void 0 : _b.countryCode) || 'none'}`);
        if (((_c = dto.options) === null || _c === void 0 ? void 0 : _c.autoRoute) !== false && this.smartRouter) {
            try {
                let sessionState;
                let selectedDestination;
                if (dto.sessionId) {
                    try {
                        const state = await this.planningAssistantService.getSessionState(dto.sessionId);
                        if (state) {
                            sessionState = {
                                phase: state.phase,
                                preferences: state.preferences,
                                planCandidates: (_d = state.planCandidates) === null || _d === void 0 ? void 0 : _d.map(p => ({ id: p.id })),
                                selectedDestination: state.selectedDestination,
                            };
                            selectedDestination = state.selectedDestination;
                            this.logger.debug(`[会话上下文] phase=${state.phase}, ` +
                                `selectedDestination=${selectedDestination || 'none'}, ` +
                                `preferences=${JSON.stringify(state.preferences || {}).substring(0, 100)}...`);
                        }
                    }
                    catch (error) {
                        this.logger.debug(`[会话状态] 获取失败（可能不存在）: ${error.message}`);
                    }
                }
                else {
                    this.logger.debug(`[会话状态] 无 sessionId，使用新会话模式`);
                }
                const routingStartTime = Date.now();
                const routingResult = await this.smartRouter.routeWithTools(dto.message, sessionState);
                const routingDuration = Date.now() - routingStartTime;
                this.logger.debug(`[智能路由] 路由完成: target=${routingResult.target}, ` +
                    `confidence=${routingResult.confidence.toFixed(2)}, ` +
                    `reasonCN=${routingResult.reasonCN || routingResult.reason}, ` +
                    `duration=${routingDuration}ms, ` +
                    `extractedParams=${JSON.stringify(routingResult.extractedParams || {}).substring(0, 100)}...`);
                if (selectedDestination && routingResult.extractedParams && !routingResult.extractedParams.destination) {
                    routingResult.extractedParams.destination = selectedDestination;
                    this.logger.debug(`[路由增强] 使用会话中的目的地: ${selectedDestination}`);
                }
                this.logger.debug(`[路由结果] target=${routingResult.target}, ` +
                    `hasSelectedTool=${!!routingResult.selectedTool}, ` +
                    `hasToolSelection=${!!routingResult.toolSelection}, ` +
                    `hasDispatcher=${!!this.mcpToolDispatcher}, ` +
                    `selectedTool=${((_e = routingResult.selectedTool) === null || _e === void 0 ? void 0 : _e.toolName) || 'none'}`);
                if (routingResult.selectedTool && routingResult.toolSelection && this.mcpToolDispatcher) {
                    this.logger.debug(`工具选择: ${routingResult.selectedTool.toolName}, confidence=${routingResult.toolSelection.confidence}`);
                    try {
                        await this.ensureSessionExists(dto.sessionId, dto.userId);
                        const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                        const toolCallStartTime = Date.now();
                        const toolParams = {
                            ...routingResult.extractedParams,
                            ...(((_f = dto.context) === null || _f === void 0 ? void 0 : _f.tripId) && { tripId: dto.context.tripId }),
                            ...(((_g = dto.context) === null || _g === void 0 ? void 0 : _g.countryCode) && { countryCode: dto.context.countryCode }),
                        };
                        const toolResult = await this.mcpToolDispatcher.executeTool(routingResult.selectedTool.serviceName, routingResult.selectedTool.toolName, toolParams);
                        const toolCallDuration = Date.now() - toolCallStartTime;
                        this.recordPerformanceMetric(`tool.${routingResult.selectedTool.serviceName}.${routingResult.selectedTool.toolName}`, toolCallDuration);
                        this.logger.debug(`工具调用完成: ${routingResult.selectedTool.toolName}, 耗时=${toolCallDuration}ms`);
                        return this.formatToolResult(routingResult.selectedTool, toolResult, dto, routingResult, isChinese);
                    }
                    catch (toolError) {
                        this.logger.error(`工具调用失败: ${toolError.message}`, toolError.stack);
                        this.recordPerformanceMetric(`tool.${routingResult.selectedTool.serviceName}.${routingResult.selectedTool.toolName}.error`, 0);
                    }
                }
                if (routingResult.confidence >= 0.6 && routingResult.target !== 'chat') {
                    this.logger.debug(`智能路由: ${routingResult.target} (confidence=${routingResult.confidence})`);
                    try {
                        await this.ensureSessionExists(dto.sessionId, dto.userId);
                        let businessResult;
                        const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
                        switch (routingResult.target) {
                            case 'recommendations': {
                                const recParams = {
                                    sessionId: dto.sessionId,
                                    userId: dto.userId,
                                    naturalLanguageDescription: dto.message,
                                    ...routingResult.extractedParams,
                                };
                                businessResult = await this.getRecommendations(recParams);
                                this.logger.debug(`推荐结果: count=${((_h = businessResult.recommendations) === null || _h === void 0 ? void 0 : _h.length) || 0}, hasData=${!!businessResult.recommendations}`);
                                if (businessResult.recommendations && businessResult.recommendations.length > 0) {
                                    this.logger.debug(`第一个推荐: ${JSON.stringify(businessResult.recommendations[0]).substring(0, 200)}...`);
                                }
                                const messageEN = `I found ${((_j = businessResult.recommendations) === null || _j === void 0 ? void 0 : _j.length) || 0} destination recommendations for you.`;
                                const messageCN = `我为您找到了${((_k = businessResult.recommendations) === null || _k === void 0 ? void 0 : _k.length) || 0}个目的地推荐。`;
                                await this.updateSessionAfterBusinessCall(dto.sessionId, {
                                    message: dto.message,
                                    response: messageCN,
                                    phase: 'RECOMMENDING',
                                    recommendations: businessResult.recommendations || [],
                                });
                                const response = {
                                    message: messageEN,
                                    messageCN: messageCN,
                                    reply: isChinese ? messageCN : messageEN,
                                    replyCN: messageCN,
                                    phase: 'RECOMMENDING',
                                    sessionId: dto.sessionId,
                                    recommendations: businessResult.recommendations || [],
                                    routing: {
                                        target: routingResult.target,
                                        reason: routingResult.reason || 'Routed to recommendations',
                                        params: routingResult.extractedParams,
                                    },
                                };
                                this.logger.debug(`响应结构: hasRecommendations=${!!response.recommendations}, count=${((_l = response.recommendations) === null || _l === void 0 ? void 0 : _l.length) || 0}`);
                                return response;
                            }
                            case 'generate': {
                                const genParams = {
                                    sessionId: dto.sessionId,
                                    userId: dto.userId,
                                    naturalLanguageDescription: dto.message,
                                    ...routingResult.extractedParams,
                                };
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
                                if (((_m = routingResult.extractedParams) === null || _m === void 0 ? void 0 : _m.planIds) && routingResult.extractedParams.planIds.length >= 2) {
                                    const compareParams = {
                                        sessionId: dto.sessionId,
                                        planIds: routingResult.extractedParams.planIds,
                                    };
                                    businessResult = await this.comparePlans(compareParams);
                                    const messageEN = `I compared ${businessResult.plans.length} plans for you.`;
                                    const messageCN = `我为您对比了${businessResult.plans.length}个方案。`;
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
                                break;
                            }
                            case 'hotel': {
                                try {
                                    const isPlanningWorkbench = !!(((_o = dto.context) === null || _o === void 0 ? void 0 : _o.tripId) || ((_p = dto.context) === null || _p === void 0 ? void 0 : _p.countryCode));
                                    if (isPlanningWorkbench) {
                                        if (!dto.context.tripId) {
                                            throw new common_1.BadRequestException('规划工作台场景下，tripId 是必需参数');
                                        }
                                        if (!dto.context.countryCode) {
                                            throw new common_1.BadRequestException('规划工作台场景下，countryCode 是必需参数');
                                        }
                                        this.logger.debug(`规划工作台场景: tripId=${dto.context.tripId}, countryCode=${dto.context.countryCode}`);
                                    }
                                    let location = (_q = routingResult.extractedParams) === null || _q === void 0 ? void 0 : _q.location;
                                    let destination = (_r = routingResult.extractedParams) === null || _r === void 0 ? void 0 : _r.destination;
                                    if (!destination && selectedDestination) {
                                        destination = selectedDestination;
                                        this.logger.debug(`使用会话中的目的地进行酒店搜索: ${destination}`);
                                    }
                                    if (!destination) {
                                        destination = dto.message;
                                    }
                                    if (isPlanningWorkbench && dto.context.countryCode && !destination) {
                                        destination = dto.context.countryCode;
                                    }
                                    this.logger.debug(`酒店搜索参数: destination=${destination}, hasLocation=${!!location}, tripId=${(_s = dto.context) === null || _s === void 0 ? void 0 : _s.tripId}, countryCode=${(_t = dto.context) === null || _t === void 0 ? void 0 : _t.countryCode}`);
                                    if (!location && destination && this.googleMapsDirectService) {
                                        try {
                                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                                address: destination,
                                                language: isChinese ? 'zh' : 'en',
                                            });
                                            if (((_u = geocodeResult === null || geocodeResult === void 0 ? void 0 : geocodeResult.data) === null || _u === void 0 ? void 0 : _u.results) && geocodeResult.data.results.length > 0) {
                                                const firstResult = geocodeResult.data.results[0];
                                                location = {
                                                    lat: firstResult.geometry.location.lat,
                                                    lng: firstResult.geometry.location.lng,
                                                };
                                                this.logger.debug(`地理编码成功: ${destination} -> (${location.lat}, ${location.lng})`);
                                            }
                                        }
                                        catch (geocodeError) {
                                            this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                                        }
                                    }
                                    if (!location) {
                                        const commonLocations = {
                                            '冰岛': { lat: 64.1466, lng: -21.9426 },
                                            'iceland': { lat: 64.1466, lng: -21.9426 },
                                            '日本': { lat: 35.6762, lng: 139.6503 },
                                            'japan': { lat: 35.6762, lng: 139.6503 },
                                            '东京': { lat: 35.6762, lng: 139.6503 },
                                            'tokyo': { lat: 35.6762, lng: 139.6503 },
                                        };
                                        const lowerMessage = dto.message.toLowerCase();
                                        for (const [key, coords] of Object.entries(commonLocations)) {
                                            if (lowerMessage.includes(key.toLowerCase())) {
                                                location = coords;
                                                break;
                                            }
                                        }
                                    }
                                    if (!location) {
                                        throw new Error('无法确定搜索位置，请提供更具体的目的地信息');
                                    }
                                    let airbnbResults = [];
                                    let useAirbnb = false;
                                    if (this.airbnbService) {
                                        try {
                                            this.logger.debug('优先尝试 Airbnb 搜索...');
                                            const airbnbParams = {
                                                location: `${location.lat},${location.lng}`,
                                                adults: ((_v = routingResult.extractedParams) === null || _v === void 0 ? void 0 : _v.adults) || ((_w = routingResult.extractedParams) === null || _w === void 0 ? void 0 : _w.guests) || 1,
                                                checkin: (_x = routingResult.extractedParams) === null || _x === void 0 ? void 0 : _x.checkin,
                                                checkout: (_y = routingResult.extractedParams) === null || _y === void 0 ? void 0 : _y.checkout,
                                            };
                                            if (isPlanningWorkbench && dto.context.tripId) {
                                                this.logger.debug(`使用 tripId 增强 Airbnb 搜索: ${dto.context.tripId}`);
                                            }
                                            const airbnbSearchResult = await this.airbnbService.searchListings(airbnbParams);
                                            if (airbnbSearchResult && airbnbSearchResult.results && airbnbSearchResult.results.length > 0) {
                                                airbnbResults = airbnbSearchResult.results;
                                                useAirbnb = true;
                                                this.logger.debug(`Airbnb 搜索成功，找到 ${airbnbResults.length} 个房源`);
                                            }
                                            else {
                                                this.logger.debug('Airbnb 搜索无结果，降级到 HotelDirectService');
                                            }
                                        }
                                        catch (airbnbError) {
                                            this.logger.warn(`Airbnb 搜索失败，降级到 HotelDirectService: ${airbnbError.message}`);
                                        }
                                    }
                                    else {
                                        this.logger.debug('AirbnbService 不可用，降级到 HotelDirectService');
                                    }
                                    let hotels = [];
                                    if (!useAirbnb && this.hotelDirectService && this.hotelDirectService.isServiceAvailable()) {
                                        try {
                                            this.logger.debug('使用 HotelDirectService 搜索酒店...');
                                            const hotelSearchParams = {
                                                query: destination || 'hotel',
                                                location: location,
                                                radius: 10000,
                                                language: isChinese ? 'zh' : 'en',
                                                minRating: 3.5,
                                            };
                                            if (isPlanningWorkbench && dto.context.countryCode) {
                                                this.logger.debug(`使用 countryCode 增强酒店搜索: ${dto.context.countryCode}`);
                                            }
                                            const hotelSearchResult = await this.hotelDirectService.searchHotels(hotelSearchParams);
                                            hotels = (hotelSearchResult.results || []).slice(0, 10);
                                            this.logger.debug(`HotelDirectService 搜索成功，找到 ${hotels.length} 个酒店`);
                                        }
                                        catch (hotelError) {
                                            this.logger.warn(`HotelDirectService 搜索失败: ${hotelError.message}`);
                                        }
                                    }
                                    else if (!useAirbnb && (!this.hotelDirectService || !this.hotelDirectService.isServiceAvailable())) {
                                        this.logger.warn('HotelDirectService 不可用，且 Airbnb 也无结果');
                                    }
                                    const totalResults = airbnbResults.length + hotels.length;
                                    if (totalResults === 0) {
                                        throw new Error('未找到任何住宿选择');
                                    }
                                    const messageEN = useAirbnb
                                        ? `I found ${airbnbResults.length} Airbnb listing${airbnbResults.length !== 1 ? 's' : ''} for you.`
                                        : `I found ${hotels.length} hotel${hotels.length !== 1 ? 's' : ''} for you.`;
                                    const messageCN = useAirbnb
                                        ? `我为您找到了${airbnbResults.length}个Airbnb房源。`
                                        : `我为您找到了${hotels.length}家酒店。`;
                                    await this.updateSessionAfterBusinessCall(dto.sessionId, {
                                        message: dto.message,
                                        response: messageCN,
                                        phase: 'RECOMMENDING',
                                    });
                                    if (useAirbnb) {
                                        const airbnbDtos = airbnbResults.map((listing) => ({
                                            id: listing.id,
                                            name: listing.name,
                                            location: listing.location,
                                            price: listing.price,
                                            rating: listing.rating,
                                            reviewsCount: listing.reviewsCount,
                                            images: listing.images,
                                            amenities: listing.amenities,
                                            type: 'airbnb',
                                        }));
                                        return {
                                            message: messageEN,
                                            messageCN: messageCN,
                                            reply: isChinese ? messageCN : messageEN,
                                            replyCN: messageCN,
                                            phase: 'RECOMMENDING',
                                            sessionId: dto.sessionId,
                                            airbnbListings: airbnbDtos,
                                            routing: {
                                                target: routingResult.target,
                                                reason: routingResult.reason || 'Routed to hotel search (using Airbnb)',
                                                params: {
                                                    ...routingResult.extractedParams,
                                                    useAirbnb: true,
                                                },
                                            },
                                        };
                                    }
                                    const hotelDtos = hotels.map((hotel) => ({
                                        placeId: hotel.placeId,
                                        name: hotel.name,
                                        address: hotel.address,
                                        location: hotel.location,
                                        rating: hotel.rating,
                                        userRatingsTotal: hotel.userRatingsTotal,
                                        priceLevel: hotel.priceLevel,
                                        types: hotel.types,
                                        openingHours: hotel.openingHours,
                                        photos: hotel.photos,
                                        phoneNumber: hotel.phoneNumber,
                                        website: hotel.website,
                                        reviews: hotel.reviews,
                                        amenities: hotel.amenities,
                                        roomTypes: hotel.roomTypes,
                                    }));
                                    return {
                                        message: messageEN,
                                        messageCN: messageCN,
                                        reply: isChinese ? messageCN : messageEN,
                                        replyCN: messageCN,
                                        phase: 'RECOMMENDING',
                                        sessionId: dto.sessionId,
                                        hotels: hotelDtos,
                                        routing: {
                                            target: routingResult.target,
                                            reason: routingResult.reason || 'Routed to hotel search (using HotelDirectService)',
                                            params: {
                                                ...routingResult.extractedParams,
                                                useAirbnb: false,
                                            },
                                        },
                                    };
                                }
                                catch (hotelError) {
                                    this.logger.error(`酒店搜索失败: ${hotelError.message}`, hotelError.stack);
                                    break;
                                }
                            }
                            case 'airbnb': {
                                if (!this.airbnbService) {
                                    this.logger.warn('AirbnbService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    let location = (_z = routingResult.extractedParams) === null || _z === void 0 ? void 0 : _z.location;
                                    const destination = ((_0 = routingResult.extractedParams) === null || _0 === void 0 ? void 0 : _0.destination) || dto.message;
                                    if (!location && destination && this.googleMapsDirectService) {
                                        try {
                                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                                address: destination,
                                                language: isChinese ? 'zh' : 'en',
                                            });
                                            if (((_1 = geocodeResult === null || geocodeResult === void 0 ? void 0 : geocodeResult.data) === null || _1 === void 0 ? void 0 : _1.results) && geocodeResult.data.results.length > 0) {
                                                const firstResult = geocodeResult.data.results[0];
                                                location = {
                                                    lat: firstResult.geometry.location.lat,
                                                    lng: firstResult.geometry.location.lng,
                                                };
                                            }
                                        }
                                        catch (geocodeError) {
                                            this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                                        }
                                    }
                                    if (!location) {
                                        throw new Error('无法确定搜索位置，请提供更具体的目的地信息');
                                    }
                                    const airbnbResult = await this.airbnbService.searchListings({
                                        location: `${location.lat},${location.lng}`,
                                    });
                                    const listings = (airbnbResult === null || airbnbResult === void 0 ? void 0 : airbnbResult.results) || [];
                                    const messageCN = `我为您找到了${listings.length}个Airbnb房源。`;
                                    await this.updateSessionAfterBusinessCall(dto.sessionId, {
                                        message: dto.message,
                                        response: messageCN,
                                        phase: 'RECOMMENDING',
                                    });
                                    return {
                                        message: `I found ${listings.length} Airbnb listing${listings.length !== 1 ? 's' : ''} for you.`,
                                        messageCN,
                                        reply: isChinese ? messageCN : `I found ${listings.length} Airbnb listings.`,
                                        replyCN: messageCN,
                                        phase: 'RECOMMENDING',
                                        sessionId: dto.sessionId,
                                        airbnbListings: listings,
                                        routing: {
                                            target: routingResult.target,
                                            reason: routingResult.reason || 'Routed to Airbnb search',
                                        },
                                    };
                                }
                                catch (airbnbError) {
                                    this.logger.error(`Airbnb搜索失败: ${airbnbError.message}`, airbnbError.stack);
                                    break;
                                }
                            }
                            case 'accommodation': {
                                try {
                                    const isPlanningWorkbench = !!(((_2 = dto.context) === null || _2 === void 0 ? void 0 : _2.tripId) || ((_3 = dto.context) === null || _3 === void 0 ? void 0 : _3.countryCode));
                                    if (isPlanningWorkbench) {
                                        if (!dto.context.tripId) {
                                            throw new common_1.BadRequestException('规划工作台场景下，tripId 是必需参数');
                                        }
                                        if (!dto.context.countryCode) {
                                            throw new common_1.BadRequestException('规划工作台场景下，countryCode 是必需参数');
                                        }
                                    }
                                    let location = (_4 = routingResult.extractedParams) === null || _4 === void 0 ? void 0 : _4.location;
                                    let destination = (_5 = routingResult.extractedParams) === null || _5 === void 0 ? void 0 : _5.destination;
                                    if (isPlanningWorkbench && dto.context.countryCode && !destination) {
                                        destination = dto.context.countryCode;
                                    }
                                    if (!destination) {
                                        destination = dto.message.replace(/推荐|住宿|accommodation|找|搜索/gi, '').trim() || dto.message;
                                    }
                                    this.logger.debug(`住宿搜索参数: destination=${destination}, hasLocation=${!!location}, tripId=${(_6 = dto.context) === null || _6 === void 0 ? void 0 : _6.tripId}, countryCode=${(_7 = dto.context) === null || _7 === void 0 ? void 0 : _7.countryCode}`);
                                    if (location && location.lat && location.lng) {
                                        this.logger.debug(`使用提供的 location: (${location.lat}, ${location.lng})`);
                                    }
                                    else if (!location && ((_8 = dto.context) === null || _8 === void 0 ? void 0 : _8.countryCode)) {
                                        this.logger.debug(`使用 countryCode 进行地理编码: ${dto.context.countryCode}`);
                                        const countryCodeMap = {
                                            'IS': 'Iceland', 'JP': 'Japan', 'TH': 'Thailand', 'IT': 'Italy',
                                            'NZ': 'New Zealand', 'ES': 'Spain', 'CH': 'Switzerland', 'MV': 'Maldives',
                                            'CN': 'China', 'US': 'United States', 'GB': 'United Kingdom', 'FR': 'France',
                                            'DE': 'Germany', 'AU': 'Australia', 'CA': 'Canada', 'KR': 'South Korea',
                                            'SG': 'Singapore', 'MY': 'Malaysia', 'VN': 'Vietnam', 'GL': 'Greenland',
                                            'SJ': 'Svalbard', 'AR': 'Argentina', 'NO': 'Norway', 'NP': 'Nepal',
                                        };
                                        const countryName = countryCodeMap[dto.context.countryCode.toUpperCase()] || dto.context.countryCode;
                                        const countryCenters = {
                                            'IS': { lat: 64.9631, lng: -19.0208 }, 'JP': { lat: 35.6762, lng: 139.6503 },
                                            'TH': { lat: 13.7563, lng: 100.5018 }, 'IT': { lat: 41.9028, lng: 12.4964 },
                                            'NZ': { lat: -36.8485, lng: 174.7633 }, 'ES': { lat: 40.4168, lng: -3.7038 },
                                            'CH': { lat: 47.3769, lng: 8.5417 }, 'MV': { lat: 4.1755, lng: 73.5093 },
                                            'CN': { lat: 39.9042, lng: 116.4074 }, 'US': { lat: 40.7128, lng: -74.0060 },
                                            'GB': { lat: 51.5074, lng: -0.1278 }, 'FR': { lat: 48.8566, lng: 2.3522 },
                                            'DE': { lat: 52.5200, lng: 13.4050 }, 'AU': { lat: -33.8688, lng: 151.2093 },
                                            'CA': { lat: 43.6532, lng: -79.3832 }, 'KR': { lat: 37.5665, lng: 126.9780 },
                                            'SG': { lat: 1.3521, lng: 103.8198 }, 'MY': { lat: 3.1390, lng: 101.6869 },
                                            'VN': { lat: 21.0285, lng: 105.8542 }, 'GL': { lat: 64.1814, lng: -51.6941 },
                                            'SJ': { lat: 78.2232, lng: 15.6267 }, 'AR': { lat: -34.6037, lng: -58.3816 },
                                            'NO': { lat: 59.9139, lng: 10.7522 }, 'NP': { lat: 27.7172, lng: 85.3240 },
                                        };
                                        if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
                                            try {
                                                const geocodeResult = await this.googleMapsDirectService.geocode({
                                                    address: countryName,
                                                    language: isChinese ? 'zh' : 'en',
                                                });
                                                if (((_9 = geocodeResult === null || geocodeResult === void 0 ? void 0 : geocodeResult.data) === null || _9 === void 0 ? void 0 : _9.results) && geocodeResult.data.results.length > 0) {
                                                    const firstResult = geocodeResult.data.results[0];
                                                    location = {
                                                        lat: firstResult.geometry.location.lat,
                                                        lng: firstResult.geometry.location.lng,
                                                    };
                                                    this.logger.debug(`通过 countryCode (Google Maps) 获取坐标成功: ${countryName} -> (${location.lat}, ${location.lng})`);
                                                }
                                            }
                                            catch (geocodeError) {
                                                this.logger.warn(`Google Maps 地理编码失败: ${geocodeError.message}，使用预定义坐标`);
                                            }
                                        }
                                        if (!location) {
                                            const predefinedCoords = countryCenters[dto.context.countryCode.toUpperCase()];
                                            if (predefinedCoords) {
                                                location = predefinedCoords;
                                                this.logger.debug(`使用预定义国家中心坐标: ${dto.context.countryCode} -> (${location.lat}, ${location.lng})`);
                                            }
                                        }
                                    }
                                    else if (!location && destination && this.googleMapsDirectService) {
                                        try {
                                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                                address: destination,
                                                language: isChinese ? 'zh' : 'en',
                                            });
                                            if (((_10 = geocodeResult === null || geocodeResult === void 0 ? void 0 : geocodeResult.data) === null || _10 === void 0 ? void 0 : _10.results) && geocodeResult.data.results.length > 0) {
                                                const firstResult = geocodeResult.data.results[0];
                                                location = {
                                                    lat: firstResult.geometry.location.lat,
                                                    lng: firstResult.geometry.location.lng,
                                                };
                                                this.logger.debug(`地理编码成功: ${destination} -> (${location.lat}, ${location.lng})`);
                                            }
                                        }
                                        catch (geocodeError) {
                                            this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                                        }
                                    }
                                    if (!location) {
                                        throw new Error('无法确定搜索位置，请提供位置信息（location、countryCode、destination）');
                                    }
                                    const [hotelResults, airbnbResults] = await Promise.all([
                                        (_11 = this.hotelDirectService) === null || _11 === void 0 ? void 0 : _11.searchHotels({
                                            query: destination || 'hotel',
                                            location,
                                            radius: 10000,
                                            language: isChinese ? 'zh' : 'en',
                                            minRating: 3.5,
                                        }).catch(() => ({ results: [] })),
                                        (_12 = this.airbnbService) === null || _12 === void 0 ? void 0 : _12.searchListings({
                                            location: `${location.lat},${location.lng}`,
                                        }).catch(() => ({ results: [] })),
                                    ]);
                                    const hotels = ((hotelResults === null || hotelResults === void 0 ? void 0 : hotelResults.results) || []).slice(0, 5);
                                    const airbnbs = ((airbnbResults === null || airbnbResults === void 0 ? void 0 : airbnbResults.results) || []).slice(0, 5);
                                    const total = hotels.length + airbnbs.length;
                                    const messageCN = `我为您找到了${hotels.length}家酒店和${airbnbs.length}个Airbnb房源，共${total}个住宿选择。`;
                                    await this.updateSessionAfterBusinessCall(dto.sessionId, {
                                        message: dto.message,
                                        response: messageCN,
                                        phase: 'RECOMMENDING',
                                    });
                                    return {
                                        message: `I found ${hotels.length} hotel${hotels.length !== 1 ? 's' : ''} and ${airbnbs.length} Airbnb listing${airbnbs.length !== 1 ? 's' : ''}, ${total} total accommodations.`,
                                        messageCN,
                                        reply: isChinese ? messageCN : `I found ${total} accommodations.`,
                                        replyCN: messageCN,
                                        phase: 'RECOMMENDING',
                                        sessionId: dto.sessionId,
                                        hotels: hotels.map((h) => ({
                                            placeId: h.placeId,
                                            name: h.name,
                                            address: h.address,
                                            location: h.location,
                                            rating: h.rating,
                                            userRatingsTotal: h.userRatingsTotal,
                                            priceLevel: h.priceLevel,
                                            types: h.types,
                                        })),
                                        airbnbListings: airbnbs,
                                        routing: {
                                            target: routingResult.target,
                                            reason: routingResult.reason || 'Routed to accommodation search',
                                        },
                                    };
                                }
                                catch (accommodationError) {
                                    this.logger.error(`住宿搜索失败: ${accommodationError.message}`, accommodationError.stack);
                                    break;
                                }
                            }
                            case 'restaurant': {
                                if (!this.restaurantDirectService) {
                                    this.logger.warn('RestaurantDirectService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    let location = (_13 = routingResult.extractedParams) === null || _13 === void 0 ? void 0 : _13.location;
                                    const destination = ((_14 = routingResult.extractedParams) === null || _14 === void 0 ? void 0 : _14.destination) || dto.message;
                                    if (!location && destination && this.googleMapsDirectService) {
                                        try {
                                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                                address: destination,
                                                language: isChinese ? 'zh' : 'en',
                                            });
                                            if (((_15 = geocodeResult === null || geocodeResult === void 0 ? void 0 : geocodeResult.data) === null || _15 === void 0 ? void 0 : _15.results) && geocodeResult.data.results.length > 0) {
                                                const firstResult = geocodeResult.data.results[0];
                                                location = {
                                                    lat: firstResult.geometry.location.lat,
                                                    lng: firstResult.geometry.location.lng,
                                                };
                                            }
                                        }
                                        catch (geocodeError) {
                                            this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                                        }
                                    }
                                    if (!location) {
                                        throw new Error('无法确定搜索位置');
                                    }
                                    const restaurantResult = await this.restaurantDirectService.searchRestaurants({
                                        query: destination || 'restaurant',
                                        location,
                                        radius: 5000,
                                        language: isChinese ? 'zh' : 'en',
                                        minRating: 3.5,
                                    });
                                    const restaurants = ((restaurantResult === null || restaurantResult === void 0 ? void 0 : restaurantResult.results) || []).slice(0, 10);
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
                                        restaurants: restaurants.map((r) => ({
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
                                }
                                catch (restaurantError) {
                                    this.logger.error(`餐厅搜索失败: ${restaurantError.message}`, restaurantError.stack);
                                    break;
                                }
                            }
                            case 'weather': {
                                if (!this.weatherDirectService) {
                                    this.logger.warn('WeatherDirectService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const destination = ((_16 = routingResult.extractedParams) === null || _16 === void 0 ? void 0 : _16.destination) || dto.message;
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
                                }
                                catch (weatherError) {
                                    this.logger.error(`天气查询失败: ${weatherError.message}`, weatherError.stack);
                                    break;
                                }
                            }
                            case 'search': {
                                if (!this.exaService) {
                                    this.logger.warn('ExaService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const query = ((_17 = routingResult.extractedParams) === null || _17 === void 0 ? void 0 : _17.query) || dto.message;
                                    const searchResult = await this.exaService.webSearch({
                                        query,
                                        numResults: 10,
                                    });
                                    const results = (searchResult === null || searchResult === void 0 ? void 0 : searchResult.results) || [];
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
                                }
                                catch (searchError) {
                                    this.logger.error(`Web搜索失败: ${searchError.message}`, searchError.stack);
                                    break;
                                }
                            }
                            case 'flight': {
                                if (!this.amadeusService) {
                                    this.logger.warn('AmadeusService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const origin = ((_18 = routingResult.extractedParams) === null || _18 === void 0 ? void 0 : _18.origin) || '';
                                    const destination = ((_19 = routingResult.extractedParams) === null || _19 === void 0 ? void 0 : _19.destination) || '';
                                    const departureDate = ((_20 = routingResult.extractedParams) === null || _20 === void 0 ? void 0 : _20.departureDate) || '';
                                    if (!origin || !destination) {
                                        throw new Error('请提供出发地和目的地');
                                    }
                                    const flightResult = await this.amadeusService.searchFlights({
                                        originLocationCode: origin,
                                        destinationLocationCode: destination,
                                        departureDate,
                                        adults: 1,
                                    });
                                    const flights = (flightResult === null || flightResult === void 0 ? void 0 : flightResult.data) || [];
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
                                        flights,
                                        routing: {
                                            target: routingResult.target,
                                            reason: routingResult.reason || 'Routed to flight search',
                                        },
                                    };
                                }
                                catch (flightError) {
                                    this.logger.error(`航班搜索失败: ${flightError.message}`, flightError.stack);
                                    break;
                                }
                            }
                            case 'translate': {
                                if (!this.translationDirectService) {
                                    this.logger.warn('TranslationDirectService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const text = ((_21 = routingResult.extractedParams) === null || _21 === void 0 ? void 0 : _21.text) || dto.message;
                                    const sourceLanguage = ((_22 = routingResult.extractedParams) === null || _22 === void 0 ? void 0 : _22.sourceLanguage) || 'auto';
                                    const targetLanguage = ((_23 = routingResult.extractedParams) === null || _23 === void 0 ? void 0 : _23.targetLanguage) || (isChinese ? 'zh' : 'en');
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
                                }
                                catch (translateError) {
                                    this.logger.error(`翻译失败: ${translateError.message}`, translateError.stack);
                                    break;
                                }
                            }
                            case 'currency': {
                                if (!this.currencyDirectService) {
                                    this.logger.warn('CurrencyDirectService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const amount = ((_24 = routingResult.extractedParams) === null || _24 === void 0 ? void 0 : _24.amount) || 1;
                                    const fromCurrency = ((_25 = routingResult.extractedParams) === null || _25 === void 0 ? void 0 : _25.fromCurrency) || 'USD';
                                    const toCurrency = ((_26 = routingResult.extractedParams) === null || _26 === void 0 ? void 0 : _26.toCurrency) || 'CNY';
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
                                }
                                catch (currencyError) {
                                    this.logger.error(`货币转换失败: ${currencyError.message}`, currencyError.stack);
                                    break;
                                }
                            }
                            case 'image': {
                                if (!this.imageDirectService) {
                                    this.logger.warn('ImageDirectService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const query = ((_27 = routingResult.extractedParams) === null || _27 === void 0 ? void 0 : _27.query) || dto.message;
                                    const imageResult = await this.imageDirectService.search({
                                        query,
                                        perPage: 10,
                                    });
                                    const images = (imageResult === null || imageResult === void 0 ? void 0 : imageResult.results) || [];
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
                                }
                                catch (imageError) {
                                    this.logger.error(`图片搜索失败: ${imageError.message}`, imageError.stack);
                                    break;
                                }
                            }
                            case 'rail': {
                                if (!this.railService || !this.railService.isServiceAvailable()) {
                                    this.logger.warn('RailService not available, falling back to chat');
                                    break;
                                }
                                try {
                                    const origin = ((_28 = routingResult.extractedParams) === null || _28 === void 0 ? void 0 : _28.origin) || '';
                                    const destination = ((_29 = routingResult.extractedParams) === null || _29 === void 0 ? void 0 : _29.destination) || '';
                                    const date = ((_30 = routingResult.extractedParams) === null || _30 === void 0 ? void 0 : _30.date) || '';
                                    if (!origin || !destination) {
                                        throw new Error('请提供出发地和目的地（例如："查询从巴黎到伦敦的火车"）');
                                    }
                                    const railResult = await this.railService.searchRoutes({
                                        origin,
                                        destination,
                                        date,
                                    });
                                    const routes = (railResult === null || railResult === void 0 ? void 0 : railResult.routes) || (railResult === null || railResult === void 0 ? void 0 : railResult.results) || [];
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
                                        railRoutes: routes,
                                        routing: {
                                            target: routingResult.target,
                                            reason: routingResult.reason || 'Routed to rail search',
                                        },
                                    };
                                }
                                catch (railError) {
                                    this.logger.error(`铁路查询失败: ${railError.message}`, railError.stack);
                                    if (((_31 = railError.message) === null || _31 === void 0 ? void 0 : _31.includes('OAuth')) || ((_32 = railError.message) === null || _32 === void 0 ? void 0 : _32.includes('401')) || ((_33 = railError.message) === null || _33 === void 0 ? void 0 : _33.includes('Unauthorized'))) {
                                        return {
                                            message: 'Rail service requires OAuth authentication. Please configure it first.',
                                            messageCN: 'Rail 服务需要 OAuth 认证。请先完成认证配置。',
                                            reply: isChinese ? 'Rail 服务需要 OAuth 认证。请先完成认证配置。' : 'Rail service requires OAuth authentication.',
                                            replyCN: 'Rail 服务需要 OAuth 认证。请先完成认证配置。',
                                            phase: 'RECOMMENDING',
                                            sessionId: dto.sessionId,
                                            routing: {
                                                target: routingResult.target,
                                                reason: 'Rail service authentication required',
                                            },
                                        };
                                    }
                                    break;
                                }
                            }
                            case 'carRental': {
                                if (!this.bookingComService || !this.bookingComService.isAvailable()) {
                                    this.logger.warn('BookingComService not available, falling back to chat');
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
                                    let destination = selectedDestination || ((_34 = routingResult.extractedParams) === null || _34 === void 0 ? void 0 : _34.destination) || '';
                                    if (!destination) {
                                        throw new Error('请提供目的地（例如："冰岛租车推荐"）');
                                    }
                                    let location;
                                    if (this.googleMapsDirectService) {
                                        try {
                                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                                address: destination,
                                                language: isChinese ? 'zh' : 'en',
                                            });
                                            if (((_35 = geocodeResult === null || geocodeResult === void 0 ? void 0 : geocodeResult.data) === null || _35 === void 0 ? void 0 : _35.results) && geocodeResult.data.results.length > 0) {
                                                const firstResult = geocodeResult.data.results[0];
                                                location = {
                                                    lat: firstResult.geometry.location.lat,
                                                    lng: firstResult.geometry.location.lng,
                                                };
                                                this.logger.debug(`地理编码成功: ${destination} -> (${location.lat}, ${location.lng})`);
                                            }
                                        }
                                        catch (geocodeError) {
                                            this.logger.warn(`地理编码失败: ${geocodeError.message}`);
                                        }
                                    }
                                    if (!location) {
                                        throw new Error('无法确定目的地位置，请提供更具体的地点信息');
                                    }
                                    const pickupDate = new Date();
                                    const dropoffDate = new Date(pickupDate);
                                    dropoffDate.setDate(dropoffDate.getDate() + 1);
                                    const carRentalResult = await this.bookingComService.searchCarRentals({
                                        pickupLocation: `${location.lat},${location.lng}`,
                                        dropoffLocation: `${location.lat},${location.lng}`,
                                        pickupDate: pickupDate.toISOString().split('T')[0],
                                        dropoffDate: dropoffDate.toISOString().split('T')[0],
                                        driverAge: 25,
                                    });
                                    const rentals = (carRentalResult === null || carRentalResult === void 0 ? void 0 : carRentalResult.data) || [];
                                    const messageCN = `我为您找到了${rentals.length}个${destination}的租车选择。`;
                                    await this.updateSessionAfterBusinessCall(dto.sessionId, {
                                        message: dto.message,
                                        response: messageCN,
                                        phase: 'RECOMMENDING',
                                    });
                                    return {
                                        message: `I found ${rentals.length} car rental option${rentals.length !== 1 ? 's' : ''} in ${destination}.`,
                                        messageCN,
                                        reply: isChinese ? messageCN : `I found ${rentals.length} car rentals.`,
                                        replyCN: messageCN,
                                        phase: 'RECOMMENDING',
                                        sessionId: dto.sessionId,
                                        carRentals: rentals,
                                        routing: {
                                            target: routingResult.target,
                                            reason: routingResult.reason || 'Routed to car rental search',
                                        },
                                    };
                                }
                                catch (carRentalError) {
                                    this.logger.error(`租车搜索失败: ${carRentalError.message}`, carRentalError.stack);
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
                    }
                    catch (error) {
                        this.logger.warn(`业务接口调用失败: ${error.message}，回退到对话接口`);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`智能路由失败: ${error.message}，使用对话接口`);
            }
        }
        let finalRoutingResult = null;
        let finalSelectedDestination = undefined;
        try {
            if (((_36 = dto.options) === null || _36 === void 0 ? void 0 : _36.autoRoute) !== false && this.smartRouter) {
                const sessionStateData = dto.sessionId ? await this.planningAssistantService.getSessionState(dto.sessionId).catch(() => null) : null;
                if (sessionStateData) {
                    finalSelectedDestination = sessionStateData.selectedDestination;
                }
                finalRoutingResult = await this.smartRouter.route(dto.message, sessionStateData ? {
                    phase: sessionStateData.phase,
                    preferences: sessionStateData.preferences,
                    planCandidates: (_37 = sessionStateData.planCandidates) === null || _37 === void 0 ? void 0 : _37.map(p => ({ id: p.id })),
                    selectedDestination: sessionStateData.selectedDestination,
                } : undefined);
            }
        }
        catch (error) {
            this.logger.debug(`获取路由结果失败: ${error.message}`);
        }
        let enhancedMessage = dto.message;
        finalSelectedDestination = finalSelectedDestination || ((_38 = finalRoutingResult === null || finalRoutingResult === void 0 ? void 0 : finalRoutingResult.extractedParams) === null || _38 === void 0 ? void 0 : _38.destination);
        if (finalSelectedDestination) {
            enhancedMessage = `[已选定目的地: ${finalSelectedDestination}] ${dto.message}`;
            this.logger.debug(`已选定目的地上下文: ${finalSelectedDestination}, 增强消息: ${enhancedMessage}`);
        }
        const response = await this.planningAssistantService.chat({
            sessionId: dto.sessionId,
            userId: dto.userId,
            message: enhancedMessage,
            language: dto.language,
            context: dto.context ? {
                currentLocation: ((_39 = dto.context.currentLocation) === null || _39 === void 0 ? void 0 : _39.lat) !== undefined && ((_40 = dto.context.currentLocation) === null || _40 === void 0 ? void 0 : _40.lng) !== undefined
                    ? { lat: dto.context.currentLocation.lat, lng: dto.context.currentLocation.lng }
                    : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
        const isChinese = dto.language === 'zh' || this.isChineseMessage(dto.message);
        const chatResponse = {
            message: response.message,
            messageCN: response.messageCN,
            reply: isChinese ? (response.messageCN || response.message) : response.message,
            replyCN: response.messageCN || response.message,
            phase: response.phase,
            sessionId: dto.sessionId,
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
        if (response.suggestedActions && response.suggestedActions.length > 0) {
            chatResponse.suggestedActions = response.suggestedActions.map(action => ({
                action: action.action,
                label: action.label,
                labelCN: action.labelCN,
                params: undefined,
            }));
        }
        return chatResponse;
    }
    async getRecommendations(params) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        this.logger.debug(`获取推荐: naturalLanguageDescription="${(_a = params.naturalLanguageDescription) === null || _a === void 0 ? void 0 : _a.substring(0, 50)}..."`);
        if (params.naturalLanguageDescription && this.smartRouter) {
            try {
                const extracted = await this.smartRouter.extractParams(params.naturalLanguageDescription, 'recommendations');
                const extractedPrefs = extracted.preferences || {};
                params = {
                    ...params,
                    preferences: {
                        ...params.preferences,
                        budget: extractedPrefs.budget ? {
                            total: extractedPrefs.budget.total || ((_c = (_b = params.preferences) === null || _b === void 0 ? void 0 : _b.budget) === null || _c === void 0 ? void 0 : _c.total) || 0,
                            currency: extractedPrefs.budget.currency || ((_e = (_d = params.preferences) === null || _d === void 0 ? void 0 : _d.budget) === null || _e === void 0 ? void 0 : _e.currency) || 'CNY',
                        } : (_f = params.preferences) === null || _f === void 0 ? void 0 : _f.budget,
                        travelers: extractedPrefs.travelers && extractedPrefs.travelers.adults !== undefined
                            ? { adults: extractedPrefs.travelers.adults, children: extractedPrefs.travelers.children }
                            : (_g = params.preferences) === null || _g === void 0 ? void 0 : _g.travelers,
                        activities: extractedPrefs.activities || ((_h = params.preferences) === null || _h === void 0 ? void 0 : _h.activities),
                        travelStyle: extractedPrefs.travelStyle || ((_j = params.preferences) === null || _j === void 0 ? void 0 : _j.travelStyle),
                    },
                    filters: {
                        ...params.filters,
                        ...extracted.filters,
                    },
                };
                this.logger.debug(`从自然语言提取参数: ${JSON.stringify(extracted).substring(0, 100)}...`);
            }
            catch (error) {
                this.logger.warn(`参数提取失败: ${error.message}`);
            }
        }
        if (this.cacheService) {
            const cacheKey = this.generateRecommendationsCacheKey(params);
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                this.logger.debug(`从缓存获取推荐结果: cacheKey=${cacheKey}`);
                return cached;
            }
        }
        let mergedPreferences = {};
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
        if (this.recommendationEngine) {
            this.logger.debug(`调用推荐引擎: countryCode=${(_k = params.filters) === null || _k === void 0 ? void 0 : _k.countryCode}, limit=${params.limit || 10}, preferences=${JSON.stringify(mergedPreferences).substring(0, 100)}`);
            const scoredDestinations = await this.recommendationEngine.getRecommendations({
                preferences: mergedPreferences,
                countryCode: (_l = params.filters) === null || _l === void 0 ? void 0 : _l.countryCode,
                limit: params.limit || 10,
            });
            this.logger.debug(`推荐引擎返回: ${scoredDestinations.length} 个推荐`);
            if (scoredDestinations.length > 0) {
                this.logger.debug(`第一个推荐详情: id=${scoredDestinations[0].destination.id}, name=${scoredDestinations[0].destination.name}, countryCode=${scoredDestinations[0].destination.countryCode}`);
            }
            else {
                this.logger.warn(`推荐引擎返回空数组: countryCode=${(_m = params.filters) === null || _m === void 0 ? void 0 : _m.countryCode}, 可能需要检查数据源`);
            }
            const recommendations = scoredDestinations.map(sd => {
                var _a;
                const rec = {
                    id: sd.destination.id,
                    countryCode: sd.destination.countryCode,
                    name: sd.destination.name || 'Unknown',
                    nameCN: sd.destination.nameCN || '未知',
                    description: sd.destination.description || '',
                    descriptionCN: sd.destination.descriptionCN || '',
                    highlights: sd.destination.highlights || [],
                    highlightsCN: sd.destination.highlightsCN || [],
                    matchScore: sd.destination.matchScore || ((_a = sd.scores) === null || _a === void 0 ? void 0 : _a.total) || 0,
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
            const response = {
                recommendations,
                sessionId: params.sessionId,
                preferencesUsed: params.preferences || {},
                generatedAt: new Date().toISOString(),
            };
            if (this.cacheService) {
                const cacheKey = this.generateRecommendationsCacheKey(params);
                await this.cacheService.set(cacheKey, response, 300).catch((error) => {
                    this.logger.warn(`推荐结果缓存失败: cacheKey=${cacheKey}`, error);
                });
            }
            return response;
        }
        else {
            this.logger.error(`推荐引擎不可用: recommendationEngine=${!!this.recommendationEngine}`);
        }
        throw new common_1.BadRequestException({
            success: false,
            errorCode: '5001',
            message: 'Recommendation engine not available',
            messageCN: '推荐引擎不可用',
        });
    }
    async generatePlan(dto) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        const startTime = Date.now();
        const traceId = (0, crypto_1.randomUUID)();
        this.logger.log({
            event: 'generate_plan_start',
            traceId,
            destination: dto.destination,
            sessionId: dto.sessionId,
            userId: dto.userId,
            timestamp: new Date().toISOString(),
        });
        this.logger.debug(`生成方案: destination=${dto.destination}, traceId=${traceId}`);
        if (!dto.destination && !dto.naturalLanguageDescription) {
            throw new planning_assistant_exceptions_1.DestinationRequiredException();
        }
        if (dto.naturalLanguageDescription && !dto.destination && this.smartRouter) {
            try {
                const extracted = await this.smartRouter.extractParams(dto.naturalLanguageDescription, 'generate');
                if (extracted.destination) {
                    dto.destination = extracted.destination;
                }
                if (extracted.preferences) {
                    const extractedPrefs = extracted.preferences;
                    dto.preferences = {
                        ...dto.preferences,
                        budget: extractedPrefs.budget ? {
                            total: extractedPrefs.budget.total || ((_b = (_a = dto.preferences) === null || _a === void 0 ? void 0 : _a.budget) === null || _b === void 0 ? void 0 : _b.total) || 0,
                            currency: extractedPrefs.budget.currency || ((_d = (_c = dto.preferences) === null || _c === void 0 ? void 0 : _c.budget) === null || _d === void 0 ? void 0 : _d.currency) || 'CNY',
                        } : (_e = dto.preferences) === null || _e === void 0 ? void 0 : _e.budget,
                        travelers: extractedPrefs.travelers && extractedPrefs.travelers.adults !== undefined
                            ? { adults: extractedPrefs.travelers.adults, children: extractedPrefs.travelers.children }
                            : (_f = dto.preferences) === null || _f === void 0 ? void 0 : _f.travelers,
                        activities: extractedPrefs.activities || ((_g = dto.preferences) === null || _g === void 0 ? void 0 : _g.activities),
                        travelStyle: extractedPrefs.travelStyle || ((_h = dto.preferences) === null || _h === void 0 ? void 0 : _h.travelStyle),
                    };
                }
                if (extracted.constraints) {
                    dto.constraints = {
                        ...dto.constraints,
                        ...extracted.constraints,
                    };
                }
                this.logger.debug(`从自然语言提取参数: ${JSON.stringify(extracted).substring(0, 100)}...`);
            }
            catch (error) {
                this.logger.warn(`参数提取失败: ${error.message}`);
            }
        }
        let mergedPreferences = {};
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
        if (this.coreGateway) {
            const coreResult = await this.coreGateway.generatePlan({
                userId: dto.userId || 'anonymous',
                sessionId: dto.sessionId || '',
                destination: dto.destination,
                preferences: mergedPreferences,
                constraints: dto.constraints,
            });
            if (!coreResult.success || !coreResult.data) {
                throw new common_1.BadRequestException({
                    success: false,
                    errorCode: '3004',
                    message: 'Plan generation failed',
                    messageCN: '方案生成失败',
                    details: coreResult.error,
                    traceId: (_j = coreResult.meta) === null || _j === void 0 ? void 0 : _j.traceId,
                });
            }
            const workbenchResponse = coreResult.data;
            let plans = [];
            if (workbenchResponse) {
                if ((_k = workbenchResponse.uiOutput) === null || _k === void 0 ? void 0 : _k.skeletonOptions) {
                    plans = this.convertSkeletonOptionsToPlanCandidates(workbenchResponse.uiOutput.skeletonOptions, workbenchResponse.planState, workbenchResponse.uiOutput.personas);
                }
                else if (workbenchResponse.planState) {
                    plans = [this.convertPlanStateToPlanCandidate(workbenchResponse.planState, (_l = workbenchResponse.uiOutput) === null || _l === void 0 ? void 0 : _l.personas)];
                }
            }
            if (plans.length === 0) {
                this.logger.warn(`方案生成成功但转换后无方案: traceId=${(_m = coreResult.meta) === null || _m === void 0 ? void 0 : _m.traceId}`);
            }
            if (dto.sessionId && plans.length > 0) {
                try {
                    const state = await this.planningAssistantService.getSessionState(dto.sessionId);
                    if (state) {
                        const planCandidates = this.convertPlanCandidatesDtoToPlanCandidates(plans);
                        await this.updateSessionState(dto.sessionId, {
                            planCandidates,
                            phase: 'COMPARING',
                        });
                    }
                }
                catch (error) {
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
                coreTraceId: (_o = coreResult.meta) === null || _o === void 0 ? void 0 : _o.traceId,
                timestamp: new Date().toISOString(),
            });
            return {
                plans,
                sessionId: dto.sessionId,
                generatedAt: new Date().toISOString(),
                traceId: ((_p = coreResult.meta) === null || _p === void 0 ? void 0 : _p.traceId) || traceId,
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
        throw new common_1.BadRequestException({
            success: false,
            errorCode: '1009',
            message: 'CoreGateway not available',
            messageCN: '核心网关不可用',
            details: { traceId },
        });
    }
    async generatePlanAsync(dto) {
        this.logger.debug(`异步生成方案: destination=${dto.destination}`);
        if (!this.taskService) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '5002',
                message: 'Task service not available',
                messageCN: '任务服务不可用',
            });
        }
        const taskId = this.taskService.createTask('generate_plan', dto);
        this.executeGeneratePlanAsync(taskId, dto).catch(error => {
            var _a;
            this.logger.error(`异步生成方案失败: taskId=${taskId}`, error);
            (_a = this.taskService) === null || _a === void 0 ? void 0 : _a.markFailed(taskId, error).catch(() => { });
        });
        const task = await this.taskService.getTaskStatus(taskId);
        if (!task) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '5004',
                message: 'Failed to create task',
                messageCN: '创建任务失败',
            });
        }
        const status = task.status === 'CANCELLED' ? 'FAILED' :
            task.status;
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
    async getGenerateTaskStatus(taskId, requestingUserId) {
        var _a;
        this.logger.debug(`查询任务状态: taskId=${taskId}, requestingUserId=${requestingUserId}`);
        if (!this.taskService) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '5002',
                message: 'Task service not available',
                messageCN: '任务服务不可用',
            });
        }
        const task = await this.taskService.getTaskStatus(taskId);
        if (!task) {
            throw new common_1.NotFoundException({
                success: false,
                errorCode: '4001',
                message: 'Task not found',
                messageCN: '任务不存在',
                details: { taskId },
            });
        }
        if (requestingUserId && ((_a = task.metadata) === null || _a === void 0 ? void 0 : _a.userId) && task.metadata.userId !== requestingUserId) {
            throw new common_1.ForbiddenException({
                success: false,
                errorCode: '4002',
                message: 'Access denied',
                messageCN: '无权访问此任务',
                details: { taskId },
            });
        }
        const status = task.status === 'CANCELLED' ? 'FAILED' :
            task.status;
        const response = {
            taskId: task.taskId,
            status,
            progress: task.progress,
            currentStage: task.currentStage,
            estimatedTimeRemaining: task.estimatedTimeRemaining,
            result: task.status === task_service_1.TaskStatus.COMPLETED && task.result ? { plans: task.result.plans || [] } : undefined,
            error: (task.status === task_service_1.TaskStatus.FAILED || task.status === task_service_1.TaskStatus.CANCELLED) && task.error ? {
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
    async comparePlans(dto, requestingUserId) {
        var _a;
        this.logger.debug(`对比方案: planIds=${dto.planIds.join(',')}, requestingUserId=${requestingUserId}`);
        if (!dto.planIds || dto.planIds.length < 2) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '3003',
                message: 'At least 2 plan IDs are required for comparison',
                messageCN: '至少需要2个方案ID进行对比',
                details: { planIds: dto.planIds },
            });
        }
        if (dto.planIds.length < 2) {
            throw new common_1.BadRequestException({
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
        let planCandidates = [];
        if (dto.sessionId) {
            const state = await this.planningAssistantService.getSessionState(dto.sessionId);
            if (state && requestingUserId && state.userId && state.userId !== requestingUserId) {
                throw new common_1.ForbiddenException({
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
                    this.logger.debug(`CoreGateway对比方案成功: traceId=${(_a = coreResult.meta) === null || _a === void 0 ? void 0 : _a.traceId}`);
                }
            }
            catch (error) {
                this.logger.warn(`CoreGateway对比方案失败: ${error.message}`);
            }
        }
        if (planCandidates.length < 2) {
            throw new common_1.BadRequestException({
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
        const dimensions = dto.compareFields || ['budget', 'duration', 'pace', 'suitability'];
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
        const differences = this.calculateDifferences(planCandidates, dimensions);
        const recommendation = this.generateComparisonRecommendation(planCandidates);
        return {
            plans,
            dimensions,
            differences,
            recommendation,
        };
    }
    paceToScore(pace) {
        const paceMap = { relaxed: 1, moderate: 2, intensive: 3 };
        return paceMap[pace] || 2;
    }
    calculateDifferences(plans, dimensions) {
        const differences = [];
        if (plans.length < 2)
            return differences;
        const plan1 = plans[0];
        const plan2 = plans[1];
        dimensions.forEach(field => {
            let plan1Value;
            let plan2Value;
            let impact = 'low';
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
                    return;
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
    generateDifferenceDescription(field, value1, value2) {
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
    generateDifferenceDescriptionCN(field, value1, value2) {
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
    translatePace(pace) {
        const paceMap = {
            relaxed: '轻松',
            moderate: '适中',
            intensive: '紧凑',
        };
        return paceMap[pace] || pace;
    }
    generateComparisonRecommendation(plans) {
        if (plans.length < 2) {
            return {};
        }
        const bestBudget = plans.reduce((best, current) => current.estimatedBudget.total < best.estimatedBudget.total ? current : best).id;
        const bestSuitability = plans.reduce((best, current) => current.suitability.score > best.suitability.score ? current : best).id;
        const summary = `Plan comparison completed. Best budget option: ${bestBudget}, Best match: ${bestSuitability}`;
        const summaryCN = `方案对比完成。最佳预算方案：${bestBudget}，最佳匹配方案：${bestSuitability}`;
        return {
            bestBudget,
            bestRoute: bestSuitability,
            summary,
            summaryCN,
        };
    }
    async optimizePlan(dto, requestingUserId) {
        var _a, _b;
        this.logger.debug(`优化方案: planId=${dto.planId}, type=${dto.optimizationType}, requestingUserId=${requestingUserId}`);
        if (!dto.planId) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '3002',
                message: 'Plan ID is required',
                messageCN: '方案ID必填',
            });
        }
        if (!dto.sessionId) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '2003',
                message: 'Session ID is required',
                messageCN: '会话ID必填',
            });
        }
        let originalPlan;
        if (dto.sessionId) {
            const state = await this.planningAssistantService.getSessionState(dto.sessionId);
            if (state) {
                if (requestingUserId && state.userId && state.userId !== requestingUserId) {
                    throw new common_1.ForbiddenException({
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
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '3006',
                message: 'Plan not found',
                messageCN: '方案不存在',
                details: { planId: dto.planId },
            });
        }
        const sessionState = dto.sessionId ?
            await this.planningAssistantService.getSessionState(dto.sessionId) :
            null;
        const optimizationParams = {
            destination: originalPlan.destination,
            duration: originalPlan.duration,
            budget: originalPlan.estimatedBudget.total,
            pace: originalPlan.pace,
        };
        if (dto.requirements) {
            if (dto.requirements.slowerPace) {
                if (optimizationParams.pace === 'intensive') {
                    optimizationParams.pace = 'moderate';
                }
                else if (optimizationParams.pace === 'moderate') {
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
        let optimizedPlans = [];
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
                                currency: originalPlan.estimatedBudget.currency || 'CNY',
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
                        userId: (sessionState === null || sessionState === void 0 ? void 0 : sessionState.userId) || 'anonymous',
                        sessionId: dto.sessionId || '',
                    },
                });
                if (coreResult.success && coreResult.data) {
                    const workbenchResponse = coreResult.data;
                    if (workbenchResponse.planState) {
                        optimizedPlans = [
                            this.convertPlanStateToPlanCandidate(workbenchResponse.planState, (_a = workbenchResponse.uiOutput) === null || _a === void 0 ? void 0 : _a.personas),
                        ];
                    }
                    else if ((_b = workbenchResponse.uiOutput) === null || _b === void 0 ? void 0 : _b.skeletonOptions) {
                        optimizedPlans = this.convertSkeletonOptionsToPlanCandidates(workbenchResponse.uiOutput.skeletonOptions, workbenchResponse.planState);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`CoreGateway优化方案失败: ${error.message}`);
                optimizedPlans = [this.createOptimizedPlanFromOriginal(originalPlan, dto)];
            }
        }
        else {
            optimizedPlans = [this.createOptimizedPlanFromOriginal(originalPlan, dto)];
        }
        return {
            plans: optimizedPlans,
            generatedAt: new Date().toISOString(),
            sessionId: dto.sessionId,
        };
    }
    async confirmPlan(dto) {
        var _a, _b, _c, _d, _e;
        const startTime = Date.now();
        const traceId = (0, crypto_1.randomUUID)();
        this.logger.log({
            event: 'confirm_plan_start',
            traceId,
            planId: dto.planId,
            userId: dto.userId,
            sessionId: dto.sessionId,
            timestamp: new Date().toISOString(),
        });
        this.logger.debug(`确认方案: planId=${dto.planId}, userId=${dto.userId}, traceId=${traceId}`);
        if (!dto.planId) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '3002',
                message: 'Plan ID is required',
                messageCN: '方案ID必填',
            });
        }
        let sessionState = null;
        let selectedPlan;
        if (dto.sessionId) {
            try {
                sessionState = await this.planningAssistantService.getSessionState(dto.sessionId);
                if (sessionState && sessionState.planCandidates) {
                    selectedPlan = sessionState.planCandidates.find(p => p.id === dto.planId);
                }
            }
            catch (error) {
                this.logger.warn(`获取会话状态失败: ${error.message}`);
            }
        }
        if (!selectedPlan) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '3006',
                message: 'Plan not found',
                messageCN: '方案不存在',
                details: { planId: dto.planId },
            });
        }
        let tripId;
        if (this.prisma) {
            try {
                const { generateDefaultTripName } = require('../../../../trips/utils/trip-name.util');
                const destination = (sessionState === null || sessionState === void 0 ? void 0 : sessionState.selectedDestination) || selectedPlan.destination;
                const startDate = ((_b = (_a = sessionState === null || sessionState === void 0 ? void 0 : sessionState.preferences) === null || _a === void 0 ? void 0 : _a.dateRange) === null || _b === void 0 ? void 0 : _b.startDate) || this.getDefaultStartDate();
                const endDate = ((_d = (_c = sessionState === null || sessionState === void 0 ? void 0 : sessionState.preferences) === null || _c === void 0 ? void 0 : _c.dateRange) === null || _d === void 0 ? void 0 : _d.endDate) || this.getDefaultEndDate(selectedPlan.duration);
                const tripName = generateDefaultTripName({
                    destination,
                    startDate: new Date(startDate),
                });
                tripId = (0, crypto_1.randomUUID)();
                const trip = await this.prisma.$transaction(async (tx) => {
                    var _a, _b;
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
                                currency: selectedPlan.estimatedBudget.currency || 'CNY',
                            },
                            pacingConfig: {
                                pacePreference: selectedPlan.pace === 'relaxed' ? 'RELAXED' :
                                    selectedPlan.pace === 'intensive' ? 'INTENSIVE' : 'BALANCED',
                            },
                            metadata: {
                                userId: dto.userId || (sessionState === null || sessionState === void 0 ? void 0 : sessionState.userId) || 'anonymous',
                                travelers: ((_b = (_a = sessionState === null || sessionState === void 0 ? void 0 : sessionState.preferences) === null || _a === void 0 ? void 0 : _a.travelers) === null || _b === void 0 ? void 0 : _b.adults) || 2,
                                planId: selectedPlan.id,
                                sessionId: dto.sessionId,
                                confirmedAt: new Date().toISOString(),
                            },
                        },
                    });
                    if (dto.userId) {
                        await tx.tripCollaborator.create({
                            data: {
                                id: (0, crypto_1.randomUUID)(),
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
            }
            catch (error) {
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
                throw new common_1.BadRequestException({
                    success: false,
                    errorCode: '3007',
                    message: 'Failed to create trip',
                    messageCN: '创建行程失败',
                    details: { error: error.message, traceId },
                });
            }
        }
        else {
            tripId = `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.logger.warn(`PrismaService不可用，使用临时tripId: ${tripId}`);
        }
        const parallelTasks = [];
        if (dto.sessionId) {
            parallelTasks.push(this.updateSessionState(dto.sessionId, {
                confirmedTripId: tripId,
                selectedPlanId: dto.planId,
                phase: 'COMPLETED',
            }).catch((error) => {
                this.logger.warn(`更新会话状态失败: ${error.message}`);
            }));
        }
        if (this.preferenceLearning && dto.userId && sessionState) {
            parallelTasks.push(this.preferenceLearning.learnFromAction({
                userId: dto.userId,
                action: 'plan_confirmed',
                data: {
                    destination: selectedPlan.destination,
                    budget: selectedPlan.estimatedBudget.total,
                    days: selectedPlan.duration,
                    travelers: (_e = sessionState.preferences) === null || _e === void 0 ? void 0 : _e.travelers,
                    pace: selectedPlan.pace,
                },
            }).catch((error) => {
                this.logger.warn(`偏好学习失败: ${error.message}`);
            }));
        }
        if (parallelTasks.length > 0) {
            await Promise.all(parallelTasks);
        }
        if (dto.saveToCalendar) {
            this.logger.debug(`日历集成功能待实现: tripId=${tripId}`);
        }
        if (dto.sendReminders) {
            this.logger.debug(`提醒功能待实现: tripId=${tripId}`);
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
    async optimizeTrip(dto, requestingUserId) {
        var _a, _b, _c, _d, _e, _f;
        this.logger.debug(`优化行程: tripId=${dto.tripId}, type=${dto.optimizationType}`);
        if (!dto.tripId) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '4003',
                message: 'Trip ID is required',
                messageCN: '行程ID必填',
            });
        }
        let trip;
        if (this.prisma) {
            trip = await this.prisma.trip.findUnique({
                where: { id: dto.tripId },
                include: {
                    TripCollaborator: true,
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException({
                    success: false,
                    errorCode: '4002',
                    message: 'Trip not found',
                    messageCN: '行程不存在',
                    details: { tripId: dto.tripId },
                });
            }
            if (requestingUserId) {
                const isOwner = (_a = trip.TripCollaborator) === null || _a === void 0 ? void 0 : _a.some((collab) => collab.userId === requestingUserId && collab.role === 'OWNER');
                const metadataUserId = (_b = trip.metadata) === null || _b === void 0 ? void 0 : _b.userId;
                const hasAccess = isOwner || metadataUserId === requestingUserId;
                if (!hasAccess) {
                    throw new common_1.ForbiddenException({
                        success: false,
                        errorCode: '4005',
                        message: 'Access denied',
                        messageCN: '无权优化此行程',
                        details: { tripId: dto.tripId },
                    });
                }
            }
        }
        else {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '5003',
                message: 'PrismaService not available',
                messageCN: '数据库服务不可用',
            });
        }
        const changeIntent = {
            intentId: `optimize_${Date.now()}`,
            type: this.mapOptimizationTypeToChangeIntentType(dto.optimizationType || 'route'),
            target: {
                tripId: dto.tripId,
            },
            to: {},
            constraints: {},
            reason: `Optimize trip: ${dto.optimizationType || 'general'}`,
            urgency: 'normal',
            userConfirmed: true,
        };
        if (dto.requirements) {
            if (dto.optimizationType === 'budget' && dto.requirements.reduceBudget) {
                changeIntent.to = {
                    budget: {
                        total: ((_c = trip.budgetConfig) === null || _c === void 0 ? void 0 : _c.total) - dto.requirements.reduceBudget,
                    },
                };
            }
            else if (dto.optimizationType === 'pace' && dto.requirements.slowerPace) {
                const currentPace = ((_d = trip.pacingConfig) === null || _d === void 0 ? void 0 : _d.pacePreference) || 'BALANCED';
                changeIntent.to = {
                    pace: currentPace === 'INTENSIVE' ? 'BALANCED' : 'RELAXED',
                };
            }
            else if (dto.optimizationType === 'activities') {
                changeIntent.to = {
                    addActivities: dto.requirements.addActivities || [],
                    removeActivities: dto.requirements.removeActivities || [],
                };
            }
        }
        if (this.coreGateway) {
            try {
                const userId = ((_e = trip.metadata) === null || _e === void 0 ? void 0 : _e.userId) || 'anonymous';
                const coreResult = await this.coreGateway.applyChangeIntent({
                    userId,
                    tripId: dto.tripId,
                    intent: changeIntent,
                });
                if (!coreResult.success) {
                    this.logger.warn(`CoreGateway优化行程失败: ${((_f = coreResult.error) === null || _f === void 0 ? void 0 : _f.message) || 'Unknown error'}`);
                }
            }
            catch (error) {
                this.logger.warn(`CoreGateway优化行程异常: ${error.message}`);
            }
        }
        if (this.prisma && changeIntent.to) {
            try {
                const updateData = {};
                if (changeIntent.to.budget) {
                    updateData.budgetConfig = {
                        ...trip.budgetConfig,
                        total: changeIntent.to.budget.total,
                    };
                }
                if (changeIntent.to.pace) {
                    updateData.pacingConfig = {
                        ...trip.pacingConfig,
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
            }
            catch (error) {
                this.logger.error(`更新行程失败: ${error.message}`, error.stack);
                throw new common_1.BadRequestException({
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
    isChineseMessage(message) {
        if (!message || message.length === 0) {
            return false;
        }
        const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
        return chineseRegex.test(message);
    }
    async ensureSessionExists(sessionId, userId) {
        try {
            const state = await this.planningAssistantService.getSessionState(sessionId);
            if (!state) {
                this.logger.debug(`会话不存在，自动创建: sessionId=${sessionId}`);
                const now = new Date().toISOString();
                const newState = {
                    sessionId,
                    userId,
                    phase: 'INITIAL',
                    preferences: {},
                    messageHistory: [],
                    createdAt: now,
                    updatedAt: now,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                };
                await this.planningAssistantService.saveSession(newState);
            }
        }
        catch (error) {
            this.logger.warn(`确保会话存在失败: sessionId=${sessionId}, error=${error.message}`);
            try {
                const now = new Date().toISOString();
                const newState = {
                    sessionId,
                    userId,
                    phase: 'INITIAL',
                    preferences: {},
                    messageHistory: [],
                    createdAt: now,
                    updatedAt: now,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                };
                await this.planningAssistantService.saveSession(newState);
            }
            catch (createError) {
                this.logger.error(`创建会话失败: ${createError.message}`);
            }
        }
    }
    async updateSessionAfterBusinessCall(sessionId, updates) {
        var _a, _b, _c, _d;
        try {
            let state = await this.planningAssistantService.getSessionState(sessionId);
            if (!state) {
                this.logger.debug(`会话不存在，创建新会话: sessionId=${sessionId}`);
                const userId = ((_b = (_a = updates.recommendations) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.userId) || ((_d = (_c = updates.planCandidates) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.userId);
                await this.ensureSessionExists(sessionId, userId);
                state = await this.planningAssistantService.getSessionState(sessionId);
            }
            if (!state) {
                this.logger.warn(`无法获取或创建会话: sessionId=${sessionId}`);
                return;
            }
            const stateAfterUserMessage = this.planningAssistantService.addMessage(state, {
                id: (0, crypto_1.randomUUID)(),
                role: 'user',
                content: updates.message,
                timestamp: new Date().toISOString(),
            });
            if (!stateAfterUserMessage) {
                this.logger.warn(`添加用户消息失败: sessionId=${sessionId}`);
                return;
            }
            const stateAfterAssistantMessage = this.planningAssistantService.addMessage(stateAfterUserMessage, {
                id: (0, crypto_1.randomUUID)(),
                role: 'assistant',
                content: updates.response,
                timestamp: new Date().toISOString(),
            });
            if (!stateAfterAssistantMessage) {
                this.logger.warn(`添加助手回复失败: sessionId=${sessionId}`);
                return;
            }
            state = stateAfterAssistantMessage;
            state.phase = updates.phase;
            state.updatedAt = new Date().toISOString();
            if (updates.recommendations) {
                state.recommendations = updates.recommendations.map((rec) => ({
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
                state.planCandidates = this.convertPlanCandidatesDtoToPlanCandidates(updates.planCandidates);
            }
            await this.planningAssistantService.saveSession(state);
            if (this.cacheService) {
                await this.cacheService.delete(`session:${sessionId}`).catch(() => { });
            }
            this.logger.debug(`会话状态已更新: sessionId=${sessionId}, phase=${updates.phase}`);
        }
        catch (error) {
            this.logger.warn(`更新会话状态失败: sessionId=${sessionId}, error=${error.message}`);
        }
    }
    async refineTrip(dto, requestingUserId) {
        var _a, _b, _c, _d, _e;
        this.logger.debug(`细化行程: tripId=${dto.tripId}, days=${(_a = dto.days) === null || _a === void 0 ? void 0 : _a.join(',')}`);
        if (!dto.tripId) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '4003',
                message: 'Trip ID is required',
                messageCN: '行程ID必填',
            });
        }
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
                    TripCollaborator: true,
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException({
                    success: false,
                    errorCode: '4002',
                    message: 'Trip not found',
                    messageCN: '行程不存在',
                    details: { tripId: dto.tripId },
                });
            }
            if (requestingUserId) {
                const isOwner = (_b = trip.TripCollaborator) === null || _b === void 0 ? void 0 : _b.some((collab) => collab.userId === requestingUserId && collab.role === 'OWNER');
                const metadataUserId = (_c = trip.metadata) === null || _c === void 0 ? void 0 : _c.userId;
                const hasAccess = isOwner || metadataUserId === requestingUserId;
                if (!hasAccess) {
                    throw new common_1.ForbiddenException({
                        success: false,
                        errorCode: '4006',
                        message: 'Access denied',
                        messageCN: '无权细化此行程',
                        details: { tripId: dto.tripId },
                    });
                }
            }
        }
        else {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '5003',
                message: 'PrismaService not available',
                messageCN: '数据库服务不可用',
            });
        }
        const totalDays = trip.TripDay.length;
        const daysToRefine = dto.days && dto.days.length > 0
            ? dto.days.filter(day => day >= 1 && day <= totalDays)
            : Array.from({ length: totalDays }, (_, i) => i + 1);
        if (daysToRefine.length === 0) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '3009',
                message: 'No valid days to refine',
                messageCN: '没有有效的天数可以细化',
                details: { requestedDays: dto.days, totalDays },
            });
        }
        const userId = ((_d = trip.metadata) === null || _d === void 0 ? void 0 : _d.userId) || 'anonymous';
        const changesApplied = [];
        for (const dayNumber of daysToRefine) {
            const tripDay = trip.TripDay[dayNumber - 1];
            if (!tripDay)
                continue;
            const changeIntent = {
                intentId: `refine_day_${dayNumber}_${Date.now()}`,
                type: 'activity',
                target: {
                    tripId: dto.tripId,
                    dayIndex: dayNumber - 1,
                },
                to: {
                    addDetails: {},
                },
                constraints: {},
                reason: `Refine trip day ${dayNumber}`,
                urgency: 'normal',
                userConfirmed: true,
            };
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
            if (this.coreGateway && Object.keys(changeIntent.to.addDetails).length > 0) {
                try {
                    const coreResult = await this.coreGateway.applyChangeIntent({
                        userId,
                        tripId: dto.tripId,
                        intent: changeIntent,
                    });
                    if (!coreResult.success) {
                        this.logger.warn(`CoreGateway细化行程失败（Day ${dayNumber}）: ${((_e = coreResult.error) === null || _e === void 0 ? void 0 : _e.message) || 'Unknown error'}`);
                    }
                }
                catch (error) {
                    this.logger.warn(`CoreGateway细化行程异常（Day ${dayNumber}）: ${error.message}`);
                }
            }
        }
        if (this.prisma && changesApplied.length > 0) {
            try {
                await this.prisma.trip.update({
                    where: { id: dto.tripId },
                    data: {
                        updatedAt: new Date(),
                        metadata: {
                            ...(trip.metadata || {}),
                            lastRefinedAt: new Date().toISOString(),
                            refinedDays: daysToRefine,
                        },
                    },
                });
                this.logger.debug(`行程已细化: tripId=${dto.tripId}, days=${daysToRefine.join(',')}`);
            }
            catch (error) {
                this.logger.warn(`更新行程元数据失败: ${error.message}`);
            }
        }
        return {
            success: true,
            tripId: dto.tripId,
        };
    }
    async getTripSuggestions(tripId, requestingUserId) {
        var _a, _b, _c, _d;
        this.logger.debug(`获取优化建议: tripId=${tripId}, requestingUserId=${requestingUserId}`);
        if (!tripId) {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '4003',
                message: 'Trip ID is required',
                messageCN: '行程ID必填',
            });
        }
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
                    TripCollaborator: true,
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException({
                    success: false,
                    errorCode: '4002',
                    message: 'Trip not found',
                    messageCN: '行程不存在',
                    details: { tripId },
                });
            }
            if (requestingUserId) {
                const isOwner = (_a = trip.TripCollaborator) === null || _a === void 0 ? void 0 : _a.some((collab) => collab.userId === requestingUserId && collab.role === 'OWNER');
                const metadataUserId = (_b = trip.metadata) === null || _b === void 0 ? void 0 : _b.userId;
                const hasAccess = isOwner || metadataUserId === requestingUserId;
                if (!hasAccess) {
                    throw new common_1.ForbiddenException({
                        success: false,
                        errorCode: '4004',
                        message: 'Access denied',
                        messageCN: '无权访问此行程',
                        details: { tripId },
                    });
                }
            }
        }
        else {
            throw new common_1.BadRequestException({
                success: false,
                errorCode: '5003',
                message: 'PrismaService not available',
                messageCN: '数据库服务不可用',
            });
        }
        const suggestions = [];
        const budgetConfig = trip.budgetConfig;
        const pacingConfig = trip.pacingConfig;
        const totalDays = trip.TripDay.length;
        const totalItems = trip.TripDay.reduce((sum, day) => sum + day.ItineraryItem.length, 0);
        const avgItemsPerDay = totalDays > 0 ? totalItems / totalDays : 0;
        let diagnosisResult = null;
        if (this.coreGateway) {
            try {
                const userId = ((_c = trip.metadata) === null || _c === void 0 ? void 0 : _c.userId) || 'anonymous';
                const coreResult = await this.coreGateway.getTripStatus({
                    userId,
                    tripId,
                });
                if (coreResult.success && coreResult.data) {
                    diagnosisResult = coreResult.data;
                }
            }
            catch (error) {
                this.logger.warn(`CoreGateway诊断行程失败: ${error.message}`);
            }
        }
        if (budgetConfig === null || budgetConfig === void 0 ? void 0 : budgetConfig.total) {
            if ((_d = diagnosisResult === null || diagnosisResult === void 0 ? void 0 : diagnosisResult.budget) === null || _d === void 0 ? void 0 : _d.overrun) {
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
        const pacePreference = (pacingConfig === null || pacingConfig === void 0 ? void 0 : pacingConfig.pacePreference) || 'BALANCED';
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
        }
        else if (avgItemsPerDay < 2 && totalDays > 3) {
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
        }
        else {
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
        const hasRestaurants = trip.TripDay.some(day => day.ItineraryItem.some(item => item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING'));
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
        const hasTransport = trip.TripDay.some(day => day.ItineraryItem.some(item => item.type === 'TRANSIT'));
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
    convertSkeletonOptionsToPlanCandidates(skeletonOptions, planState, personas) {
        var _a, _b;
        if (!skeletonOptions || !skeletonOptions.options || !Array.isArray(skeletonOptions.options)) {
            this.logger.warn('SkeletonOptions格式不正确或为空');
            return [];
        }
        const options = skeletonOptions.options;
        const recommendation = skeletonOptions.recommendation;
        this.logger.debug(`转换SkeletonOptions: optionsCount=${options.length}, recommendation=${(recommendation === null || recommendation === void 0 ? void 0 : recommendation.optionId) || 'none'}`);
        const destination = this.extractDestination(planState);
        const duration = ((_b = (_a = planState.constraints) === null || _a === void 0 ? void 0 : _a.time) === null || _b === void 0 ? void 0 : _b.days) || 7;
        const baseBudget = this.extractBudget(planState);
        const planCandidates = options.map((skeleton, index) => {
            var _a, _b, _c, _d;
            const skeletonId = skeleton.id || `skeleton_${index}`;
            const skeletonName = skeleton.name || `方案 ${index + 1}`;
            const description = ((_a = skeleton.rationale) === null || _a === void 0 ? void 0 : _a.philosophy) || `A ${skeletonName.toLowerCase()} travel plan`;
            const descriptionCN = ((_b = skeleton.rationale) === null || _b === void 0 ? void 0 : _b.philosophy) || `${skeletonName}旅行方案`;
            const highlights = [];
            if (skeleton.anchors && Array.isArray(skeleton.anchors)) {
                skeleton.anchors
                    .filter((a) => a.priority === 'anchor')
                    .forEach((a) => {
                    highlights.push(`${a.location}: ${a.activity}`);
                });
            }
            if (skeleton.dayThemes && Array.isArray(skeleton.dayThemes)) {
                skeleton.dayThemes.slice(0, 3).forEach((theme) => {
                    if (theme.theme) {
                        highlights.push(`Day ${theme.day}: ${theme.theme}`);
                    }
                });
            }
            const strengths = ((_c = skeleton.rationale) === null || _c === void 0 ? void 0 : _c.strengths) || [];
            const weaknesses = ((_d = skeleton.rationale) === null || _d === void 0 ? void 0 : _d.weaknesses) || [];
            const pace = this.inferPaceFromSkeletonName(skeletonName);
            const planCandidate = {
                id: skeletonId,
                name: skeletonName,
                nameCN: this.translateSkeletonName(skeletonName),
                description,
                descriptionCN,
                destination,
                duration,
                highlights: highlights.length > 0 ? highlights : ['精心规划的行程', '丰富的活动安排'],
                estimatedBudget: baseBudget,
                pace,
                suitability: {
                    score: this.calculateSuitabilityFromSkeleton(skeleton, recommendation),
                    reasons: strengths.length > 0 ? strengths : ['方案设计合理'],
                },
            };
            if (skeleton.rationale) {
                planCandidate.explanation = {
                    whyRecommended: (recommendation === null || recommendation === void 0 ? void 0 : recommendation.optionId) === skeletonId
                        ? recommendation.reason
                        : skeleton.rationale.philosophy || 'Well-designed travel plan',
                    whyRecommendedCN: (recommendation === null || recommendation === void 0 ? void 0 : recommendation.optionId) === skeletonId
                        ? recommendation.reason
                        : skeleton.rationale.philosophy || '精心设计的旅行方案',
                    strengths: strengths,
                    strengthsCN: strengths,
                    considerations: weaknesses,
                    considerationsCN: weaknesses,
                };
            }
            if (weaknesses.length > 0) {
                planCandidate.optimizationTips = weaknesses.slice(0, 3).map((weakness) => ({
                    tip: `Consider: ${weakness}`,
                    tipCN: `建议：${weakness}`,
                    impact: 'medium',
                }));
            }
            if (personas) {
                planCandidate.personas = this.convertPersonasToEvaluation(personas);
            }
            return planCandidate;
        });
        return planCandidates;
    }
    inferPaceFromSkeletonName(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('relaxed') || nameLower.includes('轻松') || nameLower.includes('slow')) {
            return 'relaxed';
        }
        if (nameLower.includes('intensive') || nameLower.includes('紧凑') || nameLower.includes('fast') || nameLower.includes('packed')) {
            return 'intensive';
        }
        return 'moderate';
    }
    translateSkeletonName(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('relaxed'))
            return name.replace(/relaxed/gi, '轻松');
        if (nameLower.includes('intensive'))
            return name.replace(/intensive/gi, '紧凑');
        if (nameLower.includes('balanced'))
            return name.replace(/balanced/gi, '均衡');
        if (nameLower.includes('compact'))
            return name.replace(/compact/gi, '紧凑');
        return name;
    }
    calculateSuitabilityFromSkeleton(skeleton, recommendation) {
        var _a, _b;
        let score = 70;
        if (recommendation && recommendation.optionId === skeleton.id) {
            score += 20;
        }
        const strengths = ((_a = skeleton.rationale) === null || _a === void 0 ? void 0 : _a.strengths) || [];
        const weaknesses = ((_b = skeleton.rationale) === null || _b === void 0 ? void 0 : _b.weaknesses) || [];
        score += strengths.length * 5;
        score -= weaknesses.length * 5;
        return Math.max(50, Math.min(100, score));
    }
    convertPlanStateToPlanCandidate(planState, personas) {
        var _a, _b;
        this.logger.debug(`转换PlanState: planId=${planState.plan_id || 'unknown'}`);
        const destination = this.extractDestination(planState);
        const duration = ((_b = (_a = planState.constraints) === null || _a === void 0 ? void 0 : _a.time) === null || _b === void 0 ? void 0 : _b.days) || 7;
        const budget = this.extractBudget(planState);
        const pace = this.determinePaceFromPlanState(planState.pace);
        const highlights = this.extractHighlights(planState);
        const warnings = this.extractWarnings(planState);
        const { name, nameCN, description, descriptionCN } = this.generatePlanNameAndDescription(planState, destination, duration);
        const suitability = this.calculateSuitability(planState);
        const planCandidate = {
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
        if (warnings.length > 0) {
            planCandidate.warnings = warnings;
        }
        if (personas) {
            planCandidate.personas = this.convertPersonasToEvaluation(personas);
        }
        return planCandidate;
    }
    extractDestination(planState) {
        var _a, _b, _c, _d, _e, _f;
        if ((_a = planState.world) === null || _a === void 0 ? void 0 : _a.destination) {
            return planState.world.destination.city || planState.world.destination.country || 'Unknown';
        }
        if ((_b = planState.metadata) === null || _b === void 0 ? void 0 : _b.destination) {
            return planState.metadata.destination;
        }
        if (((_d = (_c = planState.itinerary) === null || _c === void 0 ? void 0 : _c.segments) === null || _d === void 0 ? void 0 : _d.length) > 0) {
            const firstSegment = planState.itinerary.segments[0];
            return ((_e = firstSegment.from) === null || _e === void 0 ? void 0 : _e.city) || ((_f = firstSegment.from) === null || _f === void 0 ? void 0 : _f.name) || 'Unknown';
        }
        return 'Unknown';
    }
    extractBudget(planState) {
        var _a, _b, _c, _d, _e;
        const currency = ((_b = (_a = planState.constraints) === null || _a === void 0 ? void 0 : _a.budget) === null || _b === void 0 ? void 0 : _b.currency) || 'USD';
        if ((_d = (_c = planState.budget) === null || _c === void 0 ? void 0 : _c.breakdown) === null || _d === void 0 ? void 0 : _d.categories) {
            const categories = planState.budget.breakdown.categories;
            const breakdown = {
                flight: 0,
                accommodation: 0,
                activities: 0,
                food: 0,
                other: 0,
            };
            categories.forEach((cat) => {
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
        if ((_e = planState.constraints) === null || _e === void 0 ? void 0 : _e.budget) {
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
    determinePaceFromPlanState(paceData) {
        var _a;
        if (!paceData)
            return 'moderate';
        if (paceData.fatigueScore) {
            const score = paceData.fatigueScore.average || paceData.fatigueScore.total || 0;
            if (score > 70)
                return 'intensive';
            if (score < 40)
                return 'relaxed';
            return 'moderate';
        }
        if (paceData.restPoints && Array.isArray(paceData.restPoints)) {
            const restDayRatio = paceData.restPoints.length / (((_a = paceData.timeWindows) === null || _a === void 0 ? void 0 : _a.length) || 7);
            if (restDayRatio > 0.2)
                return 'relaxed';
            if (restDayRatio < 0.1)
                return 'intensive';
            return 'moderate';
        }
        if (paceData.timeWindows && Array.isArray(paceData.timeWindows)) {
            const avgHours = paceData.timeWindows.reduce((sum, tw) => {
                return sum + (tw.availableHours || 8);
            }, 0) / paceData.timeWindows.length;
            if (avgHours > 10)
                return 'intensive';
            if (avgHours < 6)
                return 'relaxed';
            return 'moderate';
        }
        return 'moderate';
    }
    extractHighlights(planState) {
        var _a, _b, _c;
        const highlights = [];
        if (((_a = planState.metadata) === null || _a === void 0 ? void 0 : _a.highlights) && Array.isArray(planState.metadata.highlights)) {
            highlights.push(...planState.metadata.highlights);
        }
        if (((_b = planState.itinerary) === null || _b === void 0 ? void 0 : _b.anchors) && Array.isArray(planState.itinerary.anchors)) {
            const anchorHighlights = planState.itinerary.anchors
                .filter((a) => a.priority === 'anchor')
                .map((a) => `${a.location}: ${a.activity}`);
            highlights.push(...anchorHighlights);
        }
        if ((_c = planState.metadata) === null || _c === void 0 ? void 0 : _c.selectedSkeleton) {
        }
        return highlights.length > 0 ? highlights : ['精心规划的行程', '丰富的活动安排'];
    }
    extractWarnings(planState) {
        var _a, _b, _c, _d, _e;
        const warnings = [];
        if (planState.gate) {
            if (planState.gate.status === 'BLOCKED') {
                warnings.push(`方案被阻止: ${planState.gate.reason || '未知原因'}`);
            }
            if (planState.gate.status === 'NEEDS_CONFIRM') {
                warnings.push(`需要确认: ${((_a = planState.gate.confirmationPoints) === null || _a === void 0 ? void 0 : _a.join(', ')) || '某些事项'}`);
            }
        }
        if ((_b = planState.budget) === null || _b === void 0 ? void 0 : _b.overrun) {
            const overrun = planState.budget.overrun;
            if (overrun.overrunAmount && overrun.overrunAmount > 0) {
                warnings.push(`预算超支: ${overrun.overrunAmount || 0} ${((_d = (_c = planState.constraints) === null || _c === void 0 ? void 0 : _c.budget) === null || _d === void 0 ? void 0 : _d.currency) || 'USD'}`);
            }
        }
        if ((_e = planState.mobility) === null || _e === void 0 ? void 0 : _e.transferSegments) {
            planState.mobility.transferSegments.forEach((segment) => {
                if (segment.feasibility === 'needs_confirmation' || segment.feasibility === 'infeasible') {
                    warnings.push(`交通段需要确认: ${segment.from.city} → ${segment.to.city}`);
                }
                if (segment.riskFlags && segment.riskFlags.length > 0) {
                    segment.riskFlags.forEach((flag) => {
                        if (flag.severity === 'high') {
                            warnings.push(`高风险: ${flag.description}`);
                        }
                    });
                }
            });
        }
        return warnings;
    }
    generatePlanNameAndDescription(planState, destination, duration) {
        const pace = this.determinePaceFromPlanState(planState.pace);
        const paceName = pace === 'relaxed' ? 'Relaxed' : pace === 'intensive' ? 'Intensive' : 'Balanced';
        const paceNameCN = pace === 'relaxed' ? '轻松' : pace === 'intensive' ? '紧凑' : '均衡';
        const name = `${destination} ${duration}-Day ${paceName} Plan`;
        const nameCN = `${destination} ${duration}天${paceNameCN}方案`;
        const description = `A ${duration}-day ${pace} travel plan to ${destination}, carefully crafted to balance activities and rest.`;
        const descriptionCN = `一个精心规划的${duration}天${paceNameCN}旅行方案，目的地为${destination}，平衡了活动安排和休息时间。`;
        return { name, nameCN, description, descriptionCN };
    }
    calculateSuitability(planState) {
        var _a, _b, _c, _d, _e;
        let score = 100;
        const reasons = [];
        if (planState.gate) {
            if (planState.gate.status === 'BLOCKED') {
                score -= 50;
                reasons.push('方案存在阻塞问题');
            }
            else if (planState.gate.status === 'NEEDS_CONFIRM') {
                score -= 20;
                reasons.push('需要用户确认');
            }
            else if (planState.gate.status === 'PASSED') {
                reasons.push('方案已通过门控检查');
            }
        }
        if (((_b = (_a = planState.budget) === null || _a === void 0 ? void 0 : _a.overrun) === null || _b === void 0 ? void 0 : _b.overrunAmount) && planState.budget.overrun.overrunAmount > 0) {
            const totalBudget = ((_d = (_c = planState.constraints) === null || _c === void 0 ? void 0 : _c.budget) === null || _d === void 0 ? void 0 : _d.total) || 1;
            const overrunRatio = planState.budget.overrun.overrunAmount / totalBudget;
            if (overrunRatio > 0.2) {
                score -= 30;
                reasons.push('预算严重超支');
            }
            else if (overrunRatio > 0.1) {
                score -= 15;
                reasons.push('预算略有超支');
            }
        }
        if ((_e = planState.pace) === null || _e === void 0 ? void 0 : _e.fatigueScore) {
            const fatigueScore = planState.pace.fatigueScore.paceScore || 0;
            if (fatigueScore > 80) {
                score -= 20;
                reasons.push('行程节奏较紧张');
            }
            else if (fatigueScore < 30) {
                reasons.push('行程节奏轻松');
            }
        }
        score = Math.max(0, Math.min(100, score));
        if (reasons.length === 0) {
            reasons.push('方案质量良好');
        }
        return { score, reasons };
    }
    determinePace(paceData) {
        return this.determinePaceFromPlanState(paceData);
    }
    convertPersonasToEvaluation(personas) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!personas)
            return undefined;
        return {
            adventurer: {
                score: ((_a = personas.adventurer) === null || _a === void 0 ? void 0 : _a.score) || 0,
                comment: ((_b = personas.adventurer) === null || _b === void 0 ? void 0 : _b.comment) || '',
                commentCN: ((_c = personas.adventurer) === null || _c === void 0 ? void 0 : _c.commentCN) || '',
            },
            planner: {
                score: ((_d = personas.planner) === null || _d === void 0 ? void 0 : _d.score) || 0,
                comment: ((_e = personas.planner) === null || _e === void 0 ? void 0 : _e.comment) || '',
                commentCN: ((_f = personas.planner) === null || _f === void 0 ? void 0 : _f.commentCN) || '',
            },
            relaxer: {
                score: ((_g = personas.relaxer) === null || _g === void 0 ? void 0 : _g.score) || 0,
                comment: ((_h = personas.relaxer) === null || _h === void 0 ? void 0 : _h.comment) || '',
                commentCN: ((_j = personas.relaxer) === null || _j === void 0 ? void 0 : _j.commentCN) || '',
            },
        };
    }
    generateRecommendationsCacheKey(params) {
        var _a, _b, _c, _d, _e;
        const parts = [
            'recommendations',
            ((_a = params.filters) === null || _a === void 0 ? void 0 : _a.countryCode) || 'all',
            ((_c = (_b = params.preferences) === null || _b === void 0 ? void 0 : _b.budget) === null || _c === void 0 ? void 0 : _c.total) || '0',
            ((_e = (_d = params.preferences) === null || _d === void 0 ? void 0 : _d.travelers) === null || _e === void 0 ? void 0 : _e.adults) || '0',
            params.limit || '10',
        ];
        if (params.naturalLanguageDescription) {
            const hash = (0, crypto_2.createHash)('md5')
                .update(params.naturalLanguageDescription)
                .digest('hex')
                .substring(0, 8);
            parts.push(hash);
        }
        return parts.join(':');
    }
    async executeGeneratePlanAsync(taskId, dto) {
        var _a;
        if (!this.taskService) {
            this.logger.error('TaskService不可用，无法执行异步任务');
            return;
        }
        try {
            await this.taskService.markProcessing(taskId, '正在生成方案...');
            await this.taskService.updateProgress(taskId, 10, '正在分析需求...');
            const result = await this.generatePlan({
                ...dto,
                options: dto.options ? { ...dto.options } : undefined,
            });
            await this.taskService.updateProgress(taskId, 90, '正在完成方案...');
            await this.taskService.markCompleted(taskId, {
                plans: result.plans || [],
                sessionId: result.sessionId,
                generatedAt: result.generatedAt,
                traceId: result.traceId,
            });
            this.logger.debug(`异步方案生成完成: taskId=${taskId}, plansCount=${((_a = result.plans) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        }
        catch (error) {
            this.logger.error(`异步方案生成失败: taskId=${taskId}`, error.stack || error);
            const errorMessage = error instanceof Error
                ? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
                : String(error);
            await this.taskService.markFailed(taskId, errorMessage).catch((markError) => {
                this.logger.error(`标记任务失败状态时出错: taskId=${taskId}`, markError);
            });
        }
    }
    getDefaultStartDate() {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return date.toISOString().split('T')[0];
    }
    getDefaultEndDate(durationDays) {
        const startDate = new Date(this.getDefaultStartDate());
        startDate.setDate(startDate.getDate() + durationDays);
        return startDate.toISOString().split('T')[0];
    }
    createOptimizedPlanFromOriginal(originalPlan, dto) {
        const optimizedPlan = {
            id: `${originalPlan.id}_optimized_${Date.now()}`,
            name: `${originalPlan.name} (Optimized)`,
            nameCN: `${originalPlan.nameCN} (已优化)`,
            description: originalPlan.description,
            descriptionCN: originalPlan.descriptionCN,
            destination: originalPlan.destination,
            duration: originalPlan.duration,
            estimatedBudget: {
                ...originalPlan.estimatedBudget,
                currency: originalPlan.estimatedBudget.currency || 'CNY',
            },
            pace: originalPlan.pace,
            suitability: { ...originalPlan.suitability },
            highlights: [...(originalPlan.highlights || [])],
            warnings: originalPlan.warnings,
            personas: originalPlan.personas,
        };
        if (dto.requirements) {
            if (dto.requirements.slowerPace) {
                if (optimizedPlan.pace === 'intensive') {
                    optimizedPlan.pace = 'moderate';
                }
                else if (optimizedPlan.pace === 'moderate') {
                    optimizedPlan.pace = 'relaxed';
                }
            }
            if (dto.requirements.reduceBudget !== undefined) {
                optimizedPlan.estimatedBudget.total = Math.max(0, optimizedPlan.estimatedBudget.total - dto.requirements.reduceBudget);
                const reductionRatio = optimizedPlan.estimatedBudget.total / originalPlan.estimatedBudget.total;
                if (optimizedPlan.estimatedBudget.breakdown) {
                    const categories = ['flight', 'accommodation', 'activities', 'food', 'other'];
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
                optimizedPlan.highlights = (optimizedPlan.highlights || []).filter(h => !dto.requirements.removeActivities.includes(h));
            }
        }
        optimizedPlan.description = `Optimized version of ${originalPlan.name}. ${dto.optimizationType ? `Optimized for ${dto.optimizationType}.` : ''}`;
        optimizedPlan.descriptionCN = `${originalPlan.nameCN}的优化版本。${dto.optimizationType ? `针对${dto.optimizationType}进行了优化。` : ''}`;
        return optimizedPlan;
    }
    mapOptimizationTypeToChangeIntentType(optimizationType) {
        switch (optimizationType) {
            case 'pace':
            case 'route':
                return 'schedule';
            case 'budget':
                return 'accommodation';
            case 'activities':
                return 'activity';
            default:
                return 'schedule';
        }
    }
    convertPlanCandidateToDto(plan) {
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
                currency: plan.estimatedBudget.currency || 'CNY',
            },
            pace: plan.pace,
            suitability: plan.suitability,
            warnings: plan.warnings,
            personas: plan.personas,
        };
    }
    async updateSessionState(sessionId, updates) {
        try {
            const state = await this.planningAssistantService.getSessionState(sessionId);
            if (!state) {
                this.logger.warn(`会话不存在，无法更新: sessionId=${sessionId}`);
                return;
            }
            const updatedState = {
                ...state,
                ...updates,
                updatedAt: new Date().toISOString(),
            };
            await this.planningAssistantService.saveSession(updatedState);
            if (this.cacheService) {
                await this.cacheService.delete(`session:${sessionId}`).catch(() => { });
            }
            this.logger.debug(`会话状态已更新: sessionId=${sessionId}, updates=${Object.keys(updates).join(',')}`);
        }
        catch (error) {
            this.logger.warn(`更新会话状态失败: sessionId=${sessionId}, error=${error.message}`);
        }
    }
    convertPlanCandidatesDtoToPlanCandidates(plans) {
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
    recordPerformanceMetric(methodName, duration) {
        const metric = this.performanceMetrics.get(methodName) || { count: 0, totalTime: 0, avgTime: 0 };
        metric.count++;
        metric.totalTime += duration;
        metric.avgTime = metric.totalTime / metric.count;
        this.performanceMetrics.set(methodName, metric);
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
    getPerformanceMetrics() {
        const result = {};
        this.performanceMetrics.forEach((value, key) => {
            result[key] = { ...value };
        });
        return result;
    }
    resetPerformanceMetrics() {
        this.performanceMetrics.clear();
    }
    formatToolResult(tool, toolResult, dto, routingResult, isChinese) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const toolName = tool.toolName;
        let parsedResult = toolResult;
        if ((toolResult === null || toolResult === void 0 ? void 0 : toolResult.content) && Array.isArray(toolResult.content) && toolResult.content.length > 0) {
            const content = toolResult.content[0];
            if (content.type === 'text') {
                try {
                    parsedResult = JSON.parse(content.text);
                }
                catch {
                    parsedResult = { raw: content.text };
                }
            }
        }
        if (toolName === 'airbnb.listingDetails') {
            const listing = (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.listing) || (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.data) || parsedResult;
            const listingName = ((_c = (_b = (_a = listing === null || listing === void 0 ? void 0 : listing.demandStayListing) === null || _a === void 0 ? void 0 : _a.description) === null || _b === void 0 ? void 0 : _b.name) === null || _c === void 0 ? void 0 : _c.localizedStringWithTranslationPreference)
                || (listing === null || listing === void 0 ? void 0 : listing.name)
                || '未知房源';
            const messageCN = listing
                ? `我为您找到了房源详情：${listingName}`
                : '未找到房源详情';
            this.updateSessionAfterBusinessCall(dto.sessionId, {
                message: dto.message,
                response: messageCN,
                phase: 'RECOMMENDING',
            }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));
            return {
                message: listing ? `Found listing details: ${listingName}` : 'Listing details not found',
                messageCN,
                reply: isChinese ? messageCN : `Found listing details`,
                replyCN: messageCN,
                phase: 'RECOMMENDING',
                sessionId: dto.sessionId,
                airbnbListings: listing ? [listing] : [],
                routing: {
                    target: routingResult.target,
                    reason: ((_d = routingResult.toolSelection) === null || _d === void 0 ? void 0 : _d.reason) || 'Routed to Airbnb listing details',
                    params: {
                        ...routingResult.extractedParams,
                        toolName: toolName,
                    },
                },
            };
        }
        else if (toolName === 'weather.getWeatherByDatetimeRange') {
            const forecast = (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.forecast) || (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.data) || parsedResult;
            const location = (forecast === null || forecast === void 0 ? void 0 : forecast.city) || ((_e = routingResult.extractedParams) === null || _e === void 0 ? void 0 : _e.destination) || '该位置';
            const messageCN = forecast
                ? `我为您找到了${location}的天气预报信息`
                : '未找到天气预报信息';
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
                    reason: ((_f = routingResult.toolSelection) === null || _f === void 0 ? void 0 : _f.reason) || 'Routed to weather forecast',
                    params: {
                        ...routingResult.extractedParams,
                        toolName: toolName,
                    },
                },
            };
        }
        else if (toolName === 'exa.webSearch') {
            const results = (toolResult === null || toolResult === void 0 ? void 0 : toolResult.results) || (toolResult === null || toolResult === void 0 ? void 0 : toolResult.data) || toolResult || [];
            const messageCN = `我为您找到了${results.length}条搜索结果`;
            this.updateSessionAfterBusinessCall(dto.sessionId, {
                message: dto.message,
                response: messageCN,
                phase: 'RECOMMENDING',
            }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));
            return {
                message: `Found ${results.length} search result${results.length !== 1 ? 's' : ''}`,
                messageCN,
                reply: isChinese ? messageCN : `Found ${results.length} results`,
                replyCN: messageCN,
                phase: 'RECOMMENDING',
                sessionId: dto.sessionId,
                searchResults: results,
                routing: {
                    target: routingResult.target,
                    reason: ((_g = routingResult.toolSelection) === null || _g === void 0 ? void 0 : _g.reason) || 'Routed to web search',
                    params: {
                        ...routingResult.extractedParams,
                        toolName: toolName,
                    },
                },
            };
        }
        else if (toolName.startsWith('google-calendar.')) {
            const calendarResult = (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.event) || (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.events) || (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.data) || parsedResult;
            let messageCN = '';
            if (toolName === 'google-calendar.createEvent' || toolName === 'google-calendar.quickAdd') {
                messageCN = calendarResult
                    ? `已成功创建日历事件：${calendarResult.summary || '事件'}`
                    : '创建日历事件失败';
            }
            else if (toolName === 'google-calendar.findFreeSlots') {
                const slots = (calendarResult === null || calendarResult === void 0 ? void 0 : calendarResult.freeSlots) || calendarResult || [];
                messageCN = `找到了${slots.length}个空闲时间段`;
            }
            else if (toolName === 'google-calendar.listEvents') {
                const events = Array.isArray(calendarResult) ? calendarResult : ((calendarResult === null || calendarResult === void 0 ? void 0 : calendarResult.events) || []);
                messageCN = `找到了${events.length}个日历事件`;
            }
            else {
                messageCN = '日历操作完成';
            }
            this.updateSessionAfterBusinessCall(dto.sessionId, {
                message: dto.message,
                response: messageCN,
                phase: 'RECOMMENDING',
            }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));
            const response = {
                message: messageCN || 'Calendar operation completed',
                messageCN,
                reply: isChinese ? messageCN : 'Calendar operation completed',
                replyCN: messageCN,
                phase: 'RECOMMENDING',
                sessionId: dto.sessionId,
                routing: {
                    target: routingResult.target,
                    reason: ((_h = routingResult.toolSelection) === null || _h === void 0 ? void 0 : _h.reason) || `Executed calendar tool: ${toolName}`,
                    params: {
                        ...routingResult.extractedParams,
                        toolName: toolName,
                    },
                },
            };
        }
        else if (toolName === 'exa.webSearchAdvanced' || toolName === 'exa.deepSearch') {
            const results = (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.results) || (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.data) || parsedResult || [];
            const messageCN = `我为您找到了${results.length}条搜索结果`;
            this.updateSessionAfterBusinessCall(dto.sessionId, {
                message: dto.message,
                response: messageCN,
                phase: 'RECOMMENDING',
            }).catch(err => this.logger.warn(`更新会话状态失败: ${err.message}`));
            return {
                message: `Found ${results.length} search result${results.length !== 1 ? 's' : ''}`,
                messageCN,
                reply: isChinese ? messageCN : `Found ${results.length} results`,
                replyCN: messageCN,
                phase: 'RECOMMENDING',
                sessionId: dto.sessionId,
                searchResults: results,
                routing: {
                    target: routingResult.target,
                    reason: ((_j = routingResult.toolSelection) === null || _j === void 0 ? void 0 : _j.reason) || 'Routed to advanced search',
                    params: {
                        ...routingResult.extractedParams,
                        toolName: toolName,
                    },
                },
            };
        }
        else if (toolName === 'exa.crawlUrl') {
            const content = (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.content) || (parsedResult === null || parsedResult === void 0 ? void 0 : parsedResult.data) || parsedResult;
            const messageCN = content ? '网页内容已成功爬取' : '网页爬取失败';
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
                    reason: ((_k = routingResult.toolSelection) === null || _k === void 0 ? void 0 : _k.reason) || 'Routed to web crawl',
                    params: {
                        ...routingResult.extractedParams,
                        toolName: toolName,
                    },
                },
            };
        }
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
                reason: ((_l = routingResult.toolSelection) === null || _l === void 0 ? void 0 : _l.reason) || `Executed tool: ${toolName}`,
                params: {
                    ...routingResult.extractedParams,
                    toolName: toolName,
                },
            },
        };
    }
};
exports.PlanningAssistantV2Service = PlanningAssistantV2Service;
exports.PlanningAssistantV2Service = PlanningAssistantV2Service = PlanningAssistantV2Service_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(config_1.ConfigService)),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __param(10, (0, common_1.Optional)()),
    __param(11, (0, common_1.Optional)()),
    __param(12, (0, common_1.Optional)()),
    __param(13, (0, common_1.Optional)()),
    __param(14, (0, common_1.Optional)()),
    __param(15, (0, common_1.Optional)()),
    __param(16, (0, common_1.Optional)()),
    __param(17, (0, common_1.Optional)()),
    __param(18, (0, common_1.Optional)()),
    __param(19, (0, common_1.Optional)()),
    __param(20, (0, common_1.Optional)()),
    __param(21, (0, common_1.Optional)()),
    __param(22, (0, common_1.Optional)()),
    __param(23, (0, common_1.Optional)()),
    __param(24, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [planning_assistant_service_1.PlanningAssistantService,
        config_1.ConfigService,
        core_gateway_service_1.CoreGatewayService,
        recommendation_engine_service_1.RecommendationEngineService,
        preference_learning_service_1.PreferenceLearningService,
        persona_language_service_1.PersonaLanguageService,
        llm_service_1.LlmService,
        smart_router_service_1.SmartRouterService,
        mcp_tool_dispatcher_service_1.McpToolDispatcherService,
        task_service_1.TaskService,
        cache_service_1.CacheService,
        prisma_service_1.PrismaService, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object])
], PlanningAssistantV2Service);
//# sourceMappingURL=planning-assistant-v2.service.js.map