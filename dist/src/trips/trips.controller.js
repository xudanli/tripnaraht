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
var TripsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const swagger_1 = require("@nestjs/swagger");
const luxon_1 = require("luxon");
const trips_service_1 = require("./trips.service");
const trip_extended_service_1 = require("./services/trip-extended.service");
const trip_recap_service_1 = require("./services/trip-recap.service");
const trip_emergency_service_1 = require("./services/trip-emergency.service");
const trip_budget_service_1 = require("./services/trip-budget.service");
const trip_adjustment_service_1 = require("./services/trip-adjustment.service");
const llm_service_1 = require("../llm/services/llm.service");
const llm_response_transformer_service_1 = require("../llm/services/llm-response-transformer.service");
const create_trip_dto_1 = require("./dto/create-trip.dto");
const create_trip_from_nl_dto_1 = require("./dto/create-trip-from-nl.dto");
const select_gate_alternative_dto_1 = require("./dto/select-gate-alternative.dto");
const nl_conversation_context_dto_1 = require("./dto/nl-conversation-context.dto");
const schedule_dto_1 = require("./dto/schedule.dto");
const trip_share_dto_1 = require("./dto/trip-share.dto");
const trip_collaborator_dto_1 = require("./dto/trip-collaborator.dto");
const delete_trip_dto_1 = require("./dto/delete-trip.dto");
const tasks_dto_1 = require("./dto/tasks.dto");
const trip_draft_dto_1 = require("./dto/trip-draft.dto");
const trip_draft_service_1 = require("./services/trip-draft.service");
const evidence_dto_1 = require("./dto/evidence.dto");
const attention_queue_dto_1 = require("./dto/attention-queue.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const trip_conflicts_dto_1 = require("./dto/trip-conflicts.dto");
const trip_intent_dto_1 = require("./dto/trip-intent.dto");
const trip_optimization_dto_1 = require("./dto/trip-optimization.dto");
const trip_items_dto_1 = require("./dto/trip-items.dto");
const update_trip_dto_1 = require("./dto/update-trip.dto");
const trip_metrics_service_1 = require("./services/trip-metrics.service");
const trip_conflicts_service_1 = require("./services/trip-conflicts.service");
const trip_intent_service_1 = require("./services/trip-intent.service");
const trip_optimization_service_1 = require("./services/trip-optimization.service");
const hotel_recommendation_service_1 = require("../places/services/hotel-recommendation.service");
const trip_suggestions_service_1 = require("./services/trip-suggestions.service");
const trip_insight_service_1 = require("./services/trip-insight.service");
const suggestions_dto_1 = require("./dto/suggestions.dto");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const token_service_1 = require("../auth/services/token.service");
const jwt_1 = require("@nestjs/jwt");
const common_2 = require("@nestjs/common");
const context_engineer_service_1 = require("../agent/context-engine/services/context-engineer.service");
const skills_registry_service_1 = require("../skills/services/skills-registry.service");
const skills_registry_token_1 = require("../skills/services/skills-registry.token");
const common_3 = require("@nestjs/common");
const decision_draft_generator_service_1 = require("../decision-draft/services/decision-draft-generator.service");
const decision_draft_storage_service_1 = require("../decision-draft/storage/decision-draft-storage.service");
const destination_clarification_config_service_1 = require("./nl-clarification/services/destination-clarification-config.service");
const gate_precheck_service_1 = require("./nl-clarification/services/gate-precheck.service");
const ai_decision_logic_service_1 = require("./nl-clarification/services/ai-decision-logic.service");
const nl_conversation_context_service_1 = require("./services/nl-conversation-context.service");
let TripsController = TripsController_1 = class TripsController {
    normalizeQuestionTextForComparison(text) {
        return text
            .replace(/[，。！？；：、,\.!?;:]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
    constructor(tripsService, tripExtendedService, tripRecapService, tripEmergencyService, tripBudgetService, tripAdjustmentService, tripDraftService, llmService, llmResponseTransformer, tripMetricsService, tripConflictsService, tripIntentService, tripOptimizationService, tripSuggestionsService, tripInsightService, nlConversationContextService, prisma, tokenService, jwtService, hotelRecommendationService, contextEngineerService, skillsRegistry, decisionDraftGenerator, decisionDraftStorage, destinationClarificationConfigService, gatePrecheckService, aiDecisionLogicService) {
        this.tripsService = tripsService;
        this.tripExtendedService = tripExtendedService;
        this.tripRecapService = tripRecapService;
        this.tripEmergencyService = tripEmergencyService;
        this.tripBudgetService = tripBudgetService;
        this.tripAdjustmentService = tripAdjustmentService;
        this.tripDraftService = tripDraftService;
        this.llmService = llmService;
        this.llmResponseTransformer = llmResponseTransformer;
        this.tripMetricsService = tripMetricsService;
        this.tripConflictsService = tripConflictsService;
        this.tripIntentService = tripIntentService;
        this.tripOptimizationService = tripOptimizationService;
        this.tripSuggestionsService = tripSuggestionsService;
        this.tripInsightService = tripInsightService;
        this.nlConversationContextService = nlConversationContextService;
        this.prisma = prisma;
        this.tokenService = tokenService;
        this.jwtService = jwtService;
        this.hotelRecommendationService = hotelRecommendationService;
        this.contextEngineerService = contextEngineerService;
        this.skillsRegistry = skillsRegistry;
        this.decisionDraftGenerator = decisionDraftGenerator;
        this.decisionDraftStorage = decisionDraftStorage;
        this.destinationClarificationConfigService = destinationClarificationConfigService;
        this.gatePrecheckService = gatePrecheckService;
        this.aiDecisionLogicService = aiDecisionLogicService;
        this.logger = new common_1.Logger(TripsController_1.name);
    }
    async create(body, user, req) {
        var _a;
        try {
            let userId = user === null || user === void 0 ? void 0 : user.userId;
            if (!userId && ((_a = req === null || req === void 0 ? void 0 : req.headers) === null || _a === void 0 ? void 0 : _a.authorization)) {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    try {
                        const payload = await this.jwtService.verifyAsync(token);
                        userId = payload.sub;
                        this.logger.debug(`Successfully extracted userId from token: ${userId}`);
                    }
                    catch (error) {
                        this.logger.debug(`Failed to verify token: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
                    }
                }
            }
            if (!userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
            }
            if ('draft' in body) {
                const trip = await this.tripsService.createFromDraft(body, userId);
                return (0, standard_response_dto_1.successResponse)(trip);
            }
            else {
                const trip = await this.tripsService.create(body, userId);
                return (0, standard_response_dto_1.successResponse)(trip);
            }
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async createFromNaturalLanguage(dto, user) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        try {
            let userId = user === null || user === void 0 ? void 0 : user.userId;
            if (!userId) {
                if (process.env.NODE_ENV === 'development' || process.env.ALLOW_TEST_MODE === 'true') {
                    userId = dto.sessionId ? `temp_${dto.sessionId.split('_').pop()}` : `temp_${Date.now()}`;
                    this.logger.warn(`[测试模式] 使用临时 userId: ${userId}`);
                }
                else {
                    return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
                }
            }
            let shouldClearOldSessions = false;
            if (dto.isNewConversation) {
                shouldClearOldSessions = true;
                this.logger.debug(`显式标记为新对话，将清空旧会话`);
            }
            else if (!dto.sessionId) {
                shouldClearOldSessions = true;
                this.logger.debug(`sessionId 为空，自动判断为创建新对话，将清空旧会话`);
            }
            else {
                const sessionExists = await this.nlConversationContextService.sessionExists(dto.sessionId, userId);
                if (!sessionExists) {
                    shouldClearOldSessions = true;
                    this.logger.debug(`会话 ${dto.sessionId} 不存在，自动判断为创建新对话，将清空旧会话`);
                }
                else {
                    this.logger.debug(`会话 ${dto.sessionId} 存在，继续对话`);
                }
            }
            if (shouldClearOldSessions) {
                this.logger.debug(`开始新对话，清空用户 ${userId} 的所有旧会话上下文`);
                try {
                    const deletedCount = await this.nlConversationContextService.deleteAllUserSessions(userId);
                    this.logger.debug(`已删除 ${deletedCount} 个旧会话`);
                    if (!(user === null || user === void 0 ? void 0 : user.userId) && dto.sessionId) {
                        await this.nlConversationContextService.deleteSession(dto.sessionId, dto.sessionId);
                    }
                }
                catch (error) {
                    this.logger.warn(`删除旧会话失败（继续创建新会话）: ${error.message}`);
                }
                dto.sessionId = undefined;
                this.logger.debug(`开始新对话，已清空所有旧上下文`);
            }
            const sessionId = await this.nlConversationContextService.getOrCreateSession(dto.sessionId, userId);
            const existingContext = await this.nlConversationContextService.getContext(sessionId, userId);
            const conversationHistory = (existingContext && existingContext.messages && existingContext.messages.length > 0)
                ? existingContext.messages
                : [];
            await this.nlConversationContextService.addMessage(sessionId, userId, 'user', dto.text);
            let promptText = dto.text;
            if (conversationHistory.length > 0) {
                const userMessages = conversationHistory.filter(msg => msg.role === 'user' || msg.role === 'assistant');
                if (userMessages.length > 0) {
                    const historyContext = userMessages
                        .slice(-6)
                        .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
                        .join('\n');
                    promptText = `历史对话上下文：\n${historyContext}\n\n当前用户输入：${dto.text}`;
                }
            }
            let contextBlocks = [];
            let detectedCountryCode;
            if ((_a = existingContext === null || existingContext === void 0 ? void 0 : existingContext.partialParams) === null || _a === void 0 ? void 0 : _a.destination) {
                detectedCountryCode = this.extractCountryCode(existingContext.partialParams.destination);
            }
            if (!detectedCountryCode) {
                detectedCountryCode = this.extractCountryCodeFromText(dto.text);
            }
            if (detectedCountryCode && this.contextEngineerService && this.skillsRegistry) {
                try {
                    this.logger.debug(`检测到目的地国家代码: ${detectedCountryCode}，开始构建 Context Package`);
                    const countryPackSkill = this.skillsRegistry.getSkill('countryPack.getBlocks');
                    if (countryPackSkill) {
                        const countryPackResult = await countryPackSkill.execute({
                            packId: detectedCountryCode,
                            topics: ['VISA', 'ROAD_RULES', 'SAFETY', 'WEATHER_WINDOWS'],
                            phase: 'planning',
                        });
                        if (countryPackResult.blocks && countryPackResult.blocks.length > 0) {
                            contextBlocks = countryPackResult.blocks;
                            this.logger.debug(`成功构建 Context Package，包含 ${contextBlocks.length} 个块`);
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`构建 Context Package 失败: ${error.message}`, error.stack);
                }
            }
            const historicalQuestions = [];
            if (existingContext === null || existingContext === void 0 ? void 0 : existingContext.messages) {
                for (const msg of existingContext.messages) {
                    if (msg.role === 'assistant' && ((_b = msg.metadata) === null || _b === void 0 ? void 0 : _b.clarificationQuestions)) {
                        const questions = msg.metadata.clarificationQuestions;
                        questions.forEach((q) => {
                            if (q.question || q.text) {
                                historicalQuestions.push((q.question || q.text).trim());
                            }
                        });
                    }
                }
            }
            this.logger.debug(`Found ${historicalQuestions.length} historical clarification questions`);
            let destinationConfig = null;
            if (detectedCountryCode && this.destinationClarificationConfigService) {
                destinationConfig = await this.destinationClarificationConfigService.getConfig(detectedCountryCode);
            }
            if (destinationConfig && destinationConfig.enabled && detectedCountryCode) {
                return await this.handleDestinationSpecificClarification(dto, userId, sessionId, existingContext, destinationConfig, detectedCountryCode, contextBlocks, promptText);
            }
            const parseResult = await this.llmService.naturalLanguageToTripParams({
                text: promptText,
                provider: dto.llmProvider,
                contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
                destinationCode: detectedCountryCode,
                destinationConfig: destinationConfig,
            });
            this.logger.debug(`Parse result needsClarification: ${parseResult.needsClarification}`);
            if (parseResult.needsClarification) {
                let structuredResponse;
                try {
                    structuredResponse = await this.llmResponseTransformer.transformToStructuredResponse(parseResult.llmRawOutput || {}, parseResult.plannerReply);
                    if (structuredResponse.clarificationQuestions && historicalQuestions.length > 0) {
                        const originalCount = structuredResponse.clarificationQuestions.length;
                        structuredResponse.clarificationQuestions = structuredResponse.clarificationQuestions.filter((q) => {
                            const questionText = (q.question || q.text || '').trim();
                            if (!questionText)
                                return false;
                            const isDuplicate = historicalQuestions.some((historicalQ) => {
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
                    this.logger.debug(`Successfully transformed structured response: ${((_c = structuredResponse.plannerResponseBlocks) === null || _c === void 0 ? void 0 : _c.length) || 0} blocks, ${((_d = structuredResponse.clarificationQuestions) === null || _d === void 0 ? void 0 : _d.length) || 0} questions`);
                    if (structuredResponse.plannerResponseBlocks && structuredResponse.plannerResponseBlocks.length > 0) {
                        this.logger.debug(`Structured response contains ${structuredResponse.plannerResponseBlocks.length} blocks`);
                    }
                }
                catch (error) {
                    this.logger.warn(`Structured response transformation failed: ${error.message}`, error.stack);
                    this.logger.warn(`Falling back to text mode due to transformation failure`);
                    const fallbackQuestions = parseResult.clarificationQuestions && parseResult.clarificationQuestions.length > 0
                        ? parseResult.clarificationQuestions.map((q, i) => ({
                            id: `fallback_q_${i}_${Date.now()}`,
                            question: q,
                            type: 'text',
                            required: false,
                        }))
                        : this.generateDefaultClarificationQuestions('general', detectedCountryCode, parseResult.params);
                    structuredResponse = {
                        plannerReply: parseResult.plannerReply,
                        clarificationQuestions: fallbackQuestions,
                    };
                }
                const assistantReply = structuredResponse.plannerReply || parseResult.plannerReply || ((_e = parseResult.clarificationQuestions) === null || _e === void 0 ? void 0 : _e.join('\n')) || '需要更多信息';
                const savedContext = await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
                    needsClarification: true,
                    suggestedQuestions: parseResult.suggestedQuestions,
                    plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
                    clarificationQuestions: structuredResponse.clarificationQuestions,
                    parsedParams: parseResult.params,
                    showConfirmCard: false,
                    questionAnswers: {},
                });
                const lastMessage = savedContext.messages[savedContext.messages.length - 1];
                if (structuredResponse.clarificationQuestions) {
                    this.logger.debug(`Final clarification questions count: ${structuredResponse.clarificationQuestions.length} (after history filtering)`);
                }
                await this.nlConversationContextService.updateContext(sessionId, userId, {
                    conversationContext: parseResult.conversationContext,
                    partialParams: parseResult.params,
                });
                let destinationName = detectedCountryCode || parseResult.params.destination;
                if (detectedCountryCode) {
                    if (destinationConfig && destinationConfig.destinationName) {
                        destinationName = destinationConfig.destinationName;
                    }
                    else {
                        const countryNameMap = {
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
                let clarificationQuestions = structuredResponse.clarificationQuestions || [];
                if (clarificationQuestions.length === 0) {
                    clarificationQuestions = this.generateDefaultClarificationQuestions('general', detectedCountryCode, parseResult.params);
                    this.logger.warn(`needsClarification=true但clarificationQuestions为空，已生成默认问题: ${clarificationQuestions.length}个`);
                }
                clarificationQuestions = clarificationQuestions.map((q) => ({
                    ...q,
                    group: q.group || 'required',
                }));
                const hasBasicInfo = parseResult.params.destination || parseResult.params.startDate || parseResult.params.totalBudget;
                if (hasBasicInfo) {
                    const supplementaryQuestions = this.generateSupplementaryQuestions(parseResult.params, detectedCountryCode);
                    if (supplementaryQuestions.length > 0) {
                        const optionalQuestions = supplementaryQuestions.map((q) => ({
                            ...q,
                            group: 'optional',
                        }));
                        clarificationQuestions = [...clarificationQuestions, ...optionalQuestions];
                        this.logger.debug(`在澄清过程中添加了 ${optionalQuestions.length} 个补充问题（标记为optional分组）`);
                    }
                }
                this.logger.debug(`Returning planner-style clarification: ${((_f = structuredResponse.plannerReply) === null || _f === void 0 ? void 0 : _f.substring(0, 100)) || ((_g = parseResult.plannerReply) === null || _g === void 0 ? void 0 : _g.substring(0, 100))}...`);
                return (0, standard_response_dto_1.successResponse)({
                    sessionId,
                    needsClarification: true,
                    plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
                    clarificationQuestions,
                    plannerReply: structuredResponse.plannerReply || parseResult.plannerReply,
                    suggestedQuestions: parseResult.suggestedQuestions,
                    conversationContext: parseResult.conversationContext,
                    partialParams: parseResult.params,
                    destination: detectedCountryCode || parseResult.params.destination,
                    destinationName,
                    lastMessageId: lastMessage.id,
                });
            }
            this.logger.debug(`所有必需字段已齐全，但需要用户确认后才能创建行程`);
            let startDate = parseResult.params.startDate;
            let endDate = parseResult.params.endDate;
            if (startDate && startDate.includes('T')) {
                startDate = startDate.split('T')[0];
            }
            if (endDate && endDate.includes('T')) {
                endDate = endDate.split('T')[0];
            }
            let destinationName = detectedCountryCode || parseResult.params.destination;
            if (detectedCountryCode) {
                if (destinationConfig && destinationConfig.destinationName) {
                    destinationName = destinationConfig.destinationName;
                }
                else {
                    const countryNameMap = {
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
            const travelersArray = parseResult.params.travelers;
            const travelerCount = Array.isArray(travelersArray) ? travelersArray.length :
                (parseResult.params.hasChildren ? 3 : parseResult.params.hasElderly ? 2 : 2);
            const travelerTypes = [];
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
            let travelersInfo = travelerTypes.join('、');
            if (travelerTypes.length === 0) {
                travelersInfo = '2位成人';
            }
            const travelPurpose = this.detectTravelPurpose(parseResult.params, dto.text, existingContext);
            if (travelPurpose) {
                travelersInfo += `（${travelPurpose}）`;
            }
            const paramsAny = parseResult.params;
            const hasPreferences = ((_h = paramsAny.preferences) === null || _h === void 0 ? void 0 : _h.interests) ||
                ((_j = paramsAny.preferences) === null || _j === void 0 ? void 0 : _j.style) ||
                ((_k = paramsAny.preferences) === null || _k === void 0 ? void 0 : _k.pace) ||
                paramsAny.pace;
            const confirmationBlocks = [
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
                        travelers: travelersInfo,
                        budget: {
                            amount: parseResult.params.totalBudget || 0,
                            currency: 'CNY',
                        },
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
            const supplementaryQuestions = this.generateSupplementaryQuestions(parseResult.params, detectedCountryCode).map((q) => ({
                ...q,
                group: 'optional',
            }));
            const assistantReply = `我已经收集到创建行程所需的基本信息。请确认以下信息是否正确，或者告诉我是否需要补充其他信息。`;
            const savedContext = await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', assistantReply, {
                needsClarification: false,
                needsConfirmation: true,
                plannerResponseBlocks: confirmationBlocks,
                clarificationQuestions: supplementaryQuestions,
                parsedParams: parseResult.params,
                showConfirmCard: true,
                questionAnswers: {},
            });
            const lastMessage = savedContext.messages[savedContext.messages.length - 1];
            this.logger.debug(`返回确认卡片，等待用户确认创建行程`);
            return (0, standard_response_dto_1.successResponse)({
                sessionId,
                needsClarification: false,
                needsConfirmation: true,
                plannerResponseBlocks: confirmationBlocks,
                clarificationQuestions: supplementaryQuestions,
                plannerReply: assistantReply,
                conversationContext: parseResult.conversationContext,
                partialParams: parseResult.params,
                destination: detectedCountryCode || parseResult.params.destination,
                destinationName,
                lastMessageId: lastMessage.id,
                showConfirmCard: true,
            });
        }
        catch (error) {
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error';
            this.logger.error(`Failed to create trip from natural language: ${errorMessage}`, error === null || error === void 0 ? void 0 : error.stack);
            try {
                const errorHandling = await this.llmService.handleErrorAndClarify(error, `创建行程: ${dto.text}`);
                const message = (errorHandling === null || errorHandling === void 0 ? void 0 : errorHandling.message) || errorMessage || '处理您的请求时遇到了问题。请检查输入参数是否正确。';
                const details = {
                    clarificationQuestions: (errorHandling === null || errorHandling === void 0 ? void 0 : errorHandling.clarificationQuestions) || ['请提供更详细的行程信息'],
                    suggestedActions: (errorHandling === null || errorHandling === void 0 ? void 0 : errorHandling.suggestedActions) || ['重试', '联系客服'],
                    originalError: errorMessage,
                };
                this.logger.debug(`Error handling response: ${JSON.stringify({ message, details })}`);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, message, details);
            }
            catch (llmError) {
                this.logger.warn(`LLM error handling failed: ${(llmError === null || llmError === void 0 ? void 0 : llmError.message) || llmError}`);
                const defaultMessage = errorMessage || '处理您的请求时遇到了问题。请检查输入参数是否正确，或稍后重试。';
                const defaultDetails = {
                    originalError: errorMessage,
                    errorType: ((_l = error === null || error === void 0 ? void 0 : error.constructor) === null || _l === void 0 ? void 0 : _l.name) || 'Error',
                    clarificationQuestions: ['请提供更详细的行程信息（目的地、日期、预算等）'],
                    suggestedActions: ['重试', '使用标准创建行程接口'],
                };
                this.logger.debug(`Default error response: ${JSON.stringify({ message: defaultMessage, details: defaultDetails })}`);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, defaultMessage, defaultDetails);
            }
        }
    }
    async confirmCreateTrip(sessionId, body, user) {
        var _a, _b, _c;
        try {
            const userId = (user === null || user === void 0 ? void 0 : user.userId) || `temp_${sessionId}`;
            if (!body.confirm) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '用户未确认创建行程');
            }
            const context = await this.nlConversationContextService.getContext(sessionId, userId);
            if (!context) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, '会话不存在或已过期');
            }
            const params = {
                ...(context.partialParams || {}),
                ...(body.additionalParams || {}),
            };
            if (!params.destination || !params.startDate || !params.endDate || !params.totalBudget) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '缺少必需字段：destination、startDate、endDate、totalBudget');
            }
            const detectedCountryCode = ((_a = params.destination) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || null;
            const result = await this.createTripFromParams(params, userId, sessionId, detectedCountryCode);
            this.logger.log(`用户确认创建行程成功: sessionId=${sessionId}, tripId=${(_c = (_b = result.data) === null || _b === void 0 ? void 0 : _b.trip) === null || _c === void 0 ? void 0 : _c.id}`);
            return result;
        }
        catch (error) {
            this.logger.error(`确认创建行程失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `确认创建行程失败: ${error.message}`);
        }
    }
    async selectGateAlternative(dto, user) {
        var _a;
        try {
            const userId = user === null || user === void 0 ? void 0 : user.userId;
            if (!userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要登录才能选择替代方案');
            }
            const existingContext = await this.nlConversationContextService.getContext(dto.sessionId, userId);
            if (!existingContext) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, '会话不存在或已过期');
            }
            const actionParts = dto.action.split(':');
            if (actionParts.length !== 2) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, `无效的 action 格式: ${dto.action}`);
            }
            const [actionType, actionValue] = actionParts;
            if (actionType !== 'set_risk_tolerance' && !actionType.startsWith('set_')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, `不支持的 action 类型: ${actionType}`);
            }
            const fieldName = actionType.replace('set_', '').replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            const updatedParams = {
                ...(existingContext.partialParams || {}),
                [fieldName]: actionValue,
            };
            await this.nlConversationContextService.updateContext(dto.sessionId, userId, {
                partialParams: updatedParams,
            });
            const detectedCountryCode = ((_a = updatedParams.destination) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || null;
            if (!detectedCountryCode) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '无法检测目的地代码');
            }
            let destinationConfig = null;
            if (detectedCountryCode && this.destinationClarificationConfigService) {
                destinationConfig = await this.destinationClarificationConfigService.getConfig(detectedCountryCode);
            }
            if (destinationConfig && destinationConfig.enabled && detectedCountryCode) {
                const userInput = dto.userInput || `我已选择替代方案：${dto.action}`;
                const contextBlocks = [];
                return await this.handleDestinationSpecificClarification({
                    text: userInput,
                    sessionId: dto.sessionId,
                    llmProvider: undefined,
                }, userId, dto.sessionId, existingContext, destinationConfig, detectedCountryCode, contextBlocks, userInput);
            }
            else {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, '目的地未启用特化澄清配置，无法应用替代方案');
            }
        }
        catch (error) {
            this.logger.error(`选择 Gate 替代方案失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `选择替代方案失败: ${error.message}`);
        }
    }
    async handleDestinationSpecificClarification(dto, userId, sessionId, existingContext, config, destinationCode, contextBlocks, promptText) {
        var _a, _b, _c;
        try {
            const currentParams = (existingContext === null || existingContext === void 0 ? void 0 : existingContext.partialParams) || {};
            const parseResult = await this.llmService.naturalLanguageToTripParams({
                text: promptText,
                provider: dto.llmProvider,
                contextBlocks: contextBlocks.length > 0 ? contextBlocks : undefined,
                destinationCode,
                destinationConfig: config,
            });
            const mergedParams = {
                ...currentParams,
                ...parseResult.params,
            };
            if (!mergedParams.activityTypes) {
                let activityTypes = [];
                if ((_a = mergedParams.preferences) === null || _a === void 0 ? void 0 : _a.activityType) {
                    activityTypes = [mergedParams.preferences.activityType];
                }
                else if (((_b = mergedParams.preferences) === null || _b === void 0 ? void 0 : _b.activityTypes) && Array.isArray(mergedParams.preferences.activityTypes)) {
                    activityTypes = mergedParams.preferences.activityTypes;
                }
                if (activityTypes.length > 0) {
                    const activityTypeMap = {
                        '东格陵兰远征': 'east_greenland_expedition',
                        '冰川徒步': 'glacier_hiking',
                        '皮划艇': 'kayaking',
                        '船游': 'boat_tour',
                        '冰盖远征': 'ice_sheet_expedition',
                        '低风险户外活动': 'boat_tour',
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
            this.logger.debug(`合并后的参数: ${JSON.stringify(mergedParams, null, 2)}`);
            if (!this.destinationClarificationConfigService) {
                this.logger.warn('DestinationClarificationConfigService 未注入，降级到通用流程');
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '配置服务不可用');
            }
            let roundInfo = await this.destinationClarificationConfigService.getCurrentRoundQuestions(destinationCode, mergedParams, (existingContext === null || existingContext === void 0 ? void 0 : existingContext.messages) || []);
            this.logger.debug(`当前轮次信息: ${roundInfo ? `roundId=${roundInfo.round.roundId}, questions=${roundInfo.questions.length}` : 'null（所有轮次已完成）'}`);
            if (!roundInfo) {
                if (this.aiDecisionLogicService && ['SJ', 'GL', 'AL'].includes(destinationCode)) {
                    try {
                        const decisionResult = await this.aiDecisionLogicService.applyDecisionMatrix(destinationCode, mergedParams);
                        this.logger.debug(`决策矩阵结果: ${decisionResult.decision}, 原因: ${decisionResult.reason}`);
                        if (decisionResult.decision === 'NOT_RECOMMENDED' || decisionResult.decision === 'STRONGLY_RECONSIDER') {
                            const destinationName = (config === null || config === void 0 ? void 0 : config.destinationName) || '斯瓦尔巴';
                            const defaultQuestions = this.generateDefaultClarificationQuestions('decision_matrix_blocked', destinationCode, mergedParams);
                            return (0, standard_response_dto_1.successResponse)({
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
                    }
                    catch (error) {
                        this.logger.warn(`决策矩阵执行失败: ${error.message}`);
                    }
                }
                return await this.createTripFromParams(mergedParams, userId, sessionId, destinationCode);
            }
            if (roundInfo.questions.length === 0) {
                this.logger.warn(`当前轮次 ${roundInfo.round.roundId} 没有需要问的问题，可能所有问题都已问过或被过滤`);
                const round = roundInfo.round;
                const completionConditions = round.completionConditions;
                const allRequiredFieldsPresent = completionConditions.requiredFields.every(field => mergedParams[field] !== undefined && mergedParams[field] !== null && mergedParams[field] !== '');
                if (allRequiredFieldsPresent) {
                    const nextRoundInfo = await this.destinationClarificationConfigService.getCurrentRoundQuestions(destinationCode, mergedParams, (existingContext === null || existingContext === void 0 ? void 0 : existingContext.messages) || []);
                    if (!nextRoundInfo) {
                        this.logger.debug(`所有轮次已完成，尝试创建行程`);
                        return await this.createTripFromParams(mergedParams, userId, sessionId, destinationCode);
                    }
                    else {
                        this.logger.debug(`进入下一轮: ${nextRoundInfo.round.roundId}`);
                        roundInfo = nextRoundInfo;
                    }
                }
                else {
                    this.logger.debug(`当前轮次 ${roundInfo.round.roundId} 未完成（缺少字段: ${completionConditions.requiredFields.filter(f => !mergedParams[f]).join(', ')}），继续使用通用流程提取字段`);
                }
            }
            if (config.gatePrechecks && this.gatePrecheckService) {
                const gateResult = await this.gatePrecheckService.executePrechecks(config.gatePrechecks, mergedParams, destinationCode);
                if (gateResult.blocked) {
                    const alternativeActions = ((_c = gateResult.alternatives) === null || _c === void 0 ? void 0 : _c.map((alt, index) => ({
                        id: `gate_alternative_${gateResult.checkId}_${index}`,
                        label: alt.label,
                        description: alt.description,
                        action: alt.action || `set_alternative_${index}`,
                        type: 'button',
                    }))) || [];
                    this.logger.warn(`Gate 预检查阻止创建: checkId=${gateResult.checkId}, sessionId=${sessionId}, params=${JSON.stringify(mergedParams)}`);
                    let destinationName = destinationCode;
                    if (config && config.destinationName) {
                        destinationName = config.destinationName;
                    }
                    else {
                        const countryNameMap = {
                            'GL': '格陵兰',
                            'IS': '冰岛',
                            'SJ': '斯瓦尔巴',
                            'AR': '阿根廷',
                        };
                        destinationName = countryNameMap[destinationCode] || destinationCode;
                    }
                    let clarificationQuestions = gateResult.additionalQuestions || [];
                    if (clarificationQuestions.length === 0) {
                        clarificationQuestions = this.generateDefaultClarificationQuestions('gate_blocked', destinationCode, mergedParams);
                    }
                    return (0, standard_response_dto_1.successResponse)({
                        sessionId,
                        needsClarification: true,
                        blockedByGate: true,
                        gateCheckId: gateResult.checkId,
                        destination: destinationCode,
                        destinationName,
                        plannerResponseBlocks: [
                            {
                                type: 'highlight',
                                highlightType: 'warning',
                                highlightText: gateResult.warningMessage || '⚠️ 检测到潜在风险，请选择替代方案',
                            },
                            ...(alternativeActions.length > 0 ? [{
                                    type: 'action_buttons',
                                    buttons: alternativeActions,
                                }] : []),
                        ],
                        clarificationQuestions,
                        alternativeActions,
                    });
                }
            }
            let personaInfo = null;
            let safetyCheckResult = null;
            if (this.aiDecisionLogicService) {
                try {
                    personaInfo = await this.aiDecisionLogicService.identifyPersona(destinationCode, mergedParams);
                    if (personaInfo) {
                        this.logger.debug(`识别到用户画像: ${personaInfo.personaName} (${personaInfo.personaId}), 置信度: ${personaInfo.confidence.toFixed(2)}`);
                        const activityTypes = mergedParams.activityTypes || mergedParams.activityPreferences || [];
                        if (activityTypes.length > 0 || mergedParams.activityTypes) {
                            safetyCheckResult = await this.aiDecisionLogicService.applySafetyFirstPrinciple(destinationCode, personaInfo.personaId, activityTypes, mergedParams);
                            if (safetyCheckResult.shouldBlock) {
                                this.logger.warn(`安全第一原则阻止: ${safetyCheckResult.blockReason}`);
                                const defaultQuestions = this.generateDefaultClarificationQuestions('safety_principle_blocked', destinationCode, mergedParams);
                                return (0, standard_response_dto_1.successResponse)({
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
                                                buttons: safetyCheckResult.alternatives.map((alt, idx) => ({
                                                    id: `safety_alternative_${idx}`,
                                                    label: alt.label,
                                                    description: alt.description,
                                                    action: alt.action || `set_alternative_${idx}`,
                                                    type: 'button',
                                                })),
                                            }] : []),
                                    ],
                                    clarificationQuestions: defaultQuestions,
                                    destination: destinationCode,
                                    destinationName: (config === null || config === void 0 ? void 0 : config.destinationName) || destinationCode,
                                });
                            }
                            else if (safetyCheckResult.shouldWarn) {
                                this.logger.debug(`安全第一原则警告: ${safetyCheckResult.warningMessage}`);
                            }
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`AI 决策逻辑执行失败: ${error.message}`, error.stack);
                }
            }
            const structuredResponse = await this.generateStructuredClarificationResponseForRound(roundInfo.round, roundInfo.questions, mergedParams, parseResult.plannerReply, personaInfo, safetyCheckResult);
            const savedContext = await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', structuredResponse.plannerReply, {
                needsClarification: true,
                plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
                clarificationQuestions: structuredResponse.clarificationQuestions,
                parsedParams: mergedParams,
                showConfirmCard: false,
                questionAnswers: {},
                personaInfo: structuredResponse.personaInfo,
                recommendedRoutes: structuredResponse.recommendedRoutes,
            });
            const lastMessage = savedContext.messages[savedContext.messages.length - 1];
            await this.nlConversationContextService.updateContext(sessionId, userId, {
                conversationContext: parseResult.conversationContext,
                partialParams: mergedParams,
            });
            let destinationName = destinationCode;
            if (config && config.destinationName) {
                destinationName = config.destinationName;
            }
            else {
                const countryNameMap = {
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
            let clarificationQuestions = structuredResponse.clarificationQuestions || [];
            if (clarificationQuestions.length === 0) {
                clarificationQuestions = this.generateDefaultClarificationQuestions('general', destinationCode, mergedParams);
                this.logger.warn(`needsClarification=true但clarificationQuestions为空，已生成默认问题: ${clarificationQuestions.length}个`);
            }
            const response = {
                sessionId,
                needsClarification: true,
                plannerResponseBlocks: structuredResponse.plannerResponseBlocks,
                clarificationQuestions,
                plannerReply: structuredResponse.plannerReply,
                partialParams: mergedParams,
                destination: destinationCode,
                destinationName,
                personaInfo: structuredResponse.personaInfo,
                recommendedRoutes: structuredResponse.recommendedRoutes,
                lastMessageId: lastMessage.id,
            };
            this.logger.debug(`特化澄清流程返回响应: ${JSON.stringify(response, null, 2)}`);
            return (0, standard_response_dto_1.successResponse)(response);
        }
        catch (error) {
            this.logger.error(`特化澄清流程失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `特化澄清流程失败: ${error.message}`);
        }
    }
    async createTripFromParams(params, userId, sessionId, destinationCode) {
        var _a, _b;
        if (destinationCode && this.destinationClarificationConfigService) {
            const criticalFields = await this.destinationClarificationConfigService.getCriticalFields(destinationCode);
            if (criticalFields.length > 0) {
                const missingCriticalFields = criticalFields.filter(field => !params[field.fieldName] || params[field.fieldName] === null || params[field.fieldName] === undefined);
                if (missingCriticalFields.length > 0) {
                    const missingFieldNames = missingCriticalFields.map(f => f.fieldName);
                    const questions = await this.destinationClarificationConfigService.getQuestionsForFields(destinationCode, missingFieldNames);
                    const totalCritical = criticalFields.length;
                    const completedCritical = totalCritical - missingCriticalFields.length;
                    const progressPercent = Math.round((completedCritical / totalCritical) * 100);
                    this.logger.warn(`Critical 字段阻止创建行程: destination=${destinationCode}, missingFields=${missingFieldNames.join(',')}, sessionId=${sessionId}`);
                    let destinationName = destinationCode;
                    if (destinationCode && this.destinationClarificationConfigService) {
                        const destConfig = await this.destinationClarificationConfigService.getConfig(destinationCode);
                        if (destConfig && destConfig.destinationName) {
                            destinationName = destConfig.destinationName;
                        }
                        else {
                            const countryNameMap = {
                                'GL': '格陵兰',
                                'IS': '冰岛',
                                'SJ': '斯瓦尔巴',
                                'AR': '阿根廷',
                            };
                            destinationName = countryNameMap[destinationCode] || destinationCode;
                        }
                    }
                    return (0, standard_response_dto_1.successResponse)({
                        sessionId,
                        needsClarification: true,
                        blockedByCriticalFields: true,
                        destination: destinationCode,
                        destinationName,
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
        const travelers = [];
        if (params.hasChildren) {
            travelers.push({ type: 'CHILD', mobilityTag: create_trip_dto_1.MobilityTag.CITY_POTATO });
        }
        if (params.hasElderly) {
            travelers.push({ type: 'ELDERLY', mobilityTag: create_trip_dto_1.MobilityTag.ACTIVE_SENIOR });
        }
        if (travelers.length === 0 || !travelers.some(t => t.type === 'ADULT')) {
            travelers.push({ type: 'ADULT', mobilityTag: create_trip_dto_1.MobilityTag.CITY_POTATO });
        }
        let startDate = params.startDate;
        let endDate = params.endDate;
        if (startDate && startDate.includes('T')) {
            startDate = startDate.split('T')[0];
        }
        if (endDate && endDate.includes('T')) {
            endDate = endDate.split('T')[0];
        }
        const createTripDto = {
            destination: params.destination,
            startDate,
            endDate,
            totalBudget: params.totalBudget,
            travelers: travelers,
        };
        const trip = await this.tripsService.create(createTripDto, userId);
        try {
            await this.tripBudgetService.setBudgetConstraint(trip.id, {
                total: params.totalBudget,
                currency: 'CNY',
                dailyBudget: undefined,
            });
        }
        catch (error) {
            this.logger.warn(`设置预算约束失败: ${error.message}`);
        }
        await this.nlConversationContextService.addMessage(sessionId, userId, 'assistant', `行程已创建成功！目的地：${params.destination}，日期：${startDate} 至 ${endDate}，预算：${params.totalBudget}元`, {
            tripId: trip.id,
            success: true,
            parsedParams: params,
            showConfirmCard: false,
        });
        let tripDestinationName = params.destination;
        if (destinationCode) {
            if (this.destinationClarificationConfigService) {
                const destConfig = await this.destinationClarificationConfigService.getConfig(destinationCode);
                if (destConfig && destConfig.destinationName) {
                    tripDestinationName = destConfig.destinationName;
                }
                else {
                    const countryNameMap = {
                        'GL': '格陵兰',
                        'IS': '冰岛',
                        'SJ': '斯瓦尔巴',
                        'AR': '阿根廷',
                        'JP': '日本',
                        'CN': '中国',
                        'US': '美国',
                        'TH': '泰国',
                    };
                    tripDestinationName = countryNameMap[destinationCode] || destinationCode;
                }
            }
        }
        const start = luxon_1.DateTime.fromISO(startDate);
        const end = luxon_1.DateTime.fromISO(endDate);
        const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
        this.generateDraftAsync(trip.id, {
            destination: params.destination,
            days: durationDays,
            startDate: startDate,
            endDate: endDate,
            style: ((_a = params.preferences) === null || _a === void 0 ? void 0 : _a.style) || 'balanced',
            intensity: ((_b = params.preferences) === null || _b === void 0 ? void 0 : _b.intensity) || 'balanced',
        }).catch((error) => {
            this.logger.error(`后台生成行程规划点失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
        });
        this.generateDecisionDraftAsync(trip.id, params.userInput || `创建${params.destination}行程`, params, {
            destination: params.destination,
            startDate: startDate,
            endDate: endDate,
            days: durationDays,
            totalBudget: params.totalBudget,
            hasChildren: params.hasChildren,
            hasElderly: params.hasElderly,
            preferences: params.preferences,
        }).catch((error) => {
            this.logger.error(`后台生成决策草案失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
        });
        if (this.hotelRecommendationService) {
            this.recommendHotelsAsync(trip.id, params.totalBudget).catch((error) => {
                this.logger.debug(`首次酒店推荐失败（可能因为还没有景点数据）: ${error.message}`);
            });
        }
        return (0, standard_response_dto_1.successResponse)({
            sessionId,
            trip,
            parsedParams: params,
            destination: destinationCode || params.destination,
            destinationName: tripDestinationName,
            generatingItems: true,
            message: '行程已创建，正在后台生成行程规划点，请稍后刷新查看',
        });
    }
    generateDefaultClarificationQuestions(reason, destinationCode, currentParams) {
        const questions = [];
        const MAX_REQUIRED_QUESTIONS = 5;
        if (reason === 'decision_matrix_blocked') {
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
        }
        else if (reason === 'gate_blocked') {
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
        }
        else if (reason === 'safety_principle_blocked') {
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
        }
        else {
            const missingFields = [];
            if (!(currentParams === null || currentParams === void 0 ? void 0 : currentParams.destination)) {
                missingFields.push('目的地');
            }
            if (!(currentParams === null || currentParams === void 0 ? void 0 : currentParams.startDate)) {
                missingFields.push('出发日期');
            }
            if (!(currentParams === null || currentParams === void 0 ? void 0 : currentParams.totalBudget)) {
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
            }
        }
        return questions.slice(0, MAX_REQUIRED_QUESTIONS).map((q) => ({
            ...q,
            group: 'required',
        }));
    }
    detectTravelPurpose(params, userInput, context) {
        var _a;
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
        if (params.hasChildren) {
            return '家庭旅行';
        }
        if ((_a = context === null || context === void 0 ? void 0 : context.conversationContext) === null || _a === void 0 ? void 0 : _a.travelStyle) {
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
    generateSupplementaryQuestions(params, destinationCode) {
        var _a, _b, _c;
        const questions = [];
        const MAX_SUPPLEMENTARY_QUESTIONS = 3;
        const hasOptionalInfo = ((_a = params.preferences) === null || _a === void 0 ? void 0 : _a.interests) || ((_b = params.preferences) === null || _b === void 0 ? void 0 : _b.style) || ((_c = params.preferences) === null || _c === void 0 ? void 0 : _c.pace);
        if (!hasOptionalInfo && questions.length < MAX_SUPPLEMENTARY_QUESTIONS) {
            questions.push({
                id: 'supplement_preferences',
                question: '是否需要补充其他偏好信息？（如旅行风格、兴趣点、节奏等）',
                type: 'single_choice',
                options: [
                    { value: 'yes', label: '补充偏好信息' },
                    { value: 'no', label: '暂不补充' },
                ],
                required: false,
                metadata: {
                    category: 'preferences',
                    priority: 'low',
                    fieldName: 'supplementPreferences',
                },
            });
        }
        if (questions.length >= MAX_SUPPLEMENTARY_QUESTIONS) {
            return questions;
        }
        const highRiskDestinations = ['GL', 'SJ', 'AR'];
        if (destinationCode && highRiskDestinations.includes(destinationCode) && questions.length < MAX_SUPPLEMENTARY_QUESTIONS) {
            questions.push({
                id: 'supplement_safety_info',
                question: '是否需要补充安全相关信息？（如健康状况、户外经验等）',
                type: 'single_choice',
                options: [
                    { value: 'yes', label: '补充安全信息' },
                    { value: 'no', label: '暂不补充' },
                ],
                required: false,
                metadata: {
                    category: 'safety',
                    priority: 'medium',
                    fieldName: 'supplementSafetyInfo',
                },
            });
        }
        return questions;
    }
    async generateStructuredClarificationResponseForRound(round, questions, currentParams, fallbackText, personaInfo, safetyCheckResult) {
        const blocks = [];
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
        if ((safetyCheckResult === null || safetyCheckResult === void 0 ? void 0 : safetyCheckResult.shouldWarn) && !safetyCheckResult.shouldBlock) {
            blocks.push({
                type: 'highlight',
                highlightType: 'warning',
                highlightText: safetyCheckResult.warningMessage,
            });
        }
        if (round.description) {
            blocks.push({
                type: 'paragraph',
                content: round.description,
            });
        }
        for (const question of questions) {
            blocks.push({
                type: 'question_card',
                questionId: question.id,
            });
        }
        let textReply = fallbackText || `让我来帮您完善${round.name}的信息。`;
        if (personaInfo) {
            textReply = `根据您的回答，我们识别您可能是：**${personaInfo.personaName}**。${textReply}`;
        }
        if ((safetyCheckResult === null || safetyCheckResult === void 0 ? void 0 : safetyCheckResult.shouldWarn) && !safetyCheckResult.shouldBlock) {
            textReply = `${safetyCheckResult.warningMessage}\n\n${textReply}`;
        }
        const structuredQuestions = questions.map(q => {
            var _a, _b, _c, _d;
            const question = {
                id: q.id,
                question: q.question,
                type: q.type,
                required: q.required || false,
            };
            if (q.options && Array.isArray(q.options)) {
                question.options = q.options.map((opt) => {
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
            if (q.hint)
                question.hint = q.hint;
            if (q.placeholder)
                question.placeholder = q.placeholder;
            if (q.default !== undefined)
                question.default = q.default;
            if (q.validation)
                question.validation = q.validation;
            if (q.dependencies)
                question.dependencies = q.dependencies;
            if (q.conditionalInputs && Array.isArray(q.conditionalInputs)) {
                question.conditionalInputs = q.conditionalInputs.map((input) => {
                    var _a, _b, _c, _d;
                    return ({
                        ...input,
                        triggerValue: ((_a = input.triggerValue) === null || _a === void 0 ? void 0 : _a.toString().trim()) || '',
                        inputType: input.inputType,
                        label: (_b = input.label) === null || _b === void 0 ? void 0 : _b.trim(),
                        placeholder: (_c = input.placeholder) === null || _c === void 0 ? void 0 : _c.trim(),
                        required: input.required !== undefined ? input.required : true,
                        validation: input.validation,
                        hint: (_d = input.hint) === null || _d === void 0 ? void 0 : _d.trim(),
                    });
                });
            }
            if (question.options && Array.isArray(question.options)) {
                question.options = question.options.map((opt) => {
                    if (typeof opt === 'string') {
                        return opt.trim();
                    }
                    const normalizedOpt = {
                        ...opt,
                        value: (opt.value || opt.label || opt).toString().trim(),
                        label: (opt.label || opt.value || opt).toString().trim(),
                    };
                    return normalizedOpt;
                });
            }
            question.metadata = {
                ...q.metadata,
                category: (_a = q.metadata) === null || _a === void 0 ? void 0 : _a.category,
                priority: ((_b = q.metadata) === null || _b === void 0 ? void 0 : _b.priority) || 'medium',
                isCritical: ((_c = q.metadata) === null || _c === void 0 ? void 0 : _c.isCritical) || false,
                fieldName: (_d = q.metadata) === null || _d === void 0 ? void 0 : _d.fieldName,
            };
            return question;
        });
        this.logger.debug(`生成结构化澄清问题: ${structuredQuestions.length} 个问题`);
        if (structuredQuestions.length > 0) {
            this.logger.debug(`问题列表: ${structuredQuestions.map(q => q.id).join(', ')}`);
        }
        let recommendedRoutes = [];
        if (personaInfo && this.aiDecisionLogicService) {
            try {
                recommendedRoutes = await this.aiDecisionLogicService.getRecommendedRoutes(currentParams.destination || '', personaInfo.personaId, currentParams);
                if (recommendedRoutes.length > 0) {
                    blocks.push({
                        type: 'paragraph',
                        content: `\n**推荐路线**：\n${recommendedRoutes.map((r, i) => `${i + 1}. ${r.route} - ${r.reason}`).join('\n')}`,
                    });
                }
            }
            catch (error) {
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
    async getConversationContext(sessionId, user) {
        try {
            const userId = (user === null || user === void 0 ? void 0 : user.userId) || `temp_${sessionId}`;
            let context = await this.nlConversationContextService.getContext(sessionId, userId);
            if (!context && !(user === null || user === void 0 ? void 0 : user.userId)) {
                context = await this.nlConversationContextService.getContext(sessionId, sessionId);
            }
            if (!context) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, '会话不存在或已过期');
            }
            return (0, standard_response_dto_1.successResponse)(context);
        }
        catch (error) {
            this.logger.error(`获取对话上下文失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '获取对话上下文失败');
        }
    }
    async getUserConversations(user) {
        try {
            const userId = user === null || user === void 0 ? void 0 : user.userId;
            if (!userId) {
                return (0, standard_response_dto_1.successResponse)({ sessions: [] });
            }
            const sessions = await this.nlConversationContextService.getUserSessions(userId);
            return (0, standard_response_dto_1.successResponse)({ sessions });
        }
        catch (error) {
            this.logger.error(`获取用户会话列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '获取会话列表失败');
        }
    }
    async updateConversationContext(sessionId, dto, user) {
        try {
            const userId = (user === null || user === void 0 ? void 0 : user.userId) || `temp_${sessionId}`;
            if (dto.sessionId !== sessionId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '会话 ID 不匹配');
            }
            const context = await this.nlConversationContextService.updateContext(sessionId, userId, {
                conversationContext: dto.conversationContext,
                partialParams: dto.partialParams,
            });
            return (0, standard_response_dto_1.successResponse)(context);
        }
        catch (error) {
            this.logger.error(`更新对话上下文失败: ${error.message}`, error.stack);
            if (error.message.includes('不存在')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '更新对话上下文失败');
        }
    }
    async updateMessageQuestionAnswers(sessionId, messageId, body, user) {
        var _a;
        try {
            const userId = (user === null || user === void 0 ? void 0 : user.userId) || `temp_${sessionId}`;
            const message = await this.nlConversationContextService.updateMessageQuestionAnswers(sessionId, userId, messageId, body.questionAnswers);
            return (0, standard_response_dto_1.successResponse)({
                messageId: message.id,
                questionAnswers: ((_a = message.metadata) === null || _a === void 0 ? void 0 : _a.questionAnswers) || {},
            });
        }
        catch (error) {
            if (error.message.includes('不存在')) {
                this.logger.warn(`更新消息问题答案失败: ${error.message}`, error.stack);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`更新消息问题答案失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '更新消息问题答案失败');
        }
    }
    async deleteConversation(sessionId, user) {
        try {
            const userId = (user === null || user === void 0 ? void 0 : user.userId) || `temp_${sessionId}`;
            this.logger.debug(`删除会话: sessionId=${sessionId}, userId=${userId}`);
            await this.nlConversationContextService.deleteSession(sessionId, userId);
            if (!(user === null || user === void 0 ? void 0 : user.userId)) {
                this.logger.debug(`尝试删除旧格式会话: sessionId=${sessionId}, userId=${sessionId}`);
                await this.nlConversationContextService.deleteSession(sessionId, sessionId);
            }
            return (0, standard_response_dto_1.successResponse)(null);
        }
        catch (error) {
            this.logger.warn(`删除会话失败（静默处理）: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.successResponse)(null);
        }
    }
    async findAll(user) {
        const userId = user === null || user === void 0 ? void 0 : user.userId;
        const trips = await this.tripsService.findAll(userId);
        return (0, standard_response_dto_1.successResponse)(trips);
    }
    async getAttentionQueue(query) {
        try {
            const result = await this.tripsService.getAttentionQueue(query);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findAllAdmin(query) {
        try {
            const result = await this.tripsService.findAllAdmin(query);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取行程列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminStats(query) {
        try {
            const stats = await this.tripsService.getAdminStats(query);
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            this.logger.error(`获取行程统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findOneAdmin(id) {
        try {
            const trip = await this.tripsService.findOneAdmin(id);
            return (0, standard_response_dto_1.successResponse)(trip);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`获取行程详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async batchOperation(body) {
        try {
            const result = await this.tripsService.batchOperation(body);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`批量操作失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async exportTrip(id, format = 'json') {
        try {
            const result = await this.tripsService.exportTrip(id, format);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`导出行程数据失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findOne(id, user) {
        try {
            const userId = user === null || user === void 0 ? void 0 : user.userId;
            const trip = await this.tripsService.findOne(id, userId);
            return (0, standard_response_dto_1.successResponse)(trip);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async getInsight(id) {
        try {
            const insight = await this.tripInsightService.getInsight(id);
            return (0, standard_response_dto_1.successResponse)(insight);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`获取行程洞察失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async update(id, dto) {
        try {
            const trip = await this.tripsService.update(id, dto);
            return (0, standard_response_dto_1.successResponse)(trip);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`更新行程失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async remove(id, dto) {
        try {
            const result = await this.tripsService.remove(id, dto.confirmText);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async getTripState(id, nowISO) {
        try {
            const state = await this.tripsService.getTripState(id, nowISO);
            return (0, standard_response_dto_1.successResponse)(state);
        }
        catch (error) {
            if (error.status === 404) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async getSchedule(id, dateISO) {
        try {
            const result = await this.tripsService.getSchedule(id, dateISO);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error.status === 404) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async saveSchedule(id, dateISO, body) {
        try {
            const result = await this.tripsService.saveSchedule(id, dateISO, body.schedule);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error.status === 404) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async getActionHistory(id, dateISO) {
        var _a;
        try {
            const history = await this.tripsService.getActionHistory(id, dateISO);
            return (0, standard_response_dto_1.successResponse)(history);
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('不存在')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async undoAction(id, body) {
        var _a;
        try {
            const schedule = await this.tripsService.undoAction(id, body.date);
            if (!schedule) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, '没有可撤销的操作');
            }
            return (0, standard_response_dto_1.successResponse)({ schedule });
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('不存在')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async redoAction(id, body) {
        var _a;
        try {
            const schedule = await this.tripsService.redoAction(id, body.date);
            if (!schedule) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, '没有可重做的操作');
            }
            return (0, standard_response_dto_1.successResponse)({ schedule });
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('不存在')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async createShare(id, dto) {
        try {
            const share = await this.tripExtendedService.createShare(id, dto);
            return (0, standard_response_dto_1.successResponse)(share);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async addCollaborator(id, dto) {
        try {
            const collaborator = await this.tripExtendedService.addCollaborator(id, dto);
            return (0, standard_response_dto_1.successResponse)(collaborator);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getCollaborators(id) {
        try {
            const collaborators = await this.tripExtendedService.getCollaborators(id);
            return (0, standard_response_dto_1.successResponse)(collaborators);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async removeCollaborator(id, userId) {
        try {
            const result = await this.tripExtendedService.removeCollaborator(id, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async collectTrip(id) {
        try {
            const userId = 'default-user';
            const result = await this.tripExtendedService.collectTrip(id, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async uncollectTrip(id) {
        try {
            const userId = 'default-user';
            const result = await this.tripExtendedService.uncollectTrip(id, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async likeTrip(id) {
        try {
            const userId = 'default-user';
            const result = await this.tripExtendedService.likeTrip(id, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async unlikeTrip(id) {
        try {
            const userId = 'default-user';
            const result = await this.tripExtendedService.unlikeTrip(id, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getFeaturedTrips(limit) {
        try {
            const trips = await this.tripExtendedService.getFeaturedTrips(limit ? parseInt(limit.toString()) : 10);
            return (0, standard_response_dto_1.successResponse)(trips);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async exportOfflinePack(id) {
        try {
            const pack = await this.tripExtendedService.exportOfflinePack(id);
            return (0, standard_response_dto_1.successResponse)(pack);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getOfflinePackStatus(id) {
        try {
            const status = await this.tripExtendedService.getOfflinePackStatus(id);
            return (0, standard_response_dto_1.successResponse)(status);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async syncOfflineChanges(id, offlineData) {
        try {
            const result = await this.tripExtendedService.syncOfflineChanges(id, offlineData);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateRecap(id) {
        try {
            const recap = await this.tripRecapService.generateRecap(id);
            return (0, standard_response_dto_1.successResponse)(recap);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async exportRecap(id) {
        try {
            const exportData = await this.tripRecapService.exportForSharing(id);
            return (0, standard_response_dto_1.successResponse)(exportData);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateTrailVideoData(id) {
        try {
            const videoData = await this.tripRecapService.generateTrailVideoData(id);
            return (0, standard_response_dto_1.successResponse)(videoData);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getTripByShareToken(shareToken) {
        try {
            const tripData = await this.tripExtendedService.getTripByShareToken(shareToken);
            return (0, standard_response_dto_1.successResponse)(tripData);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async importTripFromShare(shareToken, body) {
        try {
            const result = await this.tripExtendedService.importTripFromShare(shareToken, body);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async sendEmergencySOS(id, body) {
        try {
            const request = {
                tripId: id,
                latitude: body.latitude,
                longitude: body.longitude,
                message: body.message,
            };
            const response = await this.tripEmergencyService.sendSOS(request);
            return (0, standard_response_dto_1.successResponse)(response);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getSOSHistory(id) {
        try {
            const history = await this.tripEmergencyService.getSOSHistory(id);
            return (0, standard_response_dto_1.successResponse)(history);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async setBudgetConstraint(id, body) {
        try {
            const constraint = await this.tripBudgetService.setBudgetConstraint(id, body);
            return (0, standard_response_dto_1.successResponse)({ tripId: id, budgetConstraint: constraint, updatedAt: constraint.updatedAt });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetConstraint(id, userId, currentUser) {
        try {
            const effectiveUserId = (currentUser === null || currentUser === void 0 ? void 0 : currentUser.userId) || userId;
            const constraint = await this.tripBudgetService.getBudgetConstraint(id, effectiveUserId);
            if (!constraint) {
                return (0, standard_response_dto_1.successResponse)({ budgetConstraint: null });
            }
            const isRecommended = constraint._isRecommended === true;
            return (0, standard_response_dto_1.successResponse)({
                budgetConstraint: {
                    ...constraint,
                    _isRecommended: isRecommended,
                },
                createdAt: constraint.createdAt,
                updatedAt: constraint.updatedAt,
            });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async deleteBudgetConstraint(id) {
        try {
            await this.tripBudgetService.deleteBudgetConstraint(id);
            return (0, standard_response_dto_1.successResponse)({ tripId: id, deletedAt: new Date().toISOString() });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetSummary(id, startDate, endDate, category) {
        try {
            const summary = await this.tripBudgetService.getBudgetSummary(id);
            return (0, standard_response_dto_1.successResponse)(summary);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async checkBudgetAlert(id, cost) {
        try {
            const alert = await this.tripBudgetService.checkBudgetAlert(id, parseFloat(cost));
            return (0, standard_response_dto_1.successResponse)(alert);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetOptimization(id, category) {
        try {
            const suggestions = await this.tripBudgetService.getBudgetOptimizationSuggestions(id, category);
            return (0, standard_response_dto_1.successResponse)(suggestions);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetDetails(id, startDate, endDate, category, limit, offset) {
        try {
            const details = await this.tripBudgetService.getBudgetDetails(id, {
                startDate,
                endDate,
                category,
                limit: limit ? parseInt(limit.toString(), 10) : undefined,
                offset: offset ? parseInt(offset.toString(), 10) : undefined,
            });
            return (0, standard_response_dto_1.successResponse)(details);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetTrends(id, startDate, endDate, granularity) {
        try {
            const trends = await this.tripBudgetService.getBudgetTrends(id, {
                startDate,
                endDate,
                granularity,
            });
            return (0, standard_response_dto_1.successResponse)(trends);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateBudgetReport(id) {
        try {
            const report = await this.tripBudgetService.generateBudgetReport(id);
            return (0, standard_response_dto_1.successResponse)(report);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetMonitor(id, realtime) {
        try {
            const monitor = await this.tripBudgetService.getBudgetMonitor(id);
            return (0, standard_response_dto_1.successResponse)(monitor);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetStatistics(id) {
        try {
            const statistics = await this.tripBudgetService.getBudgetStatistics(id);
            return (0, standard_response_dto_1.successResponse)(statistics);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async adjustTrip(id, body) {
        try {
            const request = {
                tripId: id,
                modifications: body.modifications,
            };
            const result = await this.tripAdjustmentService.adjustTrip(request);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPersonaAlerts(id) {
        try {
            const alerts = await this.tripsService.getPersonaAlerts(id);
            return (0, standard_response_dto_1.successResponse)(alerts);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getDecisionLog(id, limit, offset) {
        try {
            const limitNum = limit ? parseInt(limit, 10) : 10;
            const offsetNum = offset ? parseInt(offset, 10) : 0;
            const log = await this.tripsService.getDecisionLog(id, limitNum, offsetNum);
            return (0, standard_response_dto_1.successResponse)(log);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async checkEvidenceCompleteness(id) {
        try {
            const result = await this.tripsService.checkEvidenceCompleteness(id);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`检查证据完整性失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '检查证据完整性失败', { originalError: error.message });
        }
    }
    async getEvidenceFetchSuggestions(id) {
        try {
            const result = await this.tripsService.getEvidenceFetchSuggestions(id);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`获取证据获取建议失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '获取证据获取建议失败', { originalError: error.message });
        }
    }
    async getEvidence(id, query) {
        try {
            const result = await this.tripsService.getEvidence(id, query);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error(`获取证据列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '获取证据列表失败', { originalError: error.message });
        }
    }
    async updateEvidence(id, evidenceId, dto, user) {
        try {
            const userId = user === null || user === void 0 ? void 0 : user.userId;
            const result = await this.tripsService.updateEvidence(id, evidenceId, dto, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            if (error instanceof common_1.ForbiddenException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.FORBIDDEN, error.message);
            }
            this.logger.error(`更新证据失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '更新证据失败', { originalError: error.message });
        }
    }
    async batchUpdateEvidence(id, dto, user) {
        try {
            const userId = user === null || user === void 0 ? void 0 : user.userId;
            const result = await this.tripsService.batchUpdateEvidence(id, dto, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            if (error instanceof common_1.ForbiddenException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.FORBIDDEN, error.message);
            }
            this.logger.error(`批量更新证据失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '批量更新证据失败', { originalError: error.message });
        }
    }
    async getTasks(id) {
        try {
            const tasks = await this.tripsService.getTasks(id);
            return (0, standard_response_dto_1.successResponse)(tasks);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateTaskStatus(id, taskId, updateTaskStatusDto) {
        try {
            const task = await this.tripsService.updateTaskStatus(id, taskId, updateTaskStatusDto.completed);
            return (0, standard_response_dto_1.successResponse)(task);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPipelineStatus(id) {
        try {
            const status = await this.tripsService.getPipelineStatus(id);
            return (0, standard_response_dto_1.successResponse)(status);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async createDraft(dto) {
        try {
            const draft = await this.tripDraftService.generateDraft(dto);
            return (0, standard_response_dto_1.successResponse)(draft);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`生成行程草案失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, error.message || '生成行程草案失败');
        }
    }
    async replaceItem(tripId, itemId, dto) {
        try {
            const result = await this.tripDraftService.replaceItem(tripId, itemId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`替换行程项失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, error.message || '替换行程项失败');
        }
    }
    async regenerateTrip(tripId, dto) {
        try {
            const result = await this.tripDraftService.regenerateTrip(tripId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`重生成行程失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, error.message || '重生成行程失败');
        }
    }
    async getDayMetrics(id, dayId) {
        try {
            const metrics = await this.tripMetricsService.getDayMetrics(id, dayId);
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getTripMetrics(id, dates) {
        try {
            const dateArray = Array.isArray(dates) ? dates : dates ? [dates] : undefined;
            const metrics = await this.tripMetricsService.getTripMetrics(id, dateArray);
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getConflicts(id, date, severity) {
        try {
            const conflicts = await this.tripConflictsService.getConflicts(id, date, severity);
            return (0, standard_response_dto_1.successResponse)(conflicts);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateIntent(id, dto) {
        try {
            const result = await this.tripIntentService.updateIntent(id, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getIntent(id) {
        try {
            const intent = await this.tripIntentService.getIntent(id);
            return (0, standard_response_dto_1.successResponse)(intent);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async applyOptimization(id, dto) {
        try {
            const result = await this.tripOptimizationService.applyOptimization(id, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getItemDetail(id, itemId) {
        var _a;
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
                throw new common_1.NotFoundException(`行程项 ID ${itemId} 不存在`);
            }
            if (((_a = item.TripDay) === null || _a === void 0 ? void 0 : _a.tripId) !== id) {
                throw new common_1.NotFoundException(`行程项不属于指定行程`);
            }
            return (0, standard_response_dto_1.successResponse)(item);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async batchUpdateItems(id, dto) {
        var _a;
        try {
            const errors = [];
            let updatedCount = 0;
            for (const update of dto.updates) {
                try {
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
                    if (((_a = item.TripDay) === null || _a === void 0 ? void 0 : _a.tripId) !== id) {
                        errors.push({ itemId: update.itemId, error: '行程项不属于指定行程' });
                        continue;
                    }
                    const updateData = {};
                    if (update.startTime) {
                        updateData.startTime = luxon_1.DateTime.fromISO(update.startTime).toJSDate();
                    }
                    if (update.endTime) {
                        updateData.endTime = luxon_1.DateTime.fromISO(update.endTime).toJSDate();
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
                }
                catch (error) {
                    errors.push({ itemId: update.itemId, error: error.message || '更新失败' });
                }
            }
            const result = {
                success: errors.length === 0,
                updatedCount,
                failedCount: errors.length,
                errors: errors.length > 0 ? errors : undefined,
            };
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    extractCountryCodeFromText(text) {
        const countryMap = {
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
            '阿尔卑斯': 'AL',
            '阿尔卑斯山': 'AL',
            'Alps': 'AL',
            'alps': 'AL',
            'AL': 'AL',
            'al': 'AL',
            '西藏': 'XZ',
            'Tibet': 'XZ',
            'tibet': 'XZ',
            'XZ': 'XZ',
            'xz': 'XZ',
            '拉萨': 'XZ',
            'Lhasa': 'XZ',
            'lhasa': 'XZ',
            '罗弗敦': 'LF',
            'Lofoten': 'LF',
            'lofoten': 'LF',
            'LF': 'LF',
            'lf': 'LF',
            '罗弗敦群岛': 'LF',
            'Lofoten Islands': 'LF',
            'lofoten islands': 'LF',
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
    extractCountryCode(destination) {
        if (!destination) {
            return undefined;
        }
        const upperDest = destination.toUpperCase();
        const specialDestinations = {
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
        if (specialDestinations[upperDest]) {
            return specialDestinations[upperDest];
        }
        for (const [key, code] of Object.entries(specialDestinations)) {
            if (upperDest.includes(key)) {
                return code;
            }
        }
        if (destination.includes('_')) {
            const parts = destination.split('_');
            const code = parts[0].toUpperCase();
            if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
                return code;
            }
        }
        if (destination.includes('-')) {
            const parts = destination.split('-');
            const code = parts[0].toUpperCase();
            if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
                return code;
            }
        }
        const code = destination.substring(0, 2).toUpperCase();
        if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
            return code;
        }
        return undefined;
    }
    async generateDecisionDraftAsync(tripId, userInput, parsedParams, tripParams) {
        var _a, _b, _c, _d, _e;
        try {
            if (!this.decisionDraftGenerator || !this.decisionDraftStorage) {
                this.logger.warn(`DecisionDraftGeneratorService 或 DecisionDraftStorageService 不可用，跳过决策草案生成`);
                return;
            }
            this.logger.log(`开始为行程 ${tripId} 生成决策草案（后台任务）`);
            const requestId = `trip_${tripId}_${Date.now()}`;
            const tripPlanRequest = {
                request_id: requestId,
                origin: tripParams.destination,
                destination: tripParams.destination,
                date_range: {
                    start_date: tripParams.startDate,
                    end_date: tripParams.endDate,
                },
                start_date: tripParams.startDate,
                days: tripParams.days,
                mode: 'mixed',
                party: {
                    count: 1 + (tripParams.hasChildren ? 1 : 0) + (tripParams.hasElderly ? 1 : 0),
                    has_children: tripParams.hasChildren,
                    has_elderly: tripParams.hasElderly,
                    fitness_level: ((_a = tripParams.preferences) === null || _a === void 0 ? void 0 : _a.intensity) === 'high' ? 'high' :
                        ((_b = tripParams.preferences) === null || _b === void 0 ? void 0 : _b.intensity) === 'low' ? 'low' : 'medium',
                },
                constraints: {
                    budget: {
                        total: tripParams.totalBudget,
                        currency: 'CNY',
                    },
                },
                preferences: {
                    scenic_priority: ((_c = tripParams.preferences) === null || _c === void 0 ? void 0 : _c.style) === 'nature' || ((_d = tripParams.preferences) === null || _d === void 0 ? void 0 : _d.style) === 'adventure',
                    efficiency_priority: ((_e = tripParams.preferences) === null || _e === void 0 ? void 0 : _e.style) === 'citywalk',
                },
            };
            const decisionDraft = await this.decisionDraftGenerator.generateDecisionDraft(userInput, tripPlanRequest, {
                user_mode: 'toc',
            });
            await this.decisionDraftStorage.saveDecisionDraft(decisionDraft);
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
            });
            if (trip) {
                const metadata = trip.metadata || {};
                await this.prisma.trip.update({
                    where: { id: tripId },
                    data: {
                        metadata: {
                            ...metadata,
                            decisionDraftId: decisionDraft.draft_id,
                            decisionDraftWorkflowId: decisionDraft.plan_id,
                            createdFromNaturalLanguage: true,
                        },
                        updatedAt: new Date(),
                    },
                });
                this.logger.log(`成功为行程 ${tripId} 生成并保存决策草案: ${decisionDraft.draft_id}`);
            }
            else {
                this.logger.warn(`行程 ${tripId} 不存在，无法关联决策草案`);
            }
        }
        catch (error) {
            this.logger.error(`后台生成决策草案失败 (tripId: ${tripId}): ${error.message}`, error.stack);
        }
    }
    async generateDraftAsync(tripId, draftDto) {
        try {
            this.logger.log(`开始为行程 ${tripId} 生成行程规划点（后台任务）`);
            await this.updateGenerationProgress(tripId, {
                status: 'generating',
                stage: 'retrieving_candidates',
                message: '正在检索候选地点...',
            });
            const draft = await this.tripDraftService.generateDraft(draftDto, (progress) => {
                return this.updateGenerationProgress(tripId, progress);
            });
            await this.updateGenerationProgress(tripId, {
                status: 'generating',
                stage: 'saving_items',
                message: 'LLM 编排完成，正在保存行程项...',
            });
            const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(tripId, draft);
            await this.updateGenerationProgress(tripId, {
                status: 'completed',
                stage: 'completed',
                message: `成功生成 ${itemsCount} 个行程项`,
                itemsCount,
            });
            this.logger.log(`成功为行程 ${tripId} 生成 ${itemsCount} 个行程项（后台任务完成）`);
            if (this.hotelRecommendationService && itemsCount > 0) {
                this.recommendHotelsAsync(tripId).then((recommendations) => {
                    if (recommendations && recommendations.length > 0) {
                        this.logger.log(`为行程 ${tripId} 推荐了 ${recommendations.length} 个酒店（行程项生成后）`);
                    }
                }).catch((error) => {
                    this.logger.warn(`酒店推荐失败 (tripId: ${tripId}): ${error.message}`, error.stack);
                });
            }
        }
        catch (error) {
            this.logger.error(`后台生成行程规划点失败 (tripId: ${tripId}): ${error.message}`, error.stack);
            await this.updateGenerationProgress(tripId, {
                status: 'failed',
                stage: 'error',
                message: `生成失败: ${error.message}`,
            }).catch((updateError) => {
                this.logger.error(`更新进度失败: ${updateError.message}`);
            });
        }
    }
    async updateGenerationProgress(tripId, progress) {
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
            });
            if (!trip) {
                this.logger.warn(`行程 ${tripId} 不存在，无法更新进度`);
                return;
            }
            const metadata = trip.metadata || {};
            await this.prisma.trip.update({
                where: { id: tripId },
                data: {
                    metadata: {
                        ...metadata,
                        generationProgress: {
                            ...progress,
                            updatedAt: new Date().toISOString(),
                        },
                    },
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error(`更新行程生成进度失败: ${error.message}`);
        }
    }
    async getSuggestions(id, persona, scope, scopeId, severity, status, limit, offset) {
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
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getSuggestionStats(id) {
        try {
            const stats = await this.tripSuggestionsService.getSuggestionStats(id);
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async applySuggestion(id, suggestionId, dto) {
        try {
            const result = await this.tripSuggestionsService.applySuggestion(id, suggestionId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async dismissSuggestion(id, suggestionId) {
        try {
            await this.tripSuggestionsService.dismissSuggestion(id, suggestionId);
            return (0, standard_response_dto_1.successResponse)(null);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async recommendHotelsAsync(tripId, totalBudget) {
        if (!this.hotelRecommendationService) {
            return undefined;
        }
        try {
            let maxBudget = undefined;
            if (totalBudget) {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                    select: { startDate: true, endDate: true },
                });
                if (trip) {
                    const start = luxon_1.DateTime.fromISO(trip.startDate.toISOString());
                    const end = luxon_1.DateTime.fromISO(trip.endDate.toISOString());
                    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
                    const hotelBudgetRatio = 0.35;
                    const totalHotelBudget = totalBudget * hotelBudgetRatio;
                    maxBudget = Math.floor(totalHotelBudget / durationDays);
                }
            }
            const recommendations = await this.hotelRecommendationService.recommendHotels({
                tripId,
                maxBudget,
                includeHiddenCost: true,
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
        }
        catch (error) {
            return undefined;
        }
    }
};
exports.TripsController = TripsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: '创建新行程',
        description: '创建新行程并自动计算节奏策略（木桶效应）和预算切分。系统会根据旅行者信息自动计算体力限制和地形限制，并根据预算推荐酒店档次。也可以从草案创建行程（传入 SaveTripDraftDto）。'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程创建成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_2.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('from-natural-language'),
    (0, swagger_1.ApiOperation)({
        summary: '自然语言创建行程',
        description: '使用自然语言描述创建行程，大模型会自动解析需求并转换为接口参数。例如："帮我规划带娃去东京5天的行程，预算2万"',
    }),
    (0, swagger_1.ApiBody)({ type: create_trip_from_nl_dto_1.CreateTripFromNaturalLanguageDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功创建行程或需要澄清（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_trip_from_nl_dto_1.CreateTripFromNaturalLanguageDto, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "createFromNaturalLanguage", null);
__decorate([
    (0, common_1.Post)('nl-conversation/:sessionId/confirm-create'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '确认创建行程',
        description: '用户确认创建行程，系统将根据已收集的参数创建行程',
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程创建成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "confirmCreateTrip", null);
__decorate([
    (0, common_1.Post)('gate-alternative/select'),
    (0, swagger_1.ApiOperation)({ summary: '选择 Gate 替代方案' }),
    (0, swagger_1.ApiBody)({ type: select_gate_alternative_dto_1.SelectGateAlternativeDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功应用替代方案，继续澄清流程',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [select_gate_alternative_dto_1.SelectGateAlternativeDto, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "selectGateAlternative", null);
__decorate([
    (0, common_1.Get)('nl-conversation/:sessionId'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取对话上下文',
        description: '根据会话 ID 获取自然语言创建行程时的对话历史记录',
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取对话上下文',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getConversationContext", null);
__decorate([
    (0, common_1.Get)('nl-conversation'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取用户的所有对话会话',
        description: '获取当前用户的所有自然语言创建行程对话会话列表（只返回最后一条消息用于预览）',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取会话列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getUserConversations", null);
__decorate([
    (0, common_1.Put)('nl-conversation/:sessionId'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '更新对话上下文',
        description: '更新会话的对话上下文数据或部分参数',
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话 ID' }),
    (0, swagger_1.ApiBody)({ type: nl_conversation_context_dto_1.UpdateConversationContextDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新对话上下文',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, nl_conversation_context_dto_1.UpdateConversationContextDto, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateConversationContext", null);
__decorate([
    (0, common_1.Put)('nl-conversation/:sessionId/messages/:messageId'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '更新消息的问题答案',
        description: '更新特定消息的 questionAnswers 字段',
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话 ID' }),
    (0, swagger_1.ApiParam)({ name: 'messageId', description: '消息 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新消息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Param)('messageId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateMessageQuestionAnswers", null);
__decorate([
    (0, common_1.Delete)('nl-conversation/:sessionId'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '删除对话会话',
        description: '删除指定的对话会话及其所有历史记录。如果会话不存在，会静默返回成功（前端会处理）。',
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除会话（或会话不存在）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "deleteConversation", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取所有行程',
        description: '返回所有行程列表，包含每个行程的基本信息和关联的 TripDay'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('attention-queue'),
    (0, swagger_1.ApiOperation)({
        summary: '获取关注队列',
        description: '获取需要用户关注的队列列表，用于 Dashboard 页面的 Attention Queue 显示。支持全局查询（所有行程）或按 tripId 过滤。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回关注队列（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [attention_queue_dto_1.GetAttentionQueueQueryDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getAttentionQueue", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程列表（管理接口）',
        description: '获取所有行程列表，支持分页、筛选、排序、搜索。用于后台管理系统。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "findAllAdmin", null);
__decorate([
    (0, common_1.Get)('admin/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程统计信息（管理接口）',
        description: '获取行程相关的统计数据，包括总体统计、分类统计、趋势分析等。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程统计信息（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getAdminStats", null);
__decorate([
    (0, common_1.Get)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程详情（管理视图）',
        description: '获取单个行程的完整信息，包括所有关联数据。用于后台管理系统。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程ID（UUID）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程详情（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "findOneAdmin", null);
__decorate([
    (0, common_1.Post)('admin/batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量操作（管理接口）',
        description: '批量执行操作（删除、状态更新等）。',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['DELETE', 'UPDATE_STATUS'] },
                tripIds: { type: 'array', items: { type: 'string' } },
                params: { type: 'object' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功执行批量操作（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "batchOperation", null);
__decorate([
    (0, common_1.Get)('admin/:id/export'),
    (0, swagger_1.ApiOperation)({
        summary: '导出行程数据（管理接口）',
        description: '导出单个行程的完整数据（JSON/CSV格式）。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程ID（UUID）' }),
    (0, swagger_1.ApiQuery)({ name: 'format', required: false, enum: ['json', 'csv'], description: '导出格式', example: 'json' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功导出数据',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "exportTrip", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取单个行程详情（全景视图）',
        description: '根据行程 ID 获取完整的行程树形结构，包括：\n' +
            '- 所有 TripDay（按日期排序）\n' +
            '- 每个 Day 下的所有 ItineraryItem（按时间排序）\n' +
            '- 每个 Item 关联的 Place 详情（包含中英文名称、位置、营业时间等）\n' +
            '- 统计信息（总天数、总活动数、行程状态等）'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程详情（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/insight'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程洞察摘要',
        description: '获取行程的 AI 洞察摘要，包括行程基本信息、AI 发现的问题/建议、准备度摘要和整体状态。用于前端展示行程健康度和优化建议。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程洞察摘要（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getInsight", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '更新行程基本信息',
        description: '更新行程的基本信息，包括目的地、日期、预算、旅行者、状态等。支持部分更新（只更新提供的字段）。状态更新会进行合法性验证：已取消的行程不能修改状态，已完成的行程不能改回规划中或进行中。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiBody)({ type: update_trip_dto_1.UpdateTripDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '更新成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_trip_dto_1.UpdateTripDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
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
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiBody)({ type: delete_trip_dto_1.DeleteTripDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '删除成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程不存在或确认文字不匹配（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, delete_trip_dto_1.DeleteTripDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/state'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程当前状态',
        description: '返回行程的当前状态，包括当前日期、当前行程项、下一站信息等。用于语音问"下一站"和按钮操作。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiQuery)({ name: 'now', description: '当前时间（ISO 格式，可选）', example: '2024-05-01T10:30:00.000Z', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程当前状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('now')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getTripState", null);
__decorate([
    (0, common_1.Get)(':id/schedule'),
    (0, swagger_1.ApiOperation)({
        summary: '获取指定日期的 Schedule',
        description: '从数据库读取指定日期的 Schedule（DayScheduleResult 格式）。如果该日期没有 Schedule，返回 null。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiQuery)({ name: 'date', description: '日期（YYYY-MM-DD）', example: '2024-05-01', required: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Schedule',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getSchedule", null);
__decorate([
    (0, common_1.Put)(':id/schedule'),
    (0, swagger_1.ApiOperation)({
        summary: '保存指定日期的 Schedule',
        description: '将 Schedule（DayScheduleResult）保存到数据库，转换为 ItineraryItem。用于保存 apply-action、what-if apply 后的新 schedule。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiQuery)({ name: 'date', description: '日期（YYYY-MM-DD）', example: '2024-05-01', required: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功保存 Schedule',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('date')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, schedule_dto_1.SaveScheduleDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "saveSchedule", null);
__decorate([
    (0, common_1.Get)(':id/actions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取操作历史',
        description: '获取行程的操作历史记录，支持按日期筛选。用于审计回放和撤销功能。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiQuery)({ name: 'date', description: '日期（YYYY-MM-DD，可选）', example: '2024-05-01', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回操作历史列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getActionHistory", null);
__decorate([
    (0, common_1.Post)(':id/actions/undo'),
    (0, swagger_1.ApiOperation)({
        summary: '撤销操作',
        description: '撤销最后一次操作，返回操作前的 Schedule。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回撤销后的 Schedule',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在或没有可撤销的操作' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "undoAction", null);
__decorate([
    (0, common_1.Post)(':id/actions/redo'),
    (0, swagger_1.ApiOperation)({
        summary: '重做操作',
        description: '重做最后一次撤销的操作，返回操作后的 Schedule。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回重做后的 Schedule',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在或没有可重做的操作' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "redoAction", null);
__decorate([
    (0, common_1.Post)(':id/share'),
    (0, swagger_1.ApiOperation)({
        summary: '生成行程分享链接',
        description: '生成行程分享链接/二维码，设置查看/编辑权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({ type: trip_share_dto_1.CreateTripShareDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功生成分享链接（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trip_share_dto_1.CreateTripShareDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "createShare", null);
__decorate([
    (0, common_1.Post)(':id/collaborators'),
    (0, swagger_1.ApiOperation)({
        summary: '添加行程协作者',
        description: '通过邮箱添加行程协作者，设置查看/编辑权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({ type: trip_collaborator_dto_1.AddCollaboratorDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功添加协作者（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trip_collaborator_dto_1.AddCollaboratorDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "addCollaborator", null);
__decorate([
    (0, common_1.Get)(':id/collaborators'),
    (0, swagger_1.ApiOperation)({
        summary: '获取协作者列表',
        description: '获取行程的所有协作者列表。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回协作者列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getCollaborators", null);
__decorate([
    (0, common_1.Delete)(':id/collaborators/:userId'),
    (0, swagger_1.ApiOperation)({
        summary: '移除协作者',
        description: '移除行程的指定协作者。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: '用户 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功移除协作者（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "removeCollaborator", null);
__decorate([
    (0, common_1.Post)(':id/collect'),
    (0, swagger_1.ApiOperation)({
        summary: '收藏行程',
        description: '收藏行程，用于后续参考。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功收藏行程（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "collectTrip", null);
__decorate([
    (0, common_1.Delete)(':id/collect'),
    (0, swagger_1.ApiOperation)({
        summary: '取消收藏行程',
        description: '取消收藏行程。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功取消收藏（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "uncollectTrip", null);
__decorate([
    (0, common_1.Post)(':id/like'),
    (0, swagger_1.ApiOperation)({
        summary: '点赞行程',
        description: '点赞行程，用于热门行程推荐。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功点赞行程（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "likeTrip", null);
__decorate([
    (0, common_1.Delete)(':id/like'),
    (0, swagger_1.ApiOperation)({
        summary: '取消点赞行程',
        description: '取消点赞行程。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功取消点赞（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "unlikeTrip", null);
__decorate([
    (0, common_1.Get)('featured'),
    (0, swagger_1.ApiOperation)({
        summary: '获取热门推荐行程',
        description: '根据点赞数和收藏数获取热门推荐行程列表。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '返回数量限制', example: 10 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回热门行程列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getFeaturedTrips", null);
__decorate([
    (0, common_1.Get)(':id/offline-pack'),
    (0, swagger_1.ApiOperation)({
        summary: '导出行程离线数据包',
        description: '导出行程离线数据包（包含地点详情、路线、Schedule），用于离线查看和编辑。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功导出离线数据包（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "exportOfflinePack", null);
__decorate([
    (0, common_1.Get)(':id/offline-status'),
    (0, swagger_1.ApiOperation)({
        summary: '查询离线数据包状态',
        description: '查询行程的离线数据包是否存在及其版本信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回离线数据包状态（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getOfflinePackStatus", null);
__decorate([
    (0, common_1.Post)(':id/offline-sync'),
    (0, swagger_1.ApiOperation)({
        summary: '同步离线修改',
        description: '联网后同步离线修改的内容。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            description: '离线数据',
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功同步离线数据（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "syncOfflineChanges", null);
__decorate([
    (0, common_1.Get)(':id/recap'),
    (0, swagger_1.ApiOperation)({
        summary: '生成行程复盘报告',
        description: '生成包含景点打卡顺序、徒步总里程、海拔变化等数据的完整复盘报告'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '生成成功' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "generateRecap", null);
__decorate([
    (0, common_1.Get)(':id/recap/export'),
    (0, swagger_1.ApiOperation)({
        summary: '导出行程复盘报告（用于分享）',
        description: '导出为可分享的格式，包含完整的景点和徒步轨迹数据'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '导出成功' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "exportRecap", null);
__decorate([
    (0, common_1.Get)(':id/trail-video-data'),
    (0, swagger_1.ApiOperation)({
        summary: '生成3D轨迹视频数据',
        description: '返回GPX和关键点信息，前端可据此生成3D轨迹视频'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '生成成功' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "generateTrailVideoData", null);
__decorate([
    (0, common_1.Get)('shared/:shareToken'),
    (0, swagger_1.ApiOperation)({
        summary: '根据分享令牌获取行程',
        description: '获取分享的行程数据，包括所有Trail信息、行程项、景点等完整数据。可用于预览分享的行程。'
    }),
    (0, swagger_1.ApiParam)({ name: 'shareToken', description: '分享令牌', example: '550e8400-e29b-41d4-a716-446655440000' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功，返回完整的行程数据（包括Trail）' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '分享链接不存在或已失效' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '分享链接已过期' }),
    __param(0, (0, common_1.Param)('shareToken')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getTripByShareToken", null);
__decorate([
    (0, common_1.Post)('shared/:shareToken/import'),
    (0, swagger_1.ApiOperation)({
        summary: '导入分享的行程',
        description: '从分享链接导入行程，包括所有Trail数据，创建新的行程副本。会完整复制所有行程项、Trail关联、GPX数据等。'
    }),
    (0, swagger_1.ApiParam)({ name: 'shareToken', description: '分享令牌', example: '550e8400-e29b-41d4-a716-446655440000' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '导入成功，返回新创建的行程ID' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '分享链接不存在或已失效' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '分享链接已过期或数据验证失败' }),
    __param(0, (0, common_1.Param)('shareToken')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "importTripFromShare", null);
__decorate([
    (0, common_1.Post)(':id/emergency/sos'),
    (0, swagger_1.ApiOperation)({
        summary: '发送紧急求救信号',
        description: '在行程中遇到危险时一键发送求救信号，包含精准经纬度和行程相关背景',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
                latitude: { type: 'number', description: '纬度', example: 64.1283 },
                longitude: { type: 'number', description: '经度', example: -21.8278 },
                message: { type: 'string', description: '求救消息（可选）', example: '迷路，需要救援' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '求救信号发送成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "sendEmergencySOS", null);
__decorate([
    (0, common_1.Get)(':id/emergency/history'),
    (0, swagger_1.ApiOperation)({
        summary: '获取求救记录',
        description: '获取行程的所有求救记录',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回求救记录列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getSOSHistory", null);
__decorate([
    (0, common_1.Post)(':id/budget/constraint'),
    (0, swagger_1.ApiOperation)({
        summary: '设置行程预算约束',
        description: '为行程设置或更新预算约束（总预算、货币单位、日均预算、分类预算限制等）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功设置预算约束',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "setBudgetConstraint", null);
__decorate([
    (0, common_1.Get)(':id/budget/constraint'),
    (0, swagger_1.ApiOperation)({
        summary: '获取预算约束',
        description: '获取行程的预算约束配置。如果未设置预算约束，会从准备度接口获取 budgetLevel 并提供默认预算建议。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'userId', description: '用户 ID（可选，用于从准备度接口获取 budgetLevel）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回预算约束',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetConstraint", null);
__decorate([
    (0, common_1.Delete)(':id/budget/constraint'),
    (0, swagger_1.ApiOperation)({
        summary: '删除预算约束',
        description: '删除行程的预算约束（恢复为无预算限制）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除预算约束',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "deleteBudgetConstraint", null);
__decorate([
    (0, common_1.Get)(':id/budget/summary'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程预算摘要',
        description: '实时查看行程消费和预算情况，包含各类消费明细分类。支持时间范围和分类筛选。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', description: '开始日期（ISO 8601）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', description: '结束日期（ISO 8601）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'category', description: '分类筛选（accommodation/transportation/food/activities/other）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回预算摘要',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __param(3, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetSummary", null);
__decorate([
    (0, common_1.Get)(':id/budget/alert'),
    (0, swagger_1.ApiOperation)({
        summary: '检查预算预警',
        description: '添加新活动前检查是否会触发预算预警',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'cost', description: '新增项的成本', type: Number, required: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '返回预算预警（如果有）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('cost')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "checkBudgetAlert", null);
__decorate([
    (0, common_1.Get)(':id/budget/optimization'),
    (0, swagger_1.ApiOperation)({
        summary: '获取预算优化建议',
        description: '提供合理的预算优化建议，包括替换、移除、调整等方案',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'category', description: '消费类别（可选）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回优化建议',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetOptimization", null);
__decorate([
    (0, common_1.Get)(':id/budget/details'),
    (0, swagger_1.ApiOperation)({
        summary: '获取预算明细',
        description: '获取预算的详细支出明细（按日期、分类、项目），支持时间范围、分类筛选和分页',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', description: '开始日期（ISO 8601）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', description: '结束日期（ISO 8601）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'category', description: '分类筛选（accommodation/transportation/food/activities/other）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '分页限制（默认 50）', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: '分页偏移（默认 0）', required: false, type: Number }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回预算明细',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __param(3, (0, common_1.Query)('category')),
    __param(4, (0, common_1.Query)('limit')),
    __param(5, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetDetails", null);
__decorate([
    (0, common_1.Get)(':id/budget/trends'),
    (0, swagger_1.ApiOperation)({
        summary: '获取预算趋势',
        description: '获取预算执行趋势（每日支出趋势、分类分布趋势），支持时间范围和粒度设置',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', description: '开始日期（ISO 8601）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', description: '结束日期（ISO 8601）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'granularity', description: '粒度（daily/weekly/monthly）', required: false, enum: ['daily', 'weekly', 'monthly'] }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回预算趋势',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __param(3, (0, common_1.Query)('granularity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetTrends", null);
__decorate([
    (0, common_1.Get)(':id/budget/report'),
    (0, swagger_1.ApiOperation)({
        summary: '生成预算执行分析报告',
        description: '行程结束后生成预算执行分析报告，包含消费趋势和优化建议',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功生成预算报告',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "generateBudgetReport", null);
__decorate([
    (0, common_1.Get)(':id/budget/monitor'),
    (0, swagger_1.ApiOperation)({
        summary: '实时预算监控',
        description: '获取实时预算监控数据（当前支出、剩余预算、每日支出、预警信息）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'realtime', description: '是否启用实时推送（WebSocket，暂未实现）', required: false, type: Boolean }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回监控数据',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('realtime')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetMonitor", null);
__decorate([
    (0, common_1.Get)(':id/budget/statistics'),
    (0, swagger_1.ApiOperation)({
        summary: '预算执行统计',
        description: '获取预算执行的统计信息（完成度、超支率、分类占比、日均支出、风险等级等）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回统计信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getBudgetStatistics", null);
__decorate([
    (0, common_1.Post)(':id/adjust'),
    (0, swagger_1.ApiOperation)({
        summary: '修改行程并自动适配调整',
        description: '修改行程中的日期或活动安排，系统自动触发节奏修复机制，调整关联服务并更新预算',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程调整成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "adjustTrip", null);
__decorate([
    (0, common_1.Get)(':id/persona-alerts'),
    (0, swagger_1.ApiOperation)({
        summary: '获取三人格提醒（Persona Alerts）',
        description: '获取当前行程的三人格（Abu、Dr.Dre、Neptune）提醒列表',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回提醒列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getPersonaAlerts", null);
__decorate([
    (0, common_1.Get)(':id/decision-log'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策记录/透明日志（Decision Log）',
        description: '获取行程的决策记录，用于透明日志展示',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '返回记录数量，默认 10' }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number, description: '偏移量，默认 0' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回决策记录（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getDecisionLog", null);
__decorate([
    (0, common_1.Get)(':id/evidence/completeness'),
    (0, swagger_1.ApiOperation)({
        summary: '检查行程的证据完整性',
        description: '检查行程中所有POI的期望证据类型，识别缺失的证据，并提供补充建议（P1功能）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取完整性检查结果',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "checkEvidenceCompleteness", null);
__decorate([
    (0, common_1.Get)(':id/evidence/suggestions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取证据获取建议（智能触发）',
        description: '自动检测缺失证据并生成获取建议，支持一键批量获取（P1功能）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取建议',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getEvidenceFetchSuggestions", null);
__decorate([
    (0, common_1.Get)(':id/evidence'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程证据列表',
        description: '获取指定行程的所有证据项列表，用于 EvidenceDrawer 组件的证据标签页显示',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取证据列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, evidence_dto_1.GetEvidenceQueryDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getEvidence", null);
__decorate([
    (0, common_1.Patch)(':id/evidence/:evidenceId'),
    (0, swagger_1.ApiOperation)({
        summary: '更新单个证据项的状态和备注',
        description: '更新指定证据项的状态（已读/已解决/已忽略）和用户备注。只有OWNER和EDITOR可以修改。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'evidenceId', description: '证据项 ID' }),
    (0, swagger_1.ApiBody)({ type: evidence_dto_1.UpdateEvidenceRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新证据项',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数验证失败或状态转换不合法',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 403,
        description: '无权修改该行程的证据',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或证据项不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('evidenceId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, evidence_dto_1.UpdateEvidenceRequestDto, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateEvidence", null);
__decorate([
    (0, common_1.Put)(':id/evidence/batch-update'),
    (0, swagger_1.ApiOperation)({
        summary: '批量更新证据项的状态和备注',
        description: '批量更新多个证据项的状态和备注。最多支持100个证据项。只有OWNER和EDITOR可以修改。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({ type: evidence_dto_1.BatchUpdateEvidenceRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功批量更新证据项',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数验证失败或批量数量超限',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 403,
        description: '无权修改该行程的证据',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, evidence_dto_1.BatchUpdateEvidenceRequestDto, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "batchUpdateEvidence", null);
__decorate([
    (0, common_1.Get)(':id/tasks'),
    (0, swagger_1.ApiOperation)({
        summary: '获取今日重点任务（Today\'s Tasks）',
        description: '获取系统推荐的今日重点任务列表',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回任务列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getTasks", null);
__decorate([
    (0, common_1.Patch)(':id/tasks/:taskId'),
    (0, swagger_1.ApiOperation)({
        summary: '更新任务状态',
        description: '更新指定任务的完成状态',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiParam)({ name: 'taskId', description: '任务 ID' }),
    (0, swagger_1.ApiBody)({ type: tasks_dto_1.UpdateTaskStatusDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新任务状态（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或任务不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('taskId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, tasks_dto_1.UpdateTaskStatusDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateTaskStatus", null);
__decorate([
    (0, common_1.Get)(':id/pipeline-status'),
    (0, swagger_1.ApiOperation)({
        summary: '获取工作流 Pipeline 状态',
        description: '获取行程的工作流 Pipeline 各阶段状态',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回Pipeline状态（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getPipelineStatus", null);
__decorate([
    (0, common_1.Post)('draft'),
    (0, swagger_1.ApiOperation)({
        summary: '生成行程草案',
        description: '生成一个可预览的行程草案（不落库）。LLM 只负责选择与编排，所有行程项必须来自 place 表。',
    }),
    (0, swagger_1.ApiBody)({ type: trip_draft_dto_1.CreateTripDraftDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程草案生成成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [trip_draft_dto_1.CreateTripDraftDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "createDraft", null);
__decorate([
    (0, common_1.Post)(':tripId/items/:itemId/replace'),
    (0, swagger_1.ApiOperation)({
        summary: '替换单个行程项',
        description: 'Neptune 修复机制：替换单个行程项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'itemId', description: '行程项 ID' }),
    (0, swagger_1.ApiBody)({ type: trip_draft_dto_1.ReplaceItineraryItemDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '替换成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('itemId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, trip_draft_dto_1.ReplaceItineraryItemDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "replaceItem", null);
__decorate([
    (0, common_1.Post)(':tripId/regenerate'),
    (0, swagger_1.ApiOperation)({
        summary: '全局重生成行程',
        description: '重生成整个行程，但保持用户已锁定的项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({ type: trip_draft_dto_1.RegenerateTripDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '重生成成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trip_draft_dto_1.RegenerateTripDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "regenerateTrip", null);
__decorate([
    (0, common_1.Get)(':id/days/:dayId/metrics'),
    (0, swagger_1.ApiOperation)({
        summary: '获取每日行程指标',
        description: '获取指定日期的行程指标，包括步行距离、车程、缓冲时间、疲劳指数等',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiParam)({ name: 'dayId', description: '日期 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回每日指标（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或日期不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('dayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getDayMetrics", null);
__decorate([
    (0, common_1.Get)(':id/metrics'),
    (0, swagger_1.ApiOperation)({
        summary: '批量获取多日指标',
        description: '获取行程的多日指标，支持按日期过滤',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'dates', description: '日期数组（可选）', type: [String], required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回指标（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('dates')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getTripMetrics", null);
__decorate([
    (0, common_1.Get)(':id/conflicts'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程冲突列表',
        description: '获取行程的冲突列表，包括时间冲突、午餐时间窗、疲劳超标等',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'date', description: '指定日期（可选）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'severity', description: '过滤严重程度（可选）', enum: trip_conflicts_dto_1.ConflictSeverity, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回冲突列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('date')),
    __param(2, (0, common_1.Query)('severity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getConflicts", null);
__decorate([
    (0, common_1.Put)(':id/intent'),
    (0, swagger_1.ApiOperation)({
        summary: '更新行程意图与约束',
        description: '更新行程的意图与约束，包括节奏配置、偏好设置、约束条件、规划策略等',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({ type: trip_intent_dto_1.UpdateIntentRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新意图（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trip_intent_dto_1.UpdateIntentRequestDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "updateIntent", null);
__decorate([
    (0, common_1.Get)(':id/intent'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程意图与约束',
        description: '获取行程的意图与约束配置',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回意图（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getIntent", null);
__decorate([
    (0, common_1.Post)(':id/apply-optimization'),
    (0, swagger_1.ApiOperation)({
        summary: '应用优化结果到行程',
        description: '将优化结果应用到实际行程，支持预览模式',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({ type: trip_optimization_dto_1.ApplyOptimizationRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功应用优化结果（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trip_optimization_dto_1.ApplyOptimizationRequestDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "applyOptimization", null);
__decorate([
    (0, common_1.Get)(':id/items/:itemId/detail'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程项详细信息',
        description: '获取行程项的详细信息，包括完整的 Place metadata 和 physicalMetadata',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiParam)({ name: 'itemId', description: '行程项 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回详细信息（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或行程项不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getItemDetail", null);
__decorate([
    (0, common_1.Post)(':id/items/batch-update'),
    (0, swagger_1.ApiOperation)({
        summary: '批量更新行程项',
        description: '批量更新多个行程项的时间、地点等信息',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiBody)({ type: trip_items_dto_1.BatchUpdateItemsRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功批量更新（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, trip_items_dto_1.BatchUpdateItemsRequestDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "batchUpdateItems", null);
__decorate([
    (0, common_1.Get)(':id/suggestions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取建议列表',
        description: '获取指定行程的建议列表，支持多种过滤条件。整合了三人格（Abu/Dr.Dre/Neptune）的输出和冲突检测结果。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiQuery)({ name: 'persona', description: '过滤人格类型', enum: suggestions_dto_1.SuggestionPersona, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'scope', description: '过滤作用范围', enum: suggestions_dto_1.SuggestionScope, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'scopeId', description: '过滤作用范围ID', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'severity', description: '过滤严重级别', enum: suggestions_dto_1.SuggestionSeverity, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'status', description: '过滤状态', enum: suggestions_dto_1.SuggestionStatus, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制', type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: '偏移量', type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回建议列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('persona')),
    __param(2, (0, common_1.Query)('scope')),
    __param(3, (0, common_1.Query)('scopeId')),
    __param(4, (0, common_1.Query)('severity')),
    __param(5, (0, common_1.Query)('status')),
    __param(6, (0, common_1.Query)('limit')),
    __param(7, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getSuggestions", null);
__decorate([
    (0, common_1.Get)(':id/suggestions/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取建议统计',
        description: '获取建议的统计数据，用于角标显示和汇总。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回建议统计（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "getSuggestionStats", null);
__decorate([
    (0, common_1.Post)(':id/suggestions/:suggestionId/apply'),
    (0, swagger_1.ApiOperation)({
        summary: '应用建议',
        description: '应用一个建议，执行对应的操作（如应用替代路线、调整节奏等）。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiParam)({ name: 'suggestionId', description: '建议 ID' }),
    (0, swagger_1.ApiBody)({ type: suggestions_dto_1.ApplySuggestionRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功应用建议（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或建议不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('suggestionId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, suggestions_dto_1.ApplySuggestionRequestDto]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "applySuggestion", null);
__decorate([
    (0, common_1.Post)(':id/suggestions/:suggestionId/dismiss'),
    (0, swagger_1.ApiOperation)({
        summary: '忽略建议',
        description: '忽略一个建议，标记为已忽略状态。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)' }),
    (0, swagger_1.ApiParam)({ name: 'suggestionId', description: '建议 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功忽略建议（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或建议不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('suggestionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "dismissSuggestion", null);
exports.TripsController = TripsController = TripsController_1 = __decorate([
    (0, swagger_1.ApiTags)('trips'),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('trips'),
    __param(19, (0, common_3.Optional)()),
    __param(20, (0, common_3.Optional)()),
    __param(21, (0, common_3.Inject)(skills_registry_token_1.SKILLS_REGISTRY_TOKEN)),
    __param(21, (0, common_3.Optional)()),
    __param(22, (0, common_3.Optional)()),
    __param(23, (0, common_3.Optional)()),
    __param(24, (0, common_3.Optional)()),
    __param(25, (0, common_3.Optional)()),
    __param(26, (0, common_3.Optional)()),
    __metadata("design:paramtypes", [trips_service_1.TripsService,
        trip_extended_service_1.TripExtendedService,
        trip_recap_service_1.TripRecapService,
        trip_emergency_service_1.TripEmergencyService,
        trip_budget_service_1.TripBudgetService,
        trip_adjustment_service_1.TripAdjustmentService,
        trip_draft_service_1.TripDraftService,
        llm_service_1.LlmService,
        llm_response_transformer_service_1.LlmResponseTransformerService,
        trip_metrics_service_1.TripMetricsService,
        trip_conflicts_service_1.TripConflictsService,
        trip_intent_service_1.TripIntentService,
        trip_optimization_service_1.TripOptimizationService,
        trip_suggestions_service_1.TripSuggestionsService,
        trip_insight_service_1.TripInsightService,
        nl_conversation_context_service_1.NLConversationContextService,
        prisma_service_1.PrismaService,
        token_service_1.TokenService,
        jwt_1.JwtService,
        hotel_recommendation_service_1.HotelRecommendationService,
        context_engineer_service_1.ContextEngineerService,
        skills_registry_service_1.SkillsRegistryService,
        decision_draft_generator_service_1.DecisionDraftGeneratorService,
        decision_draft_storage_service_1.DecisionDraftStorageService,
        destination_clarification_config_service_1.DestinationClarificationConfigService,
        gate_precheck_service_1.GatePrecheckService,
        ai_decision_logic_service_1.AiDecisionLogicService])
], TripsController);
//# sourceMappingURL=trips.controller.js.map