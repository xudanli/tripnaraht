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
var PlannerAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerAgentService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
const context_engineer_service_1 = require("../../../agent/context-engine/services/context-engineer.service");
const langgraph_context_integration_1 = require("../../../agent/context-engine/utils/langgraph-context-integration");
let PlannerAgentService = PlannerAgentService_1 = class PlannerAgentService {
    constructor(llmService, contextEngineer) {
        this.llmService = llmService;
        this.contextEngineer = contextEngineer;
        this.logger = new common_1.Logger(PlannerAgentService_1.name);
        const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
        const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
        this.useLlm = !!llmService && (hasDeepSeekKey || hasOpenAIKey);
        if (this.useLlm) {
            this.logger.log('Planner Agent: LLM 已启用');
        }
        else {
            this.logger.warn('Planner Agent: 使用规则匹配模式（LLM 未启用）');
        }
    }
    async analyzeQuery(state) {
        var _a, _b;
        const query = state.userQuery || '';
        this.logger.debug(`分析用户查询: ${query}`);
        let contextPackage;
        if (this.contextEngineer) {
            try {
                const ctx = await (0, langgraph_context_integration_1.buildContextForNode)(state, this.contextEngineer, {
                    agent: 'PLANNER',
                    phase: state.planningPhase || 'DRAFTING',
                    tokenBudget: 3600,
                    requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
                });
                contextPackage = ctx.contextPackage;
                this.logger.debug(`Context Package 构建完成: ${contextPackage.blocks.length} 个块, ${contextPackage.totalTokens} tokens`);
            }
            catch (error) {
                this.logger.warn(`构建 Context Package 失败: ${error.message}，继续使用原始查询`);
            }
        }
        let enhancedQuery = query;
        if (contextPackage) {
            const contextPrompt = (0, langgraph_context_integration_1.buildPromptFromContextPackage)(contextPackage);
            enhancedQuery = `上下文信息:\n${contextPrompt}\n\n用户查询: ${query}`;
        }
        if (this.useLlm && this.llmService) {
            try {
                const result = await this.analyzeQueryWithLlm(enhancedQuery);
                if (this.contextEngineer && ((_a = state.metadata) === null || _a === void 0 ? void 0 : _a.tripRunId)) {
                    try {
                        await (0, langgraph_context_integration_1.writeBackFromNode)(state, this.contextEngineer, {
                            tripRunId: state.metadata.tripRunId,
                            attemptNumber: state.metadata.attemptNumber || 1,
                            scratchpad: {
                                planOutline: `Planner 分析完成: intent=${result.intent}, nextStep=${result.nextStep}`,
                                nextActions: [result.nextStep],
                            },
                        });
                    }
                    catch (error) {
                        this.logger.warn(`写入回写失败: ${error.message}`);
                    }
                }
                return result;
            }
            catch (error) {
                this.logger.warn(`LLM 分析失败，回退到规则匹配: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const result = this.analyzeQueryWithRules(query);
        if (this.contextEngineer && ((_b = state.metadata) === null || _b === void 0 ? void 0 : _b.tripRunId)) {
            try {
                await (0, langgraph_context_integration_1.writeBackFromNode)(state, this.contextEngineer, {
                    tripRunId: state.metadata.tripRunId,
                    attemptNumber: state.metadata.attemptNumber || 1,
                    scratchpad: {
                        planOutline: `Planner 分析完成（规则匹配）: intent=${result.intent}, nextStep=${result.nextStep}`,
                        nextActions: [result.nextStep],
                    },
                });
            }
            catch (error) {
                this.logger.warn(`写入回写失败: ${error.message}`);
            }
        }
        return result;
    }
    async analyzeQueryWithLlm(query) {
        var _a;
        const prompt = `你是一个旅行规划助手，负责分析用户查询并提取关键信息。

用户查询：${query}

请分析并返回 JSON 格式：
{
  "intent": "PLAN_TRIP" 或 "RECOMMEND_ROUTE",
  "countryCode": "国家代码（如 IS、NP、CH）",
  "month": 月份数字（1-12），如果未提及则返回 null,
  "routeDirectionKeywords": "路线方向关键词（如 高地、环岛、徒步）",
  "humanCapability": {
    "preferredPace": "SLOW" 或 "MEDIUM" 或 "FAST",
    "riskTolerance": "LOW" 或 "MEDIUM" 或 "HIGH",
    "specialConstraints": ["特殊约束数组，如 膝盖不好、恐高"]
  },
  "nextStep": "CORE_DECISION" 或 "COMPLIANCE_CHECK" 或 "LOCAL_INSIGHT"
}

规则：
- 如果查询涉及签证、许可、permit，nextStep 应为 "COMPLIANCE_CHECK"
- 如果查询涉及当地信息、文化、建议，nextStep 应为 "LOCAL_INSIGHT"
- 其他情况 nextStep 应为 "CORE_DECISION"
- preferredPace: 如果提到"慢"、"轻松"、"不想太累"、"膝盖不好"等，返回 "SLOW"；如果提到"快"、"刺激"等，返回 "FAST"；否则返回 "MEDIUM"
- riskTolerance: 如果提到"低风险"、"安全"等，返回 "LOW"；如果提到"高风险"、"冒险"等，返回 "HIGH"；否则返回 "MEDIUM"
- specialConstraints: 提取所有特殊约束，如"膝盖不好"、"恐高"、"受伤"等

只返回 JSON，不要其他文字。`;
        try {
            const provider = process.env.DEEPSEEK_API_KEY
                ? llm_request_dto_1.LlmProvider.DEEPSEEK
                : (process.env.OPENAI_API_KEY ? llm_request_dto_1.LlmProvider.OPENAI : llm_request_dto_1.LlmProvider.DEEPSEEK);
            const response = await this.llmService.callLlmWithSchema(provider, prompt, {
                type: 'object',
                properties: {
                    intent: { type: 'string', enum: ['PLAN_TRIP', 'RECOMMEND_ROUTE'] },
                    countryCode: { type: 'string' },
                    month: { type: ['number', 'null'] },
                    routeDirectionKeywords: { type: ['string', 'null'] },
                    humanCapability: {
                        type: 'object',
                        properties: {
                            preferredPace: { type: 'string', enum: ['SLOW', 'MEDIUM', 'FAST'] },
                            riskTolerance: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                            specialConstraints: { type: 'array', items: { type: 'string' } },
                        },
                    },
                    nextStep: { type: 'string', enum: ['CORE_DECISION', 'COMPLIANCE_CHECK', 'LOCAL_INSIGHT'] },
                },
                required: ['intent', 'countryCode', 'humanCapability', 'nextStep'],
            });
            const parsed = JSON.parse(response);
            return {
                intent: parsed.intent || 'PLAN_TRIP',
                extractedParams: {
                    countryCode: parsed.countryCode || undefined,
                    month: parsed.month || undefined,
                    routeDirectionId: parsed.routeDirectionKeywords || undefined,
                    humanCapability: parsed.humanCapability || {},
                    specialConstraints: ((_a = parsed.humanCapability) === null || _a === void 0 ? void 0 : _a.specialConstraints) || [],
                },
                nextStep: parsed.nextStep || 'CORE_DECISION',
            };
        }
        catch (error) {
            this.logger.error(`LLM 分析失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    analyzeQueryWithRules(query) {
        const countryCode = this.extractCountryCode(query);
        const month = this.extractMonth(query);
        const routeDirectionKeywords = this.extractRouteDirectionKeywords(query);
        const humanCapability = this.extractHumanCapability(query);
        const intent = this.inferIntent(query);
        const nextStep = this.inferNextStep(query, countryCode);
        return {
            intent,
            extractedParams: {
                countryCode,
                month,
                routeDirectionId: routeDirectionKeywords,
                humanCapability,
                specialConstraints: this.extractSpecialConstraints(query),
            },
            nextStep,
        };
    }
    extractCountryCode(query) {
        const countryMap = {
            '冰岛': 'IS',
            'Iceland': 'IS',
            'IS': 'IS',
            '尼泊尔': 'NP',
            'Nepal': 'NP',
            'NP': 'NP',
            '瑞士': 'CH',
            'Switzerland': 'CH',
            'CH': 'CH',
        };
        for (const [key, code] of Object.entries(countryMap)) {
            if (query.includes(key)) {
                return code;
            }
        }
        return undefined;
    }
    extractMonth(query) {
        const monthMap = {
            '一月': 1, '1月': 1, 'January': 1, 'Jan': 1,
            '二月': 2, '2月': 2, 'February': 2, 'Feb': 2,
            '三月': 3, '3月': 3, 'March': 3, 'Mar': 3,
            '四月': 4, '4月': 4, 'April': 4, 'Apr': 4,
            '五月': 5, '5月': 5, 'May': 5,
            '六月': 6, '6月': 6, 'June': 6, 'Jun': 6,
            '七月': 7, '7月': 7, 'July': 7, 'Jul': 7,
            '八月': 8, '8月': 8, 'August': 8, 'Aug': 8,
            '九月': 9, '9月': 9, 'September': 9, 'Sep': 9,
            '十月': 10, '10月': 10, 'October': 10, 'Oct': 10,
            '十一月': 11, '11月': 11, 'November': 11, 'Nov': 11,
            '十二月': 12, '12月': 12, 'December': 12, 'Dec': 12,
        };
        for (const [key, month] of Object.entries(monthMap)) {
            if (query.includes(key)) {
                return month;
            }
        }
        const monthMatch = query.match(/\b([1-9]|1[0-2])\s*月/);
        if (monthMatch) {
            return parseInt(monthMatch[1], 10);
        }
        return undefined;
    }
    extractRouteDirectionKeywords(query) {
        const keywords = ['高地', 'highlands', '环岛', 'ring road', '徒步', 'hiking', '自驾', 'self-drive'];
        for (const keyword of keywords) {
            if (query.toLowerCase().includes(keyword.toLowerCase())) {
                return keyword;
            }
        }
        return undefined;
    }
    extractHumanCapability(query) {
        const capability = {};
        const hasSlowIndicators = query.includes('慢') ||
            query.includes('轻松') ||
            query.includes('不想太累') ||
            query.includes('不想累') ||
            query.includes('relaxed') ||
            query.includes('slow') ||
            query.includes('膝盖不好') ||
            query.includes('受伤');
        const hasFastIndicators = query.includes('快') ||
            query.includes('刺激') ||
            query.includes('fast') ||
            query.includes('intense');
        if (hasSlowIndicators) {
            capability.preferredPace = 'SLOW';
        }
        else if (hasFastIndicators) {
            capability.preferredPace = 'FAST';
        }
        else {
            capability.preferredPace = 'MEDIUM';
        }
        if (query.includes('低风险') || query.includes('安全') || query.includes('low risk') || query.includes('safe')) {
            capability.riskTolerance = 'LOW';
        }
        else if (query.includes('高风险') || query.includes('冒险') || query.includes('high risk') || query.includes('adventure')) {
            capability.riskTolerance = 'HIGH';
        }
        else {
            capability.riskTolerance = 'MEDIUM';
        }
        const specialConstraints = [];
        if (query.includes('膝盖') || query.includes('knee')) {
            specialConstraints.push('膝盖不好');
        }
        if (query.includes('恐高') || query.includes('acrophobia')) {
            specialConstraints.push('恐高');
        }
        if (specialConstraints.length > 0) {
            capability.specialConstraints = specialConstraints;
        }
        return capability;
    }
    extractSpecialConstraints(query) {
        const constraints = [];
        if (query.includes('膝盖') || query.includes('knee')) {
            constraints.push('膝盖不好');
        }
        if (query.includes('恐高') || query.includes('acrophobia')) {
            constraints.push('恐高');
        }
        if (query.includes('受伤') || query.includes('injury')) {
            constraints.push('受伤');
        }
        return constraints;
    }
    inferIntent(query) {
        if (query.includes('规划') || query.includes('计划') || query.includes('plan') || query.includes('planning')) {
            return 'PLAN_TRIP';
        }
        if (query.includes('推荐') || query.includes('推荐') || query.includes('recommend')) {
            return 'RECOMMEND_ROUTE';
        }
        return 'PLAN_TRIP';
    }
    inferNextStep(query, countryCode) {
        if (query.includes('签证') || query.includes('visa') || query.includes('许可') || query.includes('permit')) {
            return 'COMPLIANCE_CHECK';
        }
        return 'CORE_DECISION';
    }
};
exports.PlannerAgentService = PlannerAgentService;
exports.PlannerAgentService = PlannerAgentService = PlannerAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        context_engineer_service_1.ContextEngineerService])
], PlannerAgentService);
//# sourceMappingURL=planner-agent.service.js.map