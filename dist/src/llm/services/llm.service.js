"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var LlmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const node_dns_1 = __importDefault(require("node:dns"));
const https_proxy_agent_1 = require("https-proxy-agent");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const llm_request_dto_1 = require("../dto/llm-request.dto");
const openai_http_factory_1 = require("../utils/openai-http.factory");
const retry_with_backoff_1 = require("../utils/retry-with-backoff");
const circuit_breaker_1 = require("../utils/circuit-breaker");
let LlmService = LlmService_1 = class LlmService {
    constructor(configService) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.configService = configService;
        this.logger = new common_1.Logger(LlmService_1.name);
        node_dns_1.default.setDefaultResultOrder('ipv4first');
        const disableProxy = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('LLM_DISABLE_PROXY')) === 'true' ||
            process.env.LLM_DISABLE_PROXY === 'true';
        const proxyUrl = disableProxy
            ? undefined
            : (((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('HTTPS_PROXY')) ||
                ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('https_proxy')) ||
                ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('ALL_PROXY')) ||
                process.env.HTTPS_PROXY ||
                process.env.https_proxy ||
                process.env.ALL_PROXY ||
                process.env.all_proxy);
        if (proxyUrl) {
            this.logger.log(`[LLM] 使用代理: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`);
        }
        else if (disableProxy) {
            this.logger.debug(`[LLM] 代理已禁用（LLM_DISABLE_PROXY=true）`);
        }
        else {
            this.logger.debug(`[LLM] 未配置代理环境变量`);
        }
        this.httpsAgent = proxyUrl
            ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
            : new https_1.default.Agent({
                keepAlive: true,
                family: 4,
            });
        const baseUrl = ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('OPENAI_BASE_URL')) || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        this.openaiHttp = (0, openai_http_factory_1.createOpenAIHttp)(baseUrl, this.logger, { disableProxy });
        this.circuitBreaker = new circuit_breaker_1.CircuitBreaker('LlmService', {
            failureThreshold: 5,
            resetTimeoutMs: 60000,
            halfOpenMaxCalls: 2,
        });
        this.useMock = (((_f = this.configService) === null || _f === void 0 ? void 0 : _f.get('LLM_USE_MOCK')) || process.env.LLM_USE_MOCK) === 'true';
        const deepseekKey = ((_g = this.configService) === null || _g === void 0 ? void 0 : _g.get('DEEPSEEK_API_KEY')) || process.env.DEEPSEEK_API_KEY;
        const openaiKey = ((_h = this.configService) === null || _h === void 0 ? void 0 : _h.get('OPENAI_API_KEY')) || process.env.OPENAI_API_KEY;
        const geminiKey = ((_j = this.configService) === null || _j === void 0 ? void 0 : _j.get('GEMINI_API_KEY')) || process.env.GEMINI_API_KEY;
        const anthropicKey = ((_k = this.configService) === null || _k === void 0 ? void 0 : _k.get('ANTHROPIC_API_KEY')) || process.env.ANTHROPIC_API_KEY;
        if (deepseekKey) {
            this.defaultProvider = llm_request_dto_1.LlmProvider.DEEPSEEK;
        }
        else if (openaiKey) {
            this.defaultProvider = llm_request_dto_1.LlmProvider.OPENAI;
        }
        else if (geminiKey) {
            this.defaultProvider = llm_request_dto_1.LlmProvider.GEMINI;
        }
        else if (anthropicKey) {
            this.defaultProvider = llm_request_dto_1.LlmProvider.ANTHROPIC;
        }
        else {
            this.defaultProvider = llm_request_dto_1.LlmProvider.DEEPSEEK;
            if (!this.useMock) {
                this.logger.warn('⚠️ LlmService Warning: No LLM API key configured (checked ConfigService and process.env), will use mock mode');
            }
        }
    }
    getDefaultProvider() {
        return this.defaultProvider;
    }
    extractJSON(response) {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        return JSON.parse(cleaned);
    }
    async naturalLanguageToTripParams(dto) {
        const provider = dto.provider || this.defaultProvider;
        const prompt = this.buildTripCreationPrompt(dto.text, dto.contextBlocks, dto.destinationCode, dto.destinationConfig);
        try {
            const schema = this.getTripCreationSchema(dto.destinationConfig);
            const response = await this.callLlm(provider, prompt, schema);
            const parsed = this.extractJSON(response);
            this.logger.debug(`LLM parsed result: ${JSON.stringify(parsed, null, 2)}`);
            this.logger.debug(`LLM needsClarification: ${parsed.needsClarification}, inferredFields: ${JSON.stringify(parsed.inferredFields)}`);
            const hasAllRequiredFields = parsed.destination && parsed.startDate && parsed.endDate && parsed.totalBudget;
            const hasInferredFields = parsed.inferredFields && parsed.inferredFields.length > 0;
            const shouldClarify = !hasAllRequiredFields || hasInferredFields || parsed.needsClarification;
            if (shouldClarify) {
                this.logger.debug('Generating planner-style clarification dialog');
                const clarification = await this.generatePlannerStyleClarification(dto.text, parsed, parsed.inferredFields);
                return {
                    params: parsed,
                    needsClarification: true,
                    clarificationQuestions: clarification.suggestedQuestions || this.generateFallbackQuestions(parsed, parsed.inferredFields),
                    plannerReply: clarification.reply,
                    suggestedQuestions: clarification.suggestedQuestions,
                    conversationContext: clarification.conversationContext,
                    llmRawOutput: clarification.llmRawOutput,
                };
            }
            this.logger.debug('All required fields present, no clarification needed');
            return {
                params: parsed,
                needsClarification: false,
            };
        }
        catch (error) {
            this.logger.error(`Failed to parse natural language: ${error.message}`);
            throw error;
        }
    }
    async humanizeResult(dto) {
        const provider = dto.provider || this.defaultProvider;
        const prompt = this.buildHumanizePrompt(dto.dataType, dto.data);
        try {
            const response = await this.callLlm(provider, prompt);
            return response;
        }
        catch (error) {
            this.logger.error(`Failed to humanize result: ${error.message}`);
            throw error;
        }
    }
    async provideDecisionSupport(dto) {
        const provider = dto.provider || this.defaultProvider;
        const prompt = this.buildDecisionSupportPrompt(dto.scenario, dto.contextData);
        try {
            const response = await this.callLlm(provider, prompt, this.getDecisionSupportSchema());
            const parsed = this.extractJSON(response);
            return parsed;
        }
        catch (error) {
            this.logger.error(`Failed to provide decision support: ${error.message}`);
            throw error;
        }
    }
    async handleErrorAndClarify(error, context) {
        if (this.useMock) {
            this.logger.warn('Using mock error handling');
            return {
                message: `抱歉，处理您的请求时遇到了问题：${error.message || '未知错误'}`,
                clarificationQuestions: [
                    '请检查输入参数是否正确',
                    '请提供更详细的行程信息（目的地、日期、预算等）',
                ],
                suggestedActions: ['重试', '使用标准创建行程接口', '联系客服'],
            };
        }
        const provider = this.defaultProvider;
        const prompt = this.buildErrorHandlingPrompt(error, context);
        try {
            const response = await this.callLlm(provider, prompt, this.getErrorHandlingSchema());
            const parsed = this.extractJSON(response);
            return parsed;
        }
        catch (err) {
            this.logger.error(`Failed to handle error with LLM: ${err.message}`);
            return {
                message: `抱歉，处理您的请求时遇到了问题：${error.message || '未知错误'}`,
                clarificationQuestions: [
                    '请检查输入参数是否正确',
                    '请提供更详细的行程信息（目的地、日期、预算等）',
                ],
                suggestedActions: ['重试', '使用标准创建行程接口', '联系客服'],
            };
        }
    }
    async callLlmWithSchema(provider, prompt, schema) {
        return this.callLlm(provider, prompt, schema);
    }
    async callLlm(provider, prompt, schema) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (this.useMock) {
            this.logger.warn('Using mock LLM response');
            return this.getMockResponse(prompt, schema);
        }
        if (this.circuitBreaker.isOpen()) {
            const state = this.circuitBreaker.getState();
            this.logger.warn(`Circuit breaker is ${state}, falling back to mock mode`);
            return this.getMockResponse(prompt, schema);
        }
        try {
            switch (provider) {
                case llm_request_dto_1.LlmProvider.OPENAI:
                    return await this.callOpenAI(prompt, schema);
                case llm_request_dto_1.LlmProvider.GEMINI:
                    return await this.callGemini(prompt, schema);
                case llm_request_dto_1.LlmProvider.DEEPSEEK:
                    return await this.callDeepSeek(prompt, schema);
                case llm_request_dto_1.LlmProvider.ANTHROPIC:
                    return await this.callAnthropic(prompt, schema);
                default:
                    throw new Error(`Unsupported LLM provider: ${provider}`);
            }
        }
        catch (error) {
            const isNetworkError = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('no response received')) ||
                ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('network')) ||
                ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('aborted')) ||
                ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('timeout')) ||
                ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('503')) ||
                ((_f = error.response) === null || _f === void 0 ? void 0 : _f.status) === 503 ||
                error.code === 'ECONNREFUSED' ||
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNABORTED';
            if (isNetworkError) {
                const errorDetails = ((_g = error.response) === null || _g === void 0 ? void 0 : _g.status)
                    ? `HTTP ${error.response.status}: ${((_k = (_j = (_h = error.response) === null || _h === void 0 ? void 0 : _h.data) === null || _j === void 0 ? void 0 : _j.error) === null || _k === void 0 ? void 0 : _k.message) || error.message}`
                    : error.message;
                this.logger.warn(`LLM API call failed (${errorDetails}), falling back to mock mode`);
                return this.getMockResponse(prompt, schema);
            }
            throw error;
        }
    }
    getMockResponse(prompt, schema) {
        var _a, _b;
        this.logger.debug(`Mock LLM response for prompt: ${prompt.substring(0, 100)}...`);
        const isActionSelection = ((_a = schema === null || schema === void 0 ? void 0 : schema.properties) === null || _a === void 0 ? void 0 : _a.action_name) !== undefined;
        const isTripParams = ((_b = schema === null || schema === void 0 ? void 0 : schema.properties) === null || _b === void 0 ? void 0 : _b.destination) !== undefined;
        if (isActionSelection) {
            let actionName = 'places.resolve_entities';
            let input = {};
            const nodesMatch = prompt.match(/nodes:\s*(\d+)/);
            const nodesCount = nodesMatch ? parseInt(nodesMatch[1]) : 0;
            const factsMatch = prompt.match(/facts:\s*(\d+)/);
            const factsCount = factsMatch ? parseInt(factsMatch[1]) : 0;
            const hasTimeMatrix = prompt.includes('time_matrix:') && !prompt.includes('time_matrix: null');
            const hasDaysMismatch = prompt.includes('DAYS_COUNT_MISMATCH') || prompt.includes('天数不匹配');
            const hasTimeMissing = prompt.includes('ROBUST_TIME_MISSING') || prompt.includes('缺少时间矩阵');
            const hasLunchMissing = prompt.includes('LUNCH_MISSING') || prompt.includes('缺少午餐');
            if (nodesCount === 0) {
                actionName = 'places.resolve_entities';
                input = {};
            }
            else if (nodesCount > 0 && factsCount === 0) {
                actionName = 'places.get_poi_facts';
                const nodeIdsMatch = prompt.match(/node_ids:\s*\[([\d,\s]+)\]/);
                if (nodeIdsMatch) {
                    input = { poi_ids: nodeIdsMatch[1].split(',').map((id) => parseInt(id.trim())) };
                }
                else {
                    input = {};
                }
            }
            else if (nodesCount > 0 && factsCount > 0 && !hasTimeMatrix) {
                actionName = 'transport.build_time_matrix';
                input = {};
            }
            else if (nodesCount > 0 && factsCount > 0 && hasTimeMatrix) {
                actionName = 'itinerary.optimize_day_vrptw';
                input = {};
            }
            else if (hasTimeMissing && nodesCount > 0) {
                actionName = 'transport.build_time_matrix';
                input = {};
            }
            else {
                actionName = 'places.resolve_entities';
                input = {};
            }
            const result = {
                action_name: actionName,
                input,
                reasoning: `Mock mode: 根据当前状态选择 ${actionName} (nodes=${nodesCount}, facts=${factsCount}, hasTimeMatrix=${hasTimeMatrix})`,
                confidence: 0.5,
                should_continue: true,
            };
            this.logger.warn(`Mock mode: returning action selection (${actionName}), confidence=0.5`);
            this.logger.debug(`Mock response: ${JSON.stringify(result)}`);
            return JSON.stringify(result);
        }
        if (isTripParams) {
            const dayMatch = prompt.match(/(\d+)\s*天/);
            const days = dayMatch ? parseInt(dayMatch[1]) : 5;
            const budgetMatch = prompt.match(/(\d+)\s*万/);
            const budget = budgetMatch ? parseInt(budgetMatch[1]) * 10000 : 20000;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const endDate = new Date(today);
            endDate.setDate(today.getDate() + days);
            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            const startDateStr = formatDate(today);
            const endDateStr = formatDate(endDate);
            let destination = null;
            if (prompt.includes('北京') || prompt.includes('中国') || prompt.includes('CN')) {
                destination = 'CN';
            }
            else if (prompt.includes('东京') || prompt.includes('日本') || prompt.includes('JP')) {
                destination = 'JP';
            }
            const result = {
                destination: destination || 'CN',
                startDate: startDateStr,
                endDate: endDateStr,
                totalBudget: budget,
                hasChildren: (prompt.includes('带娃') || prompt.includes('小孩') || prompt.includes('孩子')) && !prompt.includes('去日本玩'),
                hasElderly: prompt.includes('老人') || prompt.includes('父母') || prompt.includes('长辈'),
                preferences: {},
            };
            this.logger.warn(`Mock mode: returning trip params (destination=${destination})`);
            this.logger.debug(`Mock response: ${JSON.stringify(result)}`);
            return JSON.stringify(result);
        }
        this.logger.warn(`Mock mode: unknown schema, returning empty object`);
        return JSON.stringify({});
    }
    async callOpenAI(prompt, schema) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const apiKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENAI_API_KEY')) || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY not configured (checked ConfigService and process.env)');
        }
        const model = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('OPENAI_MODEL')) || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        const body = {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        };
        if (schema) {
            const supportsJsonSchema = model.includes('gpt-4o') && (model.includes('2024-08-06') ||
                model.includes('2024-07-18') ||
                model === 'gpt-4o' ||
                model === 'gpt-4o-mini');
            if (supportsJsonSchema) {
                body.response_format = {
                    type: 'json_schema',
                    json_schema: {
                        name: 'response_schema',
                        strict: true,
                        schema: schema,
                    },
                };
            }
            else if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
                body.response_format = { type: 'json_object' };
                body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
            }
        }
        try {
            this.logger.debug(`Calling OpenAI API with URL: ${this.openaiHttp.defaults.baseURL}/chat/completions`);
            const response = await (0, retry_with_backoff_1.retryWithBackoff)(() => this.openaiHttp.post('/chat/completions', body, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            }), {
                maxRetries: 3,
                initialDelayMs: 200,
                maxDelayMs: 2000,
                factor: 2,
                jitter: true,
            });
            const data = response.data;
            const result = ((_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || '';
            this.circuitBreaker.recordSuccess();
            return result;
        }
        catch (error) {
            this.circuitBreaker.recordFailure();
            const actualUrl = ((_f = error.config) === null || _f === void 0 ? void 0 : _f.url) || `${this.openaiHttp.defaults.baseURL}/chat/completions`;
            this.logger.debug(`Actual URL used in request: ${actualUrl}`);
            this.logger.debug(`Request config: ${JSON.stringify({ url: (_g = error.config) === null || _g === void 0 ? void 0 : _g.url, baseURL: (_h = error.config) === null || _h === void 0 ? void 0 : _h.baseURL, method: (_j = error.config) === null || _j === void 0 ? void 0 : _j.method })}`);
            const errorDetails = {
                message: error === null || error === void 0 ? void 0 : error.message,
                code: error === null || error === void 0 ? void 0 : error.code,
                errno: error === null || error === void 0 ? void 0 : error.errno,
                syscall: error === null || error === void 0 ? void 0 : error.syscall,
                address: error === null || error === void 0 ? void 0 : error.address,
                port: error === null || error === void 0 ? void 0 : error.port,
                cause: (_l = (_k = error === null || error === void 0 ? void 0 : error.cause) === null || _k === void 0 ? void 0 : _k.message) !== null && _l !== void 0 ? _l : error === null || error === void 0 ? void 0 : error.cause,
                errors: (_m = error === null || error === void 0 ? void 0 : error.errors) === null || _m === void 0 ? void 0 : _m.map((e) => ({
                    message: e === null || e === void 0 ? void 0 : e.message,
                    code: e === null || e === void 0 ? void 0 : e.code,
                    errno: e === null || e === void 0 ? void 0 : e.errno,
                    syscall: e === null || e === void 0 ? void 0 : e.syscall,
                })),
            };
            this.logger.error(`OpenAI API error details: ${JSON.stringify(errorDetails, null, 2)}`);
            this.logger.error(`OpenAI API error: ${error.message}`, error.stack);
            if (error.response) {
                this.logger.error(`OpenAI API response: ${JSON.stringify(error.response.data)}`);
                throw new Error(`OpenAI API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            if (error.request) {
                this.logger.error(`OpenAI API request failed: no response received`);
                throw new Error(`OpenAI API request failed: no response received. Check network connection.`);
            }
            throw new Error(`OpenAI API request failed: ${error.message}`);
        }
    }
    async callGemini(prompt, schema) {
        var _a, _b, _c, _d, _e, _f, _g;
        const apiKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GEMINI_API_KEY')) || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not configured (checked ConfigService and process.env)');
        }
        const model = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GEMINI_MODEL')) || process.env.GEMINI_MODEL || 'gemini-pro';
        const body = {
            contents: [{
                    parts: [{ text: prompt }],
                }],
        };
        if (schema) {
            body.generationConfig = {
                responseMimeType: 'application/json',
                responseSchema: schema,
            };
        }
        try {
            const response = await axios_1.default.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, body, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 60000,
                proxy: false,
                httpsAgent: this.httpsAgent,
            });
            const data = response.data;
            return ((_g = (_f = (_e = (_d = (_c = data.candidates) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.content) === null || _e === void 0 ? void 0 : _e.parts) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.text) || '';
        }
        catch (error) {
            if (error.response) {
                throw new Error(`Gemini API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Gemini API request failed: ${error.message}`);
        }
    }
    async callDeepSeek(prompt, schema) {
        var _a, _b, _c, _d, _e, _f, _g;
        const apiKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('DEEPSEEK_API_KEY')) || process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            throw new Error('DEEPSEEK_API_KEY not configured (checked ConfigService and process.env)');
        }
        const model = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('DEEPSEEK_MODEL')) || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
        const body = {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        };
        if (schema) {
            body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
        }
        const promptLength = prompt.length;
        const timeout = promptLength > 50000 ? 180000 : promptLength > 20000 ? 120000 : 60000;
        try {
            this.logger.debug(`调用 DeepSeek API (prompt长度: ${promptLength}, 超时: ${timeout}ms)`);
            const response = await axios_1.default.post('https://api.deepseek.com/v1/chat/completions', body, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                timeout,
                proxy: false,
                httpsAgent: this.httpsAgent,
            });
            const data = response.data;
            return ((_e = (_d = (_c = data.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) || '';
        }
        catch (error) {
            const isTimeoutOrAbort = error.code === 'ECONNABORTED' ||
                ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('aborted')) ||
                ((_g = error.message) === null || _g === void 0 ? void 0 : _g.includes('timeout')) ||
                error.code === 'ETIMEDOUT';
            if (isTimeoutOrAbort) {
                this.logger.warn(`DeepSeek API 请求超时或中止 (prompt长度: ${promptLength}, 超时设置: ${timeout}ms): ${error.message}`);
                throw new Error(`DeepSeek API request timeout or aborted: ${error.message}`);
            }
            if (error.response) {
                throw new Error(`DeepSeek API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`DeepSeek API request failed: ${error.message}`);
        }
    }
    async callAnthropic(prompt, schema) {
        var _a, _b, _c, _d, _e, _f, _g;
        const envPath = path.resolve(process.cwd(), '.env');
        let envConfig = {};
        try {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            envConfig = dotenv.parse(envContent);
        }
        catch (error) {
            this.logger.warn(`[Anthropic] 无法读取 .env 文件: ${envPath}, 错误: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
        }
        const apiKey = envConfig.ANTHROPIC_API_KEY || ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('ANTHROPIC_API_KEY')) || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY not configured (checked .env file, ConfigService and process.env)');
        }
        const model = envConfig.ANTHROPIC_MODEL || ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('ANTHROPIC_MODEL')) || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
        const baseUrl = envConfig.ANTHROPIC_BASE_URL || ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('ANTHROPIC_BASE_URL')) || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
        this.logger.debug(`[Anthropic] 配置来源: .env=${!!envConfig.ANTHROPIC_MODEL}, ConfigService=${!!((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('ANTHROPIC_MODEL'))}, process.env=${!!process.env.ANTHROPIC_MODEL}`);
        this.logger.debug(`[Anthropic] 最终配置: model=${model}, baseUrl=${baseUrl}`);
        const apiUrl = baseUrl.endsWith('/v1/messages')
            ? baseUrl
            : `${baseUrl.replace(/\/$/, '')}/v1/messages`;
        const promptLength = prompt.length;
        const estimatedOutputTokens = schema
            ? Math.max(4096, Math.ceil(promptLength * 0.5))
            : 4096;
        const maxTokens = Math.min(8192, estimatedOutputTokens);
        const body = {
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
        };
        if (schema) {
            body.messages[0].content += `\n\n【重要】你必须只返回 JSON 格式，不要包含任何其他文本、解释或 markdown 代码块标记。

请严格按照以下 JSON Schema 返回结果：

${JSON.stringify(schema, null, 2)}

要求：
1. 只返回 JSON 对象，不要包含 \`\`\`json 或 \`\`\` 标记
2. 不要添加任何解释性文字
3. 确保 JSON 格式完全有效
4. 所有字段必须符合 schema 定义`;
        }
        try {
            this.logger.debug(`[Anthropic] 调用 API: ${apiUrl}, model: ${model}`);
            const response = await (0, retry_with_backoff_1.retryWithBackoff)(() => axios_1.default.post(apiUrl, body, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                timeout: 60000,
                proxy: false,
                httpsAgent: this.httpsAgent,
            }), {
                maxRetries: 3,
                initialDelayMs: 1000,
                maxDelayMs: 5000,
                retryCondition: (error) => {
                    var _a, _b, _c, _d, _e, _f;
                    if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 503) {
                        this.logger.warn(`[Anthropic] 收到 503 错误，将重试: ${((_d = (_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || 'Service unavailable'}`);
                        return true;
                    }
                    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'];
                    if (error.code && retryableCodes.includes(error.code)) {
                        return true;
                    }
                    if (((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('timeout')) || ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('ECONNRESET'))) {
                        return true;
                    }
                    return false;
                },
            });
            const data = response.data;
            return ((_f = (_e = data.content) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text) || '';
        }
        catch (error) {
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                const errorMsg = `Anthropic API error: ${status} ${JSON.stringify(errorData)}`;
                if (status === 503) {
                    this.logger.warn(`[Anthropic] 上游服务不可用 (503): ${((_g = errorData === null || errorData === void 0 ? void 0 : errorData.error) === null || _g === void 0 ? void 0 : _g.message) || 'Service temporarily unavailable'}`);
                }
                throw new Error(errorMsg);
            }
            throw new Error(`Anthropic API request failed: ${error.message}`);
        }
    }
    buildTripCreationPrompt(text, contextBlocks, destinationCode, destinationConfig) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDate = now.toISOString().split('T')[0];
        let contextSection = '';
        if (contextBlocks && contextBlocks.length > 0) {
            const contextInfo = contextBlocks
                .map((block) => {
                const type = block.type || 'UNKNOWN';
                const content = block.content || '';
                const summary = content.length > 500 ? content.substring(0, 500) + '...' : content;
                return `### ${type}\n${summary}`;
            })
                .join('\n\n');
            contextSection = `\n## 目的地上下文信息（用于增强理解）

以下信息来自目的地知识库，可以帮助你更好地理解用户需求：

${contextInfo}

**注意**：这些上下文信息仅供参考，优先使用用户明确提到的信息。`;
        }
        let specializedSection = '';
        if (destinationConfig && destinationConfig.enabled && destinationConfig.fieldExtractionRules) {
            specializedSection = this.buildDestinationSpecificPromptSection(destinationConfig, destinationCode);
        }
        return `你是一位经验丰富的旅行规划师，正在帮助用户规划旅行。用户说："${text}"

当前日期：${currentDate}${contextSection}

## 你的任务
从用户的自然语言中理解他们的旅行需求，并提取关键信息。

## 需要提取的信息
- destination: 目的地国家代码（ISO 3166-1 alpha-2，如 JP、CN、US、TH、IS）
- startDate: 开始日期（ISO 8601 格式）
- endDate: 结束日期（ISO 8601 格式）
- totalBudget: 总预算（人民币，元）
- hasChildren: 是否有小孩同行（布尔值）
- hasElderly: 是否有老人同行（布尔值）
- preferences: 旅行偏好（对象，包含 style、interests、pace 等）
- needsClarification: 是否需要进一步确认信息
- inferredFields: 推断的字段列表

## 旅行规划专业知识

### 目的地识别
- 日本：JP | 东京、大阪、京都、北海道、冲绳
- 泰国：TH | 曼谷、清迈、普吉岛、芭提雅
- 冰岛：IS | 雷克雅未克、黄金圈
- 新加坡：SG | 圣淘沙、滨海湾
- 韩国：KR | 首尔、釜山、济州岛
- 马来西亚：MY | 吉隆坡、槟城、兰卡威
- 越南：VN | 河内、胡志明市、岘港
- 欧洲国家：FR（法国）、IT（意大利）、ES（西班牙）、DE（德国）、GB（英国）、CH（瑞士）

### 日期处理
- "春节"（${currentYear}年或${currentYear + 1}年）：1月底~2月中
- "国庆"：10月1日~7日
- "五一"：5月1日~5日
- "暑假"：7月~8月
- "寒假"：1月中~2月
- "樱花季"（日本）：3月下旬~4月中旬
- "枫叶季"（日本）：11月
- "极光季"（冰岛/北欧）：9月~3月（但注意：如果用户明确提到9月日期，季节应该是过渡季，不是冬季）

### 预算参考（人民币/人）
- 东南亚5天：5000-15000
- 日本7天：10000-25000
- 韩国5天：6000-15000
- 冰岛10天：25000-50000
- 欧洲10天：20000-40000
- 亲子游通常预算+30%
- 老人游建议选择舒适档次

### 旅行风格识别
- "休闲/度假/放松" → style: "relaxed"
- "深度游/文化/历史" → style: "cultural"
- "冒险/户外/运动" → style: "adventure"
- "美食/逛吃/购物" → style: "foodie"
- "网红打卡/拍照" → style: "instagram"
- "亲子游/带娃/带孩子" → hasChildren: true, style: "family"
- "带父母/带老人/孝顺游" → hasElderly: true, style: "comfortable"

## 规则
1. **用户明确提到的信息**：不要标记为推断
   - 用户说"去日本" → destination: "JP", inferredFields 不包含 destination
   - 用户说"春节去" → 转换为具体日期，inferredFields 不包含日期

2. **需要推断的信息**：标记为推断并设置 needsClarification: true
   - 用户没提日期 → 推断合理日期，inferredFields 包含 "startDate", "endDate"
   - 用户没提预算 → 根据目的地推断，inferredFields 包含 "totalBudget"

3. **天数推算**
   - 用户说"5天" → endDate = startDate + 4天（含首尾）
   - 用户没说天数但说了日期范围 → 计算天数

4. **保守原则**
   - 宁可标记需要确认，也不要擅自做重大假设
   - 目的地是必须的，如果不清楚则 destination 留空

5. **日期与季节一致性**（重要）
   - 如果推断出了startDate，季节必须与日期一致：
     - 9月 → 过渡季/初秋，不是冬季（即使用户说"看极光"）
     - 12月-2月 → 冬季
     - 6月-8月 → 夏季
   - 不要因为活动偏好（如"看极光"）而忽略日期推断的季节
   - 如果日期和活动偏好矛盾，优先使用日期推断的季节

## 输出格式
返回纯 JSON，示例：
{
  "destination": "JP",
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-04-07T00:00:00.000Z",
  "totalBudget": 20000,
  "hasChildren": true,
  "hasElderly": false,
  "preferences": {
    "style": "family",
    "interests": ["亲子", "樱花"],
    "pace": "relaxed"
  },
  "needsClarification": false,
  "inferredFields": []
}${specializedSection ? `\n\n## 目的地特化提取规则（${destinationConfig.destinationName}）\n\n${specializedSection}` : ''}`;
    }
    buildDestinationSpecificPromptSection(config, destinationCode) {
        let section = '';
        if (config.fieldExtractionRules && config.fieldExtractionRules.length > 0) {
            section += '### 特化字段提取\n\n';
            for (const rule of config.fieldExtractionRules) {
                section += `- **${rule.fieldName}** (${rule.fieldType}): ${rule.extractionPrompt}\n`;
                if (rule.validation) {
                    section += `  - 验证规则: ${JSON.stringify(rule.validation)}\n`;
                }
            }
            section += '\n';
        }
        return section;
    }
    buildHumanizePrompt(dataType, data) {
        const dataStr = JSON.stringify(data, null, 2);
        const prompts = {
            itinerary_optimization: `请将以下行程优化结果转化为自然语言描述，包括时间安排、路线顺序、快乐值评分等：

${dataStr}

请用流畅的中文描述，让用户容易理解。`,
            what_if_evaluation: `请将以下 What-If 评估结果转化为自然语言，包括风险指标、候选方案对比、推荐建议等：

${dataStr}

请用清晰的中文说明每个方案的优劣。`,
            trip_schedule: `请将以下行程计划转化为自然语言描述，包括每日安排、活动时间、地点信息等：

${dataStr}

请用友好的语气描述，让用户对行程有清晰的了解。`,
            transport_plan: `请将以下交通规划结果转化为自然语言，包括交通方式、时间、痛苦指数、推荐理由等：

${dataStr}

请用简洁明了的中文说明。`,
        };
        return prompts[dataType] || `请将以下数据转化为自然语言描述：\n\n${dataStr}`;
    }
    buildDecisionSupportPrompt(scenario, contextData) {
        return `你是一个智能决策助手。当前场景：${scenario}

相关数据：
${JSON.stringify(contextData, null, 2)}

请分析数据，提供 2-3 个决策建议，每个建议包括：
- title: 建议标题
- description: 详细描述
- confidence: 置信度（0-1）
- reasoning: 推理过程

最后提供一个总结。`;
    }
    buildErrorHandlingPrompt(error, context) {
        return `用户在执行以下操作时遇到错误：
${context}

错误信息：
${JSON.stringify(error, null, 2)}

请生成友好的错误提示、追问问题和建议操作。`;
    }
    getTripCreationSchema(destinationConfig) {
        var _a;
        const schema = {
            type: 'object',
            properties: {
                destination: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                totalBudget: { type: 'number' },
                hasChildren: { type: 'boolean' },
                hasElderly: { type: 'boolean' },
                preferences: { type: 'object' },
                needsClarification: {
                    type: 'boolean',
                    description: '如果任何关键信息（日期、预算）是推断的，设置为 true',
                },
                inferredFields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '推断的字段列表，如 ["startDate", "totalBudget"]',
                },
            },
            required: ['destination', 'startDate', 'endDate', 'totalBudget'],
        };
        if (destinationConfig && destinationConfig.enabled && destinationConfig.fieldExtractionRules) {
            for (const rule of destinationConfig.fieldExtractionRules) {
                let fieldType = { type: rule.fieldType };
                if (rule.fieldType === 'array') {
                    fieldType = {
                        type: 'array',
                        items: { type: 'string' },
                    };
                }
                else if (rule.fieldType === 'object') {
                    fieldType = { type: 'object' };
                }
                else if (rule.fieldType === 'number') {
                    fieldType = { type: 'number' };
                }
                else if (rule.fieldType === 'boolean') {
                    fieldType = { type: 'boolean' };
                }
                fieldType.description = rule.extractionPrompt;
                schema.properties[rule.fieldName] = fieldType;
                if ((_a = rule.validation) === null || _a === void 0 ? void 0 : _a.required) {
                    schema.required.push(rule.fieldName);
                }
            }
        }
        return schema;
    }
    getDecisionSupportSchema() {
        return {
            type: 'object',
            properties: {
                recommendations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            description: { type: 'string' },
                            confidence: { type: 'number' },
                            reasoning: { type: 'string' },
                        },
                    },
                },
                summary: { type: 'string' },
            },
        };
    }
    getErrorHandlingSchema() {
        return {
            type: 'object',
            properties: {
                message: { type: 'string' },
                clarificationQuestions: { type: 'array', items: { type: 'string' } },
                suggestedActions: { type: 'array', items: { type: 'string' } },
            },
        };
    }
    async generatePlannerStyleClarification(userInput, parsed, inferredFields) {
        const prompt = this.buildPlannerClarificationPrompt(userInput, parsed, inferredFields);
        try {
            const response = await this.callLlm(this.defaultProvider, prompt, this.getPlannerClarificationSchema());
            const result = this.extractJSON(response);
            const llmRawOutput = result;
            return {
                reply: result.reply || '让我来帮您规划这趟旅程吧！',
                suggestedQuestions: result.suggestedQuestions,
                conversationContext: result.conversationContext,
                llmRawOutput: llmRawOutput,
            };
        }
        catch (error) {
            this.logger.warn(`LLM clarification failed, using fallback: ${error.message}`);
            return {
                reply: this.buildFallbackClarificationReply(parsed, inferredFields),
                suggestedQuestions: this.generateFallbackQuestions(parsed, inferredFields),
            };
        }
    }
    buildPlannerClarificationPrompt(userInput, parsed, inferredFields) {
        const knownInfo = [];
        const missingInfo = [];
        const inferredInfo = [];
        if (parsed.destination) {
            if (inferredFields === null || inferredFields === void 0 ? void 0 : inferredFields.includes('destination')) {
                inferredInfo.push(`目的地: ${parsed.destination}（推断）`);
            }
            else {
                knownInfo.push(`目的地: ${parsed.destination}`);
            }
        }
        else {
            missingInfo.push('目的地');
        }
        if (parsed.startDate && parsed.endDate) {
            const startDate = parsed.startDate.includes('T') ? parsed.startDate.split('T')[0] : parsed.startDate;
            const endDate = parsed.endDate.includes('T') ? parsed.endDate.split('T')[0] : parsed.endDate;
            if ((inferredFields === null || inferredFields === void 0 ? void 0 : inferredFields.includes('startDate')) || (inferredFields === null || inferredFields === void 0 ? void 0 : inferredFields.includes('endDate'))) {
                inferredInfo.push(`日期: ${startDate} ~ ${endDate}（推断）`);
            }
            else {
                knownInfo.push(`日期: ${startDate} ~ ${endDate}`);
            }
        }
        else {
            missingInfo.push('出行日期');
        }
        if (parsed.totalBudget) {
            if (inferredFields === null || inferredFields === void 0 ? void 0 : inferredFields.includes('totalBudget')) {
                inferredInfo.push(`预算: ¥${parsed.totalBudget}（推断）`);
            }
            else {
                knownInfo.push(`预算: ¥${parsed.totalBudget}`);
            }
        }
        else {
            missingInfo.push('预算');
        }
        if (parsed.hasChildren)
            knownInfo.push('有小孩同行');
        if (parsed.hasElderly)
            knownInfo.push('有老人同行');
        return `你是一位专业、热情的旅行规划师。用户刚刚说了他们的旅行想法，你需要以自然、专业的方式与他们对话，帮助他们完善旅行计划。

## 用户原话
"${userInput}"

## 已提取的信息
${knownInfo.length > 0 ? `✅ 已确认: ${knownInfo.join('、')}` : '（暂无确认信息）'}
${inferredInfo.length > 0 ? `🤔 推断值（需确认）: ${inferredInfo.join('、')}` : ''}
${missingInfo.length > 0 ? `❓ 缺失: ${missingInfo.join('、')}` : ''}

## 你的任务
作为旅行规划师，生成结构化的回复内容，需要：

1. **开场要有温度** - 对用户的旅行想法表示兴趣和认可（使用paragraph类型）
2. **专业引导** - 像真正的旅行顾问一样，用专业知识引导用户
3. **结构化展示** - 使用不同的内容块类型展示信息：
   - paragraph: 普通段落文本
   - heading: 标题（level: 1-3）
   - list: 列表（title, items, ordered）
   - summary_card: 摘要卡片（如果信息完整，展示目的地、天数、预算等）
   - question_card: 问题卡片（关联到clarificationQuestions）
   - highlight: 高亮信息（重要提示）
4. **给出建议和洞察** - 如果有推断信息，可以解释为什么这样推断，并询问是否正确
5. **引导而非审问** - 多用"您是更倾向于..."、"通常我会建议..."这样的句式

**🆕 问题生成要求（重要）**：
- **问题分组**：必须为每个问题标记group字段（required=必需问题，optional=可选问题）
  - 必需问题（required）：缺失的关键信息（目的地、日期、预算等），用户必须回答才能继续
  - 可选问题（optional）：补充信息（偏好、安全等），用户可以选择跳过
- **问题数量限制**：
  - 必需问题（required）：不超过5个
  - 可选问题（optional）：不超过3个
  - 如果问题超过限制，请按优先级排序（metadata.priority: high > medium > low），只返回高优先级问题
- **选项设计要求**：
  - 选项应该清晰表达用户意图，避免语义重复
  - 使用具体动作（如"补充偏好信息"、"补充安全信息"、"暂不补充"）
  - 避免使用模糊的选项（如"是，我想补充"、"否，信息已完整"）
  - 每个选项应该明确表达用户的选择意图

## 对话风格示例
❌ 不好: "请告诉我您的出行日期？请告诉我您的预算范围？"
✅ 好: "带娃去东京，太棒了！东京确实是亲子游的天堂。我注意到您还没提到具体的时间，您是想趁寒假去还是有别的时间安排呢？另外，日本的消费层次很丰富，从经济型到奢华型都有很好的选择，您这趟大概想控制在什么预算范围内呢？"

## 输出格式要求（重要）
你必须返回结构化的JSON，包含：

### 1. responseBlocks（必填）
这是一个数组，每个元素是一个内容块，类型可以是：
- **paragraph**：普通段落文本
  - 必需字段：type="paragraph", content="文本内容"
- **heading**：标题
  - 必需字段：type="heading", level=1|2|3, text="标题文本"
- **list**：列表
  - 必需字段：type="list", items=["项1", "项2"]
  - 可选字段：title="列表标题", ordered=true|false
- **summary_card**：摘要卡片（用于展示行程概览，如果信息完整）
  - 必需字段：type="summary_card", summary={destination, duration, travelers, budget}
- **question_card**：问题卡片（必须关联到clarificationQuestions）
  - 必需字段：type="question_card", questionId="问题ID"
- **highlight**：高亮信息
  - 必需字段：type="highlight", highlightText="文本", highlightType="info|warning|success"

### 2. clarificationQuestions（必填）
这是一个数组，每个元素是一个结构化问题：
- **id**：唯一标识（必须与question_card中的questionId匹配）
- **question**：问题文本（使用question字段，兼容ClarificationQuestion接口）
- **type**：输入类型（text|single_choice|multi_choice|date|number|boolean）
- **options**：选项数组（type为single_choice/multiple_choice时必需）
- **required**：是否必填
- **hint**：提示信息（可选）
- **metadata**：元数据（category, priority，可选）
- **group**：问题分组（required=必需问题，optional=可选问题）🆕 **新增字段**
- **conditionalInputs**：条件输入字段（可选）🆕 **HCI优化：新增字段**

**🆕 条件输入字段（重要）**：
当问题类型为 single_choice 或 multi_choice 时，如果某个选项需要用户进一步输入信息，应该添加 conditionalInputs 字段：
- **triggerValue**：触发此输入字段的选项值（必须与options中的某个选项完全匹配）
- **inputType**：输入字段类型（text|date|number|date_range）
  - text：文本输入框（用于需要用户输入文本的情况）
  - date：日期选择框（用于需要用户选择日期的情况）
  - date_range：日期范围选择框（用于需要用户选择日期范围的情况）
  - number：数字输入框（用于需要用户输入数字的情况）
- **label**：输入字段标签（可选，如"请选择正确的日期"）
- **placeholder**：占位符（可选，如"请输入日期"）
- **required**：是否必填（默认true）
- **validation**：验证规则（可选）
- **hint**：提示文本（可选）

**示例**：
- 日期确认问题：选项"不准确，需要修改" → 应添加 conditionalInputs，inputType: "date_range"
- 预算确认问题：选项"需要调整，我的预算是____元" → 应添加 conditionalInputs，inputType: "number"

**🆕 问题分组要求（重要）**：
- **必需问题（required）**：缺失的关键信息（目的地、日期、预算等），用户必须回答才能继续
- **可选问题（optional）**：补充信息（偏好、安全等），用户可以选择跳过
- 每个clarificationQuestion必须包含group字段（required或optional）
- 必需问题应该优先生成，可选问题放在后面

**🆕 问题数量限制（重要）**：
- **必需问题（required）**：不超过5个
- **可选问题（optional）**：不超过3个
- 如果问题超过限制，请按优先级排序（metadata.priority: high > medium > low），只返回高优先级问题
- 优先生成缺失的关键信息问题（目的地、日期、预算）

**🆕 选项设计要求（重要）**：
- 选项应该清晰表达用户意图，避免语义重复
- 使用具体动作（如"补充偏好信息"、"补充安全信息"、"暂不补充"）
- 避免使用模糊的选项（如"是，我想补充"、"否，信息已完整"）
- 每个选项应该明确表达用户的选择意图

### 3. 关键约束
- question_card的questionId必须在clarificationQuestions中存在
- 每个clarificationQuestion必须有唯一的id
- responseBlocks的顺序应该符合阅读逻辑（先段落，再标题，再列表，最后问题）
- 如果信息完整，优先使用summary_card展示概览
- 🆕 **问题分组约束**：必需问题（required）必须在前，可选问题（optional）必须在后
- 🆕 **问题数量约束**：必需问题不超过5个，可选问题不超过3个
- 🆕 **选项设计约束**：选项必须清晰具体，避免语义重复

### 4. 向后兼容字段
- reply: 简单文本回复（可选，用于向后兼容）

## 示例输出
{
  "responseBlocks": [
    {
      "type": "paragraph",
      "content": "带娃去东京，太棒了！东京确实是亲子游的天堂。"
    },
    {
      "type": "heading",
      "level": 2,
      "text": "核心思路"
    },
    {
      "type": "list",
      "title": "行程框架",
      "items": [
        "以雷克雅未克为起点和终点，沿环岛公路向东行驶",
        "深入探索黄金圈、维克和杰古沙龙冰河湖"
      ],
      "ordered": false
    },
    {
      "type": "question_card",
      "questionId": "q1_date"
    }
  ],
  "clarificationQuestions": [
    {
      "id": "q1_date",
      "question": "您是想趁寒假去还是有别的时间安排呢？",
      "type": "single_choice",
      "options": ["寒假期间", "暑假期间", "其他时间"],
      "required": true,
      "group": "required",  // 🆕 必需问题
      "metadata": {
        "category": "dates",
        "priority": "high"
      }
    },
    {
      "id": "q2_preferences",
      "question": "是否需要补充其他偏好信息？（如旅行风格、兴趣点、节奏等）",
      "type": "single_choice",
      "options": ["补充偏好信息", "暂不补充"],  // 🆕 使用具体动作
      "required": false,
      "group": "optional",  // 🆕 可选问题
      "metadata": {
        "category": "preferences",
        "priority": "low"
      }
    },
    {
      "id": "q3_date_confirm",
      "question": "我注意到一个可能的时间段是2026年2月3日至9日 (共7天), 这个时间准确吗?",
      "type": "single_choice",
      "options": ["是的, 时间准确", "不准确, 需要修改"],
      "required": true,
      "group": "required",
      "conditionalInputs": [  // 🆕 HCI优化：条件输入字段
        {
          "triggerValue": "不准确, 需要修改",
          "inputType": "date_range",
          "label": "请选择正确的日期范围",
          "placeholder": "请选择出发日期和结束日期",
          "required": true,
          "hint": "确认日期是规划机票、酒店和活动的前提。"
        }
      ],
      "metadata": {
        "category": "dates",
        "priority": "high"
      }
    },
    {
      "id": "q4_budget_confirm",
      "question": "关于旅行预算, 我初步推断您的人均预算可能在15000元左右, 这个预算范围是否符合您的预期?",
      "type": "single_choice",
      "options": ["符合, 预算范围正常", "需要调整, 我的预算是____元"],
      "required": true,
      "group": "required",
      "conditionalInputs": [  // 🆕 HCI优化：条件输入字段
        {
          "triggerValue": "需要调整, 我的预算是____元",
          "inputType": "number",
          "label": "请输入您的预算金额",
          "placeholder": "请输入预算金额（元）",
          "required": true,
          "validation": {
            "min": 0
          },
          "hint": "预算将决定住宿、交通和活动的档次选择。"
        }
      ],
      "metadata": {
        "category": "budget",
        "priority": "high"
      }
    }
  ],
  "reply": "带娃去东京，太棒了！东京确实是亲子游的天堂。我注意到您还没提到具体的时间..."
}

注意：responseBlocks和clarificationQuestions是必填字段，reply是可选字段（向后兼容）。`;
    }
    getPlannerClarificationSchema() {
        return {
            type: 'object',
            properties: {
                responseBlocks: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 20,
                    description: '结构化回复内容块数组',
                    items: {
                        oneOf: [
                            {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['paragraph'] },
                                    content: { type: 'string', description: '段落文本内容' },
                                    id: { type: 'string', description: '可选：内容块ID' },
                                },
                                required: ['type', 'content'],
                                additionalProperties: false,
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['heading'] },
                                    level: { type: 'number', enum: [1, 2, 3], description: '标题级别' },
                                    text: { type: 'string', description: '标题文本' },
                                    id: { type: 'string', description: '可选：内容块ID' },
                                },
                                required: ['type', 'level', 'text'],
                                additionalProperties: false,
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['list'] },
                                    title: { type: 'string', description: '列表标题（可选）' },
                                    items: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: '列表项数组',
                                        minItems: 1,
                                    },
                                    ordered: { type: 'boolean', description: '是否有序列表' },
                                    id: { type: 'string', description: '可选：内容块ID' },
                                },
                                required: ['type', 'items'],
                                additionalProperties: false,
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['summary_card'] },
                                    summary: {
                                        type: 'object',
                                        properties: {
                                            destination: { type: 'string' },
                                            duration: { type: 'string' },
                                            travelers: { type: 'string' },
                                            budget: {
                                                type: 'object',
                                                properties: {
                                                    amount: { type: 'number' },
                                                    currency: { type: 'string' },
                                                    details: { type: 'array', items: { type: 'string' } },
                                                },
                                                required: ['amount', 'currency'],
                                            },
                                        },
                                    },
                                    id: { type: 'string', description: '可选：内容块ID' },
                                },
                                required: ['type', 'summary'],
                                additionalProperties: false,
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['question_card'] },
                                    questionId: { type: 'string', description: '关联到clarificationQuestions中的id' },
                                    id: { type: 'string', description: '可选：内容块ID' },
                                },
                                required: ['type', 'questionId'],
                                additionalProperties: false,
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['highlight'] },
                                    highlightText: { type: 'string', description: '高亮文本' },
                                    highlightType: {
                                        type: 'string',
                                        enum: ['info', 'warning', 'success'],
                                        description: '高亮类型',
                                    },
                                    id: { type: 'string', description: '可选：内容块ID' },
                                },
                                required: ['type', 'highlightText'],
                                additionalProperties: false,
                            },
                        ],
                    },
                },
                clarificationQuestions: {
                    type: 'array',
                    maxItems: 8,
                    description: '结构化澄清问题数组（必需问题不超过5个，可选问题不超过3个）',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: '唯一标识，必须与question_card中的questionId匹配' },
                            question: { type: 'string', description: '问题文本（兼容ClarificationQuestion接口）' },
                            type: {
                                type: 'string',
                                enum: ['text', 'single_choice', 'multi_choice', 'date', 'number', 'boolean'],
                                description: '输入类型（boolean会映射为single_choice）',
                            },
                            options: {
                                type: 'array',
                                items: { type: 'string' },
                                description: '选项列表（type为single_choice/multi_choice时必需，选项应清晰具体，避免语义重复）',
                            },
                            required: { type: 'boolean', description: '是否必填' },
                            hint: { type: 'string', description: '提示信息（可选）' },
                            metadata: {
                                type: 'object',
                                properties: {
                                    category: { type: 'string', description: '问题类别（如dates, budget, activities）' },
                                    priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级（用于排序，high > medium > low）' },
                                },
                            },
                            group: {
                                type: 'string',
                                enum: ['required', 'optional'],
                                description: '问题分组（required=必需问题，缺失的关键信息；optional=可选问题，补充信息）',
                            },
                            conditionalInputs: {
                                type: 'array',
                                description: '条件输入字段配置（当用户选择特定选项时显示后续输入字段）',
                                items: {
                                    type: 'object',
                                    properties: {
                                        triggerValue: {
                                            type: 'string',
                                            description: '触发此输入字段的选项值（必须与options中的某个选项完全匹配）',
                                        },
                                        inputType: {
                                            type: 'string',
                                            enum: ['text', 'date', 'number', 'date_range'],
                                            description: '输入字段类型（text=文本输入框，date=日期选择框，date_range=日期范围选择框，number=数字输入框）',
                                        },
                                        label: {
                                            type: 'string',
                                            description: '输入字段标签（可选）',
                                        },
                                        placeholder: {
                                            type: 'string',
                                            description: '占位符（可选）',
                                        },
                                        required: {
                                            type: 'boolean',
                                            description: '是否必填（默认true）',
                                        },
                                        validation: {
                                            type: 'object',
                                            properties: {
                                                min: { type: 'number' },
                                                max: { type: 'number' },
                                                pattern: { type: 'string' },
                                            },
                                        },
                                        hint: {
                                            type: 'string',
                                            description: '提示文本（可选）',
                                        },
                                    },
                                    required: ['triggerValue', 'inputType'],
                                },
                            },
                        },
                        required: ['id', 'question', 'type', 'required'],
                        additionalProperties: false,
                    },
                },
                reply: {
                    type: 'string',
                    description: '向后兼容：简单文本回复（可选）',
                },
                suggestedQuestions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '用户可能的快速回复选项（向后兼容）',
                },
                conversationContext: {
                    type: 'object',
                    properties: {
                        userIntent: { type: 'string' },
                        travelStyle: { type: 'string' },
                        urgency: { type: 'string' },
                        specialNeeds: { type: 'array', items: { type: 'string' } },
                    },
                    description: '对话上下文',
                },
            },
            required: ['responseBlocks', 'clarificationQuestions'],
            additionalProperties: false,
        };
    }
    buildFallbackClarificationReply(parsed, inferredFields) {
        const parts = [];
        if (parsed.destination) {
            parts.push(`我理解您想去${parsed.destination}旅行`);
        }
        else {
            parts.push('您想去哪里旅行呢');
        }
        if (!parsed.startDate && !parsed.endDate) {
            parts.push('什么时候出发比较方便');
        }
        if (!parsed.totalBudget) {
            parts.push('您这趟旅行的预算大概是多少');
        }
        return parts.join('，') + '？我来帮您规划一下！';
    }
    generateFallbackQuestions(parsed, inferredFields) {
        const questions = [];
        if (!parsed.destination) {
            questions.push('去日本', '去泰国', '去欧洲', '其他目的地');
        }
        if (!parsed.startDate || !parsed.endDate) {
            questions.push('这个月', '下个月', '寒假期间', '具体日期待定');
        }
        if (!parsed.totalBudget) {
            questions.push('1万以内', '1-2万', '2-5万', '5万以上');
        }
        return questions.slice(0, 5);
    }
    generateClarificationQuestions(parsed, inferredFields) {
        return this.generateFallbackQuestions(parsed, inferredFields);
    }
    hasExplicitDate(text) {
        const datePatterns = [
            /\d{1,2}[月\-/]\d{1,2}[日号]?/,
            /\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}[日号]?/,
            /\d{4}年\d{1,2}月/,
            /\d{4}年/,
            /(今天|明天|后天|下周|下个月|下下周)/,
            /(january|february|march|april|may|june|july|august|september|october|november|december)/i,
            /\d+\s*天/,
            /\d+\s*days?/i,
            /(星期|周)[一二三四五六日天]/,
            /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
            /(春节|元旦|清明|劳动节|端午|中秋|国庆|圣诞节|新年)/,
            /\d{4}年(春节|元旦|清明|劳动节|端午|中秋|国庆|圣诞节|新年)/,
            /(spring|summer|autumn|fall|winter)\s*festival/i,
            /(chinese|lunar)\s*new\s*year/i,
        ];
        return datePatterns.some(pattern => pattern.test(text));
    }
    hasExplicitBudget(text) {
        const budgetPatterns = [
            /(预算|花费|费用|支出).*?(\d+)/,
            /(\d+).*?(万|千|元|块)/,
            /(\d+).*?(yuan|rmb|usd|\$)/i,
            /(budget|cost|spend).*?(\d+)/i,
        ];
        return budgetPatterns.some(pattern => pattern.test(text));
    }
    hasReasonableInferredValues(parsed, inferredFields) {
        for (const field of inferredFields) {
            if (field === 'startDate' || field === 'endDate') {
                const dateValue = field === 'startDate' ? parsed.startDate : parsed.endDate;
                if (!dateValue) {
                    return false;
                }
                try {
                    const date = new Date(dateValue);
                    if (isNaN(date.getTime())) {
                        return false;
                    }
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (date < today) {
                        return false;
                    }
                }
                catch {
                    return false;
                }
            }
            else if (field === 'totalBudget') {
                if (!parsed.totalBudget || parsed.totalBudget <= 0) {
                    return false;
                }
                if (parsed.totalBudget < 1000 || parsed.totalBudget > 1000000) {
                    return false;
                }
            }
        }
        if (inferredFields.includes('startDate') || inferredFields.includes('endDate')) {
            if (parsed.startDate && parsed.endDate) {
                try {
                    const startDate = new Date(parsed.startDate);
                    const endDate = new Date(parsed.endDate);
                    if (endDate <= startDate) {
                        return false;
                    }
                    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (days < 1 || days > 365) {
                        return false;
                    }
                }
                catch {
                    return false;
                }
            }
        }
        return true;
    }
};
exports.LlmService = LlmService;
exports.LlmService = LlmService = LlmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LlmService);
//# sourceMappingURL=llm.service.js.map