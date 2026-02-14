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
var ClaudeOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const skills_registry_service_1 = require("../../skills/services/skills-registry.service");
const skills_registry_token_1 = require("../../skills/services/skills-registry.token");
const action_registry_service_1 = require("./action-registry.service");
const orchestration_utils_1 = require("./orchestration-utils");
const claude_orchestration_prompts_1 = require("./claude-orchestration-prompts");
const planner_agent_service_1 = require("./sub-agents/planner-agent.service");
const gatekeeper_agent_service_1 = require("./sub-agents/gatekeeper-agent.service");
const compliance_agent_service_1 = require("./sub-agents/compliance-agent.service");
const local_insight_agent_service_1 = require("./sub-agents/local-insight-agent.service");
const core_decision_agent_service_1 = require("./sub-agents/core-decision-agent.service");
const narrator_agent_service_1 = require("./sub-agents/narrator-agent.service");
const skill_importance_util_1 = require("../utils/skill-importance.util");
const error_types_interface_1 = require("../interfaces/error-types.interface");
const skill_validation_rules_config_1 = require("./skill-validation-rules.config");
const skill_input_validator_service_1 = require("./skill-input-validator.service");
const hallucination_detection_service_1 = require("./hallucination-detection.service");
const trajectory_collection_service_1 = require("../training/services/trajectory-collection.service");
const readiness_service_1 = require("../../trips/readiness/services/readiness.service");
const user_decision_service_1 = require("../../trips/readiness/services/user-decision.service");
const decision_draft_generator_service_1 = require("../../decision-draft/services/decision-draft-generator.service");
const geo_agent_service_1 = require("./domain-agents/geo-agent.service");
const weather_agent_service_1 = require("./domain-agents/weather-agent.service");
const cost_agent_service_1 = require("./domain-agents/cost-agent.service");
const experience_agent_service_1 = require("./domain-agents/experience-agent.service");
let ClaudeOrchestratorService = ClaudeOrchestratorService_1 = class ClaudeOrchestratorService {
    constructor(llmService, skillsRegistry, actionRegistry, plannerAgent, gatekeeperAgent, complianceAgent, localInsightAgent, coreDecisionAgent, narratorAgent, skillInputValidator, hallucinationDetection, trajectoryCollection, readinessService, userDecisionService, decisionDraftGenerator, geoAgent, weatherAgent, costAgent, experienceAgent) {
        this.llmService = llmService;
        this.skillsRegistry = skillsRegistry;
        this.actionRegistry = actionRegistry;
        this.plannerAgent = plannerAgent;
        this.gatekeeperAgent = gatekeeperAgent;
        this.complianceAgent = complianceAgent;
        this.localInsightAgent = localInsightAgent;
        this.coreDecisionAgent = coreDecisionAgent;
        this.narratorAgent = narratorAgent;
        this.skillInputValidator = skillInputValidator;
        this.hallucinationDetection = hallucinationDetection;
        this.trajectoryCollection = trajectoryCollection;
        this.readinessService = readinessService;
        this.userDecisionService = userDecisionService;
        this.decisionDraftGenerator = decisionDraftGenerator;
        this.geoAgent = geoAgent;
        this.weatherAgent = weatherAgent;
        this.costAgent = costAgent;
        this.experienceAgent = experienceAgent;
        this.logger = new common_1.Logger(ClaudeOrchestratorService_1.name);
        this.worldCache = new orchestration_utils_1.SimpleLruCache(64, 10 * 60 * 1000);
        this.logger.log(`[ClaudeOrchestratorService] Initialized`);
        this.logger.log(`[ClaudeOrchestratorService] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);
        this.logger.log(`[ClaudeOrchestratorService] Sub-Agents: Planner=${!!this.plannerAgent}, Gatekeeper=${!!this.gatekeeperAgent}, Compliance=${!!this.complianceAgent}, LocalInsight=${!!this.localInsightAgent}, CoreDecision=${!!this.coreDecisionAgent}, Narrator=${!!this.narratorAgent}`);
        this.logger.log(`[ClaudeOrchestratorService] Domain Agents: Geo=${!!this.geoAgent}, Weather=${!!this.weatherAgent}, Cost=${!!this.costAgent}, Experience=${!!this.experienceAgent}`);
        if (this.skillsRegistry) {
            const skillsCount = this.skillsRegistry.getAllSkills().length;
            this.logger.log(`[ClaudeOrchestratorService] 可用 Skills 数量: ${skillsCount}`);
        }
        else {
            this.logger.warn(`[ClaudeOrchestratorService] ⚠️ SkillsRegistry 未注入！`);
        }
    }
    getLlmProvider(request) {
        var _a;
        const requestProvider = (_a = request.options) === null || _a === void 0 ? void 0 : _a.llm_provider;
        if (requestProvider && requestProvider !== 'auto') {
            switch (requestProvider) {
                case 'openai':
                    return llm_request_dto_1.LlmProvider.OPENAI;
                case 'deepseek':
                    return llm_request_dto_1.LlmProvider.DEEPSEEK;
                case 'gemini':
                    return llm_request_dto_1.LlmProvider.GEMINI;
                case 'anthropic':
                    return llm_request_dto_1.LlmProvider.ANTHROPIC;
                default:
                    break;
            }
        }
        return this.llmService.getDefaultProvider();
    }
    getFallbackProviders(primaryProvider) {
        const fallbackOrder = [
            llm_request_dto_1.LlmProvider.DEEPSEEK,
            llm_request_dto_1.LlmProvider.OPENAI,
            llm_request_dto_1.LlmProvider.GEMINI,
        ];
        return fallbackOrder.filter(p => p !== primaryProvider);
    }
    async callLlmWithFallback(primaryProvider, prompt, schema, operationName) {
        try {
            return await this.llmService.callLlmWithSchema(primaryProvider, prompt, schema);
        }
        catch (error) {
            this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${primaryProvider} 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            const fallbackProviders = this.getFallbackProviders(primaryProvider);
            for (const fallbackProvider of fallbackProviders) {
                try {
                    this.logger.debug(`[Claude Orchestrator] ${operationName} 尝试降级到 ${fallbackProvider}...`);
                    return await this.llmService.callLlmWithSchema(fallbackProvider, prompt, schema);
                }
                catch (fallbackError) {
                    this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${fallbackProvider} 也失败: ${fallbackError === null || fallbackError === void 0 ? void 0 : fallbackError.message}`);
                    continue;
                }
            }
            throw error;
        }
    }
    async orchestrate(request, context, deadline) {
        var _a, _b, _c, _d, _e;
        const startTime = Date.now();
        this.logger.log(`[Claude Orchestrator] 开始编排: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
        this.logger.debug(`[Claude Orchestrator] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);
        const llmProvider = this.getLlmProvider(request);
        this.logger.debug(`[Claude Orchestrator] 使用 LLM 提供商: ${llmProvider}`);
        try {
            const isCreatingNewTrip = !request.trip_id || request.trip_id === '';
            const messageLower = request.message.toLowerCase();
            const isPlanningIntent = messageLower.includes('规划') ||
                messageLower.includes('计划') ||
                messageLower.includes('行程') ||
                messageLower.includes('安排') ||
                messageLower.includes('itinerary') ||
                messageLower.includes('trip') ||
                messageLower.includes('plan');
            if (isCreatingNewTrip && isPlanningIntent) {
                const countryCode = this.extractCountryCodeFromMessage(request.message);
                if (countryCode) {
                    this.logger.log(`[Claude Orchestrator] 🚀 Fast Path: 新建行程规划，countryCode=${countryCode}，跳过LLM调用`);
                    const fastPathDeadline = deadline
                        ? new orchestration_utils_1.Deadline(deadline.clamp(12000, 5000))
                        : new orchestration_utils_1.Deadline(12000);
                    const decisionLog = [];
                    const stepsExecuted = [];
                    try {
                        const fastResult = await this.fastPathOrchestrate(request, context, fastPathDeadline, decisionLog, stepsExecuted);
                        fastResult.totalDuration = Date.now() - startTime;
                        fastResult.decisionLog = decisionLog;
                        return fastResult;
                    }
                    catch (error) {
                        this.logger.error(`[Claude Orchestrator] Fast Path 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                        this.logger.warn(`[Claude Orchestrator] 降级到原有LLM流程`);
                    }
                }
                else {
                    this.logger.warn(`[Claude Orchestrator] 创建新行程需要目的地信息，但无法从消息中提取 countryCode`);
                    return {
                        success: false,
                        result: {
                            needsUserConfirmation: true,
                            clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                            errorType: 'MISSING_REQUIRED_PARAM',
                            missingParams: ['countryCode'],
                            solutions: [
                                '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                                '提供已保存的行程 ID，系统将自动获取国家代码',
                            ],
                        },
                        answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                        stepsExecuted: [],
                        totalDuration: Date.now() - startTime,
                        decisionLog: [
                            {
                                request_id: request.request_id,
                                step: 'INTAKE',
                                actor: 'Orchestrator',
                                inputs_summary: `用户请求: ${request.message}`,
                                outputs_summary: `提前验证失败: 缺少目的地信息`,
                                evidence_refs: [],
                                timestamp: new Date().toISOString(),
                            },
                        ],
                    };
                }
            }
            this.logger.debug(`[Claude Orchestrator] 步骤 1/6: 分析用户意图...`);
            const intentAnalysis = await this.analyzeIntent(request, context, llmProvider);
            this.logger.log(`[Claude Orchestrator] ✅ 意图分析完成: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`);
            this.logger.debug(`[Claude Orchestrator] 步骤 2/6: 选择路由策略...`);
            const routingDecision = await this.decideRouting(intentAnalysis, llmProvider);
            this.logger.log(`[Claude Orchestrator] ✅ 路由决策完成: ${routingDecision.route}, 置信度: ${routingDecision.confidence}`);
            if (routingDecision.route.startsWith('SYSTEM1')) {
                return {
                    success: true,
                    result: {
                        route: routingDecision.route,
                        routingDecision,
                        intentAnalysis,
                    },
                    answerText: '正在处理您的请求...',
                    stepsExecuted: [],
                    totalDuration: Date.now() - startTime,
                    decisionLog: [
                        {
                            request_id: request.request_id,
                            step: 'INTAKE',
                            actor: 'Orchestrator',
                            inputs_summary: `用户请求: ${request.message}`,
                            outputs_summary: `意图类型: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
                            evidence_refs: [],
                            timestamp: new Date().toISOString(),
                        },
                        {
                            request_id: request.request_id,
                            step: 'INTAKE',
                            actor: 'Orchestrator',
                            inputs_summary: `意图分析结果: ${intentAnalysis.intentType}`,
                            outputs_summary: `路由决策: ${routingDecision.route}`,
                            evidence_refs: [],
                            timestamp: new Date().toISOString(),
                        },
                    ],
                };
            }
            this.logger.debug(`[Claude Orchestrator] 步骤 4/6: 选择 Skills...`);
            const skillsPlan = await this.selectSkills(intentAnalysis, routingDecision, context, llmProvider);
            this.logger.log(`[Claude Orchestrator] ✅ Skills 选择完成: ${skillsPlan.selectedSkills.length} 个 Skills`);
            if (skillsPlan.selectedSkills.length > 0) {
                this.logger.debug(`[Claude Orchestrator] 选择的 Skills: ${skillsPlan.selectedSkills.map(s => s.skillName).join(', ')}`);
            }
            this.logger.debug(`[Claude Orchestrator] 步骤 4.5/6: 提前验证 Skills 输入参数...`);
            if (isCreatingNewTrip) {
                const needsWorldOrTripId = skillsPlan.selectedSkills.some(skill => {
                    var _a, _b, _c, _d;
                    if (!skill.skillName)
                        return false;
                    const skillMeta = (_b = (_a = this.skillsRegistry) === null || _a === void 0 ? void 0 : _a.getSkill(skill.skillName)) === null || _b === void 0 ? void 0 : _b.metadata;
                    if (!(skillMeta === null || skillMeta === void 0 ? void 0 : skillMeta.inputSchema))
                        return false;
                    const schema = skillMeta.inputSchema;
                    const needsWorld = (_c = schema.dependencies) === null || _c === void 0 ? void 0 : _c.some(dep => { var _a; return dep.param === 'world' || ((_a = dep.alternatives) === null || _a === void 0 ? void 0 : _a.includes('world')); });
                    const needsTripId = (_d = schema.dependencies) === null || _d === void 0 ? void 0 : _d.some(dep => { var _a; return dep.param === 'tripId' || ((_a = dep.alternatives) === null || _a === void 0 ? void 0 : _a.includes('tripId')); });
                    return needsWorld || needsTripId;
                });
                if (needsWorldOrTripId) {
                    const countryCode = this.extractCountryCodeFromMessage(request.message);
                    if (!countryCode) {
                        this.logger.warn(`[Claude Orchestrator] 创建新行程需要 world 上下文，但无法从消息中提取 countryCode`);
                        return {
                            success: false,
                            result: {
                                needsUserConfirmation: true,
                                clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                                errorType: 'MISSING_REQUIRED_PARAM',
                                missingParams: ['countryCode'],
                                solutions: [
                                    '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                                    '提供已保存的行程 ID，系统将自动获取国家代码',
                                ],
                            },
                            answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                            stepsExecuted: [],
                            totalDuration: Date.now() - startTime,
                            decisionLog: [],
                        };
                    }
                    const hasWorldBuildContext = skillsPlan.selectedSkills.some(s => s.skillName === 'world.buildContext');
                    if (!hasWorldBuildContext) {
                        this.logger.debug(`[Claude Orchestrator] 创建新行程场景：自动添加 world.buildContext 到 skillsPlan，countryCode: ${countryCode}`);
                        skillsPlan.selectedSkills.unshift({
                            skillName: 'world.buildContext',
                            reason: '创建新行程需要构建 world 上下文',
                            priority: 1,
                            input: {
                                countryCode: countryCode,
                            },
                            dependencies: [],
                        });
                        if (!skillsPlan.executionOrder.includes('world.buildContext')) {
                            skillsPlan.executionOrder.unshift('world.buildContext');
                        }
                    }
                }
            }
            const earlyValidationResult = await this.validateSkillsInputs(skillsPlan, context, request);
            if (!earlyValidationResult.valid && earlyValidationResult.clarificationMessage) {
                this.logger.warn(`[Claude Orchestrator] Skills 验证失败: ${(_a = earlyValidationResult.missingParams) === null || _a === void 0 ? void 0 : _a.join(', ')}`);
                return {
                    success: false,
                    result: {
                        needsUserConfirmation: true,
                        clarificationMessage: earlyValidationResult.clarificationMessage,
                        errorType: 'MISSING_REQUIRED_PARAM',
                        missingParams: earlyValidationResult.missingParams,
                        solutions: earlyValidationResult.solutions || [],
                    },
                    answerText: earlyValidationResult.clarificationMessage,
                    stepsExecuted: [],
                    totalDuration: Date.now() - startTime,
                    decisionLog: [],
                };
            }
            this.logger.debug(`[Claude Orchestrator] 步骤 5/6: 编排执行计划...`);
            const executionPlan = await this.planExecution(skillsPlan, routingDecision, llmProvider);
            this.logger.log(`[Claude Orchestrator] ✅ 执行计划完成: ${executionPlan.steps.length} 个步骤`);
            this.logger.debug(`[Claude Orchestrator] 步骤 5.5/6: 验证计划输入参数...`);
            const validationResult = await this.validatePlanInputs(executionPlan, context, request);
            if (!validationResult.valid && validationResult.clarificationMessage) {
                this.logger.warn(`[Claude Orchestrator] 计划验证失败: ${(_b = validationResult.missingParams) === null || _b === void 0 ? void 0 : _b.join(', ')}`);
                return {
                    success: false,
                    result: {
                        needsUserConfirmation: true,
                        clarificationMessage: validationResult.clarificationMessage,
                        errorType: 'MISSING_REQUIRED_PARAM',
                        missingParams: validationResult.missingParams,
                        solutions: validationResult.solutions || [],
                    },
                    answerText: validationResult.clarificationMessage,
                    stepsExecuted: [],
                    totalDuration: Date.now() - startTime,
                    decisionLog: [],
                };
            }
            this.logger.debug(`[Claude Orchestrator] 步骤 6/6: 执行计划...`);
            const result = await this.executePlan(executionPlan, context, request);
            this.logger.log(`[Claude Orchestrator] ✅ 执行完成: success=${result.success}, 成功步骤: ${result.stepsExecuted.filter(s => s.success).length}/${result.stepsExecuted.length}`);
            return result;
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] ❌ 编排失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            const isTimeoutError = (error === null || error === void 0 ? void 0 : error.code) === 'ECONNABORTED' ||
                ((_c = error === null || error === void 0 ? void 0 : error.message) === null || _c === void 0 ? void 0 : _c.includes('timeout')) ||
                ((_d = error === null || error === void 0 ? void 0 : error.message) === null || _d === void 0 ? void 0 : _d.includes('超时')) ||
                ((_e = error === null || error === void 0 ? void 0 : error.message) === null || _e === void 0 ? void 0 : _e.startsWith('TIMEOUT:'));
            if (isTimeoutError) {
                this.logger.error(`[Claude Orchestrator] 请求超时，返回超时错误信息`);
                return {
                    success: false,
                    result: {
                        needsUserConfirmation: false,
                        clarificationMessage: '请求超时，请缩小范围或稍后重试。',
                        errorType: error_types_interface_1.ErrorType.TIMEOUT_ERROR,
                        missingParams: [],
                        solutions: [
                            '请稍后重试',
                            '简化您的请求内容',
                            '减少请求的复杂度',
                        ],
                    },
                    answerText: '请求超时，请缩小范围或稍后重试。',
                    stepsExecuted: [],
                    totalDuration: Date.now() - startTime,
                    decisionLog: [],
                };
            }
            const errorInfo = {
                message: (error === null || error === void 0 ? void 0 : error.message) || '未知错误',
                stack: error === null || error === void 0 ? void 0 : error.stack,
                skillsRegistryAvailable: !!this.skillsRegistry,
                actionRegistryAvailable: !!this.actionRegistry,
            };
            this.logger.error(`[Claude Orchestrator] 错误详情: ${JSON.stringify(errorInfo, null, 2)}`);
            return {
                success: false,
                result: {
                    errors: (error === null || error === void 0 ? void 0 : error.message) || '未知错误',
                },
                answerText: `抱歉，处理您的请求时出现错误：${(error === null || error === void 0 ? void 0 : error.message) || '未知错误'}`,
                stepsExecuted: [],
                totalDuration: Date.now() - startTime,
                decisionLog: [
                    {
                        request_id: request.request_id,
                        step: 'FAILED',
                        actor: 'Orchestrator',
                        inputs_summary: `用户请求: ${request.message}`,
                        outputs_summary: `处理失败: ${(error === null || error === void 0 ? void 0 : error.message) || '未知错误'}`,
                        evidence_refs: [],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: (error === null || error === void 0 ? void 0 : error.message) || '未知错误',
                            skillsRegistryAvailable: !!this.skillsRegistry,
                            actionRegistryAvailable: !!this.actionRegistry,
                        },
                    },
                ],
            };
        }
    }
    async analyzeIntent(request, context, provider) {
        const prompt = this.buildIntentAnalysisPrompt(request, context);
        try {
            const response = await this.callLlmWithFallback(provider, prompt, {
                type: 'object',
                properties: {
                    intentType: {
                        type: 'string',
                        enum: ['simple_query', 'complex_planning', 'analysis', 'decision', 'mixed'],
                    },
                    complexity: {
                        type: 'string',
                        enum: ['simple', 'medium', 'complex'],
                    },
                    requiredCapabilities: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reasoning: { type: 'string' },
                    keywords: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    entities: { type: 'object' },
                },
                required: ['intentType', 'complexity', 'requiredCapabilities', 'confidence', 'reasoning'],
            }, '意图分析');
            const parsed = this.extractJSONFromResponse(response);
            return parsed;
        }
        catch (error) {
            this.logger.warn(`[Claude Orchestrator] 意图分析失败，使用默认值: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                intentType: 'simple_query',
                complexity: 'simple',
                requiredCapabilities: ['data_query'],
                confidence: 0.5,
                reasoning: '意图分析失败，使用默认值',
            };
        }
    }
    extractJSONFromResponse(response) {
        if (!response || typeof response !== 'string') {
            throw new Error('响应为空或格式不正确');
        }
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
        cleaned = cleaned.replace(/\n?\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        cleaned = cleaned.trim();
        try {
            return JSON.parse(cleaned);
        }
        catch (parseError) {
            this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
            this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
            throw parseError;
        }
    }
    async decideRouting(intentAnalysis, provider) {
        const prompt = this.buildRoutingPrompt(intentAnalysis);
        try {
            const response = await this.callLlmWithFallback(provider, prompt, {
                type: 'object',
                properties: {
                    route: {
                        type: 'string',
                        enum: ['SYSTEM1_API', 'SYSTEM1_RAG', 'SYSTEM2_REASONING', 'SYSTEM2_ANALYSIS', 'SYSTEM2_WEBBROWSE'],
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reasoning: { type: 'string' },
                    budget: {
                        type: 'object',
                        properties: {
                            max_seconds: { type: 'number' },
                            max_steps: { type: 'number' },
                            max_browser_steps: { type: 'number' },
                        },
                        required: ['max_seconds', 'max_steps', 'max_browser_steps'],
                    },
                    requiredCapabilities: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    consentRequired: { type: 'boolean' },
                },
                required: ['route', 'confidence', 'reasoning', 'budget'],
            }, '路由决策');
            const parsed = this.extractJSONFromResponse(response);
            return parsed;
        }
        catch (error) {
            this.logger.warn(`[Claude Orchestrator] 路由决策失败，使用默认值: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                route: 'SYSTEM2_REASONING',
                confidence: 0.5,
                reasoning: '路由决策失败，使用默认值',
                budget: {
                    max_seconds: 60,
                    max_steps: 8,
                    max_browser_steps: 0,
                },
            };
        }
    }
    async selectSkills(intentAnalysis, routingDecision, context, provider) {
        const availableSkills = this.getAvailableSkills();
        if (availableSkills.length === 0) {
            this.logger.warn('[Claude Orchestrator] 没有可用的 Skills');
            return {
                selectedSkills: [],
                executionOrder: [],
                dependencies: {},
            };
        }
        const prompt = this.buildSkillsSelectionPrompt(intentAnalysis, routingDecision, availableSkills);
        try {
            const response = await this.callLlmWithFallback(provider, prompt, {
                type: 'object',
                properties: {
                    selectedSkills: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                skillName: { type: 'string' },
                                reason: { type: 'string' },
                                priority: { type: 'number' },
                                input: { type: 'object' },
                                dependencies: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                            },
                            required: ['skillName', 'reason', 'priority', 'input'],
                        },
                    },
                    executionOrder: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    dependencies: { type: 'object' },
                },
                required: ['selectedSkills', 'executionOrder', 'dependencies'],
            }, 'Skills 选择');
            const parsed = this.extractJSONFromResponse(response);
            return parsed;
        }
        catch (error) {
            this.logger.warn(`[Claude Orchestrator] Skills 选择失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                selectedSkills: [],
                executionOrder: [],
                dependencies: {},
            };
        }
    }
    async planExecution(skillsPlan, routingDecision, provider) {
        if (skillsPlan.selectedSkills.length === 0) {
            return {
                steps: [],
                parallelGroups: [],
                fallbackStrategy: {
                    onError: 'continue',
                    retryCount: 1,
                },
            };
        }
        const prompt = this.buildExecutionPlanningPrompt(skillsPlan, routingDecision);
        try {
            const response = await this.callLlmWithFallback(provider, prompt, {
                type: 'object',
                properties: {
                    steps: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                type: {
                                    type: 'string',
                                    enum: ['skill', 'action', 'parallel_group'],
                                },
                                skillName: { type: 'string' },
                                actionName: { type: 'string' },
                                dependencies: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                                parallel: { type: 'boolean' },
                                input: { type: 'object' },
                                fallback: {
                                    type: 'object',
                                    properties: {
                                        onError: {
                                            type: 'string',
                                            enum: ['continue', 'stop', 'retry'],
                                        },
                                        retryCount: { type: 'number' },
                                    },
                                },
                            },
                            required: ['id', 'type', 'dependencies', 'parallel'],
                        },
                    },
                    parallelGroups: {
                        type: 'array',
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                    fallbackStrategy: {
                        type: 'object',
                        properties: {
                            onError: {
                                type: 'string',
                                enum: ['continue', 'stop'],
                            },
                            retryCount: { type: 'number' },
                        },
                        required: ['onError', 'retryCount'],
                    },
                    estimatedDuration: { type: 'number' },
                    estimatedCost: { type: 'number' },
                },
                required: ['steps', 'parallelGroups', 'fallbackStrategy'],
            }, '执行计划编排');
            const parsed = this.extractJSONFromResponse(response);
            return parsed;
        }
        catch (error) {
            this.logger.warn(`[Claude Orchestrator] 执行计划编排失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return this.generateFallbackPlan(skillsPlan);
        }
    }
    async validatePlanInputs(plan, context, request) {
        var _a;
        if (this.skillInputValidator) {
            const missingParams = [];
            const results = {};
            for (const step of plan.steps) {
                if (step.type === 'skill' && step.skillName) {
                    const input = this.prepareSkillInput(step, results, context, request);
                    const skill = (_a = this.skillsRegistry) === null || _a === void 0 ? void 0 : _a.getSkill(step.skillName);
                    const metadata = skill === null || skill === void 0 ? void 0 : skill.metadata;
                    const validationResult = this.skillInputValidator.validate(step.skillName, input, metadata, {
                        context,
                        request,
                        stepResults: results,
                        planSteps: plan.steps.map(s => ({ id: s.id, skillName: s.skillName })),
                    });
                    if (!validationResult.valid && validationResult.missingParams.length > 0) {
                        missingParams.push(...validationResult.missingParams);
                    }
                }
            }
            if (missingParams.length > 0) {
                const uniqueMissingParams = [...new Set(missingParams)];
                return {
                    valid: false,
                    missingParams: uniqueMissingParams,
                    clarificationMessage: this.buildMissingParamClarificationMessage({
                        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
                        missingParams: uniqueMissingParams,
                    }),
                    solutions: this.extractSolutionsFromError({
                        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
                    }),
                };
            }
            return { valid: true };
        }
        const missingParams = [];
        const results = {};
        const actualTripId = context.tripId || request.trip_id;
        for (const step of plan.steps) {
            if (step.type === 'skill' && step.skillName) {
                const input = this.prepareSkillInput(step, results, context, request);
                const validationRule = skill_validation_rules_config_1.SKILL_VALIDATION_RULES[step.skillName];
                if (validationRule) {
                    const validationResult = this.validateSkillInputWithRule(step.skillName, input, validationRule, context, request);
                    if (validationResult.missingParams.length > 0) {
                        missingParams.push(...validationResult.missingParams);
                    }
                }
                else {
                    this.logger.debug(`[Claude Orchestrator] Skill ${step.skillName} 没有配置验证规则，跳过验证`);
                }
            }
        }
        if (missingParams.length > 0) {
            const uniqueMissingParams = [...new Set(missingParams)];
            const clarificationMessage = this.buildMissingParamClarificationMessage({
                message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
                missingParams: uniqueMissingParams,
            });
            const solutions = this.extractSolutionsFromError({
                message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
            });
            return {
                valid: false,
                missingParams: uniqueMissingParams,
                clarificationMessage,
                solutions,
            };
        }
        return { valid: true };
    }
    async validateSkillsInputs(skillsPlan, context, request) {
        var _a;
        if (this.skillInputValidator) {
            const missingParams = [];
            for (const skillSelection of skillsPlan.selectedSkills) {
                if (skillSelection.skillName) {
                    const skill = (_a = this.skillsRegistry) === null || _a === void 0 ? void 0 : _a.getSkill(skillSelection.skillName);
                    const metadata = skill === null || skill === void 0 ? void 0 : skill.metadata;
                    const input = skillSelection.input || {};
                    const validationResult = this.skillInputValidator.validate(skillSelection.skillName, input, metadata, {
                        context,
                        request,
                        stepResults: {},
                    });
                    if (!validationResult.valid && validationResult.missingParams.length > 0) {
                        missingParams.push(...validationResult.missingParams);
                    }
                }
            }
            if (missingParams.length > 0) {
                const uniqueMissingParams = [...new Set(missingParams)];
                return {
                    valid: false,
                    missingParams: uniqueMissingParams,
                    clarificationMessage: this.buildMissingParamClarificationMessage({
                        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
                        missingParams: uniqueMissingParams,
                    }),
                    solutions: this.extractSolutionsFromError({
                        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
                    }),
                };
            }
            return { valid: true };
        }
        const missingParams = [];
        for (const skillSelection of skillsPlan.selectedSkills) {
            if (skillSelection.skillName) {
                const validationRule = skill_validation_rules_config_1.SKILL_VALIDATION_RULES[skillSelection.skillName];
                if (validationRule) {
                    const input = skillSelection.input || {};
                    const validationResult = this.validateSkillInputWithRule(skillSelection.skillName, input, validationRule, context, request);
                    if (validationResult.missingParams.length > 0) {
                        missingParams.push(...validationResult.missingParams);
                    }
                }
            }
        }
        if (missingParams.length > 0) {
            const uniqueMissingParams = [...new Set(missingParams)];
            const clarificationMessage = this.buildMissingParamClarificationMessage({
                message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
                missingParams: uniqueMissingParams,
            });
            const solutions = this.extractSolutionsFromError({
                message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
            });
            return {
                valid: false,
                missingParams: uniqueMissingParams,
                clarificationMessage,
                solutions,
            };
        }
        return { valid: true };
    }
    validateSkillInputWithRule(skillName, input, rule, context, request) {
        var _a;
        const missingParams = [];
        if (rule.extractors) {
            for (const [param, extractor] of Object.entries(rule.extractors)) {
                if (!this.hasValue(input[param])) {
                    if (param === 'countryCode') {
                        const countryCode = this.extractCountryCodeFromMessage(request.message);
                        if (countryCode) {
                            input[param] = countryCode;
                        }
                        else {
                            const extracted = extractor(context, request);
                            if (extracted) {
                                input[param] = extracted;
                            }
                        }
                    }
                    else {
                        const extracted = extractor(context, request);
                        if (extracted) {
                            input[param] = extracted;
                        }
                    }
                }
            }
        }
        if (rule.dependencies) {
            for (const dep of rule.dependencies) {
                const hasParam = this.hasValue(input[dep.param]);
                const hasAlternatives = (_a = dep.alternatives) === null || _a === void 0 ? void 0 : _a.some(alt => this.hasValue(input[alt]) ||
                    (alt === 'tripId' && (context.tripId || request.trip_id)));
                if (!hasParam && !hasAlternatives) {
                    if (dep.alternatives && dep.alternatives.length > 0) {
                        missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
                    }
                    else {
                        missingParams.push(dep.param);
                    }
                }
            }
        }
        return { missingParams };
    }
    hasValue(value) {
        return value !== undefined && value !== null && value !== '';
    }
    async executePlan(plan, context, request) {
        var _a, _b, _c, _d;
        const startTime = Date.now();
        const stepsExecuted = [];
        const results = {};
        const decisionLog = [];
        try {
            for (const step of plan.steps) {
                const stepStartTime = Date.now();
                try {
                    if (step.type === 'skill') {
                        if (!this.skillsRegistry) {
                            throw new Error(`SkillsRegistry 未注入，无法执行 Skill: ${step.skillName}`);
                        }
                        const skill = this.skillsRegistry.getSkill(step.skillName);
                        if (!skill) {
                            const availableSkills = this.skillsRegistry.getAllSkills().map(s => s.metadata.name);
                            this.logger.error(`[Claude Orchestrator] Skill 不存在: ${step.skillName}, 可用 Skills: ${availableSkills.join(', ')}`);
                            throw new Error(`Skill not found: ${step.skillName}. Available: ${availableSkills.slice(0, 5).join(', ')}...`);
                        }
                        const input = this.prepareSkillInput(step, results, context, request);
                        this.logger.debug(`[Claude Orchestrator] 执行 Skill: ${step.skillName}`);
                        const result = await skill.execute(input);
                        results[step.id] = result;
                        stepsExecuted.push({
                            stepId: step.id,
                            skillName: step.skillName,
                            success: true,
                            result,
                            duration: Date.now() - stepStartTime,
                        });
                    }
                    else if (step.type === 'action' && this.actionRegistry) {
                        const action = this.actionRegistry.get(step.actionName);
                        if (!action) {
                            throw new Error(`Action not found: ${step.actionName}`);
                        }
                        const input = this.prepareActionInput(step, results, context, request);
                        const state = {
                            requestId: context.requestId,
                            userId: context.userId,
                            tripId: context.tripId,
                            results,
                        };
                        const result = await action.execute(input, state);
                        results[step.id] = result;
                        stepsExecuted.push({
                            stepId: step.id,
                            actionName: step.actionName,
                            success: true,
                            result,
                            duration: Date.now() - stepStartTime,
                        });
                    }
                }
                catch (error) {
                    this.logger.error(`[Claude Orchestrator] 步骤执行失败: ${step.id}, ${error === null || error === void 0 ? void 0 : error.message}`);
                    if (error === null || error === void 0 ? void 0 : error.isCriticalDependencyMissing) {
                        this.logger.warn(`[Claude Orchestrator] 检测到关键依赖缺失: ${step.skillName || step.actionName}`);
                        const criticalError = new Error(error.message);
                        criticalError.isCriticalDependencyMissing = true;
                        criticalError.missingServices = error.missingServices || [];
                        criticalError.solutions = error.solutions || [];
                        criticalError.stepId = step.id;
                        criticalError.skillName = step.skillName || step.actionName;
                        throw criticalError;
                    }
                    if (((_a = step.fallback) === null || _a === void 0 ? void 0 : _a.onError) === 'continue') {
                        stepsExecuted.push({
                            stepId: step.id,
                            skillName: step.skillName,
                            actionName: step.actionName,
                            success: false,
                            error: (error === null || error === void 0 ? void 0 : error.message) || '未知错误',
                            duration: Date.now() - stepStartTime,
                        });
                        continue;
                    }
                    else if (((_b = step.fallback) === null || _b === void 0 ? void 0 : _b.onError) === 'stop') {
                        throw error;
                    }
                    else if (((_c = step.fallback) === null || _c === void 0 ? void 0 : _c.onError) === 'retry' && step.fallback.retryCount) {
                        const maxRetries = step.fallback.retryCount;
                        let retries = 0;
                        let lastError = error;
                        while (retries < maxRetries) {
                            retries++;
                            this.logger.warn(`[Claude Orchestrator] 重试步骤: ${step.id}, 第 ${retries}/${maxRetries} 次`);
                            const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            try {
                                if (step.type === 'skill') {
                                    const skill = (_d = this.skillsRegistry) === null || _d === void 0 ? void 0 : _d.getSkill(step.skillName);
                                    if (!skill) {
                                        throw new Error(`Skill not found: ${step.skillName}`);
                                    }
                                    const input = this.prepareSkillInput(step, results, context, request);
                                    const result = await skill.execute(input);
                                    results[step.id] = result;
                                    stepsExecuted.push({
                                        stepId: step.id,
                                        skillName: step.skillName,
                                        success: true,
                                        result,
                                        duration: Date.now() - stepStartTime,
                                    });
                                    break;
                                }
                                else if (step.type === 'action' && this.actionRegistry) {
                                    const action = this.actionRegistry.get(step.actionName);
                                    if (!action) {
                                        throw new Error(`Action not found: ${step.actionName}`);
                                    }
                                    const input = this.prepareActionInput(step, results, context, request);
                                    const state = {
                                        requestId: context.requestId,
                                        userId: context.userId,
                                        tripId: context.tripId,
                                        results,
                                    };
                                    const result = await action.execute(input, state);
                                    results[step.id] = result;
                                    stepsExecuted.push({
                                        stepId: step.id,
                                        actionName: step.actionName,
                                        success: true,
                                        result,
                                        duration: Date.now() - stepStartTime,
                                    });
                                    break;
                                }
                            }
                            catch (retryError) {
                                lastError = retryError;
                                if (retries >= maxRetries) {
                                    this.logger.error(`[Claude Orchestrator] 步骤 ${step.id} 重试 ${maxRetries} 次后仍失败`);
                                    stepsExecuted.push({
                                        stepId: step.id,
                                        skillName: step.skillName,
                                        actionName: step.actionName,
                                        success: false,
                                        error: (lastError === null || lastError === void 0 ? void 0 : lastError.message) || '未知错误',
                                        duration: Date.now() - stepStartTime,
                                    });
                                    if (plan.fallbackStrategy.onError === 'stop') {
                                        throw lastError;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    else {
                        throw error;
                    }
                }
            }
            const answerText = this.generateAnswerText(results, stepsExecuted);
            const totalCost = stepsExecuted.reduce((sum, step) => {
                return sum + (step.success ? 0.001 : 0);
            }, 0);
            return {
                success: true,
                result: results,
                answerText,
                stepsExecuted,
                totalDuration: Date.now() - startTime,
                totalCost,
                decisionLog,
            };
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] 执行计划失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            const errorType = (0, error_types_interface_1.inferErrorType)(error);
            const strategy = (0, error_types_interface_1.getErrorHandlingStrategy)(errorType);
            this.logger.warn(`[Claude Orchestrator] 检测到错误: type=${errorType}, shouldShowClarification=${strategy.shouldShowClarification}`);
            if (strategy.shouldShowClarification) {
                let clarificationMessage;
                if (errorType === error_types_interface_1.ErrorType.CRITICAL_DEPENDENCY_MISSING) {
                    clarificationMessage = this.buildClarificationMessage(error);
                }
                else if (errorType === error_types_interface_1.ErrorType.MISSING_REQUIRED_PARAM) {
                    clarificationMessage = this.buildMissingParamClarificationMessage(error);
                }
                else {
                    clarificationMessage = strategy.messageTemplate
                        .replace('{errorMessage}', (error === null || error === void 0 ? void 0 : error.message) || '未知错误')
                        .replace('{skillName}', (error === null || error === void 0 ? void 0 : error.skillName) || '未知服务');
                }
                return {
                    success: false,
                    result: {
                        ...results,
                        needsUserConfirmation: strategy.requiresUserConfirmation,
                        clarificationMessage,
                        missingServices: error.missingServices || [],
                        solutions: strategy.suggestedSolutions.length > 0
                            ? strategy.suggestedSolutions
                            : this.extractSolutionsFromError(error),
                        errorType,
                    },
                    answerText: clarificationMessage,
                    stepsExecuted,
                    totalDuration: Date.now() - startTime,
                    decisionLog,
                };
            }
            return {
                success: false,
                result: results,
                answerText: `执行过程中出现错误：${(error === null || error === void 0 ? void 0 : error.message) || '未知错误'}`,
                stepsExecuted,
                totalDuration: Date.now() - startTime,
                decisionLog,
            };
        }
    }
    buildClarificationMessage(error) {
        const skillName = this.translateSkillName(error.skillName || '未知服务');
        const missingServices = error.missingServices || [];
        const solutions = error.solutions || [];
        const message = [
            `抱歉，暂时无法完成行程规划。`,
            '',
            '原因：',
            `- ${skillName}暂时不可用`,
            ...(missingServices.length > 0 ? [
                '',
                '受影响的功能：',
                ...missingServices.map((service) => `- ${this.translateServiceName(service)}`)
            ] : []),
            '',
            '您可以：',
            ...solutions.map((solution, index) => `${index + 1}. ${solution}`),
            '',
            '如果问题持续存在，请联系客服或稍后重试。',
        ].join('\n');
        return message;
    }
    translateSkillName(skillName) {
        const translations = {
            'transport.search': '交通查询服务',
            'poi.search': '地点搜索服务',
            'dem.get.profile': '地形分析服务',
            'opening_hours.get': '开放时间查询服务',
            'geo.check.hazard.zones': '安全风险评估服务',
        };
        return translations[skillName] || skillName;
    }
    translateServiceName(service) {
        const translations = {
            'transport': '交通信息查询',
            'poi': '地点信息查询',
            'dem': '地形数据分析',
            'opening_hours': '开放时间查询',
            'hazard_zones': '安全风险评估',
        };
        return translations[service] || service;
    }
    buildMissingParamClarificationMessage(error) {
        const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || '缺少必需参数';
        let missingParams = [];
        if ((error === null || error === void 0 ? void 0 : error.missingParams) && Array.isArray(error.missingParams)) {
            missingParams = error.missingParams.map((p) => this.translateParamName(p));
        }
        else {
            if (errorMessage.includes('countryCode')) {
                missingParams.push('目的地国家');
            }
            if (errorMessage.includes('tripId')) {
                missingParams.push('行程ID');
            }
            if (errorMessage.includes('world')) {
                missingParams.push('行程上下文信息');
            }
            if (missingParams.length === 0) {
                const match = errorMessage.match(/(\w+)\s*是必需的/);
                if (match) {
                    missingParams.push(this.translateParamName(match[1]));
                }
                else {
                    const paramMatch = errorMessage.match(/缺少必需参数:\s*(.+)/);
                    if (paramMatch) {
                        missingParams = paramMatch[1].split(',').map((p) => this.translateParamName(p.trim()));
                    }
                    else {
                        missingParams.push('必需信息');
                    }
                }
            }
        }
        const missingParam = missingParams.join('、');
        const solutions = this.extractSolutionsFromError(error);
        const message = [
            `需要补充一些信息才能完成行程规划。`,
            '',
            `缺少的信息：`,
            `- ${missingParam || '必需信息'}`,
            '',
            `您可以：`,
            ...solutions.map((solution, index) => `${index + 1}. ${solution}`),
            '',
            `提供这些信息后，我们将继续为您规划行程。`,
        ].join('\n');
        return message;
    }
    translateParamName(paramName) {
        const translations = {
            'countryCode': '目的地国家',
            'tripId': '行程ID',
            'world': '行程上下文信息',
            'destination': '目的地',
            'origin': '出发地',
            'date_range': '日期范围',
            'start_date': '开始日期',
            'days': '行程天数',
            'mode': '交通方式',
            'party': '同行人员信息',
            'constraints': '约束条件',
            'preferences': '偏好设置',
        };
        return translations[paramName] || paramName;
    }
    extractSolutionsFromError(error) {
        const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || '';
        const solutions = [];
        if (errorMessage.includes('可通过')) {
            const match = errorMessage.match(/可通过\s*([^或]+)(?:\s*或\s*([^）]+))?/);
            if (match) {
                if (match[1]) {
                    solutions.push(`通过 ${match[1].trim()} 提供信息`);
                }
                if (match[2]) {
                    solutions.push(`或直接 ${match[2].trim()}`);
                }
            }
        }
        if (errorMessage.includes('countryCode')) {
            if (!solutions.length) {
                solutions.push('在请求中提供国家代码（如 "CN"、"IS"）');
                solutions.push('或提供已保存的行程 ID，系统将自动获取国家代码');
                solutions.push('或在消息中明确提及目的地国家（如 "中国"、"冰岛"）');
            }
        }
        else if (errorMessage.includes('tripId')) {
            if (!solutions.length) {
                solutions.push('提供已保存的行程 ID');
                solutions.push('或直接提供行程相关的详细信息（目的地、日期等）');
            }
        }
        else {
            if (!solutions.length) {
                solutions.push('检查请求参数是否完整');
                solutions.push('提供更多上下文信息');
            }
        }
        return solutions.length > 0 ? solutions : ['请提供完整的请求信息'];
    }
    buildIntentAnalysisPrompt(request, context) {
        var _a;
        return `
${claude_orchestration_prompts_1.INTENT_ANALYSIS_PROMPT}

[用户请求]
${request.message}

[上下文信息]
- 用户 ID: ${context.userId}
- 行程 ID: ${context.tripId || '无'}
- 对话历史: ${((_a = context.conversationHistory) === null || _a === void 0 ? void 0 : _a.join('\n')) || '无'}

请分析用户意图。
`.trim();
    }
    buildRoutingPrompt(intentAnalysis) {
        return `
${claude_orchestration_prompts_1.ROUTING_DECISION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

请根据意图分析结果，决定路由策略。
`.trim();
    }
    buildSkillsSelectionPrompt(intentAnalysis, routingDecision, availableSkills) {
        const skillsList = availableSkills.map(skill => `- ${skill.name}: ${skill.description}`).join('\n');
        return `
${claude_orchestration_prompts_1.SKILLS_SELECTION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

[可用 Skills]
${skillsList}

请选择最合适的 Skills。
`.trim();
    }
    buildExecutionPlanningPrompt(skillsPlan, routingDecision) {
        return `
${claude_orchestration_prompts_1.EXECUTION_PLANNING_PROMPT}

[Skills 选择结果]
${JSON.stringify(skillsPlan, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

请编排最优的执行计划。
`.trim();
    }
    getAvailableSkills() {
        if (!this.skillsRegistry) {
            this.logger.warn('[Claude Orchestrator] SkillsRegistry 未注入，返回空列表');
            return [];
        }
        try {
            const allSkills = this.skillsRegistry.getAllSkills();
            this.logger.debug(`[Claude Orchestrator] 获取到 ${allSkills.length} 个可用 Skills`);
            return allSkills.map(skill => {
                var _a, _b;
                return ({
                    name: ((_a = skill.metadata) === null || _a === void 0 ? void 0 : _a.name) || 'unknown',
                    description: ((_b = skill.metadata) === null || _b === void 0 ? void 0 : _b.description) || 'No description',
                });
            });
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] 获取 Skills 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return [];
        }
    }
    prepareSkillInput(step, results, context, request) {
        let input = {};
        if (step.input) {
            const inputStr = JSON.stringify(step.input);
            const processedInput = inputStr.replace(/\$\{(\w+)\}/g, (match, key) => {
                return results[key] ? JSON.stringify(results[key]) : match;
            });
            input = JSON.parse(processedInput);
        }
        const actualTripId = context.tripId || request.trip_id;
        const actualUserId = context.userId || request.user_id;
        input = this.replacePlaceholders(input, {
            tripId: actualTripId,
            trip_id: actualTripId,
            userId: actualUserId,
            user_id: actualUserId,
            requestId: context.requestId || request.request_id,
        });
        if (actualTripId && !input.tripId && !input.trip_id) {
            input.tripId = actualTripId;
        }
        if (step.skillName === 'routeDirection.pickForIntent') {
            if (!Array.isArray(input.userIntentTags)) {
                input.userIntentTags = input.userIntentTags ? [input.userIntentTags] : [];
            }
            if (!input.countryCode && request.message) {
                const countryCode = this.extractCountryCodeFromMessage(request.message);
                if (countryCode) {
                    input.countryCode = countryCode;
                }
            }
            if (!input.season || typeof input.season !== 'number') {
                const extractedMonth = this.extractMonthFromMessage(request.message);
                if (extractedMonth) {
                    input.season = extractedMonth;
                }
                else {
                    input.season = new Date().getMonth() + 1;
                }
            }
        }
        if (step.skillName === 'world.buildContext') {
            if (!input.countryCode || input.countryCode === 'none') {
                for (const [stepId, stepResult] of Object.entries(results)) {
                    if (stepResult && typeof stepResult === 'object') {
                        if (stepResult.routeDirectionId && typeof stepResult.routeDirectionId === 'string') {
                            const match = stepResult.routeDirectionId.match(/default-([A-Z]{2})-\d+/);
                            if (match) {
                                input.countryCode = match[1];
                                this.logger.debug(`从前面步骤 ${stepId} 的 routeDirectionId 提取 countryCode: ${input.countryCode}`);
                                break;
                            }
                        }
                        if (stepResult.countryCode && typeof stepResult.countryCode === 'string') {
                            input.countryCode = stepResult.countryCode;
                            this.logger.debug(`从前面步骤 ${stepId} 直接获取 countryCode: ${input.countryCode}`);
                            break;
                        }
                    }
                }
            }
            if ((!input.countryCode || input.countryCode === 'none') && request.message) {
                const countryCode = this.extractCountryCodeFromMessage(request.message);
                if (countryCode) {
                    input.countryCode = countryCode;
                    this.logger.debug(`从用户消息提取 countryCode: ${input.countryCode}`);
                }
            }
            if (input.countryCode === 'none' || input.countryCode === 'undefined' || input.countryCode === 'null') {
                delete input.countryCode;
            }
        }
        if (step.skillName === 'decision.runThreeGuardians') {
            if (!input.world && !input.tripId) {
                for (const [stepId, stepResult] of Object.entries(results)) {
                    if (stepResult && typeof stepResult === 'object') {
                        if (stepResult.world) {
                            input.world = stepResult.world;
                            this.logger.debug(`从前面步骤 ${stepId} 提取 world 对象`);
                            break;
                        }
                    }
                }
            }
            if (!input.world && !input.tripId && actualTripId) {
                input.tripId = actualTripId;
                this.logger.debug(`使用 context 中的 tripId: ${input.tripId}`);
            }
        }
        return input;
    }
    extractCountryCodeFromMessage(message) {
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
            '阿尔卑斯': 'AL',
            '阿尔卑斯山': 'AL',
            'Alps': 'AL',
            'alps': 'AL',
            'AL': 'AL',
            '东京': 'JP',
            'Tokyo': 'JP',
            'tokyo': 'JP',
            '大阪': 'JP',
            'Osaka': 'JP',
            '京都': 'JP',
            'Kyoto': 'JP',
            '北京': 'CN',
            'Beijing': 'CN',
            '上海': 'CN',
            'Shanghai': 'CN',
            'shanghai': 'CN',
            '雷克雅未克': 'IS',
            'Reykjavik': 'IS',
            'reykjavik': 'IS',
            'us': 'US',
        };
        const lowerMessage = message.toLowerCase();
        for (const [key, code] of Object.entries(countryMap)) {
            if (lowerMessage.includes(key.toLowerCase())) {
                return code;
            }
        }
        return undefined;
    }
    extractMonthFromMessage(message) {
        if (!message) {
            return undefined;
        }
        const monthKeywords = {
            '一月': 1, '1月': 1, 'january': 1, 'jan': 1,
            '二月': 2, '2月': 2, 'february': 2, 'feb': 2,
            '三月': 3, '3月': 3, 'march': 3, 'mar': 3,
            '四月': 4, '4月': 4, 'april': 4, 'apr': 4,
            '五月': 5, '5月': 5, 'may': 5,
            '六月': 6, '6月': 6, 'june': 6, 'jun': 6,
            '七月': 7, '7月': 7, 'july': 7, 'jul': 7,
            '八月': 8, '8月': 8, 'august': 8, 'aug': 8,
            '九月': 9, '9月': 9, 'september': 9, 'sep': 9, 'sept': 9,
            '十月': 10, '10月': 10, 'october': 10, 'oct': 10,
            '十一月': 11, '11月': 11, 'november': 11, 'nov': 11,
            '十二月': 12, '12月': 12, 'december': 12, 'dec': 12,
        };
        const lowerMessage = message.toLowerCase();
        for (const [key, month] of Object.entries(monthKeywords)) {
            if (lowerMessage.includes(key.toLowerCase())) {
                return month;
            }
        }
        const datePattern = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
        const dateMatch = message.match(datePattern);
        if (dateMatch) {
            const month = parseInt(dateMatch[2], 10);
            if (month >= 1 && month <= 12) {
                return month;
            }
        }
        return undefined;
    }
    replacePlaceholders(input, replacements) {
        if (typeof input === 'string') {
            const placeholderPatterns = [
                /需要从用户请求中提取/gi,
                /none/gi,
                /undefined/gi,
                /null/gi,
            ];
            let result = input;
            for (const pattern of placeholderPatterns) {
                if (pattern.test(result)) {
                    if (result.toLowerCase().includes('trip') && replacements.tripId) {
                        result = replacements.tripId;
                    }
                    else if (result.toLowerCase().includes('user') && replacements.userId) {
                        result = replacements.userId;
                    }
                    else if (result.toLowerCase().includes('request') && replacements.requestId) {
                        result = replacements.requestId;
                    }
                }
            }
            return result;
        }
        else if (Array.isArray(input)) {
            return input.map(item => this.replacePlaceholders(item, replacements));
        }
        else if (input && typeof input === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(input)) {
                if ((key === 'tripId' || key === 'trip_id') &&
                    (typeof value === 'string' &&
                        (value === 'none' || value === 'undefined' || value === 'null' ||
                            value.includes('需要从用户请求中提取')))) {
                    result[key] = replacements.tripId || replacements.trip_id;
                }
                else if ((key === 'userId' || key === 'user_id') &&
                    (typeof value === 'string' &&
                        (value === 'none' || value === 'undefined' || value === 'null'))) {
                    result[key] = replacements.userId || replacements.user_id;
                }
                else {
                    result[key] = this.replacePlaceholders(value, replacements);
                }
            }
            return result;
        }
        return input;
    }
    prepareActionInput(step, results, context, request) {
        return this.prepareSkillInput(step, results, context, request);
    }
    generateAnswerText(results, stepsExecuted) {
        const successfulSteps = stepsExecuted.filter(step => step.success);
        if (successfulSteps.length === 0) {
            return '处理完成，但所有步骤都失败了。';
        }
        const lastStep = successfulSteps[successfulSteps.length - 1];
        if (lastStep === null || lastStep === void 0 ? void 0 : lastStep.result) {
            if (typeof lastStep.result === 'string') {
                return lastStep.result;
            }
            if (lastStep.result.answerText) {
                return lastStep.result.answerText;
            }
            if (lastStep.result.message) {
                return lastStep.result.message;
            }
            if (lastStep.result.explanation) {
                return lastStep.result.explanation;
            }
            if (lastStep.result.summary) {
                return lastStep.result.summary;
            }
            if (typeof lastStep.result === 'object') {
                if (lastStep.result.timeline && Array.isArray(lastStep.result.timeline)) {
                    return `已生成 ${lastStep.result.timeline.length} 天的行程安排。`;
                }
                if (lastStep.result.candidates && Array.isArray(lastStep.result.candidates)) {
                    return `找到 ${lastStep.result.candidates.length} 个候选结果。`;
                }
                const keys = Object.keys(lastStep.result);
                if (keys.length > 0) {
                    return `处理完成。结果包含：${keys.slice(0, 3).join('、')}${keys.length > 3 ? '等' : ''}。`;
                }
            }
        }
        if (successfulSteps.length > 0) {
            const skillNames = successfulSteps
                .map(step => step.skillName || step.actionName)
                .filter(Boolean)
                .join('、');
            return `已成功执行 ${successfulSteps.length} 个步骤${skillNames ? `（${skillNames}）` : ''}。`;
        }
        return '处理完成';
    }
    generateFallbackPlan(skillsPlan) {
        const steps = skillsPlan.selectedSkills.map((skill, index) => ({
            id: `step${index + 1}`,
            type: 'skill',
            skillName: skill.skillName,
            dependencies: skill.dependencies || [],
            parallel: false,
            input: skill.input,
            fallback: {
                onError: 'continue',
                retryCount: 1,
            },
        }));
        return {
            steps,
            parallelGroups: [],
            fallbackStrategy: {
                onError: 'continue',
                retryCount: 1,
            },
        };
    }
    async orchestrateWithStateMachine(request, context, deadline) {
        var _a, _b, _c;
        const startTime = Date.now();
        this.logger.log(`[Claude Orchestrator] 开始状态机编排: request_id=${request.request_id}`);
        this.logger.log(`[Claude Orchestrator] Deadline: ${(deadline === null || deadline === void 0 ? void 0 : deadline.remainingMs()) || 'N/A'}ms`);
        const llmProvider = this.getLlmProvider(request);
        this.logger.log(`[Claude Orchestrator] LLM Provider: ${llmProvider}`);
        const state = {
            request_id: request.request_id,
            plan_id: request.trip_id ? `plan-${request.trip_id}` : `plan-${request.request_id}`,
            plan_version: 1,
            current_step: 'INTAKE',
            evidence_registry: new Map(),
            decision_log: [],
            decision_steps: [],
            errors: [],
            metadata: {
                started_at: new Date().toISOString(),
                last_updated_at: new Date().toISOString(),
            },
        };
        try {
            await this.executeIntakeStep(request, context, state, llmProvider);
            await this.executeResearchStep(request, context, state, llmProvider);
            const hasHardGaps = state.gaps && state.gaps.some(g => g.severity === 'HARD');
            if (hasHardGaps && state.clarification_questions && state.clarification_questions.length > 0) {
                this.logger.debug(`[Claude Orchestrator] 检测到 HARD 缺口，返回澄清问题，不继续执行后续步骤`);
                return this.buildClarificationResult(state, startTime);
            }
            await this.executeGateEvalStep(request, context, state, llmProvider);
            if (((_a = state.gate_result) === null || _a === void 0 ? void 0 : _a.gate_result) === 'BLOCK') {
                return this.buildBlockedResult(state, startTime);
            }
            await this.executePlanGenStep(request, context, state, llmProvider);
            await this.executeVerifyStep(request, context, state, llmProvider);
            if (((_b = state.gate_result) === null || _b === void 0 ? void 0 : _b.gate_result) === 'ADJUST_REQUIRED' || state.errors.length > 0) {
                await this.executeRepairStep(request, context, state, llmProvider);
            }
            await this.executeNarrateStep(request, context, state, llmProvider);
            await this.executeHallucinationDetectionStep(request, context, state);
            state.current_step = 'DONE';
            state.metadata.last_updated_at = new Date().toISOString();
            state.metadata.total_duration_ms = Date.now() - startTime;
            return this.buildSuccessResult(state, startTime);
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] 状态机编排失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            const isTimeout = ((_c = error === null || error === void 0 ? void 0 : error.message) === null || _c === void 0 ? void 0 : _c.startsWith('TIMEOUT:')) ||
                (error === null || error === void 0 ? void 0 : error.code) === 'ECONNABORTED' ||
                (deadline === null || deadline === void 0 ? void 0 : deadline.remainingMs()) <= 0;
            if (isTimeout) {
                this.logger.warn(`[Claude Orchestrator] 状态机执行超时，当前步骤: ${state.current_step}, 已执行步骤数: ${state.decision_log.length}`);
                state.current_step = 'TIMEOUT';
                state.errors.push({
                    step: state.current_step,
                    error_code: 'TIMEOUT',
                    message: `执行超时，已执行到步骤: ${state.current_step}`,
                    timestamp: new Date().toISOString(),
                });
                state.decision_log.push({
                    request_id: state.request_id,
                    step: 'TIMEOUT',
                    actor: 'Orchestrator',
                    inputs_summary: `状态机执行超时`,
                    outputs_summary: `已执行步骤: ${state.decision_log.map(log => log.step).join(' → ')}`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        duration_ms: Date.now() - startTime,
                        timeout: true,
                        executed_steps: state.decision_log.map(log => log.step),
                    },
                });
            }
            else {
                state.current_step = 'FAILED';
                state.errors.push({
                    step: state.current_step,
                    error_code: 'ORCHESTRATION_ERROR',
                    message: (error === null || error === void 0 ? void 0 : error.message) || '未知错误',
                    timestamp: new Date().toISOString(),
                });
            }
            return this.buildErrorResult(state, error, startTime);
        }
    }
    convertToTripPlanRequest(request, state) {
        const message = request.message.toLowerCase();
        let destination;
        const destinationPatterns = [
            { pattern: /冰岛|iceland/i, value: '冰岛' },
            { pattern: /尼泊尔|nepal/i, value: '尼泊尔' },
            { pattern: /瑞士|switzerland/i, value: '瑞士' },
            { pattern: /日本|japan/i, value: '日本' },
            { pattern: /韩国|korea|south korea/i, value: '韩国' },
            { pattern: /泰国|thailand/i, value: '泰国' },
            { pattern: /新加坡|singapore/i, value: '新加坡' },
            { pattern: /马来西亚|malaysia/i, value: '马来西亚' },
            { pattern: /印度尼西亚|indonesia/i, value: '印度尼西亚' },
            { pattern: /菲律宾|philippines/i, value: '菲律宾' },
            { pattern: /越南|vietnam/i, value: '越南' },
        ];
        for (const { pattern, value } of destinationPatterns) {
            if (pattern.test(request.message)) {
                destination = value;
                break;
            }
        }
        let start_date;
        let date_range;
        let days;
        const dateRangeMatch = request.message.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:到|至|-|~)\s*(\d{4})-(\d{2})-(\d{2})/);
        if (dateRangeMatch) {
            const startDateStr = `${dateRangeMatch[1]}-${dateRangeMatch[2]}-${dateRangeMatch[3]}`;
            const endDateStr = `${dateRangeMatch[4]}-${dateRangeMatch[5]}-${dateRangeMatch[6]}`;
            date_range = {
                start_date: startDateStr,
                end_date: endDateStr,
            };
            start_date = startDateStr;
        }
        else {
            const dateMatch = request.message.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (dateMatch) {
                start_date = dateMatch[0];
            }
        }
        const daysPatterns = [
            /(\d+)\s*天/,
            /(\d+)\s*日/,
            /(\d+)\s*晚/,
            /(\d+)\s*days?/i,
            /(\d+)\s*nights?/i,
        ];
        for (const pattern of daysPatterns) {
            const daysMatch = request.message.match(pattern);
            if (daysMatch) {
                const extractedDays = parseInt(daysMatch[1], 10);
                if (extractedDays > 0 && extractedDays <= 30) {
                    days = extractedDays;
                    break;
                }
            }
        }
        if (!days && date_range) {
            const start = new Date(date_range.start_date);
            const end = new Date(date_range.end_date);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            if (diffDays > 0 && diffDays <= 30) {
                days = diffDays;
            }
        }
        let partyCount = 1;
        const countPatterns = [
            /(\d+)\s*人/,
            /(\d+)\s*位/,
            /(\d+)\s*个/,
            /(\d+)\s*persons?/i,
            /(\d+)\s*people/i,
        ];
        for (const pattern of countPatterns) {
            const countMatch = request.message.match(pattern);
            if (countMatch) {
                const extractedCount = parseInt(countMatch[1], 10);
                if (extractedCount > 0 && extractedCount <= 20) {
                    partyCount = extractedCount;
                    break;
                }
            }
        }
        let mode = 'mixed';
        if (/步行|走路|walk/i.test(request.message)) {
            mode = 'walk';
        }
        else if (/开车|自驾|drive|car/i.test(request.message)) {
            mode = 'drive';
        }
        else if (/公交|地铁|transit|public transport/i.test(request.message)) {
            mode = 'transit';
        }
        return {
            request_id: request.request_id,
            origin: '起点',
            destination: destination || '未指定',
            date_range,
            start_date,
            days,
            mode,
            party: {
                count: partyCount,
            },
        };
    }
    async executeIntakeStep(request, context, state, provider) {
        var _a, _b;
        state.current_step = 'INTAKE';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 INTAKE 步骤...`);
        try {
            const tripPlanRequest = this.convertToTripPlanRequest(request, state);
            state.trip_plan_request = tripPlanRequest;
            if (this.plannerAgent) {
                const analysisResult = await this.plannerAgent.analyzeRequest(tripPlanRequest, state);
                state.gaps = analysisResult.gaps;
                const hardGaps = analysisResult.gaps.filter(g => g.severity === 'HARD');
                if (hardGaps.length > 0) {
                    state.clarification_questions = this.generateClarificationQuestions(hardGaps, tripPlanRequest);
                    this.logger.debug(`[Claude Orchestrator] 生成了 ${state.clarification_questions.length} 个结构化澄清问题`);
                }
                state.decision_log.push({
                    request_id: state.request_id,
                    step: 'INTAKE',
                    actor: 'Planner',
                    inputs_summary: `用户请求: ${request.message.substring(0, 100)}...`,
                    outputs_summary: `意图: ${analysisResult.intent}, 缺口数量: ${analysisResult.gaps.length}`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        duration_ms: Date.now() - stepStartTime,
                        gaps: analysisResult.gaps,
                        candidate_structure: analysisResult.candidate_structure,
                        clarification_questions_count: ((_a = state.clarification_questions) === null || _a === void 0 ? void 0 : _a.length) || 0,
                    },
                });
            }
            else {
                const intentAnalysis = await this.analyzeIntent(request, context, provider);
                const gaps = this.identifyGapsFromRequest(tripPlanRequest);
                const hardGaps = gaps.filter(g => g.severity === 'HARD');
                if (hardGaps.length > 0) {
                    state.gaps = gaps;
                    state.clarification_questions = this.generateClarificationQuestions(hardGaps, tripPlanRequest);
                    this.logger.debug(`[Claude Orchestrator] 降级模式：生成了 ${state.clarification_questions.length} 个结构化澄清问题`);
                }
                state.decision_log.push({
                    request_id: state.request_id,
                    step: 'INTAKE',
                    actor: 'Orchestrator',
                    inputs_summary: `用户请求: ${request.message.substring(0, 100)}...`,
                    outputs_summary: `意图类型: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        duration_ms: Date.now() - stepStartTime,
                        clarification_questions_count: ((_b = state.clarification_questions) === null || _b === void 0 ? void 0 : _b.length) || 0,
                    },
                });
            }
            state.metadata.last_updated_at = new Date().toISOString();
            await this.generateDecisionStepForStep(state, 'INTAKE', 'Planner');
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] INTAKE 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async executeResearchStep(request, context, state, provider) {
        state.current_step = 'RESEARCH';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 RESEARCH 步骤...`);
        try {
            const researchData = {};
            const evidenceRefs = [];
            if (this.skillsRegistry && state.trip_plan_request) {
                const tripRequest = state.trip_plan_request;
                try {
                    const transportSkill = this.skillsRegistry.getSkill('transport.search');
                    if (transportSkill && typeof tripRequest.origin === 'string' && typeof tripRequest.destination === 'string') {
                        const transportResult = await transportSkill.execute({
                            origin: tripRequest.origin,
                            destination: tripRequest.destination,
                            mode: tripRequest.mode || 'mixed',
                        });
                        researchData.transport_evidence = transportResult;
                        if (transportResult === null || transportResult === void 0 ? void 0 : transportResult.evidence_id) {
                            evidenceRefs.push(transportResult.evidence_id);
                        }
                    }
                }
                catch (error) {
                    const strategy = (0, skill_importance_util_1.getSkillFailureStrategy)('transport.search', error);
                    if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
                        this.logger.warn(`[Claude Orchestrator] transport.search 依赖缺失，降级处理: ${error === null || error === void 0 ? void 0 : error.message}`);
                        researchData.transport_evidence = {
                            missing: true,
                            error: error === null || error === void 0 ? void 0 : error.message,
                            degraded: true,
                            degradation_reason: 'TransportRoutingService 未注入',
                        };
                    }
                    else if (strategy.shouldReject) {
                        this.logger.error(`[Claude Orchestrator] ${strategy.errorMessage}`);
                        throw new Error(strategy.errorMessage);
                    }
                    else if (strategy.shouldMarkMissing) {
                        this.logger.warn(`[Claude Orchestrator] transport.search 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                        researchData.transport_evidence = { missing: true, error: error === null || error === void 0 ? void 0 : error.message };
                    }
                }
                try {
                    const poiSkill = this.skillsRegistry.getSkill('poi.search');
                    if (poiSkill) {
                        const destinationQuery = typeof tripRequest.destination === 'string'
                            ? tripRequest.destination
                            : 'destination';
                        const poiResult = await poiSkill.execute({
                            query: destinationQuery,
                            limit: 10,
                            lat: typeof tripRequest.destination === 'object' ? tripRequest.destination.lat : undefined,
                            lng: typeof tripRequest.destination === 'object' ? tripRequest.destination.lng : undefined,
                        });
                        researchData.poi_evidence = poiResult.pois || poiResult;
                        if (poiResult.pois && Array.isArray(poiResult.pois)) {
                            poiResult.pois.forEach((poi) => {
                                if (poi.evidence_id)
                                    evidenceRefs.push(poi.evidence_id);
                            });
                        }
                    }
                }
                catch (error) {
                    const strategy = (0, skill_importance_util_1.getSkillFailureStrategy)('poi.search', error);
                    this.logger.warn(`[Claude Orchestrator] poi.search 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    if (strategy.shouldMarkMissing) {
                        researchData.poi_evidence = { missing: true, error: error === null || error === void 0 ? void 0 : error.message };
                    }
                }
                try {
                    const openingHoursSkill = this.skillsRegistry.getSkill('opening_hours.get');
                    if (openingHoursSkill && researchData.poi_evidence && !researchData.poi_evidence.missing) {
                        let poiIds = [];
                        if (Array.isArray(researchData.poi_evidence)) {
                            poiIds = researchData.poi_evidence.slice(0, 5).map((poi) => poi.poi_id || poi.id || poi.place_id).filter(Boolean);
                        }
                        else if (researchData.poi_evidence.pois && Array.isArray(researchData.poi_evidence.pois)) {
                            poiIds = researchData.poi_evidence.pois.slice(0, 5).map((poi) => poi.poi_id || poi.id || poi.place_id).filter(Boolean);
                        }
                        if (poiIds.length > 0) {
                            const openingHoursResult = await openingHoursSkill.execute({
                                poi_ids: poiIds,
                            });
                            researchData.opening_hours_evidence = openingHoursResult.opening_hours || openingHoursResult;
                            if (openingHoursResult.opening_hours && Array.isArray(openingHoursResult.opening_hours)) {
                                openingHoursResult.opening_hours.forEach((item) => {
                                    if (item.evidence_id)
                                        evidenceRefs.push(item.evidence_id);
                                });
                            }
                        }
                    }
                }
                catch (error) {
                    const strategy = (0, skill_importance_util_1.getSkillFailureStrategy)('opening_hours.get', error);
                    this.logger.warn(`[Claude Orchestrator] opening_hours.get 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    if (strategy.shouldMarkMissing) {
                        researchData.opening_hours_evidence = { missing: true, error: error === null || error === void 0 ? void 0 : error.message };
                    }
                }
                try {
                    const demSkill = this.skillsRegistry.getSkill('dem.get.profile');
                    if (demSkill && tripRequest.destination) {
                        const demResult = await demSkill.execute({
                            destination: tripRequest.destination,
                        });
                        researchData.dem_metrics = demResult;
                    }
                }
                catch (error) {
                    const strategy = (0, skill_importance_util_1.getSkillFailureStrategy)('dem.get.profile', error);
                    if (strategy.shouldIgnore) {
                        this.logger.debug(`[Claude Orchestrator] dem.get.profile 失败（已忽略）: ${error === null || error === void 0 ? void 0 : error.message}`);
                    }
                    else {
                        this.logger.warn(`[Claude Orchestrator] dem.get.profile 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    }
                }
                try {
                    const riskSkill = this.skillsRegistry.getSkill('geo.check.hazard.zones');
                    if (riskSkill && tripRequest.destination) {
                        const coords = typeof tripRequest.destination === 'object'
                            ? tripRequest.destination
                            : undefined;
                        if (coords) {
                            const riskResult = await riskSkill.execute({
                                lat: coords.lat,
                                lng: coords.lng,
                            });
                            researchData.risk_assessment = riskResult;
                        }
                    }
                }
                catch (error) {
                    const strategy = (0, skill_importance_util_1.getSkillFailureStrategy)('geo.check.hazard.zones', error);
                    if (strategy.shouldIgnore) {
                        this.logger.debug(`[Claude Orchestrator] geo.check.hazard.zones 失败（已忽略）: ${error === null || error === void 0 ? void 0 : error.message}`);
                    }
                    else {
                        this.logger.warn(`[Claude Orchestrator] geo.check.hazard.zones 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    }
                }
                await this.collectWorldModelData(tripRequest, researchData, evidenceRefs);
            }
            state.research_data = researchData;
            state.decision_log.push({
                request_id: state.request_id,
                step: 'RESEARCH',
                actor: 'Orchestrator',
                inputs_summary: '开始数据收集',
                outputs_summary: `收集了 ${Object.keys(researchData).length} 类数据，证据数量: ${evidenceRefs.length}`,
                evidence_refs: evidenceRefs,
                timestamp: new Date().toISOString(),
                metadata: {
                    duration_ms: Date.now() - stepStartTime,
                    data_types: Object.keys(researchData),
                },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            await this.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] RESEARCH 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async executeGateEvalStep(request, context, state, provider) {
        state.current_step = 'GATE_EVAL';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 GATE_EVAL 步骤...`);
        try {
            let readinessCheckResult = null;
            let readinessBlockers = [];
            let readinessMust = [];
            let rulesNeedingDecision = [];
            if (this.readinessService && state.trip_plan_request) {
                try {
                    const destination = typeof state.trip_plan_request.destination === 'string'
                        ? state.trip_plan_request.destination
                        : `${state.trip_plan_request.destination.lat},${state.trip_plan_request.destination.lng}`;
                    const tripContext = this.extractTripContextFromState(state);
                    const geoLat = typeof state.trip_plan_request.destination === 'object'
                        ? state.trip_plan_request.destination.lat
                        : undefined;
                    const geoLng = typeof state.trip_plan_request.destination === 'object'
                        ? state.trip_plan_request.destination.lng
                        : undefined;
                    readinessCheckResult = await this.readinessService.checkFromDestination(destination, tripContext, {
                        enhanceWithGeo: !!(geoLat && geoLng),
                        geoLat,
                        geoLng,
                        lang: 'zh',
                    });
                    readinessBlockers = readinessCheckResult.findings.flatMap((f) => f.blockers || []);
                    readinessMust = readinessCheckResult.findings.flatMap((f) => f.must || []);
                    if (this.userDecisionService) {
                        rulesNeedingDecision = [...readinessBlockers, ...readinessMust].filter((item) => {
                            var _a;
                            return ((_a = item.userDecision) === null || _a === void 0 ? void 0 : _a.questions) && item.userDecision.questions.length > 0;
                        });
                    }
                    this.logger.debug(`[Claude Orchestrator] 准备度检查完成: ` +
                        `blockers=${readinessBlockers.length}, ` +
                        `must=${readinessMust.length}, ` +
                        `需要用户决策=${rulesNeedingDecision.length}`);
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] 准备度检查失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
                }
            }
            if (readinessBlockers.length > 0 && rulesNeedingDecision.length === 0) {
                state.gate_result = {
                    gate_result: 'BLOCK',
                    violations: readinessBlockers.map((item) => {
                        var _a;
                        return ({
                            type: 'SAFETY',
                            severity: 'HARD',
                            detail: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
                            evidence_refs: ((_a = item.evidence) === null || _a === void 0 ? void 0 : _a.map((e) => e.sourceId)) || [],
                        });
                    }),
                    required_adjustments: [],
                    confidence: 0.9,
                    evidence_refs: readinessBlockers.flatMap((item) => { var _a; return ((_a = item.evidence) === null || _a === void 0 ? void 0 : _a.map((e) => e.sourceId)) || []; }),
                };
                const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(readinessCheckResult, state.request_id);
                state.decision_log.push(...readinessDecisionLogs);
                state.decision_log.push({
                    request_id: state.request_id,
                    step: 'GATE_EVAL',
                    actor: 'Gatekeeper',
                    inputs_summary: '评估行程可行性（准备度检查）',
                    outputs_summary: `Gate 结果: BLOCK（准备度检查发现 ${readinessBlockers.length} 个阻塞项）`,
                    evidence_refs: state.gate_result.evidence_refs || [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        duration_ms: Date.now() - stepStartTime,
                        readiness_blockers: readinessBlockers,
                        guardian: 'ABU',
                    },
                });
                state.metadata.last_updated_at = new Date().toISOString();
                return;
            }
            if (rulesNeedingDecision.length > 0) {
                state.gate_result = {
                    gate_result: 'NEED_USER_CONFIRM',
                    violations: [],
                    required_adjustments: [],
                    confidence: 0.8,
                    evidence_refs: [],
                };
                state.gate_result.readiness_questions = rulesNeedingDecision.map((item) => ({
                    ruleId: item.id,
                    questions: item.userDecision.questions,
                    category: item.category,
                    severity: item.severity,
                }));
                if (readinessCheckResult) {
                    const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(readinessCheckResult, state.request_id);
                    state.decision_log.push(...readinessDecisionLogs);
                }
                state.decision_log.push({
                    request_id: state.request_id,
                    step: 'GATE_EVAL',
                    actor: 'Gatekeeper',
                    inputs_summary: '评估行程可行性（准备度检查）',
                    outputs_summary: `Gate 结果: NEED_USER_CONFIRM（需要用户回答 ${rulesNeedingDecision.length} 个规则的问题）`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        duration_ms: Date.now() - stepStartTime,
                        readiness_questions: rulesNeedingDecision.map((item) => ({
                            ruleId: item.id,
                            questionCount: item.userDecision.questions.length,
                            category: item.category,
                        })),
                        guardian: 'ABU',
                    },
                });
                state.metadata.last_updated_at = new Date().toISOString();
                return;
            }
            if (this.gatekeeperAgent && state.trip_plan_request) {
                const gateResult = await this.gatekeeperAgent.evaluateGate(state.trip_plan_request, state.research_data || {}, state);
                if (readinessMust.length > 0) {
                    gateResult.required_adjustments = [
                        ...gateResult.required_adjustments,
                        ...readinessMust.map((item) => ({
                            action: 'REPLACE_SEGMENT',
                            why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
                            alternatives: [],
                        })),
                    ];
                    if (gateResult.gate_result === 'ALLOW' && readinessMust.length > 0) {
                        gateResult.gate_result = 'ADJUST_REQUIRED';
                    }
                }
                state.gate_result = gateResult;
            }
            else {
                state.gate_result = {
                    gate_result: readinessMust.length > 0 ? 'ADJUST_REQUIRED' : 'ALLOW',
                    violations: [],
                    required_adjustments: readinessMust.map((item) => ({
                        action: 'REPLACE_SEGMENT',
                        why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
                        alternatives: [],
                    })),
                    confidence: 0.8,
                    evidence_refs: [],
                };
            }
            if (readinessCheckResult && this.readinessService) {
                const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(readinessCheckResult, state.request_id);
                state.decision_log.push(...readinessDecisionLogs);
            }
            const readinessSummary = readinessCheckResult
                ? `准备度: blockers=${readinessBlockers.length}, must=${readinessMust.length}`
                : '';
            state.decision_log.push({
                request_id: state.request_id,
                step: 'GATE_EVAL',
                actor: 'Gatekeeper',
                inputs_summary: `评估行程可行性${readinessSummary ? `（${readinessSummary}）` : ''}`,
                outputs_summary: `Gate 结果: ${state.gate_result.gate_result}, 置信度: ${state.gate_result.confidence}, 违规数: ${state.gate_result.violations.length}`,
                evidence_refs: state.gate_result.evidence_refs || [],
                timestamp: new Date().toISOString(),
                metadata: {
                    duration_ms: Date.now() - stepStartTime,
                    violations: state.gate_result.violations,
                    adjustments: state.gate_result.required_adjustments,
                    guardian: 'ABU',
                    readiness_check: readinessCheckResult
                        ? {
                            totalBlockers: readinessCheckResult.summary.totalBlockers,
                            totalMust: readinessCheckResult.summary.totalMust,
                            totalShould: readinessCheckResult.summary.totalShould,
                            totalOptional: readinessCheckResult.summary.totalOptional,
                        }
                        : undefined,
                },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            await this.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] GATE_EVAL 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    extractTripContextFromState(state) {
        var _a, _b, _c, _d, _e;
        const request = state.trip_plan_request;
        if (!request) {
            return {
                traveler: {},
                trip: {},
                itinerary: {
                    countries: [],
                },
            };
        }
        const destination = typeof request.destination === 'string'
            ? request.destination
            : 'UNKNOWN';
        const countryCode = destination.split('-')[0] || destination.split(',')[0] || 'UNKNOWN';
        const traveler = {
            nationality: undefined,
            residencyCountry: undefined,
            tags: [],
            budgetLevel: ((_b = (_a = request.constraints) === null || _a === void 0 ? void 0 : _a.budget) === null || _b === void 0 ? void 0 : _b.total)
                ? request.constraints.budget.total > 5000
                    ? 'high'
                    : request.constraints.budget.total > 2000
                        ? 'medium'
                        : 'low'
                : undefined,
            riskTolerance: undefined,
        };
        const itinerary = {
            countries: [countryCode],
            activities: [],
            season: ((_c = request.date_range) === null || _c === void 0 ? void 0 : _c.start_date)
                ? this.extractSeason(request.date_range.start_date)
                : undefined,
        };
        return {
            traveler,
            trip: {
                startDate: ((_d = request.date_range) === null || _d === void 0 ? void 0 : _d.start_date) || request.start_date,
                endDate: (_e = request.date_range) === null || _e === void 0 ? void 0 : _e.end_date,
            },
            itinerary,
        };
    }
    extractSeason(dateStr) {
        try {
            const date = new Date(dateStr);
            const month = date.getMonth() + 1;
            if (month >= 3 && month <= 5)
                return 'spring';
            if (month >= 6 && month <= 8)
                return 'summer';
            if (month >= 9 && month <= 11)
                return 'autumn';
            return 'winter';
        }
        catch {
            return 'all';
        }
    }
    async executePlanGenStep(request, context, state, provider) {
        var _a;
        state.current_step = 'PLAN_GEN';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 PLAN_GEN 步骤...`);
        try {
            if (this.skillsRegistry && state.trip_plan_request) {
                try {
                    const itinerarySkill = this.skillsRegistry.getSkill('itinerary.generate');
                    if (itinerarySkill) {
                        const itineraryResult = await itinerarySkill.execute({
                            request: state.trip_plan_request,
                            research_data: state.research_data,
                            gate_result: state.gate_result,
                        });
                        if (itineraryResult && typeof itineraryResult === 'object' && 'request_id' in itineraryResult && 'days' in itineraryResult) {
                            state.itinerary = itineraryResult;
                        }
                        else {
                            state.itinerary = {
                                request_id: state.request_id,
                                days: [],
                            };
                        }
                    }
                    else {
                        state.itinerary = {
                            request_id: state.request_id,
                            days: [],
                        };
                    }
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] itinerary.generate 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    state.itinerary = {
                        request_id: state.request_id,
                        days: [],
                    };
                }
            }
            else {
                state.itinerary = {
                    request_id: state.request_id,
                    days: [],
                };
            }
            state.decision_log.push({
                request_id: state.request_id,
                step: 'PLAN_GEN',
                actor: 'Planner',
                inputs_summary: '生成行程草案',
                outputs_summary: `生成了 ${state.itinerary.days.length} 天的行程`,
                evidence_refs: [],
                timestamp: new Date().toISOString(),
                metadata: {
                    duration_ms: Date.now() - stepStartTime,
                },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            await this.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');
            if (this.trajectoryCollection && state.itinerary && state.gate_result) {
                try {
                    const context = request;
                    const tripId = context.trip_id || undefined;
                    const countryCode = ((_a = state.trip_plan_request) === null || _a === void 0 ? void 0 : _a.destination)
                        ? (typeof state.trip_plan_request.destination === 'string'
                            ? undefined
                            : undefined)
                        : undefined;
                    let complianceResult = state.compliance_result;
                    if (!complianceResult && this.complianceAgent && state.itinerary) {
                        try {
                            complianceResult = await this.complianceAgent.checkCompliance(state.itinerary, state.gate_result, state);
                        }
                        catch (error) {
                            this.logger.warn(`[Claude Orchestrator] Compliance 检查失败，使用默认值: ${error === null || error === void 0 ? void 0 : error.message}`);
                            complianceResult = {
                                risk_warnings: [],
                                disclaimers: [],
                                required_confirmations: [],
                            };
                        }
                    }
                    else if (!complianceResult) {
                        complianceResult = {
                            risk_warnings: [],
                            disclaimers: [],
                            required_confirmations: [],
                        };
                    }
                    await this.trajectoryCollection.collectTrajectory({
                        requestId: state.request_id,
                        tripId,
                        plan: state.itinerary,
                        decisionTrace: state.decision_log,
                        researchData: state.research_data || {},
                        gateResult: state.gate_result,
                        complianceResult: complianceResult,
                        modelVersion: 'v1.0',
                        countryCode,
                    });
                    this.logger.debug(`[Claude Orchestrator] 轨迹已收集: requestId=${state.request_id}`);
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] PLAN_GEN 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async executeVerifyStep(request, context, state, provider) {
        state.current_step = 'VERIFY';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 VERIFY 步骤...`);
        try {
            const verificationIssues = [];
            if (this.skillsRegistry && state.itinerary) {
                try {
                    const verifySkill = this.skillsRegistry.getSkill('itinerary.verify');
                    if (verifySkill) {
                        const verifyResult = await verifySkill.execute({
                            itinerary: state.itinerary,
                            research_data: state.research_data,
                        });
                        if ((verifyResult === null || verifyResult === void 0 ? void 0 : verifyResult.issues) && Array.isArray(verifyResult.issues)) {
                            verificationIssues.push(...verifyResult.issues);
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] itinerary.verify 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            if (verificationIssues.length > 0) {
                state.errors.push({
                    step: 'VERIFY',
                    error_code: 'VERIFICATION_ISSUES',
                    message: `发现 ${verificationIssues.length} 个验证问题`,
                    timestamp: new Date().toISOString(),
                });
            }
            state.decision_log.push({
                request_id: state.request_id,
                step: 'VERIFY',
                actor: 'Orchestrator',
                inputs_summary: '验证行程可行性',
                outputs_summary: verificationIssues.length > 0
                    ? `发现 ${verificationIssues.length} 个问题`
                    : '验证通过',
                evidence_refs: [],
                timestamp: new Date().toISOString(),
                metadata: {
                    duration_ms: Date.now() - stepStartTime,
                    issues: verificationIssues,
                    guardian: 'DR_DRE',
                },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            await this.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] VERIFY 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            state.errors.push({
                step: 'VERIFY',
                error_code: 'VERIFICATION_ERROR',
                message: (error === null || error === void 0 ? void 0 : error.message) || '验证失败',
                timestamp: new Date().toISOString(),
            });
        }
    }
    async executeRepairStep(request, context, state, provider) {
        state.current_step = 'REPAIR';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 REPAIR 步骤...`);
        try {
            let repairApplied = false;
            const repairActions = [];
            if (this.localInsightAgent && state.trip_plan_request && state.gate_result) {
                try {
                    const alternatives = await this.localInsightAgent.suggestAlternatives(state.trip_plan_request, state.gate_result, state);
                    if (alternatives.alternative_pois.length > 0 || alternatives.alternative_routes.length > 0) {
                        repairApplied = true;
                        repairActions.push(`生成了 ${alternatives.alternative_pois.length} 个替代 POI 和 ${alternatives.alternative_routes.length} 条替代路线`);
                        state.alternatives = alternatives;
                    }
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] LocalInsight Agent 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            if (this.skillsRegistry && state.itinerary && state.gate_result) {
                try {
                    const repairSkill = this.skillsRegistry.getSkill('repair.apply');
                    if (repairSkill && state.gate_result.required_adjustments.length > 0) {
                        const repairResult = await repairSkill.execute({
                            itinerary: state.itinerary,
                            adjustments: state.gate_result.required_adjustments,
                            alternatives: state.alternatives,
                        });
                        if (repairResult === null || repairResult === void 0 ? void 0 : repairResult.repaired) {
                            repairApplied = true;
                            repairActions.push('已应用修复方案');
                            state.itinerary = repairResult.itinerary;
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] repair.apply 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            state.decision_log.push({
                request_id: state.request_id,
                step: 'REPAIR',
                actor: 'LocalInsight',
                inputs_summary: '修复行程问题',
                outputs_summary: repairApplied
                    ? repairActions.join('；')
                    : '无需修复或修复失败',
                evidence_refs: [],
                timestamp: new Date().toISOString(),
                metadata: {
                    duration_ms: Date.now() - stepStartTime,
                    repair_applied: repairApplied,
                    guardian: 'NEPTUNE',
                },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            await this.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] REPAIR 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            state.errors.push({
                step: 'REPAIR',
                error_code: 'REPAIR_ERROR',
                message: (error === null || error === void 0 ? void 0 : error.message) || '修复失败',
                timestamp: new Date().toISOString(),
            });
        }
    }
    async executeNarrateStep(request, context, state, provider) {
        var _a, _b;
        state.current_step = 'NARRATE';
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 NARRATE 步骤...`);
        try {
            if (this.narratorAgent && state.itinerary && state.gate_result) {
                try {
                    const narration = await this.narratorAgent.narrate(state.itinerary, state.gate_result, state.decision_log, state);
                    state.narration = narration;
                }
                catch (error) {
                    this.logger.warn(`[Claude Orchestrator] Narrator Agent 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            state.decision_log.push({
                request_id: state.request_id,
                step: 'NARRATE',
                actor: 'Narrator',
                inputs_summary: '生成用户可读解释',
                outputs_summary: state.narration
                    ? `已生成 ${((_b = (_a = state.narration) === null || _a === void 0 ? void 0 : _a.day_by_day_narrative) === null || _b === void 0 ? void 0 : _b.length) || 0} 天的叙述`
                    : '已生成行程说明',
                evidence_refs: [],
                timestamp: new Date().toISOString(),
                metadata: {
                    duration_ms: Date.now() - stepStartTime,
                },
            });
            state.metadata.last_updated_at = new Date().toISOString();
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] NARRATE 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            state.errors.push({
                step: 'NARRATE',
                error_code: 'NARRATION_ERROR',
                message: (error === null || error === void 0 ? void 0 : error.message) || '叙述生成失败',
                timestamp: new Date().toISOString(),
            });
        }
    }
    async executeHallucinationDetectionStep(request, context, state) {
        if (!this.hallucinationDetection) {
            this.logger.debug(`[Claude Orchestrator] HallucinationDetectionService 未注入，跳过防幻觉检测`);
            return;
        }
        const stepStartTime = Date.now();
        this.logger.debug(`[Claude Orchestrator] 执行 HALLUCINATION_DETECTION 步骤...`);
        try {
            if (state.narration) {
                const detectionResult = await this.hallucinationDetection.detectHallucinations(state.narration, context);
                if (detectionResult.cleanedOutput) {
                    state.narration = detectionResult.cleanedOutput;
                }
                if (detectionResult.hallucinationRisks.length > 0) {
                    if (!state.metadata.warnings) {
                        state.metadata.warnings = [];
                    }
                    state.metadata.warnings.push({
                        type: 'HALLUCINATION_RISK',
                        message: detectionResult.userNotification.message,
                        items: detectionResult.hallucinationRisks.map(r => ({
                            text: r.text,
                            confidence: r.confidence,
                            action: r.action,
                        })),
                    });
                    this.logger.warn(`[Claude Orchestrator] 检测到 ${detectionResult.hallucinationRisks.length} 个幻觉风险`);
                }
                state.decision_log.push({
                    request_id: state.request_id,
                    step: 'HALLUCINATION_DETECTION',
                    actor: 'HallucinationDetection',
                    inputs_summary: '检测LLM生成内容中的事实声明',
                    outputs_summary: `检测到 ${detectionResult.statistics.totalClaims} 个声明，${detectionResult.statistics.verifiedClaims} 个已验证，${detectionResult.statistics.hallucinationRisks} 个幻觉风险`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                    metadata: {
                        duration_ms: Date.now() - stepStartTime,
                        statistics: detectionResult.statistics,
                    },
                });
            }
            state.metadata.last_updated_at = new Date().toISOString();
        }
        catch (error) {
            this.logger.error(`[Claude Orchestrator] HALLUCINATION_DETECTION 步骤失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            state.errors.push({
                step: 'HALLUCINATION_DETECTION',
                error_code: 'HALLUCINATION_DETECTION_ERROR',
                message: (error === null || error === void 0 ? void 0 : error.message) || '防幻觉检测失败',
                timestamp: new Date().toISOString(),
            });
        }
    }
    async generateDecisionStepForStep(state, orchestrationStep, subAgent) {
        if (!this.decisionDraftGenerator) {
            return;
        }
        try {
            const decisionStep = await this.decisionDraftGenerator.generateDecisionStepFromOrchestrationState(state, orchestrationStep, subAgent);
            if (decisionStep) {
                if (!state.decision_steps) {
                    state.decision_steps = [];
                }
                state.decision_steps.push(decisionStep);
                this.logger.debug(`[Claude Orchestrator] 生成 Decision Step: type=${decisionStep.type}, step=${orchestrationStep}`);
            }
        }
        catch (error) {
            this.logger.warn(`[Claude Orchestrator] Decision Step 生成失败，跳过: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    generateClarificationQuestions(gaps, tripPlanRequest) {
        var _a, _b;
        const questions = [];
        let questionId = 1;
        for (const gap of gaps) {
            switch (gap.type) {
                case 'MISSING_DESTINATION':
                    questions.push({
                        id: `question-${questionId++}`,
                        question: '请选择您的目的地',
                        type: 'text',
                        required: true,
                        placeholder: '例如：冰岛、日本、瑞士',
                        hint: '这将帮助我们为您推荐合适的景点和活动',
                    });
                    break;
                case 'MISSING_DATES':
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const twoYearsLater = new Date();
                    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
                    questions.push({
                        id: `question-${questionId++}`,
                        question: '请选择您的出行日期',
                        type: 'date',
                        required: true,
                        hint: '建议选择 1 个月后的日期，以便提前预订',
                        validation: {
                            min: tomorrow.getTime(),
                            max: twoYearsLater.getTime(),
                        },
                    });
                    if (tripPlanRequest.start_date || ((_a = tripPlanRequest.date_range) === null || _a === void 0 ? void 0 : _a.start_date)) {
                        questions.push({
                            id: `question-${questionId++}`,
                            question: '请选择您的返回日期',
                            type: 'date',
                            required: true,
                            hint: '返回日期必须晚于出发日期',
                            validation: {
                                min: tripPlanRequest.start_date
                                    ? new Date(tripPlanRequest.start_date).getTime()
                                    : ((_b = tripPlanRequest.date_range) === null || _b === void 0 ? void 0 : _b.start_date)
                                        ? new Date(tripPlanRequest.date_range.start_date).getTime()
                                        : tomorrow.getTime(),
                                max: twoYearsLater.getTime(),
                            },
                        });
                    }
                    break;
                case 'MISSING_CONSTRAINTS':
                    questions.push({
                        id: `question-${questionId++}`,
                        question: '同行人数',
                        type: 'single_choice',
                        required: true,
                        options: ['1人', '2人', '3-4人', '5人以上'],
                        hint: '这将影响住宿和交通安排',
                    });
                    questions.push({
                        id: `question-${questionId++}`,
                        question: '总预算（人民币）',
                        type: 'number',
                        required: true,
                        placeholder: '例如：100000',
                        hint: '包含机票、住宿、餐饮、活动等所有费用',
                        validation: {
                            min: 100,
                            max: 1000000,
                        },
                    });
                    break;
                case 'MISSING_PREFERENCES':
                    questions.push({
                        id: `question-${questionId++}`,
                        question: '您的主要兴趣（可多选）',
                        type: 'multi_choice',
                        required: false,
                        options: ['极光', '冰川', '温泉', '文化', '美食', '户外运动', '购物', '摄影'],
                        hint: '帮助我们为您推荐合适的景点和活动',
                    });
                    questions.push({
                        id: `question-${questionId++}`,
                        question: '节奏偏好',
                        type: 'single_choice',
                        required: false,
                        options: ['轻松', '平衡', '紧凑'],
                        hint: '轻松：每天安排较少活动；平衡：适中安排；紧凑：尽可能多安排活动',
                        default: '平衡',
                    });
                    break;
            }
        }
        return questions;
    }
    identifyGapsFromRequest(tripPlanRequest) {
        var _a;
        const gaps = [];
        if (!tripPlanRequest.destination || tripPlanRequest.destination === '未指定') {
            gaps.push({
                type: 'MISSING_DESTINATION',
                severity: 'HARD',
                detail: '缺少目的地信息',
            });
        }
        if (!tripPlanRequest.start_date && !tripPlanRequest.date_range) {
            gaps.push({
                type: 'MISSING_DATES',
                severity: 'HARD',
                detail: '缺少出行日期信息',
            });
        }
        if (!((_a = tripPlanRequest.party) === null || _a === void 0 ? void 0 : _a.count) || tripPlanRequest.party.count <= 0) {
            gaps.push({
                type: 'MISSING_CONSTRAINTS',
                severity: 'HARD',
                detail: '缺少同行人数信息',
            });
        }
        return gaps;
    }
    formatClarificationMessage(questions) {
        if (!questions || questions.length === 0) {
            return '';
        }
        const messages = [];
        messages.push('为了更好地规划您的行程，请回答以下问题：\n');
        questions.forEach((q, index) => {
            messages.push(`${index + 1}. ${q.question}`);
            if (q.hint) {
                messages.push(`   ${q.hint}`);
            }
            if (q.options && q.options.length > 0) {
                messages.push(`   选项：${q.options.join('、')}`);
            }
            messages.push('');
        });
        return messages.join('\n');
    }
    buildSuccessResult(state, startTime) {
        const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
        const answerText = hasClarificationQuestions
            ? '为了更好地规划您的行程，请回答以下问题。'
            : (state.itinerary
                ? `已为您生成 ${state.itinerary.days.length} 天的行程安排。`
                : '处理完成。');
        this.logger.log(`[Claude Orchestrator] 构建成功结果: decision_log.length=${state.decision_log.length}, current_step=${state.current_step}`);
        return {
            success: !hasClarificationQuestions,
            result: {
                state,
                itinerary: state.itinerary,
                gate_result: state.gate_result,
                decision_log: state.decision_log,
                ...(hasClarificationQuestions && state.clarification_questions ? {
                    needsUserConfirmation: true,
                    clarificationQuestions: state.clarification_questions,
                    clarificationMessage: this.formatClarificationMessage(state.clarification_questions),
                } : {}),
            },
            answerText,
            stepsExecuted: state.decision_log.map(log => {
                var _a;
                return ({
                    stepId: log.step,
                    success: true,
                    duration: ((_a = log.metadata) === null || _a === void 0 ? void 0 : _a.duration_ms) || 0,
                });
            }),
            totalDuration: Date.now() - startTime,
            decisionLog: state.decision_log,
        };
    }
    buildBlockedResult(state, startTime) {
        var _a;
        const violations = ((_a = state.gate_result) === null || _a === void 0 ? void 0 : _a.violations) || [];
        const answerText = `行程规划被阻止。原因：${violations.map(v => v.detail).join('；')}`;
        const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
        return {
            success: false,
            result: {
                state,
                gate_result: state.gate_result,
                decision_log: state.decision_log,
                ...(hasClarificationQuestions && state.clarification_questions ? {
                    needsUserConfirmation: true,
                    clarificationQuestions: state.clarification_questions,
                    clarificationMessage: this.formatClarificationMessage(state.clarification_questions),
                } : {}),
            },
            answerText,
            stepsExecuted: state.decision_log.map(log => {
                var _a;
                return ({
                    stepId: log.step,
                    success: true,
                    duration: ((_a = log.metadata) === null || _a === void 0 ? void 0 : _a.duration_ms) || 0,
                });
            }),
            totalDuration: Date.now() - startTime,
            decisionLog: state.decision_log,
        };
    }
    buildClarificationResult(state, startTime) {
        const answerText = '为了更好地规划您的行程，请回答以下问题。';
        return {
            success: false,
            result: {
                state,
                needsUserConfirmation: true,
                clarificationQuestions: state.clarification_questions || [],
                clarificationMessage: this.formatClarificationMessage(state.clarification_questions || []),
                gaps: state.gaps,
            },
            answerText,
            stepsExecuted: state.decision_log.map(log => {
                var _a;
                return ({
                    stepId: log.step,
                    success: true,
                    duration: ((_a = log.metadata) === null || _a === void 0 ? void 0 : _a.duration_ms) || 0,
                });
            }),
            totalDuration: Date.now() - startTime,
            decisionLog: state.decision_log,
        };
    }
    buildErrorResult(state, error, startTime) {
        var _a;
        const isTimeout = ((_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.startsWith('TIMEOUT:')) ||
            (error === null || error === void 0 ? void 0 : error.code) === 'ECONNABORTED' ||
            state.current_step === 'TIMEOUT';
        const answerText = isTimeout
            ? `请求超时，已执行到步骤: ${state.current_step}。请缩小范围或稍后重试。`
            : `处理过程中出现错误：${(error === null || error === void 0 ? void 0 : error.message) || '未知错误'}`;
        this.logger.log(`[Claude Orchestrator] 构建错误结果: current_step=${state.current_step}, decision_log.length=${state.decision_log.length}, isTimeout=${isTimeout}`);
        return {
            success: false,
            result: {
                state,
                errors: state.errors,
                errorType: isTimeout ? 'TIMEOUT_ERROR' : undefined,
            },
            answerText,
            stepsExecuted: state.decision_log.map(log => {
                var _a;
                return ({
                    stepId: log.step,
                    success: log.step !== 'FAILED' && log.step !== 'TIMEOUT',
                    duration: ((_a = log.metadata) === null || _a === void 0 ? void 0 : _a.duration_ms) || 0,
                });
            }),
            totalDuration: Date.now() - startTime,
            decisionLog: state.decision_log,
        };
    }
    async fastPathOrchestrate(request, context, deadline, decisionLog, stepsExecuted) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        const extracted = this.extractCommonEntities(request.message);
        decisionLog.push({
            request_id: request.request_id || context.requestId,
            step: 'INTAKE',
            actor: 'Orchestrator',
            inputs_summary: `Fast Path: 提取实体`,
            outputs_summary: `countryCode=${countryCode}, duration=${extracted.durationDays}, budget=${extracted.budget}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
        });
        const skillsPlan = this.buildDefaultSkillsPlanForNewTrip(countryCode, extracted);
        decisionLog.push({
            request_id: request.request_id || context.requestId,
            step: 'INTAKE',
            actor: 'Orchestrator',
            inputs_summary: `Fast Path: 构建Skills计划`,
            outputs_summary: `选择了 ${skillsPlan.selectedSkills.length} 个Skills`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
        });
        const earlyOk = await this.validateSkillsInputsFastPath(skillsPlan, context, request);
        if (!earlyOk.valid) {
            return this.buildFailResult(Date.now(), stepsExecuted, decisionLog, 'MISSING_REQUIRED_PARAM', earlyOk.message || '缺少必需参数', earlyOk.missingParams || [], earlyOk.solutions || []);
        }
        const plan = this.buildExecutionPlanLocally(skillsPlan);
        decisionLog.push({
            request_id: request.request_id || context.requestId,
            step: 'INTAKE',
            actor: 'Orchestrator',
            inputs_summary: `Fast Path: 本地构建执行计划`,
            outputs_summary: `计划包含 ${plan.steps.length} 个步骤，${plan.parallelGroups.length} 个并行组`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
        });
        const execResult = await this.executePlanWithTimeout(plan, context, request, deadline, stepsExecuted, decisionLog);
        const itinerary = execResult.latestItinerary;
        const world = execResult.latestWorld;
        const gateResult = execResult.latestGate;
        return {
            success: execResult.success,
            result: execResult.success
                ? { itinerary, world, gateResult }
                : execResult.failPayload,
            answerText: execResult.answerText,
            stepsExecuted,
            totalDuration: 0,
            decisionLog,
        };
    }
    extractCommonEntities(message) {
        const m = message || '';
        const userIntentTags = [];
        const lower = m.toLowerCase();
        const durMatch = m.match(/(\d+)\s*(天|日|days?)/i);
        const durationDays = durMatch ? Number(durMatch[1]) : undefined;
        let budget;
        const b1 = m.match(/预算\s*([0-9]+)\s*(万|w)?/i);
        if (b1) {
            const n = Number(b1[1]);
            const unit = (b1[2] || '').toLowerCase();
            budget = unit === '万' || unit === 'w' ? n * 10000 : n;
        }
        let seasonMonth;
        const monthMatch = m.match(/(\d{1,2})\s*月/);
        if (monthMatch) {
            const mm = Number(monthMatch[1]);
            if (mm >= 1 && mm <= 12)
                seasonMonth = mm;
        }
        else {
            const monthMap = {
                jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
                apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
                aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
                nov: 11, november: 11, dec: 12, december: 12,
            };
            for (const [k, v] of Object.entries(monthMap)) {
                if (lower.includes(k)) {
                    seasonMonth = v;
                    break;
                }
            }
        }
        if (m.includes('带娃') || m.includes('亲子') || lower.includes('kids') || lower.includes('child')) {
            userIntentTags.push('family');
        }
        if (m.includes('轻松') || m.includes('悠闲') || lower.includes('relax')) {
            userIntentTags.push('relaxed');
        }
        if (m.includes('特种兵') || m.includes('暴走') || lower.includes('intense')) {
            userIntentTags.push('intense');
        }
        if (!userIntentTags.length)
            userIntentTags.push('general');
        const partyProfile = userIntentTags.includes('family')
            ? { pace: 'relaxed', fitness: 'medium', riskTolerance: 'low', mobilityProfile: 'stroller_possible' }
            : undefined;
        return { durationDays, budget, seasonMonth, partyProfile, userIntentTags };
    }
    buildDefaultSkillsPlanForNewTrip(countryCode, extracted) {
        const selectedSkills = [
            {
                skillName: 'world.buildContext',
                reason: '创建新行程需构建 world 上下文',
                priority: 1,
                input: {
                    countryCode,
                    duration: extracted.durationDays,
                    season: extracted.seasonMonth,
                    partyProfile: extracted.partyProfile,
                },
            },
            {
                skillName: 'routeDirection.pickForIntent',
                reason: '根据意图标签选路线方向',
                priority: 2,
                input: {
                    countryCode,
                    userIntentTags: extracted.userIntentTags,
                    season: extracted.seasonMonth,
                },
                dependencies: ['world.buildContext'],
            },
            {
                skillName: 'itinerary.generate',
                reason: '生成结构化行程草案',
                priority: 3,
                input: {
                    world: '${world.buildContext.result.world}',
                    routeDirection: '${routeDirection.pickForIntent.result.routeDirection}',
                    constraints: {
                        budget: extracted.budget,
                        durationDays: extracted.durationDays,
                    },
                    preferences: {
                        userIntentTags: extracted.userIntentTags,
                    },
                },
                dependencies: ['world.buildContext', 'routeDirection.pickForIntent'],
            },
            {
                skillName: 'itinerary.verify',
                reason: '验证开放时间/换乘 buffer/可达性/疲劳阈值（Fast Path 中替代 Gate 检查）',
                priority: 4,
                input: {
                    itinerary: '${itinerary.generate.result.itinerary}',
                },
                dependencies: ['itinerary.generate'],
            },
            {
                skillName: 'repair.apply',
                reason: '如 verify 发现问题则修复',
                priority: 5,
                input: {
                    itinerary: '${itinerary.generate.result.itinerary}',
                    adjustments: '${itinerary.verify.result.fixes}',
                },
                dependencies: ['itinerary.verify', 'itinerary.generate'],
            },
        ];
        const executionOrder = selectedSkills
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((s) => s.skillName);
        const dependencies = {};
        for (const s of selectedSkills) {
            dependencies[s.skillName] = s.dependencies || [];
        }
        return { selectedSkills, executionOrder, dependencies };
    }
    async validateSkillsInputsFastPath(skillsPlan, context, request) {
        var _a, _b;
        if (!this.skillInputValidator) {
            return { valid: true };
        }
        for (const s of skillsPlan.selectedSkills) {
            const input = s.input || {};
            const hasTemplateVars = JSON.stringify(input).includes('${');
            if (hasTemplateVars) {
                continue;
            }
            const skill = (_a = this.skillsRegistry) === null || _a === void 0 ? void 0 : _a.getSkill(s.skillName);
            const metadata = skill === null || skill === void 0 ? void 0 : skill.metadata;
            const res = this.skillInputValidator.validate(s.skillName, input, metadata, {
                context,
                request,
                stepResults: {},
            });
            if (!res.valid) {
                return {
                    valid: false,
                    message: res.clarificationMessage || `技能输入验证失败: ${s.skillName} 缺少 ${(_b = res.missingParams) === null || _b === void 0 ? void 0 : _b.join(', ')}`,
                    missingParams: res.missingParams || [],
                    solutions: res.solutions || [
                        '在消息中补充缺失信息（目的地/天数/预算/人群画像等）',
                        '或在代码中为缺失参数提供默认值/从上下文推断',
                    ],
                };
            }
        }
        return { valid: true };
    }
    buildExecutionPlanLocally(skillsPlan) {
        var _a, _b, _c, _d, _e;
        const nodes = skillsPlan.selectedSkills.map((s) => ({
            skillName: s.skillName,
            deps: (s.dependencies || []).slice(),
            input: s.input || {},
            fallback: this.defaultFallbackForSkill(s.skillName),
        }));
        const inDeg = new Map();
        const out = new Map();
        for (const n of nodes) {
            inDeg.set(n.skillName, 0);
            out.set(n.skillName, []);
        }
        for (const n of nodes) {
            for (const d of n.deps) {
                inDeg.set(n.skillName, ((_a = inDeg.get(n.skillName)) !== null && _a !== void 0 ? _a : 0) + 1);
                (_b = out.get(d)) === null || _b === void 0 ? void 0 : _b.push(n.skillName);
            }
        }
        const queue = [];
        for (const [k, v] of inDeg.entries())
            if (v === 0)
                queue.push(k);
        const order = [];
        while (queue.length) {
            const cur = queue.shift();
            order.push(cur);
            for (const nxt of (_c = out.get(cur)) !== null && _c !== void 0 ? _c : []) {
                inDeg.set(nxt, ((_d = inDeg.get(nxt)) !== null && _d !== void 0 ? _d : 0) - 1);
                if (((_e = inDeg.get(nxt)) !== null && _e !== void 0 ? _e : 0) === 0)
                    queue.push(nxt);
            }
        }
        if (order.length !== nodes.length) {
            const byPriority = skillsPlan.selectedSkills
                .slice()
                .sort((a, b) => a.priority - b.priority)
                .map((s) => s.skillName);
            return this.buildExecutionPlanFromOrder(byPriority, skillsPlan);
        }
        return this.buildExecutionPlanFromOrder(order, skillsPlan);
    }
    buildExecutionPlanFromOrder(order, skillsPlan) {
        var _a, _b, _c, _d, _e;
        const skillByName = new Map(skillsPlan.selectedSkills.map((s) => [s.skillName, s]));
        const steps = [];
        const done = new Set();
        let stepNo = 1;
        while (done.size < order.length) {
            const ready = [];
            for (const name of order) {
                if (done.has(name))
                    continue;
                const deps = ((_b = (_a = skillByName.get(name)) === null || _a === void 0 ? void 0 : _a.dependencies) !== null && _b !== void 0 ? _b : []).filter(Boolean);
                if (deps.every((d) => done.has(d)))
                    ready.push(name);
            }
            if (!ready.length)
                break;
            ready.sort((a, b) => a.localeCompare(b));
            const serial = ready.filter((n) => ['world.buildContext', 'plan.gate.runThreeGuardians'].includes(n));
            const parallel = ready.filter((n) => !serial.includes(n));
            if (serial.length) {
                const n = serial[0];
                const s = skillByName.get(n);
                steps.push({
                    id: `step${stepNo++}`,
                    type: 'skill',
                    skillName: n,
                    dependencies: ((_c = s.dependencies) !== null && _c !== void 0 ? _c : []).map((dep) => this.findStepIdBySkillName(steps, dep)).filter(Boolean),
                    parallel: false,
                    input: s.input,
                    fallback: this.defaultFallbackForSkill(n),
                });
                done.add(n);
                continue;
            }
            for (const n of parallel) {
                const s = skillByName.get(n);
                steps.push({
                    id: `step${stepNo++}`,
                    type: 'skill',
                    skillName: n,
                    dependencies: ((_d = s.dependencies) !== null && _d !== void 0 ? _d : []).map((dep) => this.findStepIdBySkillName(steps, dep)).filter(Boolean),
                    parallel: true,
                    input: s.input,
                    fallback: this.defaultFallbackForSkill(n),
                });
                done.add(n);
            }
        }
        const groupsMap = new Map();
        for (const s of steps) {
            if (!s.parallel)
                continue;
            const key = JSON.stringify(s.dependencies.slice().sort());
            groupsMap.set(key, [...((_e = groupsMap.get(key)) !== null && _e !== void 0 ? _e : []), s.id]);
        }
        const parallelGroups = Array.from(groupsMap.values()).filter((g) => g.length >= 2);
        return {
            steps,
            parallelGroups,
            fallbackStrategy: { onError: 'continue', retryCount: 1 },
        };
    }
    findStepIdBySkillName(steps, skillName) {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].skillName === skillName)
                return steps[i].id;
        }
        return undefined;
    }
    defaultFallbackForSkill(skillName) {
        if (skillName === 'world.buildContext')
            return { onError: 'stop' };
        if (skillName === 'plan.gate.runThreeGuardians')
            return { onError: 'stop' };
        if (skillName === 'itinerary.generate')
            return { onError: 'retry', retryCount: 1 };
        if (skillName === 'itinerary.verify')
            return { onError: 'continue' };
        if (skillName === 'repair.apply')
            return { onError: 'continue' };
        return { onError: 'continue' };
    }
    async executePlanWithTimeout(plan, context, request, deadline, stepsExecuted, decisionLog) {
        var _a, _b, _c, _d, _e, _f, _g;
        const resultsByStepId = {};
        const resultsBySkill = {};
        const stepById = new Map(plan.steps.map((s) => [s.id, s]));
        const depsMet = (step) => step.dependencies.every((d) => resultsByStepId[d] !== undefined);
        const pending = new Set(plan.steps.map((s) => s.id));
        const maxConcurrency = 4;
        while (pending.size) {
            if (deadline.isExpired())
                throw new Error('TIMEOUT: ORCHESTRATION_DEADLINE_EXCEEDED');
            const readyIds = Array.from(pending).filter((id) => depsMet(stepById.get(id)));
            if (!readyIds.length)
                break;
            const serialIds = readyIds.filter((id) => !stepById.get(id).parallel);
            const parallelIds = readyIds.filter((id) => stepById.get(id).parallel);
            if (serialIds.length) {
                const id = serialIds[0];
                const step = stepById.get(id);
                const out = await this.executeOneStepWithTimeout(step, context, request, deadline, resultsByStepId, resultsBySkill, stepsExecuted, decisionLog);
                resultsByStepId[id] = out;
                if (step.skillName)
                    resultsBySkill[step.skillName] = out;
                pending.delete(id);
                continue;
            }
            const batch = parallelIds.slice(0, maxConcurrency);
            const tasks = batch.map((id) => async () => {
                const step = stepById.get(id);
                const out = await this.executeOneStepWithTimeout(step, context, request, deadline, resultsByStepId, resultsBySkill, stepsExecuted, decisionLog);
                return { id, step, out };
            });
            const outs = await (0, orchestration_utils_1.runBounded)(tasks, Math.min(maxConcurrency, batch.length));
            for (const o of outs) {
                resultsByStepId[o.id] = o.out;
                if (o.step.skillName)
                    resultsBySkill[o.step.skillName] = o.out;
                pending.delete(o.id);
            }
        }
        const latestWorld = (_b = (_a = resultsBySkill['world.buildContext']) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.world;
        const latestGate = undefined;
        const verify = (_c = resultsBySkill['itinerary.verify']) === null || _c === void 0 ? void 0 : _c.result;
        const repaired = (_e = (_d = resultsBySkill['repair.apply']) === null || _d === void 0 ? void 0 : _d.result) === null || _e === void 0 ? void 0 : _e.repairedItinerary;
        const generated = (_g = (_f = resultsBySkill['itinerary.generate']) === null || _f === void 0 ? void 0 : _f.result) === null || _g === void 0 ? void 0 : _g.itinerary;
        const itinerary = repaired !== null && repaired !== void 0 ? repaired : generated;
        if (!itinerary) {
            const failedSteps = stepsExecuted.filter(s => !s.success);
            const failedSkillNames = failedSteps.map(s => s.skillName).filter(Boolean);
            let clarificationMessage = '抱歉，无法生成行程规划。';
            let solutions = [];
            let clarificationQuestions = [];
            if (failedSkillNames.includes('world.buildContext')) {
                clarificationMessage = '无法构建目的地信息，请确认目的地名称是否正确。';
                solutions = [
                    '请提供更明确的目的地名称（如：冰岛、Iceland、IS）',
                    '检查目的地是否在我们的支持列表中',
                    '尝试使用国家或主要城市名称',
                ];
                clarificationQuestions = [
                    {
                        id: 'question-destination',
                        question: '请选择您的目的地',
                        type: 'text',
                        required: true,
                        placeholder: '例如：冰岛、日本、瑞士',
                        hint: '这将帮助我们为您推荐合适的景点和活动',
                    },
                ];
            }
            else if (failedSkillNames.includes('routeDirection.pickForIntent')) {
                clarificationMessage = '无法选择适合的路线方向，请提供更多旅行偏好信息。';
                solutions = [
                    '请描述您的旅行风格（如：轻松、紧凑、文化、自然）',
                    '提供更多关于兴趣爱好的信息',
                    '指定旅行季节或月份',
                ];
                clarificationQuestions = [
                    {
                        id: 'question-travel-style',
                        question: '您的旅行风格',
                        type: 'single_choice',
                        required: true,
                        options: ['轻松', '平衡', '紧凑'],
                        hint: '轻松：每天安排较少活动；平衡：适中安排；紧凑：尽可能多安排活动',
                        default: '平衡',
                    },
                    {
                        id: 'question-interests',
                        question: '您的主要兴趣（可多选）',
                        type: 'multi_choice',
                        required: false,
                        options: ['极光', '冰川', '温泉', '文化', '美食', '户外运动', '购物', '摄影'],
                        hint: '帮助我们为您推荐合适的景点和活动',
                    },
                    {
                        id: 'question-season',
                        question: '旅行月份',
                        type: 'single_choice',
                        required: false,
                        options: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
                        hint: '选择旅行月份有助于推荐合适的活动和景点',
                    },
                ];
            }
            else if (failedSkillNames.includes('itinerary.generate')) {
                clarificationMessage = '无法生成行程，可能是信息不足或目的地数据不完整。';
                solutions = [
                    '请提供更详细的行程需求（天数、预算、旅行者信息）',
                    '尝试调整预算或天数范围',
                    '检查目的地是否在我们的数据库中',
                    '稍后重试，系统可能正在更新数据',
                ];
                clarificationQuestions = [
                    {
                        id: 'question-duration',
                        question: '旅行天数',
                        type: 'number',
                        required: true,
                        placeholder: '例如：5',
                        hint: '请输入您计划的旅行天数',
                        validation: {
                            min: 1,
                            max: 30,
                        },
                    },
                    {
                        id: 'question-budget',
                        question: '总预算（人民币）',
                        type: 'number',
                        required: true,
                        placeholder: '例如：20000',
                        hint: '包含机票、住宿、餐饮、活动等所有费用',
                        validation: {
                            min: 1000,
                            max: 1000000,
                        },
                    },
                ];
            }
            else if (failedSkillNames.includes('itinerary.verify')) {
                clarificationMessage = '生成的行程存在可行性问题，系统正在尝试修复。';
                solutions = [
                    '请稍等，系统正在自动修复行程',
                    '如果问题持续，请调整行程天数或节奏',
                    '尝试提供更宽松的时间安排',
                ];
            }
            else if (failedSteps.length > 0) {
                clarificationMessage = '行程生成过程中遇到问题，请检查输入信息或稍后重试。';
                solutions = [
                    '检查输入信息是否完整（目的地、天数、预算）',
                    '确认目的地名称正确',
                    '稍后重试',
                    '如果问题持续，请联系客服',
                ];
            }
            else {
                clarificationMessage = '无法生成行程，请提供更详细的行程需求。';
                solutions = [
                    '请包含以下信息：目的地、旅行天数、预算范围',
                    '描述旅行偏好（如：带娃、轻松、紧凑）',
                    '指定旅行时间（月份或日期）',
                ];
                clarificationQuestions = [
                    {
                        id: 'question-destination',
                        question: '请选择您的目的地',
                        type: 'text',
                        required: true,
                        placeholder: '例如：冰岛、日本、瑞士',
                        hint: '这将帮助我们为您推荐合适的景点和活动',
                    },
                    {
                        id: 'question-duration',
                        question: '旅行天数',
                        type: 'number',
                        required: true,
                        placeholder: '例如：5',
                        hint: '请输入您计划的旅行天数',
                        validation: {
                            min: 1,
                            max: 30,
                        },
                    },
                    {
                        id: 'question-budget',
                        question: '总预算（人民币）',
                        type: 'number',
                        required: true,
                        placeholder: '例如：20000',
                        hint: '包含机票、住宿、餐饮、活动等所有费用',
                        validation: {
                            min: 1000,
                            max: 1000000,
                        },
                    },
                ];
            }
            return {
                success: false,
                latestWorld,
                latestGate,
                latestItinerary: undefined,
                answerText: clarificationMessage,
                failPayload: {
                    needsUserConfirmation: true,
                    clarificationMessage,
                    clarificationQuestions: clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
                    errorType: error_types_interface_1.ErrorType.UNKNOWN_ERROR,
                    missingParams: [],
                    solutions,
                },
            };
        }
        const answerText = (verify === null || verify === void 0 ? void 0 : verify.valid) === false
            ? '已生成行程，但发现部分可行性问题并尝试修复。'
            : '行程已生成并通过验证。';
        return {
            success: true,
            latestWorld,
            latestGate,
            latestItinerary: itinerary,
            answerText,
            failPayload: {},
        };
    }
    async executeOneStepWithTimeout(step, context, request, deadline, resultsByStepId, resultsBySkill, stepsExecuted, decisionLog) {
        var _a, _b, _c, _d;
        const started = Date.now();
        const skillName = step.skillName;
        const skill = (_a = this.skillsRegistry) === null || _a === void 0 ? void 0 : _a.getSkill(skillName);
        if (!skill) {
            const err = `Missing skill: ${skillName}`;
            stepsExecuted.push({ stepId: step.id, skillName, success: false, error: err, duration: Date.now() - started });
            throw new Error(err);
        }
        const preparedInput = this.prepareSkillInputWithTemplate((_b = step.input) !== null && _b !== void 0 ? _b : {}, resultsByStepId, resultsBySkill, context, request);
        if (skillName === 'world.buildContext') {
            const cacheKey = this.worldCacheKey(preparedInput);
            const cached = this.worldCache.get(cacheKey);
            if (cached) {
                const duration = Date.now() - started;
                stepsExecuted.push({ stepId: step.id, skillName, success: true, result: cached, duration });
                decisionLog.push({
                    request_id: request.request_id || context.requestId,
                    step: 'RESEARCH',
                    actor: 'Orchestrator',
                    inputs_summary: `缓存命中: ${skillName}`,
                    outputs_summary: `cacheKey: ${cacheKey}`,
                    evidence_refs: [],
                    timestamp: new Date().toISOString(),
                });
                return cached;
            }
        }
        const timeoutMs = this.skillTimeoutMs(skillName, deadline);
        const fallback = (_c = step.fallback) !== null && _c !== void 0 ? _c : { onError: 'continue', retryCount: 0 };
        const retryCount = fallback.onError === 'retry' ? Math.max(0, (_d = fallback.retryCount) !== null && _d !== void 0 ? _d : 0) : 0;
        let lastErr;
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const out = await (0, orchestration_utils_1.withTimeout)(skill.execute(preparedInput), timeoutMs, `SKILL:${skillName}`);
                const duration = Date.now() - started;
                stepsExecuted.push({ stepId: step.id, skillName, success: true, result: out, duration });
                if (skillName === 'world.buildContext') {
                    const cacheKey = this.worldCacheKey(preparedInput);
                    this.worldCache.set(cacheKey, out);
                }
                return out;
            }
            catch (e) {
                lastErr = e;
                if (attempt < retryCount)
                    continue;
                const duration = Date.now() - started;
                stepsExecuted.push({ stepId: step.id, skillName, success: false, error: (e === null || e === void 0 ? void 0 : e.message) || String(e), duration });
                if (fallback.onError === 'stop')
                    throw e;
                return { error: (e === null || e === void 0 ? void 0 : e.message) || String(e) };
            }
        }
        throw lastErr;
    }
    prepareSkillInputWithTemplate(input, _resultsByStepId, resultsBySkill, _ctx, _req) {
        if (input === null || input === undefined)
            return input;
        if (typeof input === 'string')
            return this.resolveTemplateString(input, resultsBySkill);
        if (Array.isArray(input))
            return input.map((x) => this.prepareSkillInputWithTemplate(x, _resultsByStepId, resultsBySkill, _ctx, _req));
        if (typeof input === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(input)) {
                out[k] = this.prepareSkillInputWithTemplate(v, _resultsByStepId, resultsBySkill, _ctx, _req);
            }
            return out;
        }
        return input;
    }
    resolveTemplateString(s, resultsBySkill) {
        const m = s.match(/^\$\{([a-zA-Z0-9_.-]+)\}$/);
        if (!m)
            return s;
        const path = m[1];
        const parts = path.split('.');
        const skillName = `${parts[0]}.${parts[1]}`;
        const rest = parts.slice(2);
        const root = resultsBySkill[skillName];
        if (!root)
            return undefined;
        let cur = root;
        for (const p of rest) {
            if (cur == null)
                return undefined;
            cur = cur[p];
        }
        return cur;
    }
    worldCacheKey(input) {
        const stable = {
            countryCode: input === null || input === void 0 ? void 0 : input.countryCode,
            season: input === null || input === void 0 ? void 0 : input.season,
            duration: input === null || input === void 0 ? void 0 : input.duration,
            partyProfile: input === null || input === void 0 ? void 0 : input.partyProfile,
        };
        return `world:${JSON.stringify(stable)}`;
    }
    skillTimeoutMs(skillName, deadline) {
        const remaining = deadline.remainingMs();
        if (skillName === 'world.buildContext')
            return deadline.clampTimeoutMs(Math.min(1800, remaining * 0.25));
        if (skillName === 'routeDirection.pickForIntent')
            return deadline.clampTimeoutMs(900);
        if (skillName === 'plan.gate.runThreeGuardians')
            return deadline.clampTimeoutMs(1400);
        if (skillName === 'itinerary.generate')
            return deadline.clampTimeoutMs(Math.min(3000, remaining * 0.45));
        if (skillName === 'itinerary.verify')
            return deadline.clampTimeoutMs(1800);
        if (skillName === 'repair.apply')
            return deadline.clampTimeoutMs(1400);
        return deadline.clampTimeoutMs(1200);
    }
    async collectWorldModelData(tripRequest, researchData, evidenceRefs) {
        var _a;
        this.logger.debug(`[Orchestrator] Collecting world model data via Domain Agents`);
        const promises = [];
        if (this.geoAgent && typeof tripRequest.destination === 'object') {
            const coords = tripRequest.destination;
            promises.push(this.geoAgent.analyzeTerrain([{ lat: coords.lat, lng: coords.lng }])
                .then(r => { researchData.geo_terrain = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
                .catch(e => this.logger.warn(`[GeoAgent] Failed: ${e === null || e === void 0 ? void 0 : e.message}`)));
        }
        if (this.weatherAgent && typeof tripRequest.destination === 'object' && tripRequest.date_range) {
            const coords = tripRequest.destination;
            promises.push(this.weatherAgent.getForecast({ lat: coords.lat, lng: coords.lng }, { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date }).then(r => { researchData.weather_forecast = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
                .catch(e => this.logger.warn(`[WeatherAgent] Failed: ${e === null || e === void 0 ? void 0 : e.message}`)));
        }
        if (this.costAgent && tripRequest.destination && tripRequest.date_range) {
            const dest = typeof tripRequest.destination === 'string' ? tripRequest.destination : 'destination';
            promises.push(this.costAgent.estimateTripCost(dest, { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date }, ((_a = tripRequest.party) === null || _a === void 0 ? void 0 : _a.count) || 2).then(r => { researchData.cost_estimate = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
                .catch(e => this.logger.warn(`[CostAgent] Failed: ${e === null || e === void 0 ? void 0 : e.message}`)));
        }
        await Promise.all(promises);
    }
    buildFailResult(started, stepsExecuted, decisionLog, errorType, message, missingParams, solutions) {
        let userFriendlyMessage = message;
        if (message.includes('itinerary') || message.includes('PlanState') || message.includes('skill')) {
            userFriendlyMessage = '无法完成行程规划，请检查输入信息或稍后重试。';
        }
        const finalSolutions = solutions.length > 0 ? solutions : [
            '检查输入信息是否完整（目的地、天数、预算）',
            '确认目的地名称正确',
            '稍后重试',
        ];
        return {
            success: false,
            result: {
                needsUserConfirmation: true,
                clarificationMessage: userFriendlyMessage,
                errorType: errorType,
                missingParams,
                solutions: finalSolutions,
            },
            answerText: userFriendlyMessage,
            stepsExecuted,
            totalDuration: Date.now() - started,
            decisionLog,
        };
    }
};
exports.ClaudeOrchestratorService = ClaudeOrchestratorService;
exports.ClaudeOrchestratorService = ClaudeOrchestratorService = ClaudeOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(skills_registry_token_1.SKILLS_REGISTRY_TOKEN)),
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
    __param(15, (0, common_1.Optional)()),
    __param(16, (0, common_1.Optional)()),
    __param(17, (0, common_1.Optional)()),
    __param(18, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        skills_registry_service_1.SkillsRegistryService,
        action_registry_service_1.ActionRegistryService,
        planner_agent_service_1.ClaudePlannerAgentService,
        gatekeeper_agent_service_1.ClaudeGatekeeperAgentService,
        compliance_agent_service_1.ClaudeComplianceAgentService,
        local_insight_agent_service_1.ClaudeLocalInsightAgentService,
        core_decision_agent_service_1.ClaudeCoreDecisionAgentService,
        narrator_agent_service_1.ClaudeNarratorAgentService,
        skill_input_validator_service_1.SkillInputValidatorService,
        hallucination_detection_service_1.HallucinationDetectionService,
        trajectory_collection_service_1.TrajectoryCollectionService,
        readiness_service_1.ReadinessService,
        user_decision_service_1.UserDecisionService,
        decision_draft_generator_service_1.DecisionDraftGeneratorService,
        geo_agent_service_1.GeoAgentService,
        weather_agent_service_1.WeatherAgentService,
        cost_agent_service_1.CostAgentService,
        experience_agent_service_1.ExperienceAgentService])
], ClaudeOrchestratorService);
//# sourceMappingURL=claude-orchestrator.service.js.map