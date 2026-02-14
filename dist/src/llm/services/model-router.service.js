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
var ModelRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRouterService = exports.TaskComplexity = exports.RoutingStrategy = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const llm_request_dto_1 = require("../dto/llm-request.dto");
var RoutingStrategy;
(function (RoutingStrategy) {
    RoutingStrategy["VLLM_FIRST"] = "vllm_first";
    RoutingStrategy["API_FIRST"] = "api_first";
    RoutingStrategy["AUTO"] = "auto";
    RoutingStrategy["FIXED"] = "fixed";
})(RoutingStrategy || (exports.RoutingStrategy = RoutingStrategy = {}));
var TaskComplexity;
(function (TaskComplexity) {
    TaskComplexity["SIMPLE"] = "simple";
    TaskComplexity["MEDIUM"] = "medium";
    TaskComplexity["COMPLEX"] = "complex";
})(TaskComplexity || (exports.TaskComplexity = TaskComplexity = {}));
let ModelRouterService = ModelRouterService_1 = class ModelRouterService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(ModelRouterService_1.name);
        this.vllmAvailable = false;
        this.modelInfoMap = new Map();
        const strategyConfig = this.configService.get('LLM_ROUTING_STRATEGY') || 'auto';
        this.strategy = this.parseStrategy(strategyConfig);
        const fixedProviderConfig = this.configService.get('LLM_FIXED_PROVIDER') || 'deepseek';
        this.fixedProvider = this.parseProvider(fixedProviderConfig);
        this.initModelInfo();
    }
    async onModuleInit() {
        this.logger.log(`ModelRouterService initialized, strategy: ${this.strategy}`);
        await this.checkVllmAvailability();
    }
    initModelInfo() {
        this.modelInfoMap.set(llm_request_dto_1.LlmProvider.VLLM, {
            provider: llm_request_dto_1.LlmProvider.VLLM,
            model: 'Qwen/Qwen2.5-7B-Instruct',
            costPer1kTokens: 0.1,
            avgLatencyMs: 300,
            maxContextLength: 8192,
            supportsFunctionCalling: true,
            supportsStructuredOutput: true,
            reasoningScore: 7,
            available: false,
        });
        this.modelInfoMap.set(llm_request_dto_1.LlmProvider.DEEPSEEK, {
            provider: llm_request_dto_1.LlmProvider.DEEPSEEK,
            model: 'deepseek-chat',
            costPer1kTokens: 0.14,
            avgLatencyMs: 800,
            maxContextLength: 32768,
            supportsFunctionCalling: true,
            supportsStructuredOutput: true,
            reasoningScore: 8,
            available: !!this.configService.get('DEEPSEEK_API_KEY'),
        });
        this.modelInfoMap.set(llm_request_dto_1.LlmProvider.OPENAI, {
            provider: llm_request_dto_1.LlmProvider.OPENAI,
            model: 'gpt-4o',
            costPer1kTokens: 5.0,
            avgLatencyMs: 1500,
            maxContextLength: 128000,
            supportsFunctionCalling: true,
            supportsStructuredOutput: true,
            reasoningScore: 9,
            available: !!this.configService.get('OPENAI_API_KEY'),
        });
        this.modelInfoMap.set(llm_request_dto_1.LlmProvider.ANTHROPIC, {
            provider: llm_request_dto_1.LlmProvider.ANTHROPIC,
            model: 'claude-3-5-sonnet-20241022',
            costPer1kTokens: 3.0,
            avgLatencyMs: 2000,
            maxContextLength: 200000,
            supportsFunctionCalling: true,
            supportsStructuredOutput: true,
            reasoningScore: 9,
            available: !!this.configService.get('ANTHROPIC_API_KEY'),
        });
        this.modelInfoMap.set(llm_request_dto_1.LlmProvider.GEMINI, {
            provider: llm_request_dto_1.LlmProvider.GEMINI,
            model: 'gemini-pro',
            costPer1kTokens: 0.5,
            avgLatencyMs: 1000,
            maxContextLength: 32768,
            supportsFunctionCalling: true,
            supportsStructuredOutput: true,
            reasoningScore: 7,
            available: !!this.configService.get('GEMINI_API_KEY'),
        });
    }
    parseStrategy(config) {
        const map = {
            'vllm_first': RoutingStrategy.VLLM_FIRST,
            'api_first': RoutingStrategy.API_FIRST,
            'auto': RoutingStrategy.AUTO,
            'fixed': RoutingStrategy.FIXED,
        };
        return map[config.toLowerCase()] || RoutingStrategy.AUTO;
    }
    parseProvider(config) {
        const map = {
            'openai': llm_request_dto_1.LlmProvider.OPENAI,
            'gemini': llm_request_dto_1.LlmProvider.GEMINI,
            'deepseek': llm_request_dto_1.LlmProvider.DEEPSEEK,
            'anthropic': llm_request_dto_1.LlmProvider.ANTHROPIC,
            'vllm': llm_request_dto_1.LlmProvider.VLLM,
        };
        return map[config.toLowerCase()] || llm_request_dto_1.LlmProvider.DEEPSEEK;
    }
    async checkVllmAvailability() {
        const vllmUrl = this.configService.get('VLLM_URL') || 'http://localhost:8080';
        try {
            const response = await fetch(`${vllmUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });
            this.vllmAvailable = response.ok;
            const vllmInfo = this.modelInfoMap.get(llm_request_dto_1.LlmProvider.VLLM);
            if (vllmInfo) {
                vllmInfo.available = this.vllmAvailable;
            }
            if (this.vllmAvailable) {
                this.logger.log('vLLM service is available');
            }
            else {
                this.logger.warn('vLLM service is not available');
            }
        }
        catch (error) {
            this.vllmAvailable = false;
            this.logger.warn(`vLLM health check failed: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
        }
    }
    async route(request) {
        if (request.preferredProvider) {
            return this.createDecision(request.preferredProvider, 'User specified provider');
        }
        switch (this.strategy) {
            case RoutingStrategy.VLLM_FIRST:
                return this.routeVllmFirst(request);
            case RoutingStrategy.API_FIRST:
                return this.routeApiFirst(request);
            case RoutingStrategy.FIXED:
                return this.createDecision(this.fixedProvider, 'Fixed provider strategy');
            case RoutingStrategy.AUTO:
            default:
                return this.routeAuto(request);
        }
    }
    async routeVllmFirst(request) {
        if (this.vllmAvailable) {
            return this.createDecision(llm_request_dto_1.LlmProvider.VLLM, 'vLLM first strategy', llm_request_dto_1.LlmProvider.DEEPSEEK);
        }
        return this.createDecision(llm_request_dto_1.LlmProvider.DEEPSEEK, 'vLLM not available, fallback to DeepSeek');
    }
    async routeApiFirst(request) {
        const providers = [
            llm_request_dto_1.LlmProvider.ANTHROPIC,
            llm_request_dto_1.LlmProvider.OPENAI,
            llm_request_dto_1.LlmProvider.DEEPSEEK,
            llm_request_dto_1.LlmProvider.GEMINI,
        ];
        for (const provider of providers) {
            const info = this.modelInfoMap.get(provider);
            if (info === null || info === void 0 ? void 0 : info.available) {
                return this.createDecision(provider, 'API first strategy', llm_request_dto_1.LlmProvider.VLLM);
            }
        }
        if (this.vllmAvailable) {
            return this.createDecision(llm_request_dto_1.LlmProvider.VLLM, 'All APIs unavailable, fallback to vLLM');
        }
        return this.createDecision(llm_request_dto_1.LlmProvider.DEEPSEEK, 'Fallback to DeepSeek');
    }
    async routeAuto(request) {
        const complexity = request.complexity || this.inferComplexity(request);
        if (complexity === TaskComplexity.SIMPLE && this.vllmAvailable) {
            return this.createDecision(llm_request_dto_1.LlmProvider.VLLM, 'Simple task, using vLLM for speed', llm_request_dto_1.LlmProvider.DEEPSEEK);
        }
        if (complexity === TaskComplexity.MEDIUM) {
            const deepseekInfo = this.modelInfoMap.get(llm_request_dto_1.LlmProvider.DEEPSEEK);
            if (deepseekInfo === null || deepseekInfo === void 0 ? void 0 : deepseekInfo.available) {
                return this.createDecision(llm_request_dto_1.LlmProvider.DEEPSEEK, 'Medium task, using DeepSeek for balance', llm_request_dto_1.LlmProvider.VLLM);
            }
        }
        if (complexity === TaskComplexity.COMPLEX) {
            const anthropicInfo = this.modelInfoMap.get(llm_request_dto_1.LlmProvider.ANTHROPIC);
            if (anthropicInfo === null || anthropicInfo === void 0 ? void 0 : anthropicInfo.available) {
                return this.createDecision(llm_request_dto_1.LlmProvider.ANTHROPIC, 'Complex task, using Claude for quality', llm_request_dto_1.LlmProvider.OPENAI);
            }
            const openaiInfo = this.modelInfoMap.get(llm_request_dto_1.LlmProvider.OPENAI);
            if (openaiInfo === null || openaiInfo === void 0 ? void 0 : openaiInfo.available) {
                return this.createDecision(llm_request_dto_1.LlmProvider.OPENAI, 'Complex task, using GPT-4 for quality', llm_request_dto_1.LlmProvider.DEEPSEEK);
            }
        }
        if (request.maxLatencyMs && request.maxLatencyMs < 500 && this.vllmAvailable) {
            return this.createDecision(llm_request_dto_1.LlmProvider.VLLM, 'Low latency requirement, using vLLM', llm_request_dto_1.LlmProvider.DEEPSEEK);
        }
        if (request.maxCostCents && request.maxCostCents < 1 && this.vllmAvailable) {
            return this.createDecision(llm_request_dto_1.LlmProvider.VLLM, 'Low cost requirement, using vLLM', llm_request_dto_1.LlmProvider.DEEPSEEK);
        }
        if (this.vllmAvailable) {
            return this.createDecision(llm_request_dto_1.LlmProvider.VLLM, 'Default to vLLM', llm_request_dto_1.LlmProvider.DEEPSEEK);
        }
        return this.createDecision(llm_request_dto_1.LlmProvider.DEEPSEEK, 'Default to DeepSeek');
    }
    inferComplexity(request) {
        if (request.inputLength) {
            if (request.inputLength > 4000)
                return TaskComplexity.COMPLEX;
            if (request.inputLength > 1000)
                return TaskComplexity.MEDIUM;
        }
        const complexTasks = ['planning', 'decision', 'analysis', 'what-if'];
        const mediumTasks = ['summarize', 'extract', 'translate', 'explain'];
        if (complexTasks.some(t => request.taskType.toLowerCase().includes(t))) {
            return TaskComplexity.COMPLEX;
        }
        if (mediumTasks.some(t => request.taskType.toLowerCase().includes(t))) {
            return TaskComplexity.MEDIUM;
        }
        if (request.functionCalling) {
            return TaskComplexity.MEDIUM;
        }
        return TaskComplexity.SIMPLE;
    }
    createDecision(provider, reason, fallbackProvider) {
        const modelInfo = this.modelInfoMap.get(provider);
        return {
            provider,
            model: (modelInfo === null || modelInfo === void 0 ? void 0 : modelInfo.model) || 'unknown',
            loraAdapter: provider === llm_request_dto_1.LlmProvider.VLLM ? 'tripnara-decision' : undefined,
            reason,
            fallbackProvider,
        };
    }
    getModelInfo(provider) {
        return this.modelInfoMap.get(provider);
    }
    getAvailableModels() {
        return Array.from(this.modelInfoMap.values()).filter(m => m.available);
    }
    setVllmAvailable(available) {
        this.vllmAvailable = available;
        const vllmInfo = this.modelInfoMap.get(llm_request_dto_1.LlmProvider.VLLM);
        if (vllmInfo) {
            vllmInfo.available = available;
        }
    }
    getStrategy() {
        return this.strategy;
    }
    setStrategy(strategy) {
        this.strategy = strategy;
        this.logger.log(`Routing strategy changed to: ${strategy}`);
    }
};
exports.ModelRouterService = ModelRouterService;
exports.ModelRouterService = ModelRouterService = ModelRouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ModelRouterService);
//# sourceMappingURL=model-router.service.js.map