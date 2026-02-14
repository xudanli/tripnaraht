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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const llm_service_1 = require("./services/llm.service");
const llm_request_dto_1 = require("./dto/llm-request.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const token_stats_service_1 = require("../agent/services/token-stats.service");
const llm_cost_service_1 = require("./services/llm-cost.service");
const python_ai_service_1 = require("./services/python-ai.service");
let LlmController = class LlmController {
    constructor(llmService, tokenStatsService, llmCostService, pythonAIService) {
        this.llmService = llmService;
        this.tokenStatsService = tokenStatsService;
        this.llmCostService = llmCostService;
        this.pythonAIService = pythonAIService;
    }
    async naturalLanguageToParams(dto) {
        try {
            const result = await this.llmService.naturalLanguageToTripParams(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async humanizeResult(dto) {
        try {
            const result = await this.llmService.humanizeResult(dto);
            return (0, standard_response_dto_1.successResponse)({ description: result });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async decisionSupport(dto) {
        try {
            const result = await this.llmService.provideDecisionSupport(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getModels() {
        try {
            const models = [
                {
                    provider: llm_request_dto_1.LlmProvider.OPENAI,
                    models: [
                        { name: 'gpt-4-turbo', label: 'GPT-4 Turbo', available: !!process.env.OPENAI_API_KEY },
                        { name: 'gpt-4o', label: 'GPT-4o', available: !!process.env.OPENAI_API_KEY },
                        { name: 'gpt-4o-mini', label: 'GPT-4o Mini', available: !!process.env.OPENAI_API_KEY },
                        { name: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', available: !!process.env.OPENAI_API_KEY },
                    ],
                },
                {
                    provider: llm_request_dto_1.LlmProvider.ANTHROPIC,
                    models: [
                        { name: 'claude-3-opus-20240229', label: 'Claude 3 Opus', available: !!process.env.ANTHROPIC_API_KEY },
                        { name: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', available: !!process.env.ANTHROPIC_API_KEY },
                        { name: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', available: !!process.env.ANTHROPIC_API_KEY },
                    ],
                },
                {
                    provider: llm_request_dto_1.LlmProvider.DEEPSEEK,
                    models: [
                        { name: 'deepseek-chat', label: 'DeepSeek Chat', available: !!process.env.DEEPSEEK_API_KEY },
                        { name: 'deepseek-coder', label: 'DeepSeek Coder', available: !!process.env.DEEPSEEK_API_KEY },
                    ],
                },
                {
                    provider: llm_request_dto_1.LlmProvider.GEMINI,
                    models: [
                        { name: 'gemini-pro', label: 'Gemini Pro', available: !!process.env.GEMINI_API_KEY },
                        { name: 'gemini-pro-vision', label: 'Gemini Pro Vision', available: !!process.env.GEMINI_API_KEY },
                    ],
                },
            ];
            const defaultProvider = this.llmService.getDefaultProvider();
            return (0, standard_response_dto_1.successResponse)({
                models,
                defaultProvider,
                totalModels: models.reduce((sum, p) => sum + p.models.length, 0),
                availableModels: models.reduce((sum, p) => sum + p.models.filter((m) => m.available).length, 0),
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getUsage(subAgent, provider, startTime, endTime) {
        try {
            const timeRange = startTime && endTime
                ? { start: new Date(startTime), end: new Date(endTime) }
                : undefined;
            let stats = {};
            if (subAgent) {
                const subAgentStats = await this.tokenStatsService.getSubAgentStats(subAgent, timeRange);
                stats.subAgent = subAgentStats;
            }
            else if (provider) {
                const providerStats = await this.tokenStatsService.getProviderStats(provider, timeRange);
                stats.provider = providerStats;
            }
            else {
                const allRecords = this.tokenStatsService.getAllRecords();
                const filteredRecords = timeRange
                    ? allRecords.filter((r) => new Date(r.timestamp) >= timeRange.start &&
                        new Date(r.timestamp) <= timeRange.end)
                    : allRecords;
                const totalTokens = filteredRecords.reduce((sum, r) => sum + r.total_tokens, 0);
                const totalPromptTokens = filteredRecords.reduce((sum, r) => sum + r.prompt_tokens, 0);
                const totalCompletionTokens = filteredRecords.reduce((sum, r) => sum + r.completion_tokens, 0);
                const totalCalls = filteredRecords.length;
                const successfulCalls = filteredRecords.filter((r) => r.success).length;
                stats = {
                    totalTokens,
                    totalPromptTokens,
                    totalCompletionTokens,
                    totalCalls,
                    successfulCalls,
                    failedCalls: totalCalls - successfulCalls,
                    successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
                    avgTokensPerCall: totalCalls > 0 ? totalTokens / totalCalls : 0,
                    timeRange: timeRange
                        ? {
                            start: timeRange.start.toISOString(),
                            end: timeRange.end.toISOString(),
                        }
                        : undefined,
                };
            }
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getCost(subAgent, provider, startTime, endTime) {
        try {
            const timeRange = startTime && endTime
                ? { start: new Date(startTime), end: new Date(endTime) }
                : undefined;
            const costStats = await this.llmCostService.getCostStats({
                subAgent: subAgent,
                provider,
                timeRange,
            });
            return (0, standard_response_dto_1.successResponse)(costStats);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPythonAIStatus() {
        try {
            if (!this.pythonAIService) {
                return (0, standard_response_dto_1.successResponse)({
                    enabled: false,
                    message: 'Python AI Service is not available',
                });
            }
            const status = this.pythonAIService.getServiceStatus();
            let healthCheck = null;
            try {
                healthCheck = await this.pythonAIService.checkHealth();
            }
            catch (error) {
                healthCheck = {
                    error: error.message,
                    available: false,
                };
            }
            return (0, standard_response_dto_1.successResponse)({
                ...status,
                healthCheck,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.LlmController = LlmController;
__decorate([
    (0, common_1.Post)('natural-language-to-params'),
    (0, swagger_1.ApiOperation)({
        summary: '自然语言转接口参数',
        description: '将用户的口语化需求转换为创建行程的接口参数。例如："帮我规划带娃去东京5天的行程，预算2万"',
    }),
    (0, swagger_1.ApiBody)({ type: llm_request_dto_1.NaturalLanguageToParamsDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功转换参数（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [llm_request_dto_1.NaturalLanguageToParamsDto]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "naturalLanguageToParams", null);
__decorate([
    (0, common_1.Post)('humanize-result'),
    (0, swagger_1.ApiOperation)({
        summary: '结果人性化转化',
        description: '将接口返回的结构化数据转化为自然语言描述，让用户更容易理解。',
    }),
    (0, swagger_1.ApiBody)({ type: llm_request_dto_1.HumanizeResultDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功转化结果（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [llm_request_dto_1.HumanizeResultDto]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "humanizeResult", null);
__decorate([
    (0, common_1.Post)('decision-support'),
    (0, swagger_1.ApiOperation)({
        summary: '决策支持',
        description: '基于接口数据提供智能决策建议，如 What-If 评估、多方案对比等。',
    }),
    (0, swagger_1.ApiBody)({ type: llm_request_dto_1.DecisionSupportDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回决策建议（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [llm_request_dto_1.DecisionSupportDto]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "decisionSupport", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({
        summary: '获取可用模型列表',
        description: '获取系统中可用的 LLM 模型列表，包括提供商、模型名称、状态等信息',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回模型列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "getModels", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('usage'),
    (0, swagger_1.ApiOperation)({
        summary: 'Token 使用统计',
        description: '获取 LLM Token 使用统计信息，包括按 Sub-Agent、任务类型、提供商等维度的统计',
    }),
    (0, swagger_1.ApiQuery)({ name: 'subAgent', required: false, description: 'Sub-Agent 类型' }),
    (0, swagger_1.ApiQuery)({ name: 'provider', required: false, enum: llm_request_dto_1.LlmProvider, description: 'LLM 提供商' }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Token 使用统计（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('subAgent')),
    __param(1, (0, common_1.Query)('provider')),
    __param(2, (0, common_1.Query)('startTime')),
    __param(3, (0, common_1.Query)('endTime')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "getUsage", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('cost'),
    (0, swagger_1.ApiOperation)({
        summary: '成本统计',
        description: '获取 LLM 调用成本统计信息，包括总成本、按提供商/Sub-Agent 的成本分布等',
    }),
    (0, swagger_1.ApiQuery)({ name: 'subAgent', required: false, description: 'Sub-Agent 类型' }),
    (0, swagger_1.ApiQuery)({ name: 'provider', required: false, enum: llm_request_dto_1.LlmProvider, description: 'LLM 提供商' }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回成本统计（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('subAgent')),
    __param(1, (0, common_1.Query)('provider')),
    __param(2, (0, common_1.Query)('startTime')),
    __param(3, (0, common_1.Query)('endTime')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "getCost", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('python-ai/status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Python AI Service 状态',
        description: '获取 Python AI Service 的连接状态、健康状态、熔断器状态等信息',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回服务状态（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "getPythonAIStatus", null);
exports.LlmController = LlmController = __decorate([
    (0, swagger_1.ApiTags)('llm'),
    (0, common_1.Controller)('llm'),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        token_stats_service_1.TokenStatsService,
        llm_cost_service_1.LlmCostService,
        python_ai_service_1.PythonAIService])
], LlmController);
//# sourceMappingURL=llm.controller.js.map