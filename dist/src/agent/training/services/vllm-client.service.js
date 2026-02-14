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
var VllmClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VllmClientService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let VllmClientService = VllmClientService_1 = class VllmClientService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
        this.logger = new common_1.Logger(VllmClientService_1.name);
        this.isAvailable = false;
        this.loadedAdapters = new Map();
        this.vllmUrl = this.configService.get('VLLM_URL') || 'http://localhost:8080';
        this.apiKey = this.configService.get('VLLM_API_KEY');
    }
    async onModuleInit() {
        this.logger.log(`VllmClientService initialized, vLLM URL: ${this.vllmUrl}`);
        await this.checkHealth();
        if (this.isAvailable) {
            await this.refreshModelInfo();
        }
    }
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }
    async checkHealth() {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.vllmUrl}/health`, {
                headers: this.getHeaders(),
            }).pipe((0, rxjs_1.timeout)(5000), (0, rxjs_1.catchError)(() => (0, rxjs_1.of)({ data: null }))));
            this.isAvailable = response.data !== null;
            if (this.isAvailable) {
                this.logger.log('vLLM service is healthy');
            }
            else {
                this.logger.warn('vLLM service is not available');
            }
            return this.isAvailable;
        }
        catch (error) {
            this.logger.warn(`vLLM health check failed: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            this.isAvailable = false;
            return false;
        }
    }
    isServiceAvailable() {
        return this.isAvailable;
    }
    async refreshModelInfo() {
        var _a;
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.vllmUrl}/v1/models`, {
                headers: this.getHeaders(),
            }).pipe((0, rxjs_1.timeout)(10000)));
            const models = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.data) || [];
            this.logger.log(`Available models: ${models.map((m) => m.id).join(', ')}`);
        }
        catch (error) {
            this.logger.warn(`Failed to get model info: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
        }
    }
    async listModels() {
        var _a;
        if (!this.isAvailable) {
            return [];
        }
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.vllmUrl}/v1/models`, {
                headers: this.getHeaders(),
            }).pipe((0, rxjs_1.timeout)(10000)));
            return ((_a = response.data) === null || _a === void 0 ? void 0 : _a.data) || [];
        }
        catch (error) {
            this.logger.error(`Failed to list models: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return [];
        }
    }
    async generate(request) {
        var _a, _b, _c, _d, _e, _f;
        if (!this.isAvailable) {
            throw new Error('vLLM service is not available');
        }
        const startTime = Date.now();
        try {
            const body = {
                model: request.model,
                messages: request.messages,
                temperature: (_a = request.temperature) !== null && _a !== void 0 ? _a : 0.7,
                max_tokens: (_b = request.max_tokens) !== null && _b !== void 0 ? _b : 2048,
                top_p: (_c = request.top_p) !== null && _c !== void 0 ? _c : 0.95,
                stream: (_d = request.stream) !== null && _d !== void 0 ? _d : false,
            };
            if (request.lora_adapter) {
                body.model = `${request.model}:${request.lora_adapter}`;
            }
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.vllmUrl}/v1/chat/completions`, body, {
                headers: this.getHeaders(),
            }).pipe((0, rxjs_1.timeout)(120000)));
            const duration = Date.now() - startTime;
            this.logger.debug(`Generation completed in ${duration}ms, tokens: ${(_f = (_e = response.data) === null || _e === void 0 ? void 0 : _e.usage) === null || _f === void 0 ? void 0 : _f.total_tokens}`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Generation failed: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async loadLoraAdapter(name, path) {
        var _a;
        if (!this.isAvailable) {
            throw new Error('vLLM service is not available');
        }
        this.logger.log(`Loading LoRA adapter: ${name} from ${path}`);
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.vllmUrl}/v1/lora/load`, {
                lora_name: name,
                lora_path: path,
            }, {
                headers: this.getHeaders(),
            }).pipe((0, rxjs_1.timeout)(60000)));
            const respData = response.data;
            if (respData === null || respData === void 0 ? void 0 : respData.success) {
                this.loadedAdapters.set(name, {
                    name,
                    path,
                    base_model: (respData === null || respData === void 0 ? void 0 : respData.base_model) || 'unknown',
                    rank: (respData === null || respData === void 0 ? void 0 : respData.rank) || 64,
                    loaded: true,
                });
                this.logger.log(`LoRA adapter loaded: ${name}`);
                return true;
            }
            return false;
        }
        catch (error) {
            if (((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
                this.logger.warn('vLLM does not support dynamic LoRA loading via API');
                this.logger.warn('LoRA adapters must be specified at startup via --lora-modules');
            }
            else {
                this.logger.error(`Failed to load LoRA adapter: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            }
            return false;
        }
    }
    async unloadLoraAdapter(name) {
        var _a;
        if (!this.isAvailable) {
            throw new Error('vLLM service is not available');
        }
        this.logger.log(`Unloading LoRA adapter: ${name}`);
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.vllmUrl}/v1/lora/unload`, {
                lora_name: name,
            }, {
                headers: this.getHeaders(),
            }).pipe((0, rxjs_1.timeout)(30000)));
            if ((_a = response.data) === null || _a === void 0 ? void 0 : _a.success) {
                this.loadedAdapters.delete(name);
                this.logger.log(`LoRA adapter unloaded: ${name}`);
                return true;
            }
            return false;
        }
        catch (error) {
            this.logger.error(`Failed to unload LoRA adapter: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return false;
        }
    }
    getLoadedAdapters() {
        return Array.from(this.loadedAdapters.values());
    }
    async generateDecision(options) {
        var _a, _b, _c, _d;
        const startTime = Date.now();
        const defaultSystemPrompt = `你是 TripNARA，一个专业的旅行决策助手。你的任务是：
1. 理解用户的旅行需求
2. 识别硬性约束（不可违反）和软性偏好（可权衡）
3. 生成多个方案（Plan A/B/C），每个方案带风险概率
4. 提供清晰的决策理由

请使用三人格策略思考：
- Abu：安全检查，识别风险红线
- Dr.Dre：节奏评估，权衡取舍
- Neptune：空间修复，保持路线哲学`;
        const messages = [
            {
                role: 'system',
                content: options.systemPrompt || defaultSystemPrompt,
            },
            {
                role: 'user',
                content: options.userRequest,
            },
        ];
        const response = await this.generate({
            model: 'Qwen/Qwen2.5-7B-Instruct',
            messages,
            temperature: (_a = options.temperature) !== null && _a !== void 0 ? _a : 0.7,
            max_tokens: (_b = options.maxTokens) !== null && _b !== void 0 ? _b : 2048,
            lora_adapter: options.loraAdapter,
        });
        const latencyMs = Date.now() - startTime;
        return {
            content: ((_d = (_c = response.choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || '',
            usage: response.usage,
            latency_ms: latencyMs,
        };
    }
    async batchGenerate(requests, options) {
        const concurrency = (options === null || options === void 0 ? void 0 : options.concurrency) || 4;
        const results = [];
        for (let i = 0; i < requests.length; i += concurrency) {
            const batch = requests.slice(i, i + concurrency);
            const batchPromises = batch.map(async (req) => {
                var _a, _b;
                const startTime = Date.now();
                try {
                    const response = await this.generate({
                        model: 'Qwen/Qwen2.5-7B-Instruct',
                        messages: req.messages,
                        lora_adapter: options === null || options === void 0 ? void 0 : options.loraAdapter,
                    });
                    return {
                        id: req.id,
                        content: ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '',
                        latency_ms: Date.now() - startTime,
                    };
                }
                catch (error) {
                    return {
                        id: req.id,
                        content: '',
                        latency_ms: Date.now() - startTime,
                        error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                    };
                }
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        return results;
    }
};
exports.VllmClientService = VllmClientService;
exports.VllmClientService = VllmClientService = VllmClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], VllmClientService);
//# sourceMappingURL=vllm-client.service.js.map