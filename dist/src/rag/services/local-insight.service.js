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
var LocalInsightService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalInsightService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const rag_service_1 = require("./rag.service");
const llm_extraction_service_1 = require("./llm-extraction.service");
let LocalInsightService = LocalInsightService_1 = class LocalInsightService {
    constructor(prisma, ragService, llmExtraction) {
        this.prisma = prisma;
        this.ragService = ragService;
        this.llmExtraction = llmExtraction;
        this.logger = new common_1.Logger(LocalInsightService_1.name);
    }
    async getLocalInsight(countryCode, tags, region) {
        this.logger.debug(`获取当地洞察: countryCode=${countryCode}, tags=${tags.join(',')}, region=${region}`);
        try {
            const cached = await this.prisma.localInsight.findMany({
                where: {
                    countryCode,
                    tags: { hasSome: tags },
                    region: region || undefined,
                },
                orderBy: { lastUpdated: 'desc' },
                take: 10,
            });
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const recentCached = cached.filter((item) => item.lastUpdated > thirtyDaysAgo);
            if (recentCached.length > 0) {
                this.logger.debug(`使用缓存的当地洞察: ${recentCached.length} 条`);
                return recentCached.map(this.mapToLocalInsight);
            }
            const query = `${countryCode} ${region || ''} ${tags.join(' ')} local tips insights`;
            const snippets = await this.ragService.retrieve({
                query,
                collection: 'local_insights',
                countryCode,
                tags,
                limit: 15,
            });
            if (snippets.length === 0) {
                this.logger.warn(`未找到相关当地洞察: countryCode=${countryCode}, tags=${tags.join(',')}`);
                return [];
            }
            const prompt = `Extract local insights from the following text about ${countryCode}${region ? ` (${region})` : ''} related to: ${tags.join(', ')}.

Text:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please extract local insights and return as a JSON array. Each insight should have:
- content: A concise description of the local insight (2-3 sentences)
- evidenceSnippets: Key quotes from the text (2-3 short snippets)
- confidence: One of "HIGH", "MEDIUM", "LOW" based on how specific and reliable the information is

Return as JSON array.`;
            const schema = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        content: { type: 'string' },
                        evidenceSnippets: { type: 'array', items: { type: 'string' } },
                        confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
                    },
                    required: ['content', 'evidenceSnippets', 'confidence'],
                },
            };
            const insights = await this.llmExtraction.extractStructured(prompt, schema);
            const savedInsights = await Promise.all(insights.map(async (insight) => {
                var _a;
                const saved = await this.prisma.localInsight.create({
                    data: {
                        countryCode,
                        region: region || null,
                        tags,
                        content: insight.content,
                        evidenceSnippets: insight.evidenceSnippets,
                        confidence: insight.confidence,
                        source: ((_a = snippets[0]) === null || _a === void 0 ? void 0 : _a.source) || null,
                    },
                });
                return this.mapToLocalInsight(saved);
            }));
            this.logger.debug(`生成并保存当地洞察: ${savedInsights.length} 条`);
            return savedInsights;
        }
        catch (error) {
            this.logger.error(`获取当地洞察失败: ${error.message}`, error.stack);
            return [];
        }
    }
    async getInsightsByTag(countryCode, tag, region) {
        return this.getLocalInsight(countryCode, [tag], region);
    }
    async getInsightsForCountries(countryCodes, tags) {
        const result = new Map();
        for (const countryCode of countryCodes) {
            try {
                const insights = await this.getLocalInsight(countryCode, tags);
                result.set(countryCode, insights);
            }
            catch (error) {
                this.logger.error(`批量获取当地洞察失败: countryCode=${countryCode}, error=${error.message}`);
                result.set(countryCode, []);
            }
        }
        return result;
    }
    async refreshLocalInsight(countryCode, tags, region) {
        await this.prisma.localInsight.deleteMany({
            where: {
                countryCode,
                tags: { hasSome: tags },
                region: region || undefined,
            },
        });
        return this.getLocalInsight(countryCode, tags, region);
    }
    mapToLocalInsight(dbModel) {
        return {
            countryCode: dbModel.countryCode,
            region: dbModel.region || undefined,
            tags: dbModel.tags,
            content: dbModel.content,
            evidenceSnippets: dbModel.evidenceSnippets,
            confidence: dbModel.confidence,
            source: dbModel.source || undefined,
        };
    }
};
exports.LocalInsightService = LocalInsightService;
exports.LocalInsightService = LocalInsightService = LocalInsightService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rag_service_1.RagService,
        llm_extraction_service_1.LlmExtractionService])
], LocalInsightService);
//# sourceMappingURL=local-insight.service.js.map