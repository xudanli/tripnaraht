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
var LlmVoiceParserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmVoiceParserService = void 0;
const common_1 = require("@nestjs/common");
const suggestion_id_util_1 = require("../../common/utils/suggestion-id.util");
let LlmVoiceParserService = LlmVoiceParserService_1 = class LlmVoiceParserService {
    constructor() {
        this.logger = new common_1.Logger(LlmVoiceParserService_1.name);
        this.enabled = process.env.ENABLE_LLM_VOICE_PARSER === 'true';
        let provider;
        let apiKey;
        if (process.env.OPENAI_API_KEY) {
            provider = 'openai';
            apiKey = process.env.OPENAI_API_KEY;
        }
        else if (process.env.GEMINI_API_KEY) {
            provider = 'gemini';
            apiKey = process.env.GEMINI_API_KEY;
        }
        else if (process.env.DEEPSEEK_API_KEY) {
            provider = 'deepseek';
            apiKey = process.env.DEEPSEEK_API_KEY;
        }
        this.provider = provider;
        this.apiKey = apiKey;
        if (this.enabled && !this.apiKey) {
            this.logger.warn('LLM voice parser enabled but no API key found');
        }
    }
    async parseWithLlm(transcript, schedule) {
        if (!this.enabled || !this.apiKey) {
            return null;
        }
        try {
            const { prompt, schema } = this.buildPromptAndSchema(transcript, schedule);
            const rawResponse = await this.callLlmApi(prompt, schema);
            const suggestions = this.parseAndValidateResponse(rawResponse, transcript, schedule);
            if (suggestions.length === 0) {
                this.logger.warn('LLM returned empty suggestions, falling back to rule-based');
                return null;
            }
            return suggestions;
        }
        catch (error) {
            this.logger.error(`LLM parsing failed: ${error.message}`, error.stack);
            return null;
        }
    }
    buildPromptAndSchema(transcript, schedule) {
        const pois = schedule.stops
            .filter((s) => s.kind === 'POI')
            .map((s) => `- ${s.name} (ID: ${s.id}, 时间: ${this.formatTime(s.startMin)})`)
            .join('\n');
        const prompt = `你是一个智能旅行助手，负责解析用户的语音指令并生成结构化的动作建议。

当前行程中的 POI：
${pois || '（暂无）'}

用户语音指令：${transcript}

请分析用户的意图，并返回符合 JSON Schema 的动作建议。支持的动作类型：
1. QUERY_NEXT_STOP - 查询下一站
2. MOVE_POI_TO_MORNING - 移动 POI 到上午（需要 poiId 和 poiName）
3. ADD_POI_TO_SCHEDULE - 添加 POI 到行程（需要 poiId）

如果信息不足，设置 needsClarification=true 并提供 clarificationOptions。`;
        const schema = {
            type: 'object',
            properties: {
                suggestions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'title', 'confidence'],
                        properties: {
                            id: { type: 'string' },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            confidence: {
                                type: 'string',
                                enum: ['LOW', 'MEDIUM', 'HIGH'],
                            },
                            action: {
                                type: 'object',
                                properties: {
                                    type: {
                                        type: 'string',
                                        enum: ['QUERY_NEXT_STOP', 'MOVE_POI_TO_MORNING', 'ADD_POI_TO_SCHEDULE'],
                                    },
                                    poiId: { type: 'string' },
                                    poiName: { type: 'string' },
                                    preferredRange: {
                                        type: 'string',
                                        enum: ['AM', 'PM'],
                                    },
                                    rebuildTimeline: { type: 'boolean' },
                                    insertAfterStopId: { type: 'string' },
                                },
                                required: ['type'],
                            },
                            clarification: {
                                type: 'object',
                                properties: {
                                    question: { type: 'string' },
                                    options: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                label: { type: 'string' },
                                                value: { type: 'string' },
                                            },
                                            required: ['label', 'value'],
                                        },
                                    },
                                },
                                required: ['question'],
                            },
                        },
                    },
                },
            },
            required: ['suggestions'],
        };
        return { prompt, schema };
    }
    async callLlmApi(prompt, schema) {
        if (!this.provider) {
            throw new Error('No LLM provider configured');
        }
        switch (this.provider) {
            case 'openai':
                return this.callOpenAI(prompt, schema);
            case 'gemini':
                return this.callGemini(prompt, schema);
            case 'deepseek':
                return this.callDeepSeek(prompt, schema);
            default:
                throw new Error(`Unsupported LLM provider: ${this.provider}`);
        }
    }
    async callOpenAI(prompt, schema) {
        var _a, _b, _c;
        let baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        if (baseUrl.startsWith('http://')) {
            this.logger.warn(`OPENAI_BASE_URL uses HTTP, converting to HTTPS: ${baseUrl}`);
            baseUrl = baseUrl.replace('http://', 'https://');
        }
        if (!baseUrl.startsWith('https://')) {
            throw new Error(`OPENAI_BASE_URL must start with https://, got: ${baseUrl}`);
        }
        const url = `${baseUrl}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个智能旅行助手，负责解析用户的语音指令。严格按照 JSON Schema 返回结果。',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.3,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'voice_parse_response',
                        strict: true,
                        schema: schema,
                    },
                },
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        const content = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
        if (!content) {
            throw new Error('OpenAI API returned empty content');
        }
        return content;
    }
    async callGemini(prompt, schema) {
        var _a, _b, _c, _d, _e;
        const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `系统提示：你是一个智能旅行助手，负责解析用户的语音指令。严格按照 JSON Schema 返回结果。\n\n${prompt}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        const content = (_e = (_d = (_c = (_b = (_a = data.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!content) {
            throw new Error('Gemini API returned empty content');
        }
        return content;
    }
    async callDeepSeek(prompt, schema) {
        var _a, _b, _c;
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: `你是一个智能旅行助手，负责解析用户的语音指令。严格按照以下 JSON Schema 返回结果，只返回 JSON，不要其他文本：\n${JSON.stringify(schema, null, 2)}`,
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.3,
                response_format: {
                    type: 'json_object',
                },
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        const content = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
        if (!content) {
            throw new Error('DeepSeek API returned empty content');
        }
        return content;
    }
    parseAndValidateResponse(rawResponse, transcript, schedule) {
        try {
            let parsed;
            try {
                parsed = JSON.parse(rawResponse);
            }
            catch (parseError) {
                const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                }
                else {
                    throw new Error('No valid JSON found in response');
                }
            }
            if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
                this.logger.warn('LLM response missing suggestions array');
                return [];
            }
            const suggestions = [];
            for (const rawSuggestion of parsed.suggestions) {
                try {
                    const suggestion = this.validateAndTransformSuggestion(rawSuggestion, transcript, schedule);
                    if (suggestion) {
                        suggestions.push(suggestion);
                    }
                }
                catch (error) {
                    this.logger.warn(`Invalid suggestion skipped: ${error.message}`, rawSuggestion);
                }
            }
            return suggestions;
        }
        catch (error) {
            this.logger.error(`Failed to parse LLM response: ${error.message}`, error.stack);
            return [];
        }
    }
    validateAndTransformSuggestion(raw, transcript, schedule) {
        if (!raw.id || !raw.title || !raw.confidence) {
            throw new Error('Missing required fields: id, title, or confidence');
        }
        if (!['LOW', 'MEDIUM', 'HIGH'].includes(raw.confidence)) {
            throw new Error(`Invalid confidence: ${raw.confidence}`);
        }
        const suggestion = {
            id: raw.id,
            title: raw.title,
            description: raw.description,
            confidence: raw.confidence,
        };
        if (raw.action) {
            if (!raw.action.type) {
                throw new Error('Action missing type');
            }
            const actionType = raw.action.type;
            switch (actionType) {
                case 'QUERY_NEXT_STOP':
                    suggestion.action = { type: 'QUERY_NEXT_STOP' };
                    break;
                case 'MOVE_POI_TO_MORNING':
                    if (!raw.action.poiId) {
                        suggestion.clarification = {
                            question: '要把哪个景点挪到上午？',
                            options: schedule.stops
                                .filter((s) => s.kind === 'POI')
                                .map((s) => ({
                                label: s.name || '未命名',
                                value: s.id,
                            })),
                        };
                        suggestion.action = {
                            type: 'MOVE_POI_TO_MORNING',
                            preferredRange: raw.action.preferredRange || 'AM',
                        };
                    }
                    else {
                        suggestion.action = {
                            type: 'MOVE_POI_TO_MORNING',
                            poiId: raw.action.poiId,
                            poiName: raw.action.poiName,
                            preferredRange: raw.action.preferredRange || 'AM',
                            rebuildTimeline: raw.action.rebuildTimeline || false,
                        };
                    }
                    break;
                case 'ADD_POI_TO_SCHEDULE':
                    if (!raw.action.poiId) {
                        throw new Error('ADD_POI_TO_SCHEDULE requires poiId');
                    }
                    suggestion.action = {
                        type: 'ADD_POI_TO_SCHEDULE',
                        poiId: raw.action.poiId,
                        preferredRange: raw.action.preferredRange,
                        insertAfterStopId: raw.action.insertAfterStopId,
                    };
                    break;
                default:
                    throw new Error(`Unsupported action type: ${actionType}`);
            }
        }
        if (raw.clarification) {
            if (!raw.clarification.question) {
                throw new Error('Clarification missing question');
            }
            suggestion.clarification = {
                question: raw.clarification.question,
                options: raw.clarification.options || [],
            };
        }
        if (suggestion.action) {
            const poiId = 'poiId' in suggestion.action ? suggestion.action.poiId : undefined;
            const stableId = (0, suggestion_id_util_1.generateVoiceSuggestionId)(suggestion.action.type, poiId, transcript);
            suggestion.id = stableId;
        }
        else if (suggestion.clarification) {
            suggestion.id = (0, suggestion_id_util_1.generateClarificationSuggestionId)('MOVE_POI_TO_MORNING');
        }
        return suggestion;
    }
    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
};
exports.LlmVoiceParserService = LlmVoiceParserService;
exports.LlmVoiceParserService = LlmVoiceParserService = LlmVoiceParserService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], LlmVoiceParserService);
//# sourceMappingURL=llm-voice-parser.service.js.map