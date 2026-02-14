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
var ReadinessAIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessAIService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
const redis_service_1 = require("../../../redis/redis.service");
const readiness_cache_service_1 = require("./readiness-cache.service");
const chunk_retrieval_service_1 = require("../../../rag/services/chunk-retrieval.service");
var AIEnhancementErrorType;
(function (AIEnhancementErrorType) {
    AIEnhancementErrorType["TIMEOUT"] = "TIMEOUT";
    AIEnhancementErrorType["RATE_LIMIT"] = "RATE_LIMIT";
    AIEnhancementErrorType["SCHEMA_VALIDATION"] = "SCHEMA_VALIDATION";
    AIEnhancementErrorType["NETWORK_ERROR"] = "NETWORK_ERROR";
    AIEnhancementErrorType["API_ERROR"] = "API_ERROR";
    AIEnhancementErrorType["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(AIEnhancementErrorType || (AIEnhancementErrorType = {}));
let ReadinessAIService = ReadinessAIService_1 = class ReadinessAIService {
    constructor(llmService, cacheService, redisService, chunkRetrievalService) {
        this.llmService = llmService;
        this.cacheService = cacheService;
        this.redisService = redisService;
        this.chunkRetrievalService = chunkRetrievalService;
        this.logger = new common_1.Logger(ReadinessAIService_1.name);
        this.maxRetries = 2;
        this.timeoutMs = 5000;
        if (!llmService) {
            this.logger.warn('LlmService not available, AI enhancement will be disabled');
        }
        if (!cacheService) {
            this.logger.warn('ReadinessCacheService not available, caching will be disabled');
        }
        if (!chunkRetrievalService) {
            this.logger.warn('ChunkRetrievalService not available, channel retrieval will be disabled');
        }
    }
    async enhancePersonalizedChecklist(baseResult, userProfile, tripContext, options = { enableAI: true }) {
        var _a;
        if (!options.enableAI || !this.llmService) {
            return this.toBaseResult(baseResult);
        }
        const cacheKey = (_a = this.cacheService) === null || _a === void 0 ? void 0 : _a.generateCacheKey('checklist', baseResult, userProfile);
        if (cacheKey && this.cacheService) {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }
        }
        try {
            const enhanced = await this.enhanceWithAI(baseResult, userProfile, tripContext);
            if (cacheKey && this.cacheService) {
                await this.cacheService.set(cacheKey, enhanced, { ttl: 24 * 60 * 60 });
            }
            return enhanced;
        }
        catch (error) {
            this.logger.warn('AI enhancement failed, falling back to base result', error);
            return this.toBaseResult(baseResult);
        }
    }
    async enhanceWithAI(baseResult, userProfile, tripContext) {
        const [deadlines, channels, rankings] = await Promise.allSettled([
            this.inferTaskDeadlines(baseResult, tripContext),
            this.retrieveChannels(baseResult, userProfile),
            this.rankByUserProfile(baseResult, userProfile),
        ]);
        return {
            ...baseResult,
            aiEnhancements: {
                deadlines: deadlines.status === 'fulfilled' ? deadlines.value : undefined,
                channels: channels.status === 'fulfilled' ? channels.value : undefined,
                rankings: rankings.status === 'fulfilled' ? rankings.value : undefined,
            },
            failedFeatures: [
                deadlines.status === 'rejected' ? 'deadlines' : null,
                channels.status === 'rejected' ? 'channels' : null,
                rankings.status === 'rejected' ? 'rankings' : null,
            ].filter(Boolean),
        };
    }
    async inferTaskDeadlines(result, tripContext) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildDeadlinePrompt(result, tripContext);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema('claude-3-5-sonnet', prompt, this.getDeadlineSchema()), this.timeoutMs, 'claude-3-5-sonnet');
            const parsed = this.extractJSON(response);
            return parsed.deadlines || [];
        }
        catch (error) {
            try {
                const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt, this.getDeadlineSchema()), this.timeoutMs * 0.7, 'deepseek');
                const parsed = this.extractJSON(response);
                return parsed.deadlines || [];
            }
            catch (fallbackError) {
                this.logger.error('All LLM providers failed for deadline inference', fallbackError);
                return [];
            }
        }
    }
    async retrieveChannels(result, userProfile) {
        if (!this.chunkRetrievalService) {
            return [];
        }
        const channels = [];
        for (const finding of result.findings) {
            const allItems = [
                ...finding.blockers,
                ...finding.must,
                ...finding.should,
                ...finding.optional,
            ];
            for (const item of allItems) {
                try {
                    const query = `${item.message} ${finding.destinationId} ${userProfile.nationality || ''} 办理渠道 申请方式`;
                    const ragResults = await this.chunkRetrievalService.retrieve({
                        query,
                        limit: 5,
                        chunkCategory: 'RULES',
                        useHybridSearch: true,
                        useReranking: false,
                    });
                    if (ragResults.length > 0) {
                        const channelInfo = ragResults
                            .filter(r => r.similarity >= 0.6)
                            .map(r => ({
                            name: this.extractChannelName(r.content) || '',
                            url: this.extractChannelUrl(r.content),
                            description: r.content.substring(0, 200),
                        }))
                            .filter((c) => c.name !== '');
                        if (channelInfo.length > 0) {
                            channels.push({
                                itemId: item.id,
                                channels: channelInfo,
                                evidence: ragResults.slice(0, 3).map(r => r.chunkId || ''),
                                confidence: ragResults[0].similarity || 0.7,
                            });
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`Failed to retrieve channels for item ${item.id}`, error);
                }
            }
        }
        return channels;
    }
    extractChannelName(text) {
        const patterns = [
            /(?:官网|官方网站|官方平台|在线申请|网上申请|在线办理)[：:]\s*([^\n]+)/i,
            /(?:申请网站|办理网站|预约网站)[：:]\s*([^\n]+)/i,
            /(?:网址|链接)[：:]\s*([^\n]+)/i,
            /(https?:\/\/[^\s]+)/i,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return undefined;
    }
    extractChannelUrl(text) {
        const urlPattern = /(https?:\/\/[^\s\)]+)/i;
        const match = text.match(urlPattern);
        return match ? match[1] : undefined;
    }
    async rankByUserProfile(result, userProfile) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildRankingPrompt(result, userProfile);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, this.getRankingSchema()), this.timeoutMs, 'anthropic');
            const parsed = this.extractJSON(response);
            return parsed.rankings || [];
        }
        catch (error) {
            this.logger.warn('Ranking enhancement failed', error);
            return [];
        }
    }
    buildDeadlinePrompt(result, tripContext) {
        var _a;
        const startDate = tripContext.trip.startDate;
        const daysUntilTrip = startDate
            ? Math.ceil((new Date(startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : null;
        const allItems = [];
        for (const finding of result.findings) {
            finding.blockers.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'blocker' });
            });
            finding.must.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'must' });
            });
            finding.should.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'should' });
            });
            finding.optional.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, category: finding.destinationId, level: 'optional' });
            });
        }
        return `你是一个旅行准备度专家。请为以下准备度检查项推断任务截止日期。

行程信息：
- 出发日期：${startDate || '未知'}${daysUntilTrip !== null ? ` (距离今天 ${daysUntilTrip} 天)` : ''}
- 目的地：${((_a = tripContext.itinerary.countries) === null || _a === void 0 ? void 0 : _a.join(', ')) || '未知'}
- 用户国籍：${tripContext.traveler.nationality || '未知'}

准备度检查项（共 ${allItems.length} 项）：
${JSON.stringify(allItems, null, 2)}

请为每个检查项推断截止日期（ISO 日期格式 YYYY-MM-DD），考虑：
1. 签证申请通常需要提前 1-3 个月
2. 机票预订建议提前 2-4 周
3. 酒店预订建议提前 1-2 周
4. 特殊活动/许可可能需要提前 1-6 个月
5. 保险购买建议提前 1-2 周
6. 疫苗接种可能需要提前 4-8 周

返回 JSON 格式：
{
  "deadlines": [
    {
      "itemId": "检查项ID（必须与输入中的 id 字段匹配）",
      "deadline": "2024-11-15",
      "evidence": ["证据来源1", "证据来源2"],
      "confidence": 0.8
    }
  ]
}

注意：
- 只返回需要提前办理的检查项（如签证、许可、预订等）
- 如果检查项不需要提前办理，可以省略
- deadline 必须是有效的 ISO 日期格式
- confidence 应该在 0.5-1.0 之间`;
    }
    buildRankingPrompt(result, userProfile) {
        var _a;
        const allItems = [];
        for (const finding of result.findings) {
            finding.blockers.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, level: 'blocker', category: finding.destinationId });
            });
            finding.must.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, level: 'must', category: finding.destinationId });
            });
            finding.should.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, level: 'should', category: finding.destinationId });
            });
            finding.optional.forEach((item) => {
                allItems.push({ id: item.id, message: item.message, level: 'optional', category: finding.destinationId });
            });
        }
        return `你是一个旅行准备度专家。请基于用户画像为准备度检查项进行个性化优先级排序。

用户画像：
- 预算水平：${userProfile.budgetLevel || 'medium'}（影响：预算相关检查项的优先级）
- 风险承受度：${userProfile.riskTolerance || 'medium'}（影响：安全相关检查项的优先级）
- 用户标签：${((_a = userProfile.tags) === null || _a === void 0 ? void 0 : _a.join(', ')) || '无'}（影响：特定场景检查项的优先级）
- 国籍：${userProfile.nationality || '未知'}（影响：签证/入境相关检查项的优先级）

准备度检查项（共 ${allItems.length} 项）：
${JSON.stringify(allItems, null, 2)}

排序规则：
1. blocker 级别检查项：优先级 80-100（必须处理）
2. must 级别检查项：优先级 60-90（重要，但可根据用户画像调整）
3. should 级别检查项：优先级 40-70（建议，根据用户画像调整）
4. optional 级别检查项：优先级 20-50（可选，根据用户画像调整）

个性化调整原则：
- 预算水平 low：优先处理省钱/免费项目，延迟昂贵项目
- 预算水平 high：优先处理便利性/舒适性项目
- 风险承受度 low：优先处理安全/保险相关项目
- 风险承受度 high：可以延迟安全相关项目
- 标签包含 "family_with_children"：优先处理儿童相关项目
- 标签包含 "senior"：优先处理医疗/保险相关项目

返回 JSON 格式：
{
  "rankings": [
    {
      "itemId": "检查项ID（必须与输入中的 id 字段匹配）",
      "personalizedRank": 85,
      "reasoning": "基于用户预算水平为 low，此免费项目优先级较高",
      "evidence": ["用户画像：预算水平 low", "检查项级别：must"],
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有检查项返回排序结果
- personalizedRank 应该在 1-100 之间
- reasoning 应该清晰说明排序依据
- confidence 应该在 0.5-1.0 之间`;
    }
    getDeadlineSchema() {
        return {
            type: 'object',
            properties: {
                deadlines: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            itemId: { type: 'string' },
                            deadline: { type: 'string' },
                            evidence: { type: 'array', items: { type: 'string' } },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['itemId', 'deadline', 'confidence'],
                    },
                },
            },
            required: ['deadlines'],
        };
    }
    getRankingSchema() {
        return {
            type: 'object',
            properties: {
                rankings: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            itemId: { type: 'string' },
                            personalizedRank: { type: 'number', minimum: 1, maximum: 100 },
                            reasoning: { type: 'string' },
                            evidence: { type: 'array', items: { type: 'string' } },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['itemId', 'personalizedRank', 'reasoning', 'confidence'],
                    },
                },
            },
            required: ['rankings'],
        };
    }
    async executeWithTimeout(fn, timeoutMs, model) {
        return Promise.race([
            fn(),
            this.createTimeoutPromise(timeoutMs, model),
        ]);
    }
    createTimeoutPromise(timeoutMs, model) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`AI enhancement timeout for model: ${model}, timeout: ${timeoutMs}ms`));
            }, timeoutMs);
        });
    }
    extractJSON(text) {
        try {
            return JSON.parse(text);
        }
        catch (error) {
            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            throw new Error('Failed to extract JSON from LLM response');
        }
    }
    async enhanceRiskWarnings(baseResult, userProfile, tripContext, options = { enableAI: true }) {
        if (!options.enableAI || !this.llmService) {
            return {};
        }
        const allRisks = baseResult.findings.flatMap((f) => f.risks.map((r, idx) => ({
            id: `${f.destinationId}-${f.packId}-risk-${idx}`,
            type: r.type,
            severity: r.severity,
            summary: r.summary,
            mitigations: r.mitigations || [],
        })));
        if (allRisks.length === 0) {
            return {};
        }
        try {
            const [severityAssessments, mitigations, emergencyContacts] = await Promise.allSettled([
                this.assessRiskSeverity(allRisks, tripContext),
                this.generateMitigations(allRisks, userProfile, tripContext),
                this.retrieveEmergencyContacts(allRisks, tripContext),
            ]);
            return {
                severityAssessments: severityAssessments.status === 'fulfilled' ? severityAssessments.value : undefined,
                mitigations: mitigations.status === 'fulfilled' ? mitigations.value : undefined,
                emergencyContacts: emergencyContacts.status === 'fulfilled' ? emergencyContacts.value : undefined,
            };
        }
        catch (error) {
            this.logger.warn('Risk AI enhancement failed', error);
            return {};
        }
    }
    async assessRiskSeverity(risks, tripContext) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildRiskSeverityPrompt(risks, tripContext);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, this.getRiskSeveritySchema()), this.timeoutMs, 'anthropic');
            const parsed = this.extractJSON(response);
            return parsed.assessments || [];
        }
        catch (error) {
            try {
                const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt, this.getRiskSeveritySchema()), this.timeoutMs * 0.7, 'deepseek');
                const parsed = this.extractJSON(response);
                return parsed.assessments || [];
            }
            catch (fallbackError) {
                this.logger.error('All LLM providers failed for risk severity assessment', fallbackError);
                return [];
            }
        }
    }
    async generateMitigations(risks, userProfile, tripContext) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildMitigationPrompt(risks, userProfile, tripContext);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, this.getMitigationSchema()), this.timeoutMs, 'anthropic');
            const parsed = this.extractJSON(response);
            return parsed.mitigations || [];
        }
        catch (error) {
            this.logger.warn('Mitigation generation failed', error);
            return [];
        }
    }
    async retrieveEmergencyContacts(risks, tripContext) {
        var _a;
        if (!this.chunkRetrievalService) {
            return [];
        }
        const contacts = [];
        const highRiskItems = risks.filter((r) => r.severity === 'high');
        for (const risk of highRiskItems) {
            try {
                const query = `${risk.type} ${((_a = tripContext.itinerary.countries) === null || _a === void 0 ? void 0 : _a.join(' ')) || ''} 紧急联系方式 救援电话 报警电话`;
                const ragResults = await this.chunkRetrievalService.retrieve({
                    query,
                    limit: 5,
                    chunkCategory: 'RULES',
                    useHybridSearch: true,
                    useReranking: false,
                });
                if (ragResults.length > 0 && ragResults[0].similarity >= 0.6) {
                    const extractedContacts = this.extractEmergencyContacts(ragResults[0].content);
                    if (extractedContacts.length > 0) {
                        contacts.push({
                            riskId: risk.id,
                            contacts: extractedContacts,
                            evidence: [ragResults[0].chunkId || ''],
                            confidence: ragResults[0].similarity || 0.7,
                        });
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Failed to retrieve emergency contacts for risk ${risk.id}`, error);
            }
        }
        return contacts;
    }
    extractEmergencyContacts(text) {
        const contacts = [];
        const phonePattern = /(?:电话|Phone|Tel)[：:]\s*([+\d\s\-()]+)/gi;
        const phoneMatches = text.matchAll(phonePattern);
        for (const match of phoneMatches) {
            contacts.push({
                type: 'phone',
                name: '紧急电话',
                phone: match[1].trim(),
            });
        }
        const emergencyPattern = /(?:报警|Emergency|Police)[：:]\s*(\d{3,4})/gi;
        const emergencyMatches = text.matchAll(emergencyPattern);
        for (const match of emergencyMatches) {
            contacts.push({
                type: 'emergency',
                name: '报警电话',
                phone: match[1].trim(),
            });
        }
        const urlPattern = /(https?:\/\/[^\s\)]+)/gi;
        const urlMatches = text.matchAll(urlPattern);
        for (const match of urlMatches) {
            contacts.push({
                type: 'website',
                name: '官方网站',
                url: match[1],
            });
        }
        return contacts;
    }
    buildRiskSeverityPrompt(risks, tripContext) {
        var _a, _b;
        return `你是一个旅行安全专家。请评估以下风险的严重程度，考虑行程的具体情况。

行程信息：
- 目的地：${((_a = tripContext.itinerary.countries) === null || _a === void 0 ? void 0 : _a.join(', ')) || '未知'}
- 开始日期：${tripContext.trip.startDate || '未知'}
- 活动类型：${((_b = tripContext.itinerary.activities) === null || _b === void 0 ? void 0 : _b.join(', ')) || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}

风险列表：
${JSON.stringify(risks, null, 2)}

请评估每个风险的严重程度（high/medium/low），考虑：
1. 风险发生的可能性
2. 风险发生后的影响程度
3. 行程的具体情况（目的地、活动、季节等）

返回 JSON 格式：
{
  "assessments": [
    {
      "riskId": "风险ID（必须与输入中的 id 字段匹配）",
      "originalSeverity": "原始严重程度",
      "assessedSeverity": "评估后的严重程度（high/medium/low）",
      "reasoning": "评估理由",
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有风险返回评估结果
- assessedSeverity 必须是 high、medium 或 low
- confidence 应该在 0.5-1.0 之间`;
    }
    buildMitigationPrompt(risks, userProfile, tripContext) {
        var _a, _b, _c;
        return `你是一个旅行安全专家。请为以下风险生成个性化的应对措施。

用户画像：
- 预算水平：${userProfile.budgetLevel || 'medium'}
- 风险承受度：${userProfile.riskTolerance || 'medium'}
- 用户标签：${((_a = userProfile.tags) === null || _a === void 0 ? void 0 : _a.join(', ')) || '无'}

行程信息：
- 目的地：${((_b = tripContext.itinerary.countries) === null || _b === void 0 ? void 0 : _b.join(', ')) || '未知'}
- 活动类型：${((_c = tripContext.itinerary.activities) === null || _c === void 0 ? void 0 : _c.join(', ')) || '未知'}

风险列表：
${JSON.stringify(risks, null, 2)}

请为每个风险生成 3-5 条个性化的应对措施，考虑：
1. 用户的风险承受度（低风险承受度用户需要更详细的措施）
2. 预算水平（提供不同成本的选择）
3. 用户标签（如 family_with_children 需要儿童相关措施）

返回 JSON 格式：
{
  "mitigations": [
    {
      "riskId": "风险ID（必须与输入中的 id 字段匹配）",
      "personalizedMitigations": [
        "应对措施1",
        "应对措施2",
        "应对措施3"
      ],
      "evidence": ["证据来源1", "证据来源2"],
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有风险返回应对措施
- personalizedMitigations 应该包含 3-5 条措施
- confidence 应该在 0.5-1.0 之间`;
    }
    getRiskSeveritySchema() {
        return {
            type: 'object',
            properties: {
                assessments: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            riskId: { type: 'string' },
                            originalSeverity: { type: 'string' },
                            assessedSeverity: { type: 'string', enum: ['high', 'medium', 'low'] },
                            reasoning: { type: 'string' },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['riskId', 'originalSeverity', 'assessedSeverity', 'reasoning', 'confidence'],
                    },
                },
            },
            required: ['assessments'],
        };
    }
    getMitigationSchema() {
        return {
            type: 'object',
            properties: {
                mitigations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            riskId: { type: 'string' },
                            personalizedMitigations: {
                                type: 'array',
                                items: { type: 'string' },
                                minItems: 3,
                                maxItems: 5,
                            },
                            evidence: { type: 'array', items: { type: 'string' } },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['riskId', 'personalizedMitigations', 'confidence'],
                    },
                },
            },
            required: ['mitigations'],
        };
    }
    async enhancePackingList(baseItems, userProfile, tripContext, durationDays, options = { enableAI: true }) {
        if (!options.enableAI || !this.llmService) {
            return {};
        }
        if (baseItems.length === 0) {
            return {};
        }
        try {
            const [quantities, reasons, recommendations] = await Promise.allSettled([
                this.inferItemQuantities(baseItems, durationDays, tripContext),
                this.generateItemReasons(baseItems, tripContext),
                this.recommendPackingItems(baseItems, userProfile, tripContext),
            ]);
            const enhancements = [];
            const itemMap = new Map();
            if (quantities.status === 'fulfilled' && quantities.value) {
                quantities.value.forEach((q) => {
                    itemMap.set(q.itemId, { ...itemMap.get(q.itemId), ...q });
                });
            }
            if (reasons.status === 'fulfilled' && reasons.value) {
                reasons.value.forEach((r) => {
                    itemMap.set(r.itemId, { ...itemMap.get(r.itemId), ...r });
                });
            }
            if (recommendations.status === 'fulfilled' && recommendations.value) {
                recommendations.value.forEach((rec) => {
                    if (!itemMap.has(rec.itemId)) {
                        itemMap.set(rec.itemId, rec);
                    }
                });
            }
            itemMap.forEach((enhancement) => {
                enhancements.push(enhancement);
            });
            return {
                itemEnhancements: enhancements,
            };
        }
        catch (error) {
            this.logger.warn('Packing list AI enhancement failed', error);
            return {};
        }
    }
    async inferItemQuantities(items, durationDays, tripContext) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildQuantityPrompt(items, durationDays, tripContext);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, this.getQuantitySchema()), this.timeoutMs, 'anthropic');
            const parsed = this.extractJSON(response);
            return parsed.quantities || [];
        }
        catch (error) {
            this.logger.warn('Quantity inference failed', error);
            return [];
        }
    }
    async generateItemReasons(items, tripContext) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildReasonPrompt(items, tripContext);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, this.getReasonSchema()), this.timeoutMs, 'anthropic');
            const parsed = this.extractJSON(response);
            return parsed.reasons || [];
        }
        catch (error) {
            this.logger.warn('Reason generation failed', error);
            return [];
        }
    }
    async recommendPackingItems(existingItems, userProfile, tripContext) {
        if (!this.llmService) {
            return [];
        }
        const prompt = this.buildRecommendationPrompt(existingItems, userProfile, tripContext);
        try {
            const response = await this.executeWithTimeout(() => this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, this.getRecommendationSchema()), this.timeoutMs, 'anthropic');
            const parsed = this.extractJSON(response);
            return parsed.recommendations || [];
        }
        catch (error) {
            this.logger.warn('Item recommendation failed', error);
            return [];
        }
    }
    buildQuantityPrompt(items, durationDays, tripContext) {
        var _a, _b;
        return `你是一个旅行打包专家。请为以下打包清单物品推断合适的数量。

行程信息：
- 行程天数：${durationDays} 天
- 目的地：${((_a = tripContext.itinerary.countries) === null || _a === void 0 ? void 0 : _a.join(', ')) || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}
- 活动类型：${((_b = tripContext.itinerary.activities) === null || _b === void 0 ? void 0 : _b.join(', ')) || '未知'}

打包清单物品：
${JSON.stringify(items, null, 2)}

请为每个物品推断合适的数量，考虑：
1. 行程天数（长行程需要更多物品）
2. 物品类型（消耗品 vs 可重复使用）
3. 目的地气候和活动类型
4. 清洗频率（如衣物）

返回 JSON 格式：
{
  "quantities": [
    {
      "itemId": "物品ID（必须与输入中的 id 字段匹配）",
      "recommendedQuantity": 3,
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有物品返回数量推断
- recommendedQuantity 应该是合理的整数
- confidence 应该在 0.5-1.0 之间`;
    }
    buildReasonPrompt(items, tripContext) {
        var _a, _b;
        return `你是一个旅行打包专家。请为以下打包清单物品生成推荐原因。

行程信息：
- 目的地：${((_a = tripContext.itinerary.countries) === null || _a === void 0 ? void 0 : _a.join(', ')) || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}
- 活动类型：${((_b = tripContext.itinerary.activities) === null || _b === void 0 ? void 0 : _b.join(', ')) || '未知'}

打包清单物品：
${JSON.stringify(items, null, 2)}

请为每个物品生成推荐原因，说明为什么需要这个物品，考虑：
1. 目的地气候特点
2. 活动类型需求
3. 安全考虑
4. 舒适性需求

返回 JSON 格式：
{
  "reasons": [
    {
      "itemId": "物品ID（必须与输入中的 id 字段匹配）",
      "reason": "推荐原因（1-2句话）",
      "confidence": 0.8
    }
  ]
}

注意：
- 必须为所有物品返回推荐原因
- reason 应该清晰、具体
- confidence 应该在 0.5-1.0 之间`;
    }
    buildRecommendationPrompt(existingItems, userProfile, tripContext) {
        var _a, _b, _c;
        return `你是一个旅行打包专家。请基于用户画像和行程信息，推荐额外的打包物品。

用户画像：
- 预算水平：${userProfile.budgetLevel || 'medium'}
- 风险承受度：${userProfile.riskTolerance || 'medium'}
- 用户标签：${((_a = userProfile.tags) === null || _a === void 0 ? void 0 : _a.join(', ')) || '无'}

行程信息：
- 目的地：${((_b = tripContext.itinerary.countries) === null || _b === void 0 ? void 0 : _b.join(', ')) || '未知'}
- 季节：${tripContext.itinerary.season || '未知'}
- 活动类型：${((_c = tripContext.itinerary.activities) === null || _c === void 0 ? void 0 : _c.join(', ')) || '未知'}

已有物品：
${JSON.stringify(existingItems, null, 2)}

请推荐 3-5 个额外的打包物品，考虑：
1. 用户画像（如 family_with_children 需要儿童相关物品）
2. 行程特点（如高海拔需要特殊装备）
3. 预算水平（提供不同成本的选择）
4. 已有物品的补充（不要重复推荐）

返回 JSON 格式：
{
  "recommendations": [
    {
      "itemId": "新物品ID（建议格式：recommended-1）",
      "name": "物品名称",
      "category": "物品类别",
      "recommendedQuantity": 1,
      "reason": "推荐原因",
      "confidence": 0.8
    }
  ]
}

注意：
- 推荐 3-5 个物品
- 不要重复已有物品
- confidence 应该在 0.5-1.0 之间`;
    }
    getQuantitySchema() {
        return {
            type: 'object',
            properties: {
                quantities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            itemId: { type: 'string' },
                            recommendedQuantity: { type: 'number', minimum: 1 },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['itemId', 'recommendedQuantity', 'confidence'],
                    },
                },
            },
            required: ['quantities'],
        };
    }
    getReasonSchema() {
        return {
            type: 'object',
            properties: {
                reasons: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            itemId: { type: 'string' },
                            reason: { type: 'string' },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['itemId', 'reason', 'confidence'],
                    },
                },
            },
            required: ['reasons'],
        };
    }
    getRecommendationSchema() {
        return {
            type: 'object',
            properties: {
                recommendations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            itemId: { type: 'string' },
                            name: { type: 'string' },
                            category: { type: 'string' },
                            recommendedQuantity: { type: 'number', minimum: 1 },
                            reason: { type: 'string' },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                        },
                        required: ['itemId', 'name', 'category', 'recommendedQuantity', 'reason', 'confidence'],
                    },
                    minItems: 3,
                    maxItems: 5,
                },
            },
            required: ['recommendations'],
        };
    }
    toBaseResult(baseResult) {
        return {
            ...baseResult,
            aiEnhancements: undefined,
            failedFeatures: [],
        };
    }
};
exports.ReadinessAIService = ReadinessAIService;
exports.ReadinessAIService = ReadinessAIService = ReadinessAIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        readiness_cache_service_1.ReadinessCacheService,
        redis_service_1.RedisService,
        chunk_retrieval_service_1.ChunkRetrievalService])
], ReadinessAIService);
//# sourceMappingURL=readiness-ai.service.js.map