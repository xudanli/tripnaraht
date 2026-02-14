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
var EnhancedChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedChatService = void 0;
const common_1 = require("@nestjs/common");
const rag_service_1 = require("./rag.service");
const route_knowledge_curator_service_1 = require("./route-knowledge-curator.service");
const local_insight_service_1 = require("./local-insight.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const integrated_rag_kpu_service_1 = require("../../kpu/services/integrated-rag-kpu.service");
let EnhancedChatService = EnhancedChatService_1 = class EnhancedChatService {
    constructor(ragService, routeKnowledgeCurator, localInsightService, prisma, integratedRAGKPU) {
        this.ragService = ragService;
        this.routeKnowledgeCurator = routeKnowledgeCurator;
        this.localInsightService = localInsightService;
        this.prisma = prisma;
        this.integratedRAGKPU = integratedRAGKPU;
        this.logger = new common_1.Logger(EnhancedChatService_1.name);
    }
    async answerRouteQuestion(question, context) {
        this.logger.debug(`回答路线问题: "${question}"`);
        try {
            const structuredAnswer = await this.answerFromStructuredData(question, context);
            if (structuredAnswer.confident) {
                this.logger.debug('使用结构化数据回答');
                return {
                    answer: structuredAnswer.answer,
                    source: 'STRUCTURED',
                    structuredData: structuredAnswer.data,
                };
            }
            const ragAnswer = await this.answerWithRAG(question, context, structuredAnswer.answer);
            return ragAnswer;
        }
        catch (error) {
            this.logger.error(`回答路线问题失败: ${error.message}`, error.stack);
            return {
                answer: '抱歉，我无法回答这个问题。请尝试更具体的问题。',
                source: 'STRUCTURED',
            };
        }
    }
    async answerFromStructuredData(question, context) {
        const lowerQuestion = question.toLowerCase();
        if (context.routeDirectionId && (lowerQuestion.includes('为什么') ||
            lowerQuestion.includes('why') ||
            lowerQuestion.includes('为什么选') ||
            lowerQuestion.includes('为什么推荐'))) {
            try {
                const routeDirection = await this.prisma.routeDirection.findUnique({
                    where: { id: parseInt(context.routeDirectionId) },
                });
                if (routeDirection) {
                    return {
                        confident: true,
                        answer: `这条路线（${routeDirection.nameCN || routeDirection.nameEN}）是根据您的偏好和当前条件推荐的。${routeDirection.description || ''}`,
                        data: {
                            routeDirectionId: routeDirection.id,
                            name: routeDirection.nameCN || routeDirection.nameEN,
                            description: routeDirection.description,
                        },
                    };
                }
            }
            catch (error) {
                this.logger.warn(`获取路线方向失败: ${error.message}`);
            }
        }
        if (lowerQuestion.includes('什么感觉') ||
            lowerQuestion.includes('怎么样') ||
            lowerQuestion.includes('体验') ||
            lowerQuestion.includes('建议') ||
            lowerQuestion.includes('tips') ||
            lowerQuestion.includes('需要注意')) {
            return {
                confident: false,
                answer: '',
            };
        }
        return {
            confident: false,
            answer: '',
        };
    }
    async answerWithRAG(question, context, structuredAnswer) {
        let ragSnippets = [];
        let validationResult = null;
        try {
            if (this.integratedRAGKPU) {
                this.logger.debug('使用KPU进行检索和验证');
                const { results: validatedResults } = await this.integratedRAGKPU.retrieveAndValidate({
                    query: question,
                    limit: 5,
                    enableSnippetValidation: true,
                    minValidationScore: 0.6,
                    validationOptions: {
                        enableFactCheck: true,
                        enableConsistencyCheck: true,
                        enableCitationCheck: true,
                    },
                    context: {
                        countryCode: context.countryCode,
                        routeDirectionId: context.routeDirectionId,
                    },
                });
                ragSnippets = validatedResults.map(r => ({
                    content: r.content,
                    source: r.sourceFile,
                    score: r.validation.overallScore,
                }));
                if (validatedResults.length > 0) {
                    const generationResult = await this.integratedRAGKPU.generateWithValidation({
                        query: question,
                        validatedResults,
                        retryOnFailure: true,
                        context: {
                            countryCode: context.countryCode,
                            routeDirectionId: context.routeDirectionId,
                        },
                    });
                    const answer = generationResult.answer;
                    validationResult = generationResult.validation;
                    let localInsights = [];
                    if (context.countryCode) {
                        try {
                            const insights = await this.localInsightService.getLocalInsight(context.countryCode, this.extractTagsFromQuestion(question));
                            localInsights = Array.isArray(insights) ? insights.map(insight => ({
                                content: insight.content || '',
                                tags: Array.isArray(insight.tags) ? insight.tags : [],
                            })) : [];
                        }
                        catch (error) {
                            this.logger.warn(`获取当地洞察失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'unknown error'}`);
                        }
                    }
                    return {
                        answer: structuredAnswer ? `${structuredAnswer}\n\n${answer}` : answer,
                        source: structuredAnswer ? 'HYBRID' : 'RAG',
                        structuredData: structuredAnswer ? { answer: structuredAnswer } : undefined,
                        ragSnippets,
                        localInsights,
                        validation: validationResult,
                    };
                }
            }
            else {
                this.logger.debug('KPU服务不可用，使用原有RAG服务');
                const retrieved = await this.ragService.retrieve({
                    query: question,
                    collection: 'travel_guides',
                    countryCode: context.countryCode,
                    limit: 5,
                });
                ragSnippets = Array.isArray(retrieved) ? retrieved : [];
            }
        }
        catch (error) {
            this.logger.warn(`RAG 检索失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'unknown error'}`);
            ragSnippets = [];
        }
        let localInsights = [];
        if (context.countryCode) {
            try {
                const insights = await this.localInsightService.getLocalInsight(context.countryCode, this.extractTagsFromQuestion(question));
                localInsights = Array.isArray(insights) ? insights.map(insight => ({
                    content: insight.content || '',
                    tags: Array.isArray(insight.tags) ? insight.tags : [],
                })) : [];
            }
            catch (error) {
                this.logger.warn(`获取当地洞察失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'unknown error'}`);
            }
        }
        let answer = structuredAnswer || '';
        if (ragSnippets.length > 0) {
            const ragContent = ragSnippets
                .map(s => (s.content || '').substring(0, 200))
                .join('\n\n');
            if (answer) {
                answer += '\n\n根据相关游记和攻略：\n' + ragContent.substring(0, 500);
            }
            else {
                answer = ragContent.substring(0, 500);
            }
        }
        if (localInsights.length > 0) {
            const insightsText = localInsights
                .map(i => `• ${(i.content || '').substring(0, 150)}`)
                .join('\n');
            answer += '\n\n当地建议：\n' + insightsText;
        }
        return {
            answer: answer || '抱歉，我无法找到相关信息。',
            source: structuredAnswer ? 'HYBRID' : 'RAG',
            structuredData: structuredAnswer ? { answer: structuredAnswer } : undefined,
            ragSnippets: ragSnippets.map(s => ({
                content: s.content || '',
                source: s.source,
                score: s.score || 0,
            })),
            localInsights,
        };
    }
    async explainWhyNotOtherRoute(selectedRouteId, alternativeRouteId, countryCode) {
        this.logger.debug(`解释为什么不是另一条路线: selected=${selectedRouteId}, alternative=${alternativeRouteId}`);
        try {
            const selected = await this.prisma.routeDirection.findUnique({
                where: { id: parseInt(selectedRouteId) },
            });
            const alternative = await this.prisma.routeDirection.findUnique({
                where: { id: parseInt(alternativeRouteId) },
            });
            if (!selected || !alternative) {
                return {
                    answer: '无法找到路线信息。',
                    source: 'STRUCTURED',
                };
            }
            let answer = `我们选择了"${selected.nameCN || selected.nameEN}"而不是"${alternative.nameCN || alternative.nameEN}"，因为：\n\n`;
            const selectedRag = await this.ragService.retrieve({
                query: `${selected.nameCN || selected.nameEN} ${countryCode} experience`,
                collection: 'travel_guides',
                countryCode,
                limit: 3,
            });
            const alternativeRag = await this.ragService.retrieve({
                query: `${alternative.nameCN || alternative.nameEN} ${countryCode} experience`,
                collection: 'travel_guides',
                countryCode,
                limit: 3,
            });
            if (selectedRag.length > 0) {
                answer += `"${selected.nameCN || selected.nameEN}"的特点：\n`;
                answer += selectedRag[0].content.substring(0, 300) + '\n\n';
            }
            if (alternativeRag.length > 0) {
                answer += `相比之下，"${alternative.nameCN || alternative.nameEN}"更适合：\n`;
                answer += alternativeRag[0].content.substring(0, 200);
            }
            return {
                answer,
                source: 'HYBRID',
                structuredData: {
                    selectedRoute: {
                        id: selected.id,
                        name: selected.nameCN || selected.nameEN,
                    },
                    alternativeRoute: {
                        id: alternative.id,
                        name: alternative.nameCN || alternative.nameEN,
                    },
                },
                ragSnippets: [
                    ...selectedRag.map(s => ({
                        content: s.content,
                        source: s.source,
                        score: s.score,
                    })),
                    ...alternativeRag.map(s => ({
                        content: s.content,
                        source: s.source,
                        score: s.score,
                    })),
                ],
            };
        }
        catch (error) {
            this.logger.error(`解释路线对比失败: ${error.message}`, error.stack);
            return {
                answer: '抱歉，我无法解释路线对比。',
                source: 'STRUCTURED',
            };
        }
    }
    async answerRouteDetailQuestion(question, context) {
        this.logger.debug(`回答路线细节问题: "${question}"`);
        const lowerQuestion = question.toLowerCase();
        if (lowerQuestion.includes('能走') ||
            lowerQuestion.includes('可以') ||
            lowerQuestion.includes('能不能') ||
            lowerQuestion.includes('是否') ||
            lowerQuestion.includes('closed') ||
            lowerQuestion.includes('open')) {
            return {
                answer: '关于路线是否可达的问题，请查看路线的详细信息和当前状态。',
                source: 'STRUCTURED',
            };
        }
        return this.answerWithRAG(question, context);
    }
    async getRouteNarrative(routeDirectionId, countryCode) {
        try {
            const narrative = await this.routeKnowledgeCurator.enrichRouteNarrative(routeDirectionId, countryCode);
            const insights = countryCode
                ? await this.localInsightService.getLocalInsight(countryCode, ['travel-guide'])
                : [];
            return {
                narrative,
                localInsights: insights,
            };
        }
        catch (error) {
            this.logger.error(`获取路线叙事失败: ${error.message}`, error.stack);
            return {};
        }
    }
    extractTagsFromQuestion(question) {
        const tags = [];
        const lowerQuestion = question.toLowerCase();
        if (lowerQuestion.includes('hiking') || lowerQuestion.includes('徒步')) {
            tags.push('hiking');
        }
        if (lowerQuestion.includes('driving') || lowerQuestion.includes('驾驶') || lowerQuestion.includes('开车')) {
            tags.push('driving');
        }
        if (lowerQuestion.includes('camping') || lowerQuestion.includes('露营')) {
            tags.push('camping');
        }
        if (lowerQuestion.includes('f-road') || lowerQuestion.includes('f路')) {
            tags.push('f-road');
        }
        if (lowerQuestion.includes('highlands') || lowerQuestion.includes('高地')) {
            tags.push('highlands');
        }
        tags.push('tips', 'local-insights');
        return tags;
    }
};
exports.EnhancedChatService = EnhancedChatService;
exports.EnhancedChatService = EnhancedChatService = EnhancedChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [rag_service_1.RagService,
        route_knowledge_curator_service_1.RouteKnowledgeCurator,
        local_insight_service_1.LocalInsightService,
        prisma_service_1.PrismaService,
        integrated_rag_kpu_service_1.IntegratedRAGKPUService])
], EnhancedChatService);
//# sourceMappingURL=enhanced-chat.service.js.map