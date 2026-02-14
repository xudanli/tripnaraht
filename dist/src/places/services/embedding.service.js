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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var EmbeddingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_dns_1 = __importDefault(require("node:dns"));
const openai_http_factory_1 = require("../../llm/utils/openai-http.factory");
const retry_with_backoff_1 = require("../../llm/utils/retry-with-backoff");
const embedding_cache_service_1 = require("../../rag/services/embedding-cache.service");
const python_ai_service_1 = require("../../llm/services/python-ai.service");
let EmbeddingService = EmbeddingService_1 = class EmbeddingService {
    constructor(configService, embeddingCacheService, pythonAIService) {
        var _a, _b, _c, _d, _e;
        this.configService = configService;
        this.embeddingCacheService = embeddingCacheService;
        this.pythonAIService = pythonAIService;
        this.logger = new common_1.Logger(EmbeddingService_1.name);
        this.inFlightRequests = new Map();
        node_dns_1.default.setDefaultResultOrder('ipv4first');
        const configuredProvider = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('EMBEDDING_PROVIDER')) || 'python';
        this.provider = configuredProvider;
        const configuredDimension = (_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('EMBEDDING_DIMENSION');
        this.embeddingDimension = configuredDimension || (this.provider === 'python' ? 1024 : 1536);
        this.openaiApiKey = (_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('OPENAI_API_KEY');
        const baseUrl = ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('OPENAI_BASE_URL')) || 'https://api.openai.com/v1';
        const disableProxy = ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('OPENAI_DISABLE_PROXY')) === 'true' || true;
        this.openaiHttp = (0, openai_http_factory_1.createOpenAIHttp)(baseUrl, this.logger, { disableProxy });
        this.logger.log(`Embedding 服务初始化: provider=${this.provider}, dimension=${this.embeddingDimension}`);
    }
    async generateEmbedding(text) {
        if (!text || text.trim().length === 0) {
            throw new Error('文本不能为空');
        }
        const normalizedText = text.trim().toLowerCase();
        if (this.embeddingCacheService) {
            const cached = await this.embeddingCacheService.get(text);
            if (cached) {
                this.logger.debug(`✅ 使用缓存的embedding: ${text.substring(0, 50)}...`);
                return cached;
            }
        }
        const inFlightRequest = this.inFlightRequests.get(normalizedText);
        if (inFlightRequest) {
            this.logger.debug(`🔄 复用正在进行的embedding生成: ${text.substring(0, 50)}...`);
            return inFlightRequest;
        }
        const embeddingPromise = this.generateEmbeddingInternal(text, normalizedText);
        this.inFlightRequests.set(normalizedText, embeddingPromise);
        try {
            const embedding = await embeddingPromise;
            return embedding;
        }
        finally {
            this.inFlightRequests.delete(normalizedText);
        }
    }
    getCurrentProvider() {
        var _a;
        if (this.provider === 'python' && ((_a = this.pythonAIService) === null || _a === void 0 ? void 0 : _a.isAvailable())) {
            return 'python';
        }
        return 'openai';
    }
    async generateEmbeddingInternal(text, normalizedText) {
        let embedding = null;
        let usedProvider = this.provider;
        if (this.provider === 'python' && this.pythonAIService) {
            if (this.pythonAIService.isAvailable()) {
                try {
                    embedding = await this.pythonAIService.generateEmbedding(text);
                    usedProvider = 'python';
                    this.logger.debug(`✅ Python AI (BGE-M3) embedding 生成成功: ${text.substring(0, 50)}...`);
                }
                catch (error) {
                    this.logger.warn(`Python AI 服务失败: ${error.message}，降级到 OpenAI...`);
                }
            }
            else {
                this.logger.debug(`Python AI 服务不可用，降级到 OpenAI`);
            }
        }
        if (!embedding) {
            try {
                embedding = await this.generateOpenAIEmbedding(text);
                usedProvider = 'openai';
                this.logger.debug(`✅ OpenAI embedding 生成成功: ${text.substring(0, 50)}...`);
            }
            catch (error) {
                this.logger.error(`OpenAI embedding 也失败: ${error.message}`);
            }
        }
        if (!embedding) {
            const dimension = 1024;
            this.logger.error(`Python AI 服务失败，返回零向量（维度: ${dimension}）`);
            return new Array(dimension).fill(0);
        }
        if (this.embeddingCacheService && embedding.some(v => v !== 0)) {
            await this.embeddingCacheService.set(text, embedding).catch(err => {
                this.logger.warn(`缓存 embedding 失败: ${err.message}`);
            });
        }
        return embedding;
    }
    async generateOpenAIEmbedding(text) {
        var _a, _b, _c, _d, _e;
        if (!this.openaiApiKey) {
            throw new Error('OPENAI_API_KEY 未配置');
        }
        try {
            const response = await (0, retry_with_backoff_1.retryWithBackoff)(() => this.openaiHttp.post('/embeddings', {
                model: 'text-embedding-3-small',
                input: text,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                },
            }), {
                maxRetries: 3,
                initialDelayMs: 200,
                maxDelayMs: 2000,
                factor: 2,
                jitter: true,
            });
            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0].embedding;
            }
            throw new Error('OpenAI API 返回格式错误');
        }
        catch (error) {
            const errorDetails = {
                message: error === null || error === void 0 ? void 0 : error.message,
                code: error === null || error === void 0 ? void 0 : error.code,
                errno: error === null || error === void 0 ? void 0 : error.errno,
                syscall: error === null || error === void 0 ? void 0 : error.syscall,
                address: error === null || error === void 0 ? void 0 : error.address,
                port: error === null || error === void 0 ? void 0 : error.port,
                cause: (_b = (_a = error === null || error === void 0 ? void 0 : error.cause) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : error === null || error === void 0 ? void 0 : error.cause,
                errors: (_c = error === null || error === void 0 ? void 0 : error.errors) === null || _c === void 0 ? void 0 : _c.map((e) => ({
                    message: e === null || e === void 0 ? void 0 : e.message,
                    code: e === null || e === void 0 ? void 0 : e.code,
                    errno: e === null || e === void 0 ? void 0 : e.errno,
                    syscall: e === null || e === void 0 ? void 0 : e.syscall,
                })),
            };
            this.logger.error(`OpenAI Embedding API error details: ${JSON.stringify(errorDetails, null, 2)}`);
            if (error.response) {
                const errorMsg = ((_e = (_d = error.response.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || error.response.statusText || 'Unknown error';
                throw new Error(`OpenAI API 错误 (${error.response.status}): ${errorMsg}`);
            }
            if (error.message) {
                throw new Error(`OpenAI API 调用失败: ${error.message}`);
            }
            throw new Error(`OpenAI API 调用失败: ${error.toString()}`);
        }
    }
    async generateEmbeddingsBatch(texts, batchSize = 10, retries = 3) {
        const results = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            for (const text of batch) {
                let lastError = null;
                for (let attempt = 0; attempt < retries; attempt++) {
                    try {
                        const embedding = await this.generateEmbedding(text);
                        results.push(embedding);
                        break;
                    }
                    catch (error) {
                        lastError = error;
                        if (attempt < retries - 1) {
                            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                        }
                    }
                }
                if (lastError && results.length === i) {
                    throw lastError;
                }
            }
            if (i + batchSize < texts.length) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        return results;
    }
    getEmbeddingDimension(provider) {
        const effectiveProvider = provider || this.getCurrentProvider();
        switch (effectiveProvider) {
            case 'python':
                return 1024;
            case 'openai':
                return 1536;
            default:
                return this.embeddingDimension;
        }
    }
    getConfiguredDimension() {
        return 1024;
    }
    isPythonAIAvailable() {
        var _a, _b;
        return (_b = (_a = this.pythonAIService) === null || _a === void 0 ? void 0 : _a.isAvailable()) !== null && _b !== void 0 ? _b : false;
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = EmbeddingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => python_ai_service_1.PythonAIService))),
    __metadata("design:paramtypes", [config_1.ConfigService,
        embedding_cache_service_1.EmbeddingCacheService,
        python_ai_service_1.PythonAIService])
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map