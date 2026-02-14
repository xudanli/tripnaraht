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
var DecisionDraftGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const chain_of_work_service_1 = require("../../chain-of-work/services/chain-of-work.service");
const decision_type_to_step_draft_mapper_1 = require("../mapping/decision-type-to-step-draft.mapper");
const decision_draft_observability_service_1 = require("./decision-draft-observability.service");
const decision_debug_collector_service_1 = require("./decision-debug-collector.service");
let DecisionDraftGeneratorService = DecisionDraftGeneratorService_1 = class DecisionDraftGeneratorService {
    constructor(llmService, chainOfWorkService, decisionTypeMapper, observability, debugCollector) {
        this.llmService = llmService;
        this.chainOfWorkService = chainOfWorkService;
        this.decisionTypeMapper = decisionTypeMapper;
        this.observability = observability;
        this.debugCollector = debugCollector;
        this.logger = new common_1.Logger(DecisionDraftGeneratorService_1.name);
    }
    async generateDecisionDraft(userInput, tripPlanRequest, config) {
        var _a;
        const startTime = Date.now();
        const requestId = tripPlanRequest.request_id || `req-${Date.now()}`;
        this.logger.log(`[DecisionDraftGenerator] 开始生成决策草案: request_id=${requestId}`);
        const draftId = `decision-${requestId}`;
        let traceId = null;
        if (this.observability) {
            traceId = this.observability.startTrace(draftId, requestId, requestId);
        }
        try {
            if (this.observability && traceId) {
                this.observability.startStage(traceId, 'generate-decision-steps');
            }
            const decisionSteps = await this.generateDecisionSteps(userInput, tripPlanRequest, config, traceId);
            if (this.observability && traceId) {
                this.observability.endStage(traceId, 'generate-decision-steps', {
                    decision_steps_generated: decisionSteps.length,
                });
            }
            let stepDraft;
            if (this.observability && traceId) {
                this.observability.startStage(traceId, 'generate-step-drafts');
            }
            try {
                stepDraft = await this.chainOfWorkService.generateDraft(tripPlanRequest, {
                    model: (config === null || config === void 0 ? void 0 : config.model) || 'claude-3-5-sonnet',
                    temperature: (config === null || config === void 0 ? void 0 : config.temperature) || 0.7,
                    max_tokens: (config === null || config === void 0 ? void 0 : config.max_tokens) || 2000,
                });
            }
            catch (error) {
                this.logger.warn(`[DecisionDraftGenerator] Step Draft 生成失败，跳过: ${error.message}`);
                stepDraft = {
                    draft_id: `step-draft-${requestId}`,
                    steps: [],
                };
                if (this.observability && traceId) {
                    this.observability.recordError(traceId, 'generate-step-drafts', error.message);
                }
            }
            if (this.observability && traceId) {
                this.observability.endStage(traceId, 'generate-step-drafts', {
                    step_drafts_generated: ((_a = stepDraft.steps) === null || _a === void 0 ? void 0 : _a.length) || 0,
                });
            }
            if (this.observability && traceId) {
                this.observability.startStage(traceId, 'map-decision-to-step-drafts');
            }
            await this.mapDecisionStepsToStepDrafts(decisionSteps, stepDraft);
            if (this.observability && traceId) {
                this.observability.endStage(traceId, 'map-decision-to-step-drafts');
            }
            const decisionDraft = {
                draft_id: draftId,
                plan_id: tripPlanRequest.request_id || requestId,
                plan_version: 1,
                decision_steps: decisionSteps,
                step_draft_id: stepDraft.draft_id,
                step_draft: stepDraft,
                user_mode: (config === null || config === void 0 ? void 0 : config.user_mode) || 'toc',
                metadata: {
                    decision_count: decisionSteps.length,
                    step_count: stepDraft.steps.length,
                    created_by: 'system',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            };
            if ((config === null || config === void 0 ? void 0 : config.user_mode) === 'studio') {
                if (this.observability && traceId) {
                    const trace = this.observability.endTrace(traceId, true);
                    if (trace) {
                        const metrics = this.observability.calculateMetrics(trace, decisionDraft);
                        decisionDraft.debug_info = this.observability.buildDebugInfo(trace, metrics);
                    }
                }
                else if (this.debugCollector) {
                    const debugInfo = await this.debugCollector.collectDebugInfo(decisionDraft);
                    decisionDraft.debug_info = debugInfo;
                }
            }
            const duration = Date.now() - startTime;
            this.logger.log(`[DecisionDraftGenerator] 决策草案生成完成: duration=${duration}ms, decisions=${decisionSteps.length}`);
            return decisionDraft;
        }
        catch (error) {
            if (this.observability && traceId) {
                this.observability.recordError(traceId, 'generate-decision-draft', (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error');
                this.observability.endTrace(traceId, false);
            }
            this.logger.error(`[DecisionDraftGenerator] 决策草案生成失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    async generateDecisionSteps(userInput, tripPlanRequest, config, traceId) {
        this.logger.debug(`[DecisionDraftGenerator] 生成 Decision Steps: userInput=${userInput.substring(0, 50)}...`);
        const decisionTypes = await this.identifyDecisionTypes(userInput, tripPlanRequest, config, traceId);
        const decisionSteps = [];
        for (const decisionType of decisionTypes) {
            const decisionStep = await this.generateDecisionStep(decisionType, userInput, tripPlanRequest, config, traceId);
            decisionSteps.push(decisionStep);
        }
        return decisionSteps;
    }
    async identifyDecisionTypes(userInput, tripPlanRequest, config, traceId) {
        const prompt = this.buildDecisionTypeClassificationPrompt(userInput, tripPlanRequest);
        const provider = this.mapModelToProvider((config === null || config === void 0 ? void 0 : config.model) || 'claude-3-5-sonnet');
        const schema = this.getDecisionTypeClassificationSchema();
        const model = (config === null || config === void 0 ? void 0 : config.model) || 'claude-3-5-sonnet';
        try {
            const callStartTime = Date.now();
            const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
            const callDuration = Date.now() - callStartTime;
            if (this.observability && traceId) {
                const promptTokens = Math.ceil(prompt.length / 4);
                const completionTokens = Math.ceil(response.length / 4);
                const costPer1kInput = 0.003;
                const costPer1kOutput = 0.015;
                const costUsd = (promptTokens / 1000) * costPer1kInput + (completionTokens / 1000) * costPer1kOutput;
                this.observability.recordLLMCall(traceId, {
                    model,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    cost_usd: costUsd,
                    duration_ms: callDuration,
                    prompt: (config === null || config === void 0 ? void 0 : config.user_mode) === 'studio' ? prompt : undefined,
                    response: (config === null || config === void 0 ? void 0 : config.user_mode) === 'studio' ? response : undefined,
                });
            }
            const data = this.extractJSON(response);
            return (data.decisionTypes || []).map((dt) => dt.type);
        }
        catch (error) {
            this.logger.warn(`[DecisionDraftGenerator] 决策类型识别失败，使用默认类型: ${error.message}`);
            return this.inferDecisionTypes(userInput, tripPlanRequest);
        }
    }
    async generateDecisionStep(decisionType, userInput, tripPlanRequest, config, traceId) {
        const prompt = this.buildDecisionStepGenerationPrompt(decisionType, userInput, tripPlanRequest);
        const provider = this.mapModelToProvider((config === null || config === void 0 ? void 0 : config.model) || 'claude-3-5-sonnet');
        const schema = this.getDecisionStepGenerationSchema();
        const model = (config === null || config === void 0 ? void 0 : config.model) || 'claude-3-5-sonnet';
        try {
            const callStartTime = Date.now();
            const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
            const callDuration = Date.now() - callStartTime;
            if (this.observability && traceId) {
                const promptTokens = Math.ceil(prompt.length / 4);
                const completionTokens = Math.ceil(response.length / 4);
                const costPer1kInput = 0.003;
                const costPer1kOutput = 0.015;
                const costUsd = (promptTokens / 1000) * costPer1kInput + (completionTokens / 1000) * costPer1kOutput;
                this.observability.recordLLMCall(traceId, {
                    model,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    cost_usd: costUsd,
                    duration_ms: callDuration,
                    prompt: (config === null || config === void 0 ? void 0 : config.user_mode) === 'studio' ? prompt : undefined,
                    response: (config === null || config === void 0 ? void 0 : config.user_mode) === 'studio' ? response : undefined,
                });
            }
            const data = this.extractJSON(response);
            return this.parseDecisionStep(data, decisionType);
        }
        catch (error) {
            this.logger.warn(`[DecisionDraftGenerator] Decision Step 生成失败，使用模板: ${error.message}`);
            return this.generateTemplateDecisionStep(decisionType, tripPlanRequest);
        }
    }
    async mapDecisionStepsToStepDrafts(decisionSteps, stepDraft) {
        for (const decisionStep of decisionSteps) {
            const stepTypes = this.decisionTypeMapper.getStepTypes(decisionStep.type);
            const stepDraftIds = [];
            for (const stepType of stepTypes) {
                const matchingStep = stepDraft.steps.find((s) => s.step_type === stepType);
                if (matchingStep) {
                    stepDraftIds.push(matchingStep.id);
                }
            }
            decisionStep.step_draft_ids = stepDraftIds;
        }
    }
    buildDecisionTypeClassificationPrompt(userInput, tripPlanRequest) {
        return `
你是一个 TripNARA 旅行决策分类专家。分析用户输入，识别需要做出的关键旅行决策。

**决策类型**：
1. transport-decision - 是否租车、租什么车
2. pace-decision - 行程节奏判断（太赶/太松）
3. poi-selection - POI 取舍与优先级
4. route-optimization - 顺路与否、是否绕路
5. weather-strategy - 天气与备选方案
6. budget-balance - 预算分配策略

**用户输入**：
${userInput}

**旅行需求**：
${JSON.stringify(tripPlanRequest, null, 2)}

请识别需要做出的决策类型，返回 JSON 格式：
{
  "decisionTypes": [
    {
      "type": "transport-decision",
      "confidence": 0.9,
      "reasoning": "用户提到'不想太赶'，需要判断是否需要租车"
    }
  ]
}
`;
    }
    buildDecisionStepGenerationPrompt(decisionType, userInput, tripPlanRequest) {
        const mappingRule = this.decisionTypeMapper.getMappingRule(decisionType);
        const stepTypes = (mappingRule === null || mappingRule === void 0 ? void 0 : mappingRule.step_types.join(', ')) || '';
        return `
你是一个 TripNARA 旅行决策专家。根据用户需求和决策类型，生成决策步骤。

**决策类型**：${decisionType}
**关联步骤类型**：${stepTypes}

**用户输入**：
${userInput}

**旅行需求**：
${JSON.stringify(tripPlanRequest, null, 2)}

请生成决策步骤，必须包含：
- 决策标题
- 决策描述
- 输入参数（从用户需求和旅行需求中提取）
- 输出结论（决策结果）
- 证据来源（数据来源）

返回 JSON 格式：
{
  "id": "d1",
  "title": "判断是否需要租车",
  "description": "基于目的地公共交通覆盖率与日行程密度",
  "inputs": [
    {
      "name": "目的地",
      "value": "冰岛",
      "source": "user"
    }
  ],
  "outputs": [
    {
      "name": "是否租车",
      "value": "是",
      "confidence": 0.87
    }
  ],
  "evidence": [
    {
      "source_title": "POI密度分析",
      "weight": 0.4
    }
  ]
}
`;
    }
    parseDecisionStep(data, decisionType) {
        var _a, _b;
        const now = new Date().toISOString();
        return {
            id: data.id || `decision-${decisionType}-${Date.now()}`,
            title: data.title || decisionType,
            description: data.description || '',
            type: decisionType,
            status: 'pending',
            confidence: ((_b = (_a = data.outputs) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.confidence) || 0.7,
            inputs: (data.inputs || []).map((input) => ({
                name: input.name || '',
                value: input.value,
                source: input.source || 'inferred',
            })),
            outputs: (data.outputs || []).map((output) => ({
                name: output.name || '',
                value: output.value,
                confidence: output.confidence || 0.7,
            })),
            evidence: (data.evidence || []).map((ev) => ({
                evidence_id: ev.evidence_id || `evidence-${Date.now()}`,
                source: ev.source_title || ev.source || 'unknown',
                source_title: ev.source_title || '',
                source_url: ev.source_url,
                last_verified_at: ev.last_verified_at || ev.retrieved_at || new Date().toISOString(),
                excerpt: ev.excerpt,
                confidence: ev.weight || ev.confidence || 0.5,
                relevance: ev.relevance || 0.5,
            })),
            decision_log: [],
            step_draft_ids: [],
            created_at: now,
            updated_at: now,
        };
    }
    generateTemplateDecisionStep(decisionType, tripPlanRequest) {
        const now = new Date().toISOString();
        const mappingRule = this.decisionTypeMapper.getMappingRule(decisionType);
        return {
            id: `decision-${decisionType}-${Date.now()}`,
            title: this.getDecisionTypeTitle(decisionType),
            description: this.getDecisionTypeDescription(decisionType),
            type: decisionType,
            status: 'pending',
            confidence: 0.7,
            inputs: [
                {
                    name: '目的地',
                    value: tripPlanRequest.destination,
                    source: 'user',
                },
                {
                    name: '天数',
                    value: tripPlanRequest.days,
                    source: 'user',
                },
            ],
            outputs: [],
            evidence: [],
            decision_log: [],
            step_draft_ids: [],
            guardian_review: (mappingRule === null || mappingRule === void 0 ? void 0 : mappingRule.guardian) ? {
                [mappingRule.guardian.toLowerCase()]: {
                    verdict: 'ALLOW',
                    evidence: [],
                    explanation: '待生成',
                    confidence: 0.7,
                },
            } : undefined,
            created_at: now,
            updated_at: now,
        };
    }
    inferDecisionTypes(userInput, tripPlanRequest) {
        const types = [];
        const inputLower = userInput.toLowerCase();
        if (inputLower.includes('租车') || inputLower.includes('自驾') || inputLower.includes('开车')) {
            types.push('transport-decision');
        }
        if (inputLower.includes('太赶') || inputLower.includes('节奏') || inputLower.includes('轻松')) {
            types.push('pace-decision');
        }
        if (inputLower.includes('景点') || inputLower.includes('poi') || inputLower.includes('推荐')) {
            types.push('poi-selection');
        }
        if (inputLower.includes('天气') || inputLower.includes('下雨') || inputLower.includes('备选')) {
            types.push('weather-strategy');
        }
        if (inputLower.includes('预算') || inputLower.includes('价格') || inputLower.includes('花费')) {
            types.push('budget-balance');
        }
        if (types.length === 0) {
            types.push('transport-decision', 'pace-decision');
        }
        return types;
    }
    getDecisionTypeTitle(decisionType) {
        const titles = {
            'transport-decision': '判断是否需要租车',
            'pace-decision': '判断行程节奏',
            'poi-selection': '选择 POI 和优先级',
            'route-optimization': '优化路线顺序',
            'weather-strategy': '制定天气策略',
            'budget-balance': '平衡预算分配',
        };
        return titles[decisionType] || decisionType;
    }
    getDecisionTypeDescription(decisionType) {
        const descriptions = {
            'transport-decision': '基于目的地公共交通覆盖率与日行程密度，判断是否需要租车',
            'pace-decision': '基于用户需求和体力限制，判断行程节奏',
            'poi-selection': '基于用户偏好和POI评分，选择POI和设置优先级',
            'route-optimization': '基于距离和时间，优化路线顺序',
            'weather-strategy': '基于天气预报，制定天气备选方案',
            'budget-balance': '基于预算约束，平衡各项支出',
        };
        return descriptions[decisionType] || '';
    }
    extractJSON(response) {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
        }
        return JSON.parse(response);
    }
    mapModelToProvider(model) {
        const modelLower = model.toLowerCase();
        if (modelLower.includes('claude')) {
            return llm_request_dto_1.LlmProvider.ANTHROPIC;
        }
        if (modelLower.includes('gpt') || modelLower.includes('openai')) {
            return llm_request_dto_1.LlmProvider.OPENAI;
        }
        if (modelLower.includes('deepseek')) {
            return llm_request_dto_1.LlmProvider.DEEPSEEK;
        }
        if (modelLower.includes('gemini')) {
            return llm_request_dto_1.LlmProvider.GEMINI;
        }
        return llm_request_dto_1.LlmProvider.ANTHROPIC;
    }
    async generateDecisionStepFromOrchestrationState(state, orchestrationStep, subAgent) {
        var _a;
        this.logger.debug(`[DecisionDraftGenerator] 从状态机步骤生成 Decision Step: step=${orchestrationStep}, subAgent=${subAgent}`);
        const decisionType = this.mapOrchestrationStepToDecisionType(orchestrationStep, subAgent);
        if (!decisionType) {
            return null;
        }
        const userInput = this.extractUserInputFromState(state);
        const tripPlanRequest = state.trip_plan_request || {
            request_id: state.request_id,
            origin: '',
            destination: '',
        };
        try {
            const decisionStep = await this.generateDecisionStep(decisionType, userInput, tripPlanRequest);
            decisionStep.step_draft_ids = [];
            if (state.evidence_registry) {
                decisionStep.evidence = Array.from(state.evidence_registry.values());
            }
            if (state.decision_log) {
                decisionStep.decision_log = state.decision_log.filter((log) => log.step === orchestrationStep);
            }
            if ((_a = state.gate_result) === null || _a === void 0 ? void 0 : _a.guardian_results) {
                const guardianResults = state.gate_result.guardian_results;
                decisionStep.guardian_review = {};
                if (guardianResults.abu) {
                    decisionStep.guardian_review.abu = {
                        verdict: guardianResults.abu.verdict,
                        evidence: guardianResults.abu.evidence,
                    };
                }
                if (guardianResults.drdre) {
                    decisionStep.guardian_review.dr_dre = {
                        verdict: guardianResults.drdre.verdict,
                        evidence: guardianResults.drdre.evidence,
                    };
                }
                if (guardianResults.neptune) {
                    decisionStep.guardian_review.neptune = {
                        verdict: guardianResults.neptune.verdict,
                        evidence: guardianResults.neptune.evidence,
                    };
                }
            }
            return decisionStep;
        }
        catch (error) {
            this.logger.warn(`[DecisionDraftGenerator] 从状态机步骤生成 Decision Step 失败: ${error.message}`);
            return null;
        }
    }
    mapOrchestrationStepToDecisionType(step, subAgent) {
        const mapping = {
            'INTAKE': 'poi-selection',
            'RESEARCH': 'poi-selection',
            'GATE_EVAL': 'transport-decision',
            'PLAN_GEN': 'pace-decision',
            'VERIFY': 'route-optimization',
            'REPAIR': 'weather-strategy',
            'NARRATE': null,
        };
        return mapping[step] || null;
    }
    extractUserInputFromState(state) {
        if (state.trip_plan_request) {
            const req = state.trip_plan_request;
            return `目的地: ${req.destination}, 天数: ${req.days || '未知'}`;
        }
        return '用户请求';
    }
    getDecisionTypeClassificationSchema() {
        return {
            type: 'object',
            properties: {
                decisionTypes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['transport-decision', 'pace-decision', 'poi-selection', 'route-optimization', 'weather-strategy', 'budget-balance'],
                            },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                            reasoning: { type: 'string' },
                        },
                        required: ['type', 'confidence'],
                    },
                },
            },
            required: ['decisionTypes'],
        };
    }
    getDecisionStepGenerationSchema() {
        return {
            type: 'object',
            properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                inputs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            value: {},
                            source: { type: 'string', enum: ['user', 'system', 'inferred'] },
                        },
                        required: ['name', 'value'],
                    },
                },
                outputs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            value: {},
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['name', 'value'],
                    },
                },
                evidence: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            source_title: { type: 'string' },
                            weight: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['source_title'],
                    },
                },
            },
            required: ['id', 'title', 'inputs', 'outputs'],
        };
    }
};
exports.DecisionDraftGeneratorService = DecisionDraftGeneratorService;
exports.DecisionDraftGeneratorService = DecisionDraftGeneratorService = DecisionDraftGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        chain_of_work_service_1.ChainOfWorkService,
        decision_type_to_step_draft_mapper_1.DecisionTypeToStepDraftMapper,
        decision_draft_observability_service_1.DecisionDraftObservabilityService,
        decision_debug_collector_service_1.DecisionDebugCollectorService])
], DecisionDraftGeneratorService);
//# sourceMappingURL=decision-draft-generator.service.js.map