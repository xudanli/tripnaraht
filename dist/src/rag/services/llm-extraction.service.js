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
var LlmExtractionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmExtractionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_http_factory_1 = require("../../llm/utils/openai-http.factory");
const retry_with_backoff_1 = require("../../llm/utils/retry-with-backoff");
let LlmExtractionService = LlmExtractionService_1 = class LlmExtractionService {
    constructor(configService) {
        var _a, _b;
        this.configService = configService;
        this.logger = new common_1.Logger(LlmExtractionService_1.name);
        this.apiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENAI_API_KEY');
        const baseUrl = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('OPENAI_BASE_URL')) || 'https://api.openai.com/v1';
        this.openaiHttp = (0, openai_http_factory_1.createOpenAIHttp)(baseUrl, this.logger);
    }
    async extractStructured(prompt, schema) {
        var _a, _b, _c, _d;
        if (!this.apiKey) {
            throw new Error('OPENAI_API_KEY not configured');
        }
        const model = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENAI_MODEL')) || 'gpt-4o-mini';
        const body = {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        };
        const supportsJsonSchema = model.includes('gpt-4o') || model.includes('gpt-4-turbo');
        if (supportsJsonSchema && schema) {
            body.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: 'extraction_response',
                    strict: true,
                    schema: schema,
                },
            };
        }
        else if (schema) {
            body.response_format = { type: 'json_object' };
            body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
        }
        try {
            const response = await (0, retry_with_backoff_1.retryWithBackoff)(() => this.openaiHttp.post('/chat/completions', body), {
                maxRetries: 3,
                initialDelayMs: 200,
                maxDelayMs: 2000,
            });
            const data = response.data;
            const content = (_d = (_c = (_b = data.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content;
            if (!content) {
                throw new Error('OpenAI API returned empty content');
            }
            let jsonText = content;
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                jsonText = jsonMatch[1];
            }
            return JSON.parse(jsonText);
        }
        catch (error) {
            this.logger.error(`LLM 提取失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.LlmExtractionService = LlmExtractionService;
exports.LlmExtractionService = LlmExtractionService = LlmExtractionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LlmExtractionService);
//# sourceMappingURL=llm-extraction.service.js.map