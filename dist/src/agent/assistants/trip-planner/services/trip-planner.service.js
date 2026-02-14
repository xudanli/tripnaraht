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
var TripPlannerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripPlannerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../../prisma/prisma.service");
const llm_service_1 = require("../../../../llm/services/llm.service");
const state_store_service_1 = require("../../../infra/state-store.service");
const claude_orchestrator_service_1 = require("../../../services/claude-orchestrator.service");
const gatekeeper_agent_service_1 = require("../../../services/sub-agents/gatekeeper-agent.service");
const narrator_agent_service_1 = require("../../../services/sub-agents/narrator-agent.service");
const crypto_1 = require("crypto");
const rxjs_1 = require("rxjs");
const trip_planner_interface_1 = require("../interfaces/trip-planner.interface");
const intent_uncertainty_interface_1 = require("../interfaces/intent-uncertainty.interface");
const context_analyzer_service_1 = require("./context-analyzer.service");
const intent_disambiguator_service_1 = require("./intent-disambiguator.service");
const route_optimization_service_1 = require("./route-optimization.service");
const enhanced_chat_service_1 = require("../../../../rag/services/enhanced-chat.service");
const rag_service_1 = require("../../../../rag/services/rag.service");
const hybrid_cache_service_1 = require("../../../../rag/services/hybrid-cache.service");
const prompt_service_1 = require("./prompt.service");
const telemetry_service_1 = require("../../../infra/telemetry.service");
const gap_preferences_service_1 = require("./gap-preferences.service");
let TripPlannerService = TripPlannerService_1 = class TripPlannerService {
    constructor(prisma, llmService, stateStore, orchestrator, gatekeeperAgent, narratorAgent, contextAnalyzer, intentDisambiguator, routeOptimization, enhancedChat, ragService, cacheService, promptService, telemetryService, gapPreferencesService) {
        this.prisma = prisma;
        this.llmService = llmService;
        this.stateStore = stateStore;
        this.orchestrator = orchestrator;
        this.gatekeeperAgent = gatekeeperAgent;
        this.narratorAgent = narratorAgent;
        this.contextAnalyzer = contextAnalyzer;
        this.intentDisambiguator = intentDisambiguator;
        this.routeOptimization = routeOptimization;
        this.enhancedChat = enhancedChat;
        this.ragService = ragService;
        this.cacheService = cacheService;
        this.promptService = promptService;
        this.telemetryService = telemetryService;
        this.gapPreferencesService = gapPreferencesService;
        this.logger = new common_1.Logger(TripPlannerService_1.name);
        this.sessionCache = new Map();
        this.SESSION_TTL_MS = 2 * 60 * 60 * 1000;
        this.COMPLEXITY_CONFIG = {
            threshold: 5,
            weights: {
                tripScale: {
                    daysCount: 1,
                    itemsCount: 0.3,
                    citiesCount: 2,
                },
                taskType: {
                    OPTIMIZE_ROUTE: 3,
                    REBALANCE_DAYS: 4,
                    REPLACE_POI: 2,
                    ADJUST_PACE: 2,
                    PLAN_TRANSPORT: 2,
                    ADD_ACTIVITY: 1,
                    ARRANGE_MEALS: 1,
                    FILL_FREE_TIME: 1,
                    ASK_QUESTION: 0,
                    GET_SUGGESTION: 0,
                    CHECK_FEASIBILITY: 2,
                    COMPARE_OPTIONS: 2,
                    CREATE_CHECKLIST: 0,
                    EXPORT_ITINERARY: 0,
                    SHOW_OVERVIEW: 0,
                    UNDO_CHANGE: 0,
                    GENERAL_CHAT: 0,
                },
                specialFactors: {
                    hasChildren: 1,
                    hasElderly: 1,
                    multipleIntents: 2,
                    crossDayChange: 2,
                    budgetSensitive: 1,
                },
            },
        };
        this.GUARDIAN_CONFIG = {
            enabled: true,
            abu: {
                checkOpeningHours: true,
                checkSafetyWarnings: true,
                checkAccessibility: true,
                severityThreshold: 'warning',
            },
            drDre: {
                maxDailySteps: 15000,
                maxDailyActivities: 6,
                fatigueThreshold: 70,
                maxConsecutiveIntenseDays: 2,
            },
            neptune: {
                replacementKeywords: ['换一个', '换个', '不去了', '改成', '替代', '其他选择'],
                checkAvailability: true,
                proactiveAlternatives: true,
            },
            allGuardians: {
                keywords: ['检查一下', '帮我看看有没有问题', '可行吗', '这样安排合理吗'],
                intents: ['CHECK_FEASIBILITY', 'REBALANCE_DAYS'],
            },
        };
        this.CITY_COORDINATES = {
            '北京': { lat: 39.9042, lng: 116.4074 },
            '上海': { lat: 31.2304, lng: 121.4737 },
            '广州': { lat: 23.1291, lng: 113.2644 },
            '深圳': { lat: 22.5431, lng: 114.0579 },
            '杭州': { lat: 30.2741, lng: 120.1551 },
            '南京': { lat: 32.0603, lng: 118.7969 },
            '苏州': { lat: 31.2989, lng: 120.5853 },
            '成都': { lat: 30.5728, lng: 104.0668 },
            '重庆': { lat: 29.4316, lng: 106.9123 },
            '武汉': { lat: 30.5928, lng: 114.3055 },
            '西安': { lat: 34.3416, lng: 108.9398 },
            '天津': { lat: 39.3434, lng: 117.3616 },
            '厦门': { lat: 24.4798, lng: 118.0894 },
            '青岛': { lat: 36.0671, lng: 120.3826 },
            '大连': { lat: 38.9140, lng: 121.6147 },
            '宁波': { lat: 29.8683, lng: 121.5440 },
            '无锡': { lat: 31.4912, lng: 120.3119 },
            '东京': { lat: 35.6762, lng: 139.6503 },
            '大阪': { lat: 34.6937, lng: 135.5023 },
            '京都': { lat: 35.0116, lng: 135.7681 },
            '巴黎': { lat: 48.8566, lng: 2.3522 },
            '伦敦': { lat: 51.5074, lng: -0.1278 },
            '纽约': { lat: 40.7128, lng: -74.0060 },
        };
        this.logger.log('🚀 行程规划智能助手已初始化 (V2 增强版 + 路线优化 + RAG降级)');
        this.logger.debug(`服务注入状态: StateStore=${!!stateStore}, Orchestrator=${!!orchestrator}, ContextAnalyzer=${!!contextAnalyzer}, RouteOptimization=${!!routeOptimization}, EnhancedChat=${!!enhancedChat}, RagService=${!!ragService}`);
    }
    async chat(request) {
        var _a, _b, _c;
        const startTime = Date.now();
        this.logger.debug(`[规划助手] 收到消息: tripId=${request.tripId}, message=${request.message.substring(0, 50)}...`);
        try {
            const buttonAction = this.detectButtonClick(request.message);
            if (buttonAction) {
                this.logger.debug(`[规划助手] 检测到按钮点击: ${buttonAction.action}`);
                return await this.handleButtonAction(request, buttonAction);
            }
            const state = await this.loadOrCreateSession(request);
            if ((_a = request.clarificationData) === null || _a === void 0 ? void 0 : _a.selectedAction) {
                this.logger.debug(`[规划助手] 处理澄清选择: ${request.clarificationData.selectedAction}`);
                return await this.handleClarificationSelection(state, request);
            }
            this.addMessage(state, {
                id: (0, crypto_1.randomUUID)(),
                role: 'user',
                content: request.message,
                timestamp: new Date().toISOString(),
            });
            const intent = await this.analyzeIntent(request.message, state);
            this.logger.debug(`[规划助手] 意图分析: ${intent}`);
            if (this.intentDisambiguator && request.message !== '__START_SESSION__') {
                const disambiguation = await this.intentDisambiguator.disambiguate(request.message, intent, state);
                if (disambiguation.uncertainty !== intent_uncertainty_interface_1.IntentUncertainty.CLEAR && disambiguation.clarificationNeeded) {
                    this.logger.debug(`[规划助手] 需要澄清: ${disambiguation.uncertainty}`);
                    let clarificationResponse = await this.createClarificationResponse(state, disambiguation);
                    const guardianResult = await this.evaluateWithGuardians(state, intent, request.message);
                    if (guardianResult.guardiansInvoked.length > 0) {
                        this.logger.debug(`[三人格] 澄清阶段触发: ${guardianResult.guardiansInvoked.join(', ')}, 洞察数: ${guardianResult.insights.length}`);
                        clarificationResponse = this.enrichResponseWithGuardians(clarificationResponse, guardianResult);
                    }
                    this.addMessage(state, {
                        id: (0, crypto_1.randomUUID)(),
                        role: 'assistant',
                        content: clarificationResponse.message,
                        intent,
                        quickActions: clarificationResponse.quickActions,
                        timestamp: new Date().toISOString(),
                    });
                    state.updatedAt = new Date().toISOString();
                    await this.saveSession(state);
                    return clarificationResponse;
                }
                if (((_b = disambiguation.contextDiscovery) === null || _b === void 0 ? void 0 : _b.foundGap) && disambiguation.contextDiscovery.shouldPrompt) {
                    this.logger.debug(`[规划助手] 发现缺口: ${(_c = disambiguation.contextDiscovery.gap) === null || _c === void 0 ? void 0 : _c.description}`);
                    state.pendingChanges = state.pendingChanges || [];
                    state._contextDiscovery = disambiguation.contextDiscovery;
                }
            }
            let response;
            switch (intent) {
                case 'OPTIMIZE_ROUTE':
                    response = await this.handleOptimizeRoute(state, request);
                    break;
                case 'REPLACE_POI':
                    response = await this.handleReplacePoi(state, request);
                    break;
                case 'ADJUST_PACE':
                    response = await this.handleAdjustPace(state, request);
                    break;
                case 'REBALANCE_DAYS':
                    response = await this.handleRebalanceDays(state, request);
                    break;
                case 'ADD_ACTIVITY':
                    response = await this.handleAddActivity(state, request);
                    break;
                case 'ARRANGE_MEALS':
                    response = await this.handleArrangeMeals(state, request);
                    break;
                case 'PLAN_TRANSPORT':
                    response = await this.handlePlanTransport(state, request);
                    break;
                case 'FILL_FREE_TIME':
                    response = await this.handleFillFreeTime(state, request);
                    break;
                case 'ASK_QUESTION':
                    response = await this.handleAskQuestion(state, request);
                    break;
                case 'GET_SUGGESTION':
                    response = await this.handleGetSuggestion(state, request);
                    break;
                case 'CHECK_FEASIBILITY':
                    response = await this.handleCheckFeasibility(state, request);
                    break;
                case 'COMPARE_OPTIONS':
                    response = await this.handleCompareOptions(state, request);
                    break;
                case 'CREATE_CHECKLIST':
                    response = await this.handleCreateChecklist(state, request);
                    break;
                case 'EXPORT_ITINERARY':
                    response = await this.handleExportItinerary(state, request);
                    break;
                case 'SHOW_OVERVIEW':
                    response = await this.handleShowOverview(state, request);
                    break;
                case 'UNDO_CHANGE':
                    response = await this.handleUndoChange(state, request);
                    break;
                default:
                    response = await this.handleGeneralChat(state, request);
            }
            if (request.message !== '__START_SESSION__') {
                const guardianResult = await this.evaluateWithGuardians(state, intent, request.message);
                if (guardianResult.guardiansInvoked.length > 0) {
                    this.logger.debug(`[三人格] 触发: ${guardianResult.guardiansInvoked.join(', ')}, 洞察数: ${guardianResult.insights.length}`);
                    this.trackGuardianInvoked(state.sessionId, state.tripId, request.userId, guardianResult.guardiansInvoked, this.determineTriggerReason(intent, request.message), intent, request.message);
                    response = this.enrichResponseWithGuardians(response, guardianResult);
                    for (const insight of guardianResult.insights) {
                        this.trackInsightShown(state.sessionId, state.tripId, request.userId, insight);
                    }
                }
            }
            this.addMessage(state, {
                id: (0, crypto_1.randomUUID)(),
                role: 'assistant',
                content: response.message,
                intent,
                quickActions: response.quickActions,
                timestamp: new Date().toISOString(),
            });
            state.phase = response.phase;
            state.updatedAt = new Date().toISOString();
            await this.saveSession(state);
            this.logger.debug(`[规划助手] 处理完成: 耗时=${Date.now() - startTime}ms, phase=${response.phase}`);
            return response;
        }
        catch (error) {
            this.logger.error(`[规划助手] 处理失败: ${error.message}`, error.stack);
            return this.createErrorResponse(error.message);
        }
    }
    async startSession(tripId, userId) {
        return this.chat({
            tripId,
            userId,
            message: '__START_SESSION__',
        });
    }
    chatStream(request) {
        const subject = new rxjs_1.Subject();
        this.processChatStream(request, subject).catch(error => {
            subject.next({
                type: 'error',
                data: { error: error.message },
            });
            subject.complete();
        });
        return subject.asObservable();
    }
    async processChatStream(request, subject) {
        const state = await this.loadOrCreateSession(request);
        const intentResult = await this.analyzeIntentMultiple(request.message, state);
        if (intentResult.primary === 'ASK_QUESTION') {
            await this.processAskQuestionStream(request, state, subject);
            return;
        }
        subject.next({
            type: 'thinking',
            data: { content: '正在分析您的需求...', progress: 10 },
        });
        subject.next({
            type: 'thinking',
            data: { content: '理解您的意图...', progress: 30 },
        });
        subject.next({
            type: 'thinking',
            data: { content: '正在为您处理...', progress: 50 },
        });
        const response = await this.processIntent(intentResult.primary, state, request);
        subject.next({
            type: 'content',
            data: {
                content: response.message,
                phase: response.phase,
                progress: 90,
            },
        });
        subject.next({
            type: 'done',
            data: {
                quickActions: response.quickActions,
                progress: 100,
            },
        });
        subject.complete();
    }
    async analyzeIntent(message, state) {
        const result = await this.analyzeIntentMultiple(message, state);
        return result.primary;
    }
    async analyzeIntentMultiple(message, state) {
        if (message === '__START_SESSION__') {
            return { primary: 'SHOW_OVERVIEW', secondary: [], confidence: 1.0, entities: {} };
        }
        const keywordIntents = this.matchKeywordIntents(message);
        if (keywordIntents.length === 1) {
            return {
                primary: keywordIntents[0],
                secondary: [],
                confidence: 0.9,
                entities: this.extractEntities(message),
            };
        }
        if (this.llmService) {
            try {
                return await this.analyzeIntentWithLLM(message, state);
            }
            catch (error) {
                this.logger.warn(`LLM 意图分析失败，使用关键词匹配结果: ${error}`);
            }
        }
        return {
            primary: keywordIntents[0] || 'GENERAL_CHAT',
            secondary: keywordIntents.slice(1),
            confidence: 0.6,
            entities: this.extractEntities(message),
        };
    }
    matchKeywordIntents(message) {
        const intents = [];
        if (/优化|调整顺序|重新排|路线/.test(message))
            intents.push('OPTIMIZE_ROUTE');
        if (/换|替换|不想去|改成/.test(message))
            intents.push('REPLACE_POI');
        if (/太赶|太紧|太松|节奏|放慢|加快/.test(message))
            intents.push('ADJUST_PACE');
        if (/重新分配|平衡|均衡/.test(message))
            intents.push('REBALANCE_DAYS');
        if (/添加|加上|增加|想去/.test(message))
            intents.push('ADD_ACTIVITY');
        if (/吃|餐厅|美食|饭|当地.*美食/.test(message))
            intents.push('ARRANGE_MEALS');
        if (/租车|car.*rent|rental|租.*车|自驾|开车|驾驶/.test(message)) {
            intents.push('ASK_QUESTION');
        }
        else if (/交通|怎么去|地铁|打车|公交/.test(message)) {
            intents.push('PLAN_TRANSPORT');
        }
        if (/空闲|没安排|还能|还有时间|填充/.test(message))
            intents.push('FILL_FREE_TIME');
        if (/极光|aurora|北极光/.test(message))
            intents.push('GET_SUGGESTION');
        if (/海滩|海岛|沙滩|beach/.test(message))
            intents.push('GET_SUGGESTION');
        if (/博物馆|艺术馆|museum/.test(message))
            intents.push('GET_SUGGESTION');
        if (/潜水|浮潜|水上活动/.test(message))
            intents.push('GET_SUGGESTION');
        if (/当地特色|本地体验|local/.test(message))
            intents.push('GET_SUGGESTION');
        if (/修复|问题|分析.*问题/.test(message))
            intents.push('OPTIMIZE_ROUTE');
        if (/可行|来得及|够不够|会不会/.test(message))
            intents.push('CHECK_FEASIBILITY');
        if (/对比|比较|哪个好/.test(message))
            intents.push('COMPARE_OPTIONS');
        if (/建议|推荐|应该|景点|地点/.test(message))
            intents.push('GET_SUGGESTION');
        const questionKeywords = [
            '什么', '怎么', '如何', '为什么', '是否', '需要', '可以', '能否',
            '多少', '多久', '哪里', '哪个', '哪些', '什么时候', '怎么办',
            '保险', '签证', '天气', '费用', '价格', '预算', '时间', '路线',
            '?', '？', '吗', '呢', '呢？'
        ];
        if (questionKeywords.some(k => message.includes(k)) && intents.length === 0) {
            intents.push('ASK_QUESTION');
        }
        if (/清单|准备|要带/.test(message))
            intents.push('CREATE_CHECKLIST');
        if (/导出|下载|分享/.test(message))
            intents.push('EXPORT_ITINERARY');
        if (/概览|整体|看看行程/.test(message))
            intents.push('SHOW_OVERVIEW');
        if (/撤销|取消|恢复/.test(message))
            intents.push('UNDO_CHANGE');
        return intents;
    }
    detectButtonClick(message) {
        const buttonMappings = {
            '⏰ 自动调整凌晨活动': 'FIX_NIGHT_ACTIVITIES',
            '自动调整凌晨活动': 'FIX_NIGHT_ACTIVITIES',
            '✅ 应用优化': 'APPLY_OPTIMIZATION',
            '应用优化': 'APPLY_OPTIMIZATION',
            '✅ 保持原样': 'APPLY_OPTIMIZATION',
            '保持原样': 'APPLY_OPTIMIZATION',
            '🔄 换个方案': 'OPTIMIZE_ROUTE',
            '换个方案': 'OPTIMIZE_ROUTE',
            '❌ 不需要': 'CANCEL',
            '不需要': 'CANCEL',
            '🔧 修复问题': 'FIX_ISSUES',
            '修复问题': 'FIX_ISSUES',
            '🔧 自动修复问题': 'AUTO_FIX',
            '自动修复问题': 'AUTO_FIX',
            '✨ 智能填充行程': 'FILL_FREE_TIME',
            '智能填充行程': 'FILL_FREE_TIME',
            '🌌 极光观测点': 'FIND_AURORA_SPOTS',
            '极光观测点': 'FIND_AURORA_SPOTS',
            '🍣 美食探店': 'FIND_LOCAL_FOOD',
            '美食探店': 'FIND_LOCAL_FOOD',
            '🏝️ 海岛推荐': 'FIND_BEACHES',
            '海岛推荐': 'FIND_BEACHES',
            '🏛️ 博物馆推荐': 'FIND_MUSEUMS',
            '博物馆推荐': 'FIND_MUSEUMS',
            '🤿 水上活动': 'FIND_WATER_ACTIVITIES',
            '水上活动': 'FIND_WATER_ACTIVITIES',
            '🎯 当地特色': 'FIND_LOCAL_ATTRACTIONS',
            '当地特色': 'FIND_LOCAL_ATTRACTIONS',
            '📍 优化行程路线': 'OPTIMIZE_ROUTE',
            '优化行程路线': 'OPTIMIZE_ROUTE',
            '🍜 推荐餐厅': 'ARRANGE_MEALS',
            '推荐餐厅': 'ARRANGE_MEALS',
            '❓ 问问题': 'ASK_QUESTION',
            '问问题': 'ASK_QUESTION',
            '✅ 行前清单': 'CREATE_CHECKLIST',
            '行前清单': 'CREATE_CHECKLIST',
            '🚗 规划交通': 'PLAN_TRANSPORT',
            '规划交通': 'PLAN_TRANSPORT',
        };
        const trimmedMessage = message.trim();
        const action = buttonMappings[trimmedMessage];
        if (action) {
            return { action, label: trimmedMessage };
        }
        return null;
    }
    async handleButtonAction(request, buttonAction) {
        const { action } = buttonAction;
        if (action === 'FIX_NIGHT_ACTIVITIES') {
            return await this.fixNightActivities({
                tripId: request.tripId,
                sessionId: request.sessionId || '',
                userId: request.userId,
            });
        }
        if (action === 'CANCEL') {
            return {
                sessionId: request.sessionId || '',
                message: '好的，已取消当前操作。有什么其他需要我帮您的吗？',
                phase: 'OVERVIEW',
                intent: 'GENERAL_CHAT',
            };
        }
        const actionMessages = {
            OPTIMIZE_ROUTE: '帮我优化行程路线',
            ARRANGE_MEALS: '帮我推荐餐厅',
            CREATE_CHECKLIST: '生成行前清单',
            PLAN_TRANSPORT: '帮我规划交通',
            FILL_FREE_TIME: '帮我填充空闲时间，推荐一些适合的活动',
            FIX_ISSUES: '帮我分析并修复行程中的问题',
            FIND_AURORA_SPOTS: '推荐适合观测极光的地点和时间',
            FIND_LOCAL_FOOD: '推荐当地特色美食和餐厅',
            FIND_BEACHES: '推荐适合游玩的海滩和海岛',
            FIND_MUSEUMS: '推荐值得参观的博物馆和艺术馆',
            FIND_WATER_ACTIVITIES: '推荐潜水、浮潜等水上活动',
            FIND_LOCAL_ATTRACTIONS: '推荐当地特色景点和体验',
            AUTO_FIX: '自动修复行程中的问题',
            APPLY_OPTIMIZATION: '应用当前的优化建议',
            ASK_QUESTION: '我有问题想问',
        };
        const convertedMessage = actionMessages[action] || `执行操作: ${action}`;
        return await this.chat({
            ...request,
            message: convertedMessage,
        });
    }
    extractEntities(message) {
        const entities = {};
        const dayMatch = message.match(/第(\d+)天/);
        if (dayMatch) {
            entities.dayNumber = parseInt(dayMatch[1], 10);
        }
        if (/早餐|早饭/.test(message))
            entities.mealType = 'breakfast';
        if (/午餐|午饭|中饭/.test(message))
            entities.mealType = 'lunch';
        if (/晚餐|晚饭/.test(message))
            entities.mealType = 'dinner';
        return entities;
    }
    async analyzeIntentWithLLM(message, state) {
        const startTime = Date.now();
        let prompt;
        if (this.promptService) {
            try {
                prompt = await this.promptService.renderPrompt('intent_analysis', {
                    message,
                    destination: state.tripContext.destinationName || state.tripContext.destination,
                    durationDays: state.tripContext.durationDays,
                    phase: state.phase,
                }, 'v1.0');
                this.logger.debug(`[Prompt优化] 使用PromptService加载意图分析Prompt，耗时: ${Date.now() - startTime}ms`);
            }
            catch (error) {
                this.logger.warn(`[Prompt优化] PromptService加载失败，使用默认Prompt: ${error}`);
                prompt = `你是一个行程规划助手。分析用户的消息，识别所有意图。

用户消息: "${message}"

当前行程上下文:
- 目的地: ${state.tripContext.destinationName || state.tripContext.destination}
- 天数: ${state.tripContext.durationDays}天
- 当前阶段: ${state.phase}

可能的意图类型:
- OPTIMIZE_ROUTE: 优化路线顺序
- REPLACE_POI: 替换某个景点
- ADJUST_PACE: 调整节奏（太紧/太松）
- REBALANCE_DAYS: 重新平衡各天安排
- ADD_ACTIVITY: 添加活动
- ARRANGE_MEALS: 安排餐厅
- PLAN_TRANSPORT: 规划交通
- FILL_FREE_TIME: 填充空闲时间
- ASK_QUESTION: 问问题
- GET_SUGGESTION: 获取建议
- CHECK_FEASIBILITY: 检查可行性
- COMPARE_OPTIONS: 对比选项
- CREATE_CHECKLIST: 创建行前清单
- EXPORT_ITINERARY: 导出行程
- SHOW_OVERVIEW: 显示行程概览
- UNDO_CHANGE: 撤销修改
- GENERAL_CHAT: 通用对话

返回 JSON 格式:
{
  "primary": "主要意图",
  "secondary": ["次要意图1", "次要意图2"],
  "confidence": 0.9,
  "entities": {
    "dayNumber": 2,
    "poiName": "景点名",
    "mealType": "lunch"
  }
}`;
            }
        }
        else {
            prompt = `你是一个行程规划助手。分析用户的消息，识别所有意图。

用户消息: "${message}"

当前行程上下文:
- 目的地: ${state.tripContext.destinationName || state.tripContext.destination}
- 天数: ${state.tripContext.durationDays}天
- 当前阶段: ${state.phase}

可能的意图类型:
- OPTIMIZE_ROUTE: 优化路线顺序
- REPLACE_POI: 替换某个景点
- ADJUST_PACE: 调整节奏（太紧/太松）
- REBALANCE_DAYS: 重新平衡各天安排
- ADD_ACTIVITY: 添加活动
- ARRANGE_MEALS: 安排餐厅
- PLAN_TRANSPORT: 规划交通
- FILL_FREE_TIME: 填充空闲时间
- ASK_QUESTION: 问问题
- GET_SUGGESTION: 获取建议
- CHECK_FEASIBILITY: 检查可行性
- COMPARE_OPTIONS: 对比选项
- CREATE_CHECKLIST: 创建行前清单
- EXPORT_ITINERARY: 导出行程
- SHOW_OVERVIEW: 显示行程概览
- UNDO_CHANGE: 撤销修改
- GENERAL_CHAT: 通用对话

返回 JSON 格式:
{
  "primary": "主要意图",
  "secondary": ["次要意图1", "次要意图2"],
  "confidence": 0.9,
  "entities": {
    "dayNumber": 2,
    "poiName": "景点名",
    "mealType": "lunch"
  }
}`;
        }
        const llmStartTime = Date.now();
        const response = await this.llmService.humanizeResult({
            dataType: 'multi_intent_analysis',
            data: { prompt },
        });
        const llmLatency = Date.now() - llmStartTime;
        this.logger.debug(`[Prompt优化] LLM调用耗时: ${llmLatency}ms, Prompt长度: ${prompt.length}字符`);
        try {
            const cleaned = response.replace(/```json\s*|\s*```/g, '').trim();
            const result = JSON.parse(cleaned);
            const validIntents = [
                'OPTIMIZE_ROUTE', 'REPLACE_POI', 'ADJUST_PACE', 'REBALANCE_DAYS',
                'ADD_ACTIVITY', 'ARRANGE_MEALS', 'PLAN_TRANSPORT', 'FILL_FREE_TIME',
                'ASK_QUESTION', 'GET_SUGGESTION', 'CHECK_FEASIBILITY', 'COMPARE_OPTIONS',
                'CREATE_CHECKLIST', 'EXPORT_ITINERARY', 'SHOW_OVERVIEW', 'UNDO_CHANGE',
                'GENERAL_CHAT',
            ];
            const primary = validIntents.includes(result.primary) ? result.primary : 'GENERAL_CHAT';
            const secondary = (result.secondary || []).filter((i) => validIntents.includes(i));
            return {
                primary,
                secondary,
                confidence: result.confidence || 0.8,
                entities: result.entities || {},
            };
        }
        catch (e) {
            const intentMatch = response.match(/primary["\s:]+([A-Z_]+)/i);
            const intent = intentMatch ? intentMatch[1].toUpperCase() : 'GENERAL_CHAT';
            return {
                primary: intent,
                secondary: [],
                confidence: 0.5,
                entities: {},
            };
        }
    }
    evaluateTaskComplexity(intent, state, request, intentResult) {
        var _a;
        const ctx = state.tripContext;
        const config = this.COMPLEXITY_CONFIG;
        const breakdown = {};
        const reasons = [];
        const daysScore = ctx.durationDays * config.weights.tripScale.daysCount;
        breakdown['daysCount'] = daysScore;
        if (ctx.durationDays > 5) {
            reasons.push(`行程较长 (${ctx.durationDays}天)`);
        }
        const totalItems = ctx.days.reduce((sum, d) => sum + d.stats.itemCount, 0);
        const itemsScore = totalItems * config.weights.tripScale.itemsCount;
        breakdown['itemsCount'] = itemsScore;
        if (totalItems > 15) {
            reasons.push(`活动较多 (${totalItems}个)`);
        }
        const cities = new Set(ctx.days.map(d => d.city).filter(Boolean));
        const citiesScore = cities.size * config.weights.tripScale.citiesCount;
        breakdown['citiesCount'] = citiesScore;
        if (cities.size > 2) {
            reasons.push(`多城市 (${cities.size}个)`);
        }
        const taskScore = config.weights.taskType[intent] || 0;
        breakdown['taskType'] = taskScore;
        if (taskScore >= 3) {
            reasons.push(`任务类型复杂 (${intent})`);
        }
        let specialScore = 0;
        if (ctx.travelers.children > 0) {
            specialScore += config.weights.specialFactors.hasChildren;
            reasons.push('有儿童同行');
        }
        if (ctx.travelers.elderly > 0) {
            specialScore += config.weights.specialFactors.hasElderly;
            reasons.push('有老人同行');
        }
        if (intentResult && intentResult.secondary.length > 0) {
            specialScore += config.weights.specialFactors.multipleIntents;
            reasons.push(`多意图 (${intentResult.secondary.length + 1}个)`);
        }
        const targetDay = (_a = intentResult === null || intentResult === void 0 ? void 0 : intentResult.entities) === null || _a === void 0 ? void 0 : _a.dayNumber;
        if (targetDay && ['REBALANCE_DAYS', 'OPTIMIZE_ROUTE'].includes(intent)) {
            specialScore += config.weights.specialFactors.crossDayChange;
            reasons.push('涉及跨天调整');
        }
        if (request.message.includes('预算') || request.message.includes('省钱') || request.message.includes('便宜')) {
            specialScore += config.weights.specialFactors.budgetSensitive;
            reasons.push('预算敏感');
        }
        breakdown['specialFactors'] = specialScore;
        const totalScore = daysScore + itemsScore + citiesScore + taskScore + specialScore;
        const isComplex = totalScore >= config.threshold;
        this.logger.debug(`[复杂度评估] intent=${intent}, score=${totalScore.toFixed(1)}, isComplex=${isComplex}, breakdown=${JSON.stringify(breakdown)}`);
        return {
            score: totalScore,
            isComplex,
            breakdown,
            reasons,
        };
    }
    isComplexTask(intent, state) {
        return this.evaluateTaskComplexity(intent, state, { tripId: state.tripId, userId: state.userId, message: '' }).isComplex;
    }
    async processIntent(intent, state, request) {
        switch (intent) {
            case 'OPTIMIZE_ROUTE': return this.handleOptimizeRoute(state, request);
            case 'REPLACE_POI': return this.handleReplacePoi(state, request);
            case 'ADJUST_PACE': return this.handleAdjustPace(state, request);
            case 'REBALANCE_DAYS': return this.handleRebalanceDays(state, request);
            case 'ADD_ACTIVITY': return this.handleAddActivity(state, request);
            case 'ARRANGE_MEALS': return this.handleArrangeMeals(state, request);
            case 'PLAN_TRANSPORT': return this.handlePlanTransport(state, request);
            case 'FILL_FREE_TIME': return this.handleFillFreeTime(state, request);
            case 'ASK_QUESTION': return this.handleAskQuestion(state, request);
            case 'GET_SUGGESTION': return this.handleGetSuggestion(state, request);
            case 'CHECK_FEASIBILITY': return this.handleCheckFeasibility(state, request);
            case 'COMPARE_OPTIONS': return this.handleCompareOptions(state, request);
            case 'CREATE_CHECKLIST': return this.handleCreateChecklist(state, request);
            case 'EXPORT_ITINERARY': return this.handleExportItinerary(state, request);
            case 'SHOW_OVERVIEW': return this.handleShowOverview(state, request);
            case 'UNDO_CHANGE': return this.handleUndoChange(state, request);
            default: return this.handleGeneralChat(state, request);
        }
    }
    async processAskQuestionStream(request, state, subject) {
        const ctx = state.tripContext;
        subject.next({
            type: 'thinking',
            data: { content: '正在检索相关信息...', progress: 20 },
        });
        const ragResult = await this.answerQuestionWithRAG(request.message, ctx);
        if (ragResult && ragResult.confidence >= 0.7) {
            subject.next({
                type: 'content',
                data: {
                    content: ragResult.answer,
                    phase: 'CONSULTING',
                    quickActions: this.generateQuestionQuickActions(request.message, ctx, ragResult),
                    ragResults: ragResult.structuredResults,
                    richContent: ragResult.structuredResults ? {
                        type: 'rag_sources',
                        data: {
                            sources: ragResult.structuredResults.sources,
                            evidenceChain: ragResult.structuredResults.evidenceChain,
                        },
                    } : undefined,
                },
            });
            subject.next({
                type: 'done',
                data: {
                    phase: 'CONSULTING',
                    intent: 'ASK_QUESTION',
                    meta: {
                        source: 'RAG',
                        ragConfidence: ragResult.confidence,
                        processingTime: ragResult.processingTime,
                    },
                },
            });
            subject.complete();
            return;
        }
        if (ragResult && ragResult.confidence < 0.7) {
            subject.next({
                type: 'content',
                data: {
                    content: ragResult.answer,
                    phase: 'CONSULTING',
                    partial: true,
                    note: '正在生成更详细的回答...',
                },
            });
        }
        subject.next({
            type: 'thinking',
            data: { content: '正在生成更详细的回答...', progress: 70 },
        });
        const llmAnswer = await this.answerQuestionWithLLM(request.message, ctx, ragResult);
        subject.next({
            type: 'content',
            data: {
                content: llmAnswer,
                phase: 'CONSULTING',
                enhanced: true,
                quickActions: this.generateQuestionQuickActions(request.message, ctx, ragResult),
                ragResults: ragResult === null || ragResult === void 0 ? void 0 : ragResult.structuredResults,
            },
        });
        subject.next({
            type: 'done',
            data: {
                phase: 'CONSULTING',
                intent: 'ASK_QUESTION',
                meta: {
                    source: ragResult ? 'RAG+LLM' : 'LLM',
                    ragConfidence: (ragResult === null || ragResult === void 0 ? void 0 : ragResult.confidence) || 0,
                },
            },
        });
        subject.complete();
    }
    async handleShowOverview(state, request) {
        const ctx = state.tripContext;
        const isNewSession = request.message === '__START_SESSION__';
        let message;
        if (isNewSession) {
            message = trip_planner_interface_1.DEFAULT_PLANNER_PERSONA.greetingTemplate
                .replace('{{name}}', trip_planner_interface_1.DEFAULT_PLANNER_PERSONA.name)
                .replace('{{role}}', trip_planner_interface_1.DEFAULT_PLANNER_PERSONA.role)
                .replace('{{destination}}', ctx.destinationName || ctx.destination)
                .replace('{{days}}', String(ctx.durationDays));
        }
        else {
            message = await this.generateOverviewMessage(ctx);
        }
        const { quickActions, issueMessage } = this.generateSmartQuickActions(ctx);
        if (issueMessage) {
            message += `\n\n${issueMessage}`;
        }
        return {
            sessionId: state.sessionId,
            message,
            phase: 'OVERVIEW',
            intent: 'SHOW_OVERVIEW',
            richContent: {
                type: 'timeline',
                data: this.generateTimelineData(ctx),
            },
            quickActions,
        };
    }
    async handleOptimizeRoute(state, request) {
        const ctx = state.tripContext;
        await this.createCheckpoint(state.sessionId, '优化路线前的检查点');
        const complexity = this.evaluateTaskComplexity('OPTIMIZE_ROUTE', state, request);
        this.logger.debug(`[路线优化] 复杂度评估: score=${complexity.score.toFixed(1)}, isComplex=${complexity.isComplex}, reasons=${complexity.reasons.join(', ')}`);
        const isComplexTask = complexity.isComplex;
        let suggestion;
        let optimizationResult = null;
        if (isComplexTask && this.orchestrator) {
            this.logger.debug(`[规划助手] 复杂优化任务，委托给 Orchestrator`);
            try {
                const requestId = (0, crypto_1.randomUUID)();
                const result = await this.orchestrator.orchestrate({
                    request_id: requestId,
                    user_id: request.userId,
                    message: `优化行程路线: ${request.message}`,
                    trip_id: state.tripId,
                }, {
                    requestId,
                    userId: request.userId,
                    tripId: state.tripId,
                });
                suggestion = result.answerText || await this.generateRouteSuggestion(ctx, request.message);
                optimizationResult = result.result;
            }
            catch (error) {
                this.logger.warn(`Orchestrator 调用失败，降级使用 LLM: ${error.message}`);
                suggestion = await this.generateRouteSuggestion(ctx, request.message);
            }
        }
        else {
            suggestion = await this.generateRouteSuggestion(ctx, request.message);
        }
        const changeId = (0, crypto_1.randomUUID)();
        this.addPendingChange(state, {
            id: changeId,
            type: 'UPDATE',
            target: 'TRIP',
            targetId: state.tripId,
            description: '优化行程路线顺序',
            before: ctx.days,
            after: (optimizationResult === null || optimizationResult === void 0 ? void 0 : optimizationResult.optimizedDays) || null,
            impact: {
                timeDelta: -30,
                riskLevel: 'low',
            },
        });
        const message = `好的，我来帮您优化行程路线。

${suggestion}`;
        const hasNightIssue = suggestion.includes('凌晨') || suggestion.includes('夜间时段');
        const needsAdjustment = suggestion.includes('需要您确认') || suggestion.includes('建议调整');
        const quickActions = [];
        if (needsAdjustment && hasNightIssue) {
            quickActions.push({ id: '1', label: '⏰ 自动调整凌晨活动', action: 'FIX_NIGHT_ACTIVITIES', params: { changeId }, style: 'primary' });
            quickActions.push({ id: '2', label: '✅ 保持原样', action: 'APPLY_OPTIMIZATION', params: { changeId }, style: 'secondary' });
        }
        else if (needsAdjustment) {
            quickActions.push({ id: '1', label: '🔧 自动修复问题', action: 'AUTO_FIX', params: { changeId }, style: 'primary' });
            quickActions.push({ id: '2', label: '✅ 保持原样', action: 'APPLY_OPTIMIZATION', params: { changeId }, style: 'secondary' });
        }
        else {
            quickActions.push({ id: '1', label: '✅ 应用优化', action: 'APPLY_OPTIMIZATION', params: { changeId }, style: 'primary' });
        }
        quickActions.push({ id: '3', label: '🔄 换个方案', action: 'OPTIMIZE_ROUTE', style: 'secondary' });
        quickActions.push({ id: '4', label: '❌ 不需要', action: 'CANCEL', style: 'secondary' });
        return {
            sessionId: state.sessionId,
            message,
            phase: 'OPTIMIZING',
            intent: 'OPTIMIZE_ROUTE',
            pendingChanges: [state.pendingChanges[state.pendingChanges.length - 1]],
            quickActions,
            followUp: {
                question: '需要我进一步解释优化的原因吗？',
                options: ['好的，解释一下', '直接应用吧', '我再想想'],
                type: 'single',
            },
        };
    }
    async handleReplacePoi(state, request) {
        const alternatives = await this.findAlternativePois(state.tripContext, request.message);
        const message = `我理解您想替换景点。以下是一些替代选项：

${alternatives.map((alt, i) => `${i + 1}. **${alt.name}** - ${alt.reason}\n   ⏱️ ${alt.duration}分钟 | 💰 ¥${alt.cost}`).join('\n\n')}

您想选择哪个？`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'OPTIMIZING',
            intent: 'REPLACE_POI',
            richContent: {
                type: 'poi_list',
                data: alternatives,
            },
            quickActions: alternatives.map((alt, i) => ({
                id: String(i + 1),
                label: alt.name,
                action: 'SELECT_POI',
                params: { poiId: alt.id },
                style: i === 0 ? 'primary' : 'secondary',
            })),
        };
    }
    async handleAdjustPace(state, request) {
        const ctx = state.tripContext;
        const paceAnalysis = this.analyzePace(ctx);
        let message;
        if (/太赶|太紧/.test(request.message)) {
            message = `我理解您觉得行程太紧凑了。当前分析：

${paceAnalysis.summary}

建议调整方案：
${paceAnalysis.relaxSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

需要我帮您自动调整吗？`;
        }
        else {
            message = `我理解您觉得行程太松了。当前分析：

${paceAnalysis.summary}

建议增加内容：
${paceAnalysis.intensifySuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

需要我帮您自动调整吗？`;
        }
        return {
            sessionId: state.sessionId,
            message,
            phase: 'OPTIMIZING',
            intent: 'ADJUST_PACE',
            quickActions: [
                { id: '1', label: '✅ 自动调整', action: 'APPLY_PACE_ADJUSTMENT', style: 'primary' },
                { id: '2', label: '🎯 我来选择', action: 'MANUAL_ADJUST', style: 'secondary' },
            ],
        };
    }
    async handleRebalanceDays(state, request) {
        const ctx = state.tripContext;
        const dayLoads = ctx.days.map((day, i) => ({
            day: i + 1,
            items: day.stats.itemCount,
            duration: day.stats.totalDuration,
            level: day.stats.itemCount > 5 ? '过多' : day.stats.itemCount < 2 ? '过少' : '适中',
        }));
        const message = `我来帮您重新平衡各天的安排。当前各天负载：

${dayLoads.map(d => `第${d.day}天：${d.items}个活动，约${Math.round(d.duration / 60)}小时 (${d.level})`).join('\n')}

我可以将活动重新分配，让每天的安排更均衡。要我自动平衡吗？`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'OPTIMIZING',
            intent: 'REBALANCE_DAYS',
            quickActions: [
                { id: '1', label: '✅ 自动平衡', action: 'APPLY_REBALANCE', style: 'primary' },
                { id: '2', label: '📊 查看详情', action: 'SHOW_DAY_DETAILS', style: 'secondary' },
            ],
        };
    }
    async handleAddActivity(state, request) {
        const ctx = state.tripContext;
        const targetDay = request.targetDay || this.findBestDayForActivity(ctx);
        const message = `好的，您想添加什么活动？

📅 **建议添加到第${targetDay}天**（当天还有约${this.getFreetimeForDay(ctx, targetDay)}分钟空闲时间）

您可以：
1. 直接告诉我想去的地方，如"想去浅草寺"
2. 让我推荐，如"推荐一个适合拍照的地方"
3. 按类型选择，如"想逛一个商场"`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'DETAILING',
            intent: 'ADD_ACTIVITY',
            quickActions: [
                { id: '1', label: '🏯 景点', action: 'ADD_POI', style: 'secondary' },
                { id: '2', label: '🛍️ 购物', action: 'ADD_SHOPPING', style: 'secondary' },
                { id: '3', label: '🎭 体验', action: 'ADD_EXPERIENCE', style: 'secondary' },
                { id: '4', label: '✨ 推荐', action: 'GET_RECOMMENDATION', style: 'primary' },
            ],
            followUp: {
                question: '想添加什么类型的活动？',
                type: 'text',
            },
        };
    }
    async handleArrangeMeals(state, request) {
        const ctx = state.tripContext;
        const missingMeals = this.findMissingMeals(ctx);
        let message;
        if (missingMeals.length > 0) {
            message = `我来帮您安排餐厅。您还有以下餐点没有安排：

${missingMeals.map(m => `• 第${m.day}天 ${m.meal}`).join('\n')}

我可以根据您当天的行程位置，推荐附近的餐厅。您想从哪一餐开始？`;
        }
        else {
            message = `您的餐厅都已经安排好了！如果想更换某一餐，可以告诉我"换掉第X天的午餐"。

或者您想看看我的特别推荐？我可以根据当地特色给您一些美食建议。`;
        }
        return {
            sessionId: state.sessionId,
            message,
            phase: 'DETAILING',
            intent: 'ARRANGE_MEALS',
            quickActions: missingMeals.length > 0 ? [
                { id: '1', label: '🍜 全部安排', action: 'ARRANGE_ALL_MEALS', style: 'primary' },
                { id: '2', label: '🎯 我来选', action: 'SELECT_MEALS', style: 'secondary' },
                { id: '3', label: '💡 美食推荐', action: 'FOOD_RECOMMENDATION', style: 'secondary' },
            ] : [
                { id: '1', label: '💡 美食推荐', action: 'FOOD_RECOMMENDATION', style: 'primary' },
                { id: '2', label: '🔄 更换餐厅', action: 'REPLACE_RESTAURANT', style: 'secondary' },
            ],
        };
    }
    async handlePlanTransport(state, request) {
        const ctx = state.tripContext;
        const transportNeeds = this.analyzeTransportNeeds(ctx);
        const message = `我来帮您规划交通。根据您的行程：

🚃 **交通建议**：
${transportNeeds.suggestions.map(s => `• ${s}`).join('\n')}

💰 **预估交通费用**：约 ¥${transportNeeds.estimatedCost}

🎫 **推荐购买**：
${transportNeeds.passes.map(p => `• ${p.name}：¥${p.price}（${p.reason}）`).join('\n')}

需要我为每段行程规划详细的交通方式吗？`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'DETAILING',
            intent: 'PLAN_TRANSPORT',
            quickActions: [
                { id: '1', label: '📍 详细规划', action: 'DETAIL_TRANSPORT', style: 'primary' },
                { id: '2', label: '🎫 购票建议', action: 'TICKET_ADVICE', style: 'secondary' },
            ],
        };
    }
    async handleFillFreeTime(state, request) {
        const ctx = state.tripContext;
        const freeSlots = this.findFreeTimeSlots(ctx);
        if (freeSlots.length === 0) {
            return {
                sessionId: state.sessionId,
                message: '您的行程安排得很满了！如果想增加活动，可能需要先移除或缩短某些安排。需要我帮您分析一下吗？',
                phase: 'OVERVIEW',
                intent: 'FILL_FREE_TIME',
                quickActions: [
                    { id: '1', label: '📊 分析行程', action: 'ANALYZE_SCHEDULE', style: 'primary' },
                ],
            };
        }
        const recommendations = [];
        for (const slot of freeSlots) {
            const day = ctx.days.find(d => d.dayNumber === slot.day);
            if (!day)
                continue;
            const dayItems = day.items.filter(item => item.startTime && item.type !== 'TRANSPORT');
            const slotStartMinutes = this.parseTimeToMinutes(slot.start);
            let recommendationType = 'ACTIVITY';
            let suggestions = [];
            if (slotStartMinutes >= 7 * 60 && slotStartMinutes < 10 * 60) {
                recommendationType = 'RESTAURANT';
                suggestions = [
                    { name: '当地特色早餐店', type: 'RESTAURANT', reason: '体验当地早餐文化' },
                    { name: '咖啡厅', type: 'RESTAURANT', reason: '悠闲的早晨时光' },
                ];
            }
            else if (slotStartMinutes >= 11 * 60 && slotStartMinutes < 14 * 60) {
                recommendationType = 'RESTAURANT';
                suggestions = [
                    { name: '当地特色餐厅', type: 'RESTAURANT', reason: '品尝地道美食' },
                    { name: '网红餐厅', type: 'RESTAURANT', reason: '热门打卡地' },
                ];
            }
            else if (slotStartMinutes >= 17 * 60 && slotStartMinutes < 21 * 60) {
                recommendationType = 'RESTAURANT';
                suggestions = [
                    { name: '特色餐厅', type: 'RESTAURANT', reason: '享受晚餐时光' },
                    { name: '观景餐厅', type: 'RESTAURANT', reason: '边用餐边欣赏风景' },
                ];
            }
            else {
                const hasNature = dayItems.some(item => { var _a, _b, _c; return ((_a = item.category) === null || _a === void 0 ? void 0 : _a.includes('自然')) || ((_b = item.name) === null || _b === void 0 ? void 0 : _b.includes('公园')) || ((_c = item.name) === null || _c === void 0 ? void 0 : _c.includes('山')); });
                const hasCulture = dayItems.some(item => { var _a, _b, _c; return ((_a = item.category) === null || _a === void 0 ? void 0 : _a.includes('文化')) || ((_b = item.name) === null || _b === void 0 ? void 0 : _b.includes('博物馆')) || ((_c = item.name) === null || _c === void 0 ? void 0 : _c.includes('寺')); });
                const hasShopping = dayItems.some(item => { var _a, _b, _c; return ((_a = item.category) === null || _a === void 0 ? void 0 : _a.includes('购物')) || ((_b = item.name) === null || _b === void 0 ? void 0 : _b.includes('购物')) || ((_c = item.name) === null || _c === void 0 ? void 0 : _c.includes('商场')); });
                if (hasNature && !hasShopping) {
                    suggestions = [
                        { name: '购物中心', type: 'SHOPPING', reason: '补充购物行程' },
                        { name: '特色小店', type: 'SHOPPING', reason: '寻找纪念品' },
                    ];
                }
                else if (hasCulture && !hasNature) {
                    suggestions = [
                        { name: '公园/自然景点', type: 'ATTRACTION', reason: '放松身心' },
                        { name: '观景台', type: 'ATTRACTION', reason: '欣赏城市全景' },
                    ];
                }
                else {
                    suggestions = [
                        { name: '特色体验活动', type: 'ACTIVITY', reason: '丰富行程内容' },
                        { name: '当地文化体验', type: 'ACTIVITY', reason: '深入了解当地' },
                        { name: '休闲场所', type: 'ACTIVITY', reason: '放松休息' },
                    ];
                }
            }
            const nearbyItems = dayItems.filter(item => item.location);
            if (nearbyItems.length > 0 && suggestions.length > 0) {
                suggestions[0].reason += '（附近有相关景点）';
            }
            recommendations.push({
                day: slot.day,
                timeSlot: { start: slot.start, end: slot.end },
                suggestions: suggestions.slice(0, 3),
            });
        }
        let message = `我为您找到了空闲时间段，并推荐了以下活动：\n\n`;
        const recommendationData = [];
        for (const rec of recommendations) {
            const slot = freeSlots.find(s => s.day === rec.day);
            const slotDuration = (slot === null || slot === void 0 ? void 0 : slot.duration) || 0;
            message += `📅 **第${rec.day}天 ${rec.timeSlot.start}-${rec.timeSlot.end}**（${slotDuration}分钟空闲）\n`;
            message += `💡 **推荐活动**：\n`;
            const suggestionsWithActions = rec.suggestions.map((s, idx) => {
                const suggestionId = `rec_${rec.day}_${idx}_${Date.now()}`;
                message += `   ${idx + 1}. ${s.name}（${s.reason}）\n`;
                return {
                    id: suggestionId,
                    name: s.name,
                    type: s.type,
                    reason: s.reason,
                    action: 'ADD_TO_ITINERARY',
                };
            });
            recommendationData.push({
                day: rec.day,
                timeSlot: rec.timeSlot,
                duration: slotDuration,
                suggestions: suggestionsWithActions,
            });
            message += `\n`;
        }
        message += `💡 您可以直接选择推荐的活动，我会帮您添加到行程中。`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'DETAILING',
            intent: 'FILL_FREE_TIME',
            richContent: {
                type: 'poi_list',
                data: {
                    recommendations: recommendationData,
                    actionType: 'ADD_TO_ITINERARY',
                },
            },
            quickActions: [
                { id: '1', label: '🔄 刷新推荐', action: 'REFRESH_RECOMMENDATIONS', style: 'secondary' },
                { id: '2', label: '😌 保持空闲', action: 'KEEP_FREE', style: 'secondary' },
            ],
        };
    }
    async handleAskQuestion(state, request) {
        const ctx = state.tripContext;
        const startTime = Date.now();
        const [ragResult, gapAnalysis] = await Promise.all([
            this.answerQuestionWithRAG(request.message, ctx),
            this.intentDisambiguator
                ? this.intentDisambiguator.disambiguate(request.message, 'ASK_QUESTION', state)
                    .then(result => { var _a; return ((_a = result.diagnostics) === null || _a === void 0 ? void 0 : _a.relatedGaps) || []; })
                    .catch(() => [])
                : Promise.resolve([]),
        ]);
        if (ragResult && ragResult.confidence >= 0.7) {
            const processingTime = Date.now() - startTime;
            this.logger.debug(`[规划助手] RAG-First 快速路径: 置信度=${ragResult.confidence.toFixed(2)}, 耗时=${processingTime}ms, 缺口数=${gapAnalysis.length}`);
            const richContent = ragResult.structuredResults ? {
                type: 'rag_sources',
                data: {
                    sources: ragResult.structuredResults.sources,
                    evidenceChain: ragResult.structuredResults.evidenceChain,
                },
            } : undefined;
            const followUpQuestions = await this.generateFollowUpQuestions(request.message, ragResult, ctx);
            const quickActionsWithFeedback = [
                ...this.generateQuestionQuickActions(request.message, ctx, ragResult),
                ...followUpQuestions.slice(0, 3).map((q, i) => ({
                    id: `follow-up-${i + 1}`,
                    label: q,
                    action: 'ASK_QUESTION',
                    params: { question: q },
                    style: 'secondary',
                })),
                {
                    id: 'feedback-helpful',
                    label: '👍 有用',
                    action: 'SUBMIT_FEEDBACK',
                    params: { helpful: true },
                    style: 'ghost',
                },
                {
                    id: 'feedback-not-helpful',
                    label: '👎 无用',
                    action: 'SUBMIT_FEEDBACK',
                    params: { helpful: false },
                    style: 'ghost',
                },
            ];
            this.recordPerformanceMetrics({
                intent: 'ASK_QUESTION',
                source: 'RAG',
                processingTime,
                ragConfidence: ragResult.confidence,
                sessionId: state.sessionId,
                tripId: ctx.tripId,
                promptType: 'qa_enhancement',
                promptVersion: 'v1.0',
            });
            return {
                sessionId: state.sessionId,
                message: ragResult.answer,
                phase: 'CONSULTING',
                intent: 'ASK_QUESTION',
                quickActions: quickActionsWithFeedback,
                ragResults: ragResult.structuredResults,
                richContent,
                meta: {
                    processingTime,
                    source: 'RAG',
                    ragConfidence: ragResult.confidence,
                    detectedGaps: await (async () => {
                        const filtered = this.filterRelevantGaps(gapAnalysis, 'ASK_QUESTION', request.message);
                        if (filtered.length === 0) {
                            return undefined;
                        }
                        const mapped = filtered.map((g, index) => {
                            var _a, _b;
                            return ({
                                id: g.id || `gap_${index}_${Date.now()}`,
                                type: g.type,
                                dayNumber: g.dayNumber,
                                timeSlot: g.timeSlot,
                                description: g.description,
                                severity: g.severity,
                                context: g.context ? {
                                    beforeItem: (_a = g.context.beforeActivity) === null || _a === void 0 ? void 0 : _a.name,
                                    afterItem: (_b = g.context.afterActivity) === null || _b === void 0 ? void 0 : _b.name,
                                    nearbyLocation: g.context.dayCity,
                                } : undefined,
                            });
                        });
                        let finalGaps = mapped;
                        if (this.gapPreferencesService && request.userId) {
                            try {
                                const preferences = await this.gapPreferencesService.getPreferences(request.userId, ctx.tripId, state.sessionId);
                                if (preferences.showOnlyCritical) {
                                    finalGaps = finalGaps.filter(g => g.severity === 'CRITICAL');
                                }
                                if (preferences.filterTypes.length > 0) {
                                    finalGaps = finalGaps.filter(g => preferences.filterTypes.includes(g.type));
                                }
                                finalGaps = await this.gapPreferencesService.filterIgnoredGaps(request.userId, finalGaps, ctx.tripId);
                            }
                            catch (error) {
                                this.logger.warn(`[缺口偏好] 应用用户偏好失败: ${error.message}`);
                            }
                        }
                        const aggregated = this.aggregateGaps(finalGaps);
                        return aggregated.length > 0 ? aggregated : undefined;
                    })(),
                },
            };
        }
        const answer = await this.answerQuestionWithLLM(request.message, ctx, ragResult);
        const processingTime = Date.now() - startTime;
        const followUpQuestions = await this.generateFollowUpQuestions(request.message, ragResult, ctx);
        const quickActionsWithFeedback = [
            ...this.generateQuestionQuickActions(request.message, ctx, ragResult),
            ...followUpQuestions.slice(0, 3).map((q, i) => ({
                id: `follow-up-${i + 1}`,
                label: q,
                action: 'ASK_QUESTION',
                params: { question: q },
                style: 'secondary',
            })),
            {
                id: 'feedback-helpful',
                label: '👍 有用',
                action: 'SUBMIT_FEEDBACK',
                params: { helpful: true },
                style: 'ghost',
            },
            {
                id: 'feedback-not-helpful',
                label: '👎 无用',
                action: 'SUBMIT_FEEDBACK',
                params: { helpful: false },
                style: 'ghost',
            },
        ];
        this.recordPerformanceMetrics({
            intent: 'ASK_QUESTION',
            source: ragResult ? 'RAG+LLM' : 'LLM',
            processingTime,
            ragConfidence: (ragResult === null || ragResult === void 0 ? void 0 : ragResult.confidence) || 0,
            sessionId: state.sessionId,
            tripId: ctx.tripId,
            promptType: 'qa_enhancement',
            promptVersion: 'v1.0',
        });
        let filteredGaps = this.filterRelevantGaps(gapAnalysis, 'ASK_QUESTION', request.message);
        const mappedGaps = filteredGaps.length > 0
            ? filteredGaps.map((g) => {
                var _a, _b;
                return ({
                    id: g.id,
                    type: g.type,
                    dayNumber: g.dayNumber,
                    timeSlot: g.timeSlot,
                    description: g.description,
                    severity: g.severity,
                    context: g.context ? {
                        beforeItem: (_a = g.context.beforeActivity) === null || _a === void 0 ? void 0 : _a.name,
                        afterItem: (_b = g.context.afterActivity) === null || _b === void 0 ? void 0 : _b.name,
                        nearbyLocation: g.context.dayCity,
                    } : undefined,
                });
            })
            : [];
        let finalGaps = mappedGaps;
        if (this.gapPreferencesService && request.userId) {
            try {
                const preferences = await this.gapPreferencesService.getPreferences(request.userId, ctx.tripId, state.sessionId);
                if (preferences.showOnlyCritical) {
                    finalGaps = finalGaps.filter(g => g.severity === 'CRITICAL');
                }
                if (preferences.filterTypes.length > 0) {
                    finalGaps = finalGaps.filter(g => preferences.filterTypes.includes(g.type));
                }
                finalGaps = await this.gapPreferencesService.filterIgnoredGaps(request.userId, finalGaps, ctx.tripId);
            }
            catch (error) {
                this.logger.warn(`[缺口偏好] 应用用户偏好失败: ${error.message}`);
            }
        }
        const aggregatedGaps = this.aggregateGaps(finalGaps);
        return {
            sessionId: state.sessionId,
            message: answer,
            phase: 'CONSULTING',
            intent: 'ASK_QUESTION',
            quickActions: quickActionsWithFeedback,
            ragResults: ragResult === null || ragResult === void 0 ? void 0 : ragResult.structuredResults,
            meta: {
                processingTime,
                source: ragResult ? 'RAG+LLM' : 'LLM',
                ragConfidence: (ragResult === null || ragResult === void 0 ? void 0 : ragResult.confidence) || 0,
                detectedGaps: aggregatedGaps.length > 0 ? aggregatedGaps : undefined,
            },
        };
    }
    async handleGetSuggestion(state, request) {
        const ctx = state.tripContext;
        const suggestions = await this.generateSuggestions(ctx, request.message);
        const message = `根据您的行程，我有以下建议：

${suggestions.map((s, i) => `${i + 1}. **${s.title}**\n   ${s.description}`).join('\n\n')}

有需要我详细解释或者帮您应用的吗？`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'CONSULTING',
            intent: 'GET_SUGGESTION',
            quickActions: suggestions.map((s, i) => ({
                id: String(i + 1),
                label: s.title,
                action: 'APPLY_SUGGESTION',
                params: { suggestionId: s.id },
                style: i === 0 ? 'primary' : 'secondary',
            })),
        };
    }
    async handleCheckFeasibility(state, request) {
        var _a;
        const ctx = state.tripContext;
        let analysis;
        analysis = await this.analyzeFeasibility(ctx, request.message);
        const message = this.formatFeasibilityMessage(analysis);
        return {
            sessionId: state.sessionId,
            message,
            phase: 'CONSULTING',
            intent: 'CHECK_FEASIBILITY',
            richContent: ((_a = analysis.risks) === null || _a === void 0 ? void 0 : _a.length) > 0 ? {
                type: 'comparison',
                data: {
                    title: '风险分析',
                    items: analysis.risks,
                },
            } : undefined,
            quickActions: analysis.feasible ? [
                { id: '1', label: '👍 好的', action: 'CONFIRM', style: 'primary' },
            ] : [
                { id: '1', label: '🔧 帮我调整', action: 'AUTO_FIX', style: 'primary' },
                { id: '2', label: '📊 详细分析', action: 'DETAIL_ANALYSIS', style: 'secondary' },
            ],
        };
    }
    formatFeasibilityMessage(analysis) {
        var _a, _b;
        const emoji = analysis.feasible ? '✅' : '⚠️';
        let message = `${emoji} **可行性分析结果**\n\n${analysis.summary}`;
        if (((_a = analysis.details) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            message += `\n\n${analysis.details.map((d) => `• ${d}`).join('\n')}`;
        }
        if (((_b = analysis.suggestions) === null || _b === void 0 ? void 0 : _b.length) > 0) {
            message += `\n\n💡 **建议**：\n${analysis.suggestions.map((s) => `• ${s}`).join('\n')}`;
        }
        message += `\n\n${analysis.feasible ? '总体来说这个安排是可行的。' : '建议您进行一些调整。'}`;
        return message;
    }
    async handleCompareOptions(state, request) {
        const comparison = await this.generateComparison(state.tripContext, request.message);
        const message = `好的，我来帮您对比一下：

${comparison.table}

**我的建议**：${comparison.recommendation}`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'CONSULTING',
            intent: 'COMPARE_OPTIONS',
            richContent: {
                type: 'comparison',
                data: comparison,
            },
            quickActions: comparison.options.map((opt, i) => ({
                id: String(i + 1),
                label: `选择 ${opt.name}`,
                action: 'SELECT_OPTION',
                params: { optionId: opt.id },
                style: opt.recommended ? 'primary' : 'secondary',
            })),
        };
    }
    async handleCreateChecklist(state, request) {
        const ctx = state.tripContext;
        const checklist = this.generateChecklist(ctx);
        const message = `我为您生成了行前准备清单：

📋 **${ctx.destinationName || ctx.destination} ${ctx.durationDays}天旅行清单**

**📄 证件类**
${checklist.documents.map(d => `☐ ${d}`).join('\n')}

**👕 衣物类**
${checklist.clothing.map(c => `☐ ${c}`).join('\n')}

**💊 健康类**
${checklist.health.map(h => `☐ ${h}`).join('\n')}

**📱 电子设备**
${checklist.electronics.map(e => `☐ ${e}`).join('\n')}

**💰 财务类**
${checklist.finance.map(f => `☐ ${f}`).join('\n')}

需要我帮您导出这个清单吗？`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'EXECUTING',
            intent: 'CREATE_CHECKLIST',
            richContent: {
                type: 'checklist',
                data: checklist,
            },
            quickActions: [
                { id: '1', label: '📤 导出清单', action: 'EXPORT_CHECKLIST', style: 'primary' },
                { id: '2', label: '➕ 添加项目', action: 'ADD_CHECKLIST_ITEM', style: 'secondary' },
            ],
        };
    }
    async handleExportItinerary(state, request) {
        const message = `您想以什么格式导出行程？

📄 **PDF** - 适合打印或离线查看
📱 **分享链接** - 发给同行的朋友
📅 **日历** - 导入到手机日历
📋 **文本** - 简洁的文字版本`;
        return {
            sessionId: state.sessionId,
            message,
            phase: 'EXECUTING',
            intent: 'EXPORT_ITINERARY',
            quickActions: [
                { id: '1', label: '📄 PDF', action: 'EXPORT_PDF', style: 'primary' },
                { id: '2', label: '📱 分享链接', action: 'SHARE_LINK', style: 'secondary' },
                { id: '3', label: '📅 日历', action: 'EXPORT_CALENDAR', style: 'secondary' },
                { id: '4', label: '📋 文本', action: 'EXPORT_TEXT', style: 'secondary' },
            ],
        };
    }
    async handleUndoChange(state, request) {
        if (!state.pendingChanges || state.pendingChanges.length === 0) {
            return {
                sessionId: state.sessionId,
                message: '没有可撤销的修改。您的行程保持原样。',
                phase: state.phase,
                intent: 'UNDO_CHANGE',
            };
        }
        const lastChange = state.pendingChanges[state.pendingChanges.length - 1];
        return {
            sessionId: state.sessionId,
            message: `您确定要撤销这个修改吗？\n\n**${lastChange.description}**`,
            phase: 'CONFIRMING',
            intent: 'UNDO_CHANGE',
            quickActions: [
                { id: '1', label: '✅ 确认撤销', action: 'CONFIRM_UNDO', style: 'danger' },
                { id: '2', label: '❌ 取消', action: 'CANCEL', style: 'secondary' },
            ],
        };
    }
    async handleGeneralChat(state, request) {
        const ctx = state.tripContext;
        this.logger.debug(`[规划助手] handleGeneralChat: message="${request.message.substring(0, 50)}...", llmService=${!!this.llmService}, ragService=${!!this.ragService}`);
        const response = await this.generateGeneralResponse(ctx, request.message, state.messages);
        return {
            sessionId: state.sessionId,
            message: response,
            phase: state.phase,
            intent: 'GENERAL_CHAT',
            quickActions: [
                { id: '1', label: '📋 查看行程', action: 'SHOW_OVERVIEW', style: 'secondary' },
                { id: '2', label: '✨ 优化建议', action: 'GET_SUGGESTION', style: 'secondary' },
            ],
        };
    }
    async handleClarificationSelection(state, request) {
        const { clarificationData } = request;
        if (!clarificationData) {
            throw new Error('缺少澄清数据');
        }
        const { selectedAction, params } = clarificationData;
        this.logger.debug(`[澄清处理] 动作=${selectedAction}, 参数=${JSON.stringify(params)}`);
        this.addMessage(state, {
            id: (0, crypto_1.randomUUID)(),
            role: 'user',
            content: `[选择] ${request.message}`,
            timestamp: new Date().toISOString(),
        });
        switch (selectedAction) {
            case 'QUERY':
                return this.handlePureQueryAction(state, request);
            case 'ADD_TO_ITINERARY':
                return this.handleAddToItineraryAction(state, request, params);
            case 'REPLACE':
                return this.handleReplaceAction(state, request, params);
            case 'REMOVE':
                return this.handleRemoveAction(state, request, params);
            case 'MODIFY':
                return this.handleModifyAction(state, request, params);
            default:
                this.logger.warn(`[澄清处理] 未知动作: ${selectedAction}`);
                return this.handleGeneralChat(state, request);
        }
    }
    async handlePureQueryAction(state, request) {
        const ctx = state.tripContext;
        const lastUserMessage = state.messages
            .filter(m => m.role === 'user' && !m.content.startsWith('[选择]'))
            .pop();
        const originalQuery = (lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.content) || request.message;
        const infoResponse = await this.generateInfoResponse(ctx, originalQuery);
        const message = `${infoResponse}

---
💡 如果您想把相关内容加到行程里，随时告诉我！`;
        this.addMessage(state, {
            id: (0, crypto_1.randomUUID)(),
            role: 'assistant',
            content: message,
            timestamp: new Date().toISOString(),
        });
        await this.saveSession(state);
        return {
            sessionId: state.sessionId,
            message,
            phase: 'CONSULTING',
            intent: 'ASK_QUESTION',
            quickActions: [
                { id: '1', label: '➕ 加到行程', action: 'ADD_TO_ITINERARY', style: 'primary' },
                { id: '2', label: '🔍 了解更多', action: 'ASK_MORE', style: 'secondary' },
                { id: '3', label: '🔙 返回', action: 'SHOW_OVERVIEW', style: 'secondary' },
            ],
        };
    }
    async handleAddToItineraryAction(state, request, params) {
        const ctx = state.tripContext;
        const targetDay = (params === null || params === void 0 ? void 0 : params.dayNumber) || request.targetDay || 1;
        const dayContext = ctx.days[targetDay - 1];
        if (!dayContext) {
            return {
                sessionId: state.sessionId,
                message: `❌ 第${targetDay}天不存在，请指定有效的天数（1-${ctx.days.length}）`,
                phase: 'DETAILING',
                intent: 'ADD_ACTIVITY',
            };
        }
        let timeSlot = params === null || params === void 0 ? void 0 : params.timeSlot;
        if (!timeSlot) {
            const freeSlot = this.findFreeSlot(dayContext, 60);
            if (freeSlot) {
                timeSlot = freeSlot;
            }
        }
        const lastUserMessage = state.messages
            .filter(m => m.role === 'user' && !m.content.startsWith('[选择]'))
            .pop();
        const originalQuery = (lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.content) || request.message;
        const isMealQuery = /吃|餐|饭|美食|午餐|晚餐|早餐|拉面|寿司|烤肉/.test(originalQuery);
        const suggestionType = isMealQuery ? 'ARRANGE_MEALS' : 'ADD_ACTIVITY';
        const recommendations = await this.generateRecommendations(ctx, originalQuery, targetDay);
        const message = `好的！我来帮您安排到第${targetDay}天${timeSlot ? ` ${timeSlot.start}-${timeSlot.end}` : ''}。

${recommendations.map((r, i) => `${i + 1}. **${r.name}** ${r.rating ? `⭐${r.rating}` : ''}
   📍 ${r.address || '位置待确认'}
   ⏱️ 建议游玩 ${r.duration || 60} 分钟`).join('\n\n')}

请选择一个，或告诉我您想要的具体地点：`;
        const quickActions = recommendations.slice(0, 3).map((r, i) => ({
            id: `rec_${i}`,
            label: `${r.name}`,
            action: 'APPLY_RECOMMENDATION',
            params: {
                recommendation: r,
                dayNumber: targetDay,
                timeSlot,
            },
            style: i === 0 ? 'primary' : 'secondary',
        }));
        quickActions.push({
            id: 'custom',
            label: '🔍 搜索其他',
            action: 'SEARCH_MORE',
            style: 'outline',
        });
        this.addMessage(state, {
            id: (0, crypto_1.randomUUID)(),
            role: 'assistant',
            content: message,
            intent: suggestionType,
            quickActions,
            timestamp: new Date().toISOString(),
        });
        await this.saveSession(state);
        return {
            sessionId: state.sessionId,
            message,
            phase: 'DETAILING',
            intent: suggestionType,
            quickActions,
            followUp: {
                question: '请选择一个推荐，或输入您想去的地方',
                options: recommendations.map(r => r.name),
                type: 'single',
            },
        };
    }
    async handleReplaceAction(state, request, params) {
        return this.handleReplacePoi(state, {
            ...request,
            targetItemId: (params === null || params === void 0 ? void 0 : params.targetItemId) || request.targetItemId,
        });
    }
    async handleRemoveAction(state, request, params) {
        const targetItemId = (params === null || params === void 0 ? void 0 : params.targetItemId) || request.targetItemId;
        if (!targetItemId) {
            return {
                sessionId: state.sessionId,
                message: '请指定要移除的项目',
                phase: state.phase,
                intent: 'GENERAL_CHAT',
            };
        }
        for (const day of state.tripContext.days) {
            const itemIndex = day.items.findIndex(i => i.itemId === targetItemId);
            if (itemIndex >= 0) {
                const item = day.items[itemIndex];
                const changeId = `remove_${(0, crypto_1.randomUUID)().substring(0, 8)}`;
                state.pendingChanges = state.pendingChanges || [];
                const itemName = this.getItemName(item);
                state.pendingChanges.push({
                    id: changeId,
                    type: 'DELETE',
                    target: 'ITEM',
                    targetId: targetItemId,
                    dayNumber: day.dayNumber,
                    description: `移除第${day.dayNumber}天的「${itemName}」`,
                    status: 'pending',
                });
                await this.saveSession(state);
                return {
                    sessionId: state.sessionId,
                    message: `确定要移除第${day.dayNumber}天的「${itemName}」吗？`,
                    phase: 'CONFIRMING',
                    intent: 'GENERAL_CHAT',
                    pendingChanges: state.pendingChanges,
                    quickActions: [
                        { id: '1', label: '✅ 确认移除', action: 'CONFIRM_REMOVE', params: { changeId }, style: 'danger' },
                        { id: '2', label: '❌ 取消', action: 'CANCEL', style: 'secondary' },
                    ],
                };
            }
        }
        return {
            sessionId: state.sessionId,
            message: `未找到 ID 为 ${targetItemId} 的项目`,
            phase: state.phase,
            intent: 'GENERAL_CHAT',
        };
    }
    async handleModifyAction(state, request, params) {
        const targetItemId = (params === null || params === void 0 ? void 0 : params.targetItemId) || request.targetItemId;
        if (!targetItemId) {
            return {
                sessionId: state.sessionId,
                message: '请指定要修改的项目，或告诉我您想修改什么',
                phase: state.phase,
                intent: 'GENERAL_CHAT',
                quickActions: [
                    { id: '1', label: '⏰ 修改时间', action: 'MODIFY_TIME', style: 'secondary' },
                    { id: '2', label: '⏱️ 修改时长', action: 'MODIFY_DURATION', style: 'secondary' },
                    { id: '3', label: '📝 添加备注', action: 'ADD_NOTE', style: 'secondary' },
                ],
            };
        }
        for (const day of state.tripContext.days) {
            const item = day.items.find(i => i.itemId === targetItemId);
            if (item) {
                const itemName = this.getItemName(item);
                return {
                    sessionId: state.sessionId,
                    message: `您想修改「${itemName}」的什么内容？
          
当前信息：
- 时间：${item.startTime || '未设置'} - ${item.endTime || '未设置'}
- 时长：${item.duration || 60} 分钟
- 备注：${item.notes || '无'}`,
                    phase: 'DETAILING',
                    intent: 'GENERAL_CHAT',
                    quickActions: [
                        { id: '1', label: '⏰ 修改时间', action: 'MODIFY_TIME', params: { targetItemId }, style: 'secondary' },
                        { id: '2', label: '⏱️ 修改时长', action: 'MODIFY_DURATION', params: { targetItemId }, style: 'secondary' },
                        { id: '3', label: '📝 添加备注', action: 'ADD_NOTE', params: { targetItemId }, style: 'secondary' },
                        { id: '4', label: '🔄 替换', action: 'REPLACE_POI', params: { targetItemId }, style: 'secondary' },
                    ],
                };
            }
        }
        return {
            sessionId: state.sessionId,
            message: `未找到 ID 为 ${targetItemId} 的项目`,
            phase: state.phase,
            intent: 'GENERAL_CHAT',
        };
    }
    async generateInfoResponse(ctx, query) {
        const isMealQuery = /吃|餐|饭|美食|午餐|晚餐|早餐|拉面|寿司|烤肉|好吃/.test(query);
        const isAttractionQuery = /景点|玩|去|看|逛/.test(query);
        const isTransportQuery = /怎么去|交通|地铁|公交|打车/.test(query);
        if (isMealQuery) {
            return `**${ctx.destinationName || ctx.destination}美食推荐** 🍜

根据当地特色，为您推荐：

1. **一兰拉面** - 经典博多豚骨拉面，24小时营业
   💰 约 ¥80/人 | ⭐ 4.5

2. **筑地寿司清** - 新鲜海鲜寿司，需要排队
   💰 约 ¥200/人 | ⭐ 4.8

3. **矶丸水产** - 海鲜烧烤，自己动手
   💰 约 ¥150/人 | ⭐ 4.3

> 💡 建议：热门餐厅建议提前到或错峰就餐`;
        }
        if (isTransportQuery) {
            return `**${ctx.destinationName || ctx.destination}交通指南** 🚃

**推荐交通方式：**
1. **地铁/JR** - 最便捷，覆盖主要景点
2. **公交** - 适合短途，可欣赏街景
3. **出租车** - 起步价约 ¥40，适合多人或赶时间

**交通卡推荐：**
- Suica/Pasmo：便利店、自动售票机均可购买充值

> 💡 建议：下载「Google Maps」或「换乘案内」APP`;
        }
        return `关于「${query}」的信息：

${ctx.destinationName || ctx.destination}是一个很棒的目的地！

如果您想了解更具体的内容，可以告诉我：
- 🍜 美食推荐
- 🏯 景点介绍
- 🚃 交通指南
- 💰 预算建议`;
    }
    async generateRecommendations(ctx, query, targetDay) {
        const isMealQuery = /吃|餐|饭|美食|午餐|晚餐|早餐|拉面|寿司|烤肉|好吃/.test(query);
        if (isMealQuery) {
            return [
                { name: '一兰拉面', address: '新宿区歌舞伎町', rating: 4.5, duration: 45 },
                { name: '筑地寿司清', address: '中央区筑地', rating: 4.8, duration: 60 },
                { name: '矶丸水产', address: '�的谷区道玄坂', rating: 4.3, duration: 90 },
            ];
        }
        return [
            { name: '浅草寺', address: '台东区浅草', rating: 4.7, duration: 120 },
            { name: '东京塔', address: '港区芝公园', rating: 4.5, duration: 90 },
            { name: '明治神宫', address: '涩谷区代代木', rating: 4.6, duration: 90 },
        ];
    }
    async getSession(sessionId) {
        const state = this.sessionCache.get(sessionId);
        if (state) {
            return state;
        }
        if (this.stateStore) {
            try {
                const stored = await this.stateStore.get(`TripPlannerSession/${sessionId}`, 'TripPlannerSession');
                if (stored && stored.data) {
                    this.sessionCache.set(sessionId, stored.data);
                    return stored.data;
                }
            }
            catch (error) {
                this.logger.warn(`[规划助手] 从 StateStore 加载会话失败: ${error}`);
            }
        }
        return null;
    }
    async loadOrCreateSession(request) {
        const sessionId = request.sessionId || `planner_${request.tripId}_${(0, crypto_1.randomUUID)().substring(0, 8)}`;
        let state = this.sessionCache.get(sessionId);
        if (state) {
            return state;
        }
        if (this.stateStore) {
            const stored = await this.stateStore.get(sessionId, 'TripPlannerSession');
            if (stored) {
                state = stored.data;
                this.sessionCache.set(sessionId, state);
                this.logger.debug(`[规划助手] 从 StateStore 恢复会话: ${sessionId}`);
                return state;
            }
        }
        const tripContext = await this.loadTripContext(request.tripId);
        state = {
            sessionId,
            tripId: request.tripId,
            userId: request.userId,
            phase: 'OVERVIEW',
            tripContext,
            messages: [],
            pendingChanges: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        if (this.stateStore) {
            await this.stateStore.create(sessionId, 'TripPlannerSession', state, 'TripPlannerService', `session_${sessionId}`);
            this.logger.debug(`[规划助手] 新会话已持久化: ${sessionId}`);
        }
        this.sessionCache.set(sessionId, state);
        return state;
    }
    async saveSession(state) {
        this.sessionCache.set(state.sessionId, state);
        if (this.stateStore) {
            const currentVersion = await this.stateStore.getVersion(state.sessionId, 'TripPlannerSession');
            if (currentVersion !== null) {
                await this.stateStore.update(state.sessionId, 'TripPlannerSession', [{ op: 'replace', path: '/', value: state }], currentVersion, 'TripPlannerService', `session_${state.sessionId}`, { action: 'update', reason: 'Session updated' });
            }
            else {
                await this.stateStore.create(state.sessionId, 'TripPlannerSession', state, 'TripPlannerService', `session_${state.sessionId}`);
            }
        }
    }
    addPendingChange(state, change) {
        if (!state.pendingChanges) {
            state.pendingChanges = [];
        }
        state.pendingChanges.push(change);
    }
    async rollbackToCheckpoint(sessionId, checkpointId) {
        if (!this.stateStore) {
            return { success: false, message: 'StateStore 未配置，无法回滚' };
        }
        const checkpoints = await this.stateStore.getCheckpoints(sessionId, 'TripPlannerSession');
        if (checkpoints.length === 0) {
            return { success: false, message: '没有可用的检查点' };
        }
        const targetCheckpoint = checkpointId
            ? checkpoints.find(cp => cp.checkpointId === checkpointId)
            : checkpoints[checkpoints.length - 1];
        if (!targetCheckpoint) {
            return { success: false, message: '指定的检查点不存在' };
        }
        const result = await this.stateStore.rollbackToCheckpoint(sessionId, 'TripPlannerSession', targetCheckpoint.checkpointId, 'TripPlannerService', `rollback_${sessionId}`);
        if (result.success) {
            const stored = await this.stateStore.get(sessionId, 'TripPlannerSession');
            if (stored) {
                this.sessionCache.set(sessionId, stored.data);
            }
            return { success: true, message: `已回滚到版本 ${result.rolledBackTo}` };
        }
        return { success: false, message: result.error || '回滚失败' };
    }
    async createCheckpoint(sessionId, reason) {
        if (!this.stateStore) {
            return null;
        }
        const checkpoint = await this.stateStore.createCheckpoint(sessionId, 'TripPlannerSession', 'TripPlannerService', reason);
        return (checkpoint === null || checkpoint === void 0 ? void 0 : checkpoint.checkpointId) || null;
    }
    mapSuggestionTypeToAction(suggestionType) {
        const mapping = {
            'timing': 'modify_time',
            'early_start': 'modify_time',
            'late_end': 'modify_time',
            'time_conflict': 'modify_time',
            'distance': 'optimize_route',
            'overlap': 'modify_time',
            'add_restaurant': 'add_meal',
            'add_activity': 'add_place',
        };
        return mapping[suggestionType] || suggestionType;
    }
    async applySuggestion(dto, userId) {
        this.logger.debug(`[应用建议] tripId=${dto.tripId}, type=${dto.suggestionType}, day=${dto.targetDay}`);
        const state = this.sessionCache.get(dto.sessionId);
        if (!state) {
            throw new Error('会话不存在或已过期');
        }
        const tripContext = state.tripContext;
        if (dto.targetDay < 1 || dto.targetDay > tripContext.days.length) {
            throw new Error(`目标天数无效: ${dto.targetDay}，行程共 ${tripContext.days.length} 天`);
        }
        const targetDayContext = tripContext.days[dto.targetDay - 1];
        const actionType = this.mapSuggestionTypeToAction(dto.suggestionType);
        switch (actionType) {
            case 'add_place':
            case 'add_meal':
                return this.applyAddPlaceSuggestion(dto, targetDayContext, tripContext, state);
            case 'modify_time':
                return this.applyModifyTimeSuggestion(dto, targetDayContext, tripContext, state);
            case 'optimize_route':
                return this.applyOptimizeRouteSuggestion(dto, tripContext, state);
            default:
                throw new Error(`不支持的建议类型: ${dto.suggestionType}（映射后: ${actionType}）`);
        }
    }
    async applyAddPlaceSuggestion(dto, targetDay, tripContext, state) {
        var _a;
        if (!dto.place) {
            throw new Error('add_place/add_meal 类型需要提供 place 信息');
        }
        let startTime;
        let endTime;
        if (dto.timeSlot) {
            startTime = dto.timeSlot.start;
            endTime = dto.timeSlot.end;
        }
        else {
            const freeSlot = this.findFreeSlot(targetDay, 60);
            if (!freeSlot) {
                throw new Error(`第${dto.targetDay}天没有空闲时段`);
            }
            startTime = freeSlot.start;
            endTime = freeSlot.end;
        }
        const hasConflict = targetDay.items.some(item => {
            if (!item.startTime)
                return false;
            const itemStart = this.parseTimeToMinutes(item.startTime);
            const itemEnd = item.endTime
                ? this.parseTimeToMinutes(item.endTime)
                : itemStart + (item.duration || 60);
            const newStart = this.parseTimeToMinutes(startTime);
            const newEnd = this.parseTimeToMinutes(endTime);
            return !(newEnd <= itemStart || newStart >= itemEnd);
        });
        if (hasConflict) {
            throw new Error(`时间段 ${startTime}-${endTime} 与现有行程冲突`);
        }
        const newItemId = `item_${(0, crypto_1.randomUUID)().substring(0, 8)}`;
        const itemType = dto.suggestionType === 'add_meal' ? 'RESTAURANT' : 'POI';
        const dbItemType = dto.suggestionType === 'add_meal' ? 'MEAL_ANCHOR' : 'ACTIVITY';
        if (this.prisma && targetDay.dayId) {
            try {
                const dayDate = new Date(targetDay.date);
                const [startHour, startMin] = startTime.split(':').map(Number);
                const [endHour, endMin] = endTime.split(':').map(Number);
                const startDateTime = new Date(dayDate);
                startDateTime.setHours(startHour, startMin, 0, 0);
                const endDateTime = new Date(dayDate);
                endDateTime.setHours(endHour, endMin, 0, 0);
                const maxOrderItem = await this.prisma.itineraryItem.findFirst({
                    where: { tripDayId: targetDay.dayId },
                    orderBy: { order: 'desc' },
                    select: { order: true },
                });
                const orderValue = (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== null && (maxOrderItem === null || maxOrderItem === void 0 ? void 0 : maxOrderItem.order) !== undefined
                    ? maxOrderItem.order + 1
                    : 1;
                await this.prisma.itineraryItem.create({
                    data: {
                        id: newItemId,
                        tripDayId: targetDay.dayId,
                        type: dbItemType,
                        startTime: startDateTime,
                        endTime: endDateTime,
                        placeId: dto.place.placeId || null,
                        note: dto.place.address || null,
                        order: orderValue,
                    },
                });
            }
            catch (error) {
                this.logger.error(`[应用建议] 数据库保存失败: ${error.message}`);
            }
        }
        targetDay.items.push({
            itemId: newItemId,
            type: itemType,
            name: dto.place.nameCN || dto.place.name,
            startTime,
            endTime,
            duration: this.parseTimeToMinutes(endTime) - this.parseTimeToMinutes(startTime),
            poiId: (_a = dto.place.placeId) === null || _a === void 0 ? void 0 : _a.toString(),
            address: dto.place.address,
        });
        this.addMessage(state, {
            id: (0, crypto_1.randomUUID)(),
            role: 'system',
            content: `用户应用了建议：添加「${dto.place.name}」到第${dto.targetDay}天 ${startTime}-${endTime}`,
            timestamp: new Date().toISOString(),
        });
        await this.saveSession(state);
        const followUpSuggestions = [];
        const prevItem = targetDay.items
            .filter(i => i.startTime && this.parseTimeToMinutes(i.startTime) < this.parseTimeToMinutes(startTime))
            .sort((a, b) => this.parseTimeToMinutes(b.startTime) - this.parseTimeToMinutes(a.startTime))[0];
        if (prevItem) {
            const prevItemName = this.getItemName(prevItem);
            const placeName = dto.place.name || dto.place.nameCN || '目的地';
            followUpSuggestions.push(`需要我帮您规划从${prevItemName}到${placeName}的交通吗？`);
        }
        const nextItem = targetDay.items
            .filter(i => i.startTime && this.parseTimeToMinutes(i.startTime) > this.parseTimeToMinutes(endTime))
            .sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime))[0];
        if (nextItem) {
            const nextItemName = this.getItemName(nextItem);
            followUpSuggestions.push(`${endTime}之后要去${nextItemName}，需要我检查时间安排吗？`);
        }
        return {
            message: `已将「${dto.place.name}」添加到第${dto.targetDay}天 ${startTime}-${endTime}`,
            item: {
                id: newItemId,
                tripDayId: targetDay.dayId || `day_${dto.targetDay}`,
                startTime: `${targetDay.date}T${startTime}:00.000Z`,
                endTime: `${targetDay.date}T${endTime}:00.000Z`,
                type: itemType === 'RESTAURANT' ? 'MEAL_ANCHOR' : 'ACTIVITY',
                placeId: dto.place.placeId,
            },
            tripUpdate: {
                totalChanges: 1,
                addedItems: 1,
                removedItems: 0,
                modifiedItems: 0,
                affectedDays: [dto.targetDay],
            },
            followUpSuggestions,
        };
    }
    async fixNightActivities(dto) {
        this.logger.debug(`[修复凌晨活动] tripId=${dto.tripId}`);
        const tripContext = await this.loadTripContext(dto.tripId);
        const nightActivities = [];
        for (const day of tripContext.days) {
            for (const item of day.items) {
                if (item.startTime) {
                    const startMinutes = this.parseTimeToMinutes(item.startTime);
                    if (startMinutes >= 0 && startMinutes < 360) {
                        nightActivities.push({ day: day.dayNumber, item, dayContext: day });
                    }
                }
            }
        }
        if (nightActivities.length === 0) {
            return {
                sessionId: dto.sessionId,
                message: '没有找到需要调整的凌晨活动。您的行程安排看起来已经很合理了！',
                phase: 'OVERVIEW',
                intent: 'OPTIMIZE_ROUTE',
            };
        }
        const adjustments = [];
        let totalChanges = 0;
        for (const { day, item, dayContext } of nightActivities) {
            const oldStartTime = item.startTime;
            const duration = item.duration || 60;
            let newStartMinutes = 9 * 60;
            const otherActivities = dayContext.items
                .filter(i => i.itemId !== item.itemId && i.startTime)
                .sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime));
            if (otherActivities.length > 0) {
                const firstActivity = otherActivities[0];
                const firstStartMinutes = this.parseTimeToMinutes(firstActivity.startTime);
                if (firstStartMinutes >= 9 * 60 + duration + 30) {
                    newStartMinutes = 9 * 60;
                }
                else {
                    const lastActivity = otherActivities[otherActivities.length - 1];
                    const lastEndMinutes = lastActivity.endTime
                        ? this.parseTimeToMinutes(lastActivity.endTime)
                        : this.parseTimeToMinutes(lastActivity.startTime) + (lastActivity.duration || 60);
                    newStartMinutes = lastEndMinutes + 30;
                }
            }
            const newStartTimeStr = `${Math.floor(newStartMinutes / 60).toString().padStart(2, '0')}:${(newStartMinutes % 60).toString().padStart(2, '0')}`;
            const newEndMinutes = newStartMinutes + duration;
            const newEndTimeStr = `${Math.floor(newEndMinutes / 60).toString().padStart(2, '0')}:${(newEndMinutes % 60).toString().padStart(2, '0')}`;
            let dayDateStr = dayContext.date;
            if (!dayDateStr && tripContext.startDate) {
                const startDate = new Date(tripContext.startDate);
                startDate.setDate(startDate.getDate() + day - 1);
                dayDateStr = startDate.toISOString().split('T')[0];
            }
            if (!dayDateStr) {
                dayDateStr = new Date().toISOString().split('T')[0];
            }
            if (this.prisma && item.itemId) {
                try {
                    await this.prisma.itineraryItem.update({
                        where: { id: item.itemId },
                        data: {
                            startTime: new Date(`${dayDateStr}T${newStartTimeStr}:00`),
                            endTime: new Date(`${dayDateStr}T${newEndTimeStr}:00`),
                        },
                    });
                    totalChanges++;
                    adjustments.push(`第${day}天「${item.name}」: ${oldStartTime} → ${newStartTimeStr}`);
                }
                catch (error) {
                    this.logger.warn(`[修复凌晨活动] 更新失败: ${error}`);
                }
            }
        }
        const message = totalChanges > 0
            ? `已成功调整 ${totalChanges} 个凌晨活动的时间：\n\n${adjustments.map(a => `✅ ${a}`).join('\n')}\n\n现在您的行程安排更加合理了！`
            : '调整过程中遇到问题，请稍后重试。';
        return {
            sessionId: dto.sessionId,
            message,
            phase: 'OVERVIEW',
            intent: 'OPTIMIZE_ROUTE',
            tripUpdate: {
                changed: totalChanges > 0,
                summary: `调整了 ${totalChanges} 个凌晨活动`,
                affectedDays: [...new Set(nightActivities.map(n => n.day))],
            },
        };
    }
    async applyPendingChange(dto) {
        this.logger.debug(`[应用待处理更改] changeId=${dto.changeId}`);
        return {
            sessionId: dto.sessionId,
            message: '已应用当前的优化建议。您的行程已更新！',
            phase: 'OVERVIEW',
            intent: 'OPTIMIZE_ROUTE',
        };
    }
    async confirmChanges(dto) {
        this.logger.debug(`[确认修改] changeIds=${dto.changeIds.join(',')}`);
        const state = await this.loadOrCreateSession({
            tripId: dto.tripId,
            userId: dto.userId,
            sessionId: dto.sessionId,
            message: '__CONFIRM_CHANGES__',
        });
        const appliedChanges = [];
        const failedChanges = [];
        for (const changeId of dto.changeIds) {
            try {
                await this.applyPendingChange({
                    tripId: dto.tripId,
                    sessionId: dto.sessionId,
                    changeId,
                    userId: dto.userId,
                });
                appliedChanges.push(changeId);
            }
            catch (error) {
                this.logger.warn(`[确认修改] 应用更改失败: changeId=${changeId}, error=${error.message}`);
                failedChanges.push(changeId);
            }
        }
        if (state.pendingChanges) {
            state.pendingChanges = state.pendingChanges.filter(change => !dto.changeIds.includes(change.id));
            await this.saveSession(state);
        }
        const message = appliedChanges.length > 0
            ? `已成功应用 ${appliedChanges.length} 个修改。${failedChanges.length > 0 ? `有 ${failedChanges.length} 个修改应用失败。` : ''}`
            : `所有修改应用失败。`;
        return {
            sessionId: dto.sessionId,
            message,
            phase: state.phase,
            intent: 'OPTIMIZE_ROUTE',
            quickActions: [
                { id: '1', label: '📋 查看行程', action: 'SHOW_OVERVIEW', style: 'secondary' },
            ],
        };
    }
    async applyModifyTimeSuggestion(dto, targetDay, tripContext, state) {
        var _a, _b, _c;
        this.logger.debug(`[应用时间调整建议] day=${dto.targetDay}, suggestionId=${dto.suggestionId}`);
        const activitiesWithTime = targetDay.items
            .filter(item => item.startTime && item.type !== 'TRANSPORT')
            .sort((a, b) => {
            const timeA = this.parseTimeToMinutes(a.startTime);
            const timeB = this.parseTimeToMinutes(b.startTime);
            return timeA - timeB;
        });
        if (activitiesWithTime.length === 0) {
            return {
                message: '没有找到需要调整时间的行程项',
                tripUpdate: {
                    totalChanges: 0,
                    addedItems: 0,
                    removedItems: 0,
                    modifiedItems: 0,
                    affectedDays: [],
                },
            };
        }
        const targetItem = activitiesWithTime[0];
        const originalStartTime = targetItem.startTime;
        const currentStartTimeMinutes = this.parseTimeToMinutes(originalStartTime);
        if (currentStartTimeMinutes >= 6 * 60) {
            return {
                message: `行程项「${this.getItemName(targetItem)}」的开始时间 ${originalStartTime} 已经合理，无需调整`,
                tripUpdate: {
                    totalChanges: 0,
                    addedItems: 0,
                    removedItems: 0,
                    modifiedItems: 0,
                    affectedDays: [],
                },
            };
        }
        const recommendedStartTimeMinutes = ((_a = dto.timeSlot) === null || _a === void 0 ? void 0 : _a.start)
            ? this.parseTimeToMinutes(dto.timeSlot.start)
            : 8 * 60;
        const finalStartTimeMinutes = Math.max(recommendedStartTimeMinutes, 6 * 60);
        const timeDiff = finalStartTimeMinutes - currentStartTimeMinutes;
        const newStartTime = this.formatMinutesToTime(finalStartTimeMinutes);
        const originalEndTime = targetItem.endTime;
        const originalDuration = targetItem.duration ||
            (originalEndTime ? this.parseTimeToMinutes(originalEndTime) - currentStartTimeMinutes : 120);
        const newEndTimeMinutes = finalStartTimeMinutes + originalDuration;
        const newEndTime = this.formatMinutesToTime(newEndTimeMinutes);
        const adjustedItems = [];
        if (this.prisma && targetItem.itemId) {
            try {
                const dayDate = new Date(targetDay.date);
                const [startHour, startMin] = newStartTime.split(':').map(Number);
                const [endHour, endMin] = newEndTime.split(':').map(Number);
                const startDateTime = new Date(dayDate);
                startDateTime.setHours(startHour, startMin, 0, 0);
                const endDateTime = new Date(dayDate);
                endDateTime.setHours(endHour, endMin, 0, 0);
                await this.prisma.itineraryItem.update({
                    where: { id: targetItem.itemId },
                    data: {
                        startTime: startDateTime,
                        endTime: endDateTime,
                    },
                });
                adjustedItems.push(targetItem.itemId);
                this.logger.debug(`[应用时间调整建议] 已更新数据库: itemId=${targetItem.itemId}, newTime=${newStartTime}-${newEndTime}`);
            }
            catch (error) {
                this.logger.error(`[应用时间调整建议] 数据库更新失败: ${error.message}`);
            }
        }
        targetItem.startTime = newStartTime;
        targetItem.endTime = newEndTime;
        const allItems = targetDay.items
            .filter(item => item.startTime)
            .sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime));
        const targetItemIndex = allItems.findIndex(item => item.itemId === targetItem.itemId);
        for (let i = targetItemIndex + 1; i < allItems.length; i++) {
            const currentItem = allItems[i];
            const prevItem = allItems[i - 1];
            const prevEndTime = this.parseTimeToMinutes(prevItem.endTime || this.formatMinutesToTime(this.parseTimeToMinutes(prevItem.startTime) + (prevItem.duration || 120)));
            const currentStartTime = this.parseTimeToMinutes(currentItem.startTime);
            if (currentStartTime < prevEndTime) {
                const bufferMinutes = 15;
                const adjustedStartTime = prevEndTime + bufferMinutes;
                const adjustedStartTimeStr = this.formatMinutesToTime(adjustedStartTime);
                const adjustedDuration = currentItem.duration || 120;
                const adjustedEndTimeStr = this.formatMinutesToTime(adjustedStartTime + adjustedDuration);
                currentItem.startTime = adjustedStartTimeStr;
                currentItem.endTime = adjustedEndTimeStr;
                if (this.prisma && currentItem.itemId) {
                    try {
                        const dayDate = new Date(targetDay.date);
                        const [startHour, startMin] = adjustedStartTimeStr.split(':').map(Number);
                        const [endHour, endMin] = adjustedEndTimeStr.split(':').map(Number);
                        const startDateTime = new Date(dayDate);
                        startDateTime.setHours(startHour, startMin, 0, 0);
                        const endDateTime = new Date(dayDate);
                        endDateTime.setHours(endHour, endMin, 0, 0);
                        await this.prisma.itineraryItem.update({
                            where: { id: currentItem.itemId },
                            data: {
                                startTime: startDateTime,
                                endTime: endDateTime,
                            },
                        });
                        adjustedItems.push(currentItem.itemId);
                    }
                    catch (error) {
                        this.logger.warn(`[应用时间调整建议] 调整后续项失败: ${error.message}`);
                    }
                }
            }
        }
        const itemName = this.getItemName(targetItem);
        this.addMessage(state, {
            id: `msg_${Date.now()}`,
            role: 'system',
            content: `已接受建议：将「${itemName}」的开始时间从 ${originalStartTime} 调整为 ${newStartTime}`,
            timestamp: new Date().toISOString(),
        });
        try {
            const reEvaluation = await this.evaluateWithGuardians(state, 'GENERAL_CHAT', `时间已调整，请重新评估第${dto.targetDay}天的安排`);
            if (((_b = reEvaluation.evaluation.abu) === null || _b === void 0 ? void 0 : _b.issues.length) === 0 ||
                !((_c = reEvaluation.evaluation.abu) === null || _c === void 0 ? void 0 : _c.issues.some(issue => issue.includes(itemName) || issue.includes('太早')))) {
                this.logger.debug(`[应用时间调整建议] 重新评估确认问题已解决`);
            }
        }
        catch (error) {
            this.logger.warn(`[应用时间调整建议] 重新评估失败: ${error.message}`);
        }
        await this.saveSession(state);
        return {
            message: `已将「${itemName}」的开始时间从 ${originalStartTime} 调整为 ${newStartTime}${adjustedItems.length > 1 ? `，并调整了 ${adjustedItems.length - 1} 个后续行程项` : ''}`,
            item: {
                id: targetItem.itemId,
                tripDayId: targetDay.dayId,
                startTime: `${targetDay.date}T${newStartTime}:00.000Z`,
                endTime: `${targetDay.date}T${newEndTime}:00.000Z`,
                type: targetItem.type,
                placeId: targetItem.poiId ? parseInt(targetItem.poiId, 10) : undefined,
            },
            tripUpdate: {
                totalChanges: adjustedItems.length,
                addedItems: 0,
                removedItems: 0,
                modifiedItems: adjustedItems.length,
                affectedDays: [dto.targetDay],
            },
            suggestionStatus: 'RESOLVED',
        };
    }
    async applyOptimizeRouteSuggestion(dto, tripContext, state) {
        return {
            message: '路线优化功能即将推出',
            tripUpdate: {
                totalChanges: 0,
                addedItems: 0,
                removedItems: 0,
                modifiedItems: 0,
                affectedDays: [],
            },
        };
    }
    findFreeSlot(day, durationMinutes) {
        const sortedItems = day.items
            .filter(item => item.startTime)
            .sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime));
        let currentTime = 9 * 60;
        const endOfDay = 21 * 60;
        for (const item of sortedItems) {
            const itemStart = this.parseTimeToMinutes(item.startTime);
            const itemEnd = item.endTime
                ? this.parseTimeToMinutes(item.endTime)
                : itemStart + (item.duration || 60);
            if (itemStart - currentTime >= durationMinutes) {
                return {
                    start: this.formatMinutesToTime(currentTime),
                    end: this.formatMinutesToTime(currentTime + durationMinutes),
                };
            }
            currentTime = Math.max(currentTime, itemEnd);
        }
        if (endOfDay - currentTime >= durationMinutes) {
            return {
                start: this.formatMinutesToTime(currentTime),
                end: this.formatMinutesToTime(currentTime + durationMinutes),
            };
        }
        return null;
    }
    normalizeTimeField(time) {
        if (!time)
            return undefined;
        if (typeof time === 'string') {
            if (time.includes('T')) {
                const d = new Date(time);
                const localHours = d.getHours();
                const localMinutes = d.getMinutes();
                if (localHours >= 0 && localHours < 24 && localMinutes >= 0 && localMinutes < 60) {
                    return `${localHours.toString().padStart(2, '0')}:${localMinutes.toString().padStart(2, '0')}`;
                }
                const utcHours = d.getUTCHours();
                const utcMinutes = d.getUTCMinutes();
                if (utcHours >= 0 && utcHours < 24 && utcMinutes >= 0 && utcMinutes < 60) {
                    this.logger.warn(`[normalizeTimeField] 本地时间不合理，使用UTC时间: ${time} -> ${utcHours}:${utcMinutes}`);
                    return `${utcHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
                }
                return undefined;
            }
            const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    return time;
                }
            }
            return undefined;
        }
        if (time instanceof Date) {
            const localHours = time.getHours();
            const localMinutes = time.getMinutes();
            if (localHours >= 0 && localHours < 24 && localMinutes >= 0 && localMinutes < 60) {
                return `${localHours.toString().padStart(2, '0')}:${localMinutes.toString().padStart(2, '0')}`;
            }
            const utcHours = time.getUTCHours();
            const utcMinutes = time.getUTCMinutes();
            if (utcHours >= 0 && utcHours < 24 && utcMinutes >= 0 && utcMinutes < 60) {
                this.logger.warn(`[normalizeTimeField] 本地时间不合理，使用UTC时间: ${time} -> ${utcHours}:${utcMinutes}`);
                return `${utcHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
            }
            return undefined;
        }
        if (typeof time === 'number') {
            const h = Math.floor(time / 60);
            const m = time % 60;
            if (h >= 0 && h < 24 && m >= 0 && m < 60) {
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            }
            return undefined;
        }
        return undefined;
    }
    parseTimeToMinutes(time) {
        if (typeof time === 'number')
            return time;
        if (time instanceof Date)
            return time.getHours() * 60 + time.getMinutes();
        if (typeof time === 'string') {
            if (time.includes('T')) {
                const d = new Date(time);
                return d.getHours() * 60 + d.getMinutes();
            }
            const [h, m] = time.split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        }
        return 0;
    }
    formatMinutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    addMessage(state, message) {
        state.messages.push(message);
        if (state.messages.length > 50) {
            state.messages = state.messages.slice(-50);
        }
    }
    async loadTripContext(tripId) {
        var _a, _b, _c;
        if (!this.prisma) {
            return this.getMockTripContext(tripId);
        }
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    orderBy: { date: 'asc' },
                    include: {
                        ItineraryItem: {
                            orderBy: { startTime: 'asc' },
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            this.logger.warn(`[规划助手] 行程不存在: ${tripId}，使用模拟数据`);
            return this.getMockTripContext(tripId);
        }
        const budgetConfig = trip.budgetConfig || {};
        const pacingConfig = trip.pacingConfig || {};
        const metadata = trip.metadata || {};
        const days = (trip.TripDay || []).map((day, index) => {
            const items = day.ItineraryItem || [];
            return {
                dayId: day.id,
                dayNumber: index + 1,
                date: day.date.toISOString().split('T')[0],
                theme: day.theme,
                city: day.city,
                items: items.map((item) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                    const itemId = item.id || '';
                    const placeNameCN = ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.nameCN) || ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.name);
                    const placeNameEN = ((_c = item.Place) === null || _c === void 0 ? void 0 : _c.nameEN) || ((_d = item.Place) === null || _d === void 0 ? void 0 : _d.name);
                    const name = placeNameCN || placeNameEN || item.title || item.name || item.placeName || ((_e = item.place) === null || _e === void 0 ? void 0 : _e.name) || ((_f = item.activity) === null || _f === void 0 ? void 0 : _f.name) || '';
                    const finalName = name && name.trim() !== ''
                        ? name
                        : (itemId ? `活动 ${itemId.slice(-6)}` : '活动（名称缺失）');
                    return {
                        itemId,
                        type: item.type || 'ACTIVITY',
                        name: finalName,
                        nameCN: placeNameCN || item.nameCN || item.title_cn || item.placeName_cn,
                        startTime: this.normalizeTimeField(item.startTime),
                        endTime: this.normalizeTimeField(item.endTime),
                        duration: item.duration,
                        cost: item.cost,
                        address: item.address || ((_g = item.location) === null || _g === void 0 ? void 0 : _g.address) || ((_h = item.place) === null || _h === void 0 ? void 0 : _h.address),
                        notes: item.notes,
                        poiId: item.poiId || item.placeId,
                        cityName: item.cityName || item.city || ((_j = item.place) === null || _j === void 0 ? void 0 : _j.city),
                        location: item.location || ((_k = item.place) === null || _k === void 0 ? void 0 : _k.location),
                    };
                }),
                stats: {
                    itemCount: items.length,
                    totalDuration: items.reduce((sum, item) => sum + (item.duration || 0), 0),
                    totalCost: items.reduce((sum, item) => sum + (item.cost || 0), 0),
                    freeTime: 0,
                    travelTime: 0,
                },
            };
        });
        const totalItems = days.reduce((sum, d) => sum + d.stats.itemCount, 0);
        const expectedItems = days.length * 4;
        const completeness = Math.min(100, Math.round((totalItems / expectedItems) * 100));
        return {
            tripId,
            destination: trip.destination,
            destinationName: this.getDestinationName(trip.destination),
            startDate: trip.startDate.toISOString().split('T')[0],
            endDate: trip.endDate.toISOString().split('T')[0],
            durationDays: days.length,
            totalBudget: budgetConfig.totalBudget || 0,
            remainingBudget: budgetConfig.remaining_for_ground,
            travelers: {
                adults: ((_a = budgetConfig.travelers) === null || _a === void 0 ? void 0 : _a.filter((t) => t.type === 'ADULT').length) || 1,
                children: ((_b = budgetConfig.travelers) === null || _b === void 0 ? void 0 : _b.filter((t) => t.type === 'CHILD').length) || 0,
                elderly: ((_c = budgetConfig.travelers) === null || _c === void 0 ? void 0 : _c.filter((t) => t.type === 'ELDERLY').length) || 0,
            },
            pacingConfig: {
                level: pacingConfig.level || 'STANDARD',
                maxDailyActivities: pacingConfig.maxDailyActivities || 5,
            },
            days,
            preferences: metadata.preferences,
            status: trip.status,
            completeness,
        };
    }
    getDestinationName(code) {
        const names = {
            JP: '日本',
            TH: '泰国',
            IS: '冰岛',
            SG: '新加坡',
            KR: '韩国',
            MY: '马来西亚',
            VN: '越南',
            FR: '法国',
            IT: '意大利',
            ES: '西班牙',
            DE: '德国',
            GB: '英国',
            CH: '瑞士',
            US: '美国',
            AU: '澳大利亚',
        };
        return names[code] || code;
    }
    async generateOverviewMessage(ctx) {
        return `📍 **${ctx.destinationName || ctx.destination} ${ctx.durationDays}天行程概览**

📅 日期：${ctx.startDate} ~ ${ctx.endDate}
👥 旅行者：${ctx.travelers.adults}大${ctx.travelers.children > 0 ? ctx.travelers.children + '小' : ''}${ctx.travelers.elderly > 0 ? ctx.travelers.elderly + '老' : ''}
💰 预算：¥${ctx.totalBudget.toLocaleString()}
📊 完成度：${ctx.completeness}%

${ctx.days.map(d => `**第${d.dayNumber}天** (${d.date})${d.theme ? ` - ${d.theme}` : ''}\n  ${d.items.length > 0 ? d.items.map(i => `• ${i.name}`).join('\n  ') : '暂无安排'}`).join('\n\n')}`;
    }
    detectTripIssues(ctx) {
        const issues = [];
        const emptyDays = ctx.days.filter(day => day.stats.itemCount === 0).map(day => day.dayNumber);
        if (emptyDays.length > 0) {
            if (emptyDays.length === 1) {
                issues.push(`${emptyDays.length}天未安排`);
            }
            else {
                issues.push(`${emptyDays.length}天未安排`);
            }
        }
        const tightDays = ctx.days.filter(day => day.stats.totalDuration > 12 * 60).map(day => day.dayNumber);
        if (tightDays.length > 0) {
            issues.push(`${tightDays.length}天安排较紧凑`);
        }
        if (ctx.completeness < 50) {
            issues.push('完成度较低');
        }
        return issues;
    }
    generateSmartQuickActions(ctx) {
        const quickActions = [];
        let actionId = 1;
        const issues = this.detectTripIssues(ctx);
        let issueMessage;
        if (issues.length > 0) {
            const issueSummary = issues.length === 1
                ? issues[0]
                : `${issues.slice(0, 2).join('、')}${issues.length > 2 ? '等' : ''}`;
            issueMessage = `⚠️ ${issueSummary}`;
            quickActions.push({
                id: String(actionId++),
                label: '🔧 修复问题',
                action: 'FIX_ISSUES',
                style: 'danger',
            });
        }
        const emptyDays = ctx.days.filter(day => day.stats.itemCount === 0).length;
        const hasActivities = ctx.days.some(day => day.stats.itemCount > 0);
        if (emptyDays > ctx.durationDays / 2) {
            quickActions.push({
                id: String(actionId++),
                label: '✨ 智能填充行程',
                action: 'FILL_FREE_TIME',
                style: 'primary',
            });
        }
        else if (hasActivities) {
            quickActions.push({
                id: String(actionId++),
                label: '📍 优化行程路线',
                action: 'OPTIMIZE_ROUTE',
                style: 'primary',
            });
        }
        const destination = (ctx.destination || '').toLowerCase();
        const destinationName = ctx.destinationName || ctx.destination || '';
        const destinationFeatures = this.getDestinationFeatures(destination, destinationName);
        if (destinationFeatures.specialAction) {
            quickActions.push({
                id: String(actionId++),
                label: destinationFeatures.specialAction.label,
                action: destinationFeatures.specialAction.action,
                style: 'secondary',
            });
        }
        const hasMeals = ctx.days.some(day => day.items.some(item => { var _a; return item.type === 'RESTAURANT' || ((_a = item.category) === null || _a === void 0 ? void 0 : _a.includes('餐')); }));
        const hasTransport = ctx.days.some(day => day.items.some(item => item.type === 'TRANSPORT'));
        if (!hasMeals && quickActions.length < 4) {
            quickActions.push({
                id: String(actionId++),
                label: '🍜 推荐餐厅',
                action: 'ARRANGE_MEALS',
                style: 'secondary',
            });
        }
        if (!hasTransport && ctx.durationDays > 1 && quickActions.length < 4) {
            quickActions.push({
                id: String(actionId++),
                label: '🚗 规划交通',
                action: 'PLAN_TRANSPORT',
                style: 'secondary',
            });
        }
        const startDate = ctx.startDate ? new Date(ctx.startDate) : null;
        const now = new Date();
        const daysUntilTrip = startDate ? Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
        if (daysUntilTrip !== null && daysUntilTrip <= 7 && daysUntilTrip > 0) {
            quickActions.push({
                id: String(actionId++),
                label: '✅ 行前清单',
                action: 'CREATE_CHECKLIST',
                style: 'secondary',
            });
        }
        const defaultActions = [
            { label: '📍 优化行程路线', action: 'OPTIMIZE_ROUTE' },
            { label: '🍜 推荐餐厅', action: 'ARRANGE_MEALS' },
            { label: '❓ 问问题', action: 'ASK_QUESTION' },
            { label: '✅ 行前清单', action: 'CREATE_CHECKLIST' },
        ];
        for (const defaultAction of defaultActions) {
            if (quickActions.length >= 5)
                break;
            if (!quickActions.some(qa => qa.action === defaultAction.action)) {
                quickActions.push({
                    id: String(actionId++),
                    label: defaultAction.label,
                    action: defaultAction.action,
                    style: 'secondary',
                });
            }
        }
        return { quickActions, issueMessage };
    }
    getDestinationFeatures(destination, destinationName) {
        const dest = `${destination} ${destinationName}`.toLowerCase();
        if (dest.includes('iceland') || dest.includes('冰岛') || dest.includes('is')) {
            return {
                specialAction: { label: '🌌 极光观测点', action: 'FIND_AURORA_SPOTS' },
                highlights: ['极光', '冰川徒步', '温泉', '瀑布'],
            };
        }
        if (dest.includes('japan') || dest.includes('日本') || dest.includes('jp') ||
            dest.includes('tokyo') || dest.includes('osaka') || dest.includes('kyoto')) {
            return {
                specialAction: { label: '🍣 美食探店', action: 'FIND_LOCAL_FOOD' },
                highlights: ['美食', '温泉', '购物', '神社'],
            };
        }
        if (dest.includes('thailand') || dest.includes('泰国') || dest.includes('th') ||
            dest.includes('bangkok') || dest.includes('phuket') || dest.includes('chiang mai')) {
            return {
                specialAction: { label: '🏝️ 海岛推荐', action: 'FIND_BEACHES' },
                highlights: ['海岛', '美食', '寺庙', 'SPA'],
            };
        }
        if (dest.includes('paris') || dest.includes('london') || dest.includes('rome') ||
            dest.includes('巴黎') || dest.includes('伦敦') || dest.includes('罗马')) {
            return {
                specialAction: { label: '🏛️ 博物馆推荐', action: 'FIND_MUSEUMS' },
                highlights: ['博物馆', '历史建筑', '艺术', '美食'],
            };
        }
        if (dest.includes('maldives') || dest.includes('bali') || dest.includes('hawaii') ||
            dest.includes('马尔代夫') || dest.includes('巴厘岛') || dest.includes('夏威夷')) {
            return {
                specialAction: { label: '🤿 水上活动', action: 'FIND_WATER_ACTIVITIES' },
                highlights: ['潜水', '沙滩', '日落', 'SPA'],
            };
        }
        return {
            specialAction: { label: '🎯 当地特色', action: 'FIND_LOCAL_ATTRACTIONS' },
        };
    }
    generateTimelineData(ctx) {
        return ctx.days.map(day => ({
            day: day.dayNumber,
            date: day.date,
            theme: day.theme,
            items: day.items.map(item => ({
                time: item.startTime,
                name: this.getItemName(item),
                type: item.type,
                duration: item.duration,
            })),
        }));
    }
    async generateRouteSuggestion(ctx, message) {
        if (this.routeOptimization) {
            try {
                const evidence = await this.routeOptimization.optimizeRoute(ctx, {
                    trip_id: ctx.tripId,
                    generate_alternatives: true,
                    max_alternatives: 5,
                });
                return this.formatRouteOptimizationResult(evidence, ctx);
            }
            catch (error) {
                this.logger.warn(`[路线优化] RouteOptimizationService 调用失败，回退到简化版: ${error}`);
            }
        }
        return this.generateRouteSuggestionSimple(ctx, message);
    }
    formatRouteOptimizationResult(evidence, ctx) {
        var _a, _b, _c;
        let result = `📍 **路线优化分析报告**\n\n`;
        if (evidence.conclusion.route_approved) {
            result += `✅ **可执行性评分: ${evidence.conclusion.executability_score}/100**\n\n`;
            result += `您的行程安排整体可执行！\n\n`;
        }
        else {
            result += `⚠️ **可执行性评分: ${evidence.conclusion.executability_score}/100**\n\n`;
            result += `行程存在以下问题需要解决：\n\n`;
        }
        const failedGates = evidence.hard_gates.filter(g => g.result === 'FAIL');
        const warningGates = evidence.hard_gates.filter(g => g.result === 'PASS' && g.severity === 'WARNING');
        if (failedGates.length > 0) {
            result += `**🚨 必须解决的问题**：\n`;
            failedGates.forEach((gate, i) => {
                result += `${i + 1}. ${gate.detail}\n`;
                if (gate.suggestion) {
                    result += `   → ${gate.suggestion}\n`;
                }
            });
            result += '\n';
        }
        if (warningGates.length > 0) {
            result += `**⚠️ 建议关注的问题**：\n`;
            warningGates.slice(0, 3).forEach((gate, i) => {
                result += `${i + 1}. ${gate.detail}\n`;
            });
            if (warningGates.length > 3) {
                result += `   ...还有 ${warningGates.length - 3} 个警告\n`;
            }
            result += '\n';
        }
        result += `**📊 综合评分**：\n`;
        result += `• 疲劳度: ${evidence.soft_scores.fatigue.score}/100 ${evidence.soft_scores.fatigue.exceeded ? '❌ 偏高' : '✅'}\n`;
        result += `• 节奏: ${evidence.soft_scores.pace.score}/100 ${evidence.soft_scores.pace.exceeded ? '❌ 需调整' : '✅'}\n`;
        result += `• 体验: ${evidence.soft_scores.experience.score}/100\n`;
        result += `• 综合: **${evidence.soft_scores.overall}/100**\n\n`;
        if (evidence.key_features.cross_city_segments && evidence.key_features.cross_city_segments.length > 0) {
            result += `**🌍 跨城市行程**：\n`;
            evidence.key_features.cross_city_segments.forEach(seg => {
                result += `• 第${seg.day}天: ${seg.from_city} → ${seg.to_city} (${seg.distance_km}km, 约${Math.round(seg.estimated_travel_minutes / 60)}小时)\n`;
            });
            result += '\n';
        }
        if (evidence.key_features.night_segments && evidence.key_features.night_segments.length > 0) {
            result += `**🌙 夜间活动提醒**：\n`;
            evidence.key_features.night_segments.forEach(seg => {
                const riskIcon = seg.risk_level === 'HIGH' ? '🔴' : seg.risk_level === 'MEDIUM' ? '🟡' : '🟢';
                result += `• ${riskIcon} 第${seg.day}天: ${seg.description || '夜间活动'}\n`;
            });
            result += '\n';
        }
        if (evidence.key_features.no_rescue_segments && evidence.key_features.no_rescue_segments.length > 0) {
            result += `**⚠️ 偏远区域提醒**：\n`;
            evidence.key_features.no_rescue_segments.forEach(seg => {
                const riskIcon = seg.risk_level === 'HIGH' ? '🔴' : seg.risk_level === 'MEDIUM' ? '🟡' : '🟢';
                result += `• ${riskIcon} 第${seg.day}天: ${seg.description || `距离城市中心 ${seg.distance_km}km`}\n`;
            });
            result += '\n';
        }
        if (evidence.candidate_routes && evidence.candidate_routes.routes.length > 0) {
            result += `**🔄 候选路线方案**：\n`;
            evidence.candidate_routes.routes.slice(0, 3).forEach((route, i) => {
                var _a;
                const strategyNames = {
                    'COMPACT': '紧凑型',
                    'BALANCED': '均衡型',
                    'RELAXED': '松弛型',
                };
                const strategyName = strategyNames[route.strategy] || route.strategy;
                const isBest = route.id === ((_a = evidence.candidate_routes) === null || _a === void 0 ? void 0 : _a.best_route_id);
                result += `${i + 1}. ${isBest ? '⭐ ' : ''}${strategyName}: ${route.description} (评分: ${route.score}/100)\n`;
            });
            result += '\n';
        }
        if (evidence.alternatives.length > 0) {
            result += `**💡 建议操作**：\n`;
            evidence.alternatives.slice(0, 3).forEach((alt, i) => {
                const icon = alt.strategy === 'REMOVE_POI' ? '🗑️' :
                    alt.strategy === 'ADJUST_TIME' ? '⏰' :
                        alt.strategy === 'CHANGE_DAY' ? '📅' : '🔧';
                result += `${i + 1}. ${icon} ${alt.description}\n`;
            });
            result += '\n';
        }
        const hasHighRiskNight = (_a = evidence.key_features.night_segments) === null || _a === void 0 ? void 0 : _a.some(s => s.risk_level === 'HIGH');
        const hasMediumRiskNight = (_b = evidence.key_features.night_segments) === null || _b === void 0 ? void 0 : _b.some(s => s.risk_level === 'MEDIUM');
        const hasWarnings = evidence.hard_gates.some(g => g.severity === 'WARNING');
        if (evidence.next_steps.length > 0) {
            const mainStep = evidence.next_steps[0];
            if (mainStep.action === 'AUTO_FIX' || mainStep.action === 'ADJUST') {
                if (hasHighRiskNight) {
                    const nightCount = ((_c = evidence.key_features.night_segments) === null || _c === void 0 ? void 0 : _c.filter(s => s.risk_level === 'HIGH').length) || 0;
                    result += `⚠️ **需要您确认**：有 ${nightCount} 个活动安排在凌晨时段，建议调整时间。\n`;
                    result += `需要我帮您**自动调整**这些活动的时间吗？`;
                }
                else {
                    result += `需要我帮您**自动修复**这些问题吗？`;
                }
            }
            else if (mainStep.action === 'APPLY') {
                if (hasHighRiskNight) {
                    result += `⚠️ 您的行程存在凌晨活动安排，建议调整后再出发。`;
                }
                else if (hasMediumRiskNight || hasWarnings) {
                    result += `您的行程基本可行，但有一些细节可以优化。`;
                }
                else {
                    result += `您的行程安排很完善，可以放心出发！`;
                }
            }
            else if (mainStep.action === 'REJECT') {
                result += `❌ ${mainStep.message}`;
            }
            else {
                result += mainStep.message;
            }
        }
        return result;
    }
    async generateRouteSuggestionSimple(ctx, message) {
        const allSolutions = [];
        const allIssues = [];
        let totalTimeSaved = 0;
        for (const day of ctx.days) {
            const dayAnalysis = this.analyzeDayRoute(day, ctx);
            for (const issue of dayAnalysis.issues) {
                if (!issue.includes(`第${day.dayNumber}天`)) {
                    allIssues.push(`第${day.dayNumber}天: ${issue}`);
                }
                else {
                    allIssues.push(issue);
                }
            }
            allSolutions.push(...dayAnalysis.suggestions);
            totalTimeSaved += dayAnalysis.potentialTimeSaved;
        }
        if (allIssues.length === 0) {
            return `📍 **路线分析结果**

✅ 您的行程安排看起来已经很合理了！

**当前行程概览**：
${ctx.days.map(d => `- 第${d.dayNumber}天（${d.theme || d.city || d.date}）：${d.items.length} 个活动`).join('\n')}

如果您想进一步优化，可以告诉我具体想调整哪一天。`;
        }
        let result = `📍 **路线优化建议**\n\n`;
        result += `**🔍 发现以下问题**：\n`;
        allIssues.slice(0, 6).forEach((issue, i) => {
            result += `${i + 1}. ${issue}\n`;
        });
        if (allIssues.length > 6) {
            result += `   ...还有 ${allIssues.length - 6} 个问题\n`;
        }
        if (allSolutions.length > 0) {
            result += `\n**✅ 解决方案**：\n`;
            const uniqueSolutions = [...new Set(allSolutions)];
            uniqueSolutions.slice(0, 5).forEach((solution) => {
                result += `${solution}\n`;
            });
        }
        if (totalTimeSaved > 0) {
            result += `\n预计优化后可节省约 **${totalTimeSaved} 分钟** 交通时间。`;
        }
        result += `\n\n需要我帮您**自动修复**这些问题吗？`;
        return result;
    }
    analyzeDayRoute(day, ctx) {
        const issues = [];
        const suggestions = [];
        let potentialTimeSaved = 0;
        const itemsWithTime = day.items.filter(item => item.startTime).sort((a, b) => {
            const timeA = this.parseTimeToMinutes(a.startTime);
            const timeB = this.parseTimeToMinutes(b.startTime);
            return timeA - timeB;
        });
        const timeConflictResult = this.detectTimeConflicts(itemsWithTime, day.dayNumber);
        issues.push(...timeConflictResult.issues);
        suggestions.push(...timeConflictResult.solutions);
        const geoResult = this.detectGeographicIssues(day, ctx);
        issues.push(...geoResult.issues);
        suggestions.push(...geoResult.solutions);
        const itemsWithLocation = itemsWithTime.filter(item => item.location);
        if (itemsWithLocation.length < 2) {
            return { issues, suggestions, potentialTimeSaved };
        }
        for (let i = 0; i < itemsWithLocation.length - 1; i++) {
            const current = itemsWithLocation[i];
            const next = itemsWithLocation[i + 1];
            if (current.location && next.location) {
                const distance = this.calculateDistance(current.location.lat, current.location.lng, next.location.lat, next.location.lng);
                if (i < itemsWithLocation.length - 2) {
                    const nextNext = itemsWithLocation[i + 2];
                    if (nextNext.location) {
                        const altDistance1 = this.calculateDistance(current.location.lat, current.location.lng, nextNext.location.lat, nextNext.location.lng);
                        const altDistance2 = this.calculateDistance(next.location.lat, next.location.lng, nextNext.location.lat, nextNext.location.lng);
                        if (altDistance1 + altDistance2 < distance * 1.5) {
                        }
                    }
                }
                if (distance > 50) {
                    issues.push(`第${day.dayNumber}天「${current.name}」→「${next.name}」距离约 ${Math.round(distance)}km，需要较长交通时间`);
                }
                const currentEndTime = current.endTime
                    ? this.parseTimeToMinutes(current.endTime)
                    : this.parseTimeToMinutes(current.startTime) + (current.duration || 60);
                const nextStartTime = this.parseTimeToMinutes(next.startTime);
                const gap = nextStartTime - currentEndTime;
                const estimatedTravelTime = Math.max(15, distance * 1.5);
                if (gap < estimatedTravelTime && distance > 5) {
                    issues.push(`第${day.dayNumber}天「${current.name}」到「${next.name}」时间间隔（${gap}分钟）可能不足以完成 ${Math.round(distance)}km 的交通`);
                    suggestions.push(`建议将「${next.name}」开始时间推迟 ${Math.round(estimatedTravelTime - gap)} 分钟`);
                }
            }
        }
        const totalDuration = day.items.reduce((sum, item) => sum + (item.duration || 60), 0);
        if (totalDuration > 600) {
            issues.push(`第${day.dayNumber}天活动总时长约 ${Math.round(totalDuration / 60)} 小时，可能过于紧凑`);
            suggestions.push(`建议移除或缩短部分活动，预留足够的休息和用餐时间`);
        }
        if (itemsWithLocation.length >= 3) {
            for (let i = 0; i < itemsWithLocation.length - 2; i++) {
                const a = itemsWithLocation[i];
                const b = itemsWithLocation[i + 1];
                const c = itemsWithLocation[i + 2];
                if (a.location && b.location && c.location) {
                    const ab = this.calculateDistance(a.location.lat, a.location.lng, b.location.lat, b.location.lng);
                    const bc = this.calculateDistance(b.location.lat, b.location.lng, c.location.lat, c.location.lng);
                    const ac = this.calculateDistance(a.location.lat, a.location.lng, c.location.lat, c.location.lng);
                    if (ac < (ab + bc) * 0.6 && ab > 5 && bc > 5) {
                        suggestions.push(`第${day.dayNumber}天：建议调整「${a.name}」→「${b.name}」→「${c.name}」的顺序，可能存在绕路`);
                        potentialTimeSaved += Math.round((ab + bc - ac) * 1.5);
                    }
                }
            }
        }
        if (issues.length === 0 && day.items.length > 0) {
            const itemNames = day.items.slice(0, 5).map(i => i.name).join(' → ');
            suggestions.push(`第${day.dayNumber}天路线：${itemNames}${day.items.length > 5 ? ' ...' : ''}`);
        }
        return { issues, suggestions, potentialTimeSaved };
    }
    getItemName(item) {
        var _a;
        const name = item.name || item.placeName || item.title || item.nameCN || ((_a = item.place) === null || _a === void 0 ? void 0 : _a.name) || '';
        if (!name || name.trim() === '') {
            const itemId = item.itemId || item.id || '';
            if (itemId) {
                return `活动 ${itemId.slice(-6)}`;
            }
            return '活动（名称缺失）';
        }
        return name;
    }
    detectTimeConflicts(items, dayNumber) {
        const issues = [];
        const solutions = [];
        const conflictPairs = [];
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const itemA = items[i];
                const itemB = items[j];
                const startA = this.parseTimeToMinutes(itemA.startTime);
                const endA = itemA.endTime
                    ? this.parseTimeToMinutes(itemA.endTime)
                    : startA + (itemA.duration || 60);
                const startB = this.parseTimeToMinutes(itemB.startTime);
                const endB = itemB.endTime
                    ? this.parseTimeToMinutes(itemB.endTime)
                    : startB + (itemB.duration || 60);
                if (!(endA <= startB || endB <= startA)) {
                    const overlapStart = Math.max(startA, startB);
                    const overlapEnd = Math.min(endA, endB);
                    const overlapMinutes = overlapEnd - overlapStart;
                    if (overlapMinutes > 0) {
                        const nameA = this.getItemName(itemA);
                        const nameB = this.getItemName(itemB);
                        issues.push(`⚠️ 「${nameA}」(${this.formatMinutesToTime(startA)}-${this.formatMinutesToTime(endA)}) 与「${nameB}」(${this.formatMinutesToTime(startB)}-${this.formatMinutesToTime(endB)}) 重叠 ${overlapMinutes} 分钟`);
                        conflictPairs.push({ itemA, itemB, overlapMinutes, startA, endA, startB, endB });
                    }
                }
            }
        }
        if (conflictPairs.length > 0) {
            const allConflictItems = new Set();
            conflictPairs.forEach(({ itemA, itemB }) => {
                allConflictItems.add(itemA);
                allConflictItems.add(itemB);
            });
            const sortedItems = Array.from(allConflictItems).sort((a, b) => {
                const startA = this.parseTimeToMinutes(a.startTime);
                const startB = this.parseTimeToMinutes(b.startTime);
                return startA - startB;
            });
            let currentTime = this.parseTimeToMinutes(sortedItems[0].startTime);
            const suggestedSchedule = [];
            for (const item of sortedItems) {
                const duration = item.duration || 60;
                const name = this.getItemName(item);
                const newStart = this.formatMinutesToTime(currentTime);
                const newEnd = this.formatMinutesToTime(currentTime + duration);
                suggestedSchedule.push(`  • ${name}: ${newStart}-${newEnd}`);
                currentTime += duration + 30;
            }
            solutions.push(`💡 **建议重新安排时间**：\n${suggestedSchedule.join('\n')}`);
            if (conflictPairs.length >= 3) {
                solutions.push(`💡 **或者**：将部分活动移到其他天，当天活动安排过密`);
            }
        }
        return { issues, solutions };
    }
    detectGeographicIssues(day, ctx) {
        var _a, _b;
        const issues = [];
        const solutions = [];
        const wrongCityItems = [];
        const cities = new Set();
        const cityItems = new Map();
        const landmarks = {
            '故宫': '北京',
            '天安门': '北京',
            '长城': '北京',
            '颐和园': '北京',
            '圆明园': '北京',
            '天坛': '北京',
            '鸟巢': '北京',
            '外滩': '上海',
            '东方明珠': '上海',
            '豫园': '上海',
            '西湖': '杭州',
            '灵隐寺': '杭州',
            '雷峰塔': '杭州',
            '千岛湖': '杭州',
            '梦想小镇': '杭州',
            '夫子庙': '南京',
            '中山陵': '南京',
            '玄武湖': '南京',
            '东京塔': '东京',
            '浅草寺': '东京',
            '秋叶原': '东京',
            '涩谷': '东京',
            '大阪城': '大阪',
            '道顿堀': '大阪',
            '清水寺': '京都',
            '伏见稻荷': '京都',
            '金阁寺': '京都',
            '埃菲尔': '巴黎',
            '卢浮宫': '巴黎',
            '凯旋门': '巴黎',
        };
        for (const item of day.items) {
            let city = item.cityName;
            const itemName = this.getItemName(item);
            if (!city && item.address) {
                const cityMatch = item.address.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|厦门|青岛|大连|宁波|无锡|东京|大阪|京都|巴黎|伦敦|纽约)/);
                if (cityMatch) {
                    city = cityMatch[1];
                }
            }
            if (!city && itemName) {
                for (const [landmark, landmarkCity] of Object.entries(landmarks)) {
                    if (itemName.includes(landmark)) {
                        city = landmarkCity;
                        break;
                    }
                }
            }
            if (city) {
                cities.add(city);
                if (!cityItems.has(city)) {
                    cityItems.set(city, []);
                }
                cityItems.get(city).push({ name: itemName, item });
            }
        }
        const mainDestination = ctx.destinationName || ctx.destination || '';
        if (cities.size > 1) {
            const cityList = Array.from(cities);
            const cityDistances = [];
            for (let i = 0; i < cityList.length; i++) {
                for (let j = i + 1; j < cityList.length; j++) {
                    const city1 = cityList[i];
                    const city2 = cityList[j];
                    const coord1 = this.CITY_COORDINATES[city1];
                    const coord2 = this.CITY_COORDINATES[city2];
                    if (coord1 && coord2) {
                        const distance = this.calculateDistance(coord1.lat, coord1.lng, coord2.lat, coord2.lng);
                        cityDistances.push({ city1, city2, distance: Math.round(distance) });
                    }
                }
            }
            const adjacentCityGroups = [
                ['杭州', '苏州', '无锡', '上海', '嘉兴', '绍兴'],
                ['南京', '镇江', '扬州'],
                ['北京', '天津'],
                ['广州', '深圳', '东莞', '佛山'],
                ['东京', '横滨'],
                ['大阪', '京都', '奈良', '神户'],
            ];
            let isAdjacent = false;
            for (const group of adjacentCityGroups) {
                if (cityList.every(c => group.includes(c))) {
                    isAdjacent = true;
                    break;
                }
            }
            const farCities = cityDistances.filter(d => d.distance > 200);
            const veryFarCities = cityDistances.filter(d => d.distance > 500);
            if (!isAdjacent || farCities.length > 0) {
                const cityDetails = cityList.map(c => {
                    const itemsInCity = cityItems.get(c) || [];
                    const names = itemsInCity.slice(0, 2).map(i => i.name);
                    return `${c}（${names.join('、')}${itemsInCity.length > 2 ? '等' : ''}）`;
                }).join('、');
                if (farCities.length > 0) {
                    const farthest = farCities.sort((a, b) => b.distance - a.distance)[0];
                    if (farthest.distance > 1000) {
                        issues.push(`🚨 **严重问题**：${farthest.city1} 和 ${farthest.city2} 相距约 **${farthest.distance}公里**，同一天无法完成`);
                        const flightTime = Math.round(farthest.distance / 800);
                        const trainTime = Math.round(farthest.distance / 300);
                        solutions.push(`🚫 **这是不可能完成的行程**：
  • ${farthest.city1} → ${farthest.city2} 需要 ${flightTime}-${flightTime + 1} 小时飞行 或 ${trainTime}-${trainTime + 2} 小时高铁
  • 建议：**立即删除** 不属于本次行程的景点`);
                        const mainCity = (_a = mainDestination.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|厦门|青岛|大连|宁波|无锡|东京|大阪|京都|巴黎|伦敦|纽约)/)) === null || _a === void 0 ? void 0 : _a[1];
                        if (mainCity) {
                            const wrongCity = farthest.city1 === mainCity ? farthest.city2 : farthest.city1;
                            const wrongItems = cityItems.get(wrongCity) || [];
                            if (wrongItems.length > 0) {
                                const wrongNames = wrongItems.map(i => `「${i.name}」`).join('、');
                                solutions.push(`💡 **建议删除** ${wrongNames}（${wrongCity}的景点，不在${mainDestination}）`);
                                for (const { item } of wrongItems) {
                                    wrongCityItems.push({ item, detectedCity: wrongCity });
                                }
                            }
                        }
                    }
                    else if (farthest.distance > 500) {
                        issues.push(`⚠️ ${farthest.city1} 和 ${farthest.city2} 相距约 **${farthest.distance}公里**，同一天很难完成`);
                        const trainTime = Math.round(farthest.distance / 300);
                        solutions.push(`💡 **建议分开安排**：两城市间需要 ${trainTime}-${trainTime + 1} 小时高铁，建议分到不同天`);
                    }
                    else {
                        issues.push(`⚠️ ${farthest.city1} 和 ${farthest.city2} 相距约 **${farthest.distance}公里**，同一天游玩会比较赶`);
                        solutions.push(`💡 **建议**：预留足够的交通时间，或考虑分到不同天`);
                    }
                }
                else {
                    issues.push(`🚨 同一天安排了 ${cityDetails}，这些城市相距较远`);
                    solutions.push(`💡 **建议**：将不同城市的景点分开到不同的天`);
                }
            }
        }
        if (mainDestination && cities.size > 0) {
            const mainCity = (_b = mainDestination.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|厦门|青岛|大连|宁波|无锡|东京|大阪|京都|巴黎|伦敦|纽约)/)) === null || _b === void 0 ? void 0 : _b[1];
            if (mainCity) {
                const mainCoord = this.CITY_COORDINATES[mainCity];
                for (const city of Array.from(cities)) {
                    if (city === mainCity)
                        continue;
                    const cityCoord = this.CITY_COORDINATES[city];
                    if (mainCoord && cityCoord) {
                        const distance = this.calculateDistance(mainCoord.lat, mainCoord.lng, cityCoord.lat, cityCoord.lng);
                        if (distance > 500) {
                            const itemsInWrongCity = cityItems.get(city) || [];
                            const wrongNames = itemsInWrongCity.map(i => `「${i.name}」`).join('、');
                            issues.push(`⚠️ ${wrongNames} 是${city}的景点（距离${mainCity}约${Math.round(distance)}公里），但行程目的地是${mainDestination}`);
                            for (const { item } of itemsInWrongCity) {
                                wrongCityItems.push({ item, detectedCity: city });
                            }
                            solutions.push(`💡 **建议删除** ${wrongNames}，这些景点不在您的行程目的地（${mainDestination}）`);
                        }
                    }
                }
            }
        }
        return { issues, solutions, wrongCityItems };
    }
    async findAlternativePois(ctx, message) {
        return [
            { id: '1', name: '替代景点A', reason: '同类型，评分更高', duration: 120, cost: 100 },
            { id: '2', name: '替代景点B', reason: '距离更近，省时间', duration: 90, cost: 80 },
            { id: '3', name: '替代景点C', reason: '更适合带小孩', duration: 150, cost: 120 },
        ];
    }
    analyzePace(ctx) {
        const avgItems = ctx.days.reduce((sum, d) => sum + d.stats.itemCount, 0) / ctx.days.length;
        return {
            summary: `当前平均每天 ${avgItems.toFixed(1)} 个活动，总体节奏${avgItems > 5 ? '偏紧' : avgItems < 3 ? '偏松' : '适中'}。`,
            relaxSuggestions: [
                '移除评分较低的景点',
                '延长午餐时间',
                '增加休息时间',
            ],
            intensifySuggestions: [
                '添加附近的景点',
                '增加体验活动',
                '利用早晚时间',
            ],
        };
    }
    findBestDayForActivity(ctx) {
        let bestDay = 1;
        let maxFreeTime = 0;
        ctx.days.forEach(day => {
            if (day.stats.freeTime > maxFreeTime) {
                maxFreeTime = day.stats.freeTime;
                bestDay = day.dayNumber;
            }
        });
        return bestDay;
    }
    getFreetimeForDay(ctx, dayNumber) {
        const day = ctx.days.find(d => d.dayNumber === dayNumber);
        return day ? (12 * 60 - day.stats.totalDuration) : 0;
    }
    findMissingMeals(ctx) {
        const missingMeals = [];
        ctx.days.forEach(day => {
            const meals = day.items.filter(i => i.type === 'RESTAURANT');
            if (!meals.some(m => { var _a; return (_a = m.name) === null || _a === void 0 ? void 0 : _a.includes('早'); })) {
            }
            if (!meals.some(m => { var _a; return ((_a = m.name) === null || _a === void 0 ? void 0 : _a.includes('午')) || (m.startTime && m.startTime >= '11:00' && m.startTime <= '14:00'); })) {
                missingMeals.push({ day: day.dayNumber, meal: '午餐' });
            }
            if (!meals.some(m => { var _a; return ((_a = m.name) === null || _a === void 0 ? void 0 : _a.includes('晚')) || (m.startTime && m.startTime >= '17:00'); })) {
                missingMeals.push({ day: day.dayNumber, meal: '晚餐' });
            }
        });
        return missingMeals;
    }
    analyzeTransportNeeds(ctx) {
        return {
            suggestions: [
                '市内以地铁为主，购买交通卡更划算',
                '机场往返建议提前预约接送',
                '景点间打车约30-50元/次',
            ],
            estimatedCost: ctx.durationDays * 100,
            passes: [
                { name: '地铁一日券', price: 50, reason: '每天乘坐3次以上即回本' },
                { name: '交通IC卡', price: 100, reason: '可充值，方便快捷' },
            ],
        };
    }
    findFreeTimeSlots(ctx) {
        const slots = [];
        ctx.days.forEach(day => {
            if (day.stats.freeTime > 60) {
                slots.push({
                    day: day.dayNumber,
                    start: '14:00',
                    end: '16:00',
                    duration: day.stats.freeTime,
                    nearbyOptions: ['咖啡厅', '商场', '公园'],
                });
            }
        });
        return slots;
    }
    async answerQuestionWithRAG(question, ctx) {
        if (!this.ragService) {
            this.logger.debug(`[规划助手] RagService 未注入，跳过 RAG 检索`);
            return null;
        }
        const startTime = Date.now();
        if (this.cacheService) {
            const cacheKey = `qa:${ctx.destination}:${question.substring(0, 100).toLowerCase().trim()}`;
            const cached = await this.cacheService.get(cacheKey);
            if (cached && cached.answer && typeof cached.confidence === 'number') {
                this.logger.debug(`[规划助手] 缓存命中: ${cacheKey}`);
                return { ...cached, processingTime: Date.now() - startTime };
            }
        }
        try {
            const isCarRentalQuery = /租车|car.*rent|rental|租.*车|自驾|开车|驾驶/.test(question.toLowerCase());
            const ragPromises = [
                this.ragService.retrieve({
                    query: question,
                    collection: 'travel_guides',
                    countryCode: ctx.destination,
                    limit: isCarRentalQuery ? 8 : 5,
                    minScore: isCarRentalQuery ? 0.4 : 0.5,
                }),
                this.ragService.retrieve({
                    query: question,
                    collection: 'legal_rules',
                    countryCode: ctx.destination,
                    limit: isCarRentalQuery ? 5 : 3,
                    minScore: isCarRentalQuery ? 0.4 : 0.5,
                }),
            ];
            const ragResults = await Promise.all(ragPromises);
            let allResults = ragResults.flat().filter(r => r && r.score >= (isCarRentalQuery ? 0.4 : 0.5));
            if (isCarRentalQuery && allResults.length > 0) {
                const maxScore = Math.max(...allResults.map(r => r.score || 0));
                if (maxScore < 0.6) {
                    this.logger.debug(`[规划助手] 租车查询结果相关性较低(maxScore=${maxScore.toFixed(2)})，尝试精确查询`);
                    const preciseQuery = `${question} 租车 自驾 汽车租赁`;
                    const precisePromises = [
                        this.ragService.retrieve({
                            query: preciseQuery,
                            collection: 'travel_guides',
                            countryCode: ctx.destination,
                            limit: 5,
                            minScore: 0.4,
                        }),
                        this.ragService.retrieve({
                            query: preciseQuery,
                            collection: 'legal_rules',
                            countryCode: ctx.destination,
                            limit: 3,
                            minScore: 0.4,
                        }),
                    ];
                    const preciseResults = await Promise.all(precisePromises);
                    const preciseAllResults = preciseResults.flat().filter(r => r && r.score >= 0.4);
                    if (preciseAllResults.length > 0) {
                        const existingContent = new Set(allResults.map(r => { var _a; return ((_a = r.content) === null || _a === void 0 ? void 0 : _a.substring(0, 100)) || ''; }));
                        const newResults = preciseAllResults.filter(r => {
                            var _a;
                            const contentKey = ((_a = r.content) === null || _a === void 0 ? void 0 : _a.substring(0, 100)) || '';
                            return !existingContent.has(contentKey);
                        });
                        allResults = [...allResults, ...newResults].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
                        this.logger.debug(`[规划助手] 精确查询补充了 ${newResults.length} 个结果`);
                    }
                }
            }
            if (allResults.length === 0) {
                this.logger.debug(`[规划助手] RAG 检索返回 0 个结果`);
                return null;
            }
            const maxScore = Math.max(...allResults.map(r => r.score || 0));
            const resultCount = allResults.length;
            const confidence = Math.min(maxScore * 0.9 + (resultCount >= 3 ? 0.1 : 0), 0.95);
            const formatted = this.formatRAGResults(allResults, ctx, question);
            const processingTime = Date.now() - startTime;
            this.logger.debug(`[规划助手] RAG 检索成功: ${allResults.length} 个结果, 置信度=${confidence.toFixed(2)}, 耗时=${processingTime}ms`);
            const result = {
                answer: formatted.answer,
                confidence,
                structuredResults: formatted.structuredResults,
                processingTime,
            };
            if (this.cacheService && confidence >= 0.6) {
                const cacheKey = `qa:${ctx.destination}:${question.substring(0, 100).toLowerCase().trim()}`;
                await this.cacheService.set(cacheKey, result, 86400);
                this.logger.debug(`[规划助手] 缓存已保存: ${cacheKey}`);
            }
            return result;
        }
        catch (error) {
            this.logger.error(`[规划助手] RAG 检索失败: ${error === null || error === void 0 ? void 0 : error.message}`, error.stack);
            return null;
        }
    }
    async answerQuestionWithLLM(question, ctx, ragResult) {
        var _a;
        if (!this.llmService) {
            if (ragResult && ragResult.confidence >= 0.5) {
                return ragResult.answer;
            }
            return `关于"${question}"的问题，建议您查阅最新的旅游攻略或咨询当地旅行社。`;
        }
        const isCarRentalQuery = /租车|car.*rent|rental|租.*车|自驾|开车|驾驶/.test(question.toLowerCase());
        const ragContext = ((_a = ragResult === null || ragResult === void 0 ? void 0 : ragResult.structuredResults) === null || _a === void 0 ? void 0 : _a.sources)
            ? `\n\n相关参考信息：\n${ragResult.structuredResults.sources.slice(0, 3).map((s, i) => `${i + 1}. ${s.title}: ${s.content.substring(0, 200)}...`).join('\n')}`
            : '';
        const carRentalGuidance = isCarRentalQuery ? `
重要提示：用户询问的是"租车"相关问题，请务必：
1. 专注于回答租车相关的内容（租车公司、价格、保险、驾照要求、路况等）
2. 不要回答公共交通（地铁、公交、出租车）相关内容
3. 如果参考信息中没有租车相关内容，请明确说明"关于租车的信息较少，建议咨询租车公司或查阅最新攻略"
4. 可以提及：租车公司推荐、价格范围、保险选择、驾照要求、路况注意事项等
` : '';
        let prompt;
        const promptStartTime = Date.now();
        if (this.promptService) {
            try {
                prompt = await this.promptService.renderPrompt('qa_enhancement', {
                    destination: ctx.destinationName || ctx.destination,
                    durationDays: ctx.durationDays,
                    question,
                    ragContext: ragContext || undefined,
                    carRentalGuidance: carRentalGuidance || undefined,
                }, 'v1.0');
                this.logger.debug(`[Prompt优化] 使用PromptService加载问答Prompt，耗时: ${Date.now() - promptStartTime}ms`);
            }
            catch (error) {
                this.logger.warn(`[Prompt优化] PromptService加载失败，使用默认Prompt: ${error}`);
                prompt = `你是一位专业的旅行顾问。用户正在规划去${ctx.destinationName || ctx.destination}的${ctx.durationDays}天旅行。

用户问：${question}${ragContext}${carRentalGuidance}

请用专业、友好的语气回答这个问题。如果问题涉及具体价格或时效性信息，请提醒用户以实际情况为准。${ragContext ? '\n\n注意：上述参考信息来自知识库，请结合这些信息给出更准确的回答。' : ''}`;
            }
        }
        else {
            prompt = `你是一位专业的旅行顾问。用户正在规划去${ctx.destinationName || ctx.destination}的${ctx.durationDays}天旅行。

用户问：${question}${ragContext}${carRentalGuidance}

请用专业、友好的语气回答这个问题。如果问题涉及具体价格或时效性信息，请提醒用户以实际情况为准。${ragContext ? '\n\n注意：上述参考信息来自知识库，请结合这些信息给出更准确的回答。' : ''}`;
        }
        try {
            const llmStartTime = Date.now();
            const response = await this.llmService.humanizeResult({
                dataType: 'travel_qa',
                data: { prompt },
            });
            const llmLatency = Date.now() - llmStartTime;
            this.logger.debug(`[Prompt优化] LLM调用耗时: ${llmLatency}ms, Prompt长度: ${prompt.length}字符`);
            return response;
        }
        catch (error) {
            if (ragResult && ragResult.confidence >= 0.5) {
                return ragResult.answer;
            }
            return `关于"${question}"，我建议您查阅最新的官方信息或咨询专业旅行社。`;
        }
    }
    async generateSuggestions(ctx, message) {
        const dest = `${ctx.destination || ''} ${ctx.destinationName || ''}`.toLowerCase();
        const msg = message.toLowerCase();
        if (msg.includes('极光') || msg.includes('aurora') || msg.includes('北极光')) {
            return [
                { id: '1', title: '🌌 最佳观测时间', description: '冰岛极光季为9月至次年3月，晚上10点至凌晨2点是最佳观测时段', action: 'ADD_ACTIVITY' },
                { id: '2', title: '📍 推荐观测地点', description: '辛格维利尔国家公园、塞里雅兰瀑布附近、米湖地区远离光污染', action: 'ADD_ACTIVITY' },
                { id: '3', title: '📱 极光预报APP', description: '下载 Aurora Forecast 或 My Aurora Forecast 实时追踪极光活动', action: 'INFO' },
                { id: '4', title: '🚗 极光团推荐', description: '参加当地极光团，有经验的向导会带您找到最佳观测点', action: 'ADD_ACTIVITY' },
            ];
        }
        if (msg.includes('美食') || msg.includes('餐厅') || msg.includes('food') || msg.includes('吃')) {
            if (dest.includes('japan') || dest.includes('日本')) {
                return [
                    { id: '1', title: '🍣 寿司名店', description: '筑地市场、银座附近有众多顶级寿司店，建议提前预约', action: 'ARRANGE_MEALS' },
                    { id: '2', title: '🍜 拉面推荐', description: '一兰拉面、一风堂等连锁店品质稳定，无需预约', action: 'ARRANGE_MEALS' },
                    { id: '3', title: '🍱 便利店美食', description: '711、全家的便当和甜点性价比极高', action: 'INFO' },
                ];
            }
            if (dest.includes('iceland') || dest.includes('冰岛')) {
                return [
                    { id: '1', title: '🐟 海鲜汤', description: 'Icelandic Fish & Chips、Sea Baron 的龙虾汤是必尝美食', action: 'ARRANGE_MEALS' },
                    { id: '2', title: '🍖 羊肉料理', description: '冰岛羊肉鲜嫩，推荐 Grillið 餐厅', action: 'ARRANGE_MEALS' },
                    { id: '3', title: '🌭 热狗', description: 'Bæjarins Beztu 是雷克雅未克最著名的热狗店', action: 'ARRANGE_MEALS' },
                ];
            }
            return [
                { id: '1', title: '🍴 当地特色餐厅', description: '推荐尝试当地特色美食，体验地道风味', action: 'ARRANGE_MEALS' },
                { id: '2', title: '📱 餐厅预订', description: '热门餐厅建议提前预约，可使用 OpenTable 或当地平台', action: 'INFO' },
            ];
        }
        if (msg.includes('海滩') || msg.includes('海岛') || msg.includes('beach') || msg.includes('沙滩')) {
            return [
                { id: '1', title: '🏖️ 最佳海滩', description: '根据您的目的地，推荐当地最美的海滩和浮潜点', action: 'ADD_ACTIVITY' },
                { id: '2', title: '🌅 日落观赏', description: '海边日落是不可错过的体验，建议提前30分钟到达', action: 'ADD_ACTIVITY' },
                { id: '3', title: '🤿 水上活动', description: '浮潜、皮划艇、帆船等，建议提前预订', action: 'ADD_ACTIVITY' },
            ];
        }
        if (msg.includes('博物馆') || msg.includes('艺术') || msg.includes('museum')) {
            return [
                { id: '1', title: '🎫 提前购票', description: '热门博物馆建议网上提前购票，可免排队', action: 'INFO' },
                { id: '2', title: '🕐 最佳时间', description: '工作日上午人流较少，建议10点前到达', action: 'INFO' },
                { id: '3', title: '📱 语音导览', description: '大多数博物馆提供中文语音导览，增强体验', action: 'INFO' },
            ];
        }
        if (msg.includes('潜水') || msg.includes('浮潜') || msg.includes('水上活动')) {
            return [
                { id: '1', title: '🤿 浮潜体验', description: '适合初学者，无需证书，建议参加半日团', action: 'ADD_ACTIVITY' },
                { id: '2', title: '🐠 深潜课程', description: '需要 PADI 证书，可报名当地体验课程', action: 'ADD_ACTIVITY' },
                { id: '3', title: '🛶 皮划艇', description: '适合全家参与的水上活动，安全有趣', action: 'ADD_ACTIVITY' },
            ];
        }
        if (msg.includes('修复') || msg.includes('问题')) {
            const issues = this.detectTripIssues(ctx);
            if (issues.length > 0) {
                return [
                    { id: '1', title: '✨ 智能填充空天', description: `您有${issues.filter(i => i.includes('未安排')).length || '多'}天没有安排，点击自动推荐活动`, action: 'FILL_FREE_TIME' },
                    { id: '2', title: '📍 优化路线顺序', description: '重新规划行程顺序，减少往返时间', action: 'OPTIMIZE_ROUTE' },
                    { id: '3', title: '⏰ 调整紧凑安排', description: '某些天安排过满，建议适当放松节奏', action: 'ADJUST_PACE' },
                ];
            }
        }
        return [
            { id: '1', title: '📍 优化行程路线', description: '分析当前行程，优化景点顺序和时间安排', action: 'OPTIMIZE_ROUTE' },
            { id: '2', title: '🍴 推荐当地美食', description: '根据您的行程安排，推荐沿途的特色餐厅', action: 'ARRANGE_MEALS' },
            { id: '3', title: '📝 生成行前清单', description: '根据目的地和行程，生成个性化打包清单', action: 'CREATE_CHECKLIST' },
        ];
    }
    async analyzeFeasibility(ctx, message) {
        return {
            feasible: true,
            summary: '整体安排可行，但有几点需要注意。',
            details: [
                '交通时间预留充足',
                '景点开放时间已核实',
                '建议第3天早起，避开人流高峰',
            ],
        };
    }
    async generateComparison(ctx, message) {
        return {
            table: '| 项目 | 选项A | 选项B |\n|------|------|------|\n| 价格 | ¥100 | ¥150 |\n| 时间 | 2小时 | 3小时 |\n| 评分 | 4.5 | 4.8 |',
            recommendation: '选项A性价比更高，适合时间有限的情况；选项B体验更完整。',
            options: [
                { id: 'A', name: '选项A', recommended: false },
                { id: 'B', name: '选项B', recommended: true },
            ],
        };
    }
    generateChecklist(ctx) {
        const destination = ctx.destination;
        return {
            documents: [
                '护照（有效期6个月以上）',
                '签证（如需要）',
                '机票行程单',
                '酒店预订确认',
                '旅行保险单',
            ],
            clothing: [
                '换洗衣物（按天数准备）',
                '舒适的步行鞋',
                '外套（根据天气）',
                '泳衣（如有水上活动）',
            ],
            health: [
                '常用药品',
                '防晒霜',
                '个人卫生用品',
                '口罩',
            ],
            electronics: [
                '手机和充电器',
                '充电宝',
                '转换插头',
                '相机（可选）',
            ],
            finance: [
                '信用卡',
                '当地货币（少量）',
                '支付APP（如支持）',
            ],
        };
    }
    async generateGeneralResponse(ctx, message, history) {
        if (!this.llmService) {
            this.logger.debug(`[规划助手] LLM 服务不可用，直接使用 RAG 降级`);
            return await this.fallbackToRAG(ctx, message);
        }
        let prompt;
        const promptStartTime = Date.now();
        if (this.promptService) {
            try {
                const historyText = history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
                prompt = await this.promptService.renderPrompt('general_chat', {
                    destination: ctx.destinationName || ctx.destination,
                    durationDays: ctx.durationDays,
                    history: historyText,
                    message,
                }, 'v1.0');
                this.logger.debug(`[Prompt优化] 使用PromptService加载通用对话Prompt，耗时: ${Date.now() - promptStartTime}ms`);
            }
            catch (error) {
                this.logger.warn(`[Prompt优化] PromptService加载失败，使用默认Prompt: ${error}`);
                prompt = `你是 NARA，一位专业、热情的旅行规划师。用户正在规划去${ctx.destinationName || ctx.destination}的${ctx.durationDays}天旅行。

对话历史：
${history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}

用户说：${message}

请用专业、友好的语气回复，并在适当时候引导用户完善行程。`;
            }
        }
        else {
            prompt = `你是 NARA，一位专业、热情的旅行规划师。用户正在规划去${ctx.destinationName || ctx.destination}的${ctx.durationDays}天旅行。

对话历史：
${history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}

用户说：${message}

请用专业、友好的语气回复，并在适当时候引导用户完善行程。`;
        }
        try {
            const llmStartTime = Date.now();
            const response = await this.llmService.humanizeResult({
                dataType: 'travel_chat',
                data: { prompt },
            });
            const llmLatency = Date.now() - llmStartTime;
            this.logger.debug(`[Prompt优化] LLM调用耗时: ${llmLatency}ms, Prompt长度: ${prompt.length}字符`);
            return response;
        }
        catch (error) {
            this.logger.warn(`[规划助手] LLM 生成回复失败，尝试 RAG 降级: ${error}`);
            return await this.fallbackToRAG(ctx, message);
        }
    }
    async fallbackToRAG(ctx, message) {
        var _a;
        this.logger.debug(`[规划助手] 开始 RAG 降级流程: message="${message}", ragService=${!!this.ragService}, enhancedChat=${!!this.enhancedChat}`);
        if (this.ragService) {
            try {
                this.logger.debug(`[规划助手] 直接 RAG 检索: "${message}", countryCode=${ctx.destination}, collection=travel_guides`);
                const results = await this.ragService.retrieve({
                    query: message,
                    collection: 'travel_guides',
                    countryCode: ctx.destination,
                    limit: 5,
                    minScore: 0.4,
                });
                this.logger.debug(`[规划助手] RAG 检索完成: 返回 ${(results === null || results === void 0 ? void 0 : results.length) || 0} 个结果`);
                if (results && results.length > 0) {
                    const formatted = this.formatRAGResults(results, ctx, message);
                    const answer = formatted.answer;
                    this.logger.debug(`[规划助手] RAG 检索成功，找到 ${results.length} 个相关文档，答案长度: ${answer.length}`);
                    return answer;
                }
                else {
                    this.logger.warn(`[规划助手] RAG 检索返回 0 个结果，尝试其他降级策略`);
                }
            }
            catch (error) {
                this.logger.error(`[规划助手] 直接 RAG 检索失败: ${error === null || error === void 0 ? void 0 : error.message}`, error.stack);
            }
        }
        else {
            this.logger.warn(`[规划助手] RagService 未注入，跳过直接 RAG 检索`);
        }
        if (this.enhancedChat) {
            try {
                const context = {
                    countryCode: ctx.destination,
                    destination: ctx.destinationName || ctx.destination,
                    days: ctx.durationDays,
                };
                const answer = await this.enhancedChat.answerRouteQuestion(message, context);
                const answerText = ((_a = answer === null || answer === void 0 ? void 0 : answer.answer) === null || _a === void 0 ? void 0 : _a.trim()) || '';
                if (answerText.length > 20) {
                    this.logger.debug(`[规划助手] EnhancedChat RAG 降级成功，返回答案长度: ${answerText.length}`);
                    return answerText;
                }
            }
            catch (error) {
                this.logger.error(`[规划助手] EnhancedChat RAG 降级失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return this.generateFallbackMessage(ctx, message, true);
    }
    generateQuestionQuickActions(question, ctx, ragResult) {
        var _a;
        const actions = [];
        let actionId = 1;
        const lowerQuestion = question.toLowerCase();
        if (lowerQuestion.includes('保险') || lowerQuestion.includes('insurance')) {
            actions.push({
                id: String(actionId++),
                label: '📋 添加到行前清单',
                action: 'ADD_TO_CHECKLIST',
                params: { category: 'insurance', content: (ragResult === null || ragResult === void 0 ? void 0 : ragResult.answer) || question },
                style: 'primary',
            });
            actions.push({
                id: String(actionId++),
                label: '🔗 查看租车公司政策',
                action: 'OPEN_EXTERNAL_LINK',
                params: { type: 'car_rental_insurance' },
                style: 'secondary',
            });
        }
        if (lowerQuestion.includes('天气') || lowerQuestion.includes('weather')) {
            actions.push({
                id: String(actionId++),
                label: '📅 查看天气预报',
                action: 'SHOW_WEATHER',
                params: { destination: ctx.destination },
                style: 'primary',
            });
            actions.push({
                id: String(actionId++),
                label: '👕 生成穿衣建议',
                action: 'GENERATE_PACKING_LIST',
                params: { basedOnWeather: true },
                style: 'secondary',
            });
        }
        if (lowerQuestion.includes('餐厅') || lowerQuestion.includes('美食') || lowerQuestion.includes('restaurant') || lowerQuestion.includes('吃')) {
            actions.push({
                id: String(actionId++),
                label: '🍽️ 推荐餐厅',
                action: 'RECOMMEND_RESTAURANTS',
                params: { destination: ctx.destination },
                style: 'primary',
            });
            actions.push({
                id: String(actionId++),
                label: '📅 安排用餐时间',
                action: 'ARRANGE_MEALS',
                style: 'secondary',
            });
        }
        if (lowerQuestion.includes('签证') || lowerQuestion.includes('visa')) {
            actions.push({
                id: String(actionId++),
                label: '📋 添加到行前清单',
                action: 'ADD_TO_CHECKLIST',
                params: { category: 'documents', content: (ragResult === null || ragResult === void 0 ? void 0 : ragResult.answer) || question },
                style: 'primary',
            });
            actions.push({
                id: String(actionId++),
                label: '🔗 查看官方要求',
                action: 'OPEN_EXTERNAL_LINK',
                params: { type: 'visa_requirements' },
                style: 'secondary',
            });
        }
        if (ragResult && ((_a = ragResult.structuredResults) === null || _a === void 0 ? void 0 : _a.sources) && ragResult.structuredResults.sources.length > 0) {
            actions.push({
                id: String(actionId++),
                label: '📚 查看完整文档',
                action: 'SHOW_RAG_SOURCES',
                params: { sources: ragResult.structuredResults.sources.map((s) => ({ id: s.id, title: s.title, score: s.score })) },
                style: 'outline',
            });
        }
        actions.push({
            id: String(actionId++),
            label: '💬 继续追问',
            action: 'ASK_FOLLOW_UP',
            style: 'secondary',
        });
        actions.push({
            id: String(actionId++),
            label: '🔙 返回行程',
            action: 'SHOW_OVERVIEW',
            style: 'ghost',
        });
        return actions;
    }
    formatRAGResults(results, ctx, originalQuery) {
        const destination = ctx.destinationName || ctx.destination;
        if (results.length === 0) {
            const fallbackAnswer = this.generateFallbackMessage(ctx, originalQuery, true);
            return { answer: fallbackAnswer, structuredResults: null };
        }
        const topResults = results.slice(0, 3);
        let answer = `关于"${originalQuery}"，我找到以下信息：\n\n`;
        topResults.forEach((result, index) => {
            const content = (result.content || '').trim();
            const title = result.title || '相关信息';
            const source = result.source ? `（来源：${result.source}）` : '';
            const score = result.score ? `（相关度：${(result.score * 100).toFixed(0)}%）` : '';
            const contentPreview = content.length > 300
                ? content.substring(0, 300) + '...'
                : content;
            answer += `${index + 1}. **${title}**${source}${score}\n${contentPreview}\n\n`;
        });
        if (results.length > 3) {
            answer += `还有 ${results.length - 3} 条相关信息，如需查看完整内容，请告诉我。\n\n`;
        }
        answer += `以上信息来自知识库，如需更详细的信息，建议查看官方文档或咨询相关机构。`;
        const structuredResults = {
            sources: results.map((r, index) => ({
                id: r.id || `source_${index}`,
                title: r.title || '相关信息',
                content: r.content.substring(0, 500),
                source: r.source,
                score: r.score || 0.5,
                relevance: this.calculateRelevance(r.score || 0.5),
            })),
            evidenceChain: topResults.slice(0, 3).map((r, index) => ({
                step: index + 1,
                description: `从"${r.title || '来源'}"中提取相关信息`,
                sourceId: r.id || `source_${index}`,
            })),
        };
        return { answer, structuredResults };
    }
    calculateRelevance(score) {
        if (score >= 0.7)
            return 'HIGH';
        if (score >= 0.5)
            return 'MEDIUM';
        return 'LOW';
    }
    async generateFollowUpQuestions(question, ragResult, ctx) {
        var _a;
        const lowerQuestion = question.toLowerCase();
        const questions = [];
        if (lowerQuestion.includes('租车') || lowerQuestion.includes('car') && (lowerQuestion.includes('rent') || lowerQuestion.includes('rental')) || lowerQuestion.includes('自驾') || lowerQuestion.includes('开车')) {
            questions.push(`${ctx.destinationName || ctx.destination}有哪些租车公司推荐？`, '租车需要什么证件？', '租车价格大概是多少？', '租车保险怎么买？', '路况怎么样？需要注意什么？');
        }
        else if (lowerQuestion.includes('保险') || lowerQuestion.includes('insurance')) {
            questions.push('租车保险包含哪些内容？', '需要购买额外的保险吗？', '保险费用大概是多少？', '如何理赔？');
        }
        else if (lowerQuestion.includes('天气') || lowerQuestion.includes('weather')) {
            questions.push(`${ctx.destinationName || ctx.destination} 的最佳旅行时间是什么时候？`, '需要准备什么衣物？', '会有极端天气吗？', '如何查看实时天气预报？');
        }
        else if (lowerQuestion.includes('餐厅') || lowerQuestion.includes('美食') || lowerQuestion.includes('restaurant')) {
            questions.push('推荐一些当地特色餐厅', '需要提前预订吗？', '人均消费大概是多少？', '有什么必吃的美食？');
        }
        else if (lowerQuestion.includes('签证') || lowerQuestion.includes('visa')) {
            questions.push('签证需要多长时间办理？', '需要准备哪些材料？', '签证费用是多少？', '在哪里办理签证？');
        }
        else if (lowerQuestion.includes('交通') || lowerQuestion.includes('transport')) {
            questions.push('如何从机场到市区？', '公共交通方便吗？', '需要租车吗？', '有什么交通卡推荐？');
        }
        if (((_a = ragResult === null || ragResult === void 0 ? void 0 : ragResult.structuredResults) === null || _a === void 0 ? void 0 : _a.sources) && ragResult.structuredResults.sources.length > 0) {
            const sources = ragResult.structuredResults.sources;
            sources.forEach((source) => {
                var _a, _b;
                const title = ((_a = source.title) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                const content = ((_b = source.content) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
                if (title.includes('费用') || content.includes('费用') || content.includes('价格')) {
                    questions.push('费用大概是多少？');
                }
                if (title.includes('时间') || content.includes('时间') || content.includes('开放')) {
                    questions.push('什么时间最合适？');
                }
                if (title.includes('注意') || content.includes('注意') || content.includes('提醒')) {
                    questions.push('有什么需要注意的吗？');
                }
            });
        }
        if (questions.length === 0) {
            questions.push('能详细说明一下吗？', '有什么需要注意的吗？', '还有其他相关信息吗？');
        }
        return Array.from(new Set(questions)).slice(0, 5);
    }
    filterRelevantGaps(gaps, userIntent, userMessage) {
        if (!gaps || gaps.length === 0) {
            return [];
        }
        const lowerMessage = userMessage.toLowerCase();
        if (lowerMessage.includes('用餐') || lowerMessage.includes('餐厅') || lowerMessage.includes('吃饭') || lowerMessage.includes('早餐') || lowerMessage.includes('午餐') || lowerMessage.includes('晚餐')) {
            const mealGaps = gaps.filter(g => g.type === 'MEAL');
            return mealGaps.slice(0, 5);
        }
        if (lowerMessage.includes('交通') || lowerMessage.includes('租车') || lowerMessage.includes('打车') || lowerMessage.includes('公交')) {
            return gaps.filter(g => g.type === 'TRANSPORT').slice(0, 5);
        }
        if (lowerMessage.includes('住宿') || lowerMessage.includes('酒店') || lowerMessage.includes('住')) {
            return gaps.filter(g => g.type === 'HOTEL').slice(0, 5);
        }
        if (lowerMessage.includes('活动') || lowerMessage.includes('景点') || lowerMessage.includes('空档')) {
            return gaps.filter(g => g.type === 'ACTIVITY' || g.type === 'FREE_TIME').slice(0, 5);
        }
        if (userIntent === 'ASK_QUESTION') {
            const isGapRelatedQuery = lowerMessage.includes('待完善') ||
                lowerMessage.includes('缺口') ||
                lowerMessage.includes('问题') ||
                lowerMessage.includes('需要') ||
                lowerMessage.includes('完善');
            if (!isGapRelatedQuery) {
                return [];
            }
        }
        if (['OPTIMIZE_ROUTE', 'ADJUST_PACE', 'REBALANCE_DAYS', 'REPLACE_POI'].includes(userIntent)) {
            const sorted = gaps.sort((a, b) => {
                const severityOrder = { CRITICAL: 0, SUGGESTED: 1, OPTIONAL: 2 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });
            return sorted.slice(0, 5);
        }
        const filtered = gaps
            .filter(g => g.severity === 'CRITICAL' || g.severity === 'SUGGESTED')
            .sort((a, b) => {
            const severityOrder = { CRITICAL: 0, SUGGESTED: 1, OPTIONAL: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        })
            .slice(0, 5);
        return filtered;
    }
    aggregateGaps(gaps) {
        if (!gaps || gaps.length === 0) {
            return [];
        }
        if (gaps.length <= 3) {
            return gaps;
        }
        const grouped = new Map();
        gaps.forEach(gap => {
            const timeKey = `${gap.timeSlot.start}-${gap.timeSlot.end}`;
            const key = `${gap.type}_${gap.severity}_${timeKey}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(gap);
        });
        const aggregated = [];
        grouped.forEach((group, key) => {
            var _a;
            if (group.length === 1) {
                aggregated.push(group[0]);
            }
            else {
                const first = group[0];
                const days = group.map(g => g.dayNumber).sort((a, b) => a - b);
                let description = '';
                if (first.type === 'MEAL') {
                    const mealType = ((_a = first.description.match(/(早餐|午餐|晚餐)/)) === null || _a === void 0 ? void 0 : _a[0]) || '用餐';
                    description = `${mealType}未安排 (共${group.length}天，${first.timeSlot.start}-${first.timeSlot.end})`;
                }
                else if (first.type === 'TRANSPORT') {
                    description = `交通未安排 (共${group.length}天)`;
                }
                else if (first.type === 'HOTEL') {
                    description = `住宿未安排 (共${group.length}天)`;
                }
                else if (first.type === 'ACTIVITY' || first.type === 'FREE_TIME') {
                    description = `活动空档 (共${group.length}天，${first.timeSlot.start}-${first.timeSlot.end})`;
                }
                else {
                    description = `${first.description} (共${group.length}天)`;
                }
                aggregated.push({
                    id: `aggregated_${key}_${days[0]}_${days[days.length - 1]}`,
                    type: first.type,
                    dayNumber: days[0],
                    timeSlot: first.timeSlot,
                    description,
                    severity: first.severity,
                    context: {
                        nearbyLocation: `涉及第${days.join('、')}天`,
                    },
                });
            }
        });
        return aggregated.sort((a, b) => {
            const severityOrder = { CRITICAL: 0, SUGGESTED: 1, OPTIONAL: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }
    recordPerformanceMetrics(metrics) {
        var _a;
        this.logger.debug(`[性能监控] intent=${metrics.intent}, source=${metrics.source}, ` +
            `latency=${metrics.processingTime}ms, ragConfidence=${metrics.ragConfidence || 'N/A'}, ` +
            `promptType=${metrics.promptType || 'N/A'}, promptVersion=${metrics.promptVersion || 'N/A'}`);
        if (this.telemetryService) {
            try {
                const traceId = `trip-planner-${metrics.sessionId}`;
                let traceExists = false;
                try {
                    const activeTraces = this.telemetryService.activeTraces;
                    if (activeTraces && activeTraces.has(traceId)) {
                        traceExists = true;
                    }
                }
                catch {
                }
                if (!traceExists) {
                    this.telemetryService.startTrace(`trip-planner-${metrics.intent}`, 'agent_request', {
                        sessionId: metrics.sessionId,
                        tripId: metrics.tripId || 'unknown',
                    });
                }
                const spanId = this.telemetryService.startSpan(traceId, `trip-planner-${metrics.intent}-${metrics.source}`, 'llm_call', undefined, {
                    intent: metrics.intent,
                    source: metrics.source,
                    promptType: metrics.promptType || 'unknown',
                    promptVersion: metrics.promptVersion || 'unknown',
                    ragConfidence: ((_a = metrics.ragConfidence) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A',
                    tripId: metrics.tripId || 'unknown',
                });
                if (spanId) {
                    this.telemetryService.endSpan(spanId, 'success', {
                        durationMs: metrics.processingTime,
                        ...(metrics.promptLength && { promptLength: metrics.promptLength }),
                        ...(metrics.llmLatency && { llmLatency: metrics.llmLatency }),
                    });
                }
            }
            catch (error) {
                this.logger.warn(`[性能监控] TelemetryService记录失败: ${error.message}`);
            }
        }
        if (metrics.processingTime > 5000) {
            this.logger.warn(`[性能告警] 处理时间过长: ${metrics.processingTime}ms, intent=${metrics.intent}`);
        }
    }
    generateFallbackMessage(ctx, message, ragAttempted = false) {
        const destination = ctx.destinationName || ctx.destination;
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('保险') || lowerMessage.includes('insurance')) {
            return `关于${destination}的租车保险，建议您：\n\n1. 查看租车公司的保险政策\n2. 确认是否包含碰撞险和第三方责任险\n3. 考虑是否需要额外的保险覆盖\n\n如需更详细的信息，建议咨询租车公司或查看相关官方文档。`;
        }
        if (lowerMessage.includes('签证') || lowerMessage.includes('visa')) {
            return `关于${destination}的签证信息，建议您：\n\n1. 查看目的地国家的官方签证要求\n2. 确认您的护照有效期（通常需要6个月以上）\n3. 提前准备所需材料\n\n建议访问目的地国家的大使馆或领事馆官网获取最新信息。`;
        }
        if (lowerMessage.includes('天气') || lowerMessage.includes('weather')) {
            return `关于${destination}的天气，建议您：\n\n1. 查看当地天气预报\n2. 根据季节准备合适的衣物\n3. 关注极端天气预警\n\n建议使用天气应用或网站获取实时天气信息。`;
        }
        if (ragAttempted) {
            return `抱歉，我暂时无法获取关于"${message}"的详细信息。\n\n建议您：\n1. 查看${destination}的官方旅游网站\n2. 咨询相关服务机构\n3. 稍后重试，或换一种方式提问\n\n关于您的${destination}行程，还有什么其他我可以帮您的吗？`;
        }
        return `好的，我理解了您关于"${message}"的问题。\n\n关于您的${destination}行程，我可以帮您：\n• 优化行程路线\n• 安排餐厅和交通\n• 解答其他疑问\n\n有什么需要我帮您的吗？`;
    }
    createErrorResponse(errorMessage) {
        return {
            sessionId: '',
            message: `抱歉，处理您的请求时遇到了问题：${errorMessage}\n\n请稍后重试，或者换一种方式描述您的需求。`,
            phase: 'OVERVIEW',
            intent: 'GENERAL_CHAT',
            quickActions: [
                { id: '1', label: '🔄 重试', action: 'RETRY', style: 'primary' },
                { id: '2', label: '📋 查看行程', action: 'SHOW_OVERVIEW', style: 'secondary' },
            ],
        };
    }
    async createClarificationResponse(state, disambiguation) {
        var _a, _b;
        const clarification = disambiguation.clarificationNeeded;
        let message = clarification.question;
        if (clarification.context) {
            message = `${clarification.context}\n\n${message}`;
        }
        const quickActions = clarification.options.map((option, idx) => ({
            id: option.id || `clarify_${idx}`,
            label: option.label,
            description: option.description,
            action: 'CLARIFY_INTENT',
            data: {
                selectedAction: option.action,
                params: option.params,
            },
            style: option.style || 'secondary',
        }));
        let richContent;
        if (((_a = disambiguation.contextDiscovery) === null || _a === void 0 ? void 0 : _a.foundGap) && disambiguation.contextDiscovery.gap) {
            const gap = disambiguation.contextDiscovery.gap;
            richContent = {
                type: 'gap_highlight',
                data: {
                    highlight: {
                        type: 'gap',
                        dayNumber: gap.dayNumber,
                        timeSlot: gap.timeSlot,
                        gapType: gap.type,
                        description: gap.description,
                        severity: gap.severity,
                    },
                },
            };
        }
        const allGaps = ((_b = disambiguation.diagnostics) === null || _b === void 0 ? void 0 : _b.relatedGaps) || [];
        let filteredGaps = this.filterRelevantGaps(allGaps, disambiguation.originalIntent || 'ASK_QUESTION', '');
        let mappedGaps = filteredGaps.map(gap => {
            var _a, _b;
            return ({
                id: gap.id,
                type: gap.type,
                dayNumber: gap.dayNumber,
                timeSlot: gap.timeSlot,
                description: gap.description,
                severity: gap.severity,
                context: gap.context ? {
                    beforeItem: (_a = gap.context.beforeActivity) === null || _a === void 0 ? void 0 : _a.name,
                    afterItem: (_b = gap.context.afterActivity) === null || _b === void 0 ? void 0 : _b.name,
                    nearbyLocation: gap.context.dayCity,
                } : undefined,
            });
        });
        if (this.gapPreferencesService && state.userId) {
            try {
                const preferences = await this.gapPreferencesService.getPreferences(state.userId, state.tripId, state.sessionId);
                if (preferences.showOnlyCritical) {
                    mappedGaps = mappedGaps.filter(g => g.severity === 'CRITICAL');
                }
                if (preferences.filterTypes.length > 0) {
                    mappedGaps = mappedGaps.filter(g => preferences.filterTypes.includes(g.type));
                }
                mappedGaps = await this.gapPreferencesService.filterIgnoredGaps(state.userId, mappedGaps, state.tripId);
            }
            catch (error) {
                this.logger.warn(`[缺口偏好] 应用用户偏好失败: ${error.message}`);
            }
        }
        const detectedGaps = this.aggregateGaps(mappedGaps);
        return {
            sessionId: state.sessionId,
            message,
            phase: state.phase,
            intent: disambiguation.originalIntent,
            quickActions,
            richContent,
            followUp: clarification.allowFreeText ? {
                question: clarification.question,
                options: clarification.options.map(o => o.label),
                type: 'single',
            } : undefined,
            meta: {
                processingTime: 0,
                uncertainty: disambiguation.uncertainty,
                detectedGaps: detectedGaps.length > 0 ? detectedGaps : undefined,
            },
        };
    }
    getMockTripContext(tripId) {
        if (tripId.includes('distance_test')) {
            return this.getMockDistanceTestContext(tripId);
        }
        if (tripId.includes('conflict_test') || tripId.includes('hangzhou')) {
            return this.getMockConflictTestContext(tripId);
        }
        return {
            tripId,
            destination: 'JP',
            destinationName: '日本',
            startDate: '2026-04-01',
            endDate: '2026-04-07',
            durationDays: 7,
            totalBudget: 20000,
            remainingBudget: 15000,
            travelers: {
                adults: 2,
                children: 1,
                elderly: 0,
                childrenAges: [8],
            },
            pacingConfig: {
                level: 'STANDARD',
                maxDailyActivities: 5,
            },
            days: [
                {
                    dayId: 'd1',
                    dayNumber: 1,
                    date: '2026-04-01',
                    theme: '东京到达日',
                    city: '东京',
                    items: [
                        { itemId: 'i1', type: 'ACTIVITY', name: '抵达成田机场', startTime: '14:00', duration: 60, location: { lat: 35.7720, lng: 140.3929 } },
                        { itemId: 'i2', type: 'TRANSPORT', name: '机场到酒店', startTime: '15:00', duration: 90 },
                        { itemId: 'i3', type: 'RESTAURANT', name: '新宿拉面', startTime: '18:00', duration: 60, location: { lat: 35.6938, lng: 139.7034 } },
                    ],
                    stats: { itemCount: 3, totalDuration: 210, totalCost: 500, freeTime: 180, travelTime: 90 },
                },
                {
                    dayId: 'd2',
                    dayNumber: 2,
                    date: '2026-04-02',
                    theme: '东京迪士尼',
                    city: '东京',
                    items: [
                        { itemId: 'i4', type: 'POI', name: '东京迪士尼乐园', startTime: '09:00', duration: 600, cost: 1500, location: { lat: 35.6329, lng: 139.8804 } },
                    ],
                    stats: { itemCount: 1, totalDuration: 600, totalCost: 1500, freeTime: 0, travelTime: 60 },
                },
            ],
            preferences: {
                style: 'family',
                interests: ['亲子', '美食', '购物'],
                pace: 'relaxed',
            },
            status: 'PLANNING',
            completeness: 35,
        };
    }
    getMockConflictTestContext(tripId) {
        return {
            tripId,
            destination: 'CN',
            destinationName: '杭州',
            startDate: '2026-01-10',
            endDate: '2026-01-20',
            durationDays: 11,
            totalBudget: 10000,
            remainingBudget: 8000,
            status: 'PLANNING',
            completeness: 0.3,
            travelers: {
                adults: 2,
                children: 0,
                elderly: 0,
            },
            pacingConfig: {
                level: 'STANDARD',
                maxDailyActivities: 5,
            },
            days: [
                {
                    dayId: 'd1',
                    dayNumber: 1,
                    date: '2026-01-10',
                    theme: '杭州游玩',
                    city: '杭州',
                    items: [
                        {
                            itemId: 'item_hotel',
                            name: '杭州余杭万豪万枫酒店',
                            type: 'HOTEL',
                            startTime: '09:30',
                            endTime: '10:00',
                            duration: 30,
                            address: '余杭街道凤新路365号',
                            cityName: '杭州',
                        },
                        {
                            itemId: 'item_dream',
                            name: '杭州梦想小镇景区',
                            type: 'ACTIVITY',
                            startTime: '09:00',
                            endTime: '10:00',
                            duration: 60,
                            address: '浙江省杭州市余杭区',
                            cityName: '杭州',
                        },
                        {
                            itemId: 'item_forbidden',
                            name: '故宫博物院',
                            type: 'ACTIVITY',
                            startTime: '09:00',
                            endTime: '10:00',
                            duration: 120,
                            address: '东城区',
                            cityName: '北京',
                        },
                        {
                            itemId: 'item_afternoon',
                            name: '浙江省杭州市余杭区中国',
                            type: 'ACTIVITY',
                            startTime: '14:49',
                            endTime: '15:49',
                            duration: 60,
                            address: '杭州市余杭区',
                            cityName: '杭州',
                        },
                    ],
                    stats: {
                        itemCount: 4,
                        totalDuration: 270,
                        totalCost: 0,
                        freeTime: 300,
                        travelTime: 60,
                    },
                },
                {
                    dayId: 'd2',
                    dayNumber: 2,
                    date: '2026-01-11',
                    theme: '自由活动',
                    city: '杭州',
                    items: [
                        {
                            itemId: 'item_west_lake',
                            name: '西湖',
                            type: 'ACTIVITY',
                            startTime: '10:00',
                            endTime: '12:00',
                            duration: 120,
                            address: '杭州市西湖区',
                            cityName: '杭州',
                        },
                    ],
                    stats: {
                        itemCount: 1,
                        totalDuration: 120,
                        totalCost: 0,
                        freeTime: 480,
                        travelTime: 30,
                    },
                },
            ],
        };
    }
    getMockDistanceTestContext(tripId) {
        return {
            tripId,
            destination: 'JP',
            destinationName: '日本',
            startDate: '2026-04-01',
            endDate: '2026-04-03',
            durationDays: 3,
            totalBudget: 30000,
            remainingBudget: 25000,
            travelers: {
                adults: 2,
                children: 0,
                elderly: 0,
            },
            pacingConfig: {
                level: 'STANDARD',
                maxDailyActivities: 5,
            },
            days: [
                {
                    dayId: 'd1',
                    dayNumber: 1,
                    date: '2026-04-01',
                    theme: '东京-大阪（问题日）',
                    city: '东京',
                    items: [
                        {
                            itemId: 'i1',
                            type: 'POI',
                            name: '东京塔',
                            startTime: '09:00',
                            endTime: '11:00',
                            duration: 120,
                            location: { lat: 35.6586, lng: 139.7454 },
                            cityName: '东京',
                        },
                        {
                            itemId: 'i2',
                            type: 'POI',
                            name: '大阪城',
                            startTime: '14:00',
                            endTime: '17:00',
                            duration: 180,
                            location: { lat: 34.6873, lng: 135.5262 },
                            cityName: '大阪',
                        },
                        {
                            itemId: 'i3',
                            type: 'RESTAURANT',
                            name: '道顿堀美食街',
                            startTime: '18:00',
                            endTime: '20:00',
                            duration: 120,
                            location: { lat: 34.6687, lng: 135.5011 },
                            cityName: '大阪',
                        },
                    ],
                    stats: { itemCount: 3, totalDuration: 420, totalCost: 2000, freeTime: 0, travelTime: 180 },
                    issues: ['⚠️ 同一天包含东京和大阪的景点，距离超过400公里'],
                },
                {
                    dayId: 'd2',
                    dayNumber: 2,
                    date: '2026-04-02',
                    theme: '大阪-京都（合理日）',
                    city: '大阪',
                    items: [
                        {
                            itemId: 'i4',
                            type: 'POI',
                            name: '清水寺',
                            startTime: '09:00',
                            endTime: '12:00',
                            duration: 180,
                            location: { lat: 34.9949, lng: 135.7850 },
                            cityName: '京都',
                        },
                        {
                            itemId: 'i5',
                            type: 'POI',
                            name: '伏见稻荷大社',
                            startTime: '14:00',
                            endTime: '17:00',
                            duration: 180,
                            location: { lat: 34.9671, lng: 135.7727 },
                            cityName: '京都',
                        },
                    ],
                    stats: { itemCount: 2, totalDuration: 360, totalCost: 1000, freeTime: 120, travelTime: 60 },
                },
            ],
            preferences: {
                style: 'culture',
                interests: ['历史', '美食'],
                pace: 'standard',
            },
            status: 'PLANNING',
            completeness: 60,
        };
    }
    shouldInvokeGuardians(intent, message, state) {
        if (!this.GUARDIAN_CONFIG.enabled)
            return [];
        const guardians = [];
        const ctx = state.tripContext;
        const lowerMessage = message.toLowerCase();
        const { allGuardians } = this.GUARDIAN_CONFIG;
        const triggerAll = allGuardians.intents.includes(intent) ||
            allGuardians.keywords.some(kw => message.includes(kw));
        if (triggerAll) {
            return ['Abu', 'DrDre', 'Neptune'];
        }
        if (this.shouldInvokeAbu(intent, message, ctx)) {
            guardians.push('Abu');
        }
        if (this.shouldInvokeDrDre(intent, message, ctx)) {
            guardians.push('DrDre');
        }
        if (this.shouldInvokeNeptune(intent, message, ctx)) {
            guardians.push('Neptune');
        }
        return guardians;
    }
    determineTriggerReason(intent, message) {
        const { allGuardians, abu, drDre, neptune } = this.GUARDIAN_CONFIG;
        if (allGuardians.intents.includes(intent) || allGuardians.keywords.some(kw => message.includes(kw))) {
            return 'all_guardians';
        }
        const allKeywords = [
            ...['安全', '危险', '能去吗', '开门吗', '营业时间', '关门', '休息日', '交通管制'],
            ...['太累', '太赶', '走不动', '休息', '轻松一点', '紧凑', '慢一点'],
            ...neptune.replacementKeywords,
        ];
        if (allKeywords.some(kw => message.includes(kw))) {
            return 'keyword';
        }
        const intentTriggers = [
            'CHECK_FEASIBILITY', 'ADJUST_PACE', 'REBALANCE_DAYS', 'REPLACE_POI'
        ];
        if (intentTriggers.includes(intent)) {
            return 'intent';
        }
        return 'threshold';
    }
    shouldInvokeAbu(intent, message, ctx) {
        const { abu } = this.GUARDIAN_CONFIG;
        const abuKeywords = ['安全', '危险', '能去吗', '开门吗', '营业时间', '关门', '休息日', '交通管制', '距离', '远', '公里', 'km', '太远', '跨城'];
        if (abuKeywords.some(kw => message.includes(kw))) {
            return true;
        }
        if (intent === 'CHECK_FEASIBILITY') {
            return true;
        }
        if (['ADD_ACTIVITY', 'ARRANGE_MEALS', 'ADD_HOTEL'].includes(intent)) {
            return true;
        }
        for (const day of ctx.days) {
            const itemsWithLocation = day.items.filter(item => item.location);
            for (let i = 0; i < itemsWithLocation.length - 1; i++) {
                const current = itemsWithLocation[i];
                const next = itemsWithLocation[i + 1];
                if (current.location && next.location) {
                    const distance = this.calculateDistance(current.location.lat, current.location.lng, next.location.lat, next.location.lng);
                    if (distance > 200) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    shouldInvokeDrDre(intent, message, ctx) {
        const { drDre } = this.GUARDIAN_CONFIG;
        const drDreKeywords = ['太累', '太赶', '走不动', '休息', '轻松一点', '紧凑', '慢一点'];
        if (drDreKeywords.some(kw => message.includes(kw))) {
            return true;
        }
        if (intent === 'ADJUST_PACE' || intent === 'REBALANCE_DAYS') {
            return true;
        }
        const fatigueLevel = this.calculateFatigueLevel(ctx);
        if (fatigueLevel > drDre.fatigueThreshold) {
            return true;
        }
        const maxActivitiesInOneDay = Math.max(...ctx.days.map(d => d.items.length));
        if (maxActivitiesInOneDay > drDre.maxDailyActivities) {
            return true;
        }
        return false;
    }
    shouldInvokeNeptune(intent, message, ctx) {
        const { neptune } = this.GUARDIAN_CONFIG;
        if (neptune.replacementKeywords.some(kw => message.includes(kw))) {
            return true;
        }
        if (intent === 'REPLACE_POI') {
            return true;
        }
        return false;
    }
    calculateFatigueLevel(ctx) {
        const { drDre } = this.GUARDIAN_CONFIG;
        let totalFatigue = 0;
        for (const day of ctx.days) {
            const itemCount = day.items.length;
            const travelTime = day.stats.travelTime || 0;
            const totalDuration = day.stats.totalDuration || 0;
            const activityFatigue = Math.min((itemCount / drDre.maxDailyActivities) * 40, 40);
            const travelFatigue = Math.min((travelTime / 120) * 30, 30);
            const durationFatigue = Math.min((totalDuration / 600) * 30, 30);
            totalFatigue += activityFatigue + travelFatigue + durationFatigue;
        }
        const avgFatigue = totalFatigue / Math.max(ctx.days.length, 1);
        const elderlyFactor = ctx.travelers.elderly > 0 ? 1.3 : 1;
        const childrenFactor = ctx.travelers.children > 0 ? 1.2 : 1;
        return Math.min(avgFatigue * elderlyFactor * childrenFactor, 100);
    }
    async evaluateWithGuardians(state, intent, message) {
        const ctx = state.tripContext;
        const guardiansToInvoke = this.shouldInvokeGuardians(intent, message, state);
        if (guardiansToInvoke.length === 0) {
            return { insights: [], evaluation: {}, guardiansInvoked: [] };
        }
        this.logger.debug(`[三人格] 触发评估: ${guardiansToInvoke.join(', ')}`);
        const insights = [];
        const evaluation = {};
        if (guardiansToInvoke.includes('Abu')) {
            const abuResult = await this.evaluateWithAbu(ctx, message);
            evaluation.abu = abuResult.evaluation;
            if (abuResult.insights.length > 0) {
                insights.push(...abuResult.insights);
            }
        }
        if (guardiansToInvoke.includes('DrDre')) {
            const drDreResult = await this.evaluateWithDrDre(ctx, message);
            evaluation.drDre = drDreResult.evaluation;
            if (drDreResult.insights.length > 0) {
                insights.push(...drDreResult.insights);
            }
        }
        if (guardiansToInvoke.includes('Neptune')) {
            const neptuneResult = await this.evaluateWithNeptune(ctx, message);
            evaluation.neptune = neptuneResult.evaluation;
            if (neptuneResult.insights.length > 0) {
                insights.push(...neptuneResult.insights);
            }
        }
        return { insights, evaluation, guardiansInvoked: guardiansToInvoke };
    }
    async evaluateWithAbu(ctx, message) {
        const persona = trip_planner_interface_1.GUARDIAN_PERSONAS.Abu;
        const insights = [];
        const issues = [];
        const risks = [];
        for (const day of ctx.days) {
            const itemsWithLocation = day.items.filter(item => item.location && item.startTime &&
                ['POI', 'RESTAURANT', 'ACTIVITY', 'HOTEL'].includes(item.type)).sort((a, b) => {
                const timeA = this.parseTimeToMinutes(a.startTime);
                const timeB = this.parseTimeToMinutes(b.startTime);
                return timeA - timeB;
            });
            for (let i = 0; i < itemsWithLocation.length - 1; i++) {
                const current = itemsWithLocation[i];
                const next = itemsWithLocation[i + 1];
                if (current.location && next.location) {
                    const distance = this.calculateDistance(current.location.lat, current.location.lng, next.location.lat, next.location.lng);
                    if (distance > 1000) {
                        issues.push(`⚠️ 第${day.dayNumber}天「${current.name}」到「${next.name}」距离约 ${Math.round(distance)} 公里，同一天内几乎无法完成！`);
                        risks.push({
                            type: 'distance',
                            severity: 'high',
                            description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km，需要跨城交通`,
                        });
                    }
                    else if (distance > 500) {
                        issues.push(`⚠️ 第${day.dayNumber}天「${current.name}」到「${next.name}」距离约 ${Math.round(distance)} 公里，建议分开安排`);
                        risks.push({
                            type: 'distance',
                            severity: 'high',
                            description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km，可能需要高铁/飞机`,
                        });
                    }
                    else if (distance > 200) {
                        issues.push(`第${day.dayNumber}天「${current.name}」到「${next.name}」距离约 ${Math.round(distance)} 公里，请确认交通安排`);
                        risks.push({
                            type: 'distance',
                            severity: 'medium',
                            description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km，需要较长交通时间`,
                        });
                    }
                    else if (distance > 50) {
                        risks.push({
                            type: 'distance',
                            severity: 'low',
                            description: `${current.name} → ${next.name} 距离 ${Math.round(distance)}km`,
                        });
                    }
                }
            }
            const uniqueCities = [...new Set(day.items.filter(i => i.cityName).map(i => i.cityName))];
            if (uniqueCities.length > 1) {
                const hasInterCityTransport = day.items.some(item => item.type === 'TRANSPORT' &&
                    (item.transportType === '高铁' || item.transportType === '飞机' || item.transportType === '长途汽车'));
                if (!hasInterCityTransport) {
                    issues.push(`第${day.dayNumber}天涉及多个城市（${uniqueCities.join('、')}），但未安排城际交通`);
                    risks.push({
                        type: 'cross_city',
                        severity: 'medium',
                        description: `涉及 ${uniqueCities.length} 个城市，请确认交通方式`,
                    });
                }
            }
            const hasLateActivity = day.items.some(item => {
                const endTime = item.endTime;
                if (endTime) {
                    const hour = parseInt(String(endTime).split(':')[0], 10);
                    return hour >= 21;
                }
                return false;
            });
            if (hasLateActivity) {
                const hasTransportBack = day.items.some(item => item.type === 'TRANSPORT' && item.endTime && parseInt(String(item.endTime).split(':')[0], 10) >= 21);
                if (!hasTransportBack) {
                    issues.push(`第${day.dayNumber}天有夜间活动，但未安排返程交通`);
                    risks.push({
                        type: 'transport',
                        severity: 'medium',
                        description: `第${day.dayNumber}天晚间可能面临交通不便`,
                    });
                }
            }
            const activitiesWithTime = day.items.filter(item => item.startTime && item.type !== 'TRANSPORT');
            if (activitiesWithTime.length > 0) {
                const sortedActivities = activitiesWithTime.sort((a, b) => {
                    const normalizedTimeA = this.normalizeTimeField(a.startTime);
                    const normalizedTimeB = this.normalizeTimeField(b.startTime);
                    if (!normalizedTimeA || !normalizedTimeB)
                        return 0;
                    const minutesA = this.parseTimeToMinutes(normalizedTimeA);
                    const minutesB = this.parseTimeToMinutes(normalizedTimeB);
                    return minutesA - minutesB;
                });
                const earliestActivity = sortedActivities[0];
                if (earliestActivity && earliestActivity.startTime) {
                    const normalizedTime = this.normalizeTimeField(earliestActivity.startTime);
                    if (normalizedTime) {
                        const timeParts = normalizedTime.split(':');
                        const startHour = parseInt(timeParts[0], 10);
                        const startMinute = parseInt(timeParts[1] || '0', 10);
                        const startMinutes = startHour * 60 + startMinute;
                        if (!isNaN(startHour) && startMinutes >= 0 && startMinutes < 6 * 60) {
                            const originalTime = earliestActivity.startTime;
                            const itemName = this.getItemName(earliestActivity);
                            issues.push(`第${day.dayNumber}天「${itemName}」${normalizedTime}开始可能太早${originalTime !== normalizedTime ? `（检测到的时间：${originalTime}）` : ''}`);
                            risks.push({
                                type: 'timing',
                                severity: 'low',
                                description: `早起可能影响体力`,
                            });
                        }
                    }
                    else {
                        this.logger.warn(`[Abu评估] 无法标准化时间: ${earliestActivity.startTime}, itemId=${earliestActivity.itemId}`);
                    }
                }
            }
        }
        if (ctx.travelers.elderly > 0) {
            const hasAccessibilityIssue = ctx.days.some(day => day.items.some(item => {
                const itemName = this.getItemName(item);
                return itemName.includes('登山') || itemName.includes('徒步') || itemName.includes('爬');
            }));
            if (hasAccessibilityIssue) {
                issues.push('行程包含登山/徒步活动，请确认老人是否适合参与');
                risks.push({
                    type: 'accessibility',
                    severity: 'medium',
                    description: '部分活动可能不适合老年人',
                });
            }
        }
        if (issues.length > 0 || risks.length > 0) {
            const severity = risks.some(r => r.severity === 'high') ? 'error'
                : risks.some(r => r.severity === 'medium') ? 'warning'
                    : 'info';
            insights.push({
                persona: 'Abu',
                emoji: persona.emoji,
                name: persona.nameCN,
                role: persona.roleCN,
                severity,
                message: issues.length > 0 ? issues[0] : `发现 ${risks.length} 个潜在风险点`,
                suggestion: risks.length > 0 ? `建议关注: ${risks.map(r => r.description).join('; ')}` : undefined,
                details: issues,
            });
        }
        else {
            insights.push({
                persona: 'Abu',
                emoji: persona.emoji,
                name: persona.nameCN,
                role: persona.roleCN,
                severity: 'success',
                message: '✓ 行程安全检查通过，没有发现明显问题',
            });
        }
        return {
            insights,
            evaluation: {
                passed: issues.length === 0 && risks.filter(r => r.severity !== 'low').length === 0,
                issues,
                risks,
            },
        };
    }
    async evaluateWithDrDre(ctx, message) {
        const persona = trip_planner_interface_1.GUARDIAN_PERSONAS.DrDre;
        const insights = [];
        const issues = [];
        const { drDre } = this.GUARDIAN_CONFIG;
        const fatigueLevel = this.calculateFatigueLevel(ctx);
        let paceRecommendation = 'ok';
        if (fatigueLevel > 80) {
            paceRecommendation = 'slow_down';
            issues.push('整体行程强度过高，建议减少活动或增加休息时间');
        }
        else if (fatigueLevel > 60) {
            paceRecommendation = 'slow_down';
            issues.push('行程略显紧凑，部分天可以考虑放慢节奏');
        }
        else if (fatigueLevel < 30) {
            paceRecommendation = 'can_add_more';
        }
        for (const day of ctx.days) {
            if (day.items.length > drDre.maxDailyActivities) {
                issues.push(`第${day.dayNumber}天安排了${day.items.length}个活动，可能比较紧张`);
            }
            if ((day.stats.totalDuration || 0) > 10 * 60) {
                issues.push(`第${day.dayNumber}天活动时间超过10小时，建议适当调整`);
            }
        }
        let consecutiveIntenseDays = 0;
        for (const day of ctx.days) {
            const dayFatigue = (day.items.length / drDre.maxDailyActivities) * 100;
            if (dayFatigue > 70) {
                consecutiveIntenseDays++;
            }
            else {
                consecutiveIntenseDays = 0;
            }
            if (consecutiveIntenseDays >= drDre.maxConsecutiveIntenseDays) {
                issues.push(`连续${consecutiveIntenseDays}天高强度活动，建议插入休息日`);
                break;
            }
        }
        const severity = fatigueLevel > 80 ? 'warning'
            : fatigueLevel > 60 ? 'info'
                : 'success';
        const fatigueEmoji = fatigueLevel > 80 ? '🔴' : fatigueLevel > 60 ? '🟡' : '🟢';
        insights.push({
            persona: 'DrDre',
            emoji: persona.emoji,
            name: persona.nameCN,
            role: persona.roleCN,
            severity,
            message: `${fatigueEmoji} 体力消耗评估: ${Math.round(fatigueLevel)}/100`,
            suggestion: paceRecommendation === 'slow_down'
                ? '建议放慢节奏，您可以说"帮我调整得轻松一点"'
                : paceRecommendation === 'can_add_more'
                    ? '行程还有余量，可以考虑添加更多活动'
                    : '节奏合理，每天都有适当的休息时间',
            details: issues.length > 0 ? issues : undefined,
        });
        return {
            insights,
            evaluation: {
                sustainable: fatigueLevel <= 70,
                fatigueLevel: Math.round(fatigueLevel),
                issues,
                paceRecommendation,
            },
        };
    }
    async evaluateWithNeptune(ctx, message) {
        const persona = trip_planner_interface_1.GUARDIAN_PERSONAS.Neptune;
        const insights = [];
        const alternatives = [];
        const { neptune } = this.GUARDIAN_CONFIG;
        const wantsAlternative = neptune.replacementKeywords.some(kw => message.includes(kw));
        if (wantsAlternative || neptune.proactiveAlternatives) {
            for (const day of ctx.days) {
                for (const item of day.items) {
                    const itemName = this.getItemName(item);
                    if (itemName.includes('迪士尼') && ctx.travelers.elderly > 0) {
                        alternatives.push({
                            original: itemName,
                            replacement: '上野公园 + 浅草寺',
                            reason: '迪士尼可能对老人来说太累',
                            impact: '节省体力，文化体验更深',
                        });
                    }
                }
            }
        }
        if (alternatives.length > 0 || wantsAlternative) {
            insights.push({
                persona: 'Neptune',
                emoji: persona.emoji,
                name: persona.nameCN,
                role: persona.roleCN,
                severity: 'info',
                message: alternatives.length > 0
                    ? `我找到了 ${alternatives.length} 个可能的替代方案`
                    : '我可以帮您找到合适的替代方案，请告诉我您想替换哪个活动',
                suggestion: alternatives.length > 0
                    ? `推荐: ${alternatives[0].original} → ${alternatives[0].replacement}（${alternatives[0].reason}）`
                    : undefined,
                details: alternatives.map(a => `${a.original} → ${a.replacement}: ${a.reason}`),
            });
        }
        return {
            insights,
            evaluation: {
                hasAlternatives: alternatives.length > 0,
                alternatives,
            },
        };
    }
    enrichResponseWithGuardians(response, guardianResult) {
        if (guardianResult.guardiansInvoked.length === 0) {
            return response;
        }
        const sortedInsights = [...guardianResult.insights].sort((a, b) => trip_planner_interface_1.GUARDIAN_PRIORITY[a.persona] - trip_planner_interface_1.GUARDIAN_PRIORITY[b.persona]);
        response.personaInsights = sortedInsights;
        response.guardianEvaluation = guardianResult.evaluation;
        response.meta = {
            ...response.meta,
            guardiansInvoked: guardianResult.guardiansInvoked,
        };
        const hasWarning = sortedInsights.some(i => i.severity === 'warning' || i.severity === 'error');
        if (hasWarning) {
            const warningInsights = sortedInsights.filter(i => i.severity === 'warning' || i.severity === 'error');
            const advisorSummary = warningInsights.map(i => `${i.emoji} ${i.name}: ${i.message}`).join('\n');
            response.message = `💭 **顾问团评估**\n${advisorSummary}\n\n---\n\n${response.message}`;
        }
        return response;
    }
    trackGuardianEvent(event) {
        this.logger.debug(`[Guardian Tracking] ${event.eventType}`, {
            sessionId: event.sessionId,
            tripId: event.tripId,
            data: 'data' in event ? event.data : undefined,
        });
    }
    trackGuardianInvoked(sessionId, tripId, userId, guardiansInvoked, triggerReason, intent, message) {
        const event = {
            eventType: 'guardian.invoked',
            timestamp: new Date().toISOString(),
            sessionId,
            tripId,
            userId,
            data: {
                guardiansInvoked,
                triggerReason,
                intent,
                message: message.substring(0, 100),
            },
        };
        this.trackGuardianEvent(event);
    }
    trackInsightShown(sessionId, tripId, userId, insight) {
        const event = {
            eventType: 'guardian.insight_shown',
            timestamp: new Date().toISOString(),
            sessionId,
            tripId,
            userId,
            data: {
                persona: insight.persona,
                severity: insight.severity,
                insightId: (0, crypto_1.randomUUID)(),
                messagePreview: insight.message.substring(0, 50),
            },
        };
        this.trackGuardianEvent(event);
    }
    trackWarningIgnored(sessionId, tripId, userId, persona, severity, warningType, ignoredMessage, disclaimerShown) {
        const event = {
            eventType: 'guardian.warning_ignored',
            timestamp: new Date().toISOString(),
            sessionId,
            tripId,
            userId,
            data: {
                persona,
                severity,
                warningType,
                ignoredMessage: ignoredMessage.substring(0, 100),
                disclaimerShown,
            },
        };
        this.trackGuardianEvent(event);
    }
    handleUserIgnoredWarning(state, response, ignoredInsight) {
        if (ignoredInsight.severity !== 'warning' && ignoredInsight.severity !== 'error') {
            return response;
        }
        const disclaimer = {
            type: 'user_override_safety',
            message: `您已选择忽略${trip_planner_interface_1.GUARDIAN_PERSONAS[ignoredInsight.persona].nameCN}的安全提示，请自行评估相关风险。`,
            timestamp: new Date().toISOString(),
            relatedPersona: ignoredInsight.persona,
            userAction: 'ignored',
        };
        response.disclaimer = disclaimer;
        this.trackWarningIgnored(state.sessionId, state.tripId, state.userId, ignoredInsight.persona, ignoredInsight.severity, 'safety_warning', ignoredInsight.message, true);
        response.message += `\n\n⚠️ *${disclaimer.message}*`;
        return response;
    }
    createDataIncompleteDisclaimer(missingData) {
        return {
            type: 'data_incomplete',
            message: `以下信息暂不完整，评估结果仅供参考：${missingData.join('、')}`,
            timestamp: new Date().toISOString(),
        };
    }
    createLlmFallbackDisclaimer() {
        return {
            type: 'llm_fallback',
            message: '当前使用基础规则评估，完整智能分析暂时不可用',
            timestamp: new Date().toISOString(),
        };
    }
};
exports.TripPlannerService = TripPlannerService;
exports.TripPlannerService = TripPlannerService = TripPlannerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService,
        state_store_service_1.StateStoreService,
        claude_orchestrator_service_1.ClaudeOrchestratorService,
        gatekeeper_agent_service_1.ClaudeGatekeeperAgentService,
        narrator_agent_service_1.ClaudeNarratorAgentService,
        context_analyzer_service_1.ContextAnalyzerService,
        intent_disambiguator_service_1.IntentDisambiguatorService,
        route_optimization_service_1.RouteOptimizationService,
        enhanced_chat_service_1.EnhancedChatService,
        rag_service_1.RagService,
        hybrid_cache_service_1.HybridCacheService,
        prompt_service_1.PromptService,
        telemetry_service_1.TelemetryService,
        gap_preferences_service_1.GapPreferencesService])
], TripPlannerService);
//# sourceMappingURL=trip-planner.service.js.map