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
var PlanningAssistantService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningAssistantService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../../llm/dto/llm-request.dto");
const planning_workbench_agent_service_1 = require("../../../services/planning-workbench-agent.service");
const persona_shell_service_1 = require("../../../services/persona-shell.service");
const prisma_service_1 = require("../../../../prisma/prisma.service");
const persona_language_service_1 = require("../../shared/services/persona-language.service");
const recommendation_engine_service_1 = require("../../shared/services/recommendation-engine.service");
const preference_learning_service_1 = require("../../shared/services/preference-learning.service");
const llm_executor_service_1 = require("../../../infra/llm-executor.service");
const core_gateway_service_1 = require("../../../infra/core-gateway.service");
const crypto_1 = require("crypto");
let PlanningAssistantService = PlanningAssistantService_1 = class PlanningAssistantService {
    constructor(coreGateway, llmExecutor, llmService, planningWorkbench, personaShell, prisma, personaLanguage, recommendationEngine, preferenceLearning) {
        this.coreGateway = coreGateway;
        this.llmExecutor = llmExecutor;
        this.llmService = llmService;
        this.planningWorkbench = planningWorkbench;
        this.personaShell = personaShell;
        this.prisma = prisma;
        this.personaLanguage = personaLanguage;
        this.recommendationEngine = recommendationEngine;
        this.preferenceLearning = preferenceLearning;
        this.logger = new common_1.Logger(PlanningAssistantService_1.name);
        this.sessions = new Map();
        this.SESSION_TTL_MS = 24 * 60 * 60 * 1000;
        this.logger.log('🚀 规划助手智能体已初始化 (V2.1 架构)');
        this.logger.debug(`服务注入状态: CoreGateway=${!!coreGateway}, LLMExecutor=${!!llmExecutor}, LLM=${!!llmService}, PlanningWorkbench=${!!planningWorkbench}, PersonaShell=${!!personaShell}, Prisma=${!!prisma}`);
    }
    async chat(request) {
        const startTime = Date.now();
        this.logger.debug(`[规划助手] 收到消息: sessionId=${request.sessionId}, message=${request.message.substring(0, 50)}...`);
        try {
            let state = await this.loadOrCreateSession(request.sessionId, request.userId);
            state = this.addMessage(state, {
                id: (0, crypto_1.randomUUID)(),
                role: 'user',
                content: request.message,
                timestamp: new Date().toISOString(),
            });
            const intent = await this.analyzeIntentWithLLM(request.message, state);
            this.logger.debug(`[规划助手] 意图分析: ${intent}`);
            let response;
            switch (intent) {
                case 'EXPLORE':
                    response = await this.handleExplore(state, request);
                    break;
                case 'RECOMMEND':
                    response = await this.handleRecommendWithReadiness(state, request);
                    break;
                case 'COLLECT_INFO':
                    response = await this.handleCollectInfo(state, request);
                    break;
                case 'GENERATE_PLAN':
                    response = await this.handleGeneratePlanWithWorkbench(state, request);
                    break;
                case 'COMPARE':
                    response = await this.handleCompare(state, request);
                    break;
                case 'ADJUST':
                    response = await this.handleAdjust(state, request);
                    break;
                case 'CONFIRM':
                    response = await this.handleConfirmAndSaveTrip(state, request);
                    break;
                case 'QUESTION':
                    response = await this.handleQuestionWithLLM(state, request);
                    break;
                default:
                    response = await this.handleGeneralWithLLM(state, request);
            }
            state = this.addMessage(state, {
                id: (0, crypto_1.randomUUID)(),
                role: 'assistant',
                content: response.message,
                intent,
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
    async createSession(userId) {
        const sessionId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const state = {
            sessionId,
            userId,
            phase: 'INITIAL',
            preferences: {},
            messageHistory: [],
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(Date.now() + this.SESSION_TTL_MS).toISOString(),
        };
        await this.saveSession(state);
        this.logger.debug(`[规划助手] 创建新会话: ${sessionId}`);
        return sessionId;
    }
    async getSessionState(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    async analyzeIntentWithLLM(message, state) {
        if (!this.llmService) {
            return this.analyzeIntentByKeywords(message, state);
        }
        try {
            const prompt = `你是一个旅行规划助手的意图分析器。分析用户消息并返回最匹配的意图。

当前对话阶段: ${state.phase}
用户已收集的偏好: ${JSON.stringify(state.preferences)}
最近3条消息: ${state.messageHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

用户最新消息: "${message}"

可选意图:
- EXPLORE: 用户想探索目的地，还不确定去哪里
- RECOMMEND: 用户想要推荐
- COLLECT_INFO: 用户在回答问题，提供偏好信息
- GENERATE_PLAN: 用户想生成行程方案
- COMPARE: 用户想对比方案
- ADJUST: 用户想调整方案
- CONFIRM: 用户确认方案
- QUESTION: 用户在问问题
- GENERAL: 其他通用对话

只返回意图名称，不要其他内容:`;
            const result = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            const intent = result.trim().toUpperCase();
            const validIntents = ['EXPLORE', 'RECOMMEND', 'COLLECT_INFO', 'GENERATE_PLAN', 'COMPARE', 'ADJUST', 'CONFIRM', 'QUESTION', 'GENERAL'];
            if (validIntents.includes(intent)) {
                return intent;
            }
        }
        catch (error) {
            this.logger.warn(`LLM 意图分析失败: ${error.message}，回退到关键词分析`);
        }
        return this.analyzeIntentByKeywords(message, state);
    }
    analyzeIntentByKeywords(message, state) {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('去哪') || lowerMessage.includes('推荐') ||
            lowerMessage.includes('哪里') || lowerMessage.includes('目的地') ||
            lowerMessage.includes('where') || lowerMessage.includes('recommend')) {
            return state.phase === 'INITIAL' ? 'EXPLORE' : 'RECOMMEND';
        }
        if (lowerMessage.includes('规划') || lowerMessage.includes('安排') ||
            lowerMessage.includes('行程') || lowerMessage.includes('计划') ||
            lowerMessage.includes('plan') || lowerMessage.includes('itinerary')) {
            return 'GENERATE_PLAN';
        }
        if (lowerMessage.includes('对比') || lowerMessage.includes('比较') ||
            lowerMessage.includes('哪个好') || lowerMessage.includes('compare')) {
            return 'COMPARE';
        }
        if (lowerMessage.includes('修改') || lowerMessage.includes('调整') ||
            lowerMessage.includes('换') || lowerMessage.includes('改') ||
            lowerMessage.includes('adjust') || lowerMessage.includes('change')) {
            return 'ADJUST';
        }
        if (lowerMessage.includes('确认') || lowerMessage.includes('就这个') ||
            lowerMessage.includes('可以') || lowerMessage.includes('好的') ||
            lowerMessage.includes('confirm') || lowerMessage.includes('ok')) {
            if (state.selectedPlanId) {
                return 'CONFIRM';
            }
        }
        if (lowerMessage.includes('?') || lowerMessage.includes('？') ||
            lowerMessage.includes('什么') || lowerMessage.includes('怎么') ||
            lowerMessage.includes('为什么') || lowerMessage.includes('多少')) {
            return 'QUESTION';
        }
        if (state.phase === 'INITIAL' || state.phase === 'EXPLORING') {
            return 'COLLECT_INFO';
        }
        return 'GENERAL';
    }
    async handleRecommendWithReadiness(state, request) {
        var _a;
        let recommendations = [];
        let mergedPreferences = state.preferences;
        if (this.preferenceLearning && request.userId) {
            try {
                mergedPreferences = await this.preferenceLearning.mergeWithLearnedPreferences(request.userId, state.preferences);
                this.logger.debug(`[规划助手] 已合并用户学习偏好`);
            }
            catch (error) {
                this.logger.warn(`[规划助手] 合并偏好失败: ${error.message}`);
            }
        }
        if (this.recommendationEngine) {
            try {
                const scoredDestinations = await this.recommendationEngine.getRecommendations({
                    preferences: mergedPreferences,
                    limit: 5,
                    excludeDestinations: [],
                    countryCode: request.countryCode,
                });
                recommendations = scoredDestinations.map(sd => sd.destination);
                this.logger.debug(`[规划助手] 推荐引擎返回 ${recommendations.length} 个目的地${request.countryCode ? ` (过滤: ${request.countryCode})` : ''}`);
            }
            catch (error) {
                this.logger.warn(`[规划助手] 推荐引擎调用失败: ${error.message}`);
            }
        }
        if (recommendations.length === 0 && this.prisma) {
            try {
                const where = { isActive: true };
                if (request.countryCode) {
                    where.countryCode = request.countryCode.toUpperCase();
                    this.logger.debug(`[规划助手] 数据库查询过滤国家代码: ${request.countryCode}`);
                }
                const packs = await this.prisma.readinessPack.findMany({
                    where,
                    take: 10,
                    orderBy: { updatedAt: 'desc' },
                    select: {
                        packId: true,
                        destinationId: true,
                        displayName: true,
                        countryCode: true,
                        region: true,
                        city: true,
                        packData: true,
                    },
                });
                recommendations = packs.slice(0, 5).map((pack, index) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    const packData = pack.packData;
                    const displayNameEN = ((_a = packData === null || packData === void 0 ? void 0 : packData.displayName) === null || _a === void 0 ? void 0 : _a.en) || pack.displayName;
                    const displayNameCN = ((_b = packData === null || packData === void 0 ? void 0 : packData.displayName) === null || _b === void 0 ? void 0 : _b.zh) || pack.displayName;
                    return {
                        id: pack.packId,
                        countryCode: pack.countryCode,
                        name: displayNameEN,
                        nameCN: displayNameCN,
                        description: ((_c = packData === null || packData === void 0 ? void 0 : packData.overview) === null || _c === void 0 ? void 0 : _c.en) || `Explore ${displayNameEN}`,
                        descriptionCN: ((_d = packData === null || packData === void 0 ? void 0 : packData.overview) === null || _d === void 0 ? void 0 : _d.zh) || `探索${displayNameCN}`,
                        highlights: ((_e = packData === null || packData === void 0 ? void 0 : packData.highlights) === null || _e === void 0 ? void 0 : _e.en) || [],
                        highlightsCN: ((_f = packData === null || packData === void 0 ? void 0 : packData.highlights) === null || _f === void 0 ? void 0 : _f.zh) || [],
                        matchScore: 95 - index * 5,
                        matchReasons: this.generateMatchReasons(pack, mergedPreferences),
                        matchReasonsCN: this.generateMatchReasonsCN(pack, mergedPreferences),
                        estimatedBudget: {
                            min: ((_g = packData === null || packData === void 0 ? void 0 : packData.budget) === null || _g === void 0 ? void 0 : _g.min) || 2000,
                            max: ((_h = packData === null || packData === void 0 ? void 0 : packData.budget) === null || _h === void 0 ? void 0 : _h.max) || 5000,
                            currency: 'USD',
                        },
                        bestSeasons: (packData === null || packData === void 0 ? void 0 : packData.bestSeasons) || ['Spring', 'Autumn'],
                        tags: (packData === null || packData === void 0 ? void 0 : packData.tags) || ['culture', 'nature'],
                    };
                });
            }
            catch (error) {
                this.logger.warn(`[规划助手] 获取 Readiness 数据失败: ${error.message}`);
            }
        }
        if (recommendations.length === 0) {
            recommendations = this.getDefaultRecommendations();
        }
        state.recommendations = recommendations;
        let personaComments = '';
        let personaCommentsCN = '';
        if (this.personaLanguage && recommendations.length > 0) {
            try {
                const topRec = recommendations[0];
                const context = {
                    scenario: 'destination_recommend',
                    destination: topRec.name,
                    data: {
                        budget: (_a = mergedPreferences.budget) === null || _a === void 0 ? void 0 : _a.total,
                    },
                };
                const statements = await this.personaLanguage.generateAllPersonaStatements(context);
                personaComments = `\n\n${statements.abu.icon} **Abu**: ${statements.abu.message}`;
                personaCommentsCN = `\n\n${statements.abu.icon} **Abu 说**: ${statements.abu.messageCN}`;
                personaComments += `\n${statements.neptune.icon} **Neptune**: ${statements.neptune.message}`;
                personaCommentsCN += `\n${statements.neptune.icon} **Neptune 说**: ${statements.neptune.messageCN}`;
            }
            catch (error) {
                this.logger.warn(`[规划助手] 生成人格评论失败: ${error.message}`);
            }
        }
        const recommendText = recommendations.slice(0, 3).map((r, i) => `${i + 1}. **${r.nameCN}** (${r.name}) - 匹配度 ${r.matchScore}%\n   ${r.descriptionCN}\n   ${r.matchReasonsCN.slice(0, 2).join(' | ')}`).join('\n\n');
        return {
            message: `Based on your preferences, here are my top recommendations:\n\n${recommendations.slice(0, 3).map((r, i) => `${i + 1}. **${r.name}** - Match: ${r.matchScore}%\n   ${r.description}\n   ${r.matchReasons.slice(0, 2).join(' | ')}`).join('\n\n')}${personaComments}\n\nWhich destination interests you most?`,
            messageCN: `根据你的偏好，这是我推荐的目的地：\n\n${recommendText}${personaCommentsCN}\n\n你最感兴趣哪个目的地？我可以为你创建详细的行程规划！`,
            phase: 'RECOMMENDING',
            recommendations,
            suggestedActions: recommendations.slice(0, 3).map(r => ({
                action: `select_${r.id}`,
                label: `Choose ${r.name}`,
                labelCN: `选择${r.nameCN}`,
            })),
        };
    }
    async handleGeneratePlanWithWorkbench(state, request) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        const destination = this.extractDestination(request.message, state);
        if (destination) {
            state.selectedDestination = destination;
            if (this.preferenceLearning && request.userId) {
                try {
                    await this.preferenceLearning.learnFromAction({
                        userId: request.userId,
                        action: 'destination_selected',
                        data: {
                            destination,
                            destinationType: (_b = (_a = state.recommendations) === null || _a === void 0 ? void 0 : _a.find(r => r.name === destination)) === null || _b === void 0 ? void 0 : _b.tags,
                        },
                    });
                }
                catch (error) {
                    this.logger.warn(`[规划助手] 学习偏好失败: ${error.message}`);
                }
            }
        }
        let planCandidates = [];
        let personaEvaluation;
        if (this.coreGateway && state.selectedDestination) {
            try {
                this.logger.debug(`[规划助手] 通过 CoreGateway 触发方案生成: ${state.selectedDestination}`);
                const startDate = ((_c = state.preferences.dateRange) === null || _c === void 0 ? void 0 : _c.startDate) || this.getDefaultStartDate();
                const endDate = ((_d = state.preferences.dateRange) === null || _d === void 0 ? void 0 : _d.endDate) || this.getDefaultEndDate();
                const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) || 10;
                const coreResult = await this.coreGateway.generatePlan({
                    userId: request.userId || 'anonymous',
                    sessionId: state.sessionId,
                    destination: state.selectedDestination,
                    preferences: {
                        budget: state.preferences.budget,
                        travelers: state.preferences.travelers,
                        dateRange: { startDate, endDate },
                        activities: state.preferences.activities,
                    },
                    constraints: {
                        days,
                        startDate,
                        endDate,
                    },
                });
                if (coreResult.success && coreResult.data) {
                    const workbenchResponse = coreResult.data;
                    if ((_f = (_e = workbenchResponse.uiOutput) === null || _e === void 0 ? void 0 : _e.skeletonOptions) === null || _f === void 0 ? void 0 : _f.options) {
                        planCandidates = workbenchResponse.uiOutput.skeletonOptions.options.map((opt, index) => ({
                            id: `plan-${index}`,
                            name: opt.name || `Option ${index + 1}`,
                            nameCN: `方案 ${index + 1}`,
                            description: 'A carefully crafted itinerary',
                            descriptionCN: '精心设计的行程',
                            destination: state.selectedDestination || '',
                            duration: days,
                            highlights: [],
                            estimatedBudget: {
                                total: 5000,
                                breakdown: {
                                    flight: 1500,
                                    accommodation: 2000,
                                    activities: 1000,
                                    food: 500,
                                    other: 0,
                                },
                            },
                            pace: 'moderate',
                            suitability: {
                                score: 90 - index * 5,
                                reasons: [],
                            },
                        }));
                    }
                    if ((_g = workbenchResponse.uiOutput) === null || _g === void 0 ? void 0 : _g.personas) {
                        personaEvaluation = workbenchResponse.uiOutput.personas;
                    }
                }
                this.logger.debug(`[规划助手] CoreGateway 返回 ${planCandidates.length} 个方案 (traceId=${(_h = coreResult.meta) === null || _h === void 0 ? void 0 : _h.traceId})`);
            }
            catch (error) {
                this.logger.warn(`[规划助手] CoreGateway 调用失败: ${error.message}，使用默认方案`);
            }
        }
        else if (this.planningWorkbench && state.selectedDestination) {
            this.logger.warn(`[规划助手] CoreGateway 不可用，降级使用直接调用`);
            try {
                const startDate = ((_j = state.preferences.dateRange) === null || _j === void 0 ? void 0 : _j.startDate) || this.getDefaultStartDate();
                const endDate = ((_k = state.preferences.dateRange) === null || _k === void 0 ? void 0 : _k.endDate) || this.getDefaultEndDate();
                const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) || 10;
                const workbenchResponse = await this.planningWorkbench.execute({
                    context: {
                        destination: {
                            country: state.selectedDestination,
                            city: state.selectedDestination,
                        },
                        days,
                        constraints: {
                            time: { days, startDate, endDate },
                            budget: {
                                total: ((_l = state.preferences.budget) === null || _l === void 0 ? void 0 : _l.total) || 5000,
                                currency: ((_m = state.preferences.budget) === null || _m === void 0 ? void 0 : _m.currency) || 'USD',
                            },
                            companions: { count: ((_o = state.preferences.travelers) === null || _o === void 0 ? void 0 : _o.adults) || 2 },
                        },
                    },
                    userAction: 'generate',
                });
                if ((_p = workbenchResponse.uiOutput.skeletonOptions) === null || _p === void 0 ? void 0 : _p.options) {
                    planCandidates = workbenchResponse.uiOutput.skeletonOptions.options.map((opt, index) => ({
                        id: `plan-${index}`,
                        name: opt.name || `Option ${index + 1}`,
                        nameCN: `方案 ${index + 1}`,
                        description: 'A carefully crafted itinerary',
                        descriptionCN: '精心设计的行程',
                        destination: state.selectedDestination || '',
                        duration: days,
                        highlights: [],
                        estimatedBudget: {
                            total: 5000,
                            breakdown: { flight: 1500, accommodation: 2000, activities: 1000, food: 500, other: 0 },
                        },
                        pace: 'moderate',
                        suitability: { score: 90 - index * 5, reasons: [] },
                    }));
                }
                if (workbenchResponse.uiOutput.personas) {
                    personaEvaluation = workbenchResponse.uiOutput.personas;
                }
                else if (this.personaShell && workbenchResponse.planState) {
                    personaEvaluation = await this.personaShell.wrapAsPersonas(workbenchResponse.planState);
                }
            }
            catch (error) {
                this.logger.warn(`[规划助手] 降级调用也失败: ${error.message}`);
            }
        }
        if (planCandidates.length === 0) {
            planCandidates = this.getDefaultPlanCandidates(state);
        }
        state.planCandidates = planCandidates;
        if (this.preferenceLearning && request.userId) {
            try {
                await this.preferenceLearning.learnFromAction({
                    userId: request.userId,
                    action: 'plan_generated',
                    data: {
                        destination: state.selectedDestination,
                        budget: (_q = state.preferences.budget) === null || _q === void 0 ? void 0 : _q.total,
                        days: (_r = planCandidates[0]) === null || _r === void 0 ? void 0 : _r.duration,
                        travelers: state.preferences.travelers,
                    },
                });
            }
            catch (error) {
                this.logger.warn(`[规划助手] 学习偏好失败: ${error.message}`);
            }
        }
        const planText = planCandidates.map((p, i) => {
            const budgetStr = `$${p.estimatedBudget.total.toLocaleString()}`;
            return `${i + 1}. **${p.nameCN}** - ${budgetStr}\n   ${p.duration}天 | ${p.descriptionCN}\n   匹配度：${p.suitability.score}%`;
        }).join('\n\n');
        let personaText = '';
        let personaTextCN = '';
        if (this.personaLanguage && planCandidates.length > 0) {
            try {
                const topPlan = planCandidates[0];
                const context = {
                    scenario: 'plan_evaluation',
                    destination: state.selectedDestination,
                    planName: topPlan.nameCN,
                    data: {
                        budget: topPlan.estimatedBudget.total,
                        duration: topPlan.duration,
                        fatigueScore: topPlan.pace === 'intensive' ? 70 : topPlan.pace === 'moderate' ? 40 : 20,
                    },
                };
                const statements = await this.personaLanguage.generateAllPersonaStatements(context);
                personaText = `\n\n🐻‍❄️ **Abu**: ${statements.abu.message}`;
                personaText += `\n🐕 **Dr.Dre**: ${statements.drdre.message}`;
                personaText += `\n🦦 **Neptune**: ${statements.neptune.message}`;
                personaTextCN = `\n\n🐻‍❄️ **Abu 说**: ${statements.abu.messageCN}`;
                personaTextCN += `\n🐕 **Dr.Dre 说**: ${statements.drdre.messageCN}`;
                personaTextCN += `\n🦦 **Neptune 说**: ${statements.neptune.messageCN}`;
                this.logger.debug(`[规划助手] 人格语言服务生成评价成功`);
            }
            catch (error) {
                this.logger.warn(`[规划助手] 人格语言服务调用失败: ${error.message}，使用 PersonaShell 回退`);
            }
        }
        if (!personaText && personaEvaluation) {
            if (personaEvaluation.personas.abu) {
                personaText += `\n\n🐻‍❄️ **Abu**: ${personaEvaluation.personas.abu.explanation}`;
                personaTextCN += `\n\n🐻‍❄️ **Abu 说**: ${personaEvaluation.personas.abu.explanation}`;
            }
            if (personaEvaluation.personas.drdre) {
                personaText += `\n🐕 **Dr.Dre**: ${personaEvaluation.personas.drdre.explanation}`;
                personaTextCN += `\n🐕 **Dr.Dre 说**: ${personaEvaluation.personas.drdre.explanation}`;
            }
            if (personaEvaluation.personas.neptune) {
                personaText += `\n🦦 **Neptune**: ${personaEvaluation.personas.neptune.explanation}`;
                personaTextCN += `\n🦦 **Neptune 说**: ${personaEvaluation.personas.neptune.explanation}`;
            }
        }
        return {
            message: `I've created ${planCandidates.length} itinerary options for ${state.selectedDestination}:\n\n${planCandidates.map((p, i) => `${i + 1}. **${p.name}** - $${p.estimatedBudget.total.toLocaleString()}\n   ${p.duration} days | ${p.description}`).join('\n\n')}${personaText}\n\nWhich plan would you like to explore further?`,
            messageCN: `我为你的${state.selectedDestination}之旅创建了 ${planCandidates.length} 个方案：\n\n${planText}${personaTextCN}\n\n想详细了解哪个方案？`,
            phase: 'PLANNING',
            planCandidates,
            suggestedActions: planCandidates.map(p => ({
                action: `view_${p.id}`,
                label: `View ${p.name}`,
                labelCN: `查看${p.nameCN}`,
            })),
        };
    }
    async handleConfirmAndSaveTrip(state, request) {
        var _a, _b, _c, _d, _e, _f;
        const selectedPlanId = this.extractSelectedPlanId(request.message, state);
        if (selectedPlanId) {
            state.selectedPlanId = selectedPlanId;
        }
        const selectedPlan = (_a = state.planCandidates) === null || _a === void 0 ? void 0 : _a.find(p => p.id === state.selectedPlanId);
        let tripId = `trip-${Date.now()}`;
        if (this.prisma && selectedPlan) {
            try {
                const { generateDefaultTripName } = require('../../../../trips/utils/trip-name.util');
                const destination = state.selectedDestination || selectedPlan.destination;
                const startDate = ((_b = state.preferences.dateRange) === null || _b === void 0 ? void 0 : _b.startDate) || this.getDefaultStartDate();
                const tripName = generateDefaultTripName({
                    destination,
                    startDate: new Date(startDate),
                });
                const trip = await this.prisma.trip.create({
                    data: {
                        id: tripId,
                        name: tripName,
                        destination: destination,
                        startDate: new Date(startDate),
                        endDate: new Date(((_c = state.preferences.dateRange) === null || _c === void 0 ? void 0 : _c.endDate) || this.getDefaultEndDate()),
                        status: 'PLANNING',
                        updatedAt: new Date(),
                        budgetConfig: {
                            total: selectedPlan.estimatedBudget.total,
                            breakdown: selectedPlan.estimatedBudget.breakdown,
                        },
                        metadata: {
                            userId: state.userId,
                            travelers: ((_d = state.preferences.travelers) === null || _d === void 0 ? void 0 : _d.adults) || 2,
                            planId: selectedPlan.id,
                            sessionId: state.sessionId,
                        },
                    },
                });
                tripId = trip.id;
                this.logger.debug(`[规划助手] Trip 已保存: ${tripId}`);
            }
            catch (error) {
                this.logger.warn(`[规划助手] 保存 Trip 失败: ${error.message}，使用临时 ID`);
            }
        }
        state.confirmedTripId = tripId;
        if (this.preferenceLearning && request.userId && selectedPlan) {
            try {
                await this.preferenceLearning.learnFromAction({
                    userId: request.userId,
                    action: 'plan_confirmed',
                    data: {
                        destination: state.selectedDestination,
                        destinationType: (_f = (_e = state.recommendations) === null || _e === void 0 ? void 0 : _e.find(r => r.name === state.selectedDestination)) === null || _f === void 0 ? void 0 : _f.tags,
                        budget: selectedPlan.estimatedBudget.total,
                        days: selectedPlan.duration,
                        travelers: state.preferences.travelers,
                        pace: selectedPlan.pace,
                    },
                });
                this.logger.debug(`[规划助手] 已学习用户确认偏好`);
            }
            catch (error) {
                this.logger.warn(`[规划助手] 学习偏好失败: ${error.message}`);
            }
        }
        let personaFarewell = '';
        let personaFarewellCN = '';
        if (this.personaLanguage) {
            try {
                const context = {
                    scenario: 'general',
                    destination: state.selectedDestination,
                    planName: selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.nameCN,
                };
                const statements = await this.personaLanguage.generateAllPersonaStatements(context);
                personaFarewell = `\n\n${statements.abu.icon} ${statements.abu.message}`;
                personaFarewell += `\n${statements.drdre.icon} ${statements.drdre.message}`;
                personaFarewell += `\n${statements.neptune.icon} ${statements.neptune.message}`;
                personaFarewellCN = `\n\n${statements.abu.icon} ${statements.abu.messageCN}`;
                personaFarewellCN += `\n${statements.drdre.icon} ${statements.drdre.messageCN}`;
                personaFarewellCN += `\n${statements.neptune.icon} ${statements.neptune.messageCN}`;
            }
            catch (error) {
                this.logger.warn(`[规划助手] 生成祝福语失败: ${error.message}`);
            }
        }
        return {
            message: `🎉 Excellent choice! Your trip has been confirmed!

**Trip ID**: ${tripId}
**Destination**: ${state.selectedDestination || (selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.destination) || 'Your destination'}
**Duration**: ${(selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.duration) || 10} days
**Plan**: ${(selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.name) || 'Your selected plan'}

What's next?
- View your detailed itinerary
- Start preparing (packing list, visa info, etc.)
- Share with travel companions
${personaFarewell}
Have a wonderful trip! 🌟`,
            messageCN: `🎉 太棒了！你的行程已确认！

**行程编号**: ${tripId}
**目的地**: ${state.selectedDestination || (selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.destination) || '你的目的地'}
**时长**: ${(selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.duration) || 10}天
**方案**: ${(selectedPlan === null || selectedPlan === void 0 ? void 0 : selectedPlan.nameCN) || '你选择的方案'}

接下来可以：
- 查看详细行程安排
- 开始准备（打包清单、签证信息等）
- 分享给同行伙伴
${personaFarewellCN}
祝你旅途愉快！🌟`,
            phase: 'COMPLETED',
            confirmedTripId: tripId,
            suggestedActions: [
                { action: 'view_itinerary', label: 'View Itinerary', labelCN: '查看行程' },
                { action: 'start_preparing', label: 'Start Preparing', labelCN: '开始准备' },
                { action: 'share_trip', label: 'Share Trip', labelCN: '分享行程' },
            ],
        };
    }
    async handleQuestionWithLLM(state, request) {
        var _a, _b;
        if (!this.llmService) {
            return this.handleQuestionDefault(state, request);
        }
        try {
            const contextInfo = state.selectedDestination
                ? `用户正在规划去${state.selectedDestination}的旅行。`
                : '用户还在探索目的地。';
            const prompt = `你是一个专业的旅行规划助手。请回答用户的问题。

${contextInfo}
用户偏好: ${JSON.stringify(state.preferences)}

用户问题: "${request.message}"

请用友好、专业的语气回答，同时提供中英双语回复。格式：
EN: [英文回复]
CN: [中文回复]`;
            const result = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            const enMatch = result.match(/EN:\s*(.+?)(?=CN:|$)/s);
            const cnMatch = result.match(/CN:\s*(.+?)$/s);
            const messageEN = ((_a = enMatch === null || enMatch === void 0 ? void 0 : enMatch[1]) === null || _a === void 0 ? void 0 : _a.trim()) || result;
            const messageCN = ((_b = cnMatch === null || cnMatch === void 0 ? void 0 : cnMatch[1]) === null || _b === void 0 ? void 0 : _b.trim()) || result;
            return {
                message: messageEN,
                messageCN: messageCN,
                phase: state.phase,
            };
        }
        catch (error) {
            this.logger.warn(`LLM 问答失败: ${error.message}`);
            return this.handleQuestionDefault(state, request);
        }
    }
    handleQuestionDefault(state, request) {
        return {
            message: `That's a great question! Based on my knowledge, I'd suggest exploring more about your destination. Is there anything specific about ${state.selectedDestination || 'your trip'} you'd like to know?`,
            messageCN: `这是个好问题！根据我的了解，建议你多了解目的地的情况。关于${state.selectedDestination || '你的旅行'}，有什么具体想知道的吗？`,
            phase: state.phase,
        };
    }
    async handleGeneralWithLLM(state, request) {
        var _a, _b;
        if (!this.llmService) {
            return this.handleGeneralDefault(state, request);
        }
        try {
            const prompt = `你是一个友好的旅行规划助手。用户发来了一条消息，请自然地回应并引导用户继续规划旅行。

当前状态: ${state.phase}
用户消息: "${request.message}"

回复要简洁友好，引导用户继续对话。格式：
EN: [英文回复]
CN: [中文回复]`;
            const result = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            const enMatch = result.match(/EN:\s*(.+?)(?=CN:|$)/s);
            const cnMatch = result.match(/CN:\s*(.+?)$/s);
            return {
                message: ((_a = enMatch === null || enMatch === void 0 ? void 0 : enMatch[1]) === null || _a === void 0 ? void 0 : _a.trim()) || result,
                messageCN: ((_b = cnMatch === null || cnMatch === void 0 ? void 0 : cnMatch[1]) === null || _b === void 0 ? void 0 : _b.trim()) || result,
                phase: state.phase,
                suggestedActions: [
                    { action: 'explore', label: 'Explore destinations', labelCN: '探索目的地' },
                    { action: 'start_planning', label: 'Start planning', labelCN: '开始规划' },
                ],
            };
        }
        catch (error) {
            return this.handleGeneralDefault(state, request);
        }
    }
    handleGeneralDefault(state, request) {
        return {
            message: `I'm here to help you plan your perfect trip! 🌟

You can:
- Tell me where you'd like to go
- Ask for destination recommendations
- Let me create an itinerary for you

What would you like to do?`,
            messageCN: `我在这里帮你规划完美的旅行！🌟

你可以：
- 告诉我你想去哪里
- 让我推荐目的地
- 让我为你创建行程

你想做什么呢？`,
            phase: state.phase,
            suggestedActions: [
                { action: 'explore', label: 'Explore destinations', labelCN: '探索目的地' },
                { action: 'start_planning', label: 'Start planning', labelCN: '开始规划' },
            ],
        };
    }
    async handleExplore(state, request) {
        return {
            message: `Great! I'd love to help you plan your trip! 🌟

To give you the best recommendations, I'd like to know a bit more:

1. **When** are you planning to travel?
2. **Who** will be traveling?
3. **What's your budget** range?`,
            messageCN: `太好了！我很乐意帮你规划旅行！🌟

为了给你更好的推荐，我想先了解一下：

1. **什么时候**出发？
2. **谁一起去**？
3. **预算大概多少**？`,
            phase: 'EXPLORING',
            guidingQuestions: [
                {
                    question: 'When are you planning to travel?',
                    questionCN: '计划什么时候出发？',
                    type: 'text',
                },
                {
                    question: 'Who will be traveling?',
                    questionCN: '谁一起去？',
                    options: ['Solo', 'Couple', 'Family', 'Friends'],
                    optionsCN: ['独自出行', '情侣', '家庭', '朋友'],
                    type: 'single',
                },
            ],
        };
    }
    async handleCollectInfo(state, request) {
        const extractedPreferences = this.extractPreferences(request.message);
        state.preferences = { ...state.preferences, ...extractedPreferences };
        const missingInfo = this.getMissingInfo(state.preferences);
        if (missingInfo.length === 0) {
            return this.handleRecommendWithReadiness(state, request);
        }
        return {
            message: `Got it! Could you also tell me about ${missingInfo[0]}?`,
            messageCN: `明白了！能再告诉我${this.translateMissingInfo(missingInfo[0])}吗？`,
            phase: 'EXPLORING',
            guidingQuestions: [
                {
                    question: `What about your ${missingInfo[0]}?`,
                    questionCN: `关于${this.translateMissingInfo(missingInfo[0])}呢？`,
                    type: 'text',
                },
            ],
        };
    }
    async handleCompare(state, request) {
        const candidates = state.planCandidates || [];
        return {
            message: `Here's a comparison of your options:\n\n${candidates.map(c => `**${c.name}**: $${c.estimatedBudget.total} | ${c.pace} pace | Score: ${c.suitability.score}%`).join('\n')}\n\nWhich one appeals to you most?`,
            messageCN: `这是方案对比：\n\n${candidates.map(c => `**${c.nameCN}**: ¥${(c.estimatedBudget.total * 7).toLocaleString()} | ${this.translatePace(c.pace)} | 匹配度: ${c.suitability.score}%`).join('\n')}\n\n你更喜欢哪个？`,
            phase: 'COMPARING',
        };
    }
    async handleAdjust(state, request) {
        return {
            message: `Sure! What would you like to adjust?
- Duration
- Budget  
- Pace
- Specific activities`,
            messageCN: `没问题！你想调整什么？
- 时长
- 预算
- 节奏
- 具体活动`,
            phase: 'ADJUSTING',
        };
    }
    async loadOrCreateSession(sessionId, userId) {
        let state = this.sessions.get(sessionId);
        if (!state || new Date(state.expiresAt) < new Date()) {
            const now = new Date().toISOString();
            state = {
                sessionId,
                userId,
                phase: 'INITIAL',
                preferences: {},
                messageHistory: [],
                createdAt: now,
                updatedAt: now,
                expiresAt: new Date(Date.now() + this.SESSION_TTL_MS).toISOString(),
            };
        }
        return state;
    }
    async saveSession(state) {
        this.sessions.set(state.sessionId, state);
    }
    addMessage(state, message) {
        return {
            ...state,
            messageHistory: [...state.messageHistory, message],
        };
    }
    createErrorResponse(errorMessage) {
        return {
            message: `I apologize, something went wrong. Please try again.`,
            messageCN: `抱歉，出了点问题。请重试。`,
            phase: 'INITIAL',
        };
    }
    extractPreferences(message) {
        var _a;
        const preferences = {};
        const lowerMessage = message.toLowerCase();
        const budgetMatch = message.match(/(\d+)\s*(万|k|thousand|usd|rmb|美元|人民币)?/i);
        if (budgetMatch) {
            const amount = parseInt(budgetMatch[1]);
            const unit = ((_a = budgetMatch[2]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
            let total = amount;
            if (unit.includes('万') || unit === 'k')
                total = amount * 10000;
            preferences.budget = { total, currency: unit.includes('usd') || unit.includes('美元') ? 'USD' : 'CNY' };
        }
        const travelerPatterns = [
            /(\d+)\s*个人/,
            /(\d+)\s*人/,
            /(\d+)\s*位/,
            /(\d+)\s*persons?/i,
            /(\d+)\s*people/i,
            /(\d+)\s*adults?/i,
        ];
        let travelersMatched = false;
        for (const pattern of travelerPatterns) {
            const match = message.match(pattern);
            if (match) {
                const count = parseInt(match[1], 10);
                if (count > 0 && count <= 20) {
                    preferences.travelers = { adults: count };
                    travelersMatched = true;
                    break;
                }
            }
        }
        if (!travelersMatched) {
            if (lowerMessage.includes('一个人') || lowerMessage.includes('solo') || lowerMessage.includes('独自')) {
                preferences.travelers = { adults: 1 };
            }
            else if (lowerMessage.includes('两个人') || lowerMessage.includes('couple') || lowerMessage.includes('情侣')) {
                preferences.travelers = { adults: 2 };
            }
        }
        const monthMatch = message.match(/(\d{1,2})月|(\w+)\s*月/);
        if (monthMatch) {
            const month = parseInt(monthMatch[1]) || this.parseMonth(monthMatch[2]);
            if (month) {
                const year = new Date().getFullYear();
                preferences.dateRange = {
                    preferredMonths: [month],
                    startDate: `${year}-${month.toString().padStart(2, '0')}-01`,
                };
            }
        }
        return preferences;
    }
    parseMonth(monthStr) {
        const months = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
            'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
            'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
            'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
        };
        return months[monthStr === null || monthStr === void 0 ? void 0 : monthStr.toLowerCase()];
    }
    getMissingInfo(preferences) {
        var _a, _b, _c, _d, _e;
        const missing = [];
        if (!((_a = preferences.dateRange) === null || _a === void 0 ? void 0 : _a.startDate) && !((_b = preferences.dateRange) === null || _b === void 0 ? void 0 : _b.preferredMonths))
            missing.push('travel dates');
        if (!((_c = preferences.travelers) === null || _c === void 0 ? void 0 : _c.adults))
            missing.push('number of travelers');
        if (!((_d = preferences.budget) === null || _d === void 0 ? void 0 : _d.total) && !((_e = preferences.budget) === null || _e === void 0 ? void 0 : _e.level))
            missing.push('budget');
        return missing;
    }
    translateMissingInfo(info) {
        const translations = {
            'travel dates': '出行时间',
            'number of travelers': '出行人数',
            'budget': '预算',
        };
        return translations[info] || info;
    }
    translatePace(pace) {
        const translations = {
            'relaxed': '悠闲',
            'moderate': '适中',
            'intensive': '紧凑',
        };
        return translations[pace] || pace;
    }
    extractDestination(message, state) {
        const destinations = ['iceland', 'japan', 'newzealand', '冰岛', '日本', '新西兰'];
        for (const dest of destinations) {
            if (message.toLowerCase().includes(dest.toLowerCase())) {
                return dest;
            }
        }
        if (state.recommendations) {
            for (const rec of state.recommendations) {
                if (message.toLowerCase().includes(rec.id) ||
                    message.toLowerCase().includes(rec.name.toLowerCase()) ||
                    message.includes(rec.nameCN)) {
                    return rec.nameCN || rec.name;
                }
            }
        }
        return state.selectedDestination;
    }
    extractSelectedPlanId(message, state) {
        var _a, _b;
        if (state.planCandidates) {
            for (const plan of state.planCandidates) {
                if (message.toLowerCase().includes(plan.id) ||
                    message.toLowerCase().includes(plan.name.toLowerCase()) ||
                    message.includes(plan.nameCN)) {
                    return plan.id;
                }
            }
        }
        return ((_b = (_a = state.planCandidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) || state.selectedPlanId;
    }
    getDefaultStartDate() {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return date.toISOString().split('T')[0];
    }
    getDefaultEndDate() {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        date.setDate(date.getDate() + 10);
        return date.toISOString().split('T')[0];
    }
    generateMatchReasons(pack, preferences) {
        var _a;
        const reasons = [];
        reasons.push('Safe destination');
        reasons.push('Good for your travel period');
        if (((_a = preferences.travelers) === null || _a === void 0 ? void 0 : _a.adults) === 2)
            reasons.push('Romantic destination');
        return reasons;
    }
    generateMatchReasonsCN(pack, preferences) {
        var _a;
        const reasons = [];
        reasons.push('安全目的地');
        reasons.push('适合你的出行时间');
        if (((_a = preferences.travelers) === null || _a === void 0 ? void 0 : _a.adults) === 2)
            reasons.push('浪漫目的地');
        return reasons;
    }
    getDefaultRecommendations() {
        return [
            {
                id: 'iceland',
                countryCode: 'IS',
                name: 'Iceland',
                nameCN: '冰岛',
                description: 'Land of fire and ice with stunning landscapes',
                descriptionCN: '冰与火之国，拥有令人惊叹的自然景观',
                highlights: ['Northern Lights', 'Glaciers', 'Geysers'],
                highlightsCN: ['极光', '冰川', '间歇泉'],
                matchScore: 95,
                matchReasons: ['Unique landscapes', 'Safe'],
                matchReasonsCN: ['独特地貌', '安全'],
                estimatedBudget: { min: 3000, max: 6000, currency: 'USD' },
                bestSeasons: ['Sep-Mar', 'Jun-Aug'],
                tags: ['nature', 'adventure'],
            },
            {
                id: 'japan',
                countryCode: 'JP',
                name: 'Japan',
                nameCN: '日本',
                description: 'Perfect blend of tradition and innovation',
                descriptionCN: '传统与现代的完美融合',
                highlights: ['Cherry Blossoms', 'Temples', 'Food'],
                highlightsCN: ['樱花', '寺庙', '美食'],
                matchScore: 92,
                matchReasons: ['Rich culture', 'Great food'],
                matchReasonsCN: ['丰富文化', '美食天堂'],
                estimatedBudget: { min: 2500, max: 5000, currency: 'USD' },
                bestSeasons: ['Mar-May', 'Oct-Nov'],
                tags: ['culture', 'food'],
            },
            {
                id: 'newzealand',
                countryCode: 'NZ',
                name: 'New Zealand',
                nameCN: '新西兰',
                description: 'Adventure paradise with breathtaking scenery',
                descriptionCN: '冒险天堂，壮丽风景',
                highlights: ['Lord of the Rings', 'Bungee', 'Fjords'],
                highlightsCN: ['魔戒取景地', '蹦极', '峡湾'],
                matchScore: 88,
                matchReasons: ['Adventure', 'Nature'],
                matchReasonsCN: ['冒险活动', '自然风光'],
                estimatedBudget: { min: 3500, max: 7000, currency: 'USD' },
                bestSeasons: ['Dec-Feb', 'Jun-Aug'],
                tags: ['adventure', 'nature'],
            },
        ];
    }
    getDefaultPlanCandidates(state) {
        const destination = state.selectedDestination || 'Your Destination';
        return [
            {
                id: 'plan-relaxed',
                name: 'Relaxed Explorer',
                nameCN: '悠闲探索者',
                description: 'Comfortable pace with time to enjoy',
                descriptionCN: '舒适节奏，充分享受每个目的地',
                destination,
                duration: 10,
                highlights: ['Scenic views', 'Local cuisine', 'Cultural sites'],
                estimatedBudget: { total: 4500, breakdown: { flight: 1200, accommodation: 1800, activities: 800, food: 500, other: 200 } },
                pace: 'relaxed',
                suitability: { score: 92, reasons: ['Matches pace preference', 'Within budget'] },
            },
            {
                id: 'plan-adventure',
                name: 'Adventure Seeker',
                nameCN: '冒险探索者',
                description: 'Action-packed itinerary',
                descriptionCN: '紧凑刺激的行程',
                destination,
                duration: 10,
                highlights: ['Outdoor activities', 'Unique experiences', 'Hidden gems'],
                estimatedBudget: { total: 5500, breakdown: { flight: 1200, accommodation: 1600, activities: 1800, food: 600, other: 300 } },
                pace: 'intensive',
                suitability: { score: 85, reasons: ['Exciting', 'Unique'] },
                warnings: ['Physically demanding'],
            },
            {
                id: 'plan-balanced',
                name: 'Best of Both',
                nameCN: '精华平衡版',
                description: 'Perfect balance of adventure and relaxation',
                descriptionCN: '冒险与休闲的完美平衡',
                destination,
                duration: 10,
                highlights: ['Top attractions', 'Local experiences', 'Free time'],
                estimatedBudget: { total: 5000, breakdown: { flight: 1200, accommodation: 1700, activities: 1200, food: 600, other: 300 } },
                pace: 'moderate',
                suitability: { score: 95, reasons: ['Best value', 'Balanced'] },
            },
        ];
    }
    async getUserPreferenceSummary(userId) {
        if (!this.preferenceLearning) {
            return {
                summary: 'Preference learning is not available.',
                summaryCN: '偏好学习服务不可用。',
                topPreferences: [],
            };
        }
        try {
            const result = await this.preferenceLearning.getPreferenceSummary(userId);
            const learnedPrefs = await this.preferenceLearning.getAsUserPreferences(userId);
            return {
                ...result,
                learnedPreferences: learnedPrefs,
            };
        }
        catch (error) {
            this.logger.warn(`[规划助手] 获取用户偏好摘要失败: ${error.message}`);
            return {
                summary: 'Failed to load preferences.',
                summaryCN: '加载偏好失败。',
                topPreferences: [],
            };
        }
    }
    async clearUserPreferences(userId) {
        if (!this.preferenceLearning) {
            this.logger.warn('[规划助手] 偏好学习服务不可用，无法清除偏好');
            return;
        }
        try {
            await this.preferenceLearning.clearProfile(userId);
            this.logger.log(`[规划助手] 已清除用户偏好: ${userId}`);
        }
        catch (error) {
            this.logger.warn(`[规划助手] 清除用户偏好失败: ${error.message}`);
            throw error;
        }
    }
};
exports.PlanningAssistantService = PlanningAssistantService;
exports.PlanningAssistantService = PlanningAssistantService = PlanningAssistantService_1 = __decorate([
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
    __metadata("design:paramtypes", [core_gateway_service_1.CoreGatewayService,
        llm_executor_service_1.LLMExecutorService,
        llm_service_1.LlmService,
        planning_workbench_agent_service_1.PlanningWorkbenchAgentService,
        persona_shell_service_1.PersonaShellService,
        prisma_service_1.PrismaService,
        persona_language_service_1.PersonaLanguageService,
        recommendation_engine_service_1.RecommendationEngineService,
        preference_learning_service_1.PreferenceLearningService])
], PlanningAssistantService);
//# sourceMappingURL=planning-assistant.service.js.map